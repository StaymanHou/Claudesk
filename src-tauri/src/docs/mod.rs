//! Workflow-docs discovery — enumerate a project's conventional strategic docs.
//!
//! Backs Milestone 11's Docs viewer (WP2 = discovery + list; WP3 renders them). Given a
//! workspace's project root, [`discover`] returns the conventional workflow docs that are
//! actually present, so the right panel can offer them as a re-orientation surface
//! ("where is this project?") without the user hunting through the tree.
//!
//! ## Layout
//! - **Pure core** ([`discover`]) takes an injected `root: &Path` and touches nothing
//!   else, so it is unit-testable against a `TempDir` with no Tauri runtime.
//! - **Tauri command wrappers** ([`commands`]) are the only IPC surface; they
//!   authenticate the frontend-supplied root and map errors to a `String`, following the
//!   repo's `command → pure-fn → typed-error → String` convention (cf.
//!   [`crate::editor_fs`], whose `validate_root` + `read_file_core` this module reuses
//!   rather than re-implementing — the doc set is a strict subset of the project tree,
//!   so it introduces no new trust surface).
//!
//! ## Curated, not globbed
//! The doc set is an explicit ordered list, NOT a flat `**/*.md` glob. Two reasons, both
//! deliberate product calls recorded in the WBS:
//! 1. **An attention surface must not grow unboundedly.** A glob over a real repo returns
//!    hundreds of files (`node_modules`, vendored docs, every README); the panel's value
//!    is that it shows the ~10 docs that answer "where is this project?".
//! 2. **Closed cycles are not re-orientation material** — `workflow-system/product/archive/**`
//!    is deliberately NOT discoverable, and neither is `CHANGELOG.md`.
//!
//! Absent files are silent no-ops: a project with no `research.md` simply has no such
//! entry. Discovery reports what exists and never warns about what doesn't.
//!
//! ## One layout only — the `workflow-system/` roots
//! The companion workflow system unified its docs under `workflow-system/` on 2026-07-28
//! (`workflow-system/product/*` + `workflow-system/state/*`). The pre-migration layout
//! (`docs/product/*` + `workflow/*`) is deliberately **NOT** supported: an un-migrated
//! project simply shows no docs. Operator decision at Phase 1 verify-human (2026-08-01) —
//! carrying a second set of roots forever to serve a shrinking set of stale projects is
//! not worth the permanent complexity, and migration is the real fix. A project that
//! hasn't migrated is not a case to design around.
//!
//! ## `.session.md` is gitignored-but-present
//! The session pointer is deliberately untracked, yet it is exactly the file that says
//! "here is where the last session stopped". Discovery must NOT filter on git-tracked
//! status — it is a plain presence check.

pub mod commands;

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// One discovered doc, as handed to the frontend.
///
/// snake_case end-to-end — Tauri does NOT camelCase command return values, so the TS
/// mirror must read these fields verbatim (the WP7 IPC-DTO-field-case lesson).
// `Eq` is deliberately NOT derived: `mtime_ms` is an `f64`, for which `Eq` is not
// meaningful (NaN != NaN). `PartialEq` is what the tests actually use. Mirrors
// `editor_fs::FileMarker`, which carries the same field and likewise cannot be `Eq`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DocEntry {
    /// Path relative to the project root, forward-slashed (e.g.
    /// `workflow-system/product/vision.md`). This is what `docs_read` takes back.
    pub rel_path: String,
    /// The doc's stable identity for ordering + labelling, independent of which layout
    /// it was found under (e.g. `vision`, `wbs`, `wip`, `backlog`, `session`).
    pub kind: String,
    /// The file's own basename (e.g. `m11-wbs-parked.md`). The frontend labels
    /// multi-file kinds (`wbs`, `wip`) with this, since `kind` alone can't distinguish
    /// `wbs.md` from `m11-wbs-parked.md`.
    pub file_name: String,
    /// Modification time, milliseconds since the Unix epoch. `0.0` when unreadable.
    ///
    /// Exists for ONE consumer: the frontend's `pickInitialDoc` tiebreak when a project
    /// has several `wip/*.md` files. The panel's job is to answer "where is this project
    /// right now?", so the tie must go to the file being *actively worked in* — which is
    /// modification time, not creation time. Measured on a real WIP mid-session: birth
    /// 08:48, modified 09:28. Creation time would systematically favor the
    /// newest-*started* item over the currently-active one, and this workflow `git mv`s
    /// WIP files to `archive/` and creates new ones, so birthtime tracks phase starts
    /// rather than where the work is.
    ///
    /// `f64` ms mirrors [`crate::editor_fs::FileMarker::mtime_ms`] deliberately — same
    /// unit, same type, same serde shape, so the two DTOs cannot drift into disagreeing
    /// about how this project represents a timestamp over IPC.
    ///
    /// A stat failure yields `0.0` rather than an error: an unreadable mtime must not
    /// make a discoverable doc vanish from the list. It just sorts last among its kind.
    pub mtime_ms: f64,
}

