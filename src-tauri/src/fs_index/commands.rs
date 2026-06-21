//! Tauri command wrapper over the pure [`super::walk_index_core`] function.
//!
//! Thin: walk the workspace `root` via the pure core and map [`super::FsIndexError`]
//! to a `String` so it can cross the IPC boundary (Tauri requires command errors to
//! be `Serialize`). The frontend passes the workspace project dir as `root`; the
//! Cmd+P finder fuzzy-matches over the returned list.
//!
//! Errors come back as a `String` for the UI to surface — a missing/unreadable root
//! is an error the finder shows, never a silently-empty list (the WP6 picker IPC
//! error-surfacing lesson). An empty project dir legitimately returns `[]`.

use std::path::Path;

use super::walk_index_core;

/// Return the gitignore-honoring file list for the workspace `root`, as sorted
/// project-relative POSIX paths. Errors (root missing / not a directory) come back
/// as a `String` so the finder surfaces them instead of showing nothing.
#[tauri::command]
pub fn fs_index(root: String) -> Result<Vec<String>, String> {
    walk_index_core(Path::new(&root)).map_err(|e| e.to_string())
}
