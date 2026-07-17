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
use crate::cc_session::CcPermissionMode;
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
    /// The Claude Code permission mode new CC sessions spawn under — the friend-requested
    /// dropdown (all six `--permission-mode` choices). `None` = never set → the reader
    /// applies the default [`CcPermissionMode::Default`] (CC's normal prompts). App-global,
    /// not per-project; the mode is chosen once per CC process, so a change takes effect on
    /// the next spawn. **Replaces** the earlier `cc_yolo: bool` field — an on-disk `cc_yolo`
    /// from a pre-dropdown build is migrated on read (see [`read_cc_permission_mode`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cc_permission_mode: Option<CcPermissionMode>,
    /// LEGACY (pre-dropdown) yolo boolean. Retained ONLY so an existing `settings.json`
    /// written by an older build round-trips: [`read_cc_permission_mode`] migrates a
    /// present `cc_yolo` (`true` → [`CcPermissionMode::BypassPermissions`], `false` →
    /// [`CcPermissionMode::Default`]) when `cc_permission_mode` is absent. Never written by
    /// current code (`skip_serializing_if` drops it on the next write), so it self-cleans.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cc_yolo: Option<bool>,
    /// M9 WP5 — the time-analytics tracking toggle (the universal-vs-workflow-coupled
    /// feature flag). `None` = never set → the reader applies the default **`false`**
    /// (M9 decision 2 — tracking is OFF out of the box so users who don't want it pay
    /// zero storage/IO; the CC-hook + native-signal write paths stay dormant while this
    /// is off — see [`crate::time_store::commands::tracking_enabled`]). App-global, not
    /// per-project. When `true`, both `TimeStore::write_gated` (CC-hook rows) and
    /// `write_native_gated` (WP2.5 native-signal rows) persist; the status dots are
    /// unaffected either way. Mirrors the `pip_mode` field's optional-with-default shape.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_tracking_enabled: Option<bool>,
    /// M10 WP4 — the in-app-updater notification toggle. `None` = never set → the reader
    /// applies the default **`true`** (ON) — the operator-benefit default: the operator
    /// wants to hear about updates out of the box, and a friend who dislikes update nags
    /// turns it off (design-prior
    /// `operator-helpful-friend-misfiring-as-offswitchable-setting`, same shape as
    /// `pip_mode`'s off-switchable default). When `false`: no auto-check-on-launch + no
    /// proactive notify, but a manual "Check for Updates…" still works. App-global, not
    /// per-project; per bundle-identity via the app-data dir (`com.claudesk.app` vs
    /// `.dev`). Read by [`read_update_notifications_enabled`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub update_notifications_enabled: Option<bool>,
    /// M10 WP4 — the exact version tag the user chose to SKIP (never re-notify about).
    /// `None` = nothing skipped (the common case). The updater's `check()` still returns
    /// this version; the frontend notify layer suppresses it (a manual "Check for
    /// Updates…" ignores the skip and reports the truth). A NEWER version than the
    /// skipped one still notifies. App-global, per bundle-identity. Read by
    /// [`read_skipped_version`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped_version: Option<String>,
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

/// Read the CC permission mode, defaulting [`CcPermissionMode::Default`] when unset /
/// first run. The single reader the `cc_get_permission_mode` command + the spawn-time
/// call. (Mirror of `read_pip_mode`.)
///
/// **Migration:** when `cc_permission_mode` is absent but a legacy `cc_yolo` boolean is
/// present (a `settings.json` written by a pre-dropdown build), map it — `true` →
/// [`CcPermissionMode::BypassPermissions`] (the old yolo-ON behavior), `false` →
/// [`CcPermissionMode::Default`]. This preserves an existing user's chosen behavior on
/// upgrade without a write; the next `write_cc_permission_mode` persists the new field and
/// drops the legacy one.
pub fn read_cc_permission_mode(data_dir: &Path) -> Result<CcPermissionMode, ConfigError> {
    let settings = read_settings(data_dir)?;
    Ok(resolve_cc_permission_mode(&settings))
}

