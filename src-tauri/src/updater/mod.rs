//! M10 — In-app auto-updater (self-quarantine-clear on unsigned relaunch).
//!
//! Claudesk is unsigned/un-notarized (locked decision: stay unsigned + minisign,
//! no $99 Apple Developer Program). When the updater downloads `Claudesk.app.tar.gz`,
//! extracts it, replaces the running bundle in place, and relaunches, macOS Gatekeeper
//! can block the freshly-written unsigned bundle as "damaged / cannot be opened"
//! unless its `com.apple.quarantine` xattr is cleared. This module owns the
//! **self-clear** mechanism: the running app clears the quarantine xattr on its own
//! freshly-installed bundle *after* `install()` and *before* `relaunch()`.
//!
//! ## The macOS install() seam (established by the WP1 probe, reading
//! ## `tauri-plugin-updater-2.10.1` source; do not re-derive)
//! - macOS `Update::install()` extracts the new `.app`, backs up the current one,
//!   moves the new bundle into `extract_path` (the resolved `/Applications/<app>.app`
//!   root), `touch`es it, and **returns `Ok(())` WITHOUT relaunching** (unlike the
//!   Windows path, which `std::process::exit(0)`s). So on macOS `install()` hands
//!   control back — there is a **clean seam** to run the quarantine self-clear
//!   *after* `install()` and *before* the explicit `relaunch()` (tauri-plugin-process).
//! - minisign verification happens INSIDE `download()` (over the downloaded buffer
//!   vs the configured pubkey); a wrong/tampered signature fails `download()` before
//!   any install — also the cancel-safe boundary (cancel = don't call `install()`).
//! - `install()` only escalates to an admin AppleScript prompt when the initial
//!   in-place `rename` hits `PermissionDenied` — a user-owned `/Applications` bundle
//!   renames fine, so no admin prompt on the normal direct-download path.
//!
//! ## Layout (mirrors the pure-core / IPC-shell split used across the codebase)
//! - **[`resolve_bundle_path`]** — pure: given the current-exe path, walk up past
//!   `Contents/MacOS/<bin>` to the `<app>.app` root (the same resolution the plugin's
//!   `extract_path_from_executable` does). Returns `None` if not inside a `.app`.
//! - **[`quarantine_clear_command`]** — pure `(program, args)` builder:
//!   `xattr -dr com.apple.quarantine <bundle>`. No `sudo` — the running app owns its
//!   own bundle, so clearing its own xattrs needs no elevation.
//! - **[`clear_own_quarantine`]** — resolves the running app's bundle and runs the
//!   self-clear synchronously (`std::process::Command::status`). Returns the resolved
//!   path on success so the caller can log/relaunch.
//! - **[`commands`]** — the Tauri commands driving the production update flow
//!   (`updater_check` + `updater_apply`).
//!
//! WP1 note: this module's pure core + tests are the durable output of the M10 WP1
//! probe (verify-codify pinned them as the shipping self-clear logic); WP2 promoted
//! them here from the throwaway `updater_probe` module and built the production flow
//! commands around them. The live installed-build Gatekeeper GO/FALLBACK verdict is
//! operator-deferred into WP6's end-to-end verify — this module implements the
//! GO-path self-clear; a FALLBACK verdict would add a WP4 instruct-user dialog
//! without changing this flow.

pub mod commands;

use std::path::{Path, PathBuf};
use std::process::Command;

use thiserror::Error;

/// The macOS extended-attribute tool. Always present on macOS.
const XATTR_BIN: &str = "xattr";
/// The quarantine xattr Gatekeeper enforces on downloaded/created bundles.
const QUARANTINE_ATTR: &str = "com.apple.quarantine";

