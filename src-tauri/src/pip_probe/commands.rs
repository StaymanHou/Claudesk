//! M5 WP1 probe commands — THROWAWAY. See `mod.rs`.
//!
//! `pip_probe_toggle` builds (once) and then shows/hides a bare NSPanel with the
//! exact M5 PiP window contract: non-activating, floating, all-Spaces,
//! over-fullscreen, stationary. The panel's content is a bundled app route
//! (`public/pip-probe.html`) — content is NOT the probe's concern; window
//! mechanics are.
//!
//! Non-activation comes from the `NonactivatingPanel` STYLE MASK, set safely
//! because the window is borderless+transparent at creation (the Titled→borderless
//! `setStyleMask:` transition is what crashes; a born-borderless window does not).
//! NOT `.no_activate(true)` (global-policy flip that hid the main window). The
//! borderless panel has no close (X) button — closing the live panel is a UAF
//! abort; it's dismissed via the "PiP?" toggle + torn down via `to_window()`→
//! `close()` on main-window close (`teardown()`). Drag-by-body deferred to WP3.
//! See the build() body + `teardown()` for the full why (tauri-nspanel #19/#22).

// `Manager` is required in scope by the `tauri_panel!` macro expansion (it calls
// `.app_handle()` on the window).
use tauri::{AppHandle, LogicalSize, Manager, WebviewUrl};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
};

// Define a minimal custom NSPanel class. The `tauri_panel!` macro emits the
// objc2 class + a `FromWindow` impl so `PanelBuilder::<_, PipProbePanel>` can
// construct it. These are CLASS-LEVEL bool-method overrides baked in at
// define_class! time (NOT post-build setters), so none risks a crash:
//   - `can_become_key_window:false` / `can_become_main_window:false` — never
//     takes key/main status.
//   - `is_floating_panel:true` — floats above normal windows.
//   - `hides_on_deactivate:false` — stays visible when Claudesk deactivates
//     (a backgrounded PiP must NOT vanish — verify-human #5).
tauri_panel! {
    panel!(PipProbePanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

const PANEL_LABEL: &str = "pip-probe";

/// THROWAWAY M5 WP1 probe: toggle a bare always-on-top NSPanel.
///
/// First call builds the panel (non-activating / floating / all-Spaces /
/// over-fullscreen / stationary) and orders it front without activating
/// Claudesk; subsequent calls toggle its visibility. Returns the new
/// visibility (`true` = now showing) so the frontend button can reflect state.
#[tauri::command]
pub fn pip_probe_toggle(app: AppHandle) -> Result<bool, String> {
    // Already built? → just toggle visibility.
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        if panel.is_visible() {
            panel.hide();
            return Ok(false);
        }
        // order_front_regardless shows the panel WITHOUT activating Claudesk —
        // the right "show" for a display-only PiP (vs. show_and_make_key, which
        // would steal focus).
        panel.order_front_regardless();
        return Ok(true);
    }

    // First call: build the panel. The WP3 design constraints + their
    // resolutions (verify-human 2026-06-25, confirmed against tauri-nspanel
    // issues #19/#22 + the maintainer's menubar example — see docs/product/wbs.md
    // "Probe outcomes"):
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
    // Content is a bundled app route (`public/pip-probe.html` via WebviewUrl::App),
    // NOT a `data:` URL (which rendered blank under the app CSP).
    let panel = PanelBuilder::<_, PipProbePanel>::new(&app, PANEL_LABEL)
        .url(WebviewUrl::App("pip-probe.html".into()))
        .size(LogicalSize::new(260.0, 110.0).into())
        // Borderless + transparent at CREATION (before the webview attaches) — the
        // prerequisite that makes the NonactivatingPanel style mask below crash-free
        // (the setStyleMask: NSRangeException is the Titled→borderless transition;
        // a born-borderless window has no such transition). This is the exact build
        // the operator verified live at WP1 verify-human (focus #4 + teardown +
        // no-crash all PASS). Trade-off: no native titlebar ⇒ not drag-by-bar; that
        // chrome/drag UX is deferred to WP3 (operator decision 2026-06-25).
        .with_window(|wb| wb.decorations(false).transparent(true).skip_taskbar(true))
        // NonactivatingPanel — THE lever that stops a click from activating Claudesk
        // (verify-human #4); crash-free because the window is borderless-at-creation.
        .style_mask(StyleMask::new().borderless().nonactivating_panel())
        // Best-effort drag-by-background (borderless has no titlebar to grab). Note:
        // did NOT visibly enable body-drag at verify-human — the robust fix is a
        // web-side `data-tauri-drag-region`, deferred to WP3.
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
        .map_err(|e| format!("pip probe panel build: {e}"))?;

    // Show without activating Claudesk.
    panel.order_front_regardless();
    Ok(true)
}

/// THROWAWAY M5 WP1: tear down the probe panel on main-window close so the
/// all-Spaces/floating panel does not orphan on screen. The ONLY safe close
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
