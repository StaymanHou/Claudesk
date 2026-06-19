//! Sublime Text hotkey-pop — discovery, command construction, and launch.
//!
//! WP8. Opens Sublime Text at a workspace's project directory. The launch is driven
//! from the frontend — the right-panel "Open in Sublime" button and the in-app
//! `⌘⇧E` keybinding both `invoke("sublime_open", { projectPath })`, passing the
//! focused workspace's path. (The original OS-global-hotkey design was scrapped
//! 2026-06-19 — see the WIP's "Spec correction": an in-app keybinding needs no
//! macOS Accessibility permission and the frontend already knows the focused path.)
//!
//! ## Layout (mirrors `cc_session/`'s pure-core / IPC-shell split)
//! - **[`SublTool`]** + **[`find_subl`]** — the discovery resolver. Order is
//!   PATH (`which subl`) → `/Applications/Sublime Text.app/.../bin/subl` bundle →
//!   `open -a "Sublime Text"` fallback. The decision logic is a pure function
//!   ([`resolve`]) over injected inputs so it is unit-testable without a real FS.
//! - **[`subl_command`]** — pure `(program, args)` builder. Encodes the WP3 probe
//!   hand-off contract: `subl <dir>` (steal focus), NEVER `--project` (doesn't
//!   activate ST on cold start) and NEVER `--new-window` (duplicates windows).
//! - **[`launch`]** — resolves the tool and spawns Sublime fire-and-forget via
//!   `std::process::Command` (never `--wait`). The [`commands::sublime_open`] Tauri
//!   command is a thin shell over it.
//!
//! ## WP3 hand-off contract (`workflow/archive/wp3-sublime-cli-probe.md`)
//! The exact invocation was decided by the completed WP3 probe. Claudesk does NOT
//! require `subl` on `PATH` — the maintainer's own machine doesn't have it, and the
//! `.app`-bundle path is a stable Sublime convention. Sublime Merge is Phase 2; the
//! resolver is built tool-parameterized so `find_smerge` is a one-liner later, but
//! no SM action is wired in WP8.
//!
//! ## As-built delta from arch.md (resync at finalize)
//! `arch.md` says the launch goes "via `tauri-plugin-shell` `Command` API"; the
//! as-built uses `std::process::Command` (consistent with `cc_session` spawning
//! processes directly, and avoiding an unneeded plugin). `arch.md:113,167` also
//! still mention `subl --project` — superseded by the WP3 probe. And arch.md's
//! OS-global `tauri-plugin-global-shortcut` + Accessibility flow is superseded by
//! the in-app-keybinding spec. All need a finalize resync.

pub mod commands;

use std::path::{Path, PathBuf};
use std::process::Command;

use thiserror::Error;

/// The Sublime Text app name passed to the `open -a` fallback.
const ST_APP_NAME: &str = "Sublime Text";
/// The stable in-bundle CLI path. Both ST and SM have shipped this layout for many
/// versions (WP3 probe §Decision point 2).
const ST_BUNDLE_BIN: &str = "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl";

/// Errors crossing the `sublime` boundary. Tauri commands map these to `String`.
#[derive(Debug, Error)]
pub enum SublimeError {
    /// Spawning the Sublime launcher process failed.
    #[error("failed to launch Sublime Text: {0}")]
    Launch(String),
}

/// How Claudesk reaches the `subl` binary, in discovery-priority order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SublTool {
    /// `subl` found on `PATH`.
    Path(PathBuf),
    /// `subl` found inside the `.app` bundle (PATH absent).
    Bundle(PathBuf),
    /// Neither on PATH nor bundle — fall back to `open -a "Sublime Text"`.
    OpenA,
}

/// Pure discovery decision: given the PATH-lookup result and whether the bundle
/// binary exists, choose the tool. Separated from the real-FS [`find_subl`] so the
/// PATH → bundle → OpenA precedence is unit-testable without touching disk.
fn resolve(on_path: Option<PathBuf>, bundle_exists: bool) -> SublTool {
    if let Some(p) = on_path {
        return SublTool::Path(p);
    }
    if bundle_exists {
        return SublTool::Bundle(PathBuf::from(ST_BUNDLE_BIN));
    }
    SublTool::OpenA
}

/// Resolve how to invoke Sublime Text on this host (real filesystem).
///
/// PATH (`which subl`) → `.app` bundle → `open -a` fallback. Cheap enough to call
/// per [`launch`]; runtime PATH changes are not a supported live-reconfig case (per
/// the WP3 contract).
pub fn find_subl() -> SublTool {
    let on_path = which::which("subl").ok();
    let bundle_exists = Path::new(ST_BUNDLE_BIN).is_file();
    resolve(on_path, bundle_exists)
}

