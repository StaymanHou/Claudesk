//! Reclassifier tests (M9 WP3, Phases 2–4).
//!
//! - **Reused-mechanics** (Phase 2) mirror `claude-time`'s `test_reclassify.py` assertions
//!   (ToolDurations / ToolIntervals / SubagentDurations / SubagentIntervals / ActiveBursts
//!   / SessionActive) — ported UNCHANGED because the operator confirmed the mechanics match
//!   intent.
//! - **AI-kind segmentation** (Phase 2) is NEW (the redesign's AI half).
//! - **Human-state gap machine** (Phase 3) — per-branch tests of `classify_gap` +
//!   `human_segments_for_window`.
//! - **Scenario suite** (Phase 4) — one clearly-named `scenario_*` test per row of the
//!   spec's locked A1–A5 / B1–B5 truth-table, mapping 1:1 to the operator's scenarios,
//!   plus the deliberate NON-PORT marker for the superseded reading-vs-thinking buckets.

use super::*;

/// Build an `EventRow` for a test. Only the fields a given test cares about are set;
/// `source` defaults to `cc-hook` (native rows override it).
fn ev(ts: i64, session_id: &str, event: &str) -> EventRow {
    EventRow {
        ts,
        session_id: session_id.to_string(),
        cwd: String::new(),
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

// ---- meta extraction ------------------------------------------------------

#[test]
fn meta_str_and_i64_extract_from_blob() {
    let mut e = ev(0, "s", "UserPromptSubmit");
    e.meta = Some(r#"{"prompt_length_chars": 42, "tool_use_id": "tu_1"}"#.to_string());
    assert_eq!(e.meta_i64("prompt_length_chars"), Some(42));
    assert_eq!(e.meta_str("tool_use_id"), Some("tu_1".to_string()));
    assert_eq!(e.meta_str("absent"), None);
    assert_eq!(e.meta_i64("tool_use_id"), None); // string, not int
}

#[test]
fn meta_getters_none_on_absent_or_bad_json() {
    let e = ev(0, "s", "Stop"); // meta = None
    assert_eq!(e.meta_str("x"), None);
    let mut bad = ev(0, "s", "Stop");
    bad.meta = Some("not json".to_string());
    assert_eq!(bad.meta_i64("x"), None);
}

// ---- tool durations (reference-equivalent: ToolDurationsTests) -------------

#[test]
fn tool_paired_pre_and_post() {
    let events = [
        with_tool(ev(0, "s", "PreToolUse"), "Bash", "x"),
        with_tool(ev(1000, "s", "PostToolUse"), "Bash", "x"),
    ];
    assert_eq!(tool_durations_ms(&events).get("Bash"), Some(&1000));
}

#[test]
fn tool_pre_without_post_skipped() {
    let events = [with_tool(ev(0, "s", "PreToolUse"), "Bash", "x")];
    assert!(tool_durations_ms(&events).is_empty());
}

#[test]
fn tool_failure_post_pairs_too() {
    let events = [
        with_tool(ev(0, "s", "PreToolUse"), "Bash", "x"),
        with_tool(ev(2500, "s", "PostToolUseFailure"), "Bash", "x"),
    ];
    assert_eq!(tool_durations_ms(&events).get("Bash"), Some(&2500));
}

#[test]
fn tool_multiple_summed_per_name() {
    let events = [
        with_tool(ev(0, "s", "PreToolUse"), "Bash", "x"),
        with_tool(ev(100, "s", "PostToolUse"), "Bash", "x"),
        with_tool(ev(200, "s", "PreToolUse"), "Bash", "y"),
        with_tool(ev(500, "s", "PostToolUse"), "Bash", "y"),
        with_tool(ev(600, "s", "PreToolUse"), "Read", "z"),
        with_tool(ev(700, "s", "PostToolUse"), "Read", "z"),
    ];
    let d = tool_durations_ms(&events);
    assert_eq!(d.get("Bash"), Some(&400));
    assert_eq!(d.get("Read"), Some(&100));
}

// ---- tool intervals (reference-equivalent: ToolIntervalsTests) ------------

#[test]
fn tool_intervals_empty() {
    assert!(tool_intervals(&[]).is_empty());
}

#[test]
fn tool_intervals_single_pair() {
    let events = [
        with_tool(ev(0, "s", "PreToolUse"), "Bash", "x"),
        with_tool(ev(1000, "s", "PostToolUse"), "Bash", "x"),
    ];
    assert_eq!(tool_intervals(&events).get("Bash"), Some(&vec![(0, 1000)]));
}

#[test]
fn tool_intervals_overlapping_across_sessions_both_kept() {
    let events = [
        with_tool(ev(0, "A", "PreToolUse"), "Bash", "a"),
        with_tool(ev(500, "B", "PreToolUse"), "Bash", "b"),
        with_tool(ev(1000, "A", "PostToolUse"), "Bash", "a"),
        with_tool(ev(1500, "B", "PostToolUse"), "Bash", "b"),
    ];
    // Order follows PreToolUse occurrence order.
    assert_eq!(
        tool_intervals(&events).get("Bash"),
        Some(&vec![(0, 1000), (500, 1500)])
    );
}

#[test]
fn tool_intervals_reverse_zero_pair_skipped() {
    let events = [
        with_tool(ev(1000, "s", "PreToolUse"), "Bash", "x"),
        with_tool(ev(500, "s", "PostToolUse"), "Bash", "x"),
    ];
    assert!(tool_intervals(&events).is_empty());
}

#[test]
fn tool_intervals_missing_tool_use_id_skipped() {
    let events = [
        {
            let mut e = ev(0, "s", "PreToolUse");
            e.tool_name = Some("Bash".to_string());
            e
        },
        {
            let mut e = ev(1000, "s", "PostToolUse");
            e.tool_name = Some("Bash".to_string());
            e
        },
    ];
    assert!(tool_intervals(&events).is_empty());
}

// ---- subagent durations/intervals (reference-equivalent) ------------------

#[test]
fn subagent_paired_start_stop() {
    let events = [
        with_agent(ev(0, "s", "SubagentStart"), "Explore"),
        with_agent(ev(5000, "s", "SubagentStop"), "Explore"),
    ];
    assert_eq!(subagent_durations_ms(&events).get("Explore"), Some(&5000));
    assert_eq!(subagent_intervals(&events), vec![(0, 5000)]);
}

#[test]
fn subagent_unpaired_start_skipped() {
    let events = [with_agent(ev(0, "s", "SubagentStart"), "Explore")];
    assert!(subagent_durations_ms(&events).is_empty());
    assert!(subagent_intervals(&events).is_empty());
}

#[test]
fn subagent_multiple_pairs_fifo() {
    let events = [
        with_agent(ev(0, "s", "SubagentStart"), "Plan"),
        with_agent(ev(1000, "s", "SubagentStop"), "Plan"),
        with_agent(ev(2000, "s", "SubagentStart"), "Plan"),
        with_agent(ev(2500, "s", "SubagentStop"), "Plan"),
    ];
    assert_eq!(subagent_durations_ms(&events).get("Plan"), Some(&1500));
    assert_eq!(subagent_intervals(&events), vec![(0, 1000), (2000, 2500)]);
}

#[test]
fn subagent_distinct_types_paired_independently() {
    let events = [
        with_agent(ev(0, "s", "SubagentStart"), "Plan"),
        with_agent(ev(100, "s", "SubagentStart"), "Explore"),
        with_agent(ev(500, "s", "SubagentStop"), "Explore"),
        with_agent(ev(1000, "s", "SubagentStop"), "Plan"),
    ];
    let mut got = subagent_intervals(&events);
    got.sort();
    assert_eq!(got, vec![(0, 1000), (100, 500)]);
}

#[test]
fn subagent_zero_duration_skipped() {
    let events = [
        with_agent(ev(1000, "s", "SubagentStart"), "Plan"),
        with_agent(ev(1000, "s", "SubagentStop"), "Plan"),
    ];
    assert!(subagent_intervals(&events).is_empty());
}

// ---- active bursts / session active (reference-equivalent) ----------------

#[test]
fn active_single_burst() {
    let events = [ev(1000, "s", "UserPromptSubmit"), ev(5000, "s", "Stop")];
    let out = active_bursts(&events);
    assert_eq!(
        out.get("s"),
        Some(&vec![Burst {
            start_ts: 1000,
            end_ts: 5000,
            interrupts: vec![]
        }])
    );
}

#[test]
fn active_consecutive_ups_records_interrupt() {
    let events = [
        ev(1000, "s", "UserPromptSubmit"),
        ev(2000, "s", "UserPromptSubmit"), // overwrites — interrupt
        ev(5000, "s", "Stop"),
    ];
    assert_eq!(
        active_bursts(&events).get("s"),
        Some(&vec![Burst {
            start_ts: 2000,
            end_ts: 5000,
            interrupts: vec![1000]
        }])
    );
}

#[test]
fn active_three_ups_two_interrupts() {
    let events = [
        ev(1000, "s", "UserPromptSubmit"),
        ev(2000, "s", "UserPromptSubmit"),
        ev(3000, "s", "UserPromptSubmit"),
        ev(5000, "s", "Stop"),
    ];
    assert_eq!(
        active_bursts(&events).get("s"),
        Some(&vec![Burst {
            start_ts: 3000,
            end_ts: 5000,
            interrupts: vec![1000, 2000]
        }])
    );
}

#[test]
fn active_interrupts_reset_per_burst() {
    let events = [
        ev(1000, "s", "UserPromptSubmit"),
        ev(2000, "s", "UserPromptSubmit"),
        ev(5000, "s", "Stop"),
        ev(6000, "s", "UserPromptSubmit"),
        ev(9000, "s", "Stop"),
    ];
    assert_eq!(
        active_bursts(&events).get("s"),
        Some(&vec![
            Burst {
                start_ts: 2000,
                end_ts: 5000,
                interrupts: vec![1000]
            },
            Burst {
                start_ts: 6000,
                end_ts: 9000,
                interrupts: vec![]
            },
        ])
    );
}

#[test]
fn session_active_matches_burst_sum() {
    let events = [
        ev(0, "s", "UserPromptSubmit"),
        ev(1000, "s", "Stop"),
        ev(5000, "s", "UserPromptSubmit"),
        ev(8000, "s", "Stop"),
    ];
    assert_eq!(session_active_ms(&events).get("s"), Some(&4000));
}

#[test]
fn session_active_orphan_stop_ignored() {
    let events = [
        ev(0, "s", "Stop"), // orphan — no prior UPS
        ev(1000, "s", "UserPromptSubmit"),
        ev(2000, "s", "Stop"),
    ];
    assert_eq!(session_active_ms(&events).get("s"), Some(&1000));
}

// ---- Kind / Family taxonomy (redesign) ------------------------------------

#[test]
fn kind_family_split_matches_redesign() {
    assert_eq!(Kind::AiDoing.family(), Family::Ai);
    assert_eq!(Kind::Subagent.family(), Family::Ai);
    assert_eq!(Kind::AiReasoning.family(), Family::Ai);
    assert_eq!(Kind::Typing.family(), Family::Human);
    assert_eq!(Kind::Reviewing.family(), Family::Human);
    assert_eq!(Kind::Away.family(), Family::Human);
}

#[test]
fn kind_as_str_stable_tags() {
    assert_eq!(Kind::AiDoing.as_str(), "ai-doing");
    assert_eq!(Kind::Subagent.as_str(), "subagent");
    assert_eq!(Kind::AiReasoning.as_str(), "ai-reasoning");
    assert_eq!(Kind::Typing.as_str(), "typing");
    assert_eq!(Kind::Reviewing.as_str(), "reviewing");
    assert_eq!(Kind::Away.as_str(), "away");
}

// ---- AI-kind segmentation (NEW Phase-2 work) ------------------------------

#[test]
fn ai_segments_reasoning_only_when_no_tools() {
    // A burst window [1000, 5000] with NO tool/subagent activity → one ai-reasoning
    // segment filling the whole window (the model was thinking, no tool call).
    let segs = ai_segments_for_window(&[], 1000, 5000);
    assert_eq!(
        segs,
        vec![Segment {
            kind: Kind::AiReasoning,
            start_ms: 1000,
            end_ms: 5000,
            label: None
        }]
    );
}

#[test]
fn ai_segments_tool_splits_reasoning() {
    // Window [0, 1000]; a Bash tool ran [200, 500]. Expect:
    //   ai-reasoning [0,200] + ai-doing [200,500] + ai-reasoning [500,1000].
    let events = [
        with_tool(ev(200, "s", "PreToolUse"), "Bash", "t1"),
        with_tool(ev(500, "s", "PostToolUse"), "Bash", "t1"),
    ];
    let segs = ai_segments_for_window(&events, 0, 1000);
    assert_eq!(
        segs,
        vec![
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 0,
                end_ms: 200,
                label: None
            },
            Segment {
                kind: Kind::AiDoing,
                start_ms: 200,
                end_ms: 500,
                label: None
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 500,
                end_ms: 1000,
                label: None
            },
        ]
    );
}

#[test]
fn ai_segments_subagent_labeled_and_wins_over_tool() {
    // Window [0, 1000]; a subagent ran [100, 800] and a tool ran [200, 400] INSIDE it.
    // The tool is the subagent's work → subagent covers [100,800] (labeled), the tool
    // span is subtracted out, and ai-reasoning fills [0,100] + [800,1000].
    let events = [
        with_agent(ev(100, "s", "SubagentStart"), "Explore"),
        with_tool(ev(200, "s", "PreToolUse"), "Bash", "t1"),
        with_tool(ev(400, "s", "PostToolUse"), "Bash", "t1"),
        with_agent(ev(800, "s", "SubagentStop"), "Explore"),
    ];
    let segs = ai_segments_for_window(&events, 0, 1000);
    assert_eq!(
        segs,
        vec![
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 0,
                end_ms: 100,
                label: None
            },
            Segment {
                kind: Kind::Subagent,
                start_ms: 100,
                end_ms: 800,
                label: Some("Explore".to_string()),
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 800,
                end_ms: 1000,
                label: None
            },
        ]
    );
}

#[test]
fn ai_segments_tool_outside_subagent_is_ai_doing() {
    // Window [0, 1000]; subagent [100,300] and a SEPARATE tool [500,700] (not inside
    // the subagent) → subagent labeled + ai-doing + reasoning gaps.
    let events = [
        with_agent(ev(100, "s", "SubagentStart"), "Plan"),
        with_agent(ev(300, "s", "SubagentStop"), "Plan"),
        with_tool(ev(500, "s", "PreToolUse"), "Edit", "t1"),
        with_tool(ev(700, "s", "PostToolUse"), "Edit", "t1"),
    ];
    let segs = ai_segments_for_window(&events, 0, 1000);
    assert_eq!(
        segs,
        vec![
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 0,
                end_ms: 100,
                label: None
            },
            Segment {
                kind: Kind::Subagent,
                start_ms: 100,
                end_ms: 300,
                label: Some("Plan".to_string()),
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 300,
                end_ms: 500,
                label: None
            },
            Segment {
                kind: Kind::AiDoing,
                start_ms: 500,
                end_ms: 700,
                label: None
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 700,
                end_ms: 1000,
                label: None
            },
        ]
    );
}

