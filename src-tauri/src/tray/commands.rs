//! Runtime wiring for the M7 menu-bar tray item: build the `TrayIconBuilder` with the
//! neutral template glyph at launch, subscribe to the existing M3 `workspace-status`
//! broadcast, and swap the glyph lit↔neutral whenever the [`super::aggregate_alarm`] fold
//! changes.
//!
//! The pure reduction ([`super::aggregate_alarm`] + [`super::AlarmState`]) lives in the
//! parent; this module adds only the runtime-dependent pieces — the `AppHandle`-bound
//! tray build, the per-workspace state map, and the icon swap. Mirrors the `pip::commands`
//! split (pure decisions in the parent, the AppKit-bound ops here).
//!
//! ## Per-workspace state accumulation
//! The `workspace-status` event carries ONE workspace's [`WorkspaceStatusUpdate`] at a
//! time (the M3 design — see `status_broadcaster`). The tray therefore keeps the latest
//! state per `workspace_id` in [`TrayState::states`] and re-folds the whole map on every
//! event. A workspace that closes is dropped from the map via [`forget_workspace`] (wired
//! into `workspace_deregister`) — otherwise a workspace that was `AwaitingInput` when
//! closed would keep the alarm lit forever.
//!
//! ## Main-thread safety
//! The icon swap goes through Tauri's [`TrayIcon::set_icon_with_as_template`], which wraps
//! the AppKit op in `run_item_main_thread!` *internally* — so it is safe to call from the
//! `workspace-status` listener (which runs on Tauri's event thread) without a manual
//! `run_on_main_thread` hop (the M5 run-on-main-thread rule is satisfied by the API here,
//! unlike the raw NSPanel ops in `pip`). `set_icon_with_as_template` is also the
//! blink-free atomic setter — it sets the icon + template flag in one call, avoiding the
//! `tauri#6527` template-flag-reset flicker that a `set_icon` + `set_icon_as_template`
//! pair would cause (confirmed in the tauri 2.11.2 source doc comment).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::MenuBuilder;
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Listener, Manager};

use super::{aggregate_alarm, is_tray_menu_id, menu_ids, toggle_pip_mode, AlarmState};
use crate::status_broadcaster::commands::STATUS_EVENT;
use crate::status_broadcaster::{WorkspaceState, WorkspaceStatusUpdate};

/// The main Claudesk window label (matches the `WindowEvent` scoping in `lib.rs`).
const MAIN_WINDOW_LABEL: &str = "main";

/// The bundled template glyphs, embedded in the binary (no install-path file IO — robust
/// for the launchd-launched prod `.app`). Both are black-on-transparent PNGs used as macOS
/// template images: only the alpha/shape matters; the system tints them to the adaptive
/// menu-bar color. "Lit/attention" is conveyed by FORM (filled disc) vs "neutral" (hollow
/// ring), NOT by color — a template image cannot carry color.
const NEUTRAL_GLYPH: &[u8] = include_bytes!("../../icons/tray/neutral.png");
const ATTENTION_GLYPH: &[u8] = include_bytes!("../../icons/tray/attention.png");

/// A stable id for the tray icon (one per running identity — dev/prod isolation holds
/// because each identity is a separate process with its own tray).
const TRAY_ID: &str = "claudesk-tray";

/// Managed state for the tray: the built [`TrayIcon`] handle (so the listener can swap its
/// icon) plus the per-workspace latest-state map the alarm folds over. Registered via
/// `.manage(...)` in [`init_tray`].
pub struct TrayState {
    /// The live tray icon handle — `set_icon_with_as_template` is called on it to swap the
    /// glyph. `None` only if the tray failed to build (surfaced, never panicked).
    icon: Mutex<Option<TrayIcon>>,
    /// workspace_id → latest observed [`WorkspaceState`]. Updated on each `workspace-status`
    /// event; an entry removed on workspace close (`forget_workspace`).
    states: Mutex<HashMap<String, WorkspaceState>>,
    /// The last alarm state we applied to the glyph — so we only call the (AppKit) icon
    /// swap when the fold actually CHANGES, not on every event. Starts `Neutral` to match
    /// the initial neutral glyph built below.
    applied: Mutex<AlarmState>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            icon: Mutex::new(None),
            states: Mutex::new(HashMap::new()),
            applied: Mutex::new(AlarmState::Neutral),
        }
    }
}

