//! Runtime wiring for hook registration: resolve the real paths, deploy the hook
//! script to app-data, compose the registered command, and (un)install.
//!
//! The pure merge/file logic lives in [`super`]; this module adds only the
//! runtime-dependent pieces (the `AppHandle`-resolved app-data dir, the user's
//! `~/.claude/settings.json` location, the bundled-resource copy + chmod) and the
//! single IPC command surface ([`hook_uninstall`]). [`install_on_launch`] is
//! called from the Tauri `setup` hook (not an IPC command — it runs once at
//! startup); [`hook_uninstall`] is exposed for a future settings toggle / teardown.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{install, uninstall};

/// Hook-script basename for the production identity (`com.claudesk.app`).
pub(crate) const HOOK_SCRIPT_NAME_PROD: &str = "claudesk-hook.pl";
/// Hook-script basename for the dev identity (identifier ending in `.dev`).
/// A DISTINCT basename is what lets the installed prod app and `pnpm tauri:dev`
/// coexist: it isolates the deployed script AND is the per-identity registration
/// marker that keeps each build touching only its own `settings.json` group
/// (see [`super::group_is_claudesk`] — Phase 2). NOTE: prod's basename is a
/// SUBSTRING of dev's, so marker matching must be basename-EXACT, not
/// `.contains()` (the substring trap — Phase 2 P2.2).
pub(crate) const HOOK_SCRIPT_NAME_DEV: &str = "claudesk-hook-dev.pl";

/// Pure derivation of the hook-script basename from the running app's bundle
/// identifier — the single source of truth for dev/prod isolation (Option A,
/// 2026-06-24). A dev build runs under the `tauri.dev.json` overlay's
/// `com.claudesk.app.dev` identifier; everything else (data dir, socket, this
/// script, the registration marker) follows from the identifier. Unit-tested.
pub(crate) fn script_basename(identifier: &str) -> &'static str {
    if identifier.ends_with(".dev") {
        HOOK_SCRIPT_NAME_DEV
    } else {
        HOOK_SCRIPT_NAME_PROD
    }
}

/// The deployed hook-script basename for THIS running build, from its identifier.
fn hook_script_name(app: &AppHandle) -> &'static str {
    script_basename(&app.config().identifier)
}

/// Path to the user's `~/.claude/settings.json` (where CC reads hook registrations).
fn user_settings_path() -> Result<PathBuf, String> {
    let home = dirs_home()?;
    Ok(home.join(".claude").join("settings.json"))
}

/// Resolve `$HOME` without pulling in an extra crate (Tauri's `path()` resolves
/// app dirs, not the bare home). `std::env::var("HOME")` is correct on macOS.
fn dirs_home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve $HOME".to_string())
}

/// Single-quote a path for safe interpolation into the `/bin/sh -c` command
/// string CC runs. macOS app-data paths contain a space (`Application Support`),
/// so an unquoted path word-splits and the hook never runs (the env value's tail
/// is mis-parsed as a command — observed live 2026-06-22). Wrap in single quotes;
/// escape any embedded single quote via the POSIX `'\''` idiom. Single quotes
/// also neutralize every other shell metacharacter, so this is robust regardless
/// of what the resolved path contains.
fn sh_quote(path: &Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
}

/// The exact `command` string Claudesk registers (also the idempotency/uninstall
/// marker). Sets `CLAUDESK_HOOK_SOCK` inline so the hook knows where to write,
/// then invokes the deployed Perl script. Both paths are shell-quoted: they are
/// app-controlled but NOT space-free — `app_data_dir()` resolves under
/// `~/Library/Application Support/…` on macOS.
fn hook_command(script_path: &Path, socket_path: &Path) -> String {
    format!(
        "CLAUDESK_HOOK_SOCK={} /usr/bin/perl {}",
        sh_quote(socket_path),
        sh_quote(script_path)
    )
}

/// Resolve the app-data dir (creating it), the deployed script path, and the
/// socket path together — the trio the launch wiring needs. The socket path comes
/// from [`crate::hook_socket::commands::hook_socket_path`] — the SINGLE source of
/// truth shared with WP3's listener, so the path we put in `CLAUDESK_HOOK_SOCK`
/// (where the hook writes) and the path the listener binds (where we read) can
/// never drift apart.
fn resolve_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", data_dir.display()))?;
    let script = data_dir.join(hook_script_name(app));
    let socket = crate::hook_socket::commands::hook_socket_path(app)?;
    Ok((script, socket))
}

/// Deploy the bundled hook script into app-data (overwriting an older copy so an
/// app update refreshes it) and mark it executable.
fn deploy_hook_script(app: &AppHandle, dest: &Path) -> Result<(), String> {
    let src = app
        .path()
        .resolve(
            "resources/claudesk-hook.pl",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("could not resolve bundled hook script: {e}"))?;
    std::fs::copy(&src, dest)
        .map_err(|e| format!("could not deploy hook script to {}: {e}", dest.display()))?;
    set_executable(dest)?;
    Ok(())
}

