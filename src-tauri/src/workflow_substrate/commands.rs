//! Tauri commands for workflow-substrate detection + the invite lifecycle (M10.9 WP3).
//!
//! The side-effecting half of the `hook_install` split: this layer resolves real paths and
//! the app-data dir, then delegates every decision to the pure functions in the parent
//! module (`workflow_substrate`) or to `config_store::settings`. Nothing here does its own
//! logic worth testing — which is the point.

use std::path::PathBuf;

use tauri::AppHandle;

use crate::config_store::settings::WorkflowInviteOutcome;

/// Resolve the user's home directory.
///
/// `std::env::var("HOME")` rather than a Tauri app-dir helper: we want the *bare* home
/// (`~/.claude/` lives there, not under the sandboxed app dirs), and this is the same
/// resolution `hook_install::commands::dirs_home` uses — kept consistent deliberately, so
/// both modules agree on where `~/.claude/` is.
fn dirs_home() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "could not resolve the home directory (HOME is unset)".to_string())
}

/// Is the companion workflow system installed under `~/.claude/skills/`?
///
/// Read-only. Renders as a status line plus either install instructions or the
/// `/tutorial-getting-started` pointer in the Settings panel.
///
/// **An unresolvable `HOME` reports `false`, not an error.** The Settings panel must render
/// regardless, and "not installed" is the safe reading: it shows the user install
/// instructions, which is a recoverable state, whereas surfacing an error for a `stat`
/// would break a whole settings surface over a question with no failure mode.
#[tauri::command]
pub fn workflow_substrate_installed() -> bool {
    match dirs_home() {
        Ok(home) => super::skills_dir_exists(&home),
        Err(_) => false,
    }
}

/// Read the one-time invite's outcome. `None` = unresolved (the invite may still show).
#[tauri::command]
pub fn workflow_get_invite(app: AppHandle) -> Result<Option<WorkflowInviteOutcome>, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::read_workflow_invite(&dir).map_err(|e| e.to_string())
}

/// Record how the invite was resolved.
///
/// No broadcast event, unlike the gate's setter: the invite is shown at most once per
/// process and has no mirror surface to keep in sync, so an event would have no subscriber.
/// (The gate's event exists because the Settings panel, a future menu check-state, and the
/// consumption seam all mirror it.)
///
/// Writes only Claudesk's own `settings.json` — the invite records *its own* lifecycle and
/// touches nothing under `~/.claude/`.
#[tauri::command]
pub fn workflow_set_invite(
    app: AppHandle,
    outcome: Option<WorkflowInviteOutcome>,
) -> Result<(), String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::write_workflow_invite(&dir, outcome).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn detection_reads_and_never_writes() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The WP3-is-read-only boundary, guarded at the layer that touches real paths.
        //
        // The parent module proves `skills_dir_exists` creates nothing (against a
        // TempDir). This test guards the OTHER half: that this command layer — the one
        // holding a real `~/` path — never grows a write. WP3.5 will add wizards that
        // legitimately clone and delete; they must land in their OWN module with their own
        // sandbox fixture and refuse-guard, not by quietly extending this file.
        //
        // Source-level, mirroring `workflow_gate::commands`'s invariant guard, and for the
        // same reason: "no write occurred outside the app-data dir" is impractical to
        // assert from a unit test, while "this module constructs no destructive call" is
        // exact and fails the moment someone adds one.
        // ═══════════════════════════════════════════════════════════════════════════
        let src = include_str!("commands.rs");
        let production = src.split("#[cfg(test)]").next().unwrap_or(src);
        let code: String = production
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                !t.starts_with("//") && !t.starts_with("*")
            })
            .collect::<Vec<_>>()
            .join("\n");

        for forbidden in [
            "remove_dir",
            "remove_file",
            "create_dir",
            "std::fs::write",
            "rename",
            "Command",
            "install.sh",
            "uninstall.sh",
            "git",
        ] {
            assert!(
                !code.contains(forbidden),
                "workflow_substrate::commands must not reference `{forbidden}` — WP3 \
                 detection is READ-ONLY. Installing or removing the substrate is WP3.5's \
                 work and belongs in its own module, behind an explicit user-initiated \
                 wizard, with the sandbox fixture + refuse-guard its high-priority \
                 sandbox requirement mandates. Do not add a write path here."
            );
        }

        // Positive half: absence alone would still pass if the detection stopped happening.
        assert!(
            code.contains("skills_dir_exists"),
            "the command must delegate to the pure, path-arg'd checker"
        );
    }
}
