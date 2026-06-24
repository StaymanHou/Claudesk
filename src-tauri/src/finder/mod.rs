//! Reveal-in-Finder launch — open a workspace's project directory in the macOS
//! Finder. The tab-row "Reveal in Finder" button `invoke("finder_open",
//! { projectPath })` with the focused workspace's path.
//!
//! Far simpler than the `sublime` module: Finder needs NO tool discovery — macOS
//! `open` is always present — so there's no resolver, just a pure `(program, args)`
//! builder and a fire-and-forget spawn.
//!
//! ## Layout (mirrors `sublime/`'s pure-core / IPC-shell split)
//! - **[`finder_command`]** — pure `(program, args)` builder: `open <dir>`. We use
//!   plain `open <dir>` (open the project folder IN Finder, showing its contents),
//!   NOT `open -R <dir>` (which reveals+selects the folder in its *parent*) — the
//!   button's intent is "open this project's folder", task decision 2026-06-24.
//! - **[`launch`]** — spawns `(program, args)` fire-and-forget via
//!   `std::process::Command` (consistent with `sublime`/`cc_session`; arch note
//!   prefers it over tauri-plugin-shell/opener). The [`commands::finder_open`] Tauri
//!   command is the thin IPC shell over it.

pub mod commands;

use std::process::Command;

use thiserror::Error;

/// The macOS launcher used to reveal a directory in Finder. Always present.
const OPEN_BIN: &str = "open";

/// Errors crossing the `finder` boundary. Tauri commands map these to `String`.
#[derive(Debug, Error)]
pub enum FinderError {
    /// Spawning the `open` process failed.
    #[error("failed to open Finder: {0}")]
    Launch(String),
}

/// Build the `(program, args)` to open `project_dir` in the macOS Finder:
/// `open <dir>`. Pure — unit-testable with no spawn.
pub fn finder_command(project_dir: &str) -> (String, Vec<String>) {
    (OPEN_BIN.to_string(), vec![project_dir.to_string()])
}

/// Spawn `(program, args)` fire-and-forget (no `--wait`) — we don't block on Finder.
fn spawn(program: &str, args: &[String]) -> Result<(), FinderError> {
    Command::new(program)
        .args(args)
        .spawn()
        .map_err(|e| FinderError::Launch(format!("{program}: {e}")))?;
    Ok(())
}

/// Reveal `project_dir` in the macOS Finder.
///
/// Builds `open <dir>` ([`finder_command`]) and spawns it fire-and-forget. The
/// [`commands::finder_open`] Tauri command is the thin IPC shell over this.
pub fn launch(project_dir: &str) -> Result<(), FinderError> {
    let (program, args) = finder_command(project_dir);
    spawn(&program, &args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finder_command_builds_open_dir() {
        let (program, args) = finder_command("/Users/me/projects/acme-api");
        assert_eq!(program, "open");
        assert_eq!(args, vec!["/Users/me/projects/acme-api".to_string()]);
    }

    #[test]
    fn finder_command_does_not_pass_reveal_flag() {
        // Decision 2026-06-24: open the folder's CONTENTS (`open <dir>`), not
        // reveal-and-select in the parent (`open -R <dir>`). No flags at all.
        let (_program, args) = finder_command("/tmp/x");
        assert_eq!(args.len(), 1, "exactly the dir, no -R or other flags");
        assert!(!args.iter().any(|a| a == "-R"));
    }

    #[test]
    fn finder_command_preserves_a_spaced_path_as_one_arg() {
        // A project path with a space must be a single argv element (Command::args
        // does NOT shell-split), so Finder opens the right dir.
        let (_program, args) = finder_command("/Users/me/Code Projects/acme");
        assert_eq!(args, vec!["/Users/me/Code Projects/acme".to_string()]);
    }
}
