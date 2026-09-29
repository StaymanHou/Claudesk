//! M16 — the asset protocol's STATIC scope must stay EMPTY.
//!
//! The media viewer loads project files through `asset://` (`convertFileSrc`). The app ships
//! `"csp": null`, so every path the asset scope admits is readable by any script in the webview.
//! The design (M16 `wbs.md` → Rulings) adds each workspace root to the scope **at runtime**,
//! after `editor_fs`'s root validation — never a static glob. A `"scope": ["**"]` (the one-line
//! "just make it work" fix) would make the whole disk readable from the webview with nothing on
//! screen to say so. This pins both config files so that change fails a test.

use serde_json::Value;

fn config(name: &str) -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(name);
    let text = std::fs::read_to_string(&path).expect("read tauri config");
    serde_json::from_str(&text).expect("parse tauri config")
}

#[test]
fn base_config_enables_the_asset_protocol_with_an_empty_static_scope() {
    let conf = config("tauri.conf.json");
    let asset = &conf["app"]["security"]["assetProtocol"];
    assert_eq!(
        asset["enable"],
        Value::Bool(true),
        "the media viewer needs the asset protocol enabled"
    );
    assert_eq!(
        asset["scope"],
        Value::Array(vec![]),
        "the static asset scope must be EMPTY; roots are added at runtime after validation"
    );
}

#[test]
fn dev_overlay_does_not_widen_the_asset_scope() {
    let dev = config("tauri.dev.json");
    assert!(
        dev["app"]["security"].get("assetProtocol").is_none(),
        "tauri.dev.json must not carry its own assetProtocol block (it would override the base scope)"
    );
}
