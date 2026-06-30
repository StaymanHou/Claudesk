//! M5 — PiP NSPanel window-mechanics commands. See `mod.rs`.
//!
//! [`pip_set_mode`] is the single user-facing control; [`pip_set_visible`] builds
//! (once) and then shows/hides the NSPanel with the exact M5 PiP window contract:
//! non-activating, floating, all-Spaces, over-fullscreen,
//! stationary. The panel's content is a bundled app route (`pip.html` — the React
//! status surface); content is the frontend's concern, window mechanics are this
//! module's.
//!
//! Non-activation comes from the `NonactivatingPanel` STYLE MASK, set safely
//! because the window is borderless+transparent at creation (the Titled→borderless
//! `setStyleMask:` transition is what crashes; a born-borderless window does not).
//! NOT `.no_activate(true)` (global-policy flip that hid the main window). The
//! borderless panel has no close (X) button — closing the live panel is a UAF
//! abort; it's dismissed via the toggle + torn down via `to_window()`→`close()` on
//! main-window close (`teardown()`). Robust drag-by-body is a web-side
//! `data-tauri-drag-region` handle (frontend), not a window flag.
//! See the build() body + `teardown()` for the full why (tauri-nspanel #19/#22).

// `Manager` is required in scope by the `tauri_panel!` macro expansion (it calls
// `.app_handle()` on the window). `Emitter` is needed for `app.emit` (the
// pip-visibility broadcast).
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
};

use super::layout::{PipLayout, PipMode};
use super::{on_mode_should_show, should_arm_summon, should_auto_dismiss, PipAutoStateLock};
use crate::status_broadcaster::SharedRegistry;

/// Read the number of currently-open workspaces from the managed [`SharedRegistry`]
/// (M6 WP9). An absent or poisoned registry → `0`, the SAFE default: the auto-summon
/// guard treats `0` as "nothing to mirror → don't summon," so a transient lock failure
/// errs toward NOT showing an empty PiP rather than showing one. The registry's
/// `by_path` IS the open-workspace set (`workspace_register`/`deregister` keep it in
/// sync with the workspace list), so its length is the count we want.
fn open_workspace_count(app: &AppHandle) -> usize {
    app.try_state::<SharedRegistry>()
        .and_then(|reg| reg.lock().ok().map(|r| r.len()))
        .unwrap_or(0)
}

/// M6 WP9 Phase 2 — reconcile the `On` (pinned) PiP panel's visibility against the current
/// open-workspace count: shown when ≥1 workspace is open, hidden when the count returns to 0
/// ("no PiP when there's nothing to mirror," operator vh.4 — extended from `Auto` to `On`).
/// In `Auto`/`Off` this is a no-op (the focus handler drives `Auto`; `Off` is hidden by
/// choice). Called after every workspace register/deregister and from `pip_set_mode` so the
/// pinned panel never shows empty and appears as soon as the first workspace opens.
///
/// MUST be called from a main-thread context (a Tauri `#[command]` body) — `pip_set_visible`
/// does AppKit window work (`PanelBuilder::build` / `order_front_regardless` / `hide`) that
/// aborts off the main thread (CLAUDE.md main-thread-marshal rule). All current callers
/// (`workspace_register`, `workspace_deregister`, `pip_set_mode`) are command bodies, which
/// Tauri runs on the main thread — so no marshaling is needed here. If a future
/// background-thread caller is added, it MUST `run_on_main_thread` around this call.
fn reconcile_on_mode_visibility(app: &AppHandle, open_count: usize) {
    let mode = resolve_data_dir(app)
        .ok()
        .and_then(|dir| crate::config_store::settings::read_pip_mode(&dir).ok())
        .unwrap_or_default();
    if let Some(show) = on_mode_should_show(mode, open_count) {
        let _ = pip_set_visible(app, show);
    }
}

/// Public entry the status-broadcaster's register/deregister commands call after a registry
/// mutation, passing the post-mutation open-workspace count. Thin wrapper over
/// [`reconcile_on_mode_visibility`] so the cross-module call site reads intentionally.
pub fn reconcile_pip_for_workspace_count(app: &AppHandle, open_count: usize) {
    reconcile_on_mode_visibility(app, open_count);
}

