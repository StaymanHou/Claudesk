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

use super::{CcPermissionMode, OpenIntent, SessionRegistry};

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

/// Resolve the optional wire `intent` into the enum [`SessionRegistry::spawn`] requires.
///
/// ⚠️ **Extracted as a named function so the translation is testable as a VALUE.** The inline
/// `intent.unwrap_or_default()` it replaces could only be asserted by unwrapping a literal in the
/// test — which clippy correctly flags as `unnecessary_literal_unwrap`, because such a test
/// exercises the literal rather than the code. That is the same vacuity this phase already had to
/// fix once in TypeScript (`expect(null).toBeNull()`), and clippy caught this instance.
///
/// An absent value means **Fire**, preserving every pre-M12 caller's behavior; see
/// [`OpenIntent::default`] for why the opposite default would be a silent feature-killer.
fn resolve_open_intent(intent: Option<OpenIntent>) -> OpenIntent {
    intent.unwrap_or_default()
}

/// Spawn a CC session for `project_path`; returns the new session id.
///
/// `intent` (M12 WP3 P4.6) is which picker door opened the workspace. It is **optional on the
/// wire and defaults to `Fire`**, so every pre-existing caller keeps its behavior; the `⏵`
/// no-fire door passes `"no-fire"` and gets neither `--continue` nor a consumed flag.
///
/// ⚠️ **This parameter is the whole fix for a shipped defect.** Without it the frontend's no-fire
/// decision stopped at the IPC boundary and the `⏵` door resumed anyway — the frontend was
/// correct and mutation-proven, and the argv arm simply never saw it.
#[tauri::command]
pub fn cc_spawn(
    app: AppHandle,
    registry: State<'_, Registry>,
    project_path: String,
    intent: Option<OpenIntent>,
) -> Result<String, String> {
    let mut reg = registry
        .lock()
        .map_err(|_| "session registry lock poisoned".to_string())?;
    reg.spawn(app, &project_path, resolve_open_intent(intent))
        .map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    // M12 WP3 Phase 4 verify-codify — THE IPC BOUNDARY.
    //
    // ⚠️ WHY THESE ARE AT THE COMMAND LAYER AND NOT (ONLY) IN `mod.rs`.
    // P4.6 fixed a shipped defect whose whole character was that a decision computed on the
    // FRONTEND side of this boundary never reached the backend: the `⏵` no-fire door resumed a
    // conversation the user had explicitly declined, while `actionForIntent(argv,"no-fire")`
    // was mutation-proven and green in TypeScript the entire time. `Registry::spawn`'s own
    // tests are also green either way, because they take `intent` as a parameter and so assume
    // the very thing that was broken — that it arrives.
    //
    // This module is the seam that translates an ABSENT-or-PRESENT wire value into the enum
    // `spawn` receives. Nothing tested that translation until now; `commands.rs` had zero
    // tests. The standing lesson from P4.6: **test the boundary, not the pure function.**

    // ⚠️ These drive the REAL `resolve_open_intent`, not an inline unwrap of a literal.
    // The first draft asserted `Some(NoFire).unwrap_or_default()` directly, which clippy rejected
    // as `unnecessary_literal_unwrap` — and clippy was right for the reason that matters here:
    // unwrapping a literal tests the literal, so those assertions would have passed even if
    // `cc_spawn` stopped calling the translation entirely. Extracting the function is what makes
    // them real. (Same vacuity this phase fixed once already in TypeScript.)

    #[test]
    fn an_absent_wire_intent_becomes_fire_at_the_command_layer() {
        // `None` is what Tauri hands us when the frontend omits `intent` — every pre-M12 caller
        // — and it must mean "behave as before", i.e. resume when the flag is set.
        assert_eq!(resolve_open_intent(None), OpenIntent::Fire);
    }

    #[test]
    fn an_explicit_no_fire_survives_the_command_layer() {
        // ⚠️ THE REGRESSION THIS PINS. A `Some(NoFire)` that arrives as `Fire` IS the shipped
        // defect, reproduced — the `⏵` door resuming a conversation the user declined.
        assert_eq!(
            resolve_open_intent(Some(OpenIntent::NoFire)),
            OpenIntent::NoFire
        );
    }

    #[test]
    fn an_explicit_fire_survives_the_command_layer() {
        assert_eq!(
            resolve_open_intent(Some(OpenIntent::Fire)),
            OpenIntent::Fire
        );
    }

    #[test]
    fn cc_spawn_forwards_the_intent_rather_than_discarding_it() {
        // Source-position guard, narrow and deliberate: `cc_spawn` needs a live `AppHandle` and
        // spawns a real `claude`, so it cannot be called from a unit test. What CAN be asserted
        // is that the parameter reaches `reg.spawn(...)` — the defect's shape was a parameter
        // that existed and went nowhere, which every value-level test above would still pass.
        //
        // Comments are stripped first so this prose cannot satisfy the assertion on the code's
        // behalf (`[[raw-guard-identifier-satisfied-by-own-comments]]`, hit 3× in this repo).
        let src = include_str!("commands.rs");
        let body = src
            .split("pub fn cc_spawn(")
            .nth(1)
            .expect("cc_spawn must exist");
        let body = &body[..body.find("\n}\n").expect("cc_spawn must terminate")];
        let code: String = body
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        assert!(
            code.contains("resolve_open_intent(intent)"),
            "cc_spawn must forward the wire intent to the registry; found:\n{code}"
        );
        // And it must NOT hardcode a door — the mutation that passed a fully green suite one
        // layer up in the frontend was exactly this shape.
        assert!(
            !code.contains("OpenIntent::Fire") && !code.contains("OpenIntent::NoFire"),
            "cc_spawn must not hardcode an intent variant; found:\n{code}"
        );
    }
}