/// Pure resolution of the effective permission mode from a settings struct, applying the
/// legacy-`cc_yolo` migration. Split out so the migration precedence is unit-testable
/// without filesystem I/O.
fn resolve_cc_permission_mode(settings: &AppSettings) -> CcPermissionMode {
    if let Some(mode) = settings.cc_permission_mode {
        return mode;
    }
    match settings.cc_yolo {
        Some(true) => CcPermissionMode::BypassPermissions,
        Some(false) => CcPermissionMode::Default,
        None => CcPermissionMode::default(),
    }
}

/// Persist the CC permission mode, preserving other fields (read-modify-write). Also
/// clears any legacy `cc_yolo` so the migrated field is the single source of truth going
/// forward. The single writer `cc_set_permission_mode` calls. (Mirror of `write_pip_mode`.)
pub fn write_cc_permission_mode(
    data_dir: &Path,
    mode: CcPermissionMode,
) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.cc_permission_mode = Some(mode);
    settings.cc_yolo = None; // the new field is authoritative; drop the legacy boolean
    write_settings(data_dir, &settings)
}

/// Read the time-analytics tracking toggle, defaulting **`false`** when unset / first run
/// (M9 WP5, decision 2 — OFF out of the box). The single reader the
/// `time_get_tracking_enabled` command AND the write-gate
/// ([`crate::time_store::commands::tracking_enabled`]) call. (Mirror of `read_pip_mode`.)
pub fn read_time_tracking_enabled(data_dir: &Path) -> Result<bool, ConfigError> {
    Ok(read_settings(data_dir)?.time_tracking_enabled.unwrap_or(false))
}

/// Persist the tracking toggle, preserving other fields (read-modify-write). The single
/// writer `time_set_tracking_enabled` calls. (Mirror of `write_pip_mode`.)
pub fn write_time_tracking_enabled(data_dir: &Path, enabled: bool) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.time_tracking_enabled = Some(enabled);
    write_settings(data_dir, &settings)
}

/// Read the update-notification toggle, defaulting **`true`** (ON) when unset / first run
/// (M10 WP4 — the operator-benefit default). The single reader the
/// `updater_get_notifications_enabled` command AND the auto-check-on-launch gate call.
/// (Mirror of `read_pip_mode`, minus that this defaults to `true` not a variant.)
pub fn read_update_notifications_enabled(data_dir: &Path) -> Result<bool, ConfigError> {
    Ok(read_settings(data_dir)?
        .update_notifications_enabled
        .unwrap_or(true))
}

/// Persist the update-notification toggle, preserving other fields (read-modify-write).
/// The single writer `updater_set_notifications_enabled` calls. (Mirror of
/// `write_time_tracking_enabled`.)
pub fn write_update_notifications_enabled(
    data_dir: &Path,
    enabled: bool,
) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.update_notifications_enabled = Some(enabled);
    write_settings(data_dir, &settings)
}

/// Read the skipped-version tag, `None` when unset / first run (M10 WP4). The single
/// reader the `updater_get_skipped_version` command call.
pub fn read_skipped_version(data_dir: &Path) -> Result<Option<String>, ConfigError> {
    Ok(read_settings(data_dir)?.skipped_version)
}