// Define a minimal custom NSPanel class. The `tauri_panel!` macro emits the
// objc2 class + a `FromWindow` impl so `PanelBuilder::<_, PipPanel>` can
// construct it. These are CLASS-LEVEL bool-method overrides baked in at
// define_class! time (NOT post-build setters), so none risks a crash:
//   - `can_become_key_window:false` / `can_become_main_window:false` — never
//     takes key/main status.
//   - `is_floating_panel:true` — floats above normal windows.
//   - `hides_on_deactivate:false` — stays visible when Claudesk deactivates
//     (a backgrounded PiP must NOT vanish — verify-human #5).
tauri_panel! {
    panel!(PipPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

/// The PiP NSPanel's window label. Frontend `pip-frame`/status forwarding targets
/// this label; the `windowId:'pip'` MCP-bridge verify-self path also keys on it.
pub const PANEL_LABEL: &str = "pip";

/// Event broadcast (all webviews) on every toggle carrying the new visibility (bool).
/// The main webview listens so it knows whether to run the PiP live-mirror emit (the
/// cost gate — a hidden PiP pays no serialize/emit). The backend owns panel
/// visibility, so this is the single source of truth — not a frontend guess.
pub const PIP_VISIBILITY_EVENT: &str = "pip-visibility";

/// Event broadcast (all webviews) carrying the active PiP layout (kebab-case string,
/// matching `PipLayout`'s serde). The PiP webview re-renders in the new layout; the
/// main webview's mirror ticker reads it to gate the serialize cost (compact/minimal
/// pay nothing). Backend-owned (it persists + resizes too), so the single source of
/// truth — mirrors `src/pip/pipLayout.ts` PIP_LAYOUT_EVENT.
pub const PIP_LAYOUT_EVENT: &str = "pip-layout";

/// Event broadcast (all webviews) carrying the active PiP MODE (kebab string `off`/`on`/
/// `auto`, matching `PipMode`'s serde). Emitted by `pip_set_mode`; the RightPanelHost icon
/// button + the View-menu radio listen so the displayed state always matches the backend's
/// (the single source of truth — not a frontend guess). WP5 Phase 2 rework.
pub const PIP_MODE_EVENT: &str = "pip-mode";

/// Resolve `~/Library/Application Support/<identifier>/` and ensure it exists. Mirrors
/// `config_store::commands::resolve_data_dir` (kept module-local — that one is private).
fn resolve_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Read the persisted PiP layout (default = horizontal mirror on first run). The PiP
/// webview queries this on mount to seed its layout to the persisted value rather than
/// always starting on the default.
#[tauri::command]
pub fn pip_get_layout(app: AppHandle) -> Result<PipLayout, String> {
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::read_pip_layout(&dir).map_err(|e| e.to_string())
}

/// Persist the chosen PiP layout and broadcast it to all webviews (`pip-layout`).
/// Called by the on-panel switcher. The PiP re-renders from the broadcast (NOT
/// optimistically), and the main webview's ticker reads it for the serialize cost gate.
///
/// The panel is NOT resized here. WP4 Phase-3 sizing is CONTENT-DRIVEN — the panel size
/// is a function of the layout AND the live workspace count (operator model 2026-06-26),
/// so it's computed in the PiP webview (which has the roster + screen) and applied via
/// `pip_resize`. The PiP recomputes + calls `pip_resize` when it receives this `pip-layout`
/// broadcast (and on roster change), so the resize follows the broadcast.
#[tauri::command]
pub fn pip_set_layout(app: AppHandle, layout: PipLayout) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::write_pip_layout(&dir, layout).map_err(|e| e.to_string())?;
    // Broadcast to every webview (PiP + main). The PiP re-renders + recomputes its size;
    // the main ticker gates its serialize on it. Best-effort — a persist that succeeded is
    // the durable state of record even if the emit somehow fails.
    let _ = app.emit(PIP_LAYOUT_EVENT, layout);
    Ok(())
}

/// Resize the live PiP panel to a content-driven size the PiP webview computed (from its
/// layout + workspace count + screen, via `computePanelSize` — capped to ~90% screen with
/// wrap). The webview owns the size math because it owns the roster + screen; this command
/// just applies it. `set_content_size` (AppKit `setContentSize:`) is safe on the live
/// borderless panel — a content-frame change, NOT the Titled→borderless style-mask
/// transition that crashes (WP1). No-op if the panel isn't built yet.
#[tauri::command]
pub fn pip_resize(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        // Guard against a degenerate size that would collapse the panel.
        let w = width.max(1.0);
        let h = height.max(1.0);
        panel.set_content_size(w, h);
    }
    Ok(())
}

