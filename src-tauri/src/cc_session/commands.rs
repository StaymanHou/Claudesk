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
use tauri::{AppHandle, Emitter, State};

use super::{CcPermissionMode, SessionRegistry};

type Registry = Mutex<SessionRegistry>;

/// The Tauri event name broadcast when the CC permission mode changes. The View-menu's
/// mode `CheckMenuItem`s (re-checked in `lib.rs`) + the picker dropdown + App.tsx's mode
/// ref listen for it so every affordance reflects the persisted value (the single source
/// of truth). Mirrors `pip::commands::PIP_MODE_EVENT`.
pub const CC_PERMISSION_MODE_EVENT: &str = "cc-permission-mode";

use crate::config_store::commands::resolve_data_dir;

/// Read the persisted CC permission mode (default [`CcPermissionMode::Default`]). The
/// picker dropdown + App.tsx mode ref + the View-menu mode items seed from this on mount.
#[tauri::command]
pub fn cc_get_permission_mode(app: AppHandle) -> Result<CcPermissionMode, String> {
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::read_cc_permission_mode(&dir).map_err(|e| e.to_string())
}

/// Set the CC permission mode (the friend-requested dropdown). Persists it + broadcasts
/// `cc-permission-mode` so the View-menu items + picker dropdown re-render. The mode is an
/// argv chosen once per CC process, so this takes effect on the NEXT `cc_spawn`, not any
/// already-running session. Mirrors `pip::commands::pip_set_mode` (minus the panel
/// side-effect — there is none).
#[tauri::command]
pub fn cc_set_permission_mode(app: AppHandle, mode: CcPermissionMode) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::write_cc_permission_mode(&dir, mode)
        .map_err(|e| e.to_string())?;
    // Broadcast so the View-menu CheckMenuItems (and the picker dropdown) re-render.
    let _ = app.emit(CC_PERMISSION_MODE_EVENT, mode);
    Ok(())
}

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

/// Spawn the WP9 second-terminal panel's interactive login shell for `project_path`;
/// returns the new session id. Reuses the shared registry + the command-agnostic
/// `cc_input`/`cc_resize`/`cc_kill` + the `cc-output-<sid>`/`cc-exit-<sid>` events,
/// so the frontend `TerminalPane` differs from `XtermPane` only in calling this
/// command instead of `cc_spawn`.
#[tauri::command]
pub fn term_spawn(
    app: AppHandle,
    registry: State<'_, Registry>,
    project_path: String,
) -> Result<String, String> {
    let mut reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.spawn_shell(app, &project_path)
        .map_err(|e| e.to_string())
}

/// Forward keystroke bytes (base64-encoded) to a session's PTY.
#[tauri::command]
pub fn cc_input(
    app: AppHandle,
    registry: State<'_, Registry>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("invalid base64 input: {e}"))?;
    let byte_count = bytes.len();
    {
        let reg = registry
            .lock()
            .map_err(|_| "session registry lock poisoned".to_string())?;
        reg.input(&session_id, &bytes).map_err(|e| e.to_string())?;
    } // drop the registry lock before the (independent, gated) telemetry write.
      // M9 WP2.5 Phase 3: record keystroke ACTIVITY (byte count + attribution) — NEVER
      // the bytes. Best-effort + gated (zero-IO when tracking is OFF, the WP2 default);
      // a telemetry miss must not affect input delivery, which already succeeded above.
    crate::time_store::commands::record_keystroke_activity(&app, &session_id, byte_count);
    Ok(())
}

/// Signal that the frontend has attached its `cc-output-<sid>` listener and is ready to
/// receive output. Flushes the pre-subscription backlog + switches the session to live
/// streaming — closes the shell-prompt race (a shell's one-shot prompt is buffered until
/// this call instead of being emitted before any listener exists). Idempotent.
#[tauri::command]
pub fn cc_ready(registry: State<'_, Registry>, session_id: String) -> Result<(), String> {
    // ACCEPTED TRADEOFF (m2-wp9 MINOR #2): `reg.ready` → `mark_ready` flushes the backlog
    // while this holds the registry mutex, briefly serializing other session commands
    // behind the flush. Avoiding it would mean storing sessions as `Arc<dyn CcSession>`
    // (clone the Arc, drop the registry lock, then flush) — but `Registry` owns sessions
    // as `Box<dyn CcSession>` and `get()` borrows under the lock, so that's an ownership
    // migration across every command (insert/get/kill_all). The flush is microseconds (a
    // handful of startup chunks), so the migration's risk in this concurrency-critical
    // path isn't worth shaving a sub-millisecond serialization. Kept deliberately.
    let reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.ready(&session_id).map_err(|e| e.to_string())
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
pub fn cc_kill(
    app: AppHandle,
    registry: State<'_, Registry>,
    session_id: String,
) -> Result<(), String> {
    {
        let mut reg = registry
            .lock()
            .map_err(|_| "session registry lock poisoned".to_string())?;
        reg.kill(&session_id).map_err(|e| e.to_string())?;
    } // drop the registry lock before the (independent, gated) telemetry write.
      // M9 WP6.5 signal 1: record the explicit session-end marker for the closed session.
      // Best-effort + gated (zero-IO when tracking is OFF); a telemetry miss must not affect
      // the kill, which already succeeded above.
    crate::time_store::commands::record_workspace_close(&app, &session_id);
    Ok(())
}