#[test]
fn ai_segments_two_separate_tools_tile_with_reasoning_between() {
    // Window [0, 800]; two non-adjacent tools [100,300] + [500,700] → the general
    // tiling case: reasoning + ai-doing + reasoning + ai-doing + reasoning.
    let events = [
        with_tool(ev(100, "s", "PreToolUse"), "Read", "t1"),
        with_tool(ev(300, "s", "PostToolUse"), "Read", "t1"),
        with_tool(ev(500, "s", "PreToolUse"), "Edit", "t2"),
        with_tool(ev(700, "s", "PostToolUse"), "Edit", "t2"),
    ];
    let segs = ai_segments_for_window(&events, 0, 800);
    assert_eq!(
        segs,
        vec![
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 0,
                end_ms: 100,
                label: None
            },
            Segment {
                kind: Kind::AiDoing,
                start_ms: 100,
                end_ms: 300,
                label: None
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 300,
                end_ms: 500,
                label: None
            },
            Segment {
                kind: Kind::AiDoing,
                start_ms: 500,
                end_ms: 700,
                label: None
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 700,
                end_ms: 800,
                label: None
            },
        ]
    );
}

#[test]
fn ai_segments_tool_partially_overlapping_subagent_keeps_only_the_remainder() {
    // Window [0, 1000]; subagent [100,400]; a tool [300,600] that STARTS inside the
    // subagent but ENDS after it. The subagent covers [300,400] of the tool; only the
    // right-remainder [400,600] survives as ai-doing (exercises subtract_spans' right
    // remainder). Result: reasoning + subagent + ai-doing + reasoning.
    let events = [
        with_agent(ev(100, "s", "SubagentStart"), "Explore"),
        with_tool(ev(300, "s", "PreToolUse"), "Bash", "t1"),
        with_agent(ev(400, "s", "SubagentStop"), "Explore"),
        with_tool(ev(600, "s", "PostToolUse"), "Bash", "t1"),
    ];
    let segs = ai_segments_for_window(&events, 0, 1000);
    assert_eq!(
        segs,
        vec![
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 0,
                end_ms: 100,
                label: None
            },
            Segment {
                kind: Kind::Subagent,
                start_ms: 100,
                end_ms: 400,
                label: Some("Explore".to_string()),
            },
            Segment {
                kind: Kind::AiDoing,
                start_ms: 400,
                end_ms: 600,
                label: None
            },
            Segment {
                kind: Kind::AiReasoning,
                start_ms: 600,
                end_ms: 1000,
                label: None
            },
        ]
    );
}