/// Errors crossing the `updater` self-clear boundary. Tauri commands map these to `String`.
#[derive(Debug, Error)]
pub enum UpdaterError {
    /// The running executable is not inside a `.app` bundle (can't self-clear).
    #[error("could not resolve own .app bundle from executable path: {0}")]
    BundleUnresolved(String),
    /// Spawning/awaiting the `xattr` process failed.
    #[error("failed to run xattr quarantine clear: {0}")]
    Xattr(String),
    /// `xattr` ran but exited non-zero.
    #[error("xattr exited non-zero ({code}) clearing quarantine on {path}")]
    XattrNonZero { code: i32, path: String },
}

/// Given the current executable path, resolve the enclosing `<app>.app` bundle root.
///
/// A macOS app binary lives at `…/<App>.app/Contents/MacOS/<bin>`. This walks up
/// three levels (`<bin>` → `MacOS` → `Contents` → `<App>.app`) when the path is
/// inside a `Contents/MacOS` dir, matching the plugin's own `extract_path`
/// resolution. Returns `None` when the exe is not inside a `.app` (e.g. a bare
/// `cargo run` target binary in `target/release/`), which is the expected dev case.
pub fn resolve_bundle_path(current_exe: &Path) -> Option<PathBuf> {
    // …/Contents/MacOS/<bin>  → parent=MacOS, parent=Contents, parent=<App>.app
    let macos_dir = current_exe.parent()?; // …/Contents/MacOS
    if macos_dir.file_name()?.to_str()? != "MacOS" {
        return None;
    }
    let contents_dir = macos_dir.parent()?; // …/Contents
    if contents_dir.file_name()?.to_str()? != "Contents" {
        return None;
    }
    let app_dir = contents_dir.parent()?; // …/<App>.app
    if app_dir.extension()?.to_str()? != "app" {
        return None;
    }
    Some(app_dir.to_path_buf())
}

/// Build the `(program, args)` to recursively clear the quarantine xattr on `bundle`:
/// `xattr -dr com.apple.quarantine <bundle>`. Pure — unit-testable with no spawn.
///
/// `-d` deletes the named attribute, `-r` recurses into the bundle (the freshly
/// extracted `.app` may carry quarantine on nested files, not just the root).
pub fn quarantine_clear_command(bundle: &Path) -> (String, Vec<String>) {
    (
        XATTR_BIN.to_string(),
        vec![
            "-dr".to_string(),
            QUARANTINE_ATTR.to_string(),
            bundle.to_string_lossy().into_owned(),
        ],
    )
}

/// Where the running Claudesk bundle was installed from — decides whether the in-app
/// updater may self-install (WP3: brew detect-and-defer).
///
/// - [`InstallSource::Homebrew`] — a Homebrew-cask install, symlink-managed under a
///   `…/Caskroom/…` path. The updater must NOT self-install into it (that desyncs
///   brew's version bookkeeping); it defers the user to `brew upgrade`.
/// - [`InstallSource::DirectDownload`] — a real `/Applications/Claudesk.app` (or any
///   non-brew) install, and the **safe default** when the source can't be determined
///   (dev binary not inside a `.app`, or a Gatekeeper-translocated bundle). A wrong
///   `DirectDownload` verdict at worst attempts a self-update; a wrong `Homebrew`
///   verdict would wrongly disable updates for a direct install — so we bias to
///   DirectDownload and only flip to Homebrew on a positive `/Caskroom/` match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallSource {
    /// Homebrew-cask managed (path contains a `/Caskroom/` segment) → defer to `brew upgrade`.
    Homebrew,
    /// Direct-download / `/Applications` (or unknown) → in-app self-update allowed.
    DirectDownload,
}

/// The path segment that marks a Homebrew-cask install. Matched as a *bounded* path
/// segment (`/Caskroom/`), NOT a bare substring, so a project dir or file that merely
/// contains the text "caskroom" cannot trip the gate.
const CASKROOM_SEGMENT: &str = "Caskroom";

