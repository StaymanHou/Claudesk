mod config_store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WP6 lands the project config store command surface (projects.json
    // persistence). WP7 will add the CcSession command set alongside it.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            config_store::commands::list_projects,
            config_store::commands::add_project,
            config_store::commands::record_open,
            config_store::commands::remove_project,
        ])
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
