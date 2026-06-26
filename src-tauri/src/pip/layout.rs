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
}
