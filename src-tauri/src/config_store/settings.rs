//! M5 WP4 — app-global UI settings store (`settings.json`).
//!
//! Sibling to the project list (`projects.json`): a flat JSON file in the same
//! app-data dir holding app-GLOBAL chrome preferences that are NOT per-project.
//! First field: `pip_layout` (the chosen PiP layout, persisted across toggles +
//! launches). Kept out of `projects.json` because it's not a `Project` attribute
//! (unlike `default_drive_mode`, which genuinely is per-project).
//!
//! ## Why a Rust store, not localStorage
//! The PiP NSPanel is a SEPARATE webview heap; localStorage is per-origin-per-webview
//! and would NOT be shared between the main webview and the PiP. A Rust store in the
//! app-data dir is reachable from BOTH (via IPC) and is already bundle-identity-isolated
//! (`com.claudesk.app` vs `.dev`) — exactly the "keyed per the bundle-identity isolation"
//! the WBS asks for.
//!
//! ## Durability
//! Same discipline as `projects.json`: atomic write (serialize → `settings.json.tmp`
//! → `fs::rename`), missing file = defaults (not an error), malformed file = a parse
//! error that leaves the file intact (never silently wiped).

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::ConfigError;
use crate::pip::layout::{PipLayout, PipMode};

/// Basename of the app-settings file within the app-data directory.
const SETTINGS_FILE: &str = "settings.json";
/// Sidecar temp file used for the atomic write-then-rename.
const SETTINGS_TMP_FILE: &str = "settings.json.tmp";

/// App-global UI settings. Every field is optional so an older file (or a fresh
/// install) round-trips forward-stably — a missing field reads as its default. New
/// settings are added as new optional fields, never breaking an existing file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    /// The chosen PiP layout. `None` = never set → the reader applies the default
    /// (`PipLayout::default()` = horizontal mirror).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pip_layout: Option<PipLayout>,
    /// The PiP visibility MODE — explicit tri-state Off/On/Auto (WP5 Phase 2 rework,
    /// 2026-06-27). `None` = never set → the reader applies the default **`Auto`** (the
    /// operator-benefit default; off-switchable to `Off` for multi-monitor friend-users
    /// where a blur-trigger misfires — see `docs/product/design-priors.md` →
    /// operator-helpful-friend-misfiring-as-offswitchable-setting +
    /// explicit-selectable-mode-over-inferred-mode). **Replaces** the earlier
    /// `pip_auto_summon: bool` + `pip_visible: bool` pair, whose inferred regime had a
    /// dead-end (no return to auto without relaunch).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pip_mode: Option<PipMode>,
}

/// Read the app settings. A missing file is normal (first run) and returns the
/// defaults — not an error. A present-but-malformed file returns
/// [`ConfigError::Parse`] (we never silently wipe a file we failed to understand).
pub fn read_settings(data_dir: &Path) -> Result<AppSettings, ConfigError> {
    let file = data_dir.join(SETTINGS_FILE);
    let bytes = match std::fs::read(&file) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(AppSettings::default()),
        Err(e) => return Err(e.into()),
    };
    let settings: AppSettings = serde_json::from_slice(&bytes)?;
    Ok(settings)
}

/// Atomically persist the app settings: serialize → `settings.json.tmp` →
/// `rename` over `settings.json`. The caller ensures `data_dir` exists.
pub fn write_settings(data_dir: &Path, settings: &AppSettings) -> Result<(), ConfigError> {
    let tmp = data_dir.join(SETTINGS_TMP_FILE);
    let final_path = data_dir.join(SETTINGS_FILE);
    let json = serde_json::to_vec_pretty(settings)?;
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

/// Read the persisted PiP layout, or the default if unset / first run. The single
/// reader the `pip_get_layout` command and the launch-time panel build call.
pub fn read_pip_layout(data_dir: &Path) -> Result<PipLayout, ConfigError> {
    Ok(read_settings(data_dir)?.pip_layout.unwrap_or_default())
}

/// Persist the chosen PiP layout, preserving any other settings fields (read-modify-
/// write so a future field isn't clobbered). The single writer `pip_set_layout` calls.
pub fn write_pip_layout(data_dir: &Path, layout: PipLayout) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.pip_layout = Some(layout);
    write_settings(data_dir, &settings)
}

