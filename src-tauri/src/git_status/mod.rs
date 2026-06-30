//! Per-path working-tree git status — the data behind the file tree's Sublime-style
//! status indicators (WP11 Part B).
//!
//! Where [`crate::git_diff`] produces a *changed-file list* (one entry per staged or
//! unstaged side, for the diff viewer), this module produces a **path → single status
//! map** keyed at file granularity, which is exactly what the tree needs to mark each
//! row. It reuses `git_diff`'s git2 plumbing (`open_repo`, the `Status`→kind mappers,
//! and the [`ChangedStatus`] enum) so there is one repo-open and one status-mapping
//! contract across both consumers.
//!
//! ## Layout (mirrors [`crate::git_diff`] / [`crate::editor_fs`])
//! - **Pure core** [`status_map_core`] takes an injected `repo_root: &Path`, so it is
//!   unit-testable against a `TempDir` git repo with no Tauri runtime.
//! - **Tauri command wrapper** ([`commands`]) is the only IPC surface; it maps the
//!   typed error to a `String` (the WP6 error-surfacing shape).
//!
//! ## Non-git directory is NOT an error (the key behavioral difference)
//! A workspace need not be a git repo — the file tree must still render. So a
//! `repo_root` with no enclosing repository returns `Ok(empty map)` (all rows clean,
//! no indicators) rather than the `NotARepo` error the diff viewer surfaces. Every
//! other libgit2 failure still propagates as an error for the UI to show.
//!
//! ## Per-path folding
//! libgit2 reports one status entry per path with both index (staged) and working-tree
//! (unstaged) bits. The tree shows ONE mark per file, so we fold: the **staged**
//! change-kind wins when present (it's the more-intentional state), else the unstaged
//! kind, else the path is clean and omitted from the map.
//!
//! ## Key space: workspace-root-relative, NOT repo-root-relative
//! `open_repo` discovers the repository *upward* from `repo_root` ([`Repository::discover`]),
//! so a workspace nested below its repo root still finds the repo — but libgit2 then
//! reports every status path relative to the **repo working dir**, e.g. `subdir/file.txt`.
//! The file tree, however, keys its rows on **workspace-root-relative** paths (the
//! `fs_tree` / `buildTree` key space, e.g. `file.txt`). To make `gitStatus[node.path]`
//! lookups hit, we re-base each path: strip the workspace's within-repo prefix, and drop
//! entries that fall outside the workspace subtree (the tree never renders those rows).
//! When the workspace IS the repo root the prefix is empty and keys pass through unchanged.

pub mod commands;

use std::collections::HashMap;
use std::path::Path;

use git2::StatusOptions;

use crate::git_diff::{open_repo, staged_status, unstaged_status, ChangedStatus, GitDiffError};

/// The per-file status the tree indicator renders. Reuses [`ChangedStatus`] (the same
/// `modified`/`added`/`deleted`/`renamed`/`untracked` lowercase-serialized kinds the
/// diff viewer uses) so the frontend has one status vocabulary across both surfaces.
pub type GitFileStatus = ChangedStatus;

