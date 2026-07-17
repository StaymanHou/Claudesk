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
//! ## WP3 — brew detect-and-defer gate
//! Both commands first classify the install source ([`super::install_source`]). A
//! Homebrew-cask install must NOT self-install (it would desync brew's version
//! bookkeeping) — so `updater_check` short-circuits BEFORE any network `check()` and
//! reports a "run `brew upgrade`" defer status, and `updater_apply` refuses before any
//! download/install. Only a `DirectDownload` install runs the normal flow.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use super::InstallSource;

/// The user-facing defer message for a Homebrew-managed install. Kept as one const so
/// `updater_check`'s status and `updater_apply`'s refusal error agree verbatim.
const BREW_DEFER_MSG: &str = "Installed via Homebrew — run `brew upgrade claudesk` to update";

/// Serialize an [`InstallSource`] to the stable string the frontend consumes.
fn install_source_str(src: InstallSource) -> &'static str {
    match src {
        InstallSource::Homebrew => "homebrew",
        InstallSource::DirectDownload => "direct-download",
    }
}

/// Result of a check: what the running app is vs. what the manifest offers.
#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    /// The running app's version (from the bundle).
    pub current_version: String,
    /// `Some(v)` when the manifest advertises a (newer) version; `None` when up to date
    /// OR when the install is Homebrew-managed (self-update deferred to `brew upgrade`).
    pub available_version: Option<String>,
    /// Human-readable status line for the UI.
    pub status: String,
    /// Where this build was installed from: `"homebrew"` (defer to `brew upgrade`) or
    /// `"direct-download"` (in-app self-update allowed). WP4's UX branches on this.
    pub install_source: String,
}

/// `check()` the updater endpoint and report versions. No download, no install.
///
/// Confirms the `latest.json` endpoint is reachable, the manifest parses, and the
/// target key matches — the pre-flight before asking the user to confirm an update.
/// Minisign is NOT exercised here (that happens in `download()`).
#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = app.package_info().version.to_string();

    // WP3: brew detect-and-defer — a Homebrew install never self-updates. Short-circuit
    // BEFORE the network check(): report the defer status, no available version.
    if super::install_source() == InstallSource::Homebrew {
        return Ok(UpdateCheckResult {
            current_version: current,
            available_version: None,
            status: BREW_DEFER_MSG.to_string(),
            install_source: install_source_str(InstallSource::Homebrew).to_string(),
        });
    }

    let direct = install_source_str(InstallSource::DirectDownload).to_string();
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;
    match updater.check().await.map_err(|e| format!("check: {e}"))? {
        Some(update) => Ok(UpdateCheckResult {
            current_version: update.current_version.clone(),
            available_version: Some(update.version.clone()),
            status: format!(
                "Update available: {} → {}",
                update.current_version, update.version
            ),
            install_source: direct,
        }),
        None => {
            // No Update returned — running version already read from package info above.
            Ok(UpdateCheckResult {
                current_version: current.clone(),
                available_version: None,
                status: format!("Up to date (running {current})"),
                install_source: direct,
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
    // WP3: belt-and-suspenders — the UI won't call apply for a brew install (the check
    // short-circuits to no-available-version), but the command must refuse too so no
    // caller can drive a self-install into a brew-managed bundle.
    if super::install_source() == InstallSource::Homebrew {
        return Err(format!(
            "{BREW_DEFER_MSG}; in-app update is disabled for Homebrew installs"
        ));
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_source_str_maps_stable_frontend_strings() {
        assert_eq!(install_source_str(InstallSource::Homebrew), "homebrew");
        assert_eq!(
            install_source_str(InstallSource::DirectDownload),
            "direct-download"
        );
    }

    #[test]
    fn brew_defer_message_points_to_brew_upgrade() {
        // The check status and the apply refusal both derive from this const — pin that
        // it actually tells the user to run `brew upgrade` (the WP3 defer affordance).
        assert!(
            BREW_DEFER_MSG.contains("brew upgrade"),
            "defer message must direct the user to `brew upgrade`"
        );
    }

    #[test]
    fn homebrew_source_short_circuits_to_defer_with_no_available_version() {
        // Reconstruct the exact response updater_check builds for a Homebrew install
        // (the command needs an AppHandle for the network path, but the brew branch is
        // pure — this pins its shape: no available version, brew defer status/source).
        let src = InstallSource::Homebrew;
        let result = UpdateCheckResult {
            current_version: "0.2.5".to_string(),
            available_version: None,
            status: BREW_DEFER_MSG.to_string(),
            install_source: install_source_str(src).to_string(),
        };
        assert_eq!(result.install_source, "homebrew");
        assert!(result.available_version.is_none());
        assert!(result.status.contains("brew upgrade"));
    }
}