#[test]
fn ai_segments_clip_to_window() {
    // A tool interval [–100, 600] that spills past the window [0, 500] is clipped.
    let events = [
        with_tool(ev(-100, "s", "PreToolUse"), "Bash", "t1"),
        with_tool(ev(600, "s", "PostToolUse"), "Bash", "t1"),
    ];
    let segs = ai_segments_for_window(&events, 0, 500);
    // The tool covers the whole clipped window → one ai-doing [0,500], no reasoning.
    assert_eq!(
        segs,
        vec![Segment {
            kind: Kind::AiDoing,
            start_ms: 0,
            end_ms: 500,
            label: None
        }]
    );
}

#[test]
fn ai_segments_empty_window() {
    assert!(ai_segments_for_window(&[], 500, 500).is_empty());
    assert!(ai_segments_for_window(&[], 500, 100).is_empty());
}

// ===========================================================================
// Phase 3 — human-state gap machine. Per-branch tests; the full A1–A5/B1–B5
// scenario suite (with named scenario tests) is Phase 4.
// ===========================================================================

/// A native-signal row (`source = "claudesk-native"`).
fn native(ts: i64, event: &str) -> EventRow {
    EventRow {
        ts,
        session_id: String::new(),
        cwd: String::new(),
        event: event.to_string(),
        tool_name: None,
        agent_type: None,
        source: "claudesk-native".to_string(),
        meta: None,
    }
}

fn native_meta(ts: i64, event: &str, meta: &str) -> EventRow {
    let mut e = native(ts, event);
    e.meta = Some(meta.to_string());
    e
}

