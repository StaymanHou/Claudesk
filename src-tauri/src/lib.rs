mod cc_session;
mod config_store;
mod editor_fs;
mod fs_index;
mod git_diff;
mod project_search;
mod sublime;

use std::sync::Mutex;

use tauri::{Manager, WindowEvent};

use cc_session::SessionRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // WP7: the live CC sessions live here, reachable from the cc_* commands.
        .manage(Mutex::new(SessionRegistry::new()))
        .invoke_handler(tauri::generate_handler![
            config_store::commands::list_projects,
            config_store::commands::add_project,
            config_store::commands::record_open,
            config_store::commands::remove_project,
            // WP9: prune projects whose folder was deleted between sessions.
            config_store::commands::prune_missing_projects,
            cc_session::commands::cc_spawn,
            cc_session::commands::cc_input,
            cc_session::commands::cc_resize,
            cc_session::commands::cc_kill,
            // WP8: Sublime Text pop. Invoked from the frontend (right-panel button
            // and the in-app ⌘⇧O keybinding — was ⌘⇧E pre-WP5) with the focused
            // workspace's path. Transitional — removed at WP8 once editor parity.
            sublime::commands::sublime_open,
            // WP5: Sublime Merge open. Permanent companion surface (NOT removed by
            // WP8) — staging/blame/history/blob-at-rev the inline diff viewer omits.
            sublime::commands::smerge_open,
            // WP2: lite-editor file IO, confined to the workspace project root.
            // (write_file is exercised by the save keybinding in Phase 2.)
            editor_fs::commands::read_file,
            editor_fs::commands::write_file,
            // WP12: file disk-marker (mtime + size) for the tab strip's disk-change
            // detection — checked on tab-activate + pre-save to spot a file CC edited.
            editor_fs::commands::stat_file,
            // WP4: git diff viewer data (Sublime-Merge-style). The backend computes
            // the real git hunks + commit history; the frontend renders styled +/-
            // lines (no @codemirror/merge). (The superseded git_file_base command
            // from WP4's first attempt was removed in PB.7 once the old DiffPanel
            // that called it was deleted — tauri-command-removal-needs-invoke-sweep.)
            git_diff::commands::git_changed_files,
            git_diff::commands::git_file_hunks,
            git_diff::commands::git_recent_commits,
            git_diff::commands::git_commit_diff,
            // WP6: Cmd+P fuzzy file finder. Walks the workspace project dir honoring
            // .gitignore (ignore crate) and returns the file list the finder overlay
            // fuzzy-matches over. Errors surface to the overlay, never empty-on-fail.
            fs_index::commands::fs_index,
            // WP10: file-tree navigator. Same gitignore-honoring walk as fs_index but
            // returns files + directories (tagged) so the frontend can nest a tree.
            fs_index::commands::fs_tree,
            // WP7: project-wide content search ("Find in Files", ⌘⇧F overlay). Reuses
            // fs_index's `ignore` walker (one shared .gitignore contract with the
            // finder + tree) and matches per-line with the `regex` crate. Errors
            // (bad root, invalid regex) surface to the overlay, never empty-on-fail.
            project_search::commands::project_search,
        ])
        .on_window_event(|window, event| {
            // WP7 shutdown: kill every CC child on window close so we never leak an
            // orphaned `claude`. Backend-driven (robust against a frozen webview).
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(registry) = window.try_state::<Mutex<SessionRegistry>>() {
                    if let Ok(mut reg) = registry.lock() {
                        reg.kill_all();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(1 + 1, 2);
    }
}
