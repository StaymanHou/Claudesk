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
    /// M10.9 WP2 — the workflow-features opt-in gate. `None` = never set → the reader
    /// applies the default **`false`** (OFF for *everyone*, including the operator).
    ///
    /// ⚠️ Two invariants this field must preserve — **OFF is byte-identical** to a build
    /// that never had the features, and **flipping it writes NOTHING into `~/.claude/`**.
    /// Both are stated in full, once, at `crate::workflow_gate`'s module header, along with
    /// why the default is set by applicability rather than audience size. Not restated here:
    /// the rationale was near-verbatim in six places, and six copies are six things to
    /// update (`SURFACE-2026-07-28-QUALITY-WP2-MILESTONE-RATIONALE-RESTATED-SIX-TIMES`).
    ///
    /// App-global, per bundle-identity. Read by [`read_workflow_features_enabled`].
    /// Mirrors the `time_tracking_enabled` optional-with-default shape.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_features_enabled: Option<bool>,
    /// M10 WP4 — the exact version tag the user chose to SKIP (never re-notify about).
    /// `None` = nothing skipped (the common case). The updater's `check()` still returns
    /// this version; the frontend notify layer suppresses it (a manual "Check for
    /// Updates…" ignores the skip and reports the truth). A NEWER version than the
    /// skipped one still notifies. App-global, per bundle-identity. Read by
    /// [`read_skipped_version`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped_version: Option<String>,
    /// M10.9 WP3 — has the one-time workflow-features invite resolved, and how.
    /// `None` = never shown yet, and is **the only state that permits showing it**.
    ///
    /// Deliberately SEPARATE from [`AppSettings::workflow_features_enabled`]: the gate is
    /// *current state*, this is a *one-time lifecycle marker*. Conflating them breaks the
    /// disable-after-enable case — a user who saw the invite, turned the features on,
    /// tried them, then turned them off lands back at `workflow_features_enabled == false`,
    /// the exact gate state as someone who never saw the invite. Recording the outcome
    /// separately is what stops them being re-pitched something they already evaluated.
    ///
    /// It is **internal lifecycle state, not a user-facing setting** — no Settings-panel
    /// control. Written only by the invite's own buttons, read only by the show-predicate.
    /// Once `Some(_)`, suppression is permanent and one-directional: nothing in the
    /// product resets it (the dev-only `window.__workflowInviteReset()` seam exists for
    /// re-driving the first-run path in verification, and is absent from release builds).
    ///
    /// App-global, per bundle-identity. Read by [`read_workflow_invite`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_invite: Option<WorkflowInviteOutcome>,
}

/// How the one-time workflow-features invite was resolved (M10.9 WP3).
///
/// Two variants, and the ABSENCE of a variant is the third state — `None` means
/// "unresolved, may still be shown". That is what makes the `[Later]` button work without
/// a field of its own: `[Later]` deliberately **persists nothing**, so the setting stays
/// `None` and the invite returns next launch, while a React-only session flag hides it for
/// the current run. (Exactly the updater's `dismissBanner`-vs-`skipVersion` split:
/// `useUpdater.ts:180-183` clears the banner and writes nothing; `:173` writes
/// `skipped_version` for permanent suppression.)
///
/// Serializes to `"acknowledged"` / `"dismissed"`, matching the TS union byte-for-byte and
/// following the [`PipMode`](crate::pip::layout::PipMode) mold.
///
/// ⚠️ The attribute below says `kebab-case`, but **both variants are single words**, so
/// kebab-case is indistinguishable from `lowercase` here — the docs previously described a
/// property no test could detect, and no test could detect it because it does not yet apply.
/// The attribute is kept for the `PipMode` mold (a future multi-word variant would need it),
/// and the wire test asserts the LITERAL strings rather than a casing rule it cannot observe.
/// (`SURFACE-2026-07-29-QUALITY-WP3-KEBAB-CASE-CLAIM-UNTESTABLE`.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkflowInviteOutcome {
    /// The user took the invite's primary action: they were routed to the Settings panel
    /// (with the workflow-features row highlighted) to decide there. Don't re-pitch.
    ///
    /// **Named for what it records, not for an outcome it cannot know.** The primary
    /// button routes; it does **not** flip the gate (operator decision 2026-07-29,
    /// reversing an earlier draft where it enabled inline). So Claudesk knows the user
    /// engaged with the pitch, but not whether they went on to enable — and an
    /// `Enabled` variant would assert the latter. Suppression is correct either way:
    /// someone who saw the pitch, read the substrate context, and chose not to enable
    /// should no more be re-pitched than someone who enabled.
    Acknowledged,
    /// The user explicitly dismissed the invite — the "done, stop asking" exit. Never
    /// re-shown.
    Dismissed,
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
    super::update_settings(data_dir, |settings| {
        settings.pip_layout = Some(layout);
        Ok(())
    })
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
    super::update_settings(data_dir, |settings| {
        settings.pip_mode = Some(mode);
        Ok(())
    })
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
    super::update_settings(data_dir, |settings| {
        settings.cc_permission_mode = Some(mode);
        settings.cc_yolo = None; // the new field is authoritative; drop the legacy boolean
        Ok(())
    })
}