/// Move the live PiP panel by a screen-space delta (WP4 Phase 5 drag fix). The PiP webview
/// tracks the pointer during a body drag and calls this with each frame's (dx, dy) in
/// CSS/screen pixels (y-DOWN). We can't use Tauri's window-move path (setPosition /
/// data-tauri-drag-region → startDragging) — it's INERT on the swizzled NSPanel (confirmed
/// 2026-06-26: setPosition no-ops). And we can't drop `.borderless()` to get AppKit's own
/// `movableByWindowBackground` drag — that re-triggers the WP1 setStyleMask: NSRangeException
/// (also confirmed 2026-06-26, crash on PanelBuilder::build). So we move the panel directly
/// via AppKit `setFrameOrigin:` — a safe AppKit frame-mutation like `set_content_size`
/// (which is tauri-nspanel's wrapper over `setContentSize:`); here we send `setFrameOrigin:`
/// as a raw `msg_send!` directly. Both are frame changes, NOT a style-mask transition (the
/// crash class). NSWindow frame origin is BOTTOM-LEFT with
/// y measured UP from the screen bottom, so a webview dy (down-positive) maps to origin.y
/// MINUS dy. No-op if the panel isn't built. Best-effort — never returns an error to the UI.
#[tauri::command]
pub fn pip_move(app: AppHandle, dx: f64, dy: f64) -> Result<(), String> {
    use tauri_nspanel::objc2::msg_send;
    use tauri_nspanel::objc2_foundation::{NSPoint, NSRect};

    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        let ns_panel = panel.as_panel();
        unsafe {
            let frame: NSRect = msg_send![ns_panel, frame];
            // webview y is down-positive; AppKit origin y is up-positive → subtract dy.
            let new_origin = NSPoint::new(frame.origin.x + dx, frame.origin.y - dy);
            let _: () = msg_send![ns_panel, setFrameOrigin: new_origin];
        }
    }
    Ok(())
}

/// Read the persisted PiP mode (default `Auto`; WP5 Phase 2 rework). The icon button +
/// View-menu radio seed their current-state display from this on mount.
#[tauri::command]
pub fn pip_get_mode(app: AppHandle) -> Result<PipMode, String> {
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::read_pip_mode(&dir).map_err(|e| e.to_string())
}

/// Set the PiP mode — the SINGLE user-facing control for the panel (WP5 Phase 2 rework).
/// Persists the mode, applies its panel side-effect, cancels any pending auto-summon, and
/// broadcasts `pip-mode` so both surfaces (icon button + View-menu radio) reflect it.
///
/// Side-effect per mode:
///   - **Off**  → hide the panel.
///   - **On**   → show the panel, pinned (the focus handler will NOT auto-dismiss it).
///   - **Auto** → hide NOW (Auto's resting state while Claudesk is focused); the
///                `WindowEvent::Focused` handler drives summon-on-blur / dismiss-on-focus
///                from here on.
///
/// This replaced the old toggle + `manual_off`/`origin` bookkeeping: the regime is
/// the explicit mode, so there is no inferred state and no dead-end (you can select `Auto`
/// from any mode). Show/hide still routes through the single [`pip_set_visible`] path so
/// the `pip-visibility` broadcast + mirror-cost gate stay coherent.
#[tauri::command]
pub fn pip_set_mode(app: AppHandle, mode: PipMode) -> Result<(), String> {
    // Persist first (durable state of record even if a later step best-efforts).
    let dir = resolve_data_dir(&app)?;
    crate::config_store::settings::write_pip_mode(&dir, mode).map_err(|e| e.to_string())?;

    // Cancel any pending auto-summon debounce — the mode just changed under it.
    if let Some(lock) = app.try_state::<PipAutoStateLock>() {
        if let Ok(mut st) = lock.0.lock() {
            st.pending_summon_token = st.pending_summon_token.wrapping_add(1);
        }
    }

    // Apply the panel side-effect.
    //   - Off  → hide.
    //   - Auto → hide now (the focus handler summons on the next sustained blur).
    //   - On   → show ONLY if a workspace is open (WP9 Phase 2 — no empty pinned panel);
    //            if zero workspaces are open, stay hidden and let the first
    //            `workspace_register` reconcile it visible. `reconcile_on_mode_visibility`
    //            encodes exactly this (On → show iff count>0; Auto/Off → no-op), so for On
    //            we route through it; Auto/Off hide explicitly.
    match mode {
        PipMode::On => reconcile_on_mode_visibility(&app, open_workspace_count(&app)),
        PipMode::Auto | PipMode::Off => {
            pip_set_visible(&app, false)?;
        }
    }

    // Broadcast the new mode so the icon button + View-menu radio re-render.
    let _ = app.emit(PIP_MODE_EVENT, mode);
    Ok(())
}