/// Build the exact `(program, args)` for a hotkey-pop at `project_dir`.
///
/// Encodes the WP3 hand-off contract:
/// - `subl <dir>` (or `open -a "Sublime Text" <dir>`) — opens the dir as a folder
///   and **activates** ST (hotkey-pop steals focus by design: the user pressed the
///   key because they want to be in Sublime).
/// - **No `--project`** — it does NOT activate ST on cold start (WP3 T3); `subl <dir>`
///   already auto-loads any `.sublime-project` it finds in the folder.
/// - **No `--new-window`** — the user wants the existing window for this project to
///   come forward, not a duplicate on every press.
pub fn subl_command(tool: &SublTool, project_dir: &str) -> (String, Vec<String>) {
    match tool {
        SublTool::Path(p) | SublTool::Bundle(p) => {
            (p.to_string_lossy().into_owned(), vec![project_dir.to_string()])
        }
        SublTool::OpenA => (
            "open".to_string(),
            vec![
                "-a".to_string(),
                ST_APP_NAME.to_string(),
                project_dir.to_string(),
            ],
        ),
    }
}

/// Pop Sublime Text at `project_dir`.
///
/// Resolves the tool fresh ([`find_subl`]) and spawns fire-and-forget (no `--wait`);
/// we do not block on Sublime's lifetime. The [`commands::sublime_open`] Tauri
/// command is the thin IPC shell over this.
pub fn launch(project_dir: &str) -> Result<(), SublimeError> {
    let tool = find_subl();
    let (program, args) = subl_command(&tool, project_dir);
    Command::new(&program)
        .args(&args)
        .spawn()
        .map_err(|e| SublimeError::Launch(format!("{program}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- find_subl discovery precedence (3 cases) ---

    #[test]
    fn resolve_prefers_path_when_present() {
        let on_path = Some(PathBuf::from("/usr/local/bin/subl"));
        // Even if the bundle also exists, PATH wins.
        let tool = resolve(on_path.clone(), true);
        assert_eq!(tool, SublTool::Path(PathBuf::from("/usr/local/bin/subl")));
    }

    #[test]
    fn resolve_falls_back_to_bundle_when_path_absent() {
        let tool = resolve(None, true);
        assert_eq!(tool, SublTool::Bundle(PathBuf::from(ST_BUNDLE_BIN)));
    }

    #[test]
    fn resolve_falls_back_to_open_a_when_neither_present() {
        let tool = resolve(None, false);
        assert_eq!(tool, SublTool::OpenA);
    }

    // --- subl_command construction (3 branches) + WP3 anti-patterns ---

    #[test]
    fn command_for_path_tool_is_bare_dir() {
        let tool = SublTool::Path(PathBuf::from("/usr/local/bin/subl"));
        let (program, args) = subl_command(&tool, "/Users/me/proj");
        assert_eq!(program, "/usr/local/bin/subl");
        assert_eq!(args, vec!["/Users/me/proj".to_string()]);
    }

    #[test]
    fn command_for_bundle_tool_uses_bundle_binary() {
        let tool = SublTool::Bundle(PathBuf::from(ST_BUNDLE_BIN));
        let (program, args) = subl_command(&tool, "/Users/me/proj");
        assert_eq!(program, ST_BUNDLE_BIN);
        assert_eq!(args, vec!["/Users/me/proj".to_string()]);
    }

    #[test]
    fn command_for_open_a_fallback() {
        let (program, args) = subl_command(&SublTool::OpenA, "/Users/me/proj");
        assert_eq!(program, "open");
        assert_eq!(
            args,
            vec![
                "-a".to_string(),
                "Sublime Text".to_string(),
                "/Users/me/proj".to_string(),
            ]
        );
    }

    #[test]
    fn never_passes_project_or_new_window_flags() {
        // WP3 contract: hotkey-pop must never use --project (no cold-start activate)
        // or --new-window (duplicate windows). Assert across all three branches.
        let dir = "/Users/me/proj";
        for tool in [
            SublTool::Path(PathBuf::from("/usr/local/bin/subl")),
            SublTool::Bundle(PathBuf::from(ST_BUNDLE_BIN)),
            SublTool::OpenA,
        ] {
            let (_program, args) = subl_command(&tool, dir);
            assert!(
                !args.iter().any(|a| a == "--project" || a == "--new-window"),
                "command for {tool:?} must not contain --project or --new-window: {args:?}"
            );
        }
    }
}