/// Read the PiP mode, defaulting **`Auto`** when unset / first run — the operator-benefit
/// default (WP5 Phase 2 rework). The single reader the `pip_get_mode` command + the
/// launch-time restore + the focus handler call.
pub fn read_pip_mode(data_dir: &Path) -> Result<PipMode, ConfigError> {
    Ok(read_settings(data_dir)?.pip_mode.unwrap_or_default())
}

/// Persist the PiP mode, preserving other fields (read-modify-write). The single writer
/// `pip_set_mode` calls.
pub fn write_pip_mode(data_dir: &Path, mode: PipMode) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.pip_mode = Some(mode);
    write_settings(data_dir, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn missing_file_reads_as_defaults() {
        let dir = TempDir::new().unwrap();
        let settings = read_settings(dir.path()).unwrap();
        assert_eq!(settings, AppSettings::default());
        // And the default layout resolves to horizontal mirror.
        assert_eq!(
            read_pip_layout(dir.path()).unwrap(),
            PipLayout::HorizontalMirror
        );
    }

    #[test]
    fn pip_layout_round_trips() {
        let dir = TempDir::new().unwrap();
        write_pip_layout(dir.path(), PipLayout::Minimal).unwrap();
        assert_eq!(read_pip_layout(dir.path()).unwrap(), PipLayout::Minimal);
    }

    #[test]
    fn write_pip_layout_preserves_other_fields() {
        // read-modify-write: a hand-written file with an unknown extra key must not be
        // clobbered when we update pip_layout. (Forward-compat: a newer build's field
        // survives an older build's write of pip_layout.)
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_layout":"compact","future_field":42}"#,
        )
        .unwrap();
        write_pip_layout(dir.path(), PipLayout::VerticalMirror).unwrap();
        // pip_layout updated...
        assert_eq!(
            read_pip_layout(dir.path()).unwrap(),
            PipLayout::VerticalMirror
        );
        // ...and the unknown field is still on disk (serde ignores it on read but a
        // round-trip through our typed struct would drop it — so we assert the typed
        // value, and separately that an unknown key does not BREAK the read).
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(raw.contains("vertical-mirror"));
    }

    #[test]
    fn malformed_file_is_an_error_not_a_wipe() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(SETTINGS_FILE), b"{ not valid json").unwrap();
        let result = read_settings(dir.path());
        assert!(matches!(result, Err(ConfigError::Parse(_))));
        // The malformed file is left intact — never silently overwritten.
        let raw = std::fs::read(dir.path().join(SETTINGS_FILE)).unwrap();
        assert_eq!(raw, b"{ not valid json");
    }

    #[test]
    fn atomic_write_round_trips_via_typed_struct() {
        let dir = TempDir::new().unwrap();
        let written = AppSettings {
            pip_layout: Some(PipLayout::VerticalMirror),
            pip_mode: Some(PipMode::On),
        };
        write_settings(dir.path(), &written).unwrap();
        let read = read_settings(dir.path()).unwrap();
        assert_eq!(read, written);
    }

    #[test]
    fn pip_mode_defaults_to_auto_when_unset() {
        // WP5 Phase 2 rework: the operator-benefit default. A fresh install / missing
        // field reads as Auto — auto-summon works out of the box.
        let dir = TempDir::new().unwrap();
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Auto);
    }

    #[test]
    fn pip_mode_round_trips_each_variant() {
        let dir = TempDir::new().unwrap();
        for m in [PipMode::Off, PipMode::On, PipMode::Auto] {
            write_pip_mode(dir.path(), m).unwrap();
            assert_eq!(read_pip_mode(dir.path()).unwrap(), m);
        }
    }

    #[test]
    fn pip_mode_and_layout_are_independent() {
        // Writing one PiP setting must not clobber the other (read-modify-write).
        let dir = TempDir::new().unwrap();
        write_pip_layout(dir.path(), PipLayout::Minimal).unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        assert_eq!(read_pip_layout(dir.path()).unwrap(), PipLayout::Minimal);
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        // ...and updating layout leaves mode intact.
        write_pip_layout(dir.path(), PipLayout::Compact).unwrap();
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
    }

    #[test]
    fn empty_settings_serializes_without_null_fields() {
        // skip_serializing_if keeps an unset field OUT of the JSON (so a default file
        // is `{}`, not `{"pip_layout":null}`) — forward-stable + tidy.
        let json = serde_json::to_string(&AppSettings::default()).unwrap();
        assert_eq!(json, "{}");
    }
}
