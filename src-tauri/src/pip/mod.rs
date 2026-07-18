//! M5 — Picture-in-Picture (PiP) NSPanel: the out-of-focus workspace-status surface.
//!
//! A small always-on-top floating panel the user can summon when the Claudesk
//! window is out of focus, mirroring the same status surface as the filmstrip.
//! Display-only in v1 (clicking a tile does NOT promote a workspace — vision
//! anti-goal). One window, many workspaces: the PiP is an auxiliary NSPanel, not a
//! second Claudesk window.
//!
//! This module owns the **window mechanics** — building the NSPanel with the exact
//! collection behavior the PiP needs and tearing it down safely. The panel's
//! content (the React status surface at `pip.html`) is the frontend's concern.
//!
//! The window contract below was proven viable by the M5 WP1 probe (VERDICT: GO —
//! see `docs/product/archive/.../wbs.md` "Probe outcomes → WP1"); WP3 builds the
//! real surface on it. Each behavior is verified, not assumed:
//!   - **non-activating** (a click never steals focus) → the `NonactivatingPanel`
//!     STYLE MASK on a born-borderless window. NOTE: do NOT use `.no_activate(true)`
//!     — it flips the global activation policy and hides the main window; the probe
//!     proved the style mask is the correct lever (see `commands.rs`).
//!   - `PanelLevel::Floating` → floats above normal windows.
//!   - `CollectionBehavior { can_join_all_spaces, stationary }` → visible on every
//!     Space, pinned. (`full_screen_auxiliary` is also set but over-fullscreen draw
//!     was DROPPED as a requirement — the flag is harmless, not a validated need.)

pub mod commands;
pub mod layout;

use std::sync::Mutex;

use layout::PipMode;

/// Auto-summon/dismiss runtime state, held in a Tauri-managed `Mutex` (WP5 Phase 2
/// rework). The REGIME is now the explicit `PipMode` (persisted in settings, read fresh
/// each focus event) — this struct holds only the transient debounce bookkeeping. (It no
/// longer tracks `origin`/`manual_off`: those were the inferred-regime model that created
/// the dead-end; the explicit mode replaces them.)
#[derive(Debug, Default)]
pub struct PipAutoState {
    /// A monotonically-increasing token for the pending auto-summon debounce. Each
    /// `Focused(false)` that arms a timer bumps this and captures it; the timer only
    /// fires if the token still matches when it elapses — so a `Focused(true)` that
    /// bumps it again (or any newer arm) cancels the stale pending summon.
    pub pending_summon_token: u64,

    /// M10.5 WP1 — has the operator placed the PiP panel this session? `false` until the
    /// operator drags it (`pip_move` sets this `true`). While `false`, `pip_resize`
    /// re-anchors the panel top-right after each content-driven resize (so it opens in the
    /// corner and follows layout/size changes); once `true`, the auto-anchor is suppressed so
    /// a re-summon keeps the panel where it was dragged. Defaults `false` on each app launch —
    /// drag position is deliberately NOT persisted (a fresh launch re-anchors top-right, the
    /// operator's stated preference), so an in-session flag is the whole mechanism.
    pub positioned: bool,
}

/// The managed wrapper Tauri stores (`.manage(PipAutoStateLock::default())`).
#[derive(Default)]
pub struct PipAutoStateLock(pub Mutex<PipAutoState>);

/// Debounce before a sustained main-window blur auto-summons the PiP (WP5 Phase 2, Q3).
/// Hard-coded (not a user knob) — a brief blur (⌘Tab to check something, focus stolen by
/// a CC-spawned browser) must NOT summon; only a sustained absence should. 3s is the
/// operator-confirmed feel from the scenario analysis (scenarios 1/2 vs 3/4).
pub const PIP_AUTO_SUMMON_DEBOUNCE_MS: u64 = 3000;