/// Persist the skipped-version tag, preserving other fields (read-modify-write). A
/// `None` clears the skip (used by "unskip"/a manual check that offers the version
/// again). The single writer `updater_set_skipped_version` calls.
pub fn write_skipped_version(
    data_dir: &Path,
    version: Option<String>,
) -> Result<(), ConfigError> {
    let mut settings = read_settings(data_dir)?;
    settings.skipped_version = version;
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
            cc_permission_mode: Some(CcPermissionMode::AcceptEdits),
            cc_yolo: None,
            time_tracking_enabled: Some(true),
            update_notifications_enabled: Some(false),
            skipped_version: Some("0.9.9".to_string()),
        };
        write_settings(dir.path(), &written).unwrap();
        let read = read_settings(dir.path()).unwrap();
        assert_eq!(read, written);
    }

    // ── M10 WP4 — updater prefs ────────────────────────────────────────────────
    #[test]
    fn update_notifications_default_on_when_unset() {
        // Operator-benefit default: a fresh install / missing field reads as ON.
        let dir = TempDir::new().unwrap();
        assert!(read_update_notifications_enabled(dir.path()).unwrap());
    }

    #[test]
    fn update_notifications_round_trips() {
        let dir = TempDir::new().unwrap();
        write_update_notifications_enabled(dir.path(), false).unwrap();
        assert!(!read_update_notifications_enabled(dir.path()).unwrap());
        write_update_notifications_enabled(dir.path(), true).unwrap();
        assert!(read_update_notifications_enabled(dir.path()).unwrap());
    }

    #[test]
    fn skipped_version_defaults_to_none_and_round_trips() {
        let dir = TempDir::new().unwrap();
        assert_eq!(read_skipped_version(dir.path()).unwrap(), None);
        write_skipped_version(dir.path(), Some("1.2.3".to_string())).unwrap();
        assert_eq!(
            read_skipped_version(dir.path()).unwrap(),
            Some("1.2.3".to_string())
        );
        // A None clears the skip (unskip).
        write_skipped_version(dir.path(), None).unwrap();
        assert_eq!(read_skipped_version(dir.path()).unwrap(), None);
    }

    #[test]
    fn updater_prefs_independent_of_other_fields() {
        // Writing an updater pref must not clobber pip_mode / time_tracking, and vice versa.
        let dir = TempDir::new().unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        write_update_notifications_enabled(dir.path(), false).unwrap();
        write_skipped_version(dir.path(), Some("0.5.0".to_string())).unwrap();
        // All four survive independently.
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        assert!(!read_update_notifications_enabled(dir.path()).unwrap());
        assert_eq!(
            read_skipped_version(dir.path()).unwrap(),
            Some("0.5.0".to_string())
        );
        // ...and updating one updater pref leaves the other intact.
        write_update_notifications_enabled(dir.path(), true).unwrap();
        assert_eq!(
            read_skipped_version(dir.path()).unwrap(),
            Some("0.5.0".to_string())
        );
    }

    #[test]
    fn updater_prefs_absent_in_present_file_read_as_defaults() {
        // Forward-compat: a file predating the M10 fields reads ON + no-skip.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_mode":"auto","time_tracking_enabled":true}"#,
        )
        .unwrap();
        assert!(read_update_notifications_enabled(dir.path()).unwrap());
        assert_eq!(read_skipped_version(dir.path()).unwrap(), None);
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
    fn cc_permission_mode_defaults_to_default_when_unset() {
        // A fresh install / missing field reads as CC's normal permission prompts.
        let dir = TempDir::new().unwrap();
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Default
        );
    }

    #[test]
    fn cc_permission_mode_absent_in_present_file_reads_as_default() {
        // Forward-compat: a file that predates the cc_permission_mode field (and has no
        // legacy cc_yolo either) reads as the Default mode.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_layout":"compact","pip_mode":"auto"}"#,
        )
        .unwrap();
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Default
        );
    }

    #[test]
    fn cc_permission_mode_round_trips_each_variant() {
        let dir = TempDir::new().unwrap();
        for m in [
            CcPermissionMode::Default,
            CcPermissionMode::Plan,
            CcPermissionMode::AcceptEdits,
            CcPermissionMode::Auto,
            CcPermissionMode::DontAsk,
            CcPermissionMode::BypassPermissions,
        ] {
            write_cc_permission_mode(dir.path(), m).unwrap();
            assert_eq!(read_cc_permission_mode(dir.path()).unwrap(), m);
        }
    }

    #[test]
    fn legacy_cc_yolo_true_migrates_to_bypass_permissions() {
        // The realistic upgrade case: a settings.json written by a pre-dropdown build
        // that had yolo ON. On read it must map to BypassPermissions (the equivalent
        // behavior) so the user's choice survives the upgrade.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_mode":"auto","cc_yolo":true}"#,
        )
        .unwrap();
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::BypassPermissions
        );
    }

    #[test]
    fn legacy_cc_yolo_false_migrates_to_default() {
        // A pre-dropdown build with yolo explicitly OFF maps to Default (normal prompts).
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(SETTINGS_FILE), br#"{"cc_yolo":false}"#).unwrap();
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Default
        );
    }

    #[test]
    fn cc_permission_mode_wins_over_legacy_cc_yolo() {
        // If BOTH the new field and the legacy boolean are present (a mixed file), the
        // explicit new field is authoritative — the legacy value is ignored.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"cc_permission_mode":"plan","cc_yolo":true}"#,
        )
        .unwrap();
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Plan
        );
    }

    #[test]
    fn write_cc_permission_mode_clears_legacy_cc_yolo() {
        // After a write, the legacy boolean must be gone from disk — the new field is the
        // single source of truth, so the migration self-cleans on first write.
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(SETTINGS_FILE), br#"{"cc_yolo":true}"#).unwrap();
        write_cc_permission_mode(dir.path(), CcPermissionMode::AcceptEdits).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(raw.contains("acceptEdits"));
        assert!(
            !raw.contains("cc_yolo"),
            "legacy cc_yolo must be dropped on write: {raw}"
        );
    }

    #[test]
    fn cc_permission_mode_independent_of_pip_fields() {
        // Writing cc_permission_mode must not clobber the pip settings, and vice versa
        // (read-modify-write across all three fields).
        let dir = TempDir::new().unwrap();
        write_pip_layout(dir.path(), PipLayout::Minimal).unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        write_cc_permission_mode(dir.path(), CcPermissionMode::Plan).unwrap();
        assert_eq!(read_pip_layout(dir.path()).unwrap(), PipLayout::Minimal);
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Plan
        );
        // ...and updating cc_permission_mode leaves the pip settings intact.
        write_cc_permission_mode(dir.path(), CcPermissionMode::Auto).unwrap();
        assert_eq!(read_pip_layout(dir.path()).unwrap(), PipLayout::Minimal);
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
    }

    #[test]
    fn time_tracking_defaults_to_false_when_unset() {
        // M9 WP5 / decision 2: OFF out of the box. A fresh install / missing field reads
        // as false — no SQLite touch until the user opts in.
        let dir = TempDir::new().unwrap();
        assert!(!read_time_tracking_enabled(dir.path()).unwrap());
    }

    #[test]
    fn time_tracking_absent_in_present_file_reads_as_false() {
        // Forward-compat: a settings.json that predates the field reads as OFF.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_mode":"auto","cc_permission_mode":"plan"}"#,
        )
        .unwrap();
        assert!(!read_time_tracking_enabled(dir.path()).unwrap());
    }

    #[test]
    fn time_tracking_round_trips_both_values() {
        let dir = TempDir::new().unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        write_time_tracking_enabled(dir.path(), false).unwrap();
        assert!(!read_time_tracking_enabled(dir.path()).unwrap());
    }

    #[test]
    fn time_tracking_independent_of_other_fields() {
        // Writing the tracking flag must not clobber pip/cc settings, and vice versa
        // (read-modify-write across all fields).
        let dir = TempDir::new().unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        write_cc_permission_mode(dir.path(), CcPermissionMode::Plan).unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Plan
        );
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        // ...and updating another field leaves the tracking flag intact.
        write_pip_mode(dir.path(), PipMode::On).unwrap();
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
    }

    #[test]
    fn empty_settings_serializes_without_null_fields() {
        // skip_serializing_if keeps an unset field OUT of the JSON (so a default file
        // is `{}`, not `{"pip_layout":null}`) — forward-stable + tidy.
        let json = serde_json::to_string(&AppSettings::default()).unwrap();
        assert_eq!(json, "{}");
    }
}