/// Build the `workspace-root-relative path → status` map for the working tree at
/// `repo_root` (the workspace dir — see module docs on the key space).
///
/// - **Clean files are omitted** (absence from the map = no indicator).
/// - **A non-git `repo_root` returns an empty map**, not an error (see module docs) —
///   the tree renders the same as a clean repo.
/// - Any other libgit2 failure propagates as [`GitDiffError`].
pub fn status_map_core(repo_root: &Path) -> Result<HashMap<String, GitFileStatus>, GitDiffError> {
    let repo = match open_repo(repo_root) {
        Ok(repo) => repo,
        // Not a git repo → no statuses, not an error (the tree still renders).
        Err(GitDiffError::NotARepo(_)) => return Ok(HashMap::new()),
        Err(e) => return Err(e),
    };

    // The workspace's path *within* the repo working dir, as a `/`-joined POSIX prefix
    // (empty when the workspace IS the repo root). git status paths are repo-root-relative;
    // we strip this prefix to re-key them into the tree's workspace-root-relative space.
    // A bare repo (no workdir) has no working-tree statuses → empty map.
    let prefix = match repo.workdir() {
        Some(workdir) => within_repo_prefix(workdir, repo_root),
        None => return Ok(HashMap::new()),
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        // Report untracked FILES, not a collapsed parent dir. Without this, an untracked
        // subdir reports as one `subdir/` entry — so the tree's file rows under it get no
        // indicator, and (in a nested workspace) the lone dir entry can equal the strip
        // prefix and re-base to an empty key. The tree marks files, so we want per-file paths.
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut out = HashMap::new();

    for entry in statuses.iter() {
        let s = entry.status();
        // libgit2 returns `None` for a non-UTF-8 path → "" here → skipped (such a file
        // gets no indicator). Acceptable: paths the in-app tree renders are UTF-8.
        let path = entry.path().unwrap_or("");
        if path.is_empty() {
            continue;
        }
        // Re-base into the workspace key space; `None` ⇒ outside the workspace subtree,
        // a row the tree never renders, so drop it.
        let Some(key) = rebase_to_workspace(path, &prefix) else {
            continue;
        };
        // One mark per file: the staged change-kind wins (more intentional), else the
        // unstaged kind. A path with neither is clean and stays out of the map.
        if let Some(status) = staged_status(s).or_else(|| unstaged_status(s)) {
            out.insert(key, status);
        }
    }

    Ok(out)
}

/// Compute the workspace's path *within* the repo working dir as a `/`-joined POSIX
/// prefix (no trailing slash; empty `String` when the workspace IS the repo root).
///
/// Both paths are canonicalized first so symlinks / `.` components / relative segments
/// don't defeat `strip_prefix`. `workdir` from libgit2 is already canonical, but the
/// IPC-supplied `repo_root` may not be. If either canonicalize fails (e.g. the path no
/// longer exists) or the workspace is somehow not under the workdir, we fall back to an
/// empty prefix — the pass-through behavior, which at worst keys repo-relative (the
/// pre-fix status quo), never panics, and still renders the workspace==repo-root case.
fn within_repo_prefix(workdir: &Path, repo_root: &Path) -> String {
    let workdir_canon = workdir
        .canonicalize()
        .unwrap_or_else(|_| workdir.to_path_buf());
    let ws_canon = repo_root
        .canonicalize()
        .unwrap_or_else(|_| repo_root.to_path_buf());
    match ws_canon.strip_prefix(&workdir_canon) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => String::new(),
    }
}