/// Pure decision: should a main-window blur arm an auto-summon timer? (WP5 Phase 2 rework;
/// `open_count` added M6 WP9)
/// True only in `Auto` mode AND when no panel is currently shown (don't re-summon what's
/// already up) AND when at least one workspace is open (`open_count > 0`). `Off`/`On` never
/// auto-summon (`Off` = hidden by choice; `On` = already pinned up). The `open_count` guard
/// (WP9) suppresses the empty PiP: at zero open workspaces the panel would mirror nothing,
/// so blurring must not summon it. Pure → unit-testable without a live app.
pub fn should_arm_summon(mode: PipMode, panel_visible: bool, open_count: usize) -> bool {
    mode == PipMode::Auto && !panel_visible && open_count > 0
}

/// Pure decision: on main-window refocus, should the shown panel be auto-dismissed?
/// (WP5 Phase 2 rework) True ONLY in `Auto` mode — an `On` panel is pinned (stays up), and
/// `Off` has nothing shown. This is the explicit-mode replacement for the old origin check.
pub fn should_auto_dismiss(mode: PipMode) -> bool {
    mode == PipMode::Auto
}

/// Pure decision (M6 WP9 Phase 2): for the `On` (pinned) mode, should the panel be VISIBLE
/// given the current open-workspace count? `Some(true)` = show, `Some(false)` = hide,
/// `None` = this reconcile does not apply to the mode (leave the panel as-is — `Auto` is
/// driven by the focus handler, `Off` is hidden by choice). `On` tracks the count: shown
/// when ≥1 workspace is open, hidden when the count returns to 0 — the "no PiP when there's
/// nothing to mirror" principle (operator vh.4, 2026-06-28) extended from `Auto` to `On`.
/// Pure → unit-testable without a live app.
pub fn on_mode_should_show(mode: PipMode, open_count: usize) -> Option<bool> {
    match mode {
        PipMode::On => Some(open_count > 0),
        PipMode::Auto | PipMode::Off => None,
    }
}

/// The inset (in points) from the screen's visible-frame top + right edges when the PiP panel
/// is auto-anchored on first summon (M10.5 WP1). The operator asked for a gap from the corner
/// rather than a flush anchor (confirmed "Top + right", 2026-07-18) so the panel doesn't crowd
/// the menu-bar / screen edge. Applied symmetrically to the top and right edges by
/// [`top_right_origin`]'s `margin` parameter.
pub const PIP_ANCHOR_MARGIN: f64 = 150.0;

