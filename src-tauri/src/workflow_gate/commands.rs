//! Tauri commands for the workflow-features gate (M10.9 WP2).
//!
//! Mirror of `time_store::commands`'s tracking-toggle pair: a const event name, a thin
//! getter over the settings reader, and a setter that persists then broadcasts.

use tauri::{AppHandle, Emitter};

/// Broadcast fired when the gate changes, so every surface reflecting it re-renders off
/// the single backend source of truth. The frontend consumption seam
/// (`src/state/workflowGate.ts`) subscribes to this; future mirror surfaces (a menu
/// check-state, a second control) subscribe to the same event rather than polling.
///
/// The string is a cross-language contract — the TS side declares it verbatim, so it is
/// pinned by a unit test below. Mirrors
/// [`TIME_TRACKING_ENABLED_EVENT`](crate::time_store::commands::TIME_TRACKING_ENABLED_EVENT).
pub const WORKFLOW_FEATURES_ENABLED_EVENT: &str = "workflow-features-enabled";

/// Read the persisted workflow-features gate (default **`false`**). The frontend seam
/// seeds from this on mount; every gated surface reads the seam, never this command
/// directly. Thin wrapper over
/// [`read_workflow_features_enabled`](crate::config_store::settings::read_workflow_features_enabled)
/// — mirror of `time_get_tracking_enabled`.
#[tauri::command]
pub fn workflow_get_features_enabled(app: AppHandle) -> Result<bool, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::read_workflow_features_enabled(&dir).map_err(|e| e.to_string())
}

/// Set the gate. Persists it, then broadcasts [`WORKFLOW_FEATURES_ENABLED_EVENT`] so the
/// frontend seam (and any future mirror) re-renders.
///
/// **Writes to Claudesk's own `settings.json` and nothing else** — in particular, never to
/// `~/.claude/`. Enabling the UI and installing the workflow substrate are separate acts
/// (see the module header); this command performs only the former. Mirror of
/// `time_set_tracking_enabled`.
#[tauri::command]
pub fn workflow_set_features_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::write_workflow_features_enabled(&dir, enabled)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(WORKFLOW_FEATURES_ENABLED_EVENT, enabled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_gate_write_path_never_reaches_the_users_claude_directory() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE MILESTONE'S LOAD-BEARING INVARIANT, as a standing guard.
        //
        // Enabling the gate must be a pure Claudesk UI-state flip that writes NOTHING
        // into `~/.claude/`. The operator's skills there are live symlinks into the
        // companion workflow repo, so a stray write could clobber the source of truth
        // for every project on the machine — an unrecoverable, silent failure.
        //
        // This was verified LIVE during verify-self (hashing ~/.claude/settings.json
        // before and after a real toggle, byte-identical) — but that proof died with the
        // app process. Nothing stopped a future edit from adding an "and also register
        // the skills" convenience step to the setter. This test is that stop.
        //
        // Source-level rather than runtime, deliberately: "no write occurred to a path
        // outside the app-data dir" is impractical to assert from inside a unit test,
        // whereas "this module contains no home-directory path construction" is exact,
        // fast, and fails at precisely the moment someone introduces one.
        // ═══════════════════════════════════════════════════════════════════════════
        let src = include_str!("commands.rs");
        // Scan the PRODUCTION half only — everything above `#[cfg(test)]`. Two reasons,
        // both learned by this test failing on its own first run: (1) the forbidden-word
        // list and its assertion message live in the test module, so a whole-file scan
        // flags itself; (2) prose about the invariant is not a violation of it. Comments
        // are stripped too (incl. `///` doc comments), since the module header discusses
        // `~/.claude/` at length by design.
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
            ".claude",
            "home_dir",
            "dirs::",
            "HOME",
            "skills",
            "install.sh",
        ] {
            assert!(
                !code.contains(forbidden),
                "workflow_gate::commands must not reference `{forbidden}` — enabling the \
                 gate is a UI-state flip and must never touch the user's ~/.claude/ tree \
                 (their skills are live symlinks into the companion repo). If an install \
                 flow is genuinely wanted, it belongs in its own module behind an \
                 explicit, user-initiated action — never as a side effect of the toggle."
            );
        }

        // Positive half: the write path really does go through Claudesk's own app-data
        // store. Asserting only the absence above would still pass if the setter stopped
        // persisting altogether.
        assert!(
            code.contains("resolve_data_dir"),
            "the setter must resolve Claudesk's own app-data dir for its write"
        );
        assert!(
            code.contains("write_workflow_features_enabled"),
            "the setter must persist through the config_store writer"
        );
    }

    #[test]
    fn event_name_is_the_pinned_cross_language_string() {
        // The frontend declares this same literal in src/state/workflowGate.ts. A drift on
        // either side silently desyncs every surface that mirrors the gate — the listener
        // simply never fires, which looks like "the toggle didn't stick" at runtime and
        // ships GREEN. Pinning the literal here makes that drift a build failure.
        // (Mirror of the TIME_TRACKING_ENABLED_EVENT pin.)
        assert_eq!(WORKFLOW_FEATURES_ENABLED_EVENT, "workflow-features-enabled");
    }
}
