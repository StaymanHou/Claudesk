//! M5 WP4 — the PiP layout enum (Rust side of the wire contract).
//!
//! Mirrors the TS `src/pip/pipLayout.ts` `PipLayout` type VERBATIM via serde
//! kebab-case, so the layout string is byte-identical end-to-end across the IPC
//! (`pip_get_layout` / `pip_set_layout`) and the `pip-layout` event — the same
//! snake/kebab-discipline as the `workspace-status` wire contract. The backend owns
//! the layout (it persists + resizes the panel + broadcasts), so this enum is the
//! source of truth the frontend coerces to.

use serde::{Deserialize, Serialize};

/// The four PiP layouts, richest → most minimal. Serializes to the kebab-case wire
/// strings the TS `PipLayout` union expects (`"horizontal-mirror"`, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PipLayout {
    /// Live thumbnails in a row (WP3's default).
    #[default]
    HorizontalMirror,
    /// Same live thumbnails, stacked vertically.
    VerticalMirror,
    /// Project name + status dot only, stacked (no mirror).
    Compact,
    /// Status dots only, no names, no mirror.
    Minimal,
}

// NOTE: a static per-layout `panel_size()` table existed here briefly (WP4 Phase 3, first
// attempt) but was REJECTED at verify-human (2026-06-26): the panel size must be CONTENT-
// DRIVEN (layout × workspace count, capped to screen with wrap), not a fixed box that crams
// N tiles in. The size math now lives in the PiP webview (src/pip/pipPanelSize.ts — it has
// the roster + screen) and is applied via the `pip_resize` command. The enum carries no
// dimensions.

/// The PiP visibility MODE — an explicit, user-selectable tri-state (WP5 Phase 2 rework,
/// 2026-06-27). Replaces the earlier *inferred* regime (a hidden `origin=Manual/Auto` +
/// `manual_off` bool + `pip_auto_summon` bool), which had a dead-end: once the user touched
/// the toggle there was no path back to the auto regime without relaunch. Making the mode
/// explicit removes the unreachable state by construction (design-prior
/// `explicit-selectable-mode-over-inferred-mode`). Serializes kebab-case (`"off"`/`"on"`/
/// `"auto"`) to match the TS `PipMode` union byte-for-byte across `pip_set_mode` + the
/// `pip-mode` event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PipMode {
    /// Panel hidden; no auto-summon. The "I don't want it" state.
    Off,
    /// Panel shown + pinned; never auto-dismisses on refocus. The "keep it up" state.
    On,
    /// System-driven: hidden while Claudesk is focused, auto-summons on a sustained
    /// (3s-debounced) main-window blur, auto-dismisses on refocus. The default + the
    /// feature's reason for existing (vision Success Metric 6). First-run default.
    #[default]
    Auto,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_the_kebab_case_wire_strings() {
        // The wire strings must match TS pipLayout.ts byte-for-byte.
        assert_eq!(
            serde_json::to_string(&PipLayout::HorizontalMirror).unwrap(),
            "\"horizontal-mirror\""
        );
        assert_eq!(
            serde_json::to_string(&PipLayout::VerticalMirror).unwrap(),
            "\"vertical-mirror\""
        );
        assert_eq!(
            serde_json::to_string(&PipLayout::Compact).unwrap(),
            "\"compact\""
        );
        assert_eq!(
            serde_json::to_string(&PipLayout::Minimal).unwrap(),
            "\"minimal\""
        );
    }

    #[test]
    fn deserializes_from_the_wire_strings() {
        let l: PipLayout = serde_json::from_str("\"minimal\"").unwrap();
        assert_eq!(l, PipLayout::Minimal);
    }

    #[test]
    fn default_is_horizontal_mirror() {
        // Matches TS DEFAULT_PIP_LAYOUT — the first-run / fall-back layout.
        assert_eq!(PipLayout::default(), PipLayout::HorizontalMirror);
    }

    // (The static panel_size test was removed with the method — sizing moved to the
    // content-driven computePanelSize in src/pip/pipPanelSize.ts, vitest-pinned there.)

    #[test]
    fn pip_mode_serializes_to_kebab_wire_strings() {
        assert_eq!(serde_json::to_string(&PipMode::Off).unwrap(), "\"off\"");
        assert_eq!(serde_json::to_string(&PipMode::On).unwrap(), "\"on\"");
        assert_eq!(serde_json::to_string(&PipMode::Auto).unwrap(), "\"auto\"");
    }

    #[test]
    fn pip_mode_deserializes_from_wire_strings() {
        let m: PipMode = serde_json::from_str("\"on\"").unwrap();
        assert_eq!(m, PipMode::On);
    }

    #[test]
    fn pip_mode_default_is_auto() {
        // First-run default — the feature's reason for existing (out-of-focus glance).
        assert_eq!(PipMode::default(), PipMode::Auto);
    }
}