/// Pure classification: given the (optionally-resolved) bundle path, decide the install
/// source. `None` (exe not inside a `.app`) ⇒ `DirectDownload` safe default.
///
/// A Homebrew cask stores the app under `…/Caskroom/<token>/<version>/<App>.app`, so a
/// brew-managed bundle path has a `Caskroom` **path component**. We check for the
/// component (via [`Path::components`]) rather than a `.contains("Caskroom")` substring
/// so a path like `/Users/me/Caskroom-notes/Claudesk.app` (a literal dir named
/// "Caskroom-notes") does not false-positive.
pub fn install_source_from_bundle(bundle: Option<&Path>) -> InstallSource {
    match bundle {
        Some(path) => {
            let is_brew = path.components().any(|c| {
                c.as_os_str()
                    .to_str()
                    .is_some_and(|s| s == CASKROOM_SEGMENT)
            });
            if is_brew {
                InstallSource::Homebrew
            } else {
                InstallSource::DirectDownload
            }
        }
        None => InstallSource::DirectDownload,
    }
}

/// Resolve the running app's install source: `current_exe()` → enclosing `.app` bundle
/// → `canonicalize()` (resolve the brew symlink chain to the real Caskroom path) →
/// [`install_source_from_bundle`].
///
/// Homebrew installs the `.app` in the Caskroom and symlinks it into `/Applications`;
/// whether `current_exe()` reports the symlink or the real path is macOS-version- and
/// launch-path-dependent, so we `canonicalize()` to always see the underlying Caskroom
/// path when it exists. Canonicalize failure (or an unresolved bundle) falls back to the
/// pre-canonicalized path, then to the `None` safe default — never blocks the flow.
pub fn install_source() -> InstallSource {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return InstallSource::DirectDownload,
    };
    let bundle = resolve_bundle_path(&exe);
    // Canonicalize the bundle path so a /Applications symlink into the Caskroom resolves
    // to the real …/Caskroom/… path. If canonicalize fails, use the raw bundle path.
    let resolved = bundle.as_deref().map(|b| b.canonicalize().unwrap_or_else(|_| b.to_path_buf()));
    install_source_from_bundle(resolved.as_deref())
}