/// `chmod +x` the deployed script (CC invokes it directly via the `command`).
#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)
        .map_err(|e| format!("could not stat hook script: {e}"))?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).map_err(|e| format!("could not chmod hook script: {e}"))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Register Claudesk's hook on launch: deploy the script, then merge the hook
/// command into `~/.claude/settings.json` for the three M3 events. Idempotent,
/// additive, reversible (see [`super`]). Returns a human-readable error (the
/// caller surfaces it — never swallow, per the WP6/WP7-M2 IPC-error lesson).
/// Called from the Tauri `setup` hook in `lib.rs`.
pub fn install_on_launch(app: &AppHandle) -> Result<(), String> {
    let (script, socket) = resolve_paths(app)?;
    deploy_hook_script(app, &script)?;
    let command = hook_command(&script, &socket);
    let settings = user_settings_path()?;
    install(&settings, &command).map_err(|e| {
        format!(
            "couldn't register the Claudesk hook in {}: {e}",
            settings.display()
        )
    })
}

/// Remove Claudesk's hook from `~/.claude/settings.json` (only ours). Exposed for
/// a future settings toggle / clean teardown. Requires resolving the same command
/// marker we installed with, so the removal targets exactly our entry.
#[tauri::command]
pub fn hook_uninstall(app: AppHandle) -> Result<(), String> {
    let (script, socket) = resolve_paths(&app)?;
    let command = hook_command(&script, &socket);
    let settings = user_settings_path()?;
    uninstall(&settings, &command).map_err(|e| {
        format!(
            "couldn't unregister the Claudesk hook in {}: {e}",
            settings.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_command_embeds_socket_env_and_script_path() {
        let cmd = hook_command(
            Path::new("/app-data/claudesk-hook.pl"),
            Path::new("/app-data/hook.sock"),
        );
        assert_eq!(
            cmd,
            "CLAUDESK_HOOK_SOCK='/app-data/hook.sock' /usr/bin/perl '/app-data/claudesk-hook.pl'"
        );
    }

    #[test]
    fn hook_command_quotes_spaced_macos_app_data_path() {
        // Regression: the real macOS app-data path contains a space
        // (`Application Support`). An unquoted command word-splits under
        // `/bin/sh -c` and the hook never runs — observed live 2026-06-22
        // ("/bin/sh: Support/com.claudesk.app/hook.sock: No such file or
        // directory"). Both paths must be single-quoted so the space is inert.
        let cmd = hook_command(
            Path::new("/Users/me/Library/Application Support/com.claudesk.app/claudesk-hook.pl"),
            Path::new("/Users/me/Library/Application Support/com.claudesk.app/hook.sock"),
        );
        assert_eq!(
            cmd,
            "CLAUDESK_HOOK_SOCK='/Users/me/Library/Application Support/com.claudesk.app/hook.sock' \
             /usr/bin/perl '/Users/me/Library/Application Support/com.claudesk.app/claudesk-hook.pl'"
        );
        // The env value and script path are each a single shell word (quoted),
        // so no token outside the quotes can be mis-parsed as a command.
        assert!(cmd.contains("='/Users/me/Library/Application Support/"));
        assert!(cmd.contains("/usr/bin/perl '/Users/me/Library/Application Support/"));
    }

    #[test]
    fn sh_quote_escapes_embedded_single_quote() {
        // Defensive: a path with a literal single quote must still produce one
        // safe shell word via the POSIX '\'' idiom.
        let q = sh_quote(Path::new("/tmp/it's here/x.sock"));
        assert_eq!(q, "'/tmp/it'\\''s here/x.sock'");
    }

    #[test]
    fn script_basename_maps_prod_identifier_to_prod_script() {
        assert_eq!(script_basename("com.claudesk.app"), HOOK_SCRIPT_NAME_PROD);
        assert_eq!(script_basename("com.claudesk.app"), "claudesk-hook.pl");
    }

    #[test]
    fn script_basename_maps_dev_identifier_to_dev_script() {
        // The dev overlay (tauri.dev.json) sets this identifier; the distinct
        // basename is what isolates the deployed script + the settings.json marker.
        assert_eq!(script_basename("com.claudesk.app.dev"), HOOK_SCRIPT_NAME_DEV);
        assert_eq!(script_basename("com.claudesk.app.dev"), "claudesk-hook-dev.pl");
    }

    #[test]
    fn script_basename_only_dev_suffix_triggers_dev_script() {
        // Defensive: only a trailing `.dev` flips to the dev script. An identifier
        // that merely contains "dev" elsewhere stays prod.
        assert_eq!(script_basename("com.claudesk.devtools"), HOOK_SCRIPT_NAME_PROD);
        assert_eq!(script_basename("com.dev.claudesk"), HOOK_SCRIPT_NAME_PROD);
    }
}
