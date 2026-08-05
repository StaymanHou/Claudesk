//! M12 WP3 — the Tauri command surface for the auto-resume announcement.
//!
//! One command: [`picker_announce_actions`]. Rationale for why this is a **sibling** command
//! rather than a widening of `list_projects`, and why the gate is checked server-side, lives
//! on the parent module (the canonical home) rather than being restated here.

use tauri::{AppHandle, Manager};

use crate::config_store::settings::read_workflow_features_enabled;

use super::AnnounceMap;

/// The predicted auto-resume action for every known project, as one map.
///
/// **One call per picker open; zero per-row round-trips.** Absent key = no prediction.
/// Returns `{}` when the workflow-features gate is off, without statting any project dir.
///
/// Infallible by design: a degraded read (unreadable `projects.json`, missing
/// `session-state.json`, a vanished project dir) yields *fewer* predictions rather than an
/// error. A failure here must not break the picker — the cost of announcing nothing is a
/// label that does not appear, whereas a rejected `invoke` would surface an error toast on
/// the app's most-glanced surface for a purely advisory feature.
///
/// ⚠️ The returned map is a **prediction for display**. The click path re-derives the
/// decision; see the parent module's header for why that is what makes staleness harmless.
#[tauri::command]
pub fn picker_announce_actions(app: AppHandle) -> AnnounceMap {
    let Ok(dir) = app.path().app_data_dir() else {
        // No app-data dir: nothing to read, so nothing to announce. Fails toward silence.
        return AnnounceMap::new();
    };
    // Gate read is server-side and FIRST — an OFF gate returns before any project-dir IO.
    let gate_enabled = read_workflow_features_enabled(&dir).unwrap_or(false);
    super::announce_actions(&dir, gate_enabled)
}
