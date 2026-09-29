use super::*;
use crate::hook_socket::HookEvent;

fn args(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

fn hook(name: &str, sid: &str, cwd: &str, ts: i64, tuid: Option<&str>) -> HookEvent {
    HookEvent {
        hook_event_name: name.to_string(),
        session_id: sid.to_string(),
        cwd: cwd.to_string(),
        timestamp: Some(ts as u64),
        prompt: None,
        message: None,
        notification_type: None,
        prompt_length_chars: None,
        tool_use_id: tuid.map(str::to_string),
        tool_name: tuid.map(|_| "Bash".to_string()),
        agent_type: None,
        source: None,
        reason: None,
        background_task_count: None,
    }
}

/// Every byte of the DATA-bearing files: the DB and its `-wal` (an empty `-wal` counts as absent).
/// ⚠️ `-shm` is deliberately excluded: it is SQLite's shared-memory WAL index, which every reader
/// legitimately creates when missing and updates (read marks). It holds no rows. A read-only open
/// of a WAL database with no sidecars creates `-shm` + an EMPTY `-wal`, so "no file changed" is
/// false for ANY reader, while "no data changed" is the real property.
fn db_bytes(db: &Path) -> Vec<(String, Vec<u8>)> {
    let dir = db.parent().unwrap();
    let mut files: Vec<(String, Vec<u8>)> = std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .map(|p| (p.file_name().unwrap().to_string_lossy().to_string(), p))
        .filter(|(n, _)| n.starts_with(DB_NAME) && !n.ends_with("-shm"))
        .map(|(n, p)| (n, std::fs::read(&p).unwrap()))
        .filter(|(n, b)| !(n.ends_with("-wal") && b.is_empty()))
        .collect();
    files.sort();
    files
}

/// A real on-disk store (WAL, as the app opens it) holding one resumed session in a git
/// repo on Wed 2026-05-13: 1 prompt + 1 min of tool before the exit, 1 prompt + 20 min after.
fn seeded_db_with_writer() -> (tempfile::TempDir, PathBuf, String, TimeStore) {
    let dir = tempfile::tempdir().unwrap();
    let repo = dir.path().join("my-project-with-a-long-name");
    std::fs::create_dir_all(repo.join(".git")).unwrap();
    let cwd = repo.to_string_lossy().to_string();
    let db = dir.path().join("data").join(DB_NAME);
    std::fs::create_dir_all(db.parent().unwrap()).unwrap();
    let store = super::super::commands::open_at_path(&db).unwrap();
    let wed = NaiveDate::from_ymd_opt(2026, 5, 13).unwrap();
    let t0 = local_midnight_ms(wed) + 9 * 3_600_000;
    let m = 60_000;
    for (name, at, tuid) in [
        ("SessionStart", 0, None),
        ("UserPromptSubmit", 1, None),
        ("PreToolUse", 2, Some("t1")),
        ("PostToolUse", 3, Some("t1")),
        ("Stop", 4, None),
        ("SessionEnd", 5, None),
        ("SessionStart", 9, None),
        ("UserPromptSubmit", 10, None),
        ("PreToolUse", 11, Some("t2")),
        ("PostToolUse", 31, Some("t2")),
        ("Stop", 32, None),
        ("SessionEnd", 33, None),
    ] {
        store
            .write_gated(&hook(name, "sess-1", &cwd, t0 + at * m, tuid), true)
            .unwrap();
    }
    (dir, db, cwd, store)
}

/// [`seeded_db_with_writer`] with the writer CLOSED — the app is not running.
fn seeded_db() -> (tempfile::TempDir, PathBuf, String) {
    let (dir, db, cwd, store) = seeded_db_with_writer();
    drop(store);
    (dir, db, cwd)
}

#[test]
fn only_the_export_week_subcommand_is_intercepted() {
    assert!(is_export_invocation(&args(&["claudesk", "export-week"])));
    assert!(!is_export_invocation(&args(&["claudesk"])));
    assert!(!is_export_invocation(&args(&["claudesk", "--monday", "x"])));
    assert!(!is_export_invocation(&args(&["claudesk", "export-weekly"])));
}

#[test]
fn parse_args_accepts_both_monday_forms_and_ignores_json() {
    let d = NaiveDate::from_ymd_opt(2026, 9, 24).unwrap();
    assert_eq!(
        parse_args(&args(&[])).unwrap(),
        ExportArgs {
            day: None,
            help: false
        }
    );
    assert_eq!(
        parse_args(&args(&["--monday", "2026-09-24"])).unwrap().day,
        Some(d)
    );
    assert_eq!(
        parse_args(&args(&["--monday=2026-09-24", "--json"]))
            .unwrap()
            .day,
        Some(d)
    );
    assert!(parse_args(&args(&["-h"])).unwrap().help);
}

#[test]
fn parse_args_rejects_bad_input_as_usage_errors() {
    for bad in [
        args(&["--monday", "nonsense"]),
        args(&["--monday"]),
        args(&["--monday=2026-13-01"]),
        args(&["--exclude", "x"]),
    ] {
        assert!(
            matches!(parse_args(&bad), Err(ExportError::Usage(_))),
            "{bad:?} must be a usage error"
        );
    }
}

#[test]
fn db_path_is_the_app_data_dir_for_the_identifier() {
    assert_eq!(
        db_path(Path::new("/Users/u"), "com.claudesk.app"),
        PathBuf::from(
            "/Users/u/Library/Application Support/com.claudesk.app/time-analytics.sqlite"
        )
    );
}

#[test]
fn a_usage_error_exits_2_with_empty_stdout() {
    let (_dir, db, _) = seeded_db();
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(
        run_cli(&args(&["--monday", "nonsense"]), &db, &mut out, &mut err),
        2
    );
    assert!(
        out.is_empty(),
        "a consumer must never parse half a document"
    );
    assert!(String::from_utf8(err)
        .unwrap()
        .contains("not a YYYY-MM-DD date"));
}

#[test]
fn a_missing_database_exits_1_with_empty_stdout_and_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join(DB_NAME);
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(run_cli(&args(&[]), &db, &mut out, &mut err), 1);
    assert!(out.is_empty());
    assert!(String::from_utf8(err)
        .unwrap()
        .contains("no analytics database"));
    assert!(!db.exists(), "the export must never bootstrap a database");
}

