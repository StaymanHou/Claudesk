//! QoL-WP0: filesystem watcher — the live signal that keeps the FileTree rail and
//! open editor documents in sync with on-disk changes made OUTSIDE Claudesk (a CLI,
//! another editor, `git checkout`, or Claude Code itself writing a file).
//!
//! ## Split (mirrors `status_broadcaster` / `hook_socket`)
//! - **This module ([`mod`])** = the pure, Tauri-free, IO-free logic: the [`FsChange`]
//!   DTO, the [`FsKind`] event-kind classification, the typed [`FsWatchError`], and the
//!   pure [`paths_to_change`] transform (debounced raw paths + an ignore matcher →
//!   `Option<FsChange>`). All of it unit-tests without a Tauri app or a real watcher.
//! - **[`commands`]** = the runtime-dependent pieces: the per-workspace
//!   `notify-debouncer-full` debouncer, the managed `WatcherRegistry`, the
//!   `app.emit("fs-change", …)`, and the `workspace_watch_start`/`_stop` commands.
//!
//! ## Exclusion model (the don't-fire-a-re-walk-storm rule)
//! The watcher must NOT emit for `.git/` internal churn (every git op rewrites the
//! index) or for build/dep dirs (`node_modules/`, `target/`, …) — both would flood
//! events and, for build dirs, risk the documented infinite-rerun footgun. M6 WP6
//! **re-based** this exclusion from "the project's `.gitignore` honored" to the SAME
//! heavy-dir predicate the walker/tree/finder now use ([`fs_index::is_heavy_dir_name`]):
//! a path is ignored iff any ancestor component is a heavy-dir NAME (or `.git`).
//! Watcher + tree therefore still agree — but on the *heavy* axis, not the *gitignored*
//! axis. The behavior change: a gitignored-but-edited file (`.env`, `.session.md`,
//! `.claude/*`) now EMITS `fs-change`, so editing it gets live external-change refresh
//! — the EDIT-case unlock that pairs with the tree showing it.
//!
//! ## Hot-path heaviness: NAME-based only (P2.1 decision, 2026-06-28)
//! [`is_ignored`] is called once per changed path inside the debounce callback (the hot
//! path), so it must be cheap + pure. We use NAME-based heaviness only — no per-event
//! `read_dir`, no detected-big detection, no cached scan. The tradeoff (accepted at plan
//! time, design decision #7): a *detected-big-but-unnamed* dir is NOT suppressed by the
//! watcher, so it may over-emit live-refresh there. This is rare and harmless — the tree
//! still prunes that dir for display (the tree CAN afford the `read_dir`); only the
//! watcher over-fires, costing at worst an extra harmless re-walk, never a wrong result.
//! This mirrors the pre-existing "missed nested-ignore at worst causes an extra re-walk"
//! philosophy this module already accepted, and keeps [`is_ignored`] a pure FS-free fn
//! (no matcher to build, no `Gitignore` plumbing — both dropped in WP6).

pub mod commands;

use std::path::{Path, PathBuf};

use serde::Serialize;
use thiserror::Error;

use crate::fs_index::{is_heavy_dir_name, rel_posix};

/// Errors from starting/stopping a workspace watcher. IPC-facing wrappers map this to
/// a `String` (the never-swallow lesson — a failed watcher means the tree/editor go
/// silently stale, so the failure must be visible).
#[derive(Debug, Error)]
pub enum FsWatchError {
    /// The workspace root does not exist or is not a directory.
    #[error("workspace root {root} is not a readable directory")]
    BadRoot { root: String },
    /// The underlying `notify` watcher failed to start watching the path.
    #[error("failed to start watching {root}: {reason}")]
    WatchStart { root: String, reason: String },
    /// The registry lock was poisoned (a prior panic while holding it).
    #[error("watcher registry lock poisoned")]
    LockPoisoned,
}

/// The coarse kind of a debounced filesystem change, classified from the
/// `notify` event kinds present in the debounced batch. The frontend uses this only
/// as a hint (the FileTree re-walks regardless; the editor re-stats regardless) — the
/// authoritative signal is `paths`. Kept coarse on purpose (no per-path kind) because
/// the debouncer coalesces a burst that may mix kinds.
#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum FsKind {
    /// One or more paths were created.
    Created,
    /// One or more paths had their contents/metadata modified.
    Modified,
    /// One or more paths were removed.
    Removed,
    /// A rename was observed (the debouncer pairs From/To).
    Renamed,
    /// A mix, or a kind we don't special-case — the frontend treats it like Modified.
    Other,
}