/// Show or hide the PiP NSPanel, building it on first show. The SINGLE
/// show/hide path (WP5 P1.2): both the user control ([`pip_set_mode`]) and the
/// auto-summon/dismiss state machine (WP5 Phase 2) call this, so the
/// `pip-visibility` broadcast is emitted from exactly one place and never
/// drifts from the panel's real state. Returns the new visibility
/// (`true` = now showing). Idempotent-ish: hiding an unbuilt panel is a no-op
/// that returns `false` (nothing to build just to hide).
pub fn pip_set_visible(app: &AppHandle, show: bool) -> Result<bool, String> {
    // Already built? → show/hide it directly.
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        if show {
            // order_front_regardless shows the panel WITHOUT activating Claudesk —
            // the right "show" for a display-only PiP (vs. show_and_make_key, which
            // would steal focus).
            panel.order_front_regardless();
            let _ = app.emit(PIP_VISIBILITY_EVENT, true);
            return Ok(true);
        }
        panel.hide();
        let _ = app.emit(PIP_VISIBILITY_EVENT, false);
        return Ok(false);
    }

    // Not built. Hiding an unbuilt panel is a no-op (nothing on screen).
    if !show {
        return Ok(false);
    }

    // First show: build the panel. The MUST-FOLLOW constraints + their
    // resolutions (proven at M5 WP1 verify-human 2026-06-25, confirmed against
    // tauri-nspanel issues #19/#22 + the maintainer's menubar example — see the
    // archived WP1 "Probe outcomes"):
    //
    //  1. NO `.no_activate(true)` — it flips the WHOLE app's activation policy to
    //     Prohibited during build(), which hid the main Claudesk window. The
    //     non-activation we need is the NonactivatingPanel STYLE MASK (below).
    //
    //  2. The `setStyleMask:` NSRangeException crash happens ONLY on a
    //     Titled→borderless transition (AppKit detaches/reattaches the content
    //     view → WebKit WKWindowVisibilityObserver KVO teardown). The maintainer's
    //     documented fix (#19): create the window ALREADY borderless (+ transparent)
    //     via `.with_window(...)` BEFORE conversion — then the post-build
    //     `set_style_mask(borderless | nonactivating_panel)` is safe (no Titled
    //     transition to tear down). `can_become_key_window:false` ALONE did NOT
    //     stop click-activation (verify-human #4); the NonactivatingPanel bit is
    //     what actually does — and now it's crash-free because the window is
    //     borderless at creation.
    //
    //  3. Borderless ⇒ no titlebar to drag/close. `.movable_by_window_background`
    //     restores drag-anywhere; teardown is programmatic (the main-window
    //     CloseRequested handler in lib.rs goes panel.to_window()→close(), the
    //     ONLY safe close path — closing the live panel is a UAF abort, #22).
    //
    // WP4 Phase 3: the panel's REAL size is content-driven (layout × workspace count,
    // computed in the PiP webview) and applied via `pip_resize` immediately on the PiP's
    // mount. So we build at a small placeholder size; the webview resizes it to fit within
    // the first frame or two (no meaningful flash — the panel is non-activating + appears
    // off to the side). A fixed modest default avoids depending on the persisted layout here.
    let (init_w, init_h) = (220.0_f64, 130.0_f64);

    // Content is a bundled app route (`pip.html` via WebviewUrl::App — the React
    // status surface, a real Vite entry with live Tauri IPC), NOT a `data:` URL
    // (which rendered blank under the app CSP).
    let panel = PanelBuilder::<_, PipPanel>::new(app, PANEL_LABEL)
        .url(WebviewUrl::App("pip.html".into()))
        .size(LogicalSize::new(init_w, init_h).into())
        // Borderless + transparent at CREATION (before the webview attaches) — the
        // prerequisite that makes the NonactivatingPanel style mask below crash-free
        // (the setStyleMask: NSRangeException is the Titled→borderless transition;
        // a born-borderless window has no such transition). This is the exact build
        // the operator verified live at WP1 verify-human (focus #4 + teardown + no-crash).
        // NOTE (WP4 Phase 5): we TRIED dropping `.borderless()` (+ `.resizable()`) to match
        // the maintainer's draggable example — it CRASHED with the WP1 setStyleMask:
        // NSRangeException (confirmed 2026-06-26, PanelBuilder::build → set_style_mask).
        // `.borderless()` is load-bearing here; the drag is solved instead by a Rust-native
        // `pip_move` command (direct setFrameOrigin: msg_send, the same AppKit path that
        // set_content_size uses — the ONLY path that moves this swizzled panel) driven by
        // JS mouse-delta tracking, NOT by data-tauri-drag-region (inert on this panel).
        .with_window(|wb| wb.decorations(false).transparent(true).skip_taskbar(true))
        // NonactivatingPanel — THE lever that stops a click from activating Claudesk
        // (verify-human #4); crash-free because the window is borderless-at-creation.
        .style_mask(StyleMask::new().borderless().nonactivating_panel())
        // Best-effort drag-by-background (kept harmless; the real drag is pip_move below).
        .movable_by_window_background(true)
        // floats above normal windows.
        .level(PanelLevel::Floating)
        // visible on every Space + (over-fullscreen flag kept though #3 dropped
        // from the requirement) + pinned.
        .collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary(),
        )
        .has_shadow(true)
        .build()
        .map_err(|e| format!("pip panel build: {e}"))?;

    // Show without activating Claudesk.
    panel.order_front_regardless();
    let _ = app.emit(PIP_VISIBILITY_EVENT, true);
    Ok(true)
}