/// Read the time-analytics tracking toggle, defaulting **`false`** when unset / first run
/// (M9 WP5, decision 2 — OFF out of the box). The single reader the
/// `time_get_tracking_enabled` command AND the write-gate
/// ([`crate::time_store::commands::tracking_enabled`]) call. (Mirror of `read_pip_mode`.)
pub fn read_time_tracking_enabled(data_dir: &Path) -> Result<bool, ConfigError> {
    Ok(read_settings(data_dir)?
        .time_tracking_enabled
        .unwrap_or(false))
}

/// Persist the tracking toggle, preserving other fields (read-modify-write). The single
/// writer `time_set_tracking_enabled` calls. (Mirror of `write_pip_mode`.)
pub fn write_time_tracking_enabled(data_dir: &Path, enabled: bool) -> Result<(), ConfigError> {
    super::update_settings(data_dir, |settings| {
        settings.time_tracking_enabled = Some(enabled);
        Ok(())
    })
}

/// Read the workflow-features gate, defaulting **`false`** when unset / first run (M10.9
/// WP2 — OFF for everyone, including the operator; the default is set by *applicability*,
/// since the feature class depends on the companion workflow system being installed at
/// `~/.claude/`). The single reader the `workflow_get_features_enabled` command calls.
/// (Mirror of `read_time_tracking_enabled`.)
pub fn read_workflow_features_enabled(data_dir: &Path) -> Result<bool, ConfigError> {
    Ok(read_settings(data_dir)?
        .workflow_features_enabled
        .unwrap_or(false))
}

/// Persist the workflow-features gate, preserving other fields (read-modify-write). The
/// single writer `workflow_set_features_enabled` calls. Writes ONLY to Claudesk's own
/// `settings.json` — never to `~/.claude/` (the milestone invariant).
/// (Mirror of `write_time_tracking_enabled`.)
pub fn write_workflow_features_enabled(data_dir: &Path, enabled: bool) -> Result<(), ConfigError> {
    super::update_settings(data_dir, |settings| {
        settings.workflow_features_enabled = Some(enabled);
        Ok(())
    })
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
    super::update_settings(data_dir, |settings| {
        settings.update_notifications_enabled = Some(enabled);
        Ok(())
    })
}

/// Read the skipped-version tag, `None` when unset / first run (M10 WP4). The single
/// reader the `updater_get_skipped_version` command call.
pub fn read_skipped_version(data_dir: &Path) -> Result<Option<String>, ConfigError> {
    Ok(read_settings(data_dir)?.skipped_version)
}

/// Persist the skipped-version tag, preserving other fields (read-modify-write). A
/// `None` clears the skip (used by "unskip"/a manual check that offers the version
/// again). The single writer `updater_set_skipped_version` calls.
pub fn write_skipped_version(data_dir: &Path, version: Option<String>) -> Result<(), ConfigError> {
    super::update_settings(data_dir, |settings| {
        settings.skipped_version = version;
        Ok(())
    })
}