/// Where the strategic product docs live.
pub(crate) const PRODUCT_DIR: &str = "workflow-system/product";

/// Where the transient workflow state lives.
pub(crate) const STATE_DIR: &str = "workflow-system/state";

/// Where the active WIP items live (`STATE_DIR` + `/wip`; spelled out for the remote listing).
pub(crate) const WIP_DIR: &str = "workflow-system/state/wip";

/// M17 WP7 — the three directories a doc can live in, in the order [`DocDirs`] holds them. The
/// remote listing (`remote_fs`) reads exactly these, non-recursively.
pub(crate) const DOC_DIRS: [&str; 3] = [PRODUCT_DIR, STATE_DIR, WIP_DIR];

/// Single-file product docs, in the order they are declared here. The frontend owns the
/// final display ordering (`docsOrder.ts`); this list is about WHAT is discoverable.
const PRODUCT_DOCS: [(&str, &str); 7] = [
    ("vision.md", "vision"),
    ("roadmap.md", "roadmap"),
    ("research.md", "research"),
    ("arch.md", "arch"),
    ("context.md", "context"),
    ("design-priors.md", "design-priors"),
    ("transitions.md", "transitions"),
];

/// Single-file state docs.
const STATE_DOCS: [(&str, &str); 3] = [
    ("backlog.md", "backlog"),
    ("backlog-quality-findings.md", "backlog-quality-findings"),
    // Gitignored but present — see the module header. Presence check only.
    (".session.md", "session"),
];

/// Discover the conventional workflow docs present under `root`.
///
/// Returns entries in discovery order; the frontend applies the workflow ordering.
/// Absent files are silently omitted.
///
/// `archive/**` and `CHANGELOG.md` are excluded — but note the MECHANISM, because it is
/// not an `archive`-specific rule: [`glob_dir`] is non-recursive and every other lookup
/// is an exact path join, so nothing below a subdirectory is ever reached and only names
/// on the curated lists are returned. Making `glob_dir` recursive would silently
/// re-admit `archive/**`; `excludes_archive_and_changelog` is the test standing between
/// that change and a regression.
///
/// Errors are NOT returned for a missing directory: a project with no
/// `workflow-system/` at all simply yields an empty list. Only the caller's root
/// authentication (in [`commands`]) can fail.
pub fn discover(root: &Path) -> Vec<DocEntry> {
    let mut out: Vec<DocEntry> = Vec::new();

    let product_dir = root.join(PRODUCT_DIR);
    for (file, kind) in PRODUCT_DOCS {
        push_if_present(&mut out, root, &product_dir.join(file), kind);
    }

    // `*wbs*.md` is a GLOB, not a fixed name: it catches the canonical `wbs.md`, any
    // `shape: temporary-wbs` scratch file, and parked decompositions like
    // `m11-wbs-parked.md`. All are genuine "where is this project?" material.
    for path in glob_dir(&product_dir, is_wbs_name) {
        push_if_present(&mut out, root, &path, "wbs");
    }

    let state_dir = root.join(STATE_DIR);
    for (file, kind) in STATE_DOCS {
        push_if_present(&mut out, root, &state_dir.join(file), kind);
    }

    // Active WIP items — the live Work Tree, the most volatile doc of the set.
    for path in glob_dir(&state_dir.join("wip"), is_wip_name) {
        push_if_present(&mut out, root, &path, "wip");
    }

    out
}

/// The `*wbs*.md` glob of [`PRODUCT_DIR`]. One definition for the local walk and the remote filter.
pub(crate) fn is_wbs_name(name: &str) -> bool {
    name.contains("wbs") && name.ends_with(".md")
}

/// The `wip/*.md` glob. One definition for the local walk and the remote filter.
pub(crate) fn is_wip_name(name: &str) -> bool {
    name.ends_with(".md")
}