#[test]
fn the_export_is_read_only_and_carries_the_week_view_figures() {
    let (_dir, db, cwd) = seeded_db();
    let before = db_bytes(&db);
    let (mut out, mut err) = (Vec::new(), Vec::new());
    // A THURSDAY: the export snaps to its Monday, as the Week view does.
    let code = run_cli(&args(&["--monday", "2026-05-14"]), &db, &mut out, &mut err);
    assert_eq!(code, 0, "stderr: {}", String::from_utf8_lossy(&err));
    let after = db_bytes(&db);
    let summary = |v: &Vec<(String, Vec<u8>)>| {
        v.iter()
            .map(|(n, b)| format!("{n}:{}", b.len()))
            .collect::<Vec<_>>()
    };
    assert!(
        after == before,
        "the export wrote to the database: before {:?} after {:?}",
        summary(&before),
        summary(&after)
    );

    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["schema"], SCHEMA);
    assert_eq!(v["monday"], "2026-05-11");
    assert_eq!(v["days"].as_array().unwrap().len(), 7);
    assert_eq!(v["days"][0], "2026-05-11");
    assert!(v["tz"]["utc_offset"].as_str().unwrap().contains(':'));

    let projects = v["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1);
    let p = &projects[0];
    assert_eq!(
        p["alias"], "my-project-with-a-long-name",
        "full name, never truncated"
    );
    assert_eq!(p["path"], cwd.as_str());
    assert_eq!(p["prompts"], 2, "both lives of the resumed session");
    let wed = &p["cells"][2];
    assert_eq!(wed["date"], "2026-05-13");
    assert_eq!(wed["ai_doing_ms"], 21 * 60_000);
    assert_eq!(wed["minutes"]["ai_doing"], 21);
    // WEEK TOTAL = the AI family over the rounded cells, reasoning INCLUDED.
    let family: i64 = p["cells"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            c["minutes"]["ai_doing"].as_i64().unwrap()
                + c["minutes"]["subagent"].as_i64().unwrap()
                + c["minutes"]["ai_reasoning"].as_i64().unwrap()
        })
        .sum();
    assert_eq!(p["week_total_min"].as_i64().unwrap(), family);
    assert!(
        wed["minutes"]["ai_reasoning"].as_i64().unwrap() > 0,
        "fixture exercises reasoning"
    );
    assert!(v["engaged"]["wallclock_ms"].as_i64().unwrap() > 0);
}

#[test]
fn the_export_runs_while_the_app_holds_a_writer_open_and_sees_its_rows() {
    // The app keeps ONE long-lived WAL connection open for its whole life. The export must read
    // alongside it (WAL readers do not block the writer, nor it them) and see committed rows.
    let (_dir, db, _cwd, writer) = seeded_db_with_writer();
    let before = db_bytes(&db);
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = run_cli(&args(&["--monday", "2026-05-11"]), &db, &mut out, &mut err);
    assert_eq!(code, 0, "stderr: {}", String::from_utf8_lossy(&err));
    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(
        v["projects"][0]["prompts"], 2,
        "the open writer's rows are visible"
    );
    assert!(
        db_bytes(&db) == before,
        "the export changed the data files under a live writer"
    );
    // The writer still works afterwards: the export took no lock it kept.
    writer
        .write_gated(&hook("Stop", "sess-2", "/p", 1, None), true)
        .unwrap();
}
