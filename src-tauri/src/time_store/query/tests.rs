//! Query-layer tests (M9 WP4 Phase 2). Structural oracle: claude-time's
//! `test/test_viz_data.py` — the SURVIVING assertions are ported (empty-day shape,
//! single-burst shape, per-project rollup, alias resolution, hour-range adaptive/
//! fallback/clamp, week-rollup aggregation, day/week key-shape). Where WP3's 6-kind
//! enum changed the segment shape, the assertions are written FRESH against the new
//! kinds (`ai-doing`/`ai-reasoning`/`subagent`/`typing`/`reviewing`/`away`) rather
//! than the old `active`/`reading`/`thinking`. The metrics/comparison test classes
//! from the reference are DELIBERATELY NOT ported (WP6c scope).

use super::*;
use crate::reclassify::EventRow;
use std::collections::HashMap;

// ---- test event builders (mirror reclassify/tests.rs conventions) ---------

fn ev(ts: i64, session_id: &str, cwd: &str, event: &str) -> EventRow {
    EventRow {
        ts,
        session_id: session_id.to_string(),
        cwd: cwd.to_string(),
        event: event.to_string(),
        tool_name: None,
        agent_type: None,
        source: "cc-hook".to_string(),
        meta: None,
    }
}

fn with_tool(mut e: EventRow, tool: &str, tuid: &str) -> EventRow {
    e.tool_name = Some(tool.to_string());
    e.meta = Some(format!(r#"{{"tool_use_id":"{tuid}"}}"#));
    e
}

fn with_agent(mut e: EventRow, agent_type: &str) -> EventRow {
    e.agent_type = Some(agent_type.to_string());
    e
}

fn no_names() -> HashMap<String, Vec<String>> {
    HashMap::new()
}

/// A NaiveDate for tests (local-tz-agnostic — the builders derive day_start from it).
fn day(y: i32, m: u32, d: u32) -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

/// Local-midnight epoch-ms for a test date + an offset in minutes (so tests can place
/// events at a known minutes-from-midnight without hardcoding a tz).
fn at_minute(d: chrono::NaiveDate, minute: i64) -> i64 {
    super::local_midnight_ms(d) + minute * 60_000
}

// ---- build_day: empty day (oracle: test_empty_day, L59) -------------------

#[test]
fn empty_day_has_empty_projects_default_hour_range_and_empty_flag() {
    let d = day(2026, 5, 13);
    let payload = build_day(d, &[], &no_names());
    assert!(payload.projects.is_empty());
    assert_eq!(payload.hour_range, [6, 23]);
    assert_eq!(payload.empty, Some(true));
    assert_eq!(payload.iso, "2026-05-13");
    // label is upper-cased "%a · %b %d"
    assert!(payload.label.contains("MAY 13"), "label={}", payload.label);
}

// ---- build_day: single burst (oracle: test_single_burst_shape, L67) -------
// FRESH for WP3: the old oracle produced one `active` seg; WP3 tiles the AI-busy
// window as ai-doing (tool present) / ai-reasoning (no tool). A UPS→Pre→Post→Stop
// burst with an Edit tool tiles to ai-reasoning (pre-tool gap) + ai-doing (the tool).

#[test]
fn single_burst_one_project_one_session_tiled_in_six_kind_enum() {
    let d = day(2026, 5, 13);
    // 9:00 UPS, 9:05 PreToolUse Edit, 9:06 PostToolUse Edit, 9:30 Stop
    let events = [
        ev(
            at_minute(d, 540),
            "sess1234abcd",
            "/repo/proj-a",
            "UserPromptSubmit",
        ),
        with_tool(
            ev(
                at_minute(d, 545),
                "sess1234abcd",
                "/repo/proj-a",
                "PreToolUse",
            ),
            "Edit",
            "t1",
        ),
        with_tool(
            ev(
                at_minute(d, 546),
                "sess1234abcd",
                "/repo/proj-a",
                "PostToolUse",
            ),
            "Edit",
            "t1",
        ),
        ev(at_minute(d, 570), "sess1234abcd", "/repo/proj-a", "Stop"),
    ];
    let payload = build_day(d, &events, &no_names());
    assert_eq!(payload.empty, None, "non-empty day has no empty flag");
    assert_eq!(payload.projects.len(), 1);
    let proj = &payload.projects[0];
    // alias falls back to "misc" (/repo/proj-a is not a git repo in the test fs)
    assert_eq!(proj.alias, "misc");
    assert_eq!(proj.id, proj.alias);
    assert_eq!(proj.sessions.len(), 1);
    let sess = &proj.sessions[0];
    assert_eq!(sess.id, "sess1234"); // first 8 chars
    assert_eq!(sess.start, 540); // minutes-from-local-midnight
    assert_eq!(sess.end, 570);
    assert_eq!(sess.prompts, 1);
    assert_eq!(sess.tools.get("Edit"), Some(&1));
    assert!(
        sess.day_iso.is_none(),
        "bare day payload has no day_iso tag"
    );
    // segs tile [540, 570] with no gaps/overlaps, all in the 6-kind enum.
    assert!(!sess.segs.is_empty());
    assert_eq!(sess.segs.first().unwrap().start, 540);
    assert_eq!(sess.segs.last().unwrap().end, 570);
    for w in sess.segs.windows(2) {
        assert!(w[0].end <= w[1].start, "segs must not overlap");
    }
    // the tool span [545,546] must be tagged ai-doing; the rest of the AI-busy window
    // is ai-reasoning (no human idle here — the whole burst is AI-busy).
    let kinds: Vec<&str> = sess.segs.iter().map(|s| s.kind.as_str()).collect();
    assert!(
        kinds.contains(&"ai-doing"),
        "tool exec → ai-doing; got {kinds:?}"
    );
    assert!(
        kinds
            .iter()
            .all(|k| matches!(*k, "ai-doing" | "ai-reasoning" | "subagent")),
        "a fully AI-busy burst has only AI-family segs; got {kinds:?}"
    );
}

// ---- segment kinds are all valid (oracle: test_segment_kinds_are_valid, L96) -

#[test]
fn all_emitted_segment_kinds_are_in_the_six_kind_enum() {
    let d = day(2026, 5, 13);
    let events = [
        ev(at_minute(d, 540), "s1", "/repo/x", "UserPromptSubmit"),
        with_tool(
            ev(at_minute(d, 545), "s1", "/repo/x", "PreToolUse"),
            "Bash",
            "t1",
        ),
        with_tool(
            ev(at_minute(d, 546), "s1", "/repo/x", "PostToolUse"),
            "Bash",
            "t1",
        ),
        ev(at_minute(d, 570), "s1", "/repo/x", "Stop"),
    ];
    let valid = [
        "ai-doing",
        "subagent",
        "ai-reasoning",
        "typing",
        "reviewing",
        "away",
    ];
    let payload = build_day(d, &events, &no_names());
    for p in &payload.projects {
        for s in &p.sessions {
            for seg in &s.segs {
                assert!(
                    valid.contains(&seg.kind.as_str()),
                    "invalid kind {}",
                    seg.kind.as_str()
                );
                assert!(seg.start <= seg.end);
            }
        }
    }
}

// ---- subagent nesting carries a label (oracle: test_subagent_nested_within_active) -

#[test]
fn subagent_segment_within_ai_busy_carries_agent_type_label() {
    let d = day(2026, 5, 13);
    // A burst 9:00–9:30; a subagent Explore 9:10–9:20 inside it.
    let events = [
        ev(at_minute(d, 540), "s1", "/repo/x", "UserPromptSubmit"),
        with_agent(
            ev(at_minute(d, 550), "s1", "/repo/x", "SubagentStart"),
            "Explore",
        ),
        with_agent(
            ev(at_minute(d, 560), "s1", "/repo/x", "SubagentStop"),
            "Explore",
        ),
        ev(at_minute(d, 570), "s1", "/repo/x", "Stop"),
    ];
    let payload = build_day(d, &events, &no_names());
    let sess = &payload.projects[0].sessions[0];
    let sub = sess.segs.iter().find(|s| s.kind.as_str() == "subagent");
    let sub = sub.expect("a subagent segment must be present");
    assert_eq!(sub.label.as_deref(), Some("Explore"));
    assert_eq!(sub.start, 550);
    assert_eq!(sub.end, 560);
    // non-subagent segs never carry a label
    for s in &sess.segs {
        if s.kind.as_str() != "subagent" {
            assert!(
                s.label.is_none(),
                "{} seg must not carry a label",
                s.kind.as_str()
            );
        }
    }
}

// ---- alias resolution (oracle: AliasResolutionTests) ----------------------

#[test]
fn explicit_project_names_entry_wins_over_git_fallback() {
    let mut names = HashMap::new();
    names.insert("my-proj".to_string(), vec!["/some/cwd".to_string()]);
    assert_eq!(super::resolve_alias("/some/cwd", &names), "my-proj");
}

#[test]
fn unknown_cwd_falls_back_to_misc() {
    // A path that is not inside any git repo → "misc".
    assert_eq!(
        super::resolve_alias("/definitely/not/a/repo/xyz", &no_names()),
        "misc"
    );
    assert_eq!(super::auto_alias(""), "misc");
}

// ---- hour range (oracle: HourRangeTests) ----------------------------------

#[test]
fn hour_range_adaptive_pads_one_hour_each_side() {
    // sessions spanning 9:00–17:00 → [8, 18]
    let d = day(2026, 5, 13);
    let events = [
        ev(at_minute(d, 540), "s1", "/repo/x", "UserPromptSubmit"),
        ev(at_minute(d, 1020), "s1", "/repo/x", "Stop"),
    ];
    let payload = build_day(d, &events, &no_names());
    assert_eq!(payload.hour_range, [8, 18]);
}

#[test]
fn hour_range_clamps_to_day_bounds() {
    // A session near midnight and near end-of-day → clamps to [0, 24].
    let d = day(2026, 5, 13);
    let events = [
        ev(at_minute(d, 10), "s1", "/repo/x", "UserPromptSubmit"),
        ev(at_minute(d, 1430), "s1", "/repo/x", "Stop"),
    ];
    let payload = build_day(d, &events, &no_names());
    assert_eq!(payload.hour_range[0], 0);
    assert_eq!(payload.hour_range[1], 24);
}

// ---- per-project partitioning (multiple sessions → aliases) ---------------

#[test]
fn two_sessions_in_different_cwds_become_two_projects() {
    let d = day(2026, 5, 13);
    let mut names = HashMap::new();
    names.insert("alpha".to_string(), vec!["/a".to_string()]);
    names.insert("beta".to_string(), vec!["/b".to_string()]);
    let events = [
        ev(at_minute(d, 540), "sA", "/a", "UserPromptSubmit"),
        ev(at_minute(d, 570), "sA", "/a", "Stop"),
        ev(at_minute(d, 600), "sB", "/b", "UserPromptSubmit"),
        ev(at_minute(d, 660), "sB", "/b", "Stop"),
    ];
    let payload = build_day(d, &events, &names);
    let aliases: std::collections::BTreeSet<&str> =
        payload.projects.iter().map(|p| p.alias.as_str()).collect();
    assert_eq!(aliases, ["alpha", "beta"].into_iter().collect());
}

// ---- range builder (oracle: BuildRangeDataTests) --------------------------

#[test]
fn empty_range_raises_when_end_precedes_start() {
    let err = build_range(day(2026, 5, 14), day(2026, 5, 13), &[], &no_names());
    assert!(err.is_err(), "end before start must Err");
}

#[test]
fn single_day_range_has_back_compat_iso_and_hour_range() {
    let d = day(2026, 5, 13);
    let events = [
        ev(at_minute(d, 540), "s1", "/repo/x", "UserPromptSubmit"),
        ev(at_minute(d, 570), "s1", "/repo/x", "Stop"),
    ];
    let range = build_range(d, d, &events, &no_names()).unwrap();
    assert_eq!(range.meta.day_count, 1);
    assert_eq!(range.iso.as_deref(), Some("2026-05-13"));
    assert!(
        range.hour_range.is_some(),
        "1-day range carries back-compat hour_range"
    );
}

#[test]
fn multi_day_range_unions_projects_and_tags_sessions_with_day_iso() {
    let d1 = day(2026, 5, 13);
    let d2 = day(2026, 5, 14);
    let mut names = HashMap::new();
    names.insert("proj".to_string(), vec!["/p".to_string()]);
    let events = [
        // day 1 session
        ev(at_minute(d1, 540), "s1", "/p", "UserPromptSubmit"),
        ev(at_minute(d1, 570), "s1", "/p", "Stop"),
        // day 2 session, same alias
        ev(at_minute(d2, 600), "s2", "/p", "UserPromptSubmit"),
        ev(at_minute(d2, 660), "s2", "/p", "Stop"),
    ];
    let range = build_range(d1, d2, &events, &names).unwrap();
    assert_eq!(range.meta.day_count, 2);
    assert_eq!(range.projects.len(), 1, "same alias unions across days");
    let proj = &range.projects[0];
    assert_eq!(proj.sessions.len(), 2);
    let days: Vec<Option<&str>> = proj.sessions.iter().map(|s| s.day_iso.as_deref()).collect();
    assert!(days.contains(&Some("2026-05-13")));
    assert!(days.contains(&Some("2026-05-14")));
    // day_window unions the per-day adaptive ranges
    assert_eq!(range.hour_range_by_day.len(), 2);
}

// ---- week builder (oracle: WeekRollupTests) -------------------------------

#[test]
fn empty_week_has_seven_day_labels_and_no_projects() {
    let monday = day(2026, 5, 11); // a Monday
    let week = build_week(monday, &[], &no_names()).unwrap();
    assert_eq!(week.days.len(), 7);
    assert!(week.projects.is_empty());
    assert!(week.label.starts_with("WEEK "), "label={}", week.label);
}

#[test]
fn week_rollup_aggregates_per_day_per_kind_minutes() {
    let monday = day(2026, 5, 11);
    let tuesday = day(2026, 5, 12);
    let mut names = HashMap::new();
    names.insert("proj".to_string(), vec!["/p".to_string()]);
    let events = [
        // Monday: a tool burst (ai-doing minutes land in cell 0)
        ev(at_minute(monday, 540), "s1", "/p", "UserPromptSubmit"),
        with_tool(
            ev(at_minute(monday, 545), "s1", "/p", "PreToolUse"),
            "Edit",
            "t1",
        ),
        with_tool(
            ev(at_minute(monday, 550), "s1", "/p", "PostToolUse"),
            "Edit",
            "t1",
        ),
        ev(at_minute(monday, 570), "s1", "/p", "Stop"),
        // Tuesday: another burst (cell 1)
        ev(at_minute(tuesday, 600), "s2", "/p", "UserPromptSubmit"),
        with_tool(
            ev(at_minute(tuesday, 605), "s2", "/p", "PreToolUse"),
            "Bash",
            "t2",
        ),
        with_tool(
            ev(at_minute(tuesday, 610), "s2", "/p", "PostToolUse"),
            "Bash",
            "t2",
        ),
        ev(at_minute(tuesday, 660), "s2", "/p", "Stop"),
    ];
    let week = build_week(monday, &events, &names).unwrap();
    assert_eq!(week.projects.len(), 1);
    let rollup = &week.projects[0].rollup;
    assert_eq!(rollup.len(), 7);
    // Monday cell (0) and Tuesday cell (1) each carry a prompt + some AI minutes.
    assert_eq!(rollup[0].prompts, 1, "Monday prompt");
    assert_eq!(rollup[1].prompts, 1, "Tuesday prompt");
    assert!(
        rollup[0].ai_doing + rollup[0].ai_reasoning > 0,
        "Monday has AI minutes"
    );
    assert!(
        rollup[1].ai_doing + rollup[1].ai_reasoning > 0,
        "Tuesday has AI minutes"
    );
    // Wed–Sun are empty.
    for cell in &rollup[2..] {
        assert_eq!(*cell, RollupCell::default());
    }
}

// ---- DTO serde shape (folds IPC-casing convention; mirrors
// status_broadcaster::dto_serde_shape_is_snake_case) -----------------------

#[test]
fn dto_serde_shape_is_snake_case_and_kind_is_kebab_tag() {
    // Pin the exact wire keys so WP6's TS types mirror them verbatim. A rename_all or
    // field rename must BREAK this test, not silently drift.
    let seg = SegPayload {
        kind: crate::reclassify::Kind::Subagent,
        start: 10,
        end: 20,
        label: Some("Explore".to_string()),
    };
    let seg_val = serde_json::to_value(&seg).unwrap();
    let seg_obj = seg_val.as_object().unwrap();
    let mut seg_keys: Vec<&String> = seg_obj.keys().collect();
    seg_keys.sort();
    assert_eq!(
        seg_keys,
        vec![
            &"end".to_string(),
            &"kind".to_string(),
            &"label".to_string(),
            &"start".to_string()
        ]
    );
    // kind serializes to the WP3 kebab tag, NOT the Rust variant name.
    assert_eq!(seg_obj["kind"], serde_json::json!("subagent"));

    // A non-subagent seg omits `label` entirely (skip_serializing_if).
    let ai = SegPayload {
        kind: crate::reclassify::Kind::AiDoing,
        start: 0,
        end: 5,
        label: None,
    };
    let ai_obj = serde_json::to_value(&ai).unwrap();
    assert!(
        ai_obj.as_object().unwrap().get("label").is_none(),
        "label omitted when None"
    );
    assert_eq!(ai_obj["kind"], serde_json::json!("ai-doing"));

    // DayPayload key-shape: exactly {label, iso, projects, hour_range} on a non-empty
    // day (no `empty` key), + `empty` present only on an empty day.
    let d = day(2026, 5, 13);
    let nonempty = build_day(
        d,
        &[
            ev(at_minute(d, 540), "s1", "/repo/x", "UserPromptSubmit"),
            ev(at_minute(d, 570), "s1", "/repo/x", "Stop"),
        ],
        &no_names(),
    );
    let day_obj = serde_json::to_value(&nonempty).unwrap();
    let day_map = day_obj.as_object().unwrap();
    let mut day_keys: Vec<&String> = day_map.keys().collect();
    day_keys.sort();
    assert_eq!(
        day_keys,
        vec![
            &"hour_range".to_string(),
            &"iso".to_string(),
            &"label".to_string(),
            &"projects".to_string(),
        ],
        "non-empty day omits the `empty` key"
    );

    let empty = build_day(d, &[], &no_names());
    let empty_val = serde_json::to_value(&empty).unwrap();
    assert_eq!(
        empty_val["empty"],
        serde_json::json!(true),
        "empty day carries empty=true"
    );

    // SessionPayload nested key-shape (day_iso omitted on a bare day payload).
    let sess_val = serde_json::to_value(&nonempty.projects[0].sessions[0]).unwrap();
    let sess_map = sess_val.as_object().unwrap();
    let mut sess_keys: Vec<&String> = sess_map.keys().collect();
    sess_keys.sort();
    assert_eq!(
        sess_keys,
        vec![
            &"end".to_string(),
            &"id".to_string(),
            &"prompts".to_string(),
            &"segs".to_string(),
            &"start".to_string(),
            &"tools".to_string(),
        ],
        "bare-day session omits day_iso"
    );
}