/// M17 WP7 — one FILE found in a doc directory by a listing that is not the local filesystem (the
/// remote `remote_cmd::doc_list_command`). Only files are listed at all: a regular file, or a
/// symlink whose target is one.
#[derive(Debug, Clone, PartialEq)]
pub struct ListedFile {
    pub name: String,
    /// `lstat` says regular file. A glob matches only these, as [`glob_dir`]'s `file_type()` does;
    /// a fixed name matches a symlink-to-file too, as `push_if_present`'s `is_file()` does.
    pub regular: bool,
    pub size: u64,
    /// Milliseconds since the epoch (of the target, for a symlink), as [`DocEntry::mtime_ms`].
    pub mtime_ms: f64,
}

/// The listing of the three [`DOC_DIRS`] for one project.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DocDirs {
    pub product: Vec<ListedFile>,
    pub state: Vec<ListedFile>,
    pub wip: Vec<ListedFile>,
}

/// M17 WP7 — [`discover`]'s rules applied to a LISTING instead of the local disk: the same curated
/// lists ([`PRODUCT_DOCS`], [`STATE_DOCS`]), the same globs ([`is_wbs_name`], [`is_wip_name`]), the
/// same order and the same dedupe. A remote workspace's Docs panel is fed by this.
/// ⚠️ It must agree with [`discover`] on every tree: `filter_listing_agrees_with_discover` builds the
/// listing of a real tree and compares the two, so a rule changed in one place only fails there.
pub fn filter_listing(dirs: &DocDirs) -> Vec<DocEntry> {
    let mut out: Vec<DocEntry> = Vec::new();
    for (file, kind) in PRODUCT_DOCS {
        if let Some(f) = dirs.product.iter().find(|f| f.name == file) {
            push_listed(&mut out, PRODUCT_DIR, f, kind);
        }
    }
    for f in globbed(&dirs.product, is_wbs_name) {
        push_listed(&mut out, PRODUCT_DIR, f, "wbs");
    }
    for (file, kind) in STATE_DOCS {
        if let Some(f) = dirs.state.iter().find(|f| f.name == file) {
            push_listed(&mut out, STATE_DIR, f, kind);
        }
    }
    for f in globbed(&dirs.wip, is_wip_name) {
        push_listed(&mut out, WIP_DIR, f, "wip");
    }
    out
}

/// The regular files of a listed directory matching `pred`, sorted by name ([`glob_dir`]'s order).
fn globbed(files: &[ListedFile], pred: fn(&str) -> bool) -> Vec<&ListedFile> {
    let mut v: Vec<&ListedFile> = files
        .iter()
        .filter(|f| f.regular && pred(&f.name))
        .collect();
    v.sort_by(|a, b| a.name.cmp(&b.name));
    v
}

/// [`push_if_present`] for a listed file: the same entry shape and the same dedupe.
fn push_listed(out: &mut Vec<DocEntry>, dir: &str, f: &ListedFile, kind: &str) {
    let rel_path = format!("{dir}/{}", f.name);
    if out.iter().any(|e| e.rel_path == rel_path) {
        return;
    }
    out.push(DocEntry {
        rel_path,
        kind: kind.to_string(),
        file_name: f.name.clone(),
        mtime_ms: f.mtime_ms,
    });
}

/// List files directly inside `dir` whose file name satisfies `pred`, sorted by name for
/// deterministic output (`read_dir` order is filesystem-dependent). Non-recursive: a
/// nested `archive/` is never descended into. A missing/unreadable dir yields nothing.
fn glob_dir(dir: &Path, pred: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut matched: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(&pred)
                .unwrap_or(false)
        })
        .collect();
    matched.sort();
    matched
}

