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
//! events and, for build dirs, risk the documented infinite-rerun footgun. We reuse
//! the SAME exclusion contract as `fs_index::project_walker`: `.git/` hard-excluded +
//! the project's `.gitignore` honored. [`build_ignore`] constructs the matcher once
//! per watched root (in `commands`); [`is_ignored`] is the pure per-path check the
//! transform applies. Watcher + tree therefore agree on what's visible.

pub mod commands;

use std::path::{Path, PathBuf};

use ignore::gitignore::Gitignore;
use serde::Serialize;
use thiserror::Error;

use crate::fs_index::rel_posix;

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

/// Build the ignore matcher for a watched root: the root's `.gitignore` (so
/// `node_modules/`, `target/`, `dist/`, … are excluded wherever the project lists
/// them). `.git/` is handled separately as a hard exclusion in [`is_ignored`] because
/// gitignore rules never cover `.git/` itself.
///
/// Note: this honors the ROOT `.gitignore` only, not nested per-directory ignores (a
/// faithful nested walk would need the full `WalkBuilder` machinery per event, too
/// heavy for the hot path). For the operator's repos the root `.gitignore` covers the
/// high-churn dirs that matter; a missed nested-ignore path at worst causes a harmless
/// extra re-walk, never a wrong result. The matcher is built once per `watch_start`.
pub fn build_ignore(root: &Path) -> Gitignore {
    let mut builder = ignore::gitignore::GitignoreBuilder::new(root);
    // add() returns Some(err) on a malformed line; a missing .gitignore is a silent
    // no-op (add returns None and the path simply isn't there) — either way we get a
    // usable (possibly empty) matcher rather than failing the watcher.
    let _ = builder.add(root.join(".gitignore"));
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

/// Whether an absolute changed `path` under `root` should be IGNORED (not emitted).
/// `.git/` is hard-excluded; everything else defers to the gitignore `matcher`.
///
/// Pure + matcher-injected so it unit-tests without touching the filesystem.
pub fn is_ignored(root: &Path, path: &Path, matcher: &Gitignore) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        // A path outside the root (shouldn't happen for a rooted watcher) — ignore it.
        return true;
    };
    // Hard-exclude the .git metadata dir (any component named ".git").
    if rel.components().any(|c| c.as_os_str() == ".git") {
        return true;
    }
    // gitignore match. We don't know is_dir cheaply here; pass false — directory-only
    // patterns (`foo/`) still match a file inside the dir via parent matching, which
    // is what `matched_path_or_any_parents` provides.
    matcher.matched_path_or_any_parents(path, false).is_ignore()
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
    matcher: &Gitignore,
) -> Option<FsChange> {
    let mut rels: Vec<String> = Vec::new();
    for p in abs_paths {
        if is_ignored(root, p, matcher) {
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
    use std::fs;
    use tempfile::TempDir;

    fn fixture_with_gitignore() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join(".gitignore"), "node_modules/\ntarget/\n*.log\n").unwrap();
        dir
    }

    #[test]
    fn git_dir_paths_are_ignored() {
        let dir = fixture_with_gitignore();
        let root = dir.path();
        let matcher = build_ignore(root);
        assert!(is_ignored(root, &root.join(".git/index"), &matcher));
        assert!(is_ignored(
            root,
            &root.join(".git/refs/heads/main"),
            &matcher
        ));
    }

    #[test]
    fn gitignored_paths_are_ignored() {
        let dir = fixture_with_gitignore();
        let root = dir.path();
        let matcher = build_ignore(root);
        assert!(is_ignored(
            root,
            &root.join("node_modules/react/index.js"),
            &matcher
        ));
        assert!(is_ignored(
            root,
            &root.join("target/debug/claudesk"),
            &matcher
        ));
        assert!(is_ignored(root, &root.join("build.log"), &matcher));
    }

    #[test]
    fn tracked_paths_are_kept() {
        let dir = fixture_with_gitignore();
        let root = dir.path();
        let matcher = build_ignore(root);
        assert!(!is_ignored(root, &root.join("src/main.rs"), &matcher));
        assert!(!is_ignored(
            root,
            &root.join("docs/product/qol-wbs.md"),
            &matcher
        ));
        assert!(!is_ignored(root, &root.join("newfile.txt"), &matcher));
    }

    #[test]
    fn missing_gitignore_yields_usable_matcher_excluding_only_git() {
        // No .gitignore in this dir → build_ignore returns an (effectively empty)
        // matcher; only .git/ is excluded, everything else kept.
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let matcher = build_ignore(root);
        assert!(is_ignored(root, &root.join(".git/index"), &matcher));
        assert!(!is_ignored(root, &root.join("anything.txt"), &matcher));
    }

    #[test]
    fn transform_filters_ignored_and_keeps_tracked() {
        let dir = fixture_with_gitignore();
        let root = dir.path();
        let matcher = build_ignore(root);
        let abs = vec![
            root.join(".git/index"),          // ignored
            root.join("node_modules/x/y.js"), // ignored
            root.join("src/main.rs"),         // kept
            root.join("README.md"),           // kept
        ];
        let change = paths_to_change("ws-1", root, &abs, FsKind::Modified, &matcher)
            .expect("at least one tracked path → Some");
        assert_eq!(change.workspace_id, "ws-1");
        assert_eq!(change.kind, FsKind::Modified);
        // sorted + only the two tracked, project-relative POSIX.
        assert_eq!(
            change.paths,
            vec!["README.md".to_string(), "src/main.rs".to_string()]
        );
    }

    #[test]
    fn transform_all_ignored_returns_none() {
        let dir = fixture_with_gitignore();
        let root = dir.path();
        let matcher = build_ignore(root);
        let abs = vec![root.join(".git/HEAD"), root.join("target/x")];
        // A pure .git/ + build-dir churn batch → nothing to emit.
        assert!(paths_to_change("ws-1", root, &abs, FsKind::Modified, &matcher).is_none());
    }

    #[test]
    fn transform_dedups_repeated_paths() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let matcher = build_ignore(root);
        let abs = vec![
            root.join("a.txt"),
            root.join("a.txt"), // same path twice (a write-then-modify batch)
            root.join("b.txt"),
        ];
        let change = paths_to_change("ws-1", root, &abs, FsKind::Created, &matcher).unwrap();
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
