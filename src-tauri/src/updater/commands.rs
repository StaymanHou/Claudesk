//! M10 — Tauri commands driving the production update flow.
//!
//! Two commands, split to match the check-then-confirm-then-apply UX (a bare confirm
//! in WP2's minimal trigger; WP4 replaces the trigger with the polished non-modal
//! notify / menu-item / skip-list surface — the commands are the stable seam both use):
//! - [`updater_check`] — `check()` only; returns the current + available version (or
//!   "up to date"). Cheap, no side effects — the pre-flight the UI shows before asking
//!   the user to confirm. Minisign is NOT exercised here (that happens in `download()`).
//! - [`updater_apply`] — the full flow: `check → download (minisign-verified) →
//!   install → clear_own_quarantine → relaunch`. Returns only on failure (a successful
//!   relaunch replaces the process).
//!
//! The self-clear sits between `install()` and `relaunch()` per the macOS-install()-
//! returns seam documented in `super` — see that module's header. `download()` verifies
//! the minisign signature internally, so a tampered/wrong-key artifact fails there,
//! before any install (the cancel-safe boundary).
//!
//! ## One self-update path — no install-source gate (M10 WP6 Phase B1, decision reversal)
//! An earlier WP3 iteration branched on the install source (Homebrew vs direct download)
//! and made brew installs DEFER to `brew upgrade` instead of self-updating. That decision
//! was **reversed** (`SURFACE-2026-07-17-M10-BREW-DECISION-REVERSED-TO-SELF-UPDATE`): brew
//! installs now self-update in-app exactly like a direct download (the cask declares
//! `auto_updates true` + each release bumps `CFBundleVersion`, so a later `brew upgrade`
//! reconciles via `Info.plist`, PR #21882, rather than downgrading). Both commands now run
//! the SAME flow for every install — no source classification, no brew short-circuit, no
//! brew-refusal branch.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// Broadcast fired when the update-notification toggle changes (M10 WP4). The picker
/// checkbox listens so a change from any surface re-syncs it. Pinned stable by a test.
pub const UPDATER_NOTIFICATIONS_ENABLED_EVENT: &str = "updater-notifications-enabled";

/// Event emitted from [`updater_apply`]'s `download()` callback carrying real download
/// progress (M10 WP4 Phase 2, Q2 — a REAL progress bar, not an indeterminate spinner).
/// The frontend subscribes and renders a `%` bar. Pinned stable by a test.
pub const UPDATER_DOWNLOAD_PROGRESS_EVENT: &str = "updater-download-progress";

/// Download-progress payload. `downloaded` is the CUMULATIVE bytes received so far
/// (`updater_apply` accumulates the plugin's per-chunk length); `total` is the
/// content-length the server reported (`None` when the server omits it — the FE then
/// shows an indeterminate bar). `done` marks the final emit fired from the plugin's
/// `on_download_finish` (so the FE can flip to 100%/installing without a divide).
#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
}

/// Result of a check: what the running app is vs. what the manifest offers.
#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    /// The running app's version (from the bundle).
    pub current_version: String,
    /// `Some(v)` when the manifest advertises a newer version; `None` when up to date.
    pub available_version: Option<String>,
    /// Human-readable status line for the UI.
    pub status: String,
}

/// `check()` the updater endpoint and report versions. No download, no install.
///
/// Confirms the `latest.json` endpoint is reachable, the manifest parses, and the
/// target key matches — the pre-flight before asking the user to confirm an update.
/// Minisign is NOT exercised here (that happens in `download()`).
#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = app.package_info().version.to_string();

    // One self-update path for every install (M10 WP6 Phase B1). No install-source
    // classification — brew and direct-download both run the same real network check().
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;
    match updater.check().await.map_err(|e| format!("check: {e}"))? {
        Some(update) => Ok(UpdateCheckResult {
            current_version: update.current_version.clone(),
            available_version: Some(update.version.clone()),
            status: format!(
                "Update available: {} → {}",
                update.current_version, update.version
            ),
        }),
        None => {
            // No Update returned — running version already read from package info above.
            Ok(UpdateCheckResult {
                current_version: current.clone(),
                available_version: None,
                status: format!("Up to date (running {current})"),
            })
        }
    }
}

