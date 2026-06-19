//! Tauri command wrapper for the `sublime` module.
//!
//! Thin, mirroring `cc_session/commands.rs`: delegate to the module function and
//! map [`SublimeError`](super::SublimeError) → `String` so errors cross the IPC
//! boundary.
//!
//! WP8 exposes one command: [`sublime_open`]. The frontend calls it from the
//! right-panel "Open in Sublime" button and the in-app `⌘⇧E` keybinding, passing
//! the focused workspace's project path. (The OS-global-hotkey design — and its
//! `set_focused_project` / `sublime_check_accessibility` commands — was scrapped
//! 2026-06-19; see the WIP's "Spec correction".)

/// Open Sublime Text at `project_path` (the focused workspace's directory).
///
/// Resolves `subl` (PATH → `.app` bundle → `open -a`) and spawns it fire-and-forget,
/// stealing focus (WP3 contract). Errors — e.g. spawn failure — cross the boundary
/// as `String`; the frontend surfaces them rather than dead-clicking (WP6 lesson).
#[tauri::command]
pub fn sublime_open(project_path: String) -> Result<(), String> {
    super::launch(&project_path).map_err(|e| e.to_string())
}
