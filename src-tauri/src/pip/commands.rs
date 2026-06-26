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
    // Content is a bundled app route (`pip.html` via WebviewUrl::App — the React
    // status surface, a real Vite entry with live Tauri IPC), NOT a `data:` URL
    // (which rendered blank under the app CSP).
    let panel = PanelBuilder::<_, PipPanel>::new(&app, PANEL_LABEL)
        .url(WebviewUrl::App("pip.html".into()))
        .size(LogicalSize::new(260.0, 110.0).into())
        // Borderless + transparent at CREATION (before the webview attaches) — the
        // prerequisite that makes the NonactivatingPanel style mask below crash-free
        // (the setStyleMask: NSRangeException is the Titled→borderless transition;
        // a born-borderless window has no such transition). This is the exact build
        // the operator verified live at WP1 verify-human (focus #4 + teardown +
        // no-crash all PASS). Trade-off: no native titlebar ⇒ not drag-by-bar; the
        // robust drag UX is a web-side `data-tauri-drag-region` handle.
        .with_window(|wb| wb.decorations(false).transparent(true).skip_taskbar(true))
        // NonactivatingPanel — THE lever that stops a click from activating Claudesk
        // (verify-human #4); crash-free because the window is borderless-at-creation.
        .style_mask(StyleMask::new().borderless().nonactivating_panel())
        // Best-effort drag-by-background (borderless has no titlebar to grab). Note:
        // did NOT visibly enable body-drag at WP1 verify-human — the robust fix is a
        // web-side `data-tauri-drag-region` handle in the PiP frontend.
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
