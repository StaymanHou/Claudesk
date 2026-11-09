//! paydown-2026-11-08 WP5 — the Tauri surface over [`super`]'s trust read.
//!
//! ⚠️ Deliberately thin, and it answers one boolean. The fire DECISION lives in TypeScript
//! (`autoResumeFire.ts` → `shouldInject`), which is the single funnel every auto-resume inject
//! goes through.

use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::cc_session::SessionRegistry;

/// Whether CC's folder-trust dialog has been accepted for `project_path`, under the config of
/// the session's LIVE profile (`pty_session_id`), else the row's stored profile.
///
/// Every failure is `false` (D4): no home dir, an unlisted profile, an unreadable or malformed
/// `.claude.json`, or no trusted entry on the path.
#[tauri::command]
pub fn folder_trusted(
    app: AppHandle,
    registry: State<'_, Mutex<SessionRegistry>>,
    project_path: String,
    pty_session_id: Option<String>,
) -> bool {
    let Ok(home) = app.path().home_dir() else {
        return false;
    };
    let project = Path::new(&project_path);
    let Some(target) = crate::config_store::commands::live_config_target(
        &app,
        &registry,
        project,
        pty_session_id.as_deref(),
    ) else {
        return false;
    };
    super::is_trusted_on_disk(&super::claude_json_path(&home, &target), project)
}
