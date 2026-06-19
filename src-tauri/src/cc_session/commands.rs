//! Tauri command wrappers over the [`super::SessionRegistry`].
//!
//! Thin, mirroring `config_store/commands.rs`: lock the managed registry, delegate to
//! the pure-ish registry methods, and map [`CcError`](super::CcError) → `String` so
//! errors cross the IPC boundary (Tauri requires command errors to be `Serialize`).
//!
//! Input bytes cross the boundary as **base64 strings** (the same encoding the
//! `cc-output-<sid>` event uses) — xterm `onData` data is base64-encoded on the
//! frontend and decoded here, so arbitrary control bytes survive the JSON hop.

use std::sync::Mutex;

use base64::Engine as _;
use tauri::{AppHandle, State};

use super::SessionRegistry;

type Registry = Mutex<SessionRegistry>;

/// Spawn a CC session for `project_path`; returns the new session id.
#[tauri::command]
pub fn cc_spawn(
    app: AppHandle,
    registry: State<'_, Registry>,
    project_path: String,
) -> Result<String, String> {
    let mut reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.spawn(app, &project_path).map_err(|e| e.to_string())
}

/// Forward keystroke bytes (base64-encoded) to a session's PTY.
#[tauri::command]
pub fn cc_input(
    registry: State<'_, Registry>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("invalid base64 input: {e}"))?;
    let reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.input(&session_id, &bytes).map_err(|e| e.to_string())
}

/// Resize a session's PTY (fit-addon → SIGWINCH → CC redraw).
#[tauri::command]
pub fn cc_resize(
    registry: State<'_, Registry>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.resize(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

/// Terminate a session (`/exit\r`, then SIGKILL fallback) and drop it.
#[tauri::command]
pub fn cc_kill(registry: State<'_, Registry>, session_id: String) -> Result<(), String> {
    let mut reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.kill(&session_id).map_err(|e| e.to_string())
}
