//! Process-wide `PATH` fix for the GUI-launched app.
//!
//! A macOS app launched from Finder/Dock inherits the minimal launchd `PATH`
//! (`/usr/bin:/bin:/usr/sbin:/sbin`) — NOT the user's shell `PATH`. So a CLI the
//! user installed under `~/.local/bin`, `/opt/homebrew/bin`, an `fnm`/`nvm` node
//! dir, etc. is invisible to every process Claudesk spawns (`claude` via
//! `cc_session`, `subl`/`smerge` via `sublime`, `open` via `finder`). Under
//! `pnpm tauri:dev` this never surfaces because the dev process inherits the
//! launching terminal's full `PATH` — the bug is install-only (operator hit it
//! 2026-06-24: "No viable candidates found in PATH /usr/bin:/bin:/usr/sbin:/sbin"
//! when spawning `claude`).
//!
//! Fix (the standard Tauri/Electron "fix-path" move): at startup, capture the
//! user's LOGIN shell `PATH` and set it for the whole process via
//! `std::env::set_var("PATH", ..)` — so every downstream spawn resolves against the
//! real `PATH`. Called as the FIRST thing in `lib.rs` `.setup()`, before any spawn.
//!
//! ## Layout (pure-core / startup-shell split, mirrors the other modules)
//! - **[`resolve_path`]** — pure policy: given the captured shell `PATH` (or
//!   `None`), decide what to set (or `None` = leave the inherited `PATH` alone).
//!   Unit-testable with no shell.
//! - **[`capture_login_path`]** — runs the login shell to read its `PATH`.
//! - **[`apply_login_path_to_process`]** — the thin startup shell: capture →
//!   resolve → `set_var` (or no-op + log). Best-effort: a capture failure NEVER
//!   blanks the existing `PATH` (don't make things worse).

use std::process::Command;

/// Fallback shell when `$SHELL` is unset/blank. Same value + rationale as
/// `cc_session`'s `DEFAULT_SHELL` (the macOS default login shell); kept as a
/// separate const so this module has no cross-module dependency for one literal.
const DEFAULT_SHELL: &str = "/bin/zsh";

/// Pure policy: given the `PATH` captured from the login shell, decide the value
/// to set process-wide. `Some(trimmed)` when the capture is present and non-blank
/// (trailing newline trimmed — shells usually emit one); `None` otherwise, meaning
/// "leave the inherited `PATH` untouched" (capture failed / empty → never blank it).
pub fn resolve_path(captured: Option<&str>) -> Option<String> {
    let trimmed = captured?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Capture the user's login-shell `PATH`: run `<$SHELL> -l -i -c 'printf %s "$PATH"'`
/// and return its stdout. `-l -i` sources the login + interactive rc chain
/// (`.zprofile`/`.zshrc`, `.bash_profile`/`.bashrc`) so the real `PATH` is built.
/// Returns `None` (and logs) on spawn failure, non-zero exit, or empty output.
fn capture_login_path() -> Option<String> {
    let shell = match std::env::var("SHELL") {
        Ok(s) if !s.trim().is_empty() => s,
        _ => DEFAULT_SHELL.to_string(),
    };
    let output = Command::new(&shell)
        .args(["-l", "-i", "-c", "printf %s \"$PATH\""])
        .output();
    match output {
        Ok(out) if out.status.success() => {
            let path = String::from_utf8_lossy(&out.stdout).into_owned();
            if path.trim().is_empty() {
                eprintln!("[env_path] login shell returned an empty PATH; keeping inherited PATH");
                None
            } else {
                Some(path)
            }
        }
        Ok(out) => {
            eprintln!(
                "[env_path] login-shell PATH capture exited {:?}; keeping inherited PATH",
                out.status.code()
            );
            None
        }
        Err(e) => {
            eprintln!("[env_path] could not run login shell ({shell}) to capture PATH: {e}; keeping inherited PATH");
            None
        }
    }
}

/// Startup shell: capture the login `PATH` and set it process-wide so GUI-launched
/// spawns resolve user-installed CLIs. Best-effort — on any failure the inherited
/// `PATH` is left untouched (never blanked). Call FIRST in `.setup()`.
///
/// Safety: `std::env::set_var` mutates process-global state, but at `.setup()` time
/// the app is effectively single-threaded (the PTY reader / broadcaster threads
/// start later), so there is no concurrent `PATH` reader to race.
pub fn apply_login_path_to_process() {
    match resolve_path(capture_login_path().as_deref()) {
        Some(path) => {
            std::env::set_var("PATH", &path);
            eprintln!("[env_path] set process PATH from login shell: {path}");
        }
        None => {
            eprintln!("[env_path] kept inherited PATH (no usable login-shell PATH captured)");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_returns_a_present_nonblank_path() {
        assert_eq!(
            resolve_path(Some("/Users/me/.local/bin:/opt/homebrew/bin:/usr/bin")),
            Some("/Users/me/.local/bin:/opt/homebrew/bin:/usr/bin".to_string())
        );
    }

    #[test]
    fn resolve_trims_a_trailing_newline() {
        // Login shells commonly emit a trailing newline; it must not pollute PATH.
        assert_eq!(resolve_path(Some("/a:/b\n")), Some("/a:/b".to_string()));
    }

    #[test]
    fn resolve_blank_is_noop() {
        // Whitespace-only or empty capture → None (leave the inherited PATH alone;
        // never blank it out).
        assert_eq!(resolve_path(Some("   ")), None);
        assert_eq!(resolve_path(Some("")), None);
        assert_eq!(resolve_path(Some("\n")), None);
    }

    #[test]
    fn resolve_none_is_noop() {
        assert_eq!(resolve_path(None), None);
    }
}