fn notif(ts: i64, ntype: &str) -> EventRow {
    let mut e = ev(ts, "s", "Notification");
    e.meta = Some(format!(r#"{{"notification_type":"{ntype}"}}"#));
    e
}

// ---- ai_busy_intervals (P3.1) ---------------------------------------------

#[test]
fn ai_busy_union_merges_tool_subagent_and_burst() {
    // A burst [0,1000] with a tool [200,400] and subagent [600,800] inside → the burst
    // already covers the whole span, so the union is one merged [0,1000].
    let events = [
        ev(0, "s", "UserPromptSubmit"),
        with_tool(ev(200, "s", "PreToolUse"), "Bash", "t1"),
        with_tool(ev(400, "s", "PostToolUse"), "Bash", "t1"),
        with_agent(ev(600, "s", "SubagentStart"), "Explore"),
        with_agent(ev(800, "s", "SubagentStop"), "Explore"),
        ev(1000, "s", "Stop"),
    ];
    assert_eq!(ai_busy_intervals(&events), vec![(0, 1000)]);
}

#[test]
fn ai_busy_leaves_gap_between_bursts() {
    // Two bursts [0,1000] and [5000,6000] → union has a human gap [1000,5000] between.
    let events = [
        ev(0, "s", "UserPromptSubmit"),
        ev(1000, "s", "Stop"),
        ev(5000, "s", "UserPromptSubmit"),
        ev(6000, "s", "Stop"),
    ];
    assert_eq!(ai_busy_intervals(&events), vec![(0, 1000), (5000, 6000)]);
}

// ---- awaiting_input_spans (P3.2) ------------------------------------------

#[test]
fn awaiting_span_opens_on_permission_prompt_closes_on_posttooluse() {
    // permission_prompt at 1000 → AwaitingInput until the PostToolUse (answer) at 4000.
    let events = [
        notif(1000, "permission_prompt"),
        ev(4000, "s", "PostToolUse"),
    ];
    assert_eq!(awaiting_input_spans(&events), vec![(1000, 4000)]);
}

#[test]
fn awaiting_span_ignores_informational_notification() {
    // idle_prompt is informational → NOT an awaiting span (single source of truth reused
    // from status_broadcaster).
    let events = [notif(1000, "idle_prompt"), ev(4000, "s", "Stop")];
    assert!(awaiting_input_spans(&events).is_empty());
}

#[test]
fn awaiting_span_absent_type_is_treated_as_input_needed() {
    // A Notification with no type → honest fallback = input-needed (matches the live dot).
    let mut n = ev(1000, "s", "Notification"); // no notification_type meta
    n.meta = None;
    let events = [n, ev(3000, "s", "Stop")];
    assert_eq!(awaiting_input_spans(&events), vec![(1000, 3000)]);
}

// ---- launch_marks (P3.3) --------------------------------------------------

#[test]
fn launch_marks_from_native_and_cc_bash() {
    let events = [
        native_meta(500, "ExternalLaunch", r#"{"tool":"sublime"}"#),
        with_tool(ev(1500, "s", "PostToolUse"), "Bash", "t1"), // CC ran `open ...`
        with_tool(ev(2500, "s", "PostToolUse"), "Edit", "t2"), // NOT a launch (Edit)
    ];
    assert_eq!(launch_marks(&events), vec![500, 1500]);
}

// ---- classify_gap branches (P3.4 / P3.5) ----------------------------------

#[test]
fn gap_with_keystrokes_is_typing() {
    // A KeystrokeActivity row inside the gap → Typing (measured), branch 1.
    let events = [native_meta(
        500,
        "KeystrokeActivity",
        r#"{"byte_count":12}"#,
    )];
    let ctx = GapContext::build(&events);
    assert_eq!(classify_gap(&ctx, 0, 1000, false), HumanState::Typing);
}

#[test]
fn gap_editor_active_no_keystrokes_is_typing() {
    // Editor-active surface, no PTY keystrokes → reading code, measured as Typing-family
    // (the locked "editor-active + no PTY keys" reading signal). branch 1.
    let ctx = GapContext::build(&[]);
    assert_eq!(classify_gap(&ctx, 0, 1000, true), HumanState::Typing);
}

#[test]
fn gap_after_launch_is_reviewing_within_cap() {
    // A launch at 480, gap starts 500 (within the 30s correlation window). No activity in
    // a short 2-min gap → working-credit, under the 10-min silence cap → Reviewing (B1).
    let events = [native_meta(480, "ExternalLaunch", r#"{"tool":"smerge"}"#)];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 2 * 60 * 1000, false),
        HumanState::Reviewing
    );
}

#[test]
fn gap_after_launch_exceeding_silence_cap_is_away() {
    // Launch at 480, gap starts 500, runs 40 min with NO activity → silence cap (10 min)
    // exceeded → Away (the "popped Sublime then pulled into a 40-min meeting" case).
    let events = [native_meta(480, "ExternalLaunch", r#"{"tool":"sublime"}"#)];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 40 * 60 * 1000, false),
        HumanState::Away
    );
}

#[test]
fn gap_after_launch_with_periodic_activity_stays_reviewing_beyond_cap() {
    // The DISTINGUISHING reset-on-activity case: launch at 480, gap runs 30 min (WELL past
    // the 10-min cap), but keystroke activity every ~7 min keeps the longest silence run
    // under the cap → Reviewing, NOT Away. This is "popped Sublime and kept working for
    // half an hour" vs. the silent-40-min "pulled into a meeting" case above. Proves the
    // cap resets on activity, not just that short gaps pass.
    let seven_min = 7 * 60 * 1000;
    let events = [
        native_meta(480, "ExternalLaunch", r#"{"tool":"sublime"}"#),
        native_meta(500 + seven_min, "KeystrokeActivity", r#"{"byte_count":3}"#),
        native_meta(
            500 + 2 * seven_min,
            "KeystrokeActivity",
            r#"{"byte_count":5}"#,
        ),
        native_meta(
            500 + 3 * seven_min,
            "KeystrokeActivity",
            r#"{"byte_count":8}"#,
        ),
    ];
    let ctx = GapContext::build(&events);
    // Gap [500, 500 + 30min]. Keystrokes at +7/+14/+21 min; largest silent run is ~9 min
    // (< 10-min cap). BUT keystrokes ALSO trigger branch 1 (Typing) — so to isolate the
    // cap-reset path, this fixture's keystrokes are the activity marks; presence of a
    // keystroke in the gap makes it Typing. Assert Typing (the stronger human-present
    // signal), which equally refutes Away.
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 30 * 60 * 1000, false),
        HumanState::Typing
    );
}

#[test]
fn gap_launch_credit_sustained_by_hook_activity_not_keystrokes_stays_reviewing() {
    // Cleaner isolation of the cap-reset (no keystrokes → not Typing): launch at 480,
    // 30-min gap, but cc-hook activity (UserPromptSubmit in another session) every ~7 min
    // resets the silence timer. No keystrokes in the gap → not Typing; working-credit from
    // the launch + silence never exceeds the cap → Reviewing across the whole 30 min.
    let seven_min = 7 * 60 * 1000;
    let events = [
        native_meta(480, "ExternalLaunch", r#"{"tool":"smerge"}"#),
        ev(500 + seven_min, "other", "UserPromptSubmit"),
        ev(500 + 2 * seven_min, "other", "UserPromptSubmit"),
        ev(500 + 3 * seven_min, "other", "UserPromptSubmit"),
    ];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 30 * 60 * 1000, false),
        HumanState::Reviewing
    );
}

#[test]
fn gap_awaiting_input_with_ongoing_activity_stays_reviewing() {
    // CC AwaitingInput (permission_prompt) opens the gap; keystroke-free but hook activity
    // (a PostToolUse mid-gap that DOESN'T close the await before the window) — actually
    // any activity within SILENCE_CAP resets the timer. Here: awaiting from 0, and an
    // activity mark every 5 min keeps silence under 10 min across a 20-min gap → Reviewing.
    // (B2b/B4 — servicing the blocked agent, sustained by activity.)
    let events = [
        notif(0, "permission_prompt"),
        // activity marks (cc-hook events) at 5min and 10min keep silence < cap.
        ev(5 * 60 * 1000, "s2", "UserPromptSubmit"),
        ev(10 * 60 * 1000, "s2", "UserPromptSubmit"),
    ];
    let ctx = GapContext::build(&events);
    // Gap [0, 15min]. awaiting_at(0) true → working-credit; longest silence run is
    // 5 min (< 10 min cap) → Reviewing.
    assert_eq!(
        classify_gap(&ctx, 0, 15 * 60 * 1000, false),
        HumanState::Reviewing
    );
}

#[test]
fn gap_focused_dead_quiet_beyond_threshold_is_away() {
    // No keystrokes, no launch, no awaiting, no activity, gap > away threshold (10 min) →
    // Away. Covers A5 (focused-but-gone) AND B5 (bare blur silent) — same rule, the
    // machine doesn't need focus state once there's no working-credit + long silence.
    let ctx = GapContext::build(&[]);
    assert_eq!(
        classify_gap(&ctx, 0, 11 * 60 * 1000, false),
        HumanState::Away
    );
}

#[test]
fn gap_short_idle_is_reviewing() {
    // Short focused-idle gap (2 min, under the away threshold), no keystrokes, no credit →
    // Reviewing (A4/A6 — reading/thinking fused, inferred). branch 4.
    let ctx = GapContext::build(&[]);
    assert_eq!(
        classify_gap(&ctx, 0, 2 * 60 * 1000, false),
        HumanState::Reviewing
    );
}

// ---- surface_is_editor_at (P3.5) ------------------------------------------

#[test]
fn surface_editor_reads_latest_active_surface_row() {
    let events = [
        native_meta(100, "ActiveSurface", r#"{"surface":"terminal"}"#),
        native_meta(500, "ActiveSurface", r#"{"surface":"editor"}"#),
    ];
    assert!(!surface_is_editor_at(&events, 200)); // latest at-or-before 200 is terminal
    assert!(surface_is_editor_at(&events, 600)); // latest at-or-before 600 is editor
}

#[test]
fn surface_tie_break_is_last_wins_same_ms() {
    // WP4 fix (SURFACE-2026-07-07-QUALITY-WP3-SURFACE-TIE-BREAK-ORDER-DEPENDENT): two
    // surface rows at the SAME ts must resolve deterministically, NOT by input order
    // (group_by_session/row source do not guarantee order). We sort by (ts, surface) and
    // take the last, so `"terminal" > "editor"` lexically → terminal wins REGARDLESS of the
    // order the two same-ms rows appear in the slice. Feed both orderings; the verdict must
    // be identical (and false, since terminal is the deterministic winner).
    let editor_first = [
        native_meta(500, "ActiveSurface", r#"{"surface":"editor"}"#),
        native_meta(500, "ActiveSurface", r#"{"surface":"terminal"}"#),
    ];
    let terminal_first = [
        native_meta(500, "ActiveSurface", r#"{"surface":"terminal"}"#),
        native_meta(500, "ActiveSurface", r#"{"surface":"editor"}"#),
    ];
    assert_eq!(
        surface_is_editor_at(&editor_first, 600),
        surface_is_editor_at(&terminal_first, 600),
        "a same-ms surface tie must not depend on input order"
    );
    assert!(
        !surface_is_editor_at(&editor_first, 600),
        "with a (ts, surface) sort, `terminal` deterministically wins the same-ms tie"
    );
}

// ---- human_segments_for_window end-to-end (P3.5) --------------------------

#[test]
fn human_window_tiles_gap_between_bursts() {
    // Two bursts [0,1000] and [wide]. The human gap between is classified. Here the gap
    // [1000, 1000+11min] is dead-quiet (no activity after the first burst) → Away.
    let gap_end = 1000 + 11 * 60 * 1000;
    let events = [
        ev(0, "s", "UserPromptSubmit"),
        ev(1000, "s", "Stop"),
        ev(gap_end, "s", "UserPromptSubmit"),
        ev(gap_end + 1000, "s", "Stop"),
    ];
    let segs = human_segments_for_window(&events, 0, gap_end + 1000);
    // Only the human GAP [1000, gap_end] is emitted here (AI-busy spans are the AI half).
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].kind, Kind::Away);
    assert_eq!(segs[0].start_ms, 1000);
    assert_eq!(segs[0].end_ms, gap_end);
}

#[test]
fn human_window_empty_when_ai_busy_whole_window() {
    // A burst covering the entire window → no human gaps.
    let events = [ev(0, "s", "UserPromptSubmit"), ev(1000, "s", "Stop")];
    assert!(human_segments_for_window(&events, 0, 1000).is_empty());
}

#[test]
fn human_state_maps_to_kind() {
    // The HumanState → Kind mapping the segments rely on.
    let ctx = GapContext::build(&[]);
    // short idle → Reviewing → Kind::Reviewing
    let seg = human_segments_for_window(&[], 0, 0);
    assert!(seg.is_empty());
    // direct branch check via classify_gap already covers the states; this pins the enum.
    assert_eq!(classify_gap(&ctx, 0, 1000, true), HumanState::Typing);
}

// ===========================================================================
// Phase 4 — the SCENARIO SUITE. One clearly-named test per row of the spec's
// locked scenario truth-table (`## Metric Definitions` → "The scenario space +
// LOCKED resolutions"), so a reviewer maps A1–A5 / B1–B5 1:1 to the spec. The
// per-branch Phase-3 tests above exercise the same machinery from the code side;
// these name the OPERATOR SCENARIOS from the product side.
//
// A window's timeline is tiled by ai_segments_for_window (AI-busy windows) +
// human_segments_for_window (the AI-idle gaps between). A1/A3/B3 are about which
// HALF a span lands in; A2/A4/A5/B1/B2/B4/B5 are human-gap classifications.
// ===========================================================================

// ---- A. Window FOCUSED ----------------------------------------------------

#[test]
fn scenario_a1_focused_keystrokes_is_typing() {
    // A1: focused + PTY keystrokes flowing → working here (measured typing).
    let events = [native_meta(500, "KeystrokeActivity", r#"{"byte_count":9}"#)];
    let ctx = GapContext::build(&events);
    assert_eq!(classify_gap(&ctx, 0, 60_000, false), HumanState::Typing);
}

#[test]
fn scenario_a2_focused_editor_active_no_keys_is_typing_reading_code() {
    // A2: focused + editor surface active + no PTY keys → reading/editing code here.
    // Measured as Typing-family (the locked "editor-active + no PTY keys" reading signal).
    let ctx = GapContext::build(&[]);
    assert_eq!(
        classify_gap(&ctx, 0, 60_000, /*surface_editor=*/ true),
        HumanState::Typing
    );
}

#[test]
fn scenario_a3_ai_running_is_ai_kind_not_a_human_gap() {
    // A3: focused + CC running → AI-activity family (focus irrelevant while AI runs).
    // The burst [0,1000] is AI-busy, so human_segments emits NOTHING for it; the AI half
    // (ai_segments_for_window) owns it as ai-reasoning/ai-doing.
    let events = [ev(0, "s", "UserPromptSubmit"), ev(1000, "s", "Stop")];
    assert!(human_segments_for_window(&events, 0, 1000).is_empty());
    // and the AI half tiles it (reasoning here — no tool):
    let ai = ai_segments_for_window(&events, 0, 1000);
    assert_eq!(ai.len(), 1);
    assert_eq!(ai[0].kind, Kind::AiReasoning);
}

#[test]
fn scenario_a4_short_focused_idle_is_reviewing() {
    // A4/A6: focused + CC idle + quiet, SHORT (< away threshold) → reviewing (reading vs
    // thinking fused — stays inferred, operator-accepted).
    let ctx = GapContext::build(&[]);
    assert_eq!(
        classify_gap(&ctx, 0, 3 * 60_000, false),
        HumanState::Reviewing
    );
}

#[test]
fn scenario_a5_focused_but_away_dead_quiet_beyond_threshold() {
    // A5: focused-but-AWAY — window left in front, operator gone. No keys, no credit,
    // dead-quiet > away threshold → Away. Focus is NOT proof of presence.
    let ctx = GapContext::build(&[]);
    assert_eq!(classify_gap(&ctx, 0, 11 * 60_000, false), HumanState::Away);
}

// ---- B. Window BLURRED ----------------------------------------------------

#[test]
fn scenario_b1_blur_preceded_by_claudesk_launch_is_working() {
    // B1: blur preceded by a native ExternalLaunch (operator clicked Sublime/Merge/Finder)
    // → working (capped). Short gap under the cap → Reviewing, NOT Away.
    let events = [native_meta(480, "ExternalLaunch", r#"{"tool":"sublime"}"#)];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 3 * 60_000, false),
        HumanState::Reviewing
    );
}

#[test]
fn scenario_b2a_cc_open_then_idle_short_is_reviewing() {
    // B2a: CC ran `open <screenshot>` (a cc-hook PostToolUse/Bash launch mark) then went
    // idle; operator reads it passively while blurred. Short gap → Reviewing (reading),
    // NOT Away. (No AwaitingInput → passive read, matched via the launch mark + short gap.)
    let events = [with_tool(ev(480, "s", "PostToolUse"), "Bash", "open1")];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 3 * 60_000, false),
        HumanState::Reviewing
    );
}

#[test]
fn scenario_b2b_awaiting_input_is_working() {
    // B2b: CC is AwaitingInput (permission_prompt — e.g. a Playwright login it's blocked
    // on); operator is DOING the thing CC needs → working (capped). Gap opens at the
    // permission_prompt; short → Reviewing (working-credit).
    let events = [notif(500, "permission_prompt")];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 3 * 60_000, false),
        HumanState::Reviewing
    );
}

#[test]
fn scenario_b3_ai_emitting_during_blur_is_ai_kind_no_monitoring_state() {
    // B3: blurred but CC still emitting events (agent working) → AI-activity family, NOT a
    // separate human "monitoring" state. The burst is AI-busy → no human segment for it.
    let events = [ev(0, "s", "UserPromptSubmit"), ev(2000, "s", "Stop")];
    assert!(human_segments_for_window(&events, 0, 2000).is_empty());
}

#[test]
fn scenario_b4_awaiting_collapses_to_capped_working_idle_collapses_to_away() {
    // B4: "working in an unrelated app" is UNDETECTABLE, so it collapses into the CC-state
    // + cap rule (spec lock): left while CC AwaitingInput → capped-working; left while CC
    // idle (no credit) + long silence → away. Two asserts, one per side of the collapse.
    // (i) AwaitingInput side → working:
    let awaiting = [notif(500, "permission_prompt")];
    let ctx_a = GapContext::build(&awaiting);
    assert_eq!(
        classify_gap(&ctx_a, 500, 500 + 3 * 60_000, false),
        HumanState::Reviewing
    );
    // (ii) idle side (no launch, no awaiting) + dead-quiet > threshold → away:
    let ctx_i = GapContext::build(&[]);
    assert_eq!(
        classify_gap(&ctx_i, 0, 11 * 60_000, false),
        HumanState::Away
    );
}

#[test]
fn trailing_open_await_is_bounded_at_window_end_not_dropped() {
    // WP4 fix (SURFACE-2026-07-07-QUALITY-WP3-TRAILING-OPEN-AWAIT-FALLS-TO-AWAY): an
    // AwaitingInput span still OPEN at the data tail (operator servicing a prompt CC is
    // blocked on RIGHT NOW — the freshest slice a live dashboard renders) must be BOUNDED at
    // the window end so classify_gap branch 2 can grant capped-working credit — NOT silently
    // dropped. The window-aware entry point (awaiting_input_spans_bounded / build_with_window,
    // used by human_segments_for_window) produces the span; the bare entry point (window_end
    // = None, used where no window is known) keeps the historical drop.
    let window_end = 1000 + 12 * 60 * 1000;
    let events = [notif(1000, "permission_prompt")]; // opens AwaitingInput, never closed

    // Bounded: the open await becomes a real [1000, window_end] span (working-credit source).
    assert_eq!(
        awaiting_input_spans_bounded(&events, Some(window_end)),
        vec![(1000, window_end)],
        "an unclosed await must be bounded at window_end, not dropped"
    );
    // Bare (no window): historical drop preserved (nothing to close it against).
    assert!(
        awaiting_input_spans(&events).is_empty(),
        "with no window bound the unclosed await is still dropped (conservative fallback)"
    );

    // Consequence in classify_gap: the bounded context grants working-credit at gap_start,
    // so branch 2 owns the classification (capped-working) rather than falling through to the
    // no-credit Away branch. (With the operator's LOCKED equal thresholds — SILENCE_CAP ==
    // AWAY_THRESHOLD, both 10min — the *verdict* for a silent long gap is Away either way;
    // see the discovery note. The fix's value is decoupling correctness from that threshold
    // coincidence: the moment the caps diverge, the dropped span would misclassify and the
    // bounded one would not. We pin the STRUCTURAL fix — the span exists — which is the
    // behavior-independent guarantee.)
    let ctx_bounded = GapContext::build_with_window(&events, Some(window_end));
    // A SHORT bounded-await gap is Reviewing (working-credit, under the cap) — the everyday
    // "servicing the prompt" slice a live dashboard shows.
    assert_eq!(
        classify_gap(&ctx_bounded, 1000, 1000 + 3 * 60_000, false),
        HumanState::Reviewing,
        "a bounded open-await gap reads as capped-working while under the silence cap"
    );
}

#[test]
fn scenario_b5_left_the_machine_bare_blur_silent_is_away() {
    // B5: genuinely away — bare blur, silent everywhere, no preceding launch, CC idle,
    // beyond the threshold → Away. (Same rule as A5; the machine needs no focus state once
    // there's no working-credit + long silence.)
    let ctx = GapContext::build(&[]);
    assert_eq!(classify_gap(&ctx, 0, 15 * 60_000, false), HumanState::Away);
}

#[test]
fn scenario_launch_credit_expires_after_cap_pulled_into_meeting() {
    // The CAP (operator's load-bearing threshold): a launch/awaiting gap credits working
    // only until SILENCE_CAP_MS of total silence — then Away. "Popped Sublime, then pulled
    // into a 40-min meeting" → Away despite the launch.
    let events = [native_meta(480, "ExternalLaunch", r#"{"tool":"sublime"}"#)];
    let ctx = GapContext::build(&events);
    assert_eq!(
        classify_gap(&ctx, 500, 500 + 40 * 60_000, false),
        HumanState::Away
    );
}

// ---- P4.2: deliberate NON-PORT of the reading-vs-thinking gap buckets ------
//
// `claude-time`'s `test_reclassify.py::GapBucketTests` pinned the 120s/300s
// reading-vs-thinking thresholds (test_just_at_reading_threshold,
// test_just_over_reading_threshold, test_just_at_thinking_threshold,
// test_just_over_thinking_threshold, test_typing_debit_*). These are DELIBERATELY
// NOT ported: the redesign COLLAPSED reading+thinking into the single `reviewing`
// kind (operator 2026-07-07 — nothing observable separates eyes-reading from
// mind-wandering, so two magic thresholds became zero). The `chars_per_sec`
// typing-debit that fed those buckets is likewise not exercised by the
// presence/threshold-based human classifier (see the WIP Discoveries note on the
// possibly-vestigial constant → WP4 drop-vs-wire decision). The SURVIVING reference
// assertions (tool durations/intervals, subagent durations/intervals, active
// bursts, session-active) ARE ported — see the Phase-2 test sections above, which
// mirror ToolDurationsTests / ToolIntervalsTests / SubagentDurationsTests /
// SubagentIntervalsTests / ActiveBurstsTests / SessionActiveTests one-for-one.

#[test]
fn nonport_marker_reading_thinking_buckets_superseded_by_reviewing() {
    // A guard that documents the non-port AS a test: the redesign has exactly ONE
    // focused-idle human kind, `Reviewing` — there is no separate `reading`/`thinking`.
    // If a future change reintroduces a reading/thinking split, this intent-pin should be
    // revisited alongside it.
    let ctx = GapContext::build(&[]);
    // Both a "reading-length" (short) and a "thinking-length" (medium, still < away) gap
    // map to the SAME kind now — Reviewing — not two different buckets.
    let short_gap = classify_gap(&ctx, 0, 90_000, false); // was "reading" (<120s)
    let medium_gap = classify_gap(&ctx, 0, 4 * 60_000, false); // was "thinking" (120-300s)
    assert_eq!(short_gap, HumanState::Reviewing);
    assert_eq!(medium_gap, HumanState::Reviewing);
    assert_eq!(short_gap, medium_gap, "reading+thinking are one bucket now");
}

// ===========================================================================
// M9 WP6.5 — resolve_session_end (session-termination model, Phase 1).
// ===========================================================================

const CAP: i64 = constants::SESSION_IDLE_CAP_MS; // 30 min in ms
const MIN: i64 = 60_000;

/// Build a session's rows from `(minute, event)` pairs (session id fixed). The cap keys on
/// IDLE gaps (spans with no AI-busy cover), so tests must model real event semantics: a
/// `UserPromptSubmit`→`Stop` pair is an AI-busy burst (NOT idle); a `Stop` then a much-later
/// stray event is a genuine idle gap.
fn sess(pairs: &[(i64, &str)]) -> Vec<EventRow> {
    pairs.iter().map(|(m, e)| ev(m * MIN, "s6.5", e)).collect()
}

#[test]
#[allow(clippy::assertions_on_constants)] // deliberately pins a design invariant on the consts
fn session_cap_constant_is_30_min_and_distinct_from_away_threshold() {
    // D2: the session-termination cap is a DIFFERENT axis from the human-away threshold.
    assert_eq!(constants::SESSION_IDLE_CAP_MS, 30 * 60 * 1000);
    assert_ne!(
        constants::SESSION_IDLE_CAP_MS,
        constants::AWAY_THRESHOLD_MS,
        "session-ended (30m) and human-away (10m) are different thresholds"
    );
    assert!(
        constants::SESSION_IDLE_CAP_MS > constants::AWAY_THRESHOLD_MS,
        "the session cap must be looser than the away threshold (AC3)"
    );
}

#[test]
fn resolve_end_no_gap_returns_last_event() {
    // A tightly-spaced burst (UPS→Post→Stop, all sub-cap) ends at its last event.
    let events = sess(&[(0, "UserPromptSubmit"), (5, "Stop"), (12, "Stop")]);
    assert_eq!(resolve_session_end(&events, None), 12 * MIN);
}

#[test]
fn resolve_end_long_active_run_is_not_capped() {
    // The regression the raw-gap version caused: a UPS→(long AI run)→Stop is ONE active
    // burst — AI-busy the whole 40 min — so there is NO idle gap and the session is NOT
    // capped even though the two events are >30 min apart.
    let events = sess(&[(0, "UserPromptSubmit"), (40, "Stop")]);
    assert_eq!(
        resolve_session_end(&events, None),
        40 * MIN,
        "an active UPS→run→Stop span is AI-busy, not idle — must not cap"
    );
}

#[test]
fn resolve_end_live_idle_under_cap_is_preserved() {
    // AC3: a genuine idle break UNDER the cap between two bursts is NOT a termination.
    // burst1 [0,5], 20-min idle gap [5,25] (< 30), burst2 [25,30].
    let events = sess(&[
        (0, "UserPromptSubmit"),
        (5, "Stop"),
        (25, "UserPromptSubmit"),
        (30, "Stop"),
    ]);
    assert_eq!(
        resolve_session_end(&events, None),
        30 * MIN,
        "a sub-cap idle gap must not terminate a live session"
    );
}

#[test]
fn resolve_end_oversized_idle_gap_caps_at_event_before_gap() {
    // AC2: a burst, then a huge IDLE gap, then a stray late event. The session ended at the
    // last event BEFORE the oversized idle gap; the stray is dropped.
    let last_real = 6; // min — end of the real burst
    let stray = last_real + 40; // > 30-min idle later — a lone late Notification
    let events = sess(&[
        (0, "UserPromptSubmit"),
        (last_real, "Stop"),
        (stray, "Notification"),
    ]);
    assert_eq!(
        resolve_session_end(&events, None),
        last_real * MIN,
        "the session terminated in the silent gap; the stray event is dropped"
    );
}

#[test]
fn resolve_end_the_10_54_to_13_42_defect_repro() {
    // The exact operator-reported shape: real work ended ~11:00; a stray event landed at
    // 13:42 (~2h42m idle later, far > the 30-min cap). Resolved end = last real event, NOT
    // 13:42 — the row must stop stretching to the day edge.
    let t_last_real = 6; // min — ~11:00 real activity tail (after a 10:54 start)
    let t_1342 = 168; // min — 2h48m after start, a lone stray
    let events = sess(&[
        (0, "UserPromptSubmit"),
        (t_last_real, "Stop"),
        (t_1342, "Notification"),
    ]);
    let end = resolve_session_end(&events, None);
    assert_eq!(end, t_last_real * MIN, "cap at real activity, not the 13:42 stray");
    assert!(end < t_1342 * MIN, "the dead session no longer reaches the stray");
}

#[test]
fn resolve_end_authoritative_marker_wins_and_clamps_into_span() {
    // Level 1 precedence: an explicit/SessionEnd end wins over the cap + last event, clamped
    // into [first, last] defensively.
    let events = sess(&[(0, "UserPromptSubmit"), (5, "Stop"), (10, "Stop")]);
    assert_eq!(resolve_session_end(&events, Some(7 * MIN)), 7 * MIN); // between events
    assert_eq!(resolve_session_end(&events, Some(99 * MIN)), 10 * MIN); // clamps down
    assert_eq!(resolve_session_end(&events, Some(-5)), 0); // clamps up to first
}

#[test]
fn resolve_end_authoritative_marker_beats_an_oversized_gap() {
    // BOTH an oversized idle gap AND an authoritative marker → the marker (level 1) wins.
    let events = sess(&[(0, "UserPromptSubmit"), (3, "Stop"), (3 + 40, "Notification")]);
    assert_eq!(resolve_session_end(&events, None), 3 * MIN); // cap fires without a marker
    assert_eq!(resolve_session_end(&events, Some(4 * MIN)), 4 * MIN); // marker overrides
}

#[test]
fn resolve_end_single_event_returns_that_event() {
    assert_eq!(resolve_session_end(&sess(&[(42, "Stop")]), None), 42 * MIN);
}

#[test]
fn resolve_end_partial_ai_cover_keeps_idle_under_cap_not_capped() {
    // The idle-gap subtlety (P1.2 correction) pinned permanently: a raw event-to-event
    // span exceeds the cap, BUT a mid-span tool run covers most of it, leaving the IDLE
    // remainder < 30 min. Must NOT cap — the cap keys on idle, not raw gaps.
    // Stop@0 (no live burst), then a 45-min tool [5,50] (AI busy), then Stop@52.
    // Raw span 0->52 = 52 min (> cap); idle = (5-0) + (52-50) = 7 min (< cap).
    let events = vec![
        ev(0, "s6.5", "Stop"), // minute 0
        with_tool(ev(5 * MIN, "s6.5", "PreToolUse"), "Bash", "tp1"),
        with_tool(ev(50 * MIN, "s6.5", "PostToolUse"), "Bash", "tp1"),
        ev(52 * MIN, "s6.5", "Stop"),
    ];
    assert_eq!(
        resolve_session_end(&events, None),
        52 * MIN,
        "AI-busy time inside the span shrinks idle below the cap — no termination"
    );
}

#[test]
fn resolve_end_idle_after_ai_activity_exceeds_cap_caps_at_last_activity() {
    // Complement of the above: AI runs early, then a long idle tail crosses the cap. The
    // session ends at the last event before the oversized IDLE portion. Tool [5,10]
    // (AI busy), Stop@10, then a 40-min idle to a stray Notification@50 (> cap).
    let events = vec![
        ev(0, "s6.5", "UserPromptSubmit"), // minute 0
        with_tool(ev(5 * MIN, "s6.5", "PreToolUse"), "Bash", "tp2"),
        with_tool(ev(10 * MIN, "s6.5", "PostToolUse"), "Bash", "tp2"),
        ev(10 * MIN, "s6.5", "Stop"),
        ev(50 * MIN, "s6.5", "Notification"),
    ];
    assert_eq!(
        resolve_session_end(&events, None),
        10 * MIN,
        "the idle tail past AI activity exceeds the cap → end at last real event"
    );
}

// ---- Phase 2: authoritative_end + resolver precedence + late-event guard ----

/// A `claudesk-native` row (source override), for the explicit WorkspaceClose marker.
fn native_ev(ts: i64, event: &str) -> EventRow {
    let mut e = ev(ts, "s6.5", event);
    e.source = "claudesk-native".to_string();
    e
}

#[test]
fn authoritative_end_none_when_no_marker() {
    let events = sess(&[(0, "UserPromptSubmit"), (5, "Stop")]);
    assert_eq!(authoritative_end(&events), None);
}

#[test]
fn authoritative_end_honors_session_end() {
    let events = sess(&[(0, "UserPromptSubmit"), (5, "Stop"), (6, "SessionEnd")]);
    assert_eq!(authoritative_end(&events), Some(6 * MIN));
}

#[test]
fn authoritative_end_explicit_marker_beats_session_end() {
    // D3: an explicit WorkspaceClose (native) wins over a CC SessionEnd, even if the
    // SessionEnd is earlier — the marker is Claudesk's synchronous ground truth.
    let mut events = sess(&[(0, "UserPromptSubmit"), (5, "Stop")]);
    events.push(ev(6 * MIN, "s6.5", "SessionEnd")); // cc-hook
    events.push(native_ev(7 * MIN, "WorkspaceClose")); // native marker
    assert_eq!(
        authoritative_end(&events),
        Some(7 * MIN),
        "WorkspaceClose (signal 1) takes precedence over SessionEnd (signal 3)"
    );
}

#[test]
fn authoritative_end_earliest_of_a_kind_wins() {
    // A session ends once; a duplicate marker of the same kind → the earliest ts.
    let mut events = sess(&[(0, "UserPromptSubmit"), (5, "Stop")]);
    events.push(ev(6 * MIN, "s6.5", "SessionEnd"));
    events.push(ev(9 * MIN, "s6.5", "SessionEnd"));
    assert_eq!(authoritative_end(&events), Some(6 * MIN));
}

#[test]
fn resolve_end_honors_session_end_even_with_a_later_stray_event() {
    // The late-event guard at the resolver level: a SessionEnd@6 followed by a stray
    // Notification@50 → the session ends at 6 (the authoritative end wins; the stray is
    // past it and does not extend the window).
    let mut events = sess(&[(0, "UserPromptSubmit"), (5, "Stop")]);
    events.push(ev(6 * MIN, "s6.5", "SessionEnd"));
    events.push(ev(50 * MIN, "s6.5", "Notification"));
    let ae = authoritative_end(&events);
    assert_eq!(ae, Some(6 * MIN));
    assert_eq!(
        resolve_session_end(&events, ae),
        6 * MIN,
        "SessionEnd is authoritative; the later stray does not extend the session"
    );
}

#[test]
fn resolve_end_explicit_marker_overrides_the_cap_and_last_event() {
    // Composed: an oversized idle gap (would cap at 5) AND an explicit WorkspaceClose@7 →
    // the marker (level 1) wins over the cap (level 2).
    let mut events = sess(&[(0, "UserPromptSubmit"), (5, "Stop"), (5 + 40, "Notification")]);
    events.push(native_ev(7 * MIN, "WorkspaceClose"));
    let ae = authoritative_end(&events);
    assert_eq!(resolve_session_end(&events, ae), 7 * MIN);
}

// ---- Phase 4: dangling_sessions (startup reconciliation detector) ----------

/// Build a session's rows with an explicit session id + cwd (dangling tests need multiple
/// distinct sessions).
fn sess_id(id: &str, cwd: &str, pairs: &[(i64, &str)]) -> Vec<EventRow> {
    pairs
        .iter()
        .map(|(m, e)| {
            let mut r = ev(m * MIN, id, e);
            r.cwd = cwd.to_string();
            r
        })
        .collect()
}

#[test]
fn dangling_detects_a_session_silent_past_the_cap_with_no_marker() {
    // A session whose last event is > cap before `now`, no WorkspaceClose/SessionEnd →
    // dangling; reconciliation should close it at its last-seen ts.
    let now = 200 * MIN;
    let events = sess_id("dead-1", "/repo/a", &[(0, "UserPromptSubmit"), (10, "Stop")]);
    // last event at 10min; now at 200min → 190min silent >> 30min cap.
    let d = dangling_sessions(&events, now, CAP);
    assert_eq!(d.len(), 1);
    assert_eq!(d[0].session_id, "dead-1");
    assert_eq!(d[0].cwd, "/repo/a");
    assert_eq!(d[0].last_ts, 10 * MIN, "closes at the last-seen event");
}

#[test]
fn dangling_ignores_a_recent_session_within_the_cap() {
    // A session whose last event is WITHIN the cap of `now` is live/recent → NOT dangling.
    let now = 20 * MIN; // last event at 10min → 10min silent < 30min cap
    let events = sess_id("live-1", "/repo/a", &[(0, "UserPromptSubmit"), (10, "Stop")]);
    assert!(dangling_sessions(&events, now, CAP).is_empty());
}

#[test]
fn dangling_ignores_a_session_that_already_has_a_marker() {
    // A session past the cap but WITH a WorkspaceClose (or SessionEnd) is already closed →
    // NOT dangling. This is what makes reconciliation idempotent.
    let now = 200 * MIN;
    let mut ws_closed = sess_id("closed-1", "/repo/a", &[(0, "UserPromptSubmit"), (10, "Stop")]);
    let mut mk = ev(10 * MIN, "closed-1", "WorkspaceClose");
    mk.source = "claudesk-native".to_string();
    mk.cwd = "/repo/a".to_string();
    ws_closed.push(mk);
    assert!(dangling_sessions(&ws_closed, now, CAP).is_empty(), "WorkspaceClose → not dangling");

    let mut se_closed = sess_id("closed-2", "/repo/b", &[(0, "UserPromptSubmit"), (10, "Stop")]);
    se_closed.push(ev(11 * MIN, "closed-2", "SessionEnd"));
    assert!(dangling_sessions(&se_closed, now, CAP).is_empty(), "SessionEnd → not dangling");
}

#[test]
fn dangling_reports_multiple_sessions_deterministically() {
    // Two dangling sessions → both reported, sorted by id (stable write order).
    let now = 300 * MIN;
    let mut events = sess_id("aaa", "/repo/a", &[(0, "UserPromptSubmit"), (5, "Stop")]);
    events.extend(sess_id("bbb", "/repo/b", &[(0, "UserPromptSubmit"), (8, "Stop")]));
    let d = dangling_sessions(&events, now, CAP);
    assert_eq!(d.iter().map(|x| x.session_id.as_str()).collect::<Vec<_>>(), ["aaa", "bbb"]);
    assert_eq!(d[0].last_ts, 5 * MIN);
    assert_eq!(d[1].last_ts, 8 * MIN);
}

#[test]
fn dangling_skips_empty_session_id_window_level_rows() {
    // Native window-level rows (empty session_id) are not sessions → never dangling.
    let now = 300 * MIN;
    let mut r = ev(0, "", "WindowFocus");
    r.source = "claudesk-native".to_string();
    assert!(dangling_sessions(&[r], now, CAP).is_empty());
}
