//! M5 — PiP NSPanel window-mechanics commands. See `mod.rs`.
//!
//! `pip_toggle` builds (once) and then shows/hides the NSPanel with the exact M5
//! PiP window contract: non-activating, floating, all-Spaces, over-fullscreen,
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

use super::layout::PipLayout;

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
/// via AppKit `setFrameOrigin:` (the same raw-msg_send path `set_content_size` uses safely —
/// a frame change, NOT a style-mask transition). NSWindow frame origin is BOTTOM-LEFT with
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

/// Toggle the always-on-top PiP NSPanel.
///
/// First call builds the panel (non-activating / floating / all-Spaces /
/// over-fullscreen / stationary) and orders it front without activating
/// Claudesk; subsequent calls toggle its visibility. Returns the new
/// visibility (`true` = now showing) so the frontend button can reflect state.
#[tauri::command]
pub fn pip_toggle(app: AppHandle) -> Result<bool, String> {
    // Already built? → just toggle visibility.
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        if panel.is_visible() {
            panel.hide();
            let _ = app.emit(PIP_VISIBILITY_EVENT, false);
            return Ok(false);
        }
        // order_front_regardless shows the panel WITHOUT activating Claudesk —
        // the right "show" for a display-only PiP (vs. show_and_make_key, which
        // would steal focus).
        panel.order_front_regardless();
        let _ = app.emit(PIP_VISIBILITY_EVENT, true);
        return Ok(true);
    }

    // First call: build the panel. The MUST-FOLLOW constraints + their
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
    let panel = PanelBuilder::<_, PipPanel>::new(&app, PANEL_LABEL)
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
    }
}
