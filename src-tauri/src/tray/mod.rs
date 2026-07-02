//! M7 — Menu-bar (system-tray) status item: the ambient, zero-allocation ALARM.
//!
//! The one thing the macOS menu bar offers that the shipped M5 PiP does not is its
//! **location** — a strip the operator already passively watches all day, present
//! even at zero workspaces, with no summon and no allocated screen region. M7 exploits
//! exactly that edge and nothing more:
//!   - **(a) a 2-state ambient alarm** — a template tray icon **lit when ANY open
//!     workspace is `AwaitingInput`, neutral otherwise** (Running + Idle collapse to
//!     neutral; running-vs-idle detail is PiP's / the window's job, NOT the menu bar's).
//!   - **(b) a native actuator menu** (Show Claudesk / Toggle PiP / Quit) — built in WP2.
//!
//! It is **NOT** a third status surface: a popover dashboard (per-workspace list +
//! navigate-on-click) was CUT at the spec debate as a strict subset of PiP (design-prior
//! `new-surface-must-earn-its-place-against-existing-ones`).
//!
//! This module mirrors the `pip/` shape: the **pure reduction** ([`aggregate_alarm`] +
//! the [`AlarmState`] DTO) lives here in `mod.rs`, unit-tested without a live app; the
//! **tray-icon ops** (`TrayIconBuilder`, the lit↔neutral atomic icon swap, the
//! `workspace-status` subscription) live in [`commands`].
//!
//! It subscribes to the existing M3 `status_broadcaster` `workspace-status` event — no
//! broadcaster change. Each event carries ONE workspace's [`WorkspaceStatusUpdate`]; the
//! tray accumulates the latest state per workspace and re-folds on every event +
//! register/deregister.

pub mod commands;

use crate::pip::layout::PipMode;
use crate::status_broadcaster::WorkspaceState;

/// The 2-state ambient alarm the tray glyph reflects. The menu bar carries exactly one
/// bit — "is any project waiting on me?" — so this enum is deliberately binary; a 3-state
/// (green/blue/amber) running indication was CUT (running-vs-idle lives in PiP / the
/// window). `Neutral` is the resting glyph; `Attention` is the lit glyph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AlarmState {
    /// No open workspace is awaiting input → the neutral (resting) glyph. This is the
    /// default: zero workspaces, or every workspace Running/Idle/Unknown.
    #[default]
    Neutral,
    /// At least one open workspace is `AwaitingInput` → the lit glyph. The whole point of
    /// the menu-bar surface: an ambient, location-based "stop, a project needs me."
    Attention,
}

/// Pure fold: reduce the per-workspace states to the 2-state alarm. **`Attention` iff ANY
/// state is [`WorkspaceState::AwaitingInput`]; `Neutral` otherwise** (empty slice →
/// Neutral; all Running/Idle/Unknown → Neutral). This is the entire alarm logic — pure,
/// so it is unit-tested here without a live app, and the live icon swap in [`commands`]
/// is a thin "fold-then-set-icon" wrapper over it.
///
/// Running and Idle deliberately COLLAPSE to Neutral: the menu bar carries one bit, and
/// running-vs-idle detail is PiP's / the window's job (the M7 shrink). `Unknown` (no hook
/// event yet) is also Neutral — an unobserved workspace is not "waiting on me."
pub fn aggregate_alarm(states: &[WorkspaceState]) -> AlarmState {
    if states.contains(&WorkspaceState::AwaitingInput) {
        AlarmState::Attention
    } else {
        AlarmState::Neutral
    }
}

/// Stable ids for the WP2 tray actuator-menu items. Unlike the `app_menu` functional
/// ids (which emit the `menu` event for the FRONTEND to act on), these are handled
/// BACKEND-side in [`commands::handle_tray_menu_event`] — the window may be hidden /
/// the webview unresponsive when the operator clicks the tray, so "Show Claudesk" and
/// "Toggle PiP" must not depend on the frontend. Quit is a native `PredefinedMenuItem`
/// and has no id here. Namespaced `tray.*` so they never collide with `app_menu`'s ids.
pub mod menu_ids {
    pub const SHOW_CLAUDESK: &str = "tray.showClaudesk";
    pub const TOGGLE_PIP: &str = "tray.togglePip";
}

