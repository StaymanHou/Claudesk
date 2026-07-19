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

/// Local-midnight epoch-ms for a test date + an offset in MILLISECONDS — for placing
/// SUB-MINUTE events (a real CC tool call is Pre→Post ~1s apart). Used to reproduce the
/// minute-quantization bug where sub-minute AI work must still accrue duration.
fn at_ms(d: chrono::NaiveDate, ms: i64) -> i64 {
    super::local_midnight_ms(d) + ms
}

// ---- ms_to_minutes_round: the round-half-up duration→minutes helper --------
// Pins the load-bearing arithmetic of the minute-quantization fix
// (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…). This is what lets per-kind ms
// totals accrue to real minutes instead of per-segment flooring to zero. Boundary
// behavior is round-half-up with a 30_000ms pivot; must match the FE `msToMinutesRound`.

#[test]
fn ms_to_minutes_round_is_round_half_up_and_zero_clamped() {
    assert_eq!(super::ms_to_minutes_round(0), 0);
    assert_eq!(
        super::ms_to_minutes_round(-5_000),
        0,
        "negative clamps to 0"
    );
    assert_eq!(
        super::ms_to_minutes_round(29_999),
        0,
        "just under half a min → 0"
    );
    assert_eq!(
        super::ms_to_minutes_round(30_000),
        1,
        "exactly half → rounds up"
    );
    assert_eq!(super::ms_to_minutes_round(59_999), 1);
    assert_eq!(super::ms_to_minutes_round(60_000), 1);
    assert_eq!(super::ms_to_minutes_round(89_999), 1, "1m29.999s → 1");
    assert_eq!(super::ms_to_minutes_round(90_000), 2, "1m30s → 2 (half up)");
    // The bug's shape: many sub-minute spans that individually floor to 0 but SUM to
    // real minutes — the helper is only ever fed the per-kind TOTAL, never per-segment.
    let total: i64 = 6 * 18_000; // 6 × 18s = 108s
    assert_eq!(
        super::ms_to_minutes_round(total),
        2,
        "108s total → 2m (not 0)"
    );
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

// ---- REGRESSION (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-ZEROES-SUBMINUTE-AI-DOING) --
// Bug: sub-minute AI tool-execution contributes 0 minutes to `ai-doing` because query.rs
// floors each segment's ms endpoints to integer minutes (ts_to_minutes) BEFORE summing
// per-kind durations (seg.end - seg.start). A real CC tool call is Pre→Post ~1s apart, so
// its [start,end] floors to the SAME minute → end-start == 0 → the AI's actual work
// vanishes from the rollup while the minute-scale reviewing gaps survive + over-report.
// Empirically: neo session df2a3051 (92 tool events over 11 min) reclassified to
// {ai_doing:0, reviewing:11}. This test packs several sub-minute tool calls whose SUMMED
// duration exceeds a minute, and asserts ai-doing accrues real time. RED before the fix.

#[test]
fn subminute_tool_calls_accrue_ai_doing_minutes_not_zero() {
    // 2026-05-11 is a Monday (day_index 0 in the week rollup).
    let monday = day(2026, 5, 11);
    // A single AI-busy session at ~09:00. Six back-to-back tool calls, each Pre→Post
    // ~18s apart, spanning 09:00:00 → ~09:01:48 (6 × 18s = 108s ≈ 2 min of tool
    // execution), then a Stop. NO human idle — the whole window is AI-busy, so the AI
    // tiler yields ai-doing (the tool spans) + thin ai-reasoning (inter-tool gaps).
    //
    // Assert on the WEEK ROLLUP's `ai_doing` ALONE (the exact user-visible number that
    // was wrong — neo showed a 1m pill). We deliberately do NOT assert on
    // `ai_doing + ai_reasoning` (the pre-existing week tests do, which is WHY they never
    // caught this — ai_reasoning's minute-scale gaps mask a zeroed ai_doing). We also do
    // NOT read `seg.end - seg.start` on the payload: the fix KEEPS start/end
    // minute-quantized for render position, so those stay same-minute; the fix is that
    // the rollup sums TRUE duration. RED today (ai_doing == 0), GREEN after the fix.
    let base = 540 * 60_000; // 09:00:00 in ms-from-midnight
    let mut events = vec![ev(
        at_ms(monday, base),
        "sess1234abcd",
        "/repo/proj-a",
        "UserPromptSubmit",
    )];
    for i in 0..6 {
        let pre = base + i * 18_000;
        let post = pre + 18_000; // 18s of execution, back-to-back
        let tuid = format!("t{i}");
        events.push(with_tool(
            ev(
                at_ms(monday, pre),
                "sess1234abcd",
                "/repo/proj-a",
                "PreToolUse",
            ),
            "Bash",
            &tuid,
        ));
        events.push(with_tool(
            ev(
                at_ms(monday, post),
                "sess1234abcd",
                "/repo/proj-a",
                "PostToolUse",
            ),
            "Bash",
            &tuid,
        ));
    }
    events.push(ev(
        at_ms(monday, base + 108_000 + 12_000),
        "sess1234abcd",
        "/repo/proj-a",
        "Stop",
    ));

    let week = build_week(monday, &events, &no_names()).unwrap();
    assert_eq!(week.projects.len(), 1, "one project expected");
    let mon_cell = &week.projects[0].rollup[0];
    // 6 tool calls × 18s = 108s = 1.8 min of TRUE ai-doing → round-half-up = 2 min.
    // The buggy per-segment minute-floor reports ai_doing=1 (only the one tool span that
    // happens to straddle the 09:00→09:01 boundary survives with end-start=1; the other
    // five floor to same-minute zero-width). So >=2 is the discriminating assertion:
    // RED today (==1), GREEN after the fix (sums true duration → 2).
    assert!(
        mon_cell.ai_doing >= 2,
        "sub-minute tool execution must accrue its TRUE ai-doing minutes (108s ≈ 2 min) \
         in the week rollup, not the minute-floored residue; got ai_doing={} \
         (full Monday cell: {mon_cell:?})",
        mon_cell.ai_doing
    );
}

#[test]
fn tool_calls_within_a_single_minute_still_accrue_ai_doing() {
    // The starkest form of the quantization bug: several tool calls ALL inside one
    // clock-minute → every seg floors to the SAME minute → end-start==0 for all → the
    // buggy rollup reports ai_doing=0 even though the AI worked ~48s. A correct impl
    // rounds 48s → 1 min. RED today (==0), GREEN after the fix.
    let monday = day(2026, 5, 11);
    let base = 540 * 60_000; // 09:00:00
                             // 4 calls, each 12s of execution, all between 09:00:00 and 09:00:52 (one minute).
    let mut events = vec![ev(
        at_ms(monday, base),
        "sess1234abcd",
        "/repo/proj-a",
        "UserPromptSubmit",
    )];
    for i in 0..4 {
        let pre = base + i * 13_000;
        let post = pre + 12_000;
        let tuid = format!("u{i}");
        events.push(with_tool(
            ev(
                at_ms(monday, pre),
                "sess1234abcd",
                "/repo/proj-a",
                "PreToolUse",
            ),
            "Bash",
            &tuid,
        ));
        events.push(with_tool(
            ev(
                at_ms(monday, post),
                "sess1234abcd",
                "/repo/proj-a",
                "PostToolUse",
            ),
            "Bash",
            &tuid,
        ));
    }
    events.push(ev(
        at_ms(monday, base + 55_000),
        "sess1234abcd",
        "/repo/proj-a",
        "Stop",
    ));

    let week = build_week(monday, &events, &no_names()).unwrap();
    let mon_cell = &week.projects[0].rollup[0];
    // 4 × 12s = 48s of ai-doing → round-half-up = 1 min. Buggy floor → 0.
    assert!(
        mon_cell.ai_doing >= 1,
        "within-one-minute tool execution must still accrue ai-doing; got ai_doing={} \
         (Monday cell: {mon_cell:?})",
        mon_cell.ai_doing
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
        dur_ms: 600_000,
        label: Some("Explore".to_string()),
    };
    let seg_val = serde_json::to_value(&seg).unwrap();
    let seg_obj = seg_val.as_object().unwrap();
    let mut seg_keys: Vec<&String> = seg_obj.keys().collect();
    seg_keys.sort();
    assert_eq!(
        seg_keys,
        vec![
            &"dur_ms".to_string(),
            &"end".to_string(),
            &"kind".to_string(),
            &"label".to_string(),
            &"start".to_string()
        ]
    );
    // kind serializes to the WP3 kebab tag, NOT the Rust variant name.
    assert_eq!(seg_obj["kind"], serde_json::json!("subagent"));
    // dur_ms is the true ms duration (snake_case wire key; FE mirror must match).
    assert_eq!(seg_obj["dur_ms"], serde_json::json!(600_000));

    // A non-subagent seg omits `label` entirely (skip_serializing_if) but always carries dur_ms.
    let ai = SegPayload {
        kind: crate::reclassify::Kind::AiDoing,
        start: 0,
        end: 5,
        dur_ms: 18_000,
        label: None,
    };
    let ai_obj = serde_json::to_value(&ai).unwrap();
    assert!(
        ai_obj.as_object().unwrap().get("label").is_none(),
        "label omitted when None"
    );
    assert_eq!(ai_obj["kind"], serde_json::json!("ai-doing"));
    assert_eq!(ai_obj["dur_ms"], serde_json::json!(18_000));

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

// ---- M9 WP6.5: session-termination model — the day-level defect repro --------

#[test]
fn dead_session_with_stray_late_event_does_not_stretch_to_the_day_edge() {
    // The operator's exact defect (SURFACE-2026-07-08): a session's real work ended
    // shortly after it began, but a stray late event (a lone idle Notification) landed
    // hours later, making the row render as if the session ran all day. With the WP6.5
    // read-time cap, build_day must bound the session at its last REAL event, dropping the
    // stray — the row no longer stretches to the stray's minute.
    let d = day(2026, 5, 13);
    // Real activity 10:54 (654') -> a short burst -> ends ~11:00 (660').
    let real_end_min = 660;
    // A lone stray event at 13:42 (822') — 2h42m after real activity, far > the 30-min cap.
    let stray_min = 822;
    let events = [
        ev(
            at_minute(d, 654),
            "deadsessabcd",
            "/repo/proj-x",
            "UserPromptSubmit",
        ),
        with_tool(
            ev(
                at_minute(d, 655),
                "deadsessabcd",
                "/repo/proj-x",
                "PreToolUse",
            ),
            "Edit",
            "t1",
        ),
        with_tool(
            ev(
                at_minute(d, 656),
                "deadsessabcd",
                "/repo/proj-x",
                "PostToolUse",
            ),
            "Edit",
            "t1",
        ),
        ev(
            at_minute(d, real_end_min),
            "deadsessabcd",
            "/repo/proj-x",
            "Stop",
        ),
        // The stray — a delayed idle Notification long after the session died.
        ev(
            at_minute(d, stray_min),
            "deadsessabcd",
            "/repo/proj-x",
            "Notification",
        ),
    ];
    let payload = build_day(d, &events, &no_names());
    let sess = &payload.projects[0].sessions[0];
    assert_eq!(sess.start, 654, "session starts at the first real event");
    assert_eq!(
        sess.end, real_end_min,
        "session ends at its last real event, NOT the 13:42 stray (was the bug)"
    );
    assert!(
        sess.end < stray_min,
        "the dead session no longer reaches the stray event's minute"
    );
    // The last tiled segment must also stop at the real end (no giant trailing away seg
    // stretching to 13:42).
    assert_eq!(
        sess.segs.last().unwrap().end,
        real_end_min,
        "no phantom trailing segment past the real end"
    );
}

#[test]
fn session_end_hook_bounds_the_session_at_its_true_end_dropping_a_later_stray() {
    // M9 WP6.5 Phase 2 — replay the research-captured clean stream
    // (SessionStart → UPS → Stop → SessionEnd) PLUS a later stray Notification. The
    // built session must end at the SessionEnd minute, NOT the Stop minute nor the stray.
    let d = day(2026, 5, 13);
    let events = [
        ev(
            at_minute(d, 600),
            "endsessabcd",
            "/repo/proj-z",
            "SessionStart",
        ),
        ev(
            at_minute(d, 601),
            "endsessabcd",
            "/repo/proj-z",
            "UserPromptSubmit",
        ),
        ev(at_minute(d, 604), "endsessabcd", "/repo/proj-z", "Stop"),
        // SessionEnd fires 2 min after Stop (clean /exit) — the authoritative end.
        ev(
            at_minute(d, 606),
            "endsessabcd",
            "/repo/proj-z",
            "SessionEnd",
        ),
        // A stray idle Notification 50 min later — must be dropped, not extend the row.
        ev(
            at_minute(d, 656),
            "endsessabcd",
            "/repo/proj-z",
            "Notification",
        ),
    ];
    let payload = build_day(d, &events, &no_names());
    let sess = &payload.projects[0].sessions[0];
    assert_eq!(sess.start, 600, "starts at SessionStart");
    assert_eq!(
        sess.end, 606,
        "ends at the authoritative SessionEnd, not the Stop (604) or the stray (656)"
    );
    assert!(
        sess.end < 656,
        "the later stray does not extend the session"
    );
    assert_eq!(
        sess.segs.last().unwrap().end,
        606,
        "no phantom trailing seg past SessionEnd"
    );
}

#[test]
fn explicit_workspace_close_marker_bounds_the_session_over_a_later_session_end() {
    // D3 precedence at the day level: an explicit WorkspaceClose (native) wins over a CC
    // SessionEnd. Marker@605 (native), SessionEnd@607 (cc-hook) → session ends at 605.
    let d = day(2026, 5, 13);
    let mut close = ev(
        at_minute(d, 605),
        "wscloseabcd",
        "/repo/proj-z",
        "WorkspaceClose",
    );
    close.source = "claudesk-native".to_string();
    let events = [
        ev(
            at_minute(d, 600),
            "wscloseabcd",
            "/repo/proj-z",
            "UserPromptSubmit",
        ),
        ev(at_minute(d, 604), "wscloseabcd", "/repo/proj-z", "Stop"),
        close,
        ev(
            at_minute(d, 607),
            "wscloseabcd",
            "/repo/proj-z",
            "SessionEnd",
        ),
    ];
    let payload = build_day(d, &events, &no_names());
    let sess = &payload.projects[0].sessions[0];
    assert_eq!(
        sess.end, 605,
        "the explicit WorkspaceClose marker (signal 1) wins over the SessionEnd (signal 3)"
    );
}

#[test]
fn live_idle_session_under_cap_is_not_truncated() {
    // AC3 at the day level: a session with a genuine 25-min think/lunch gap (< 30-min cap)
    // between two real bursts stays ONE session spanning both — not cut at the gap.
    let d = day(2026, 5, 13);
    let events = [
        ev(
            at_minute(d, 600),
            "livesessabcd",
            "/repo/proj-y",
            "UserPromptSubmit",
        ),
        ev(at_minute(d, 605), "livesessabcd", "/repo/proj-y", "Stop"),
        // 25-min idle gap (605 -> 630), under the 30-min cap.
        ev(
            at_minute(d, 630),
            "livesessabcd",
            "/repo/proj-y",
            "UserPromptSubmit",
        ),
        ev(at_minute(d, 640), "livesessabcd", "/repo/proj-y", "Stop"),
    ];
    let payload = build_day(d, &events, &no_names());
    let sess = &payload.projects[0].sessions[0];
    assert_eq!(sess.start, 600);
    assert_eq!(
        sess.end, 640,
        "a sub-cap idle gap must not terminate the session (AC3)"
    );
    assert_eq!(sess.prompts, 2, "both bursts' prompts counted");
}

// ---- M9 WP6.5 Phase 4: end-to-end four-signal composition through build_day ----

#[test]
fn end_to_end_all_four_termination_signals_compose_in_one_day() {
    // One day, four sessions — each terminated by a DIFFERENT signal — all resolve to the
    // correct end through the real build_day path. Sessions are placed in distinct cwds so
    // each becomes its own project row (deterministic lookup).
    let d = day(2026, 5, 13);
    // A native WorkspaceClose marker at minute `m` for session `sid`/`cwd`.
    let ws_close = |m: i64, sid: &str, cwd: &str| {
        let mut r = ev(at_minute(d, m), sid, cwd, "WorkspaceClose");
        r.source = "claudesk-native".to_string();
        r
    };
    let events: Vec<EventRow> = vec![
        // (A) SIGNAL 3 — CC SessionEnd: burst 600–604, SessionEnd@606, stray Notif@700.
        //     → ends at 606 (SessionEnd wins; stray dropped).
        ev(at_minute(d, 600), "sess-A", "/repo/a", "UserPromptSubmit"),
        ev(at_minute(d, 604), "sess-A", "/repo/a", "Stop"),
        ev(at_minute(d, 606), "sess-A", "/repo/a", "SessionEnd"),
        ev(at_minute(d, 700), "sess-A", "/repo/a", "Notification"),
        // (B) SIGNAL 1 — explicit WorkspaceClose@607. → ends at 607.
        ev(at_minute(d, 600), "sess-B", "/repo/b", "UserPromptSubmit"),
        ev(at_minute(d, 605), "sess-B", "/repo/b", "Stop"),
        ws_close(607, "sess-B", "/repo/b"),
        // (C) SIGNAL 2 — max-idle cap (no marker): burst 600–606, stray@700 (>30min idle).
        //     → capped at 606 (last real event before the oversized idle gap).
        ev(at_minute(d, 600), "sess-C", "/repo/c", "UserPromptSubmit"),
        ev(at_minute(d, 606), "sess-C", "/repo/c", "Stop"),
        ev(at_minute(d, 700), "sess-C", "/repo/c", "Notification"),
        // (D) SIGNAL 4 — a reconciled dangling session: WorkspaceClose written AT its
        //     last-seen ts (610). From the query layer this is identical to signal 1 —
        //     ends at 610. Proves the reconciliation WRITE + read path compose.
        ev(at_minute(d, 600), "sess-D", "/repo/d", "UserPromptSubmit"),
        ev(at_minute(d, 610), "sess-D", "/repo/d", "Stop"),
        ws_close(610, "sess-D", "/repo/d"),
    ];

    let payload = build_day(d, &events, &no_names());
    // Collect each session's resolved end by its project cwd tail.
    let mut ends: HashMap<String, i64> = HashMap::new();
    for p in &payload.projects {
        for s in &p.sessions {
            ends.insert(s.id.clone(), s.end);
        }
    }
    // session ids are truncated to first 8 chars ("sess-A" etc. are <8, so unchanged).
    assert_eq!(
        ends.get("sess-A"),
        Some(&606),
        "SessionEnd honored (not the 700 stray)"
    );
    assert_eq!(
        ends.get("sess-B"),
        Some(&607),
        "explicit WorkspaceClose honored"
    );
    assert_eq!(
        ends.get("sess-C"),
        Some(&606),
        "max-idle cap bounds the dead session"
    );
    assert_eq!(ends.get("sess-D"), Some(&610), "reconciled marker honored");
    // And none stretched to the 700 stray.
    for (id, end) in &ends {
        assert!(
            *end <= 610,
            "session {id} must not stretch to the stray (end={end})"
        );
    }
}

// ===========================================================================
// M9 WP6c-1 — build_metrics oracle + regression tests.
//
// The window-level aggregate metrics, re-derived onto WP3's 6-kind model. These pin the
// four load-bearing WP6c-1 findings: (a) ms-precision tool-effort (NO minute-quant);
// (b) WP6.5 session-cap of a dangling burst; (c) the family mapping (human = typing +
// reviewing; blocking.human_blocking_agent = reviewing only); (d) snake_case wire shape.
// ===========================================================================

/// Build a UserPromptSubmit → (tool pairs) → Stop burst for one session, returning the
/// events. Tool pairs are placed at sub-minute spacing (real CC tool calls are ~ms apart).
fn burst_with_tools(
    sid: &str,
    cwd: &str,
    ups_ms: i64,
    stop_ms: i64,
    tool_pairs: &[(&str, i64, i64)], // (tool, pre_ms, post_ms)
) -> Vec<EventRow> {
    let mut out = vec![ev(ups_ms, sid, cwd, "UserPromptSubmit")];
    for (i, (tool, pre, post)) in tool_pairs.iter().enumerate() {
        let tuid = format!("{sid}-t{i}");
        out.push(with_tool(ev(*pre, sid, cwd, "PreToolUse"), tool, &tuid));
        out.push(with_tool(ev(*post, sid, cwd, "PostToolUse"), tool, &tuid));
    }
    out.push(ev(stop_ms, sid, cwd, "Stop"));
    out
}

#[test]
fn build_metrics_tool_effort_sums_at_ms_precision_not_floored() {
    // OUTCOME (a): N sub-minute Pre→Post tool pairs must accrue their REAL ms to
    // tool_call.effort_ms — NOT floor to 0 (the SURFACE-2026-07-13 minute-quantization
    // anti-pattern). Three tool calls, each ~50ms, inside one burst.
    let d = day(2026, 5, 13);
    let ups = at_minute(d, 600); // 10:00
                                 // Three sub-minute tool pairs (53ms, 49ms, 41ms) — real-data-shaped.
    let pairs = [
        (
            "Edit",
            at_ms(d, 600 * 60_000 + 1_000),
            at_ms(d, 600 * 60_000 + 1_053),
        ),
        (
            "Bash",
            at_ms(d, 600 * 60_000 + 2_000),
            at_ms(d, 600 * 60_000 + 2_049),
        ),
        (
            "Bash",
            at_ms(d, 600 * 60_000 + 3_000),
            at_ms(d, 600 * 60_000 + 3_041),
        ),
    ];
    let stop = at_minute(d, 605);
    let events = burst_with_tools("sess-A", "/p", ups, stop, &pairs);

    let m = build_metrics(d, d, &events);

    // The three intervals sum to 53+49+41 = 143 ms. If each were floored to whole minutes
    // first, they'd all be 0 → effort 0 (the bug). At ms precision the total is 143.
    assert_eq!(
        m.tool_call.effort_ms, 143,
        "sub-minute tool effort must sum at ms precision (got {}), not floor to 0",
        m.tool_call.effort_ms
    );
    assert!(
        m.tool_call.wallclock_ms >= 143,
        "wallclock (merged) at least the summed span"
    );
    // Top tools: Bash (49+41=90) ranks above Edit (53) by effort.
    assert_eq!(m.tool_call.top.len(), 2, "two distinct tool names");
    assert_eq!(m.tool_call.top[0].name, "Bash");
    assert_eq!(m.tool_call.top[0].effort_ms, 90);
    assert_eq!(m.tool_call.top[1].name, "Edit");
}

#[test]
fn build_metrics_engaged_is_capped_at_resolved_session_end_not_stretched() {
    // OUTCOME (b): a dangling burst (UPS→Stop) followed by a >30min idle gap and a stray
    // late event must be CAPPED at the Stop (the WP6.5 max-idle cap), NOT stretched to the
    // stray — otherwise the 885-min-dangling-burst inflation the research found recurs.
    let d = day(2026, 5, 13);
    let ups = at_minute(d, 600); // 10:00
    let stop = at_minute(d, 610); // 10:10 → a real 10-minute engaged burst
    let mut events = burst_with_tools("sess-A", "/p", ups, stop, &[]);
    // A stray event 40 minutes later (past the 30-min idle cap) — the "dead session".
    events.push(ev(at_minute(d, 650), "sess-A", "/p", "PostToolUse"));

    let m = build_metrics(d, d, &events);

    // Engaged effort = the burst only (10 min = 600_000 ms). If the cap were ignored, the
    // burst/engaged would balloon toward the stray at minute 650.
    assert_eq!(
        m.engaged_session.effort_ms, 600_000,
        "engaged must be the 10-min burst, capped at Stop (got {} ms)",
        m.engaged_session.effort_ms
    );
    assert_eq!(m.engaged_session.session_count, 1);
}

#[test]
fn build_metrics_human_is_typing_plus_reviewing_blocking_is_reviewing_only() {
    // OUTCOME (c): the family re-derivation. human.wallclock = typing + reviewing (NOT
    // away, NOT ai-reasoning); blocking.human_blocking_agent = reviewing only.
    // Construct a session with a burst then a human gap that classifies as reviewing.
    let d = day(2026, 5, 13);
    // Burst 1: 10:00 → 10:05 (a real engaged span).
    let mut events = burst_with_tools(
        "sess-A",
        "/p",
        at_minute(d, 600),
        at_minute(d, 605),
        &[(
            "Edit",
            at_ms(d, 600 * 60_000 + 1_000),
            at_ms(d, 600 * 60_000 + 1_050),
        )],
    );
    // A second burst at 10:15 → 10:16; the 10:05→10:15 gap is human time between bursts.
    events.extend(burst_with_tools(
        "sess-A",
        "/p",
        at_minute(d, 615),
        at_minute(d, 616),
        &[],
    ));

    let m = build_metrics(d, d, &events);

    // Human wallclock is exactly typing + reviewing (identity by construction).
    assert_eq!(
        m.human.wallclock_ms,
        m.human.typing_ms + m.human.reviewing_ms,
        "human.wallclock = typing + reviewing (away + ai-reasoning excluded)"
    );
    assert_eq!(
        m.human.effort_ms, m.human.wallclock_ms,
        "one brain → effort == wallclock"
    );
    assert!(
        (m.human.multiplier - 1.0).abs() < 1e-9,
        "human multiplier is 1.0"
    );
    // Blocking: human_blocking_agent is reviewing only (NOT + ai-reasoning/away).
    assert_eq!(
        m.blocking.human_blocking_agent_ms, m.human.reviewing_ms,
        "human_blocking_agent = reviewing only (WP3 re-derivation)"
    );
    // agent_blocking_human == ai_agent.wallclock (the identity claude-time's JSX asserts).
    assert_eq!(m.blocking.agent_blocking_human_ms, m.ai_agent.wallclock_ms);
}

#[test]
fn build_metrics_subagent_is_a_subset_of_ai_agent() {
    // ai_agent folds in ai-reasoning + subagent; subagent is broken out as a subset, so
    // subagent effort/wallclock <= ai_agent's.
    let d = day(2026, 5, 13);
    let mut events = burst_with_tools("sess-A", "/p", at_minute(d, 600), at_minute(d, 610), &[]);
    // A subagent Start→Stop inside the burst.
    events.push(with_agent(
        ev(at_minute(d, 602), "sess-A", "/p", "SubagentStart"),
        "explorer",
    ));
    events.push(with_agent(
        ev(at_minute(d, 604), "sess-A", "/p", "SubagentStop"),
        "explorer",
    ));

    let m = build_metrics(d, d, &events);
    assert!(m.ai_agent.wallclock_ms > 0);
    assert_eq!(
        m.ai_agent.subagent.wallclock_ms,
        2 * 60_000,
        "2-min subagent span"
    );
    assert!(
        m.ai_agent.subagent.wallclock_ms <= m.ai_agent.wallclock_ms,
        "subagent is a subset of ai_agent"
    );
}

#[test]
fn build_metrics_empty_window_is_fully_shaped_zeros() {
    let d = day(2026, 5, 13);
    let m = build_metrics(d, d, &[]);
    assert_eq!(m.window.day_count, 1);
    assert_eq!(m.engaged_session.effort_ms, 0);
    assert_eq!(m.engaged_session.multiplier, 0.0);
    assert_eq!(m.ai_agent.effort_ms, 0);
    assert_eq!(m.tool_call.top.len(), 0);
    assert_eq!(m.human.wallclock_ms, 0);
    assert_eq!(m.concurrency.len(), 4, "always 4 strata");
    assert_eq!(m.concurrency[3].k, 4);
    assert!(m.concurrency[3].is_plus);
    assert_eq!(m.blocking.human_blocking_agent_ms, 0);
}

#[test]
fn build_metrics_concurrency_two_overlapping_sessions_lands_in_k2() {
    // Two sessions engaged over the SAME 10:00→10:10 span → that elapsed time is k=2.
    let d = day(2026, 5, 13);
    let mut events = burst_with_tools("sess-A", "/pa", at_minute(d, 600), at_minute(d, 610), &[]);
    events.extend(burst_with_tools(
        "sess-B",
        "/pb",
        at_minute(d, 600),
        at_minute(d, 610),
        &[],
    ));
    let m = build_metrics(d, d, &events);
    let k2 = &m.concurrency[1];
    assert_eq!(k2.k, 2);
    assert_eq!(k2.wallclock_ms, 10 * 60_000, "10 min at concurrency 2");
    assert_eq!(k2.effort_ms, 10 * 60_000 * 2, "effort = wallclock * k");
    // No k=1 time (fully overlapping).
    assert_eq!(m.concurrency[0].wallclock_ms, 0);

    // Parallelism compression: two fully-overlapping 10-min sessions → effort 20 min,
    // wallclock (merged/union) 10 min → multiplier 2.0. This is the core "running N
    // projects in parallel compresses effort into less elapsed time" metric — it breaks
    // silently if build_metrics merged effort or summed wallclock. (WP6c-1 codify pin.)
    assert_eq!(
        m.engaged_session.effort_ms,
        20 * 60_000,
        "effort = both sessions summed"
    );
    assert_eq!(
        m.engaged_session.wallclock_ms,
        10 * 60_000,
        "wallclock = merged union"
    );
    assert!(
        (m.engaged_session.multiplier - 2.0).abs() < 1e-9,
        "parallelism multiplier is 2.0 (got {})",
        m.engaged_session.multiplier
    );
    assert_eq!(m.engaged_session.session_count, 2);
}

#[test]
fn metrics_dto_serde_shape_is_snake_case() {
    // OUTCOME (d): pin the wire keys — snake_case end-to-end, matching the FE TS types.
    let d = day(2026, 5, 13);
    let events = burst_with_tools(
        "sess-A",
        "/p",
        at_minute(d, 600),
        at_minute(d, 610),
        &[(
            "Edit",
            at_ms(d, 600 * 60_000 + 1_000),
            at_ms(d, 600 * 60_000 + 1_050),
        )],
    );
    let m = build_metrics(d, d, &events);
    let json = serde_json::to_string(&m).unwrap();
    for key in [
        "\"window\"",
        "\"start\"",
        "\"end\"",
        "\"day_count\"",
        "\"engaged_session\"",
        "\"wallclock_ms\"",
        "\"effort_ms\"",
        "\"multiplier\"",
        "\"session_count\"",
        "\"ai_agent\"",
        "\"subagent\"",
        "\"tool_call\"",
        "\"top\"",
        "\"name\"",
        "\"human\"",
        "\"typing_ms\"",
        "\"reviewing_ms\"",
        "\"away_ms\"",
        "\"concurrency\"",
        "\"k\"",
        "\"blocking\"",
        "\"human_blocking_agent_ms\"",
        "\"agent_blocking_human_ms\"",
    ] {
        assert!(
            json.contains(key),
            "metrics JSON must contain snake_case key {key}; got {json}"
        );
    }
    // is_plus only appears on the k=4 stratum.
    assert!(
        json.contains("\"is_plus\":true"),
        "k=4 stratum carries is_plus"
    );
}

#[test]
fn time_analytics_result_metrics_tag_serializes() {
    // The command result enum tags the metrics variant as {"kind":"metrics", ...}.
    use crate::time_store::commands::TimeAnalyticsResult;
    let d = day(2026, 5, 13);
    let m = build_metrics(d, d, &[]);
    let json = serde_json::to_string(&TimeAnalyticsResult::Metrics(m)).unwrap();
    assert!(
        json.contains("\"kind\":\"metrics\""),
        "result tagged metrics; got {json}"
    );
}

// ===========================================================================
// M9 WP6c-2 — build_comparison_data + preset day-math oracle tests.
//
// The A/B comparison producer. These pin: (D4) the three presets' inclusive day-bounds
// for a fixed anchor (DB-independent pure date math); (D3) the DTO shape has NO `deltas`
// key and each side's `metrics == build_metrics` over that side's days; the union-span
// event partition per side; the `compare` result tag; and the empty-side shape.
// ===========================================================================

#[test]
fn compare_week_over_week_bounds_are_prior_and_current_7_days() {
    // D4: anchor = Monday 2026-05-11. A = prior week [05-04, 05-10]; B = this week
    // [05-11, 05-17]. Both exactly 7 days, contiguous, no overlap.
    let this_monday = day(2026, 5, 11);
    let (a_start, a_end, b_start, b_end) = compare_week_over_week_bounds(this_monday);
    assert_eq!(a_start, day(2026, 5, 4));
    assert_eq!(a_end, day(2026, 5, 10));
    assert_eq!(b_start, day(2026, 5, 11));
    assert_eq!(b_end, day(2026, 5, 17));
    assert_eq!((a_end - a_start).num_days() + 1, 7);
    assert_eq!((b_end - b_start).num_days() + 1, 7);
    // Contiguous: A ends the day before B starts.
    assert_eq!(a_end + chrono::Duration::days(1), b_start);
}

#[test]
fn compare_month_over_month_bounds_span_full_calendar_months() {
    // D4: anchor anywhere in March 2026 → A = full Feb (28d, 2026 not leap), B = full March
    // (31d). Full-month spans regardless of the anchor day-of-month.
    let (a_start, a_end, b_start, b_end) = compare_month_over_month_bounds(day(2026, 3, 15));
    assert_eq!(a_start, day(2026, 2, 1));
    assert_eq!(
        a_end,
        day(2026, 2, 28),
        "2026 is not a leap year → Feb has 28 days"
    );
    assert_eq!(b_start, day(2026, 3, 1));
    assert_eq!(b_end, day(2026, 3, 31));
}

#[test]
fn compare_month_over_month_bounds_handle_january_rollover_and_leap() {
    // January anchor → prior month is Dec of the PRIOR year. And a leap-Feb (2024) gets 29.
    let (a_start, a_end, b_start, b_end) = compare_month_over_month_bounds(day(2026, 1, 1));
    assert_eq!(a_start, day(2025, 12, 1));
    assert_eq!(a_end, day(2025, 12, 31));
    assert_eq!(b_start, day(2026, 1, 1));
    assert_eq!(b_end, day(2026, 1, 31));
    // Leap-year Feb.
    let (_, feb_end, _, _) = compare_month_over_month_bounds(day(2024, 3, 10));
    assert_eq!(
        feb_end,
        day(2024, 2, 29),
        "2024 is a leap year → Feb has 29 days"
    );
}

#[test]
fn compare_day_vs_trailing_bounds_are_baseline_then_single_day() {
    // D4: target = 2026-05-13 → A = 7-day baseline [05-06, 05-12]; B = single day
    // [05-13, 05-13]. B is 1 day; A is `window_days` days ending the day before target.
    let target = day(2026, 5, 13);
    let (a_start, a_end, b_start, b_end) = compare_day_vs_trailing_bounds(target, 7);
    assert_eq!(a_start, day(2026, 5, 6));
    assert_eq!(a_end, day(2026, 5, 12));
    assert_eq!(b_start, target);
    assert_eq!(b_end, target);
    assert_eq!((a_end - a_start).num_days() + 1, 7);
    assert_eq!((b_end - b_start).num_days() + 1, 1);
    // window_days is floored at 1 (a <1 request doesn't produce an inverted range).
    let (z_start, z_end, _, _) = compare_day_vs_trailing_bounds(target, 0);
    assert_eq!(z_start, day(2026, 5, 12));
    assert_eq!(z_end, day(2026, 5, 12));
}

#[test]
fn build_comparison_each_side_equals_build_metrics_over_its_days() {
    // D3 identity: build_comparison_data partitions the union rows per side by local day,
    // then runs build_metrics per side. So each side's `metrics` MUST equal a direct
    // build_metrics over that side's own day-partitioned events.
    let a_day = day(2026, 5, 4);
    let b_day = day(2026, 5, 11);
    // A-window burst on a_day; B-window burst on b_day. Union rows = both.
    let a_events = burst_with_tools(
        "sess-A",
        "/pa",
        at_minute(a_day, 600),
        at_minute(a_day, 620),
        &[(
            "Edit",
            at_ms(a_day, 600 * 60_000 + 1_000),
            at_ms(a_day, 600 * 60_000 + 1_500),
        )],
    );
    let b_events = burst_with_tools(
        "sess-B",
        "/pb",
        at_minute(b_day, 540),
        at_minute(b_day, 570),
        &[(
            "Bash",
            at_ms(b_day, 540 * 60_000 + 1_000),
            at_ms(b_day, 540 * 60_000 + 3_000),
        )],
    );
    let mut union: Vec<EventRow> = a_events.clone();
    union.extend(b_events.clone());

    let cmp = build_comparison_data(a_day, a_day, b_day, b_day, &union);

    // Each side's metrics equals build_metrics over ONLY that side's events (partition
    // isolation — the A-side must not see the B-day burst and vice-versa).
    assert_eq!(cmp.a.metrics, build_metrics(a_day, a_day, &a_events));
    assert_eq!(cmp.b.metrics, build_metrics(b_day, b_day, &b_events));
    // Range labels + meta reflect the bounds.
    assert_eq!(cmp.a.range.start, "2026-05-04");
    assert_eq!(cmp.b.range.start, "2026-05-11");
    assert_eq!(cmp.meta.a_start, "2026-05-04");
    assert_eq!(cmp.meta.a_end, "2026-05-04");
    assert_eq!(cmp.meta.b_start, "2026-05-11");
    assert_eq!(cmp.meta.a_day_count, 1);
    assert_eq!(cmp.meta.b_day_count, 1);
    // The A-side effort is Edit's 500ms; the B-side is Bash's 2000ms — proving the
    // partition (a cross-leak would inflate one side).
    assert_eq!(cmp.a.metrics.tool_call.effort_ms, 500);
    assert_eq!(cmp.b.metrics.tool_call.effort_ms, 2000);
}

#[test]
fn build_comparison_empty_side_is_fully_shaped_zeros() {
    // A side with no events in its window → a fully-shaped zeros MetricsPayload (no panic,
    // no NaN). B side has real activity. Mirrors build_metrics's empty-window guarantee.
    let a_day = day(2026, 5, 4);
    let b_day = day(2026, 5, 11);
    let b_events = burst_with_tools(
        "sess-B",
        "/pb",
        at_minute(b_day, 540),
        at_minute(b_day, 570),
        &[],
    );

    let cmp = build_comparison_data(a_day, a_day, b_day, b_day, &b_events);

    assert_eq!(cmp.a.metrics.engaged_session.session_count, 0);
    assert_eq!(cmp.a.metrics.ai_agent.effort_ms, 0);
    assert_eq!(cmp.a.metrics.human.wallclock_ms, 0);
    assert!(
        cmp.a.metrics.engaged_session.multiplier.is_finite(),
        "multiplier is 0.0, not NaN"
    );
    assert!(
        cmp.b.metrics.engaged_session.session_count >= 1,
        "B side has the real burst"
    );
}

#[test]
fn build_comparison_overlapping_custom_windows_count_shared_days_on_both_sides() {
    // Codify the OVERLAP semantic (custom A/B can overlap — a legitimate user action the 3
    // presets never produce). `events_in_days` uses INCLUSIVE [start,end] on each side
    // independently, so an event on a day inside BOTH windows is counted on BOTH sides —
    // each side is the independent what-if for its own range. Guards against a future
    // "optimization" that partitions events exclusively and silently drops the overlap day.
    // A = [05-04, 05-06]; B = [05-05, 05-07]  → the shared day 05-05 belongs to both.
    let a_start = day(2026, 5, 4);
    let a_end = day(2026, 5, 6);
    let b_start = day(2026, 5, 5);
    let b_end = day(2026, 5, 7);
    // One burst on the shared day 05-05 (a 30-min engaged session).
    let shared_day = day(2026, 5, 5);
    let events = burst_with_tools(
        "sess-S",
        "/ps",
        at_minute(shared_day, 540),
        at_minute(shared_day, 570),
        &[],
    );

    let cmp = build_comparison_data(a_start, a_end, b_start, b_end, &events);

    // The shared-day burst appears on BOTH sides (inclusive overlap, not exclusive).
    assert_eq!(
        cmp.a.metrics.engaged_session.session_count, 1,
        "A window [05-04,05-06] includes the shared day 05-05 → 1 engaged session"
    );
    assert_eq!(
        cmp.b.metrics.engaged_session.session_count, 1,
        "B window [05-05,05-07] also includes 05-05 → 1 engaged session (double-counted by design)"
    );
    // Each side equals build_metrics over its own inclusive window (the overlap is not a
    // special case — it falls out of the independent per-side partition).
    assert_eq!(cmp.a.metrics, build_metrics(a_start, a_end, &events));
    assert_eq!(cmp.b.metrics, build_metrics(b_start, b_end, &events));
    assert_eq!(cmp.meta.a_day_count, 3);
    assert_eq!(cmp.meta.b_day_count, 3);
}

#[test]
fn comparison_dto_serde_shape_has_no_deltas() {
    // D3: the wire shape is {a:{metrics,range}, b:{metrics,range}, meta:{…}} — snake_case,
    // and there is NO `deltas` key (CompareView recomputes deltas FE-side).
    let a_day = day(2026, 5, 4);
    let b_day = day(2026, 5, 11);
    let cmp = build_comparison_data(a_day, a_day, b_day, b_day, &[]);
    let json = serde_json::to_string(&cmp).unwrap();
    for key in [
        "\"a\"",
        "\"b\"",
        "\"metrics\"",
        "\"range\"",
        "\"meta\"",
        "\"a_start\"",
        "\"a_end\"",
        "\"b_start\"",
        "\"b_end\"",
        "\"a_day_count\"",
        "\"b_day_count\"",
    ] {
        assert!(
            json.contains(key),
            "comparison JSON must contain key {key}; got {json}"
        );
    }
    assert!(
        !json.contains("\"deltas\""),
        "comparison JSON must NOT contain a `deltas` key (CompareView recomputes FE-side); got {json}"
    );
}

#[test]
fn time_analytics_result_compare_tag_serializes() {
    // The command result enum tags the compare variant as {"kind":"compare", ...}.
    use crate::time_store::commands::TimeAnalyticsResult;
    let a_day = day(2026, 5, 4);
    let b_day = day(2026, 5, 11);
    let cmp = build_comparison_data(a_day, a_day, b_day, b_day, &[]);
    let json = serde_json::to_string(&TimeAnalyticsResult::Compare(Box::new(cmp))).unwrap();
    assert!(
        json.contains("\"kind\":\"compare\""),
        "result tagged compare; got {json}"
    );
}
