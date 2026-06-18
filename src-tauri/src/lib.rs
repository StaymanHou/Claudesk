#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Command surface is intentionally empty until WP7 defines the CcSession
    // command set. Add commands to generate_handler![] as they land.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![])
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