/// Resolve the running app's own bundle and clear its quarantine xattr synchronously.
///
/// This is the GO-path mechanism: after `install()` writes the new unsigned bundle
/// into place, call this *before* `relaunch()` so Gatekeeper sees a de-quarantined
/// bundle and lets it open without the "damaged" block.
/// No `sudo` — a process may clear xattrs on a bundle it owns.
///
/// Returns the resolved bundle path on success. `BundleUnresolved` when not running
/// from a `.app` (the dev case — the caller treats that as "nothing to clear").
pub fn clear_own_quarantine(current_exe: &Path) -> Result<PathBuf, UpdaterError> {
    let bundle = resolve_bundle_path(current_exe)
        .ok_or_else(|| UpdaterError::BundleUnresolved(current_exe.display().to_string()))?;
    let (program, args) = quarantine_clear_command(&bundle);
    let status = Command::new(&program)
        .args(&args)
        .status()
        .map_err(|e| UpdaterError::Xattr(format!("{program}: {e}")))?;
    if !status.success() {
        return Err(UpdaterError::XattrNonZero {
            code: status.code().unwrap_or(-1),
            path: bundle.display().to_string(),
        });
    }
    Ok(bundle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_app_bundle_from_macos_binary() {
        let exe = Path::new("/Applications/Claudesk.app/Contents/MacOS/claudesk");
        let bundle = resolve_bundle_path(exe).expect("should resolve");
        assert_eq!(bundle, PathBuf::from("/Applications/Claudesk.app"));
    }

    #[test]
    fn resolves_app_bundle_with_spaces_in_path() {
        let exe = Path::new("/Applications/Claudesk Dev.app/Contents/MacOS/claudesk");
        let bundle = resolve_bundle_path(exe).expect("should resolve");
        assert_eq!(bundle, PathBuf::from("/Applications/Claudesk Dev.app"));
    }

    #[test]
    fn returns_none_for_bare_dev_binary() {
        // The `cargo run` / dev target binary is NOT inside a .app — self-clear is
        // a no-op there (the mechanism only matters on the installed build).
        let exe = Path::new("/Users/me/proj/src-tauri/target/release/claudesk");
        assert!(resolve_bundle_path(exe).is_none());
    }

    #[test]
    fn returns_none_when_not_under_contents_macos() {
        // A path that ends in a .app-looking dir but isn't the Contents/MacOS shape.
        let exe = Path::new("/Applications/Claudesk.app/claudesk");
        assert!(resolve_bundle_path(exe).is_none());
    }

    #[test]
    fn command_is_xattr_recursive_delete_of_quarantine_no_sudo() {
        let (program, args) = quarantine_clear_command(Path::new("/Applications/Claudesk.app"));
        assert_eq!(program, "xattr", "no sudo prefix — we own our own bundle");
        assert_eq!(
            args,
            vec![
                "-dr".to_string(),
                "com.apple.quarantine".to_string(),
                "/Applications/Claudesk.app".to_string(),
            ]
        );
    }

    #[test]
    fn command_preserves_spaced_bundle_path_as_one_arg() {
        let (_program, args) =
            quarantine_clear_command(Path::new("/Applications/Claudesk Dev.app"));
        // The bundle path is a single argv element (Command::args does not shell-split).
        assert_eq!(args[2], "/Applications/Claudesk Dev.app".to_string());
    }

    // --- WP3: install-source detection (brew detect-and-defer) ---

    #[test]
    fn caskroom_path_is_homebrew() {
        // The canonical brew-cask layout: …/Caskroom/<token>/<version>/<App>.app
        let bundle =
            Path::new("/opt/homebrew/Caskroom/claudesk/0.2.5/Claudesk.app");
        assert_eq!(
            install_source_from_bundle(Some(bundle)),
            InstallSource::Homebrew
        );
    }

    #[test]
    fn caskroom_path_intel_prefix_is_homebrew() {
        // Intel Homebrew prefix (/usr/local) — still a Caskroom segment.
        let bundle =
            Path::new("/usr/local/Caskroom/claudesk/0.2.5/Claudesk.app");
        assert_eq!(
            install_source_from_bundle(Some(bundle)),
            InstallSource::Homebrew
        );
    }

    #[test]
    fn applications_path_is_direct_download() {
        let bundle = Path::new("/Applications/Claudesk.app");
        assert_eq!(
            install_source_from_bundle(Some(bundle)),
            InstallSource::DirectDownload
        );
    }

    #[test]
    fn unresolved_bundle_is_direct_download_safe_default() {
        // No .app (dev binary) → the safe default is DirectDownload, not a wrong
        // Homebrew verdict that would disable updates.
        assert_eq!(
            install_source_from_bundle(None),
            InstallSource::DirectDownload
        );
    }

    #[test]
    fn caskroom_substring_in_name_does_not_false_positive() {
        // A dir literally named "Caskroom-notes" (or a file containing "caskroom")
        // must NOT match — we match a bounded path COMPONENT, not a substring.
        let bundle = Path::new("/Users/me/Caskroom-notes/Claudesk.app");
        assert_eq!(
            install_source_from_bundle(Some(bundle)),
            InstallSource::DirectDownload,
            "a dir named Caskroom-notes is not a Caskroom segment"
        );
        let bundle2 = Path::new("/Users/me/my-caskroom-backup/Claudesk.app");
        assert_eq!(
            install_source_from_bundle(Some(bundle2)),
            InstallSource::DirectDownload
        );
    }

    #[test]
    fn translocated_path_is_direct_download() {
        // A Gatekeeper-translocated bundle runs from a randomized AppTranslocation
        // path — neither /Caskroom/ nor /Applications. The safe default applies.
        let bundle = Path::new(
            "/private/var/folders/ab/xxxx/T/AppTranslocation/UUID/d/Claudesk.app",
        );
        assert_eq!(
            install_source_from_bundle(Some(bundle)),
            InstallSource::DirectDownload
        );
    }
}