/// One debounced filesystem-change notification for a single workspace, emitted on the
/// `fs-change` Tauri event. **snake_case end-to-end** (the IPC-DTO casing convention,
/// SURFACE-2026-06-21) — the frontend type mirrors these field names verbatim.
///
/// `paths` are project-relative POSIX strings (via [`rel_posix`], same as the tree /
/// finder), already filtered against the ignore matcher — every path here is one the
/// FileTree would show. An empty `paths` is never emitted (the transform returns
/// `None`), so a subscriber that receives an `FsChange` always has at least one path.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct FsChange {
    pub workspace_id: String,
    pub paths: Vec<String>,
    pub kind: FsKind,
}

/// Whether an absolute changed `path` under `root` should be IGNORED (not emitted).
/// `.git/` is hard-excluded; everything else is ignored iff any ancestor component is a
/// heavy-dir NAME ([`fs_index::is_heavy_dir_name`] — `node_modules`, `target`, `dist`, …).
///
/// NAME-based only, by design (see module doc → "Hot-path heaviness"): pure + FS-free so
/// it unit-tests trivially and costs O(components) per event with no `read_dir`. A
/// detected-big-but-unnamed dir is therefore NOT suppressed here (the tree still prunes
/// it; the watcher's worst case is a harmless extra re-walk). The gitignore matcher this
/// replaced is gone — gitignored-but-non-heavy files (`.env`, `.session.md`, `.claude/*`)
/// now pass the filter and emit `fs-change`, giving them live external-change refresh.
pub fn is_ignored(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        // A path outside the root (shouldn't happen for a rooted watcher) — ignore it.
        return true;
    };
    // Any path component that is `.git` or a heavy-dir NAME → ignored. This catches both
    // the dir itself and anything under it (a path with such an ancestor component).
    rel.components().any(|c| {
        let name = c.as_os_str().to_string_lossy();
        name == ".git" || is_heavy_dir_name(&name)
    })
}

