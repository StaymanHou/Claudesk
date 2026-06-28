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
}
