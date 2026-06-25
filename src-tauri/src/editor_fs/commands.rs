//! Tauri command wrappers over the pure [`super`] editor-fs functions.
//!
//! These are thin: confine the file to the workspace `root` via the pure core and
//! map [`super::EditorFsError`] to a `String` so it can cross the IPC boundary
//! (Tauri requires command errors to be `Serialize`). The frontend passes both
//! the workspace project dir (`root`) and the file path so the root guard is
//! enforced on every read/write — the editor only ever touches files inside the
//! open project.

use std::path::Path;

use super::{delete_file_core, read_file_core, stat_file_core, write_file_core, FileMarker};

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

/// Read a file's on-disk marker (mtime + size) under the workspace `root`, for the
/// WP12 tab strip's disk-change detection. Errors (missing file, path escaping the
/// workspace) come back as a `String` so the UI treats a failed stat as a real error
/// rather than silently as "unchanged". Returns [`FileMarker`] (snake_case fields —
/// the TS mirror reads `mtime_ms` / `size` verbatim; Tauri does not camelCase these).
#[tauri::command]
pub fn stat_file(root: String, path: String) -> Result<FileMarker, String> {
    stat_file_core(Path::new(&root), Path::new(&path)).map_err(|e| e.to_string())
}

/// Delete a single file under the workspace `root` (QoL-WP5). Confined to `root` by the
/// same guard as `write_file`; a directory target is rejected (no recursive delete) and
/// a missing file is an error. Returns the error as a `String` so a failed delete is
/// surfaced in the UI, never swallowed. The "create a new file" path has no command of
/// its own — it is `write_file` with empty contents.
#[tauri::command]
pub fn delete_file(root: String, path: String) -> Result<(), String> {
    delete_file_core(Path::new(&root), Path::new(&path)).map_err(|e| e.to_string())
}