/// The pure transform: given the workspace id, root, the absolute paths from a
/// debounced event batch, a coarse [`FsKind`], and the root's ignore matcher → the
/// [`FsChange`] to emit, or `None` if every path was filtered (nothing the UI cares
/// about changed — e.g. a pure `.git/` churn batch).
///
/// This is the one piece of logic in the watcher; the debouncer callback in
/// [`commands`] is plumbing around it (classify the batch, call this, `emit` the
/// `Some`). Dedups paths so a batch touching one path N ways emits it once.
pub fn paths_to_change(
    workspace_id: &str,
    root: &Path,
    abs_paths: &[PathBuf],
    kind: FsKind,
) -> Option<FsChange> {
    let mut rels: Vec<String> = Vec::new();
    for p in abs_paths {
        if is_ignored(root, p) {
            continue;
        }
        if let Some(rel) = rel_posix(root, p) {
            rels.push(rel);
        }
    }
    rels.sort();
    rels.dedup();
    if rels.is_empty() {
        return None;
    }
    Some(FsChange {
        workspace_id: workspace_id.to_string(),
        paths: rels,
        kind,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tempfile::TempDir;

    // M6 WP6: `is_ignored` is now a pure NAME-based heavy-dir predicate — no `.gitignore`
    // file, no matcher to build. Tests construct paths under a bare temp root.
    fn root() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn git_dir_paths_are_ignored() {
        let dir = root();
        let r: &Path = dir.path();
        assert!(is_ignored(r, &r.join(".git/index")));
        assert!(is_ignored(r, &r.join(".git/refs/heads/main")));
    }

    #[test]
    fn heavy_dir_paths_are_ignored() {
        // Heavy dirs by NAME stay suppressed (the hard requirement) — matched on any
        // ancestor component, so contents anywhere under them are ignored.
        let dir = root();
        let r: &Path = dir.path();
        assert!(is_ignored(r, &r.join("node_modules/react/index.js")));
        assert!(is_ignored(r, &r.join("target/debug/claudesk")));
        assert!(is_ignored(r, &r.join("dist/bundle.js")));
        // a nested heavy dir (heavy component not at the top level) is still caught
        assert!(is_ignored(r, &r.join("packages/app/node_modules/x/y.js")));
    }

    #[test]
    fn gitignored_but_non_heavy_files_are_now_kept() {
        // The WP6 re-base: a gitignored-but-edited file (`.env`, `.session.md`,
        // `.claude/*`) is NO LONGER ignored — it now emits `fs-change` (the EDIT-case
        // unlock). This is the inversion of the old `gitignored_paths_are_ignored`.
        let dir = root();
        let r: &Path = dir.path();
        assert!(!is_ignored(r, &r.join(".env")));
        assert!(!is_ignored(r, &r.join(".session.md")));
        assert!(!is_ignored(r, &r.join(".claude/memory/note.md")));
        // a stray *.log (gitignored in many repos) is also kept now — not heavy by name
        assert!(!is_ignored(r, &r.join("build.log")));
    }

    #[test]
    fn tracked_paths_are_kept() {
        let dir = root();
        let r: &Path = dir.path();
        assert!(!is_ignored(r, &r.join("src/main.rs")));
        assert!(!is_ignored(r, &r.join("docs/product/qol-wbs.md")));
        assert!(!is_ignored(r, &r.join("newfile.txt")));
    }

    #[test]
    fn detected_big_but_unnamed_dir_is_not_suppressed_by_watcher() {
        // Accepted P2.1 tradeoff: NAME-based only, so a dir that the TREE would prune via
        // detected-big (an unknown name with >threshold children) is NOT suppressed by
        // the watcher — it emits. Documents the known over-emit (harmless extra re-walk).
        let dir = root();
        let r: &Path = dir.path();
        assert!(!is_ignored(r, &r.join("generated/file_0001.txt")));
    }

    #[test]
    fn path_outside_root_is_ignored() {
        let dir = root();
        let r: &Path = dir.path();
        // A path that doesn't start with root (shouldn't happen for a rooted watcher).
        assert!(is_ignored(r, Path::new("/some/other/place/x.txt")));
    }

    #[test]
    fn transform_filters_ignored_and_keeps_tracked() {
        let dir = root();
        let r: &Path = dir.path();
        let abs = vec![
            r.join(".git/index"),          // ignored (.git)
            r.join("node_modules/x/y.js"), // ignored (heavy name)
            r.join(".env"),                // KEPT now (gitignored-but-non-heavy)
            r.join("src/main.rs"),         // kept
            r.join("README.md"),           // kept
        ];
        let change = paths_to_change("ws-1", r, &abs, FsKind::Modified)
            .expect("at least one tracked path → Some");
        assert_eq!(change.workspace_id, "ws-1");
        assert_eq!(change.kind, FsKind::Modified);
        // sorted + only the three kept, project-relative POSIX (.env now included).
        assert_eq!(
            change.paths,
            vec![
                ".env".to_string(),
                "README.md".to_string(),
                "src/main.rs".to_string()
            ]
        );
    }

    #[test]
    fn transform_all_ignored_returns_none() {
        let dir = root();
        let r: &Path = dir.path();
        let abs = vec![r.join(".git/HEAD"), r.join("target/x")];
        // A pure .git/ + heavy-dir churn batch → nothing to emit.
        assert!(paths_to_change("ws-1", r, &abs, FsKind::Modified).is_none());
    }

    #[test]
    fn transform_dedups_repeated_paths() {
        let dir = root();
        let r: &Path = dir.path();
        let abs = vec![
            r.join("a.txt"),
            r.join("a.txt"), // same path twice (a write-then-modify batch)
            r.join("b.txt"),
        ];
        let change = paths_to_change("ws-1", r, &abs, FsKind::Created).unwrap();
        assert_eq!(change.paths, vec!["a.txt".to_string(), "b.txt".to_string()]);
    }

    #[test]
    fn fs_change_dto_serializes_snake_case() {
        // The IPC-DTO casing contract (SURFACE-2026-06-21): pin the exact keys + the
        // snake_case enum rendering the frontend type mirrors verbatim.
        let change = FsChange {
            workspace_id: "ws-1".to_string(),
            paths: vec!["src/main.rs".to_string()],
            kind: FsKind::Renamed,
        };
        let v = serde_json::to_value(&change).unwrap();
        assert!(
            v.get("workspace_id").is_some(),
            "snake_case workspace_id key"
        );
        assert!(v.get("paths").is_some());
        assert_eq!(
            v.get("kind").unwrap(),
            "renamed",
            "snake_case enum rendering"
        );
        // No camelCase leakage.
        assert!(v.get("workspaceId").is_none());
    }
}