/// Pure: whether a menu-item id is a tray actuator the backend handles (vs. an
/// `app_menu` id that should fall through to the frontend bridge). The single source of
/// truth for the routing branch in [`commands::handle_tray_menu_event`] — pinning it pure
/// lets a unit test guard the routing contract (a typo'd tray id would otherwise silently
/// dead-click, or shadow an app_menu id, with green app-level tests).
pub fn is_tray_menu_id(id: &str) -> bool {
    matches!(id, menu_ids::SHOW_CLAUDESK | menu_ids::TOGGLE_PIP)
}

/// Pure decision: the PiP mode a tray "Toggle PiP" click should move to, given the
/// current mode. A tray toggle is a simple show/hide: from `Off` (hidden) → `On`
/// (pinned, visible); from anything visible-or-auto (`On`/`Auto`) → `Off`. Pure →
/// unit-tested without a live app. (The richer tri-state selection still lives in the
/// View-menu radio + the PiP control; the tray gives the operator a one-click hide/show.)
pub fn toggle_pip_mode(current: PipMode) -> PipMode {
    match current {
        PipMode::Off => PipMode::On,
        PipMode::On | PipMode::Auto => PipMode::Off,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_neutral() {
        // Zero open workspaces → neutral (nothing to wait on). The resting state the tray
        // shows whenever Claudesk is running with no project open.
        assert_eq!(aggregate_alarm(&[]), AlarmState::Neutral);
    }

    #[test]
    fn any_awaiting_input_is_attention() {
        // One awaiting → lit.
        assert_eq!(
            aggregate_alarm(&[WorkspaceState::AwaitingInput]),
            AlarmState::Attention
        );
        // Mixed with a single awaiting among busy/idle → still lit (ANY, not all).
        assert_eq!(
            aggregate_alarm(&[
                WorkspaceState::Running,
                WorkspaceState::Idle,
                WorkspaceState::AwaitingInput,
                WorkspaceState::Running,
            ]),
            AlarmState::Attention
        );
        // Multiple awaiting → lit (one bit, no count).
        assert_eq!(
            aggregate_alarm(&[WorkspaceState::AwaitingInput, WorkspaceState::AwaitingInput,]),
            AlarmState::Attention
        );
    }

    #[test]
    fn tray_menu_ids_route_to_backend_others_fall_through() {
        // The two tray actuators are recognized (handled backend-side)...
        assert!(is_tray_menu_id(menu_ids::SHOW_CLAUDESK));
        assert!(is_tray_menu_id(menu_ids::TOGGLE_PIP));
        // ...and everything else (app_menu ids, empty, unknown) falls through to the
        // app_menu frontend bridge. A tray id that collided with an app_menu id, or a
        // typo, would break this — the routing contract `handle_tray_menu_event` depends on.
        assert!(!is_tray_menu_id("view.pip.mode.on")); // an app_menu id
        assert!(!is_tray_menu_id("file.newWorkspace")); // an app_menu id
        assert!(!is_tray_menu_id(""));
        assert!(!is_tray_menu_id("tray.unknown"));
        // The ids are namespaced tray.* so they can't collide with app_menu's ids.
        assert!(menu_ids::SHOW_CLAUDESK.starts_with("tray."));
        assert!(menu_ids::TOGGLE_PIP.starts_with("tray."));
    }

    #[test]
    fn toggle_pip_cycles_off_to_on_else_to_off() {
        // Off (hidden) → On (pinned visible).
        assert_eq!(toggle_pip_mode(PipMode::Off), PipMode::On);
        // On (visible) → Off (hidden).
        assert_eq!(toggle_pip_mode(PipMode::On), PipMode::Off);
        // Auto (system-driven, currently-or-soon visible) → Off — a decisive hide.
        assert_eq!(toggle_pip_mode(PipMode::Auto), PipMode::Off);
    }

    #[test]
    fn none_awaiting_is_neutral() {
        // Running + Idle both collapse to Neutral (the M7 shrink — running-vs-idle is not
        // a menu-bar concern).
        assert_eq!(
            aggregate_alarm(&[WorkspaceState::Running]),
            AlarmState::Neutral
        );
        assert_eq!(
            aggregate_alarm(&[WorkspaceState::Idle]),
            AlarmState::Neutral
        );
        assert_eq!(
            aggregate_alarm(&[
                WorkspaceState::Running,
                WorkspaceState::Idle,
                WorkspaceState::Running,
            ]),
            AlarmState::Neutral
        );
        // Unknown (no hook event observed yet) is NOT "waiting on me" → Neutral.
        assert_eq!(
            aggregate_alarm(&[WorkspaceState::Unknown, WorkspaceState::Idle]),
            AlarmState::Neutral
        );
    }
}