/// Build the menu-bar tray icon (neutral glyph, template-mode) and subscribe to the
/// `workspace-status` broadcast so the glyph tracks the aggregate alarm live. Called once
/// from `.setup()`.
///
/// A build failure is surfaced (returned `Err`) rather than swallowed — the M3/M5 IPC-error
/// discipline — so the caller logs it; the app still runs, just without the menu-bar alarm.
/// The `TrayState` must already be managed (`.manage(TrayState::default())`) before this is
/// called so the listener can reach it.
pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    let neutral = Image::from_bytes(NEUTRAL_GLYPH)?;

    // WP2: the native actuator menu — Show Claudesk / Toggle PiP / Quit. Default
    // click-to-show (we do NOT set show_menu_on_left_click(false) — there's no popover to
    // free the left click for). Show/Toggle are custom items handled BACKEND-side via the
    // app-level on_menu_event (which fires for tray menu events too — tauri 2.11.2); Quit
    // is a native PredefinedMenuItem. NO accelerators (the app_menu discipline: accelerators
    // steal webview keystrokes).
    let menu = MenuBuilder::new(app)
        .text(menu_ids::SHOW_CLAUDESK, "Show Claudesk")
        .text(menu_ids::TOGGLE_PIP, "Toggle PiP")
        .separator()
        .quit()
        .build()?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(neutral)
        .icon_as_template(true)
        .menu(&menu)
        .build(app)?;

    // Stash the handle so the listener can swap the icon.
    if let Some(state) = app.try_state::<TrayState>() {
        *state.icon.lock().unwrap_or_else(|p| p.into_inner()) = Some(tray);
    }

    // Subscribe to the single status broadcast every surface consumes. Each event is ONE
    // workspace's update; we fold the accumulated map and swap the glyph on a change.
    let listen_handle = app.clone();
    app.listen(STATUS_EVENT, move |event| {
        match serde_json::from_str::<WorkspaceStatusUpdate>(event.payload()) {
            Ok(update) => apply_update(&listen_handle, update),
            Err(e) => eprintln!(
                "[claudesk] tray: could not parse workspace-status payload {:?}: {e}",
                event.payload()
            ),
        }
    });

    Ok(())
}

/// Handle a tray actuator-menu click (WP2). Called from the app-level `on_menu_event` in
/// `lib.rs` (which fires for tray menu events too — tauri 2.11.2). Returns `true` if the id
/// was a tray actuator we consumed, `false` otherwise (so the caller falls through to the
/// `app_menu` bridge for the app menu's own ids). These run BACKEND-side — the operator may
/// click the tray while the main window is hidden / the webview is unresponsive, so Show and
/// Toggle must not route through the frontend. `on_menu_event` runs on the main thread, so the
/// window ops + the (main-thread-marshaled) PiP path are safe to call synchronously here.
pub fn handle_tray_menu_event(app: &AppHandle, id: &str) -> bool {
    // The pure `is_tray_menu_id` predicate is the routing contract (unit-tested); this
    // match dispatches the recognized ids to their backend action.
    if !is_tray_menu_id(id) {
        return false;
    }
    match id {
        menu_ids::SHOW_CLAUDESK => show_main_window(app),
        menu_ids::TOGGLE_PIP => toggle_pip(app),
        _ => return false, // unreachable given the predicate, but keeps the match total
    }
    true
}

/// Bring the main Claudesk window forward: unminimize if needed, show, and focus. Each step
/// is best-effort + surfaced (never swallowed — the IPC-error discipline); a hidden/minimized
/// window is exactly the case this actuator exists for.
fn show_main_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        eprintln!("[claudesk] tray: main window not found for Show Claudesk");
        return;
    };
    // unminimize is a no-op if not minimized, but guard the read defensively.
    if win.is_minimized().unwrap_or(false) {
        if let Err(e) = win.unminimize() {
            eprintln!("[claudesk] tray: unminimize failed: {e}");
        }
    }
    if let Err(e) = win.show() {
        eprintln!("[claudesk] tray: show failed: {e}");
    }
    if let Err(e) = win.set_focus() {
        eprintln!("[claudesk] tray: set_focus failed: {e}");
    }
}

