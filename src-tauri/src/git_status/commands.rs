//! Tauri command wrapper over the pure [`super::status_map_core`].
//!
//! Thin: call the pure core with the workspace project dir (`root`) and map
//! [`crate::git_diff::GitDiffError`] to a `String` so it can cross IPC (the WP6/WP7
//! error-surfacing shape — a real git failure is visible in the UI, never swallowed).
//! Note the `NotARepo` case never reaches here as an error: the core maps it to an
//! empty map (a non-git workspace is normal for the tree). Mirrors
//! [`crate::git_diff::commands`].

use std::collections::HashMap;
use std::path::Path;

use super::{status_map_core, GitFileStatus};

/// Per-path working-tree git status for the file tree's row indicators. Returns a
/// `repo-relative path → status` map (clean files omitted). A non-git `root` returns
/// an empty map (not an error). Other libgit2 failures come back as a `String`.
#[tauri::command]
pub fn git_file_statuses(root: String) -> Result<HashMap<String, GitFileStatus>, String> {
    status_map_core(Path::new(&root)).map_err(|e| e.to_string())
}
