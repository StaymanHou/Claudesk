mod cc_session;
mod config_store;
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
            cc_session::commands::cc_spawn,
            cc_session::commands::cc_input,
            cc_session::commands::cc_resize,
            cc_session::commands::cc_kill,
            // WP8: Sublime Text pop. Invoked from the frontend (right-panel button
            // and the in-app ⌘⇧E keybinding) with the focused workspace's path.
            sublime::commands::sublime_open,
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
