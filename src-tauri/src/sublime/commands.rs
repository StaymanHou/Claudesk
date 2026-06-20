//! Tauri command wrapper for the `sublime` module.
//!
//! Thin, mirroring `cc_session/commands.rs`: delegate to the module function and
//! map [`SublimeError`](super::SublimeError) → `String` so errors cross the IPC
//! boundary.
//!
//! WP8 exposed [`sublime_open`]; WP5 adds [`smerge_open`]. The frontend calls
//! `sublime_open` from the right-panel "Open in Sublime" button + the in-app
//! `⌘⇧O` keybinding (was `⌘⇧E` pre-WP5), and `smerge_open` from the permanent
//! "Open in Sublime Merge" button — both passing the focused workspace's project
//! path. (The OS-global-hotkey design — and its `set_focused_project` /
//! `sublime_check_accessibility` commands — was scrapped 2026-06-19; see the WIP's
//! "Spec correction".)

/// Open Sublime Text at `project_path` (the focused workspace's directory).
///
/// Resolves `subl` (PATH → `.app` bundle → `open -a`) and spawns it fire-and-forget,
/// stealing focus (WP3 contract). Errors — e.g. spawn failure — cross the boundary
/// as `String`; the frontend surfaces them rather than dead-clicking (WP6 lesson).
///
/// **Transitional (WP5→WP8):** the Sublime *Text* pop is removed once the in-app
/// editor proves parity. Sublime *Merge* ([`smerge_open`]) is permanent.
#[tauri::command]
pub fn sublime_open(project_path: String) -> Result<(), String> {
    super::launch(&project_path).map_err(|e| e.to_string())
}

/// Open Sublime Merge at `project_path` (the focused workspace's directory).
///
/// Mirrors [`sublime_open`]: resolves `smerge` (PATH → `.app` bundle → `open -a`)
/// and spawns it fire-and-forget. Errors cross the boundary as `String`; the
/// frontend surfaces them rather than dead-clicking (WP6 lesson). WP5 — Sublime
/// Merge is a **permanent** companion surface (NOT removed by WP8): the inline diff
/// viewer covers *viewing*, but staging/blame/history/blob-at-rev live here.
#[tauri::command]
pub fn smerge_open(project_path: String) -> Result<(), String> {
    super::launch_merge(&project_path).map_err(|e| e.to_string())
}
