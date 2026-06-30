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
/// versions (WP3 probe).
const ST_BUNDLE_BIN: &str = "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl";

/// The Sublime Merge app name passed to the `open -a` fallback.
const SM_APP_NAME: &str = "Sublime Merge";
/// The stable in-bundle CLI path for Sublime Merge (WP3 probe: present + executable
/// at this path on the canonical machine, neither CLI on PATH).
const SM_BUNDLE_BIN: &str = "/Applications/Sublime Merge.app/Contents/SharedSupport/bin/smerge";

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

/// Pure discovery decision: given the PATH-lookup result and the tool's bundle path
/// (+ whether it exists), choose the tool. Separated from the real-FS [`find_subl`]/
/// [`find_smerge`] so the PATH → bundle → OpenA precedence is unit-testable without
/// touching disk.
///
/// `bundle_bin` is the tool-specific in-`.app` CLI path (`ST_BUNDLE_BIN` for Sublime
/// Text, `SM_BUNDLE_BIN` for Sublime Merge) — it MUST be passed in, not hardcoded,
/// or `find_smerge` would resolve to Sublime Text's binary (the WP5 bug: `resolve`
/// hardcoded `ST_BUNDLE_BIN`, so the Merge button launched Text).
fn resolve(on_path: Option<PathBuf>, bundle_bin: &str, bundle_exists: bool) -> SublTool {
    if let Some(p) = on_path {
        return SublTool::Path(p);
    }
    if bundle_exists {
        return SublTool::Bundle(PathBuf::from(bundle_bin));
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
    resolve(on_path, ST_BUNDLE_BIN, bundle_exists)
}

/// Resolve how to invoke Sublime Merge on this host (real filesystem).
///
/// Mirrors [`find_subl`] for the `smerge` CLI: PATH (`which smerge`) → `.app` bundle
/// (`SM_BUNDLE_BIN`) → `open -a` fallback. WP5 — Sublime Merge is a *permanent*
/// companion surface (unlike the Sublime Text pop, which WP8 removes).
pub fn find_smerge() -> SublTool {
    let on_path = which::which("smerge").ok();
    let bundle_exists = Path::new(SM_BUNDLE_BIN).is_file();
    resolve(on_path, SM_BUNDLE_BIN, bundle_exists)
}

/// Build the exact `(program, args)` to open `app_name`'s CLI at `project_dir`.
///
/// Shared by both Sublime Text (`subl`) and Sublime Merge (`smerge`) — the two CLIs
/// take the same `<dir>` shape (WP3 probe: `subl <dir>` T-row + `smerge <dir>` T7,
/// both open the folder and **activate** the app, which is what a deliberate user
/// gesture wants). `app_name` is only used for the `open -a "<App>"` fallback.
///
/// Encodes the WP3 hand-off contract:
/// - `<cli> <dir>` (or `open -a "<App>" <dir>`) — opens the dir as a folder and
///   **activates** the app (the user pressed the key / clicked the button because
///   they want to be in that app).
/// - **No `--project`** — does NOT activate ST on cold start (WP3 probe T3); `<cli> <dir>`
///   already auto-loads any project file it finds in the folder.
/// - **No `--new-window`** — bring the existing window forward, not a duplicate.
fn tool_command(tool: &SublTool, app_name: &str, project_dir: &str) -> (String, Vec<String>) {
    match tool {
        SublTool::Path(p) | SublTool::Bundle(p) => (
            p.to_string_lossy().into_owned(),
            vec![project_dir.to_string()],
        ),
        SublTool::OpenA => (
            "open".to_string(),
            vec![
                "-a".to_string(),
                app_name.to_string(),
                project_dir.to_string(),
            ],
        ),
    }
}

/// Build the `(program, args)` for a Sublime **Text** pop at `project_dir`.
/// Thin wrapper over [`tool_command`] with the ST app name.
pub fn subl_command(tool: &SublTool, project_dir: &str) -> (String, Vec<String>) {
    tool_command(tool, ST_APP_NAME, project_dir)
}

/// Build the `(program, args)` for a Sublime **Merge** open at `project_dir`.
/// Thin wrapper over [`tool_command`] with the SM app name.
pub fn merge_command(tool: &SublTool, project_dir: &str) -> (String, Vec<String>) {
    tool_command(tool, SM_APP_NAME, project_dir)
}

/// Spawn `(program, args)` fire-and-forget (no `--wait`). Shared launch tail for
/// both Sublime Text and Sublime Merge — we do not block on the app's lifetime.
fn spawn(program: &str, args: &[String]) -> Result<(), SublimeError> {
    Command::new(program)
        .args(args)
        .spawn()
        .map_err(|e| SublimeError::Launch(format!("{program}: {e}")))?;
    Ok(())
}

/// Pop Sublime Text at `project_dir`.
///
/// Resolves the tool fresh ([`find_subl`]) and spawns fire-and-forget. The
/// [`commands::sublime_open`] Tauri command is the thin IPC shell over this.
pub fn launch(project_dir: &str) -> Result<(), SublimeError> {
    let tool = find_subl();
    let (program, args) = subl_command(&tool, project_dir);
    spawn(&program, &args)
}

/// Open Sublime Merge at `project_dir`.
///
/// Resolves the tool fresh ([`find_smerge`]) and spawns fire-and-forget. The
/// [`commands::smerge_open`] Tauri command is the thin IPC shell over this. WP5 —
/// permanent companion surface for staging/blame/history/blob-at-rev.
pub fn launch_merge(project_dir: &str) -> Result<(), SublimeError> {
    let tool = find_smerge();
    let (program, args) = merge_command(&tool, project_dir);
    spawn(&program, &args)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- find_subl discovery precedence (3 cases) ---

    #[test]
    fn resolve_prefers_path_when_present() {
        let on_path = Some(PathBuf::from("/usr/local/bin/subl"));
        // Even if the bundle also exists, PATH wins.
        let tool = resolve(on_path.clone(), ST_BUNDLE_BIN, true);
        assert_eq!(tool, SublTool::Path(PathBuf::from("/usr/local/bin/subl")));
    }

    #[test]
    fn resolve_falls_back_to_bundle_when_path_absent() {
        let tool = resolve(None, ST_BUNDLE_BIN, true);
        assert_eq!(tool, SublTool::Bundle(PathBuf::from(ST_BUNDLE_BIN)));
    }

    #[test]
    fn resolve_falls_back_to_open_a_when_neither_present() {
        let tool = resolve(None, ST_BUNDLE_BIN, false);
        assert_eq!(tool, SublTool::OpenA);
    }

    // WP5 REGRESSION GUARD: `resolve` must use the bundle path it is GIVEN, not a
    // hardcoded one. The shipped bug hardcoded ST_BUNDLE_BIN in the Bundle arm, so
    // find_smerge resolved to Sublime *Text* and the Merge button launched Text.
    #[test]
    fn resolve_bundle_uses_the_given_bundle_bin_not_a_hardcoded_one() {
        let tool = resolve(None, SM_BUNDLE_BIN, true);
        assert_eq!(tool, SublTool::Bundle(PathBuf::from(SM_BUNDLE_BIN)));
        // The Merge resolution must never carry a Sublime Text path.
        if let SublTool::Bundle(p) = tool {
            assert!(
                !p.to_string_lossy().contains("Sublime Text"),
                "merge bundle resolution leaked a Sublime Text path: {p:?}"
            );
        }
    }

    // WP5 REGRESSION GUARD (end-to-end through merge_command): the command built for
    // the Merge bundle tool must spawn the `smerge` binary, never `subl`. This is the
    // seam the original tests missed — they fed merge_command a hand-built SM Bundle
    // rather than the one find_smerge/resolve actually produce.
    #[test]
    fn merge_command_through_bundle_resolution_targets_smerge_not_subl() {
        let tool = resolve(None, SM_BUNDLE_BIN, true);
        let (program, _args) = merge_command(&tool, "/Users/me/proj");
        assert!(
            program.ends_with("/smerge"),
            "merge_command must spawn smerge, got: {program}"
        );
        assert!(
            !program.contains("Sublime Text") && !program.ends_with("/subl"),
            "merge_command must not spawn Sublime Text's subl, got: {program}"
        );
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

    // --- merge_command construction (3 branches) + WP3 anti-patterns (WP5) ---
    // The resolver precedence (PATH → bundle → OpenA) is the shared `resolve` fn,
    // already covered by the `resolve_*` tests above; only the command shape and
    // the SM `open -a` app name differ for Merge.

    #[test]
    fn merge_command_for_path_tool_is_bare_dir() {
        let tool = SublTool::Path(PathBuf::from("/usr/local/bin/smerge"));
        let (program, args) = merge_command(&tool, "/Users/me/proj");
        assert_eq!(program, "/usr/local/bin/smerge");
        assert_eq!(args, vec!["/Users/me/proj".to_string()]);
    }

    #[test]
    fn merge_command_for_bundle_tool_uses_bundle_binary() {
        let tool = SublTool::Bundle(PathBuf::from(SM_BUNDLE_BIN));
        let (program, args) = merge_command(&tool, "/Users/me/proj");
        assert_eq!(program, SM_BUNDLE_BIN);
        assert_eq!(args, vec!["/Users/me/proj".to_string()]);
    }

    #[test]
    fn merge_command_for_open_a_fallback_uses_sublime_merge_app() {
        let (program, args) = merge_command(&SublTool::OpenA, "/Users/me/proj");
        assert_eq!(program, "open");
        assert_eq!(
            args,
            vec![
                "-a".to_string(),
                "Sublime Merge".to_string(),
                "/Users/me/proj".to_string(),
            ]
        );
    }

    #[test]
    fn merge_command_never_passes_project_or_new_window_flags() {
        let dir = "/Users/me/proj";
        for tool in [
            SublTool::Path(PathBuf::from("/usr/local/bin/smerge")),
            SublTool::Bundle(PathBuf::from(SM_BUNDLE_BIN)),
            SublTool::OpenA,
        ] {
            let (_program, args) = merge_command(&tool, dir);
            assert!(
                !args.iter().any(|a| a == "--project" || a == "--new-window"),
                "merge command for {tool:?} must not contain --project or --new-window: {args:?}"
            );
        }
    }
}
