//! Tauri command wrappers over the pure [`super::discover`] docs-discovery function.
//!
//! Thin by design: authenticate the frontend-supplied workspace `root` against the known
//! project list, then delegate. Errors map to a `String` so they cross IPC and are
//! surfaced by the UI rather than swallowed (the WP6/WP7 error-surfacing lesson).
//!
//! ## Root is validated, not trusted
//! `root` arrives from the renderer and is **not** taken on faith: the project list is
//! resolved server-side from the real `app_data_dir()` and checked via
//! [`crate::editor_fs::validate_root`], exactly as the six editor-fs commands do. A `root`
//! that is neither a known project nor a descendant of one is rejected. `AppHandle` is
//! injected by Tauri (never passed from JS).
//!
//! ⚠️ **Scope of the tests below:** they exercise the path-confinement half
//! ([`read_file_core`]) directly, since constructing an `AppHandle` needs a Tauri runtime.
//! The root-*authentication* half ([`validate_frontend_root`]) is therefore asserted by
//! this comment rather than pinned by a unit test — it is covered live at verify-self,
//! and it is now literally the same function the six editor-fs commands exercise in
//! production. Stated explicitly so the claim is not mistaken for a tested one.
//!
//! ## Why this reuses `editor_fs` rather than re-implementing
//! The discoverable doc set is a strict SUBSET of the project tree the editor can already
//! read, so `docs_read` introduces no new trust surface — it is a read of a file the
//! editor could open anyway. Reusing [`crate::editor_fs::read_file_core`] means the
//! path-confinement guard (including the WP7 symlink handling) has exactly one
//! implementation. Re-implementing it here would be a second security boundary to keep in
//! sync, which is how such guards drift.
//!
//! That principle now covers **both** halves: [`validate_frontend_root`] is imported from
//! [`crate::editor_fs::commands`] rather than copied. It was a verbatim duplicate until the
//! 2026-08-18 paydown sweep narrowed the original to `pub(crate)`.

use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};

use super::{discover, DocEntry};
use crate::config_store::is_remote_key;
use crate::editor_fs::commands::validate_root_in;
use crate::editor_fs::{read_file_core, stat_file_core, FileMarker};
use crate::remote_fs::RemoteExec;
use crate::remote_link::commands::SharedLinks;

// ── M17 WP7 — ROUTED BY TARGET ──────────────────────────────────────────────────────────────────
// The three commands below are thin: they resolve the app-data dir and hand [`serve`] the host
// links. [`serve`] decides local vs remote ONCE, by the root's kind (`arch/remote-workspaces.md`
// §F: "a single dispatch at the function that decides, never at its callers"), so the frontend
// (`DocsPanel`, `recycleSession`) calls the same command either way, and a test drives both arms
// with a real project list and an exec double (no `AppHandle`).
// - LOCAL: unchanged (the known-root check + `discover` / `read_file_core` / `stat_file_core`).
// - REMOTE: `crate::remote_fs` over the host's master (Up-only, never direct). The row is looked up
//   in the project list (`target_for`), so an unknown `ssh://` key is refused like an unknown root.
// All three are `async` and run [`serve`] on the blocking pool, BOTH arms: a remote read waits on
// ssh, and a sync command runs on the main thread (`tests/sync_commands_do_not_block.rs`).

/// What a doc command asks for.
pub(crate) enum DocsCall<'a> {
    List,
    Read(&'a str),
    Stat(&'a str),
}

/// What [`serve`] answers.
#[derive(Debug)]
pub(crate) enum DocsReply {
    List(Vec<DocEntry>),
    Text(String),
    Marker(FileMarker),
}

/// THE dispatch behind `docs_list` / `docs_read` / `docs_stat`.
pub(crate) fn serve(
    data_dir: &Path,
    exec: &dyn RemoteExec,
    root: &str,
    call: DocsCall<'_>,
) -> Result<DocsReply, String> {
    if is_remote_key(root) {
        let target = crate::remote_link::commands::target_for(data_dir, root)?;
        let reply = match call {
            DocsCall::List => crate::remote_fs::list_docs(exec, &target).map(DocsReply::List),
            DocsCall::Read(p) => crate::remote_fs::read_doc(exec, &target, p).map(DocsReply::Text),
            DocsCall::Stat(p) => {
                crate::remote_fs::stat_doc(exec, &target, p).map(DocsReply::Marker)
            }
        };
        return reply.map_err(|e| e.to_string());
    }
    let root = validate_root_in(data_dir, root)?;
    match call {
        DocsCall::List => Ok(DocsReply::List(discover(&root))),
        DocsCall::Read(p) => read_file_core(&root, Path::new(p))
            .map(DocsReply::Text)
            .map_err(|e| e.to_string()),
        DocsCall::Stat(p) => stat_file_core(&root, Path::new(p))
            .map(DocsReply::Marker)
            .map_err(|e| e.to_string()),
    }
}

/// The reply [`serve`] gave to a call that expects another shape (unreachable: `serve` answers each
/// call with its own variant). Spelled out rather than panicking (no `unwrap()` outside tests).
fn mismatched(reply: DocsReply) -> String {
    format!("internal error: unexpected docs reply {reply:?}")
}

/// List the conventional workflow docs present under the workspace `root`.
///
/// Returns [`DocEntry`] values in discovery order; the frontend applies the workflow
/// ordering. Absent docs are silently omitted and a project with no workflow docs at all
/// returns an empty list — neither is an error. Only an unknown/hostile `root` fails, or (remote)
/// a link that is down ([`crate::remote_fs::LINK_DOWN`]).
#[tauri::command]
pub async fn docs_list(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    root: String,
) -> Result<Vec<DocEntry>, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    match crate::blocking::on_blocking_worker("listing the docs", move || {
        serve(&dir, &*links, &root, DocsCall::List)
    })
    .await?
    {
        DocsReply::List(v) => Ok(v),
        other => Err(mismatched(other)),
    }
}