/// WP5 Phase 2 (rework) — the auto-summon/dismiss state machine, driven by the main
/// window's `WindowEvent::Focused(bool)` (wired in `lib.rs`). Acts ONLY in `Auto` mode;
/// `Off`/`On` are static (the focus handler leaves them alone — `Off` stays hidden, `On`
/// stays pinned). The regime is read fresh from the persisted `pip_mode` each event (the
/// explicit source of truth — no inferred origin/manual_off).
///
/// - **blur (`focused=false`)**: if `Auto`, no panel currently shown, AND at least one
///   workspace is open (WP9 — never summon an empty PiP), bump+capture a debounce token and
///   spawn a thread that, after `PIP_AUTO_SUMMON_DEBOUNCE_MS`, summons the panel ONLY if the
///   token still matches AND the mode is still `Auto` AND a workspace is still open (a
///   refocus, a mode change, or the last workspace closing in the meantime bumps the token /
///   fails the mode or count re-check → no-op).
/// - **focus (`focused=true`)**: cancel any pending summon (bump the token), and if mode
///   is `Auto`, dismiss the panel. (`On` stays pinned; `Off` has nothing shown.)
///
/// Q4c (verify-self, Phase 1): showing/hiding the non-activating PiP does NOT emit a
/// main-window `Focused` event, so there is NO summon→focus→dismiss loop and no
/// programmatic-show suppression guard is needed.
pub fn pip_on_main_focus_changed(app: &AppHandle, focused: bool) {
    let Some(lock) = app.try_state::<PipAutoStateLock>() else {
        return;
    };
    // The regime is the persisted mode (read fresh — the explicit source of truth).
    let mode = resolve_data_dir(app)
        .ok()
        .and_then(|dir| crate::config_store::settings::read_pip_mode(&dir).ok())
        .unwrap_or_default();

    if focused {
        // Returned to Claudesk: cancel any pending summon; in Auto, dismiss the panel.
        {
            let Ok(mut st) = lock.0.lock() else { return };
            st.pending_summon_token = st.pending_summon_token.wrapping_add(1);
        }
        if should_auto_dismiss(mode) {
            let _ = pip_set_visible(app, false);
        }
        return;
    }

    // Blurred: arm the debounce only in Auto + when nothing is currently shown + when at
    // least one workspace is open (WP9 — don't summon an empty PiP that mirrors nothing).
    let panel_visible = app
        .get_webview_panel(PANEL_LABEL)
        .map(|p| p.is_visible())
        .unwrap_or(false);
    if !should_arm_summon(mode, panel_visible, open_workspace_count(app)) {
        return;
    }
    let token = {
        let Ok(mut st) = lock.0.lock() else { return };
        st.pending_summon_token = st.pending_summon_token.wrapping_add(1);
        st.pending_summon_token
    };

    // Debounce: only summon if still un-cancelled after the delay. A plain thread +
    // sleep keeps the WAIT off any async runtime; the token check makes it cancel-safe.
    //
    // CRITICAL (verify-self, Phase 2 — PRESERVED across the rework): the actual show —
    // `pip_set_visible` → `PanelBuilder::build()` / `order_front_regardless` — is AppKit
    // window work that MUST run on the MAIN (UI) thread. Calling it directly on this
    // spawned thread aborts the process (a native AppKit main-thread-violation, no Rust
    // panic — the app self-exited ~3s after launch, exactly when this timer fired). So we
    // sleep off-thread (fine) then marshal the show onto the main thread.
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(
            super::PIP_AUTO_SUMMON_DEBOUNCE_MS,
        ));
        let Some(lock) = app.try_state::<PipAutoStateLock>() else {
            return;
        };
        // Token still matches (no refocus / mode change since we armed)?
        let token_ok = {
            let Ok(st) = lock.0.lock() else { return };
            st.pending_summon_token == token
        };
        if !token_ok {
            return;
        }
        // Marshal the AppKit show onto the main thread, re-checking BOTH the token and
        // the mode there (a refocus or a mode change could land between the off-thread
        // check and the main-thread dispatch).
        let app_main = app.clone();
        let _ = app.run_on_main_thread(move || {
            let Some(lock) = app_main.try_state::<PipAutoStateLock>() else {
                return;
            };
            let token_still_ok = {
                let Ok(st) = lock.0.lock() else { return };
                st.pending_summon_token == token
            };
            let still_auto = resolve_data_dir(&app_main)
                .ok()
                .and_then(|dir| crate::config_store::settings::read_pip_mode(&dir).ok())
                .map(|m| m == PipMode::Auto)
                .unwrap_or(false);
            // WP9: re-check the open-workspace count HERE too — a workspace could have been
            // closed during the 3s debounce, which must cancel the summon (symmetric with the
            // token + mode re-checks). Without this, blurring with one workspace open then
            // closing it inside the debounce window would still summon an empty PiP.
            let still_has_workspace = open_workspace_count(&app_main) > 0;
            if token_still_ok && still_auto && still_has_workspace {
                let _ = pip_set_visible(&app_main, true);
            }
        });
    });
}

/// Tear down the PiP panel on main-window close so the all-Spaces/floating
/// panel does not orphan on screen. The ONLY safe close
/// path: `to_window()` un-swizzles the NSPanel back to a plain NSWindow (and
/// sets `released_when_closed` safely) — THEN `.close()` the returned window.
/// Closing the live panel object directly is a use-after-free that aborts the
/// process with "Rust cannot catch foreign exceptions" (tauri-nspanel #22).
/// No-op if the panel was never built. Best-effort — never blocks shutdown.
pub fn teardown(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        if let Some(window) = panel.to_window() {
            let _ = window.close();
        }
        // WP5 P1.3 (folds in SURFACE-...-TEARDOWN-SKIPS-VISIBILITY-BROADCAST): the
        // panel is gone, so broadcast `pip-visibility false` like the hide path does.
        // Every subscriber (notably the main webview's mirror-cost gate) must learn
        // the PiP is down — without this, a teardown left the gate believing the PiP
        // was still up and the serialize/emit loop kept paying cost for a dead panel.
        let _ = app.emit(PIP_VISIBILITY_EVENT, false);
    }
}
