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

pub mod commands;

use std::collections::HashMap;
use std::path::Path;

use git2::StatusOptions;

use crate::git_diff::{open_repo, staged_status, unstaged_status, ChangedStatus, GitDiffError};

/// The per-file status the tree indicator renders. Reuses [`ChangedStatus`] (the same
/// `modified`/`added`/`deleted`/`renamed`/`untracked` lowercase-serialized kinds the
/// diff viewer uses) so the frontend has one status vocabulary across both surfaces.
pub type GitFileStatus = ChangedStatus;

/// Build the `repo-relative path → status` map for the working tree at `repo_root`.
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

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut out = HashMap::new();

    for entry in statuses.iter() {
        let s = entry.status();
        let path = entry.path().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }
        // One mark per file: the staged change-kind wins (more intentional), else the
        // unstaged kind. A path with neither is clean and stays out of the map.
        if let Some(status) = staged_status(s).or_else(|| unstaged_status(s)) {
            out.insert(path, status);
        }
    }

    Ok(out)
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
}