/// Re-key a repo-root-relative git path into the workspace-root-relative tree key space.
///
/// - Empty `prefix` (workspace == repo root) ⇒ pass through unchanged.
/// - Path inside the workspace subtree ⇒ the remainder after `prefix/` (e.g.
///   `subdir/file.txt` with prefix `subdir` ⇒ `file.txt`).
/// - Path outside the workspace subtree ⇒ `None` (caller drops it).
fn rebase_to_workspace(path: &str, prefix: &str) -> Option<String> {
    if prefix.is_empty() {
        return Some(path.to_string());
    }
    path.strip_prefix(prefix)
        .and_then(|rest| rest.strip_prefix('/'))
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;
    use tempfile::TempDir;

    /// Run a git command in `dir`, asserting success. Uses the real `git` binary so
    /// the fixture state is exactly what a user would produce (libgit2 then reads it
    /// back) — the test verifies our *reading*, not git's writing. (Same helper shape
    /// as git_diff's tests.)
    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command runs");
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// A repo with one committed file, deterministic identity + default branch.
    fn init_repo() -> TempDir {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        git(p, &["config", "user.email", "test@example.com"]);
        git(p, &["config", "user.name", "Test"]);
        std::fs::write(p.join("committed.txt"), "line1\nline2\n").unwrap();
        git(p, &["add", "."]);
        git(p, &["commit", "-q", "-m", "initial"]);
        dir
    }

    #[test]
    fn clean_repo_has_empty_map() {
        let dir = init_repo();
        let map = status_map_core(dir.path()).unwrap();
        assert!(
            map.is_empty(),
            "clean tree should have no statuses: {map:?}"
        );
    }

    #[test]
    fn non_git_dir_returns_empty_map_not_error() {
        // The key behavioral difference from git_diff::changed_files_core (which errors
        // NotARepo here): the tree must render in a non-repo workspace.
        let dir = TempDir::new().unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert!(map.is_empty(), "non-git dir → empty map: {map:?}");
    }

    #[test]
    fn unstaged_modified_file_is_modified() {
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nCHANGED\n").unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(map.get("committed.txt"), Some(&ChangedStatus::Modified));
        assert_eq!(map.len(), 1, "{map:?}");
    }

    #[test]
    fn untracked_file_is_untracked() {
        let dir = init_repo();
        std::fs::write(dir.path().join("new.txt"), "brand new\n").unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(map.get("new.txt"), Some(&ChangedStatus::Untracked));
    }

    #[test]
    fn staged_new_file_is_added() {
        let dir = init_repo();
        std::fs::write(dir.path().join("added.txt"), "staged new\n").unwrap();
        git(dir.path(), &["add", "added.txt"]);
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(map.get("added.txt"), Some(&ChangedStatus::Added));
    }

    #[test]
    fn deleted_tracked_file_is_deleted() {
        let dir = init_repo();
        std::fs::remove_file(dir.path().join("committed.txt")).unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(map.get("committed.txt"), Some(&ChangedStatus::Deleted));
    }

    #[test]
    fn staged_kind_wins_over_unstaged_for_same_path() {
        // Stage a modification, then modify again in the working tree. libgit2 reports
        // BOTH index-modified and wt-modified bits; the fold must yield one entry
        // (Modified here — both sides agree, but the staged side is the one chosen).
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nSTAGED\n").unwrap();
        git(dir.path(), &["add", "committed.txt"]);
        std::fs::write(dir.path().join("committed.txt"), "line1\nSTAGED\nWT\n").unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(
            map.len(),
            1,
            "one entry per path even when both sides changed"
        );
        assert_eq!(map.get("committed.txt"), Some(&ChangedStatus::Modified));
    }

    #[test]
    fn multiple_files_each_get_their_own_status() {
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nMOD\n").unwrap();
        std::fs::write(dir.path().join("fresh.txt"), "new\n").unwrap();
        let map = status_map_core(dir.path()).unwrap();
        assert_eq!(map.get("committed.txt"), Some(&ChangedStatus::Modified));
        assert_eq!(map.get("fresh.txt"), Some(&ChangedStatus::Untracked));
        assert_eq!(map.len(), 2, "{map:?}");
    }

    /// The bug case: the workspace is a SUBDIR of the repo root. `Repository::discover`
    /// finds the repo upward, libgit2 reports `ws/file.txt`, and the tree keys rows on
    /// `file.txt` (workspace-relative). The status map must be re-keyed to match, or the
    /// nested workspace silently shows no indicators (SURFACE-2026-06-21-...-PATH-KEYING).
    #[test]
    fn workspace_nested_below_repo_root_is_keyed_workspace_relative() {
        let dir = init_repo();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        std::fs::write(ws.join("nested.txt"), "fresh\n").unwrap();
        // Pass the SUBDIR as the workspace root (what the picker hands us for a nested ws).
        let map = status_map_core(&ws).unwrap();
        assert_eq!(
            map.get("nested.txt"),
            Some(&ChangedStatus::Untracked),
            "nested workspace path must be keyed relative to the workspace, not the repo: {map:?}"
        );
        assert!(
            !map.contains_key("ws/nested.txt"),
            "repo-relative key must NOT leak through: {map:?}"
        );
        assert_eq!(map.len(), 1, "{map:?}");
    }

    /// A change OUTSIDE the workspace subtree (a sibling dir of the nested workspace) must
    /// be omitted — the tree never renders those rows, and a stray repo-relative key would
    /// never match anyway.
    #[test]
    fn change_outside_workspace_subtree_is_omitted() {
        let dir = init_repo();
        let ws = dir.path().join("ws");
        let sibling = dir.path().join("other");
        std::fs::create_dir(&ws).unwrap();
        std::fs::create_dir(&sibling).unwrap();
        std::fs::write(ws.join("inside.txt"), "in\n").unwrap();
        std::fs::write(sibling.join("outside.txt"), "out\n").unwrap();
        let map = status_map_core(&ws).unwrap();
        assert_eq!(map.get("inside.txt"), Some(&ChangedStatus::Untracked));
        assert!(
            !map.keys().any(|k| k.contains("outside")),
            "a sibling-dir change must not appear in the workspace's status map: {map:?}"
        );
        assert_eq!(map.len(), 1, "{map:?}");
    }
}
