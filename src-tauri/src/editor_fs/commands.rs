//! Tauri command wrappers over the pure [`super`] editor-fs functions.
//!
//! These are thin: confine the file to the workspace `root` via the pure core and
//! map [`super::EditorFsError`] to a `String` so it can cross the IPC boundary
//! (Tauri requires command errors to be `Serialize`). The frontend passes both
//! the workspace project dir (`root`) and the file path so the root guard is
//! enforced on every read/write — the editor only ever touches files inside the
//! open project.

use std::path::Path;

use super::{read_file_core, write_file_core};

/// Read a UTF-8 text file under the workspace `root`. Errors (missing file, binary
/// content, path escaping the workspace) come back as a `String` for the UI to
/// surface — never swallowed.
#[tauri::command]
pub fn read_file(root: String, path: String) -> Result<String, String> {
    read_file_core(Path::new(&root), Path::new(&path)).map_err(|e| e.to_string())
}

/// Atomically write `contents` to a file under the workspace `root`. Returns the
/// error as a `String` on failure so a save error is visible, not dropped.
#[tauri::command]
pub fn write_file(root: String, path: String, contents: String) -> Result<(), String> {
    write_file_core(Path::new(&root), Path::new(&path), &contents).map_err(|e| e.to_string())
}
