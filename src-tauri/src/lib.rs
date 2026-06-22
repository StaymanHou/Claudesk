mod cc_session;
mod config_store;
mod editor_fs;
mod fs_index;
mod git_diff;
mod git_status;
// M3 WP2: register Claudesk's CC hook in ~/.claude/settings.json (additive,
// idempotent, reversible). The setup-hook install wiring lands in WP2 Phase 2.
mod hook_install;
// M3 WP3: AF_UNIX listener that receives the CC hook's JSON lines (the receive
// side of the status channel WP2's hook writes to). Phase 1 = the typed
// HookEvent + pure parse seam; Phase 2 binds the socket + accept-loop thread.
mod hook_socket;
mod project_search;
mod sublime;

use std::sync::Mutex;

use tauri::{Emitter, Manager, WindowEvent};

use cc_session::SessionRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // WP7: the live CC sessions live here, reachable from the cc_* commands.
        .manage(Mutex::new(SessionRegistry::new()))
        // M3 WP2: register Claudesk's CC hook in ~/.claude/settings.json on launch
        // (deploy the bundled script to app-data, chmod +x, additive-merge the three
        // M3 events). Idempotent + additive + reversible (see hook_install). A
        // failure is surfaced, never swallowed (the WP6/WP7-M2 IPC-error lesson):
        // log to stderr AND emit `hook-install-error` so the frontend can toast it —
        // status would silently break otherwise.
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = hook_install::commands::install_on_launch(&handle) {
                eprintln!("[claudesk] hook install failed: {e}");
                let _ = handle.emit("hook-install-error", e);
            }
            // M3 WP3: bind the AF_UNIX listener that RECEIVES the hook's JSON lines
            // and spawn its accept-loop thread (the receive side of the status
            // channel WP2's hook writes to). The receiver is held in managed state
            // for WP4's broadcaster to drain. A bind failure is surfaced, never
            // swallowed — status then defaults to Unknown, never PTY-inferred.
            match hook_socket::commands::start_on_launch(&handle) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(e) => hook_socket::commands::emit_start_error(&handle, &e),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_store::commands::list_projects,
            config_store::commands::add_project,
            config_store::commands::record_open,
            config_store::commands::remove_project,
            // WP9: prune projects whose folder was deleted between sessions.
            config_store::commands::prune_missing_projects,
            cc_session::commands::cc_spawn,
            // WP9: second-terminal panel — spawns the user's login shell (not claude)
            // into the same SessionRegistry; reuses cc_input/cc_resize/cc_kill.
            cc_session::commands::term_spawn,
            cc_session::commands::cc_input,
            cc_session::commands::cc_resize,
            cc_session::commands::cc_kill,
            // WP9: frontend-ready signal — flushes the pre-subscription output backlog
            // (closes the shell-prompt race where a shell's one-shot prompt emitted
            // before the frontend's listener attached).
            cc_session::commands::cc_ready,
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
            // WP11: per-path working-tree status map for the file-tree row indicators
            // (Sublime-sidebar style). Reuses git_diff's git2 plumbing; a non-git
            // workspace returns an empty map (not an error) so the tree still renders.
            git_status::commands::git_file_statuses,
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
            // WP7 Phase 3: project-wide Replace All — reuses the same composed regex +
            // shared walk as search, writes via editor_fs's atomic root-confined writer.
            project_search::commands::project_replace,
            // M3 WP2: remove Claudesk's CC hook from ~/.claude/settings.json (only
            // ours). Exposed for a future settings toggle / clean teardown. The
            // install runs once at launch (WP2 Phase 2 setup wiring), not via IPC.
            hook_install::commands::hook_uninstall,
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
                // M3 WP3: unlink the hook socket on close (mirror the kill_all
                // reaping discipline). Belt to bind_listener's stale-file removal.
                if let Some(state) = window.try_state::<hook_socket::commands::HookSocketState>() {
                    hook_socket::commands::cleanup_socket(&state.socket_path);
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
