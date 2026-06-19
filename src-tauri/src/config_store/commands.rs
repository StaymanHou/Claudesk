//! Tauri command wrappers over the pure [`super`] store functions.
//!
//! These are thin: resolve the real app-data dir from the `AppHandle`, ensure it
//! exists, delegate to the pure store function, and map [`ConfigError`] to a
//! `String` so it can cross the IPC boundary (Tauri requires command errors to
//! be `Serialize`). All persistence logic and ordering live in [`super`]; these
//! wrappers add only the runtime-dependent path resolution and the wall clock.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use super::{add_or_touch, prune_missing, read_projects, remove as remove_project_inner, Project};

/// Resolve `~/Library/Application Support/Claudesk/` and ensure it exists.
fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Current wall-clock time in unix epoch milliseconds.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// List remembered projects, most-recently-opened first.
#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    read_projects(&dir).map_err(|e| e.to_string())
}

/// Add a project (or refresh its recency if already present). Returns the record.
#[tauri::command]
pub fn add_project(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Stamp `last_opened_at = now` for a project (adding it if unknown). Returns the
/// record so the frontend can reflect the new recency immediately.
#[tauri::command]
pub fn record_open(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Remove a project from the list. No-op if absent.
#[tauri::command]
pub fn remove_project(app: AppHandle, path: String) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    remove_project_inner(&dir, Path::new(&path)).map_err(|e| e.to_string())
}

/// Drop projects whose folder no longer exists on disk, returning the dropped
/// records so the picker can show a toast naming how many were removed. Called on
/// picker mount (WP9): a project deleted between sessions otherwise lingers as a
/// dead click.
#[tauri::command]
pub fn prune_missing_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    prune_missing(&dir).map_err(|e| e.to_string())
}