/// Drive the FULL update flow: check → download → install → self-clear → relaunch.
///
/// - `download()` verifies the minisign signature over the downloaded bytes vs the
///   configured pubkey (verification is inside `download`). A tampered or wrong-key
///   artifact fails HERE, before any install — the cancel-safe boundary.
/// - `install()` extracts + replaces the bundle in place and (on macOS) RETURNS
///   without relaunching, leaving the seam for the self-clear.
/// - [`clear_own_quarantine`](super::clear_own_quarantine) runs `xattr -dr
///   com.apple.quarantine <own bundle>` — the GO-path unsigned-relaunch mechanism.
/// - `relaunch()` (tauri-plugin-process via `app.restart()`) replaces the process;
///   on success this function does not return.
///
/// Returns `Err(String)` on any failure so the UI sees WHERE it broke (no update /
/// download+verify / install / self-clear). A clean relaunch is the success path.
#[tauri::command]
pub async fn updater_apply(app: AppHandle) -> Result<String, String> {
    // One self-update path for every install (M10 WP6 Phase B1) — no install-source gate.
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("check: {e}"))?
        .ok_or_else(|| "no update available (manifest version not newer)".to_string())?;

    let from = update.current_version.clone();
    let to = update.version.clone();

    // download() streams the artifact and verifies its minisign signature internally.
    // WP4 Phase 2 (Q2): a REAL progress bar. The plugin's `on_chunk(chunk_len,
    // content_length)` fires per chunk with the chunk's length (NOT cumulative), so we
    // accumulate `downloaded` ourselves; `content_length` is the server's total (`None`
    // when omitted → the FE shows an indeterminate bar). Each chunk emits an
    // `updater-download-progress` event the frontend subscribes to; `on_download_finish`
    // emits a final `done: true`. `app.emit` is thread-safe (no main-thread marshal
    // needed here — unlike PiP window ops). Split from install() so cancel has a clean
    // boundary — cancel before install leaves the running app untouched.
    let progress_app = app.clone();
    let finish_app = app.clone();
    let mut downloaded: u64 = 0;
    let bytes = update
        .download(
            move |chunk_len, content_length| {
                downloaded = downloaded.saturating_add(chunk_len as u64);
                let _ = progress_app.emit(
                    UPDATER_DOWNLOAD_PROGRESS_EVENT,
                    DownloadProgress {
                        downloaded,
                        total: content_length,
                        done: false,
                    },
                );
            },
            move || {
                let _ = finish_app.emit(
                    UPDATER_DOWNLOAD_PROGRESS_EVENT,
                    DownloadProgress {
                        downloaded: 0,
                        total: None,
                        done: true,
                    },
                );
            },
        )
        .await
        .map_err(|e| format!("download+verify (minisign) failed: {e}"))?;

    // install() extracts + replaces the bundle in place; returns on macOS.
    update
        .install(&bytes)
        .map_err(|e| format!("install: {e}"))?;

    // Clear quarantine on our own freshly-installed bundle before relaunch so the
    // unsigned bundle opens clean past Gatekeeper.
    let current_exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    match super::clear_own_quarantine(&current_exe) {
        Ok(bundle) => {
            eprintln!("[updater] cleared quarantine on {}", bundle.display());
        }
        Err(super::UpdaterError::BundleUnresolved(p)) => {
            // Dev build (not inside a .app) — nothing to clear. In the installed build
            // this branch should never hit.
            eprintln!("[updater] not inside a .app ({p}); skipping self-clear (dev build?)");
        }
        Err(e) => return Err(format!("self-clear quarantine failed: {e}")),
    }

    // relaunch — replaces the process with the newly-installed bundle. Does not return
    // on success. `restart()` diverges (-> !), so nothing after it runs.
    eprintln!("[updater] relaunching {from} -> {to}");
    app.restart();
}

// ── M10 WP4 — user-control prefs (get/set over config_store, per bundle-identity) ──
//
// Two prefs mirror M9's `time_get/set_tracking_enabled`: `update_notifications_enabled`
// (default ON — the auto-check-on-launch gate) and `skipped_version` (the tag the user
// chose to never re-notify about; the frontend notify layer suppresses it, a manual
// check ignores it). The skip/disable FILTERING is frontend-side (Q1, arch.md): these
// commands just persist + read the raw values; `updater_check`/`updater_apply` stay pure.