/// Read the one-time invite's outcome (M10.9 WP3). `None` = never resolved, which is the
/// only state in which the invite may be shown.
///
/// No `unwrap_or` default here, unlike the boolean readers above: `None` is not a
/// stand-in for a default, it is a **meaningful third state** the show-predicate branches
/// on. Mirror of [`read_skipped_version`], whose `None` is likewise load-bearing.
pub fn read_workflow_invite(data_dir: &Path) -> Result<Option<WorkflowInviteOutcome>, ConfigError> {
    Ok(read_settings(data_dir)?.workflow_invite)
}

/// Persist the invite's outcome, preserving other fields (read-modify-write).
///
/// `Some(_)` is a one-way door in product terms — no user-facing affordance ever returns
/// the value to `None`. The parameter still accepts `None` because the **dev-only** reset
/// seam (`window.__workflowInviteReset()`) needs it to re-drive the first-run path during
/// verification; that seam is compiled out of release frontends.
///
/// Note what does NOT call this: the `[Later]` button. It persists nothing at all, leaving
/// the field `None` so the invite returns next launch (see
/// [`WorkflowInviteOutcome`]'s header). A `[Later]` that wrote anything here would be the
/// bug that makes "Later" mean "never".
pub fn write_workflow_invite(
    data_dir: &Path,
    outcome: Option<WorkflowInviteOutcome>,
) -> Result<(), ConfigError> {
    super::update_settings(data_dir, |settings| {
        settings.workflow_invite = outcome;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ── Paydown WP8 — the lost-update window ─────────────────────────────────────────
    //
    // ⚠️ THIS TEST IS THE PREMISE CHECK FOR THE WHOLE WP. It must FAIL before the funnel
    // exists and PASS after, with the test itself unchanged. That before/after pair is the
    // verdict — a concurrency fix is exactly the class a green suite cannot vouch for.
    //
    // ⚠️ Why it is not a `thread::spawn` race: a real race is nondeterministic, so a passing
    // run would prove nothing and a flaky one would get deleted. Instead the interleaving is
    // FORCED — writer A reads, then writer B completes entirely, then A writes. That is a
    // legal interleaving of two concurrent RMWs (Tauri dispatches commands on a thread pool),
    // reproduced deterministically. If the funnel serializes correctly, this sequence cannot
    // occur at all, which is what the post-fix version asserts.

    /// **The hazard, reproduced on the RAW primitives.** Kept because it is what makes the next
    /// test meaningful: it proves the interleaving really does lose a field when a caller does its
    /// own read-modify-write, so the funnel is guarding a real property rather than a hypothetical.
    ///
    /// ⚠️ This is the shape EVERY per-field writer had before paydown WP8.
    #[test]
    fn raw_read_modify_write_loses_a_field_when_interleaved() {
        let dir = TempDir::new().unwrap();

        // Writer A reads first — its snapshot predates B entirely.
        let mut a_snapshot = read_settings(dir.path()).unwrap();

        // Writer B completes a whole read-modify-write inside A's window.
        crate::config_store::update_settings(dir.path(), |s| {
            s.time_tracking_enabled = Some(true);
            Ok(())
        })
        .unwrap();

        // A finishes against its stale snapshot, using the raw primitive.
        a_snapshot.pip_mode = Some(PipMode::Off);
        write_settings(dir.path(), &a_snapshot).unwrap();

        let after = read_settings(dir.path()).unwrap();
        assert_eq!(after.pip_mode, Some(PipMode::Off), "A's field survived");
        assert_eq!(
            after.time_tracking_enabled, None,
            "B's field is clobbered — this is why write_settings must not be called directly"
        );
    }

    /// **THE WP8 PROPERTY: two concurrent funnelled writers both survive.** Real threads, real
    /// contention, one shared dir — the pre-funnel code loses one of these fields.
    ///
    /// ⚠️ Deliberately a REAL race rather than a forced interleaving, because the funnel's job is
    /// to make the interleaving impossible; forcing one would be testing the harness. Many
    /// iterations with two threads hammering different fields: without the lock, at least one
    /// iteration loses a field (verified by mutation — removing the guard fails this test).
    #[test]
    fn concurrent_funnelled_writers_never_lose_a_field() {
        use std::sync::Arc;
        let dir = Arc::new(TempDir::new().unwrap());

        // Enough iterations that an unsynchronized read→write window is hit in practice; each
        // iteration is a fresh pair of writes to two DIFFERENT fields.
        for i in 0..40 {
            // Reset to a known state through the funnel.
            crate::config_store::update_settings(dir.path(), |s| {
                s.time_tracking_enabled = None;
                s.pip_mode = None;
                Ok(())
            })
            .unwrap();

            let d1 = Arc::clone(&dir);
            let d2 = Arc::clone(&dir);
            let t1 = std::thread::spawn(move || {
                write_time_tracking_enabled(d1.path(), true).unwrap();
            });
            let t2 = std::thread::spawn(move || {
                write_pip_mode(d2.path(), PipMode::Off).unwrap();
            });
            t1.join().unwrap();
            t2.join().unwrap();

            let after = read_settings(dir.path()).unwrap();
            // ⚠️ BOTH must survive. The pre-WP8 code drops whichever writer read first.
            assert_eq!(
                after.time_tracking_enabled,
                Some(true),
                "iteration {i}: the tracking write was lost"
            );
            assert_eq!(
                after.pip_mode,
                Some(PipMode::Off),
                "iteration {i}: the pip-mode write was lost"
            );
        }
    }

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
    fn write_pip_layout_updates_the_field_and_tolerates_an_unknown_key() {
        // ⚠️ RENAMED at the 2026-08-12 paydown sweep. This was
        // `write_pip_layout_preserves_other_fields`, and its comment claimed "a newer build's
        // field survives an older build's write" — forward-compatibility. **It does not, and
        // this test never asserted that it did.** Measured directly: writing `pip_layout` over
        // a file containing `{"future_field":42}` leaves NO `future_field` on disk. The
        // read-modify-write round-trips through the typed struct, which drops unknown keys.
        //
        // The name and comment were a guarantee nobody had checked, and a future reader would
        // reasonably have relied on it when adding a field in a newer build.
        // (`SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION`.)
        //
        // What IS true, and what this asserts: an unknown key does not BREAK the read or the
        // write — the update still lands. That is tolerance, not preservation.
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
        // ...and the write completed despite the unknown key having been present.
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(raw.contains("vertical-mirror"));
        // The honest negative: the unknown key is GONE. Asserted rather than left implied, so
        // the real behavior is pinned and a future forward-compat fix fails here loudly
        // instead of quietly contradicting a stale comment.
        assert!(
            !raw.contains("future_field"),
            "unknown keys are dropped by the typed round-trip. If this now passes through, \
             that is a genuine forward-compat improvement — update this assertion and the \
             test name, which currently promise only TOLERANCE, not preservation."
        );
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
            workflow_features_enabled: Some(true),
            skipped_version: Some("0.9.9".to_string()),
            workflow_invite: Some(WorkflowInviteOutcome::Acknowledged),
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
    fn workflow_invite_defaults_to_none_and_round_trips_both_outcomes() {
        let dir = TempDir::new().unwrap();
        // Never shown yet — the only state that permits showing the invite. Both a fresh
        // install and an EXISTING install (whose settings.json predates this field) read
        // as None, which is correct for a brand-new feature.
        assert_eq!(read_workflow_invite(dir.path()).unwrap(), None);

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Acknowledged)).unwrap();
        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Acknowledged)
        );

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();
        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Dismissed)
        );

        // Back to None — reachable only via the dev-only reset seam, never a user action.
        write_workflow_invite(dir.path(), None).unwrap();
        assert_eq!(read_workflow_invite(dir.path()).unwrap(), None);
    }

    #[test]
    fn workflow_invite_serializes_kebab_case_for_the_ts_union() {
        // Cross-language contract: the TS side declares this union verbatim. A drift in
        // the wire strings desyncs the show-predicate silently — it would read an
        // unrecognized value, fail to deserialize, and the invite would either never
        // appear or reappear forever. Pin the literals.
        let dir = TempDir::new().unwrap();
        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Acknowledged)).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("\"workflow_invite\": \"acknowledged\""),
            "expected the literal \"acknowledged\" on the wire, got: {raw}"
        );

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("\"workflow_invite\": \"dismissed\""),
            "expected the literal \"dismissed\" on the wire, got: {raw}"
        );
    }

    #[test]
    fn an_unresolved_invite_leaves_the_file_byte_identical() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE `[Later]` PROPERTY, codified.
        //
        // `[Later]` must persist NOTHING — that is what makes "Later" mean later rather than
        // silently meaning "never". It was verified live at verify-self by hashing
        // settings.json before and after clicking the button (byte-identical), but that proof
        // died with the app process. This is the standing guard.
        //
        // Asserted as RAW BYTES, not via the typed reader: a reader-level check
        // (`read_workflow_invite() == None`) would still pass if a write reformatted the file,
        // reordered keys, or added `"workflow_invite": null` — all of which are observable
        // "Later wrote something" regressions. Bytes are the honest unit here, and they are
        // exactly what the live shasum check compared.
        //
        // ## PROVEN LIMIT — read this before trusting it further than it goes
        // This does NOT detect a write whose OUTPUT is byte-identical. Verified by injection:
        // making `read_workflow_invite` call `write_settings` with the struct it just read
        // leaves this test GREEN, because serializing the same typed value produces the same
        // bytes. So the guard catches a write that CHANGES the file, not the mere act of
        // writing.
        //
        // That limit is acceptable here because the regression this protects against is
        // *observable divergence* — a `[Later]` that records an outcome, adds a null key, or
        // reformats. A no-op rewrite is wasteful but behaviorally invisible, and catching it
        // would need mtime/inode inspection, which is flaky under fast test clocks.
        //
        // Recorded rather than quietly left as an implied stronger claim: an unstated limit is
        // how a guard comes to be trusted for something it never checked.
        //
        // Note also what this does NOT assert: that the frontend's [Later] handler avoids
        // calling the writer. That is a frontend concern, pinned separately by a wiring guard
        // in workflowInviteCopy.test.ts. Together they cover both halves — the button doesn't
        // call it, and the store wouldn't diverge if something else did.
        // ═══════════════════════════════════════════════════════════════════════════
        let dir = TempDir::new().unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        write_workflow_features_enabled(dir.path(), false).unwrap();

        let file = dir.path().join(SETTINGS_FILE);
        let before = std::fs::read(&file).unwrap();

        // The whole point: reading the invite state (which the show-predicate does on every
        // launch) must not mutate the file, and no write happens on the [Later] path at all.
        assert_eq!(read_workflow_invite(dir.path()).unwrap(), None);
        assert_eq!(read_workflow_invite(dir.path()).unwrap(), None); // twice — catch lazy init

        let after = std::fs::read(&file).unwrap();
        assert_eq!(
            before, after,
            "reading an unresolved invite must leave settings.json byte-identical — a \
             [Later] that persists anything silently becomes a [Dismiss]"
        );
    }

    #[test]
    fn dismiss_and_acknowledge_are_distinguishable_on_disk() {
        // Both resolve the invite permanently, but they are NOT interchangeable: `acknowledged`
        // records "routed to Settings, don't re-pitch" while `dismissed` records "stop asking".
        // If a future edit collapsed them to one value, the product behavior would look
        // identical today — and would silently lose the ability to tell an engaged user from a
        // rejecting one, which is the distinction the enum exists for.
        let dir = TempDir::new().unwrap();

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Acknowledged)).unwrap();
        let ack = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();
        let dis = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();

        assert_ne!(
            ack, dis,
            "the two resolved outcomes must be distinguishable on disk"
        );
        assert!(ack.contains("acknowledged"));
        assert!(dis.contains("dismissed"));
    }

    #[test]
    fn a_resolved_invite_survives_a_gate_toggle() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The disable-after-enable case, at the persistence layer.
        //
        // The two fields must stay INDEPENDENT. A user who saw the invite, enabled the
        // features, tried them, then disabled them lands back at
        // workflow_features_enabled == false — the same gate state as someone who never
        // saw the invite. If a gate write clobbered the invite outcome (or the outcome
        // were derived from the gate), they'd be re-pitched something they already
        // evaluated and rejected. Read-modify-write is what prevents it; this asserts it.
        // ═══════════════════════════════════════════════════════════════════════════
        let dir = TempDir::new().unwrap();
        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Acknowledged)).unwrap();

        write_workflow_features_enabled(dir.path(), true).unwrap();
        write_workflow_features_enabled(dir.path(), false).unwrap();

        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Acknowledged),
            "a gate toggle must not disturb the invite's lifecycle marker"
        );
        assert!(!read_workflow_features_enabled(dir.path()).unwrap());
    }

    #[test]
    fn writing_the_invite_preserves_sibling_fields_and_tolerates_an_unknown_key() {
        // read-modify-write: updating the invite must not disturb the OTHER settings, and
        // an unknown key must not break the read.
        //
        // Note what is deliberately NOT asserted: that the unknown key survives on disk.
        // It does not — `AppSettings` is a typed struct with no `#[serde(flatten)]`
        // catch-all, so a read-modify-write round-trip drops keys it doesn't know. An
        // earlier draft of this test asserted survival and failed, having copied the
        // *claim* in `write_pip_layout_preserves_other_fields`'s name and comment ("must
        // not be clobbered") rather than its actual assertion — that test's own inline
        // note concedes the round-trip drops the key. Left explicit here so the next
        // reader doesn't re-derive the same wrong expectation from the sibling's name.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"time_tracking_enabled":true,"future_field":42}"#,
        )
        .unwrap();

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();

        // The unknown key did not break the read, and the sibling field round-tripped.
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Dismissed)
        );
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

    // ── M10.9 WP2 — the workflow-features gate ─────────────────────────────────
    #[test]
    fn workflow_features_default_to_false_when_unset() {
        // The milestone's load-bearing default: OFF for everyone, operator included. A
        // fresh install / missing field reads as false, so no workflow-coupled surface
        // can exist out of the box.
        let dir = TempDir::new().unwrap();
        assert!(!read_workflow_features_enabled(dir.path()).unwrap());
    }

    #[test]
    fn workflow_features_absent_in_present_file_reads_as_false() {
        // Forward-compat: every settings.json written before M10.9 predates this field,
        // so EVERY existing install must read OFF — not just fresh ones.
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(SETTINGS_FILE),
            br#"{"pip_mode":"auto","cc_permission_mode":"plan","time_tracking_enabled":true}"#,
        )
        .unwrap();
        assert!(!read_workflow_features_enabled(dir.path()).unwrap());
    }

    #[test]
    fn workflow_features_round_trip_both_values() {
        let dir = TempDir::new().unwrap();
        write_workflow_features_enabled(dir.path(), true).unwrap();
        assert!(read_workflow_features_enabled(dir.path()).unwrap());
        write_workflow_features_enabled(dir.path(), false).unwrap();
        assert!(!read_workflow_features_enabled(dir.path()).unwrap());
    }

    #[test]
    fn workflow_features_independent_of_its_exercised_siblings() {
        // Read-modify-write across the full struct: flipping the gate must not clobber any
        // sibling setting, and updating a sibling must not clobber the gate.
        //
        // ⚠️ RENAMED at the 2026-08-12 paydown sweep — it was
        // `..._independent_of_the_other_seven_fields`, and the count went stale the moment a
        // ninth field landed. A number in a test name is a maintenance obligation nobody
        // signed up for, and the correction below had been living six lines into a comment
        // where a reader scanning names would never see it. The name now describes the
        // PROPERTY, which cannot go stale.
        // (`SURFACE-2026-07-29-QUALITY-WP3-STALE-SIBLING-TEST-NAME`.)
        //
        // NOTE (M10.9 WP3): this exercises seven siblings, but the struct carries NINE fields
        // — `workflow_invite` is deliberately NOT exercised here. Its own coverage is
        // `workflow_invite_independent_of_its_exercised_siblings` above, the symmetric test
        // written from the new field's side. Left that way rather than widened:
        // each field's independence test asserting from its own side is the pattern, and
        // widening this one would duplicate the other.
        let dir = TempDir::new().unwrap();
        write_pip_layout(dir.path(), PipLayout::VerticalMirror).unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        write_cc_permission_mode(dir.path(), CcPermissionMode::Plan).unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        write_update_notifications_enabled(dir.path(), false).unwrap();
        write_skipped_version(dir.path(), Some("1.2.3".to_string())).unwrap();

        write_workflow_features_enabled(dir.path(), true).unwrap();

        // Every sibling survived the gate write.
        assert_eq!(
            read_pip_layout(dir.path()).unwrap(),
            PipLayout::VerticalMirror
        );
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Plan
        );
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        assert!(!read_update_notifications_enabled(dir.path()).unwrap());
        assert_eq!(
            read_skipped_version(dir.path()).unwrap().as_deref(),
            Some("1.2.3")
        );
        assert!(read_workflow_features_enabled(dir.path()).unwrap());

        // ...and updating a sibling leaves the gate intact.
        write_pip_mode(dir.path(), PipMode::On).unwrap();
        assert!(read_workflow_features_enabled(dir.path()).unwrap());
    }

    #[test]
    fn workflow_invite_independent_of_its_exercised_siblings() {
        // ⚠️ RENAMED at the 2026-08-12 paydown sweep (was `..._of_the_other_eight_fields`),
        // for the same reason as its twin above: a COUNT in a test name goes stale the moment
        // a field lands, and nobody updates it. The name states the property instead.
        //
        // THE CONSUMING-SURFACE TEST for Phase 1's integration boundary (M10.9 WP3).
        //
        // `settings.rs` is read by every existing settings IPC handler
        // (workflow_get_features_enabled, time_get_tracking_enabled,
        // updater_get_notifications_enabled, pip_set_mode, …). Adding a field to the shared
        // struct means the new WRITER could clobber any of them via a botched
        // read-modify-write — and that regression would surface as a user's PiP mode or
        // permission mode silently resetting, which no test of the new field alone catches.
        //
        // This is the codified form of what verify-human approved against a copy of the
        // operator's real settings.json. `a_resolved_invite_survives_a_gate_toggle` covers
        // only the gate↔invite pair; this covers all eight siblings in both directions.
        let dir = TempDir::new().unwrap();
        write_pip_layout(dir.path(), PipLayout::Minimal).unwrap();
        write_pip_mode(dir.path(), PipMode::Off).unwrap();
        write_cc_permission_mode(dir.path(), CcPermissionMode::Plan).unwrap();
        write_time_tracking_enabled(dir.path(), true).unwrap();
        write_update_notifications_enabled(dir.path(), false).unwrap();
        write_skipped_version(dir.path(), Some("1.2.3".to_string())).unwrap();
        write_workflow_features_enabled(dir.path(), true).unwrap();

        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();

        // Every sibling survived the invite write.
        assert_eq!(read_pip_layout(dir.path()).unwrap(), PipLayout::Minimal);
        assert_eq!(read_pip_mode(dir.path()).unwrap(), PipMode::Off);
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::Plan
        );
        assert!(read_time_tracking_enabled(dir.path()).unwrap());
        assert!(!read_update_notifications_enabled(dir.path()).unwrap());
        assert_eq!(
            read_skipped_version(dir.path()).unwrap().as_deref(),
            Some("1.2.3")
        );
        assert!(read_workflow_features_enabled(dir.path()).unwrap());
        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Dismissed)
        );

        // ...and updating each sibling leaves the invite marker intact. Iterating the
        // writers matters: the invite is the field that must survive ANY other write, since
        // a lost marker re-pitches a user who already resolved it.
        write_pip_mode(dir.path(), PipMode::On).unwrap();
        write_time_tracking_enabled(dir.path(), false).unwrap();
        write_workflow_features_enabled(dir.path(), false).unwrap();
        assert_eq!(
            read_workflow_invite(dir.path()).unwrap(),
            Some(WorkflowInviteOutcome::Dismissed),
            "the invite marker must survive every sibling write — losing it re-pitches a \
             user who already resolved the invite"
        );
    }

    #[test]
    fn workflow_invite_on_disk_key_is_the_pinned_persistence_contract() {
        // Same tier and same reason as the gate's key pin below: the JSON key is a contract
        // with every already-installed copy of the app. The serde attribute derives the key
        // from the Rust field name, so a well-meaning field rename is exactly the edit that
        // breaks it — and here the breakage is uniquely nasty. A renamed key makes the
        // reader find nothing, which reads as `None` = "never shown", so **every user who
        // already dismissed the invite gets re-pitched it**. That is the one outcome the
        // one-time-invite design exists to prevent, and it would ship silently.
        let dir = TempDir::new().unwrap();
        write_workflow_invite(dir.path(), Some(WorkflowInviteOutcome::Dismissed)).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("\"workflow_invite\": \"dismissed\""),
            "the resolved invite must persist under exactly this key: {raw}"
        );

        // Unlike the gate (which writes an explicit `false`), clearing the invite DROPS the
        // key entirely — `skip_serializing_if = "Option::is_none"`. That asymmetry is
        // correct and load-bearing: absent IS the meaningful "unresolved" state, whereas the
        // gate needs OFF distinguishable from never-set. Pin it so a future edit doesn't
        // "helpfully" start writing `null`, which would deserialize as None but make the
        // file misleading to read.
        write_workflow_invite(dir.path(), None).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            !raw.contains("workflow_invite"),
            "a cleared invite must drop the key entirely, not write null: {raw}"
        );
    }

    #[test]
    fn workflow_features_on_disk_key_is_the_pinned_persistence_contract() {
        // The JSON key is a contract with every already-installed copy of the app: rename
        // it and every user who enabled the gate silently reverts to OFF (the reader finds
        // no field and defaults false) with no error and no migration path. The serde
        // attribute means the key is derived from the Rust field name, so a well-meaning
        // field rename is exactly the edit that breaks it. Assert the raw on-disk text —
        // same tier as `write_cc_permission_mode_clears_legacy_cc_yolo`, because that is
        // where the contract actually lives.
        let dir = TempDir::new().unwrap();
        write_workflow_features_enabled(dir.path(), true).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("\"workflow_features_enabled\": true"),
            "the enabled gate must persist under exactly this key: {raw}"
        );

        // ...and turning it back OFF writes an explicit `false` rather than dropping the
        // key. Both states must be distinguishable on disk from "never set" — WP3's invite
        // show-predicate reads the gate, and a disable that erased the key would be
        // indistinguishable from a fresh install.
        write_workflow_features_enabled(dir.path(), false).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("\"workflow_features_enabled\": false"),
            "an explicitly-disabled gate must persist as false, not vanish: {raw}"
        );
    }

    #[test]
    fn workflow_features_write_preserves_the_legacy_cc_yolo_for_its_own_migrator() {
        // Pins the CORRECT ownership boundary between writers, which is subtler than it
        // looks. `cc_yolo` self-cleans ONLY because `write_cc_permission_mode` contains an
        // explicit `settings.cc_yolo = None` (settings.rs:214) — it is NOT a struct-level
        // property of `skip_serializing_if`, which skips a field only when it is already
        // `None`. Since every writer is a read-modify-write over the whole struct, an
        // unrelated writer that "helpfully" cleared the legacy field would DESTROY a
        // pre-dropdown user's yolo setting before `read_cc_permission_mode` ever got to
        // migrate it.
        //
        // So the gate's writer must leave `cc_yolo` exactly as it found it: not its field,
        // not its migration. This test fails if someone later adds a well-meaning
        // `settings.cc_yolo = None` here.
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(SETTINGS_FILE), br#"{"cc_yolo":true}"#).unwrap();

        write_workflow_features_enabled(dir.path(), true).unwrap();

        let raw = std::fs::read_to_string(dir.path().join(SETTINGS_FILE)).unwrap();
        assert!(
            raw.contains("cc_yolo"),
            "an unrelated writer must not consume another field's migration: {raw}"
        );
        // The legacy value survives intact and still migrates correctly afterwards...
        assert_eq!(
            read_cc_permission_mode(dir.path()).unwrap(),
            CcPermissionMode::BypassPermissions,
            "cc_yolo:true must still migrate to bypassPermissions after a gate write"
        );
        // ...and the gate itself persisted, without inheriting the legacy boolean's value.
        assert!(read_workflow_features_enabled(dir.path()).unwrap());
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
