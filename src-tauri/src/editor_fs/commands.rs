//! Tauri command wrappers over the pure [`super`] editor-fs functions.
//!
//! These are thin: they authenticate the frontend-supplied workspace `root` against
//! the known project list, confine the file to that `root` via the pure core, and map
//! [`super::EditorFsError`] to a `String` so it can cross the IPC boundary (Tauri
//! requires command errors to be `Serialize`). The frontend passes both the workspace
//! project dir (`root`) and the file path; the backend enforces the guard on every
//! read/write — the editor only ever touches files inside a known open project.
//!
//! ## Root is validated, not trusted (WP7)
//! `root` arrives from the renderer, but it is **no longer taken on faith**: every
//! command resolves the known project list server-side ([`crate::config_store`], keyed
//! off the real `app_data_dir()`) and calls [`super::validate_root`] before honoring
//! `root`. A `root` that is neither a known project nor a descendant of one is rejected
//! with [`super::EditorFsError::OutsideWorkspace`] — so a malformed or hostile `root`
//! can't widen the guard to arbitrary disk. This mirrors `config_store`'s server-side-
//! derivation posture. `AppHandle` is injected by Tauri (never passed from JS), so the
//! frontend `invoke` shape is unchanged (`{ root, path[, contents] }`).

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use super::{
    create_dir_core, delete_file_core, read_file_core, stat_file_core, trash_path_core,
    validate_root, write_file_core, FileMarker,
};
use crate::config_store::{self, commands::resolve_data_dir};

/// Authenticate a frontend-supplied `root` against the known project list, returning the
/// canonicalized root to confine against. Resolves the project list server-side from the
/// real app-data dir, so the renderer can't widen the guard by passing an arbitrary
/// `root`. Shared by all six editor-fs commands.
fn validate_frontend_root(app: &AppHandle, root: &str) -> Result<PathBuf, String> {
    let data_dir = resolve_data_dir(app)?;
    let known_roots: Vec<PathBuf> = config_store::read_projects(&data_dir)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|p| p.path)
        .collect();
    validate_root(&known_roots, Path::new(root)).map_err(|e| e.to_string())
}

/// Read a UTF-8 text file under the workspace `root`. Errors (unknown/hostile `root`,
/// missing file, binary content, path escaping the workspace) come back as a `String`
/// for the UI to surface — never swallowed.
#[tauri::command]
pub fn read_file(app: AppHandle, root: String, path: String) -> Result<String, String> {
    let root = validate_frontend_root(&app, &root)?;
    read_file_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}

/// Atomically write `contents` to a file under the workspace `root`. Returns the
/// error as a `String` on failure so a save error is visible, not dropped.
#[tauri::command]
pub fn write_file(
    app: AppHandle,
    root: String,
    path: String,
    contents: String,
) -> Result<(), String> {
    let root = validate_frontend_root(&app, &root)?;
    write_file_core(&root, Path::new(&path), &contents).map_err(|e| e.to_string())
}

/// Read a file's on-disk marker (mtime + size) under the workspace `root`, for the
/// WP12 tab strip's disk-change detection. Errors (unknown/hostile `root`, missing file,
/// path escaping the workspace) come back as a `String` so the UI treats a failed stat
/// as a real error rather than silently as "unchanged". Returns [`FileMarker`]
/// (snake_case fields — the TS mirror reads `mtime_ms` / `size` verbatim; Tauri does not
/// camelCase these).
#[tauri::command]
pub fn stat_file(app: AppHandle, root: String, path: String) -> Result<FileMarker, String> {
    let root = validate_frontend_root(&app, &root)?;
    stat_file_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}

/// Delete a single file under the workspace `root` (QoL-WP5). Confined to `root` by the
/// same guard as `write_file`; a directory target is rejected (no recursive delete) and
/// a missing file is an error. Returns the error as a `String` so a failed delete is
/// surfaced in the UI, never swallowed. The "create a new file" path has no command of
/// its own — it is `write_file` with empty contents.
#[tauri::command]
pub fn delete_file(app: AppHandle, root: String, path: String) -> Result<(), String> {
    let root = validate_frontend_root(&app, &root)?;
    delete_file_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}

/// Move a path (file OR directory) under the workspace `root` to the macOS Trash
/// (QoL-WP5b — recoverable folder delete). Confined to `root` by the same guard as
/// `delete_file`/`write_file`; a missing target is an error. Unlike `delete_file` (a
/// hard `remove_file`, single-file only), this is recoverable from Finder — the choice
/// for the folder-delete blast radius. Returns the error as a `String` so a failed
/// trash is surfaced in the UI, never swallowed. WP5b wires it to directory rows.
#[tauri::command]
pub fn trash_path(app: AppHandle, root: String, path: String) -> Result<(), String> {
    let root = validate_frontend_root(&app, &root)?;
    trash_path_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}

/// Create a directory (and any missing intermediate dirs) under the workspace `root`
/// (QoL-WP5b — the "new folder" affordance + the nested-file create's `mkdir -p`).
/// Confined to `root` by the parent-tolerant lexical guard; idempotent on an existing
/// dir; an escaping path is rejected. Returns the error as a `String` so a failed create
/// is surfaced in the UI, never swallowed.
#[tauri::command]
pub fn create_dir(app: AppHandle, root: String, path: String) -> Result<(), String> {
    let root = validate_frontend_root(&app, &root)?;
    create_dir_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}