/// Read the update-notification toggle (default `true`/ON). Thin wrapper over
/// [`read_update_notifications_enabled`](crate::config_store::settings::read_update_notifications_enabled).
#[tauri::command]
pub fn updater_get_notifications_enabled(app: AppHandle) -> Result<bool, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::read_update_notifications_enabled(&dir)
        .map_err(|e| e.to_string())
}

/// Set the update-notification toggle. Persists it, then broadcasts
/// [`UPDATER_NOTIFICATIONS_ENABLED_EVENT`] so the picker checkbox re-syncs. Mirror of
/// `time_set_tracking_enabled`.
#[tauri::command]
pub fn updater_set_notifications_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::write_update_notifications_enabled(&dir, enabled)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(UPDATER_NOTIFICATIONS_ENABLED_EVENT, enabled);
    Ok(())
}

/// Read the skipped-version tag (`None` when nothing skipped). Thin wrapper over
/// [`read_skipped_version`](crate::config_store::settings::read_skipped_version).
#[tauri::command]
pub fn updater_get_skipped_version(app: AppHandle) -> Result<Option<String>, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::read_skipped_version(&dir).map_err(|e| e.to_string())
}

/// Persist the skipped-version tag (`None` clears the skip). No broadcast — the skip is
/// a single-consumer pref (the notify gate reads it on the next check); add one only if
/// a second live surface appears. Mirror of `write_skipped_version`.
#[tauri::command]
pub fn updater_set_skipped_version(app: AppHandle, version: Option<String>) -> Result<(), String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::write_skipped_version(&dir, version).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_enabled_event_name_is_stable() {
        // The frontend `updaterPrefs.ts` hardcodes this string to listen for the toggle
        // broadcast — pin it so a rename can't silently desync the two sides.
        assert_eq!(
            UPDATER_NOTIFICATIONS_ENABLED_EVENT,
            "updater-notifications-enabled"
        );
    }

    #[test]
    fn download_progress_event_name_is_stable() {
        // The frontend `updaterPrefs.ts` subscribes to this exact string for the progress
        // bar — pin it so a rename can't silently break the bar.
        assert_eq!(UPDATER_DOWNLOAD_PROGRESS_EVENT, "updater-download-progress");
    }

    #[test]
    fn download_progress_payload_serializes_snake_case_shape() {
        // The FE `DownloadProgress` TS interface reads `downloaded`/`total`/`done` — pin
        // the serde field names + Option/bool shape so the two sides can't drift.
        let mid = DownloadProgress {
            downloaded: 1024,
            total: Some(4096),
            done: false,
        };
        let json = serde_json::to_value(&mid).unwrap();
        assert_eq!(json["downloaded"], 1024);
        assert_eq!(json["total"], 4096);
        assert_eq!(json["done"], false);

        // The finish emit: total absent (null), done true — the FE flips to 100%/installing.
        let fin = DownloadProgress {
            downloaded: 0,
            total: None,
            done: true,
        };
        let json = serde_json::to_value(&fin).unwrap();
        assert!(json["total"].is_null());
        assert_eq!(json["done"], true);
    }

    #[test]
    fn update_check_result_has_no_install_source_field() {
        // M10 WP6 Phase B1 (decision reversal): the install-source gate was removed, so
        // `UpdateCheckResult` no longer carries an `install_source` field — every install
        // takes the one self-update path. Pin the serialized SHAPE so the field can't
        // silently return: exactly three keys, none of them `install_source`. The frontend
        // `UpdateCheckResult` interface mirrors this (updaterPrefs.ts).
        let result = UpdateCheckResult {
            current_version: "0.2.6".to_string(),
            available_version: Some("0.2.7".to_string()),
            status: "Update available: 0.2.6 → 0.2.7".to_string(),
        };
        let json = serde_json::to_value(&result).unwrap();
        let obj = json.as_object().expect("serializes to a JSON object");
        assert!(
            !obj.contains_key("install_source"),
            "the install-source gate was removed — no `install_source` field"
        );
        assert_eq!(
            obj.len(),
            3,
            "exactly current_version + available_version + status"
        );
    }
}