/// Pure math (M10.5 WP1): the bottom-left origin that lands a `panel_w × panel_h` panel in the
/// **top-right** region of a screen whose visible frame is `(vis_x, vis_y, vis_w, vis_h)`,
/// inset by `margin` points from the top and right edges.
///
/// NSWindow/NSScreen coordinates are **bottom-left origin, y-up**, so the screen's visible
/// frame's top-right *corner* is at `(vis_x + vis_w, vis_y + vis_h)`. To put the panel's
/// top-right corner `margin` points in from that corner, its bottom-left origin is:
///   x = vis_x + vis_w − margin − panel_w   (right edge `margin` in from the visible right edge)
///   y = vis_y + vis_h − margin − panel_h   (top edge `margin` down from the visible top edge)
/// Using `visibleFrame` (not `frame`) keeps the panel clear of the menu bar + Dock; `margin`
/// adds the operator-requested gap on top of that. `margin == 0.0` reduces to a flush anchor.
/// Returned as a plain `(x, y)` pair so the caller feeds it to `setFrameOrigin:` — pure f64
/// math, no live AppKit context, so it's unit-testable without a running screen.
pub fn top_right_origin(
    vis_x: f64,
    vis_y: f64,
    vis_w: f64,
    vis_h: f64,
    panel_w: f64,
    panel_h: f64,
    margin: f64,
) -> (f64, f64) {
    (
        vis_x + vis_w - margin - panel_w,
        vis_y + vis_h - margin - panel_h,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arm_summon_only_in_auto_mode_when_hidden() {
        // Auto + hidden + a workspace open → arm (the happy path).
        assert!(should_arm_summon(PipMode::Auto, false, 1));
        // Auto but already shown → don't re-summon (even with workspaces open).
        assert!(!should_arm_summon(PipMode::Auto, true, 1));
        // Off / On never auto-summon (even with workspaces open).
        assert!(!should_arm_summon(PipMode::Off, false, 1));
        assert!(!should_arm_summon(PipMode::On, false, 1));
    }

    #[test]
    fn arm_summon_suppressed_when_no_workspace_open() {
        // WP9: Auto + hidden but ZERO workspaces open → DON'T arm (nothing to mirror —
        // the empty-PiP bug this guard fixes).
        assert!(!should_arm_summon(PipMode::Auto, false, 0));
        // And the count guard never overrides the other gates: count>0 doesn't resurrect
        // Off/On or a visible-panel re-summon.
        assert!(!should_arm_summon(PipMode::Off, false, 3));
        assert!(!should_arm_summon(PipMode::On, false, 3));
        assert!(!should_arm_summon(PipMode::Auto, true, 3));
    }

    #[test]
    fn auto_dismiss_only_in_auto_mode() {
        // Only Auto auto-dismisses on refocus; On stays pinned, Off has nothing to dismiss.
        assert!(should_auto_dismiss(PipMode::Auto));
        assert!(!should_auto_dismiss(PipMode::On));
        assert!(!should_auto_dismiss(PipMode::Off));
    }

    #[test]
    fn on_mode_tracks_workspace_count() {
        // WP9 Phase 2: On mode shows iff a workspace is open (no empty pinned panel).
        assert_eq!(on_mode_should_show(PipMode::On, 1), Some(true));
        assert_eq!(on_mode_should_show(PipMode::On, 3), Some(true));
        assert_eq!(on_mode_should_show(PipMode::On, 0), Some(false));
        // Auto + Off are not driven by this reconcile (focus handler / hidden-by-choice).
        assert_eq!(on_mode_should_show(PipMode::Auto, 0), None);
        assert_eq!(on_mode_should_show(PipMode::Auto, 2), None);
        assert_eq!(on_mode_should_show(PipMode::Off, 0), None);
        assert_eq!(on_mode_should_show(PipMode::Off, 2), None);
    }

    #[test]
    fn top_right_origin_insets_by_margin_from_visible_frame_corner() {
        // Screen visible frame at bottom-left origin (0,0), 1440×877 (menu-bar-trimmed),
        // panel 220×130, margin 150 → the panel's top-right corner sits 150 in from the
        // visible-frame corner: x = 1440−150−220, y = 877−150−130.
        assert_eq!(
            top_right_origin(0.0, 0.0, 1440.0, 877.0, 220.0, 130.0, PIP_ANCHOR_MARGIN),
            (1070.0, 597.0)
        );
    }

    #[test]
    fn top_right_origin_zero_margin_reduces_to_flush() {
        // margin == 0.0 is the flush anchor (right/top edges exactly on the visible-frame edges).
        assert_eq!(
            top_right_origin(0.0, 0.0, 1440.0, 877.0, 220.0, 130.0, 0.0),
            (1220.0, 747.0)
        );
    }

    #[test]
    fn top_right_origin_honors_nonzero_visible_frame_offset() {
        // A visible frame offset from the screen origin (Dock on the left → vis_x>0, or a
        // secondary display with a nonzero global origin) must be added in, not ignored:
        // origin = (vis_x+vis_w − margin − panel_w, vis_y+vis_h − margin − panel_h).
        assert_eq!(
            top_right_origin(100.0, 50.0, 1200.0, 800.0, 200.0, 120.0, 150.0),
            (100.0 + 1200.0 - 150.0 - 200.0, 50.0 + 800.0 - 150.0 - 120.0)
        );
    }

    #[test]
    fn top_right_origin_recomputes_against_current_panel_size() {
        // The anchor must recompute against the CURRENT (post-resize) panel size — a wider
        // panel gets a smaller x so its right edge stays the same distance from the screen edge.
        let (x_narrow, _) =
            top_right_origin(0.0, 0.0, 1440.0, 877.0, 220.0, 130.0, PIP_ANCHOR_MARGIN);
        let (x_wide, _) =
            top_right_origin(0.0, 0.0, 1440.0, 877.0, 500.0, 130.0, PIP_ANCHOR_MARGIN);
        assert!(x_wide < x_narrow); // wider panel → origin.x moves left to keep the right inset constant
        assert_eq!(x_narrow, 1070.0); // 1440 − 150 − 220
        assert_eq!(x_wide, 790.0); // 1440 − 150 − 500
    }
}