/// Read one doc's raw text under the workspace `root` (read-only).
///
/// `path` is the [`DocEntry::rel_path`] handed out by [`docs_list`]. Confined to `root`
/// by the same guard as the editor's own reads — a path escaping the workspace, a missing
/// file, or non-UTF-8 content each come back as a `String` error for the UI to surface. Remote:
/// the same refusals in the same words (`remote_fs::read_doc`), the escape checked twice.
#[tauri::command]
pub async fn docs_read(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    root: String,
    path: String,
) -> Result<String, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    match crate::blocking::on_blocking_worker("reading a doc", move || {
        serve(&dir, &*links, &root, DocsCall::Read(&path))
    })
    .await?
    {
        DocsReply::Text(t) => Ok(t),
        other => Err(mismatched(other)),
    }
}

/// M17 WP7 — stat one doc under the workspace `root`: Recycle's `.session.md` baseline and its
/// forced re-stat. Local: exactly `stat_file`'s answer (`stat_file_core`), which stays an EDITOR
/// command and is refused on remote. Remote: `remote_fs::stat_doc`.
#[tauri::command]
pub async fn docs_stat(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    root: String,
    path: String,
) -> Result<FileMarker, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    match crate::blocking::on_blocking_worker("checking a doc", move || {
        serve(&dir, &*links, &root, DocsCall::Stat(&path))
    })
    .await?
    {
        DocsReply::Marker(m) => Ok(m),
        other => Err(mismatched(other)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_store::{add_or_touch, add_remote, RemoteTarget};
    use crate::remote_fs::tests::{LocalShell, Recording};

    fn doc(root: &Path, rel: &str, body: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }

    /// M17 WP7 — the routed dispatch, both arms, against a REAL project list: a local row and a
    /// remote row whose "remote" path is a local temp dir, so `LocalShell` runs the real remote
    /// script on it. The remote arm reaches the exec exactly once per call; the local arm never
    /// does; an `ssh://` key that is not in the list never reaches an exec either.
    #[test]
    fn serve_routes_by_the_root_kind_with_one_exec_per_remote_call() {
        let data = TempDir::new().unwrap();
        let tree = TempDir::new().unwrap();
        let base = tree.path().canonicalize().unwrap();
        let local = base.join("local");
        let remote = base.join("remote");
        doc(&local, "workflow-system/product/vision.md", "# Local\n");
        doc(&remote, "workflow-system/product/vision.md", "# Remote\n");
        doc(&remote, "workflow-system/state/wip/demo.md", "# Demo\n");
        add_or_touch(data.path(), local.clone(), 1).unwrap();
        let key = add_remote(
            data.path(),
            RemoteTarget {
                host: "me@mini-host".into(),
                path: remote.to_str().unwrap().into(),
            },
            2,
        )
        .unwrap()
        .path
        .display()
        .to_string();
        let local_key = local.to_str().unwrap();
        let rels = |r: DocsReply| match r {
            DocsReply::List(v) => v.into_iter().map(|e| e.rel_path).collect::<Vec<_>>(),
            other => panic!("{other:?}"),
        };

        // REMOTE arm: the real script over the exec, the curated rules applied.
        assert_eq!(
            rels(serve(data.path(), &LocalShell, &key, DocsCall::List).unwrap()),
            vec![
                "workflow-system/product/vision.md",
                "workflow-system/state/wip/demo.md"
            ]
        );
        match serve(
            data.path(),
            &LocalShell,
            &key,
            DocsCall::Read("workflow-system/product/vision.md"),
        ) {
            Ok(DocsReply::Text(t)) => assert_eq!(t, "# Remote\n"),
            other => panic!("{other:?}"),
        }
        match serve(
            data.path(),
            &LocalShell,
            &key,
            DocsCall::Stat("workflow-system/state/wip/demo.md"),
        ) {
            Ok(DocsReply::Marker(m)) => assert_eq!(m.size, 7),
            other => panic!("{other:?}"),
        }
        let counting = Recording::answering("CLAUDESK-FS:begin\nCLAUDESK-FS:end\n");
        serve(data.path(), &counting, &key, DocsCall::List).unwrap();
        assert_eq!(counting.calls.borrow().len(), 1, "one exec per remote list");

        // LOCAL arm: the local disk, and never an exec.
        let never = Recording::answering("");
        assert_eq!(
            rels(serve(data.path(), &never, local_key, DocsCall::List).unwrap()),
            vec!["workflow-system/product/vision.md"]
        );
        match serve(
            data.path(),
            &never,
            local_key,
            DocsCall::Read("workflow-system/product/vision.md"),
        ) {
            Ok(DocsReply::Text(t)) => assert_eq!(t, "# Local\n"),
            other => panic!("{other:?}"),
        }
        assert!(
            never.calls.borrow().is_empty(),
            "the local arm reached an exec"
        );

        // Unknown roots of either kind are refused, and an unknown ssh key reaches no exec.
        let e = serve(
            data.path(),
            &never,
            "ssh://me@mini-host/nope",
            DocsCall::List,
        )
        .unwrap_err();
        assert!(e.contains("not in the project list"), "{e}");
        assert!(serve(data.path(), &never, "/not/a/project", DocsCall::List).is_err());
        assert!(never.calls.borrow().is_empty());
    }

    /// M17 WP7 (AC-8, operator decision P4.verify-human.2 A) — Recycle's baseline read moved from
    /// `stat_file` to the routed `docs_stat`. For a LOCAL project that must be the SAME answer
    /// `stat_file` gives (`stat_file_core`), from the disk, with no exec, so local Recycle is
    /// unchanged. Checked on a present `.session.md` (size and mtime) and on a missing one (an
    /// error both ways, which Recycle reads as "no baseline").
    #[test]
    fn local_docs_stat_is_stat_files_answer_with_no_exec() {
        let data = TempDir::new().unwrap();
        let tree = TempDir::new().unwrap();
        let local = tree.path().canonicalize().unwrap().join("local");
        let rel = "workflow-system/state/.session.md";
        doc(&local, rel, "---\nworkflow: feature\n---\nhanded off\n");
        add_or_touch(data.path(), local.clone(), 1).unwrap();
        let never = Recording::answering("");

        let expected = stat_file_core(&local, Path::new(rel)).unwrap();
        match serve(
            data.path(),
            &never,
            local.to_str().unwrap(),
            DocsCall::Stat(rel),
        ) {
            Ok(DocsReply::Marker(m)) => {
                assert_eq!((m.size, m.mtime_ms), (expected.size, expected.mtime_ms));
            }
            other => panic!("{other:?}"),
        }

        std::fs::remove_file(local.join(rel)).unwrap();
        assert!(stat_file_core(&local, Path::new(rel)).is_err());
        assert!(serve(
            data.path(),
            &never,
            local.to_str().unwrap(),
            DocsCall::Stat(rel)
        )
        .is_err());
        assert!(
            never.calls.borrow().is_empty(),
            "the local stat reached an exec"
        );
    }
    use crate::editor_fs::EditorFsError;
    use tempfile::TempDir;

    // The command layer needs a Tauri `AppHandle`, so these tests exercise the seam the
    // commands delegate to — the same confinement guard, called the same way. The
    // command wrappers themselves are thin (validate → delegate) and are covered live at
    // verify-self. What matters to pin here is that a docs-shaped read CANNOT escape the
    // root, because that is the security-relevant half.

    #[test]
    fn docs_read_seam_rejects_path_escaping_the_root() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(root.join("workflow-system/product")).unwrap();
        std::fs::write(root.join("workflow-system/product/vision.md"), "# v").unwrap();
        // A secret alongside, but OUTSIDE, the project root.
        std::fs::write(dir.path().join("secret.txt"), "TOP SECRET").unwrap();

        let escaped = read_file_core(&root, Path::new("../secret.txt"));

        assert!(
            matches!(escaped, Err(EditorFsError::OutsideWorkspace { .. })),
            "a `..` traversal out of the project root must be rejected, got {escaped:?}"
        );
    }

    #[test]
    fn docs_read_seam_reads_a_discovered_doc() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("workflow-system/product")).unwrap();
        std::fs::write(
            dir.path().join("workflow-system/product/vision.md"),
            "# Vision\n\nBody.\n",
        )
        .unwrap();

        // Exactly the round-trip the frontend performs: discover → read by rel_path.
        let entries = discover(dir.path());
        assert_eq!(entries.len(), 1);
        let text = read_file_core(dir.path(), Path::new(&entries[0].rel_path)).unwrap();

        assert_eq!(text, "# Vision\n\nBody.\n");
    }

    #[test]
    fn docs_read_seam_rejects_an_absolute_path_outside_the_root() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();

        let escaped = read_file_core(&root, Path::new("/etc/passwd"));

        assert!(
            matches!(escaped, Err(EditorFsError::OutsideWorkspace { .. })),
            "an absolute path outside the root must be rejected, got {escaped:?}"
        );
    }
}
