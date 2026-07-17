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

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Result of a check: what the running app is vs. what the manifest offers.
#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    /// The running app's version (from the bundle).
    pub current_version: String,
    /// `Some(v)` when the manifest advertises a (newer) version; `None` when up to date.
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
            // No Update returned — read the running version from the package info.
            let current = app.package_info().version.to_string();
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
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("check: {e}"))?
        .ok_or_else(|| "no update available (manifest version not newer)".to_string())?;

    let from = update.current_version.clone();
    let to = update.version.clone();

    // download() streams the artifact and verifies its minisign signature internally.
    // Progress callback is a no-op here (a real progress bar is WP4). Split from
    // install() so a future cancel (WP4) has a clean boundary — cancel before install
    // leaves the running app untouched.
    let bytes = update
        .download(|_chunk, _total| {}, || {})
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