/// Flip the PiP mode via the pure [`toggle_pip_mode`] decision, then apply it through the
/// existing `pip_set_mode` path (so the `pip-mode` broadcast + View-menu radio stay coherent —
/// the single source of truth). Reads the current mode first; a read failure falls back to the
/// default so the toggle still does something sensible.
fn toggle_pip(app: &AppHandle) {
    let current = crate::pip::commands::pip_get_mode(app.clone()).unwrap_or_default();
    let next = toggle_pip_mode(current);
    if let Err(e) = crate::pip::commands::pip_set_mode(app.clone(), next) {
        eprintln!("[claudesk] tray: toggle PiP (pip_set_mode {next:?}) failed: {e}");
    }
}

/// Record one workspace's new state and reconcile the glyph. Pulled out of the listener so
/// the map-update + fold + swap path reads top-to-bottom and is callable from tests' shape.
fn apply_update(app: &AppHandle, update: WorkspaceStatusUpdate) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    {
        let mut states = state.states.lock().unwrap_or_else(|p| p.into_inner());
        states.insert(update.workspace_id, update.state);
    } // drop the states lock before the (AppKit) icon swap.
    reconcile(&state);
}

/// Drop a closed workspace from the alarm map and reconcile the glyph (wired into
/// `workspace_deregister`). Without this, a workspace that was `AwaitingInput` at close
/// would keep the alarm lit forever. A workspace_id not present is a no-op.
pub fn forget_workspace(app: &AppHandle, workspace_id: &str) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    {
        let mut states = state.states.lock().unwrap_or_else(|p| p.into_inner());
        states.remove(workspace_id);
    }
    reconcile(&state);
}

/// Fold the accumulated per-workspace states to the 2-state alarm and, IF it changed since
/// the last applied value, swap the tray glyph (blink-free atomic setter). The change-guard
/// keeps us off the AppKit path on every no-op event (most events don't flip the alarm).
fn reconcile(state: &TrayState) {
    let alarm = {
        let states = state.states.lock().unwrap_or_else(|p| p.into_inner());
        let snapshot: Vec<WorkspaceState> = states.values().copied().collect();
        aggregate_alarm(&snapshot)
    };

    {
        let mut applied = state.applied.lock().unwrap_or_else(|p| p.into_inner());
        if *applied == alarm {
            return; // no change — don't touch the icon.
        }
        *applied = alarm;
    }

    // Swap to the glyph for the new alarm state. set_icon_with_as_template is the
    // blink-free atomic setter AND marshals to the main thread internally.
    let glyph = match alarm {
        AlarmState::Attention => ATTENTION_GLYPH,
        AlarmState::Neutral => NEUTRAL_GLYPH,
    };
    let image = match Image::from_bytes(glyph) {
        Ok(img) => img,
        Err(e) => {
            eprintln!("[claudesk] tray: failed to decode glyph: {e}");
            return;
        }
    };
    let icon = state.icon.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(tray) = icon.as_ref() {
        if let Err(e) = tray.set_icon_with_as_template(Some(image), true) {
            eprintln!("[claudesk] tray: set_icon failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    // The runtime path here (init_tray / apply_update / reconcile) is AppHandle- and
    // AppKit-bound, so it needs a live Tauri app — exercised by the MCP-bridge verify-self
    // (drive a status transition on a scratch workspace, confirm the swap doesn't abort the
    // process) and operator-carried for the native glyph color (DEFERRED-TO-RELEASE). The
    // bulk of the LOGIC — the lit/neutral reduction — is the pure `aggregate_alarm` fold
    // unit-tested in the parent `mod.rs`. The glyph PNGs are embedded via include_bytes!, so
    // a decode test confirms they're valid (and the feature flags are wired) without an app.
    use tauri::image::Image;

    #[test]
    fn embedded_glyphs_decode() {
        // Confirms image-png is enabled + the two bundled glyphs are valid PNGs (the swap
        // path's Image::from_bytes will succeed at runtime).
        assert!(Image::from_bytes(super::NEUTRAL_GLYPH).is_ok());
        assert!(Image::from_bytes(super::ATTENTION_GLYPH).is_ok());
    }
}
