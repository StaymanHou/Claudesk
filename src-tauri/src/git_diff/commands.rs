//! Tauri command wrappers over the pure [`super`] git-diff functions.
//!
//! Thin: call the pure core with the workspace project dir (`root`) and map
//! [`super::GitDiffError`] to a `String` so it can cross IPC (Tauri command errors
//! must be `Serialize`). A diff failure (not a git repo, bad commit, etc.) comes
//! back as a `String` for the UI to surface — never swallowed (the WP6/WP7
//! error-surfacing lesson). Mirrors [`crate::editor_fs::commands`].

use std::path::Path;

use super::{
    changed_files_core, commit_diff_core, file_hunks_core, recent_commits_core, ChangedFile,
    CommitSummary, FileDiff,
};

/// List the workspace repo's changed files (staged + unstaged, untracked
/// included). A clean tree returns an empty list; a non-git `root` returns the
/// "not a git repository" error as a `String`.
#[tauri::command]
pub fn git_changed_files(root: String) -> Result<Vec<ChangedFile>, String> {
    changed_files_core(Path::new(&root)).map_err(|e| e.to_string())
}

/// The diff hunks for one working-tree file: `staged=false` = working-tree-vs-index,
/// `staged=true` = index-vs-HEAD. Returns the file's structured hunks (or a
/// `binary: true` marker). Errors come back as a `String`.
#[tauri::command]
pub fn git_file_hunks(root: String, path: String, staged: bool) -> Result<FileDiff, String> {
    file_hunks_core(Path::new(&root), &path, staged).map_err(|e| e.to_string())
}

/// Recent commits reachable from HEAD, newest-first, paginated (`offset`/`limit`)
/// to back the "Load more" affordance. A short/empty page means end-of-history.
#[tauri::command]
pub fn git_recent_commits(
    root: String,
    offset: usize,
    limit: usize,
) -> Result<Vec<CommitSummary>, String> {
    recent_commits_core(Path::new(&root), offset, limit).map_err(|e| e.to_string())
}

/// The per-file diff of a commit vs its first parent (root commit → all-added).
/// An unknown SHA returns the "commit not found" error as a `String`.
#[tauri::command]
pub fn git_commit_diff(root: String, sha: String) -> Result<Vec<FileDiff>, String> {
    commit_diff_core(Path::new(&root), &sha).map_err(|e| e.to_string())
}
