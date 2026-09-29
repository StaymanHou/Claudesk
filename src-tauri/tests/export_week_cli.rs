//! End-to-end guard for `claudesk export-week`: runs the REAL built binary, the way Neo does.
//!
//! `time_store::export`'s unit tests drive `run_cli` directly, so none of them can see the one
//! thing that makes it a CLI: `run()` intercepting `argv[1] == "export-week"` BEFORE the Tauri
//! `Builder` exists, then resolving the DB from `$HOME` + the embedded bundle identifier. A
//! regression there (the intercept moved below the Builder, `argv[2..]` off by one, the wrong
//! identifier) compiles and passes every unit test — and a moved intercept launches the GUI.
//!
//! So each case runs under a fake `$HOME` with a hard deadline: a binary that fails to exit is
//! killed and fails the test (the GUI-launched shape), never hangs the suite.
//!
//! ⚠️ Content is not asserted here — the lib's `time_store` is private, so this test cannot seed
//! a DB, and the export's figures are owned by `time_store::export::tests`. What IS asserted is
//! the dispatch: exit codes, empty stdout on failure, the resolved DB path, and no side effects.

use std::path::Path;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

/// The identifier the binary embeds (a plain `cargo` build takes `tauri.conf.json`, no dev overlay).
fn identifier() -> String {
    let conf = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json"))
        .expect("read tauri.conf.json");
    let v: serde_json::Value = serde_json::from_str(&conf).expect("parse tauri.conf.json");
    v["identifier"].as_str().expect("identifier").to_string()
}

/// Run `claudesk <args>` under `home` and return its output; kill it and panic past the deadline.
fn run(home: &Path, args: &[&str]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_claudesk"))
        .args(args)
        .env_clear()
        .env("HOME", home)
        .env("PATH", "/usr/bin:/bin")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn the claudesk binary");
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if child.try_wait().expect("poll child").is_some() {
            return child.wait_with_output().expect("collect output");
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            panic!(
                "`claudesk {}` did not exit within 20 s — the export-week intercept did not run \
                 before the Tauri Builder (the app launched instead)",
                args.join(" ")
            );
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Every path under `dir`, so "created nothing" is checked over the whole fake home.
fn tree(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).unwrap().flatten() {
            let p = e.path();
            out.push(p.strip_prefix(dir).unwrap().to_string_lossy().to_string());
            if p.is_dir() {
                stack.push(p);
            }
        }
    }
    out.sort();
    out
}

#[test]
fn a_usage_error_exits_2_with_empty_stdout_and_no_app_start() {
    let home = tempfile::tempdir().unwrap();
    let out = run(home.path(), &["export-week", "--monday", "nonsense"]);
    assert_eq!(
        out.status.code(),
        Some(2),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(out.stdout.is_empty(), "stdout must be empty on failure");
    assert!(String::from_utf8_lossy(&out.stderr).starts_with("claudesk export-week: "));
    assert_eq!(
        tree(home.path()),
        Vec::<String>::new(),
        "nothing may be written under $HOME"
    );
}

#[test]
fn a_valid_week_with_no_database_exits_1_naming_the_resolved_path() {
    let home = tempfile::tempdir().unwrap();
    // A valid `--monday` (a Thursday) gets PAST argument parsing, so exit 1 (not 2) proves
    // `argv[2..]` reached the parser intact.
    let out = run(home.path(), &["export-week", "--monday", "2026-09-24"]);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert_eq!(out.status.code(), Some(1), "stderr: {stderr}");
    assert!(out.stdout.is_empty(), "stdout must be empty on failure");
    let expected = home
        .path()
        .join("Library/Application Support")
        .join(identifier())
        .join("time-analytics.sqlite");
    assert!(
        stderr.contains(&expected.display().to_string()),
        "the DB must resolve from $HOME + the embedded identifier ({}); stderr: {stderr}",
        expected.display()
    );
    assert_eq!(
        tree(home.path()),
        Vec::<String>::new(),
        "a missing DB must never be bootstrapped"
    );
}

#[test]
fn help_prints_usage_to_stdout_and_exits_0() {
    let home = tempfile::tempdir().unwrap();
    let out = run(home.path(), &["export-week", "--help"]);
    assert_eq!(
        out.status.code(),
        Some(0),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("export-week"), "usage text; got: {stdout}");
    assert!(out.stderr.is_empty());
}
