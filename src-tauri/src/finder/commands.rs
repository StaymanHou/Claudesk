//! Tauri command wrapper for the `finder` module.
//!
//! Thin, mirroring `sublime/commands.rs`: delegate to the module function and map
//! [`FinderError`](super::FinderError) → `String` so errors cross the IPC boundary.
//! The frontend "Reveal in Finder" button calls `finder_open` with the focused
//! workspace's project path.

/// Open `project_path` (the focused workspace's directory) in the macOS Finder.
///
/// Spawns `open <dir>` fire-and-forget. Errors — e.g. spawn failure — cross the
/// boundary as `String`; the frontend surfaces them rather than dead-clicking
/// (the WP6 picker lesson).
#[tauri::command]
pub fn finder_open(app: tauri::AppHandle, project_path: String) -> Result<(), String> {
    super::launch(&project_path).map_err(|e| e.to_string())?;
    // M9 WP2.5: mark the Claudesk-initiated Finder launch (gated, tool identity only).
    crate::time_store::commands::record_external_launch(
        &app,
        crate::time_store::NativeLaunchTool::Finder,
    );
    Ok(())
}