/// Append an entry for `path` if it is an existing file. Silently skips anything absent,
/// a directory, or outside `root` (the latter can't happen from our own joins, but the
/// `strip_prefix` is what produces the relative path, so a failure means "not ours").
fn push_if_present(out: &mut Vec<DocEntry>, root: &Path, path: &Path, kind: &str) {
    if !path.is_file() {
        return;
    }
    let Ok(rel) = path.strip_prefix(root) else {
        return;
    };
    // Forward-slash the relative path so the frontend sees one shape. (macOS-only today,
    // where the separator is already `/`; explicit so a future port can't quietly change
    // the IPC contract.)
    let rel_path = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // Dedupe on the resolved relative path so one physical file is never listed twice.
    //
    // DEFENSIVE, and currently UNREACHABLE: no fixed doc name contains `wbs`, so the fixed lists
    // cannot collide with the `*wbs*.md` glob (pinned by
    // `the_fixed_doc_lists_are_disjoint_from_the_wbs_glob`), and the state files live in a
    // different directory from the `wip/` glob. Kept because one added `*wbs*` name makes it
    // live; `dedupes_a_file_matched_twice` pins what it does then.
    if out.iter().any(|e| e.rel_path == rel_path) {
        return;
    }
    // Reuses the stat `is_file()` above already warmed. A clock-before-epoch mtime (which
    // shouldn't happen on a real filesystem) and any stat failure both fall to 0.0 — the
    // same defensive shape `editor_fs::file_marker` uses for the identical field.
    let mtime_ms = path
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);

    out.push(DocEntry {
        rel_path,
        kind: kind.to_string(),
        file_name,
        mtime_ms,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Create `root/rel` (and its parents) with trivial content.
    fn touch(root: &Path, rel: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "# doc\n").unwrap();
    }

    fn rel_paths(entries: &[DocEntry]) -> Vec<String> {
        entries.iter().map(|e| e.rel_path.clone()).collect()
    }

    #[test]
    fn discovers_present_docs_and_omits_absent_ones() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/vision.md");
        touch(dir.path(), "workflow-system/product/roadmap.md");
        // research.md deliberately absent — must be a silent no-op, not an entry.
        touch(dir.path(), "workflow-system/state/backlog.md");

        let found = rel_paths(&discover(dir.path()));

        assert!(found.contains(&"workflow-system/product/vision.md".to_string()));
        assert!(found.contains(&"workflow-system/product/roadmap.md".to_string()));
        assert!(found.contains(&"workflow-system/state/backlog.md".to_string()));
        assert!(
            !found.iter().any(|p| p.contains("research.md")),
            "absent research.md must be silently omitted, got {found:?}"
        );
    }

    #[test]
    fn wbs_glob_catches_canonical_scratch_and_parked() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/wbs.md");
        touch(dir.path(), "workflow-system/product/m11-wbs-parked.md");
        touch(dir.path(), "workflow-system/product/temporary-wbs.md");

        let found = rel_paths(&discover(dir.path()));

        assert!(found.contains(&"workflow-system/product/wbs.md".to_string()));
        assert!(found.contains(&"workflow-system/product/m11-wbs-parked.md".to_string()));
        assert!(found.contains(&"workflow-system/product/temporary-wbs.md".to_string()));
        // All three carry the `wbs` kind so the frontend can group them.
        let wbs_kinds = discover(dir.path())
            .into_iter()
            .filter(|e| e.kind == "wbs")
            .count();
        assert_eq!(wbs_kinds, 3);
    }

    /// The listing a remote `doc_list_command` would produce for `root`, built from the local disk
    /// with the script's own rules (files only; `regular` = lstat regular file; non-recursive).
    fn listing_of(root: &Path) -> DocDirs {
        let list = |rel: &str| -> Vec<ListedFile> {
            let Ok(rd) = std::fs::read_dir(root.join(rel)) else {
                return Vec::new();
            };
            let mut v: Vec<ListedFile> = rd
                .flatten()
                .filter_map(|e| {
                    let lt = e.file_type().ok()?;
                    let md = std::fs::metadata(e.path()).ok()?;
                    if !md.is_file() {
                        return None;
                    }
                    Some(ListedFile {
                        name: e.file_name().to_string_lossy().into_owned(),
                        regular: lt.is_file(),
                        size: md.len(),
                        mtime_ms: md
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as f64)
                            .unwrap_or(0.0),
                    })
                })
                .collect();
            v.sort_by(|a, b| a.name.cmp(&b.name));
            v
        };
        DocDirs {
            product: list(DOC_DIRS[0]),
            state: list(DOC_DIRS[1]),
            wip: list(DOC_DIRS[2]),
        }
    }

    /// M17 WP7 — the remote filter and the local walk must agree on every tree. A rich tree: every
    /// curated single, the wbs glob (canonical, scratch, a directory named like one), archive/**,
    /// CHANGELOG, a symlinked single (counts) and a symlinked wbs (does not: globs take regular
    /// files only), wip files, a non-md wip file, the legacy layout.
    #[test]
    fn filter_listing_agrees_with_discover() {
        let dir = TempDir::new().unwrap();
        let r = dir.path();
        for f in [
            "vision.md",
            "roadmap.md",
            "research.md",
            "arch.md",
            "context.md",
            "design-priors.md",
            "transitions.md",
            "wbs.md",
            "m11-wbs-parked.md",
            "wbs-notes.txt",
        ] {
            touch(r, &format!("workflow-system/product/{f}"));
        }
        std::fs::create_dir_all(r.join("workflow-system/product/dir-wbs.md")).unwrap();
        touch(r, "workflow-system/product/archive/m10/wbs.md");
        touch(r, "outside/real-wbs.md");
        std::os::unix::fs::symlink(
            r.join("outside/real-wbs.md"),
            r.join("workflow-system/product/linked-wbs.md"),
        )
        .unwrap();
        for f in ["backlog.md", "backlog-quality-findings.md"] {
            touch(r, &format!("workflow-system/state/{f}"));
        }
        touch(r, "outside/session.md");
        std::os::unix::fs::symlink(
            r.join("outside/session.md"),
            r.join("workflow-system/state/.session.md"),
        )
        .unwrap();
        for f in ["b.md", "a.md", "notes.txt"] {
            touch(r, &format!("workflow-system/state/wip/{f}"));
        }
        touch(r, "CHANGELOG.md");
        touch(r, "docs/product/vision.md");

        let local = discover(r);
        assert!(
            local.len() >= 12,
            "the tree must exercise the rules: {local:?}"
        );
        assert_eq!(filter_listing(&listing_of(r)), local);
    }

    #[test]
    fn excludes_archive_and_changelog() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/vision.md");
        // Closed cycles are not re-orientation material — must never be discovered,
        // including the archived `wbs.md` the glob would otherwise be tempted by.
        touch(dir.path(), "workflow-system/product/archive/m10/wbs.md");
        touch(
            dir.path(),
            "workflow-system/product/archive/m10/research.md",
        );
        touch(dir.path(), "CHANGELOG.md");

        let found = rel_paths(&discover(dir.path()));

        assert!(
            !found.iter().any(|p| p.contains("archive")),
            "archive/** must not be discoverable, got {found:?}"
        );
        assert!(
            !found.iter().any(|p| p.contains("CHANGELOG")),
            "CHANGELOG.md must not be discoverable, got {found:?}"
        );
        assert_eq!(found, vec!["workflow-system/product/vision.md".to_string()]);
    }

    #[test]
    fn discovers_session_pointer_despite_being_gitignored() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/state/.session.md");

        let found = rel_paths(&discover(dir.path()));

        assert_eq!(
            found,
            vec!["workflow-system/state/.session.md".to_string()],
            "`.session.md` is gitignored-but-present; discovery is a presence check \
             and must not filter on git-tracked status"
        );
    }

    #[test]
    fn discovers_wip_files() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/state/wip/feature-a.md");
        touch(dir.path(), "workflow-system/state/wip/feature-b.md");
        // A non-markdown stray in wip/ is not a doc.
        touch(dir.path(), "workflow-system/state/wip/notes.txt");

        let entries = discover(dir.path());
        let wip: Vec<_> = entries.iter().filter(|e| e.kind == "wip").collect();

        assert_eq!(wip.len(), 2, "expected both wip .md files, got {wip:?}");
        assert!(!rel_paths(&entries).iter().any(|p| p.ends_with(".txt")));
    }

    #[test]
    fn ignores_the_legacy_pre_migration_layout() {
        // Operator decision 2026-08-01: the pre-2026-07-28 layout is NOT supported. An
        // un-migrated project shows no docs rather than a partial list. Asserted (not
        // merely un-tested) so a future "helpful" re-add is a deliberate act that has to
        // change a test, and so this file records the decision at the point it binds.
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "docs/product/vision.md");
        touch(dir.path(), "docs/product/wbs.md");
        touch(dir.path(), "workflow/backlog.md");
        touch(dir.path(), "workflow/wip/legacy-feature.md");

        assert!(
            discover(dir.path()).is_empty(),
            "the legacy docs/ + workflow/ layout must not be discovered"
        );
    }

    #[test]
    fn a_directory_matching_the_wbs_glob_is_not_an_entry() {
        // REACHABLE in production, unlike the other defensive arms: a directory named
        // `old-wbs.md/` satisfies the glob's name predicate.
        //
        // ⚠️ What this test does and does NOT pin — measured, not assumed. Two guards
        // reject the directory: `glob_dir`'s `is_file()` filter, then `push_if_present`'s
        // own. This test pins the SECOND (neutering it makes this test fail); it does NOT
        // pin the first (deleting that filter leaves the whole suite green, because the
        // second guard still produces the same output). That is honest defense-in-depth,
        // not a hole: the observable outcome is what's protected, and it is protected by
        // the guard that actually decides it. The first filter is a redundant early-out.
        // Stated here because "I added a test for it" would otherwise imply more coverage
        // than exists.
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("workflow-system/product/old-wbs.md")).unwrap();
        touch(dir.path(), "workflow-system/product/wbs.md");

        let found = rel_paths(&discover(dir.path()));

        assert_eq!(
            found,
            vec!["workflow-system/product/wbs.md".to_string()],
            "a DIRECTORY matching the *wbs*.md glob must not be listed as a doc"
        );
    }

    #[test]
    fn the_fixed_doc_lists_are_disjoint_from_the_wbs_glob() {
        // ⚠️ **Pins the PREMISE the dedup branch's "currently UNREACHABLE" claim rests on.**
        // This one pins *why* the branch is unreachable; `dedupes_a_file_matched_twice` pins
        // *what it does* if it ever becomes reachable. Neither substitutes for the other.
        for (file, _kind) in PRODUCT_DOCS.iter().chain(STATE_DOCS.iter()) {
            let name = Path::new(file)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            assert!(
                !(name.contains("wbs") && name.ends_with(".md")),
                "fixed doc `{file}` collides with the `*wbs*.md` glob — the dedup branch in \
                 `push_if_present` is now REACHABLE from `discover`, so its \
                 \"currently UNREACHABLE\" comment is stale and must be corrected"
            );
        }
    }

    #[test]
    fn dedupes_a_file_matched_twice() {
        // Drives `push_if_present` DIRECTLY, because `discover` cannot currently produce
        // a collision. Without this the dedup branch is uncovered, and deleting it leaves the
        // suite green.
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/wbs.md");
        let path = dir.path().join("workflow-system/product/wbs.md");

        let mut out: Vec<DocEntry> = Vec::new();
        push_if_present(&mut out, dir.path(), &path, "wbs");
        // Same physical file offered a second time (as the fixed-list pass and the glob
        // pass would both do if their sets ever overlapped).
        push_if_present(&mut out, dir.path(), &path, "wbs");

        assert_eq!(
            out.len(),
            1,
            "one physical file must yield one entry, got {out:?}"
        );
    }

    #[test]
    fn a_migrated_project_carrying_legacy_leftovers_yields_only_the_new_layout() {
        // A project mid-migration (or one that never cleaned up) has both trees on disk.
        // Only the `workflow-system/` copy is discoverable; the stale one is invisible.
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/vision.md");
        touch(dir.path(), "docs/product/vision.md");

        let found = rel_paths(&discover(dir.path()));

        assert_eq!(
            found,
            vec!["workflow-system/product/vision.md".to_string()],
            "only the workflow-system/ layout is discoverable — got {found:?}"
        );
    }

    #[test]
    fn empty_project_yields_empty_list_not_an_error() {
        let dir = TempDir::new().unwrap();
        assert!(discover(dir.path()).is_empty());
    }

    #[test]
    fn a_directory_named_like_a_doc_is_not_an_entry() {
        let dir = TempDir::new().unwrap();
        // `vision.md` as a DIRECTORY — `is_file()` must reject it.
        std::fs::create_dir_all(dir.path().join("workflow-system/product/vision.md")).unwrap();
        assert!(discover(dir.path()).is_empty());
    }

    #[test]
    fn discover_populates_mtime_from_the_real_file() {
        // The serde test pins the wire SHAPE; this pins that `discover` actually fills the
        // field. Without it, `mtime_ms` could ship hardcoded 0.0 for every entry — the
        // contract would look correct and the multi-WIP tiebreak it exists to serve would
        // silently degrade to "everything ties".
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let wip = root.join("workflow-system/state/wip");
        std::fs::create_dir_all(&wip).unwrap();
        std::fs::write(wip.join("feature-a.md"), "# a").unwrap();

        let entries = discover(root);
        let entry = entries.iter().find(|e| e.kind == "wip").unwrap();

        // A real mtime, not the 0.0 fallback and not a fabricated constant. Compared
        // against the file's own metadata rather than a wall-clock window, so the test
        // cannot flake on a slow machine or a clock skew.
        let expected = std::fs::metadata(wip.join("feature-a.md"))
            .and_then(|m| m.modified())
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
        assert_eq!(entry.mtime_ms, expected);
        assert!(entry.mtime_ms > 0.0, "mtime must not be the 0.0 fallback");
    }

    #[test]
    fn discover_orders_wip_files_by_mtime_descending_when_sorted_by_the_frontend() {
        // The frontend does the sorting, but the DATA has to make it possible: two WIP
        // files written at different times must carry DIFFERENT mtimes. If the filesystem
        // or our stat collapsed them to the same value, the tiebreak would be undecidable
        // and `pickInitialDoc` would silently fall back to alphabetical.
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let wip = root.join("workflow-system/state/wip");
        std::fs::create_dir_all(&wip).unwrap();

        std::fs::write(wip.join("z-older.md"), "# older").unwrap();
        // Sleep past the filesystem's mtime granularity. HFS+/APFS resolve to <1s, but a
        // 10ms write gap can land in the same tick on some volumes.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(wip.join("a-newer.md"), "# newer").unwrap();

        let entries = discover(root);
        let older = entries
            .iter()
            .find(|e| e.file_name == "z-older.md")
            .unwrap();
        let newer = entries
            .iter()
            .find(|e| e.file_name == "a-newer.md")
            .unwrap();

        // Note the names: the NEWER file sorts FIRST alphabetically, so a test that
        // accidentally measured alphabetical order would pass. This asserts the mtimes
        // are genuinely ordered, which is the only thing that distinguishes them.
        assert!(
            newer.mtime_ms > older.mtime_ms,
            "newer {} should have a greater mtime than older {}",
            newer.mtime_ms,
            older.mtime_ms
        );
    }

    #[test]
    fn doc_entry_serde_shape_is_snake_case() {
        // Pin the exact wire keys so Phase 2's TS type mirrors them verbatim. Tauri does
        // NOT camelCase command return values, so a `rename_all` or a field rename here
        // would silently break the frontend with no compile error on either side — the
        // failure mode recorded as SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE.
        // This is the ONLY assertion of the IPC contract; `discover`'s tests check values,
        // not the serialized shape. Mirrors `status_broadcaster::dto_serde_shape_is_snake_case`.
        let entry = DocEntry {
            rel_path: "workflow-system/product/vision.md".to_string(),
            kind: "vision".to_string(),
            file_name: "vision.md".to_string(),
            mtime_ms: 1_754_130_493_000.0,
        };
        let value = serde_json::to_value(&entry).unwrap();
        let obj = value.as_object().unwrap();

        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"file_name".to_string(),
                &"kind".to_string(),
                &"mtime_ms".to_string(),
                &"rel_path".to_string(),
            ]
        );
        assert_eq!(
            obj["rel_path"],
            serde_json::json!("workflow-system/product/vision.md")
        );
        // `mtime_ms` must cross as a JSON NUMBER, not a string: the TS mirror types it
        // `number` and sorts on it. A serde attribute that stringified it would compile on
        // both sides and silently make the multi-WIP tiebreak compare lexically.
        assert!(
            obj["mtime_ms"].is_number(),
            "mtime_ms must serialize as a number, got {:?}",
            obj["mtime_ms"]
        );
        assert_eq!(obj["kind"], serde_json::json!("vision"));
        assert_eq!(obj["file_name"], serde_json::json!("vision.md"));
    }

    #[test]
    fn discover_emits_forward_slashed_relative_paths() {
        // `rel_path` is what `docs_read` takes back, so its SHAPE is a contract, not a
        // formatting detail: the frontend keys selection state on it and passes it
        // verbatim to the read command. Pinned separately from the serde-key test above,
        // which asserts the field NAMES rather than the value format.
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/state/wip/some-feature.md");

        let entries = discover(dir.path());

        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries[0].rel_path,
            "workflow-system/state/wip/some-feature.md"
        );
        assert!(
            !entries[0].rel_path.starts_with('/'),
            "rel_path must be RELATIVE to the project root, not absolute"
        );
    }

    #[test]
    fn entry_carries_file_name_for_multi_file_kinds() {
        let dir = TempDir::new().unwrap();
        touch(dir.path(), "workflow-system/product/m11-wbs-parked.md");

        let entries = discover(dir.path());

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name, "m11-wbs-parked.md");
        assert_eq!(entries[0].kind, "wbs");
    }
}
