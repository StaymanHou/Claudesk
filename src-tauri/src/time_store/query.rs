//! Time-analytics query layer (M9 WP4) — rows → segment-model DTOs.
//!
//! The synchronous data path: read `events` rows from the [`TimeStore`](super::
//! commands::TimeStore) SQLite DB for a window, run the WP3 reclassifier
//! ([`crate::reclassify`]), and emit the segment-model contract the WP6 dashboard
//! consumes. This is the Rust adaptation of `claude-time`'s `viz_data.py`
//! (events → segment-model JSON), **as revised by WP3's locked 6-kind enum**
//! (`{ai-doing, subagent, ai-reasoning, typing, reviewing, away}`) — NOT a straight
//! port of `viz_data.py`'s old `{active, reading, thinking, away, subagent}` shape.
//!
//! ## What changed vs. `viz_data.py`
//! - **Segment production.** `viz_data.py` built each session's segs from
//!   `active_bursts` + the old `gap_buckets` (reading/thinking/away by magic
//!   thresholds). WP3 replaced that with the **two-tiler** model: the AI tiler
//!   ([`reclassify::ai_segments_for_window`]) over each AI-busy span, and the human
//!   tiler ([`reclassify::human_segments_for_window`]) over the AI-idle complement.
//!   This module composes those two over each viz-session window — the WP3 hand-off's
//!   explicit instruction. The emitted `kind`s are the 6-kind enum's stable tags.
//! - **`chars_per_sec` dropped** (WP4 P1.4) — the human classifier is
//!   presence/threshold-based; no typing-rate estimation survives.
//!
//! ## What is faithfully ported
//! The viz-session *structure* — day partitioning on the LOCAL calendar,
//! minutes-from-local-midnight coordinates, per-project rollup by resolved alias,
//! adaptive `hour_range`, `tools`/`prompts` counts, cross-day/cross-project union for
//! week + custom windows — mirrors `build_day_data` / `build_range_data` /
//! `build_week_data`.
//!
//! ## Scope
//! **Global all-projects view with a per-project breakdown** (the resolved M9 WP4
//! sub-decision) — the value is cross-project "where did the week go", rendered from
//! any workspace's tab. The `scope` command arg is accepted for forward-compat but
//! only `global` is implemented in v1.
//!
//! OUT of scope (WP6c, after WP3 defs — which are already locked, but their surfaces
//! aren't the day/week segment core WP4 owns): `build_metrics` / `build_comparison_data`.

use std::collections::HashMap;

use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone};
use serde::Serialize;

use crate::reclassify::{
    ai_busy_intervals, ai_segments_for_window, authoritative_end, human_segments_for_window,
    resolve_session_end, EventRow, Kind, Segment,
};

// ===========================================================================
// DTOs — the segment-model contract (WP1-frozen shape, WP3-revised `kind`).
//
// snake_case END-TO-END, NO `rename_all` — mirrors WorkspaceStatusUpdate (the
// project IPC-casing convention). WP6's TS types mirror these keys verbatim; the
// `dto_serde_shape_is_snake_case` test pins them so a rename must break a test.
// Times are integer minutes-from-LOCAL-midnight (the frozen coordinate system).
// ===========================================================================

/// One tiled segment in a session's timeline. `kind` serializes to the WP3 kebab tag
/// (`"ai-doing"`/`"subagent"`/`"ai-reasoning"`/`"typing"`/`"reviewing"`/`"away"`) via
/// [`Kind::as_str`]. `label` is present only on `subagent` segments (the `agent_type`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SegPayload {
    #[serde(serialize_with = "serialize_kind")]
    pub kind: Kind,
    /// Minutes-from-local-midnight, `start <= end`. RENDER POSITION only — quantized to
    /// the minute (WP1 frozen contract). Do NOT derive duration from `end - start`: a
    /// sub-minute segment floors both to the same minute → 0. Use `dur_ms` for duration.
    pub start: i64,
    pub end: i64,
    /// The segment's TRUE duration in milliseconds (`end_ms - start_ms` from the
    /// reclassifier, pre-quantization). This is the ONLY correct source for per-kind
    /// duration totals — AI tool-execution is intrinsically sub-minute, so summing the
    /// quantized `end - start` silently zeroes it (SURFACE-2026-07-13-M9-WP4-MINUTE-
    /// QUANTIZATION-ZEROES-SUBMINUTE-AI-DOING). Consumers sum `dur_ms` per kind, then
    /// convert the TOTAL to minutes once (round-half-up).
    pub dur_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Serialize a [`Kind`] as its stable kebab tag (not the Rust variant name).
fn serialize_kind<S>(kind: &Kind, s: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    s.serialize_str(kind.as_str())
}

/// One dashboard "session" — one `session_id`'s engagement window, tiled into segs.
/// (A `session_id` is kept as ONE viz-session, matching the WP3/claude-time decision
/// that a resumed session is one logical work block, not split on away gaps.)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SessionPayload {
    /// Short session id (first 8 chars of the underlying `session_id`).
    pub id: String,
    /// Minutes-from-local-midnight of the first event.
    pub start: i64,
    /// Minutes-from-local-midnight of the last event.
    pub end: i64,
    /// Count of `UserPromptSubmit` events in the session window.
    pub prompts: i64,
    /// Tool-name → count map (from `PreToolUse` events).
    pub tools: HashMap<String, i64>,
    /// Non-overlapping, sorted segments tiling `[start, end]`.
    pub segs: Vec<SegPayload>,
    /// The day this session belongs to (`"YYYY-MM-DD"`), for multi-day renderers.
    /// Absent on a bare single-day payload (matches `build_day_data`); present on
    /// range/week payloads.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub day_iso: Option<String>,
}

/// One project row — a resolved alias grouping N sessions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectPayload {
    /// Equals `alias` (viz_data convention).
    pub id: String,
    pub alias: String,
    /// Primary repo path (first cwd encountered, deterministic).
    pub path: String,
    pub sessions: Vec<SessionPayload>,
}

/// The single-day payload (`today` in the frozen contract).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DayPayload {
    /// e.g. `"WED · MAY 13"` (upper-cased `%a · %b %d`).
    pub label: String,
    /// `"YYYY-MM-DD"`.
    pub iso: String,
    pub projects: Vec<ProjectPayload>,
    /// `[start_hour, end_hour_exclusive]`, adaptive + 1h pad, clamped [0,24],
    /// fallback [6,23].
    pub hour_range: [i64; 2],
    /// Present + `true` only on an empty day (absent on a non-empty day).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub empty: Option<bool>,
}

/// One project's 7-day rollup cell (per-kind minute totals + prompts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
pub struct RollupCell {
    pub ai_doing: i64,
    pub subagent: i64,
    pub ai_reasoning: i64,
    pub typing: i64,
    pub reviewing: i64,
    pub away: i64,
    pub prompts: i64,
}

/// Internal ms-precision accumulator for the week rollup. Durations are summed here at
/// full ms precision, then converted to the minute-unit [`RollupCell`] once per kind
/// (round-half-up) — so sub-minute AI-doing segments accrue their real time instead of
/// each flooring to zero. Not serialized; never leaves the query layer.
#[derive(Debug, Clone, Copy, Default)]
struct RollupCellMs {
    ai_doing_ms: i64,
    subagent_ms: i64,
    ai_reasoning_ms: i64,
    typing_ms: i64,
    reviewing_ms: i64,
    away_ms: i64,
    prompts: i64,
}

impl RollupCellMs {
    fn into_rollup_cell(self) -> RollupCell {
        RollupCell {
            ai_doing: ms_to_minutes_round(self.ai_doing_ms),
            subagent: ms_to_minutes_round(self.subagent_ms),
            ai_reasoning: ms_to_minutes_round(self.ai_reasoning_ms),
            typing: ms_to_minutes_round(self.typing_ms),
            reviewing: ms_to_minutes_round(self.reviewing_ms),
            away: ms_to_minutes_round(self.away_ms),
            prompts: self.prompts,
        }
    }
}

/// One project's week rollup (7 cells, Mon→Sun).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WeekProject {
    pub id: String,
    pub alias: String,
    pub rollup: Vec<RollupCell>,
}

/// The week-rollup payload (`week` in the frozen contract).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WeekPayload {
    /// e.g. `"WEEK 20 · MAY 11 — MAY 17"`.
    pub label: String,
    /// 7 day labels (`"MON 11"` …).
    pub days: Vec<String>,
    pub projects: Vec<WeekProject>,
}

// ===========================================================================
// Time helpers — minutes-from-local-midnight + day bucketing (LOCAL calendar).
// ===========================================================================

/// Local-midnight epoch-ms for a given `NaiveDate`. Uses the system local tz. On a
/// DST-ambiguous/nonexistent midnight (rare), takes the earliest valid instant.
fn local_midnight_ms(day: NaiveDate) -> i64 {
    let naive = day.and_hms_opt(0, 0, 0).expect("00:00:00 is always valid");
    Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&naive).latest())
        .map(|dt| dt.timestamp_millis())
        // Fallback: treat as UTC midnight (should never hit — every civil midnight
        // maps to at least one instant, ambiguous or not).
        .unwrap_or_else(|| naive.and_utc().timestamp_millis())
}

/// Convert an epoch-ms timestamp to integer minutes-from-`day_start_ms`, clamped to
/// `[0, 1440]` (so a ts slightly outside the day window doesn't leave the grid).
/// Mirrors `viz_data._ts_to_minutes`.
fn ts_to_minutes(ts_ms: i64, day_start_ms: i64) -> i64 {
    let minutes = (ts_ms - day_start_ms).div_euclid(60_000);
    minutes.clamp(0, 1440)
}

/// Convert a DURATION in milliseconds to whole minutes, round-half-up. Used to convert a
/// per-kind `dur_ms` TOTAL to the minute unit the rollups/stats report — summing at ms
/// precision then rounding ONCE, so sub-minute segments accrue their real time instead of
/// each flooring to zero (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…). Negative
/// inputs clamp to 0.
fn ms_to_minutes_round(dur_ms: i64) -> i64 {
    if dur_ms <= 0 {
        return 0;
    }
    (dur_ms + 30_000) / 60_000
}

/// The local calendar date an epoch-ms timestamp falls on.
fn local_date_of(ts_ms: i64) -> NaiveDate {
    Local
        .timestamp_millis_opt(ts_ms)
        .single()
        .map(|dt| dt.date_naive())
        // Fallback for an out-of-range ts: epoch date.
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
}

/// `%a · %b %d` upper-cased, e.g. `"WED · MAY 13"`.
fn day_label(day: NaiveDate) -> String {
    day.format("%a · %b %d").to_string().to_uppercase()
}

// ===========================================================================
// Alias resolution — git-root basename fallback + optional project_names map.
// Mirrors `viz_data._resolve_alias`.
// ===========================================================================

const MISC_LABEL: &str = "misc";

/// Resolve a cwd to a project alias:
/// 1. explicit `project_names` entry (name → [paths]) containing this cwd → that name
/// 2. cwd inside a git repo → basename of the repo root
/// 3. otherwise → [`MISC_LABEL`]
///
/// `project_names` is the deferred grouping param (WP3 → WP4); an empty map is the
/// common case (rule 2/3 then apply).
fn resolve_alias(cwd: &str, project_names: &HashMap<String, Vec<String>>) -> String {
    for (name, paths) in project_names {
        if paths.iter().any(|p| p == cwd) {
            return name.clone();
        }
    }
    auto_alias(cwd)
}

/// Git-basename fallback: walk up from `cwd` looking for a `.git` dir; return the
/// basename of the repo root, else [`MISC_LABEL`]. Pure filesystem probe (no git2 —
/// a `.git` existence check is enough for aliasing and keeps this dependency-free).
fn auto_alias(cwd: &str) -> String {
    if cwd.is_empty() {
        return MISC_LABEL.to_string();
    }
    let mut dir = std::path::Path::new(cwd);
    loop {
        if dir.join(".git").exists() {
            return dir
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| MISC_LABEL.to_string());
        }
        match dir.parent() {
            Some(p) => dir = p,
            None => return MISC_LABEL.to_string(),
        }
    }
}

// ===========================================================================
// Segment production — WP3 two-tiler composition (NOT the old gap model).
// ===========================================================================

/// Tile one session's `[window_start, window_end]` window with the WP3 two-tiler
/// model: the AI tiler over each AI-busy span (ai-doing / subagent / ai-reasoning),
/// the human tiler over the AI-idle complement (typing / reviewing / away). Returns
/// segments in epoch-ms, sorted, non-overlapping, tiling the window. (The WP3
/// hand-off's explicit composition instruction.)
fn segments_for_window(events: &[EventRow], window_start: i64, window_end: i64) -> Vec<Segment> {
    if window_end <= window_start {
        return Vec::new();
    }
    let mut segs: Vec<Segment> = Vec::new();

    // AI half: run the AI tiler over each AI-busy span (merged union of tool +
    // subagent + burst intervals), clipped to the window.
    for (bs, be) in ai_busy_intervals(events) {
        let cs = bs.max(window_start);
        let ce = be.min(window_end);
        if ce > cs {
            segs.extend(ai_segments_for_window(events, cs, ce));
        }
    }

    // Human half: the human tiler already takes the AI-busy complement inside the
    // window (it computes ai_busy_intervals internally and tiles the gaps).
    segs.extend(human_segments_for_window(events, window_start, window_end));

    segs.sort_by_key(|s| (s.start_ms, s.end_ms));
    segs
}

// ===========================================================================
// Viz-session construction (one session_id → one SessionPayload).
// ===========================================================================

/// Build one [`SessionPayload`] from one session's events, in local-day coordinates.
/// Returns `None` if the session has no time span (no events, or a zero-width window).
fn build_viz_session(
    sid: &str,
    sid_events: &[EventRow],
    day_start_ms: i64,
) -> Option<SessionPayload> {
    if sid_events.is_empty() {
        return None;
    }
    // Session start = first event ts. Session END is RESOLVED (M9 WP6.5) — not the bare
    // last event. `resolve_session_end` applies D3 precedence: an authoritative end marker
    // (explicit `WorkspaceClose` / CC `SessionEnd`, via `authoritative_end`) wins; else the
    // max-idle cap bounds a dead session with a stray late event (`SURFACE-2026-07-08-M9-
    // SESSION-TERMINATION-NOT-TRACKED`); else the last event. Events arrive sorted (SQL
    // `ORDER BY ts`); sort defensively.
    let mut tss: Vec<i64> = sid_events.iter().map(|e| e.ts).collect();
    tss.sort_unstable();
    let s_start_ts = *tss.first().unwrap();
    let s_end_ts = resolve_session_end(sid_events, authoritative_end(sid_events));
    if s_end_ts <= s_start_ts {
        // A single-instant session (or one capped to its first event) has no tile-able
        // window.
        return None;
    }

    // Late-event guard: everything past the resolved end is dropped from tiling AND the
    // prompt/tool tallies (stray events after a dead session are not this session's work).
    let clipped: Vec<EventRow> = sid_events
        .iter()
        .filter(|e| e.ts <= s_end_ts)
        .cloned()
        .collect();

    let segs_ms = segments_for_window(&clipped, s_start_ts, s_end_ts);
    let segs: Vec<SegPayload> = segs_ms
        .into_iter()
        .map(|s| SegPayload {
            kind: s.kind,
            start: ts_to_minutes(s.start_ms, day_start_ms),
            end: ts_to_minutes(s.end_ms, day_start_ms),
            // TRUE duration (pre-quantization) — the only correct source for summing.
            dur_ms: (s.end_ms - s.start_ms).max(0),
            label: s.label,
        })
        .collect();

    // Prompt count = UserPromptSubmit events; tool tally = PreToolUse by tool_name.
    // (Over the clipped set — post-end strays excluded.)
    let mut prompts = 0i64;
    let mut tools: HashMap<String, i64> = HashMap::new();
    for e in &clipped {
        match e.event.as_str() {
            "UserPromptSubmit" => prompts += 1,
            "PreToolUse" => {
                let name = e.tool_name.clone().unwrap_or_else(|| "unknown".to_string());
                *tools.entry(name).or_insert(0) += 1;
            }
            _ => {}
        }
    }

    Some(SessionPayload {
        id: sid.chars().take(8).collect(),
        start: ts_to_minutes(s_start_ts, day_start_ms),
        end: ts_to_minutes(s_end_ts, day_start_ms),
        prompts,
        tools,
        segs,
        day_iso: None,
    })
}

/// The minutes credited to a project for sort ordering: AI-execution + subagent time
/// (the "was the machine working for this project" signal — matches `viz_data`'s
/// active+subagent sort key, remapped to the AI family).
fn project_ai_minutes(p: &ProjectPayload) -> i64 {
    // Sum TRUE ms duration (not the minute-quantized `end - start`, which zeroes
    // sub-minute AI work), then convert the total to minutes once.
    let total_ms: i64 = p
        .sessions
        .iter()
        .flat_map(|s| &s.segs)
        .filter(|seg| matches!(seg.kind, Kind::AiDoing | Kind::Subagent | Kind::AiReasoning))
        .map(|seg| seg.dur_ms)
        .sum();
    ms_to_minutes_round(total_ms)
}

// ===========================================================================
// Day builder (mirrors build_day_data, WP3-revised segments).
// ===========================================================================

/// Build the [`DayPayload`] for one local date from that day's pre-filtered events.
/// `project_names` is the (usually empty) explicit-alias map.
pub fn build_day(
    day: NaiveDate,
    events: &[EventRow],
    project_names: &HashMap<String, Vec<String>>,
) -> DayPayload {
    let iso = day.format("%Y-%m-%d").to_string();
    if events.is_empty() {
        return DayPayload {
            label: day_label(day),
            iso,
            projects: Vec::new(),
            hour_range: [6, 23],
            empty: Some(true),
        };
    }
    let day_start_ms = local_midnight_ms(day);

    // Group events by session_id (a session may span cwds if the user `cd`s
    // mid-session, but it stays one logical engagement window).
    let mut events_by_sid: HashMap<String, Vec<EventRow>> = HashMap::new();
    for e in events {
        let sid = if e.session_id.is_empty() {
            "<unknown>".to_string()
        } else {
            e.session_id.clone()
        };
        events_by_sid.entry(sid).or_default().push(e.clone());
    }

    // Partition sessions into projects by the session's MODAL cwd (the cwd most of
    // its events occurred in; ties broken alphabetically for determinism).
    struct AliasBucket {
        cwds: std::collections::BTreeSet<String>,
        sessions: Vec<SessionPayload>,
    }
    let mut by_alias: HashMap<String, AliasBucket> = HashMap::new();

    // Deterministic session iteration order (BTreeMap-like: sort sids).
    let mut sids: Vec<&String> = events_by_sid.keys().collect();
    sids.sort();
    for sid in sids {
        let sid_events = &events_by_sid[sid];
        let modal_cwd = modal_cwd_of(sid_events);
        let alias = resolve_alias(&modal_cwd, project_names);
        let Some(session) = build_viz_session(sid, sid_events, day_start_ms) else {
            continue;
        };
        let bucket = by_alias.entry(alias).or_insert_with(|| AliasBucket {
            cwds: std::collections::BTreeSet::new(),
            sessions: Vec::new(),
        });
        for e in sid_events {
            let cwd = if e.cwd.is_empty() {
                "<unknown>".to_string()
            } else {
                e.cwd.clone()
            };
            bucket.cwds.insert(cwd);
        }
        bucket.sessions.push(session);
    }

    let mut projects: Vec<ProjectPayload> = by_alias
        .into_iter()
        .filter(|(_, b)| !b.sessions.is_empty())
        .map(|(alias, mut b)| {
            b.sessions.sort_by_key(|s| s.start);
            let path = b.cwds.iter().next().cloned().unwrap_or_default();
            ProjectPayload {
                id: alias.clone(),
                alias,
                path,
                sessions: b.sessions,
            }
        })
        .collect();

    // Sort projects by AI+subagent minutes desc, alias asc as tiebreak.
    projects.sort_by(|a, b| {
        project_ai_minutes(b)
            .cmp(&project_ai_minutes(a))
            .then_with(|| a.alias.cmp(&b.alias))
    });

    let hour_range = hour_range_for(&projects);
    DayPayload {
        label: day_label(day),
        iso,
        projects,
        hour_range,
        empty: None,
    }
}

/// The modal cwd for a session's events (most-frequent cwd; ties → alphabetical).
fn modal_cwd_of(sid_events: &[EventRow]) -> String {
    let mut counts: HashMap<String, i64> = HashMap::new();
    for e in sid_events {
        let cwd = if e.cwd.is_empty() {
            "<unknown>".to_string()
        } else {
            e.cwd.clone()
        };
        *counts.entry(cwd).or_insert(0) += 1;
    }
    counts
        .into_iter()
        // max by (count, then alphabetically-smallest cwd wins the tie): pick the
        // entry with the highest count; on a count tie prefer the lexicographically
        // smaller cwd (deterministic — mirrors viz_data's tie rule intent).
        .max_by(|(ca, na), (cb, nb)| na.cmp(nb).then_with(|| cb.cmp(ca)))
        .map(|(cwd, _)| cwd)
        .unwrap_or_else(|| "<unknown>".to_string())
}

/// Adaptive hour window across all sessions: `[min_hour - 1, max_hour + 1]` clamped
/// to `[0, 24]`, fallback `[6, 23]` on no data. Mirrors `viz_data._hour_range_for`.
fn hour_range_for(projects: &[ProjectPayload]) -> [i64; 2] {
    let mut has_data = false;
    let mut min_min = 24 * 60;
    let mut max_min = 0;
    for p in projects {
        for s in &p.sessions {
            has_data = true;
            min_min = min_min.min(s.start);
            max_min = max_min.max(s.end);
        }
    }
    if !has_data {
        return [6, 23];
    }
    let start_hour = (min_min / 60 - 1).max(0);
    let end_hour = ((max_min + 59) / 60 + 1).min(24);
    [start_hour, end_hour]
}

// ===========================================================================
// Range builder (mirrors build_range_data) — cross-day/cross-project union.
// The scope=global engine: any [start_day, end_day] window, per-project breakdown.
// ===========================================================================

/// A range payload over `[start_day, end_day]` inclusive. Aggregates per-day payloads,
/// unions sessions by alias across days (each tagged with `day_iso`), and computes the
/// per-day + global hour windows. `events` is the full window's rows (this fn buckets
/// them by local day internally). Mirrors `build_range_data`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RangePayload {
    pub label: String,
    pub projects: Vec<ProjectPayload>,
    /// `{start, end, day_count}` — inclusive ISO bounds + day count.
    pub meta: RangeMeta,
    /// `{iso: [start_hour, end_hour]}` per day in range.
    pub hour_range_by_day: HashMap<String, [i64; 2]>,
    /// Union of all per-day adaptive ranges.
    pub day_window: [i64; 2],
    /// For a 1-day range: the day's iso (back-compat with the day shape).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iso: Option<String>,
    /// For a 1-day range: the day's hour_range (back-compat).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hour_range: Option<[i64; 2]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RangeMeta {
    pub start: String,
    pub end: String,
    pub day_count: i64,
}

/// Build a [`RangePayload`] over `[start_day, end_day]` inclusive from the window's
/// events. Returns `Err` if `end_day < start_day`.
pub fn build_range(
    start_day: NaiveDate,
    end_day: NaiveDate,
    events: &[EventRow],
    project_names: &HashMap<String, Vec<String>>,
) -> Result<RangePayload, String> {
    if end_day < start_day {
        return Err(format!("end_day {end_day} precedes start_day {start_day}"));
    }
    let day_count = (end_day - start_day).num_days() + 1;
    let days: Vec<NaiveDate> = (0..day_count)
        .map(|i| start_day + Duration::days(i))
        .collect();

    // Bucket events by their local calendar day.
    let mut events_by_day: HashMap<NaiveDate, Vec<EventRow>> = HashMap::new();
    for e in events {
        events_by_day
            .entry(local_date_of(e.ts))
            .or_default()
            .push(e.clone());
    }

    // Per-day payloads.
    let mut per_day: Vec<(NaiveDate, DayPayload)> = Vec::new();
    for &day in &days {
        let empty = Vec::new();
        let day_events = events_by_day.get(&day).unwrap_or(&empty);
        per_day.push((day, build_day(day, day_events, project_names)));
    }

    // Cross-day union: sessions by alias, each tagged with its day_iso.
    struct RangeBucket {
        path: String,
        sessions: Vec<SessionPayload>,
    }
    let mut by_alias: HashMap<String, RangeBucket> = HashMap::new();
    for (_, payload) in &per_day {
        for proj in &payload.projects {
            let bucket = by_alias
                .entry(proj.alias.clone())
                .or_insert_with(|| RangeBucket {
                    path: String::new(),
                    sessions: Vec::new(),
                });
            if bucket.path.is_empty() {
                bucket.path = proj.path.clone();
            }
            for s in &proj.sessions {
                let mut tagged = s.clone();
                tagged.day_iso = Some(payload.iso.clone());
                bucket.sessions.push(tagged);
            }
        }
    }

    let mut projects: Vec<ProjectPayload> = by_alias
        .into_iter()
        .map(|(alias, mut b)| {
            b.sessions.sort_by(|x, y| {
                x.day_iso
                    .cmp(&y.day_iso)
                    .then_with(|| x.start.cmp(&y.start))
            });
            ProjectPayload {
                id: alias.clone(),
                alias,
                path: b.path,
                sessions: b.sessions,
            }
        })
        .collect();
    projects.sort_by(|a, b| {
        project_ai_minutes(b)
            .cmp(&project_ai_minutes(a))
            .then_with(|| a.alias.cmp(&b.alias))
    });

    // Per-day hour ranges + global window.
    let mut hour_range_by_day: HashMap<String, [i64; 2]> = HashMap::new();
    let mut starts: Vec<i64> = Vec::new();
    let mut ends: Vec<i64> = Vec::new();
    for (_, payload) in &per_day {
        hour_range_by_day.insert(payload.iso.clone(), payload.hour_range);
        starts.push(payload.hour_range[0]);
        ends.push(payload.hour_range[1]);
    }
    let day_window = if starts.is_empty() {
        [6, 23]
    } else {
        [*starts.iter().min().unwrap(), *ends.iter().max().unwrap()]
    };

    let start_iso = start_day.format("%Y-%m-%d").to_string();
    let end_iso = end_day.format("%Y-%m-%d").to_string();
    let (label, iso, hour_range) = if day_count == 1 {
        let d = &per_day[0].1;
        (d.label.clone(), Some(d.iso.clone()), Some(d.hour_range))
    } else {
        (
            format!(
                "{} — {}",
                start_day.format("%b %d").to_string().to_uppercase(),
                end_day.format("%b %d").to_string().to_uppercase()
            ),
            None,
            None,
        )
    };

    Ok(RangePayload {
        label,
        projects,
        meta: RangeMeta {
            start: start_iso,
            end: end_iso,
            day_count,
        },
        hour_range_by_day,
        day_window,
        iso,
        hour_range,
    })
}

// ===========================================================================
// Week builder (mirrors build_week_data) — 7-day rollup, per-kind minute totals.
// ===========================================================================

/// Build a [`WeekPayload`] for the ISO week anchored at `monday` from the week's
/// events. Reuses [`build_range`] over the 7-day window, then re-aggregates per-day
/// per-project segment minutes into the rollup shape. Mirrors `build_week_data`,
/// remapped to the 6-kind enum.
pub fn build_week(
    monday: NaiveDate,
    events: &[EventRow],
    project_names: &HashMap<String, Vec<String>>,
) -> Result<WeekPayload, String> {
    let sunday = monday + Duration::days(6);
    let days: Vec<NaiveDate> = (0..7).map(|i| monday + Duration::days(i)).collect();
    let day_labels: Vec<String> = days
        .iter()
        .map(|d| d.format("%a %d").to_string().to_uppercase())
        .collect();
    let day_index: HashMap<String, usize> = days
        .iter()
        .enumerate()
        .map(|(i, d)| (d.format("%Y-%m-%d").to_string(), i))
        .collect();

    let range = build_range(monday, sunday, events, project_names)?;

    // alias → 7-cell rollup. Accumulate per-kind duration at MS precision (`RollupCellMs`),
    // then convert each cell's per-kind total to minutes ONCE (round-half-up) — summing
    // the minute-quantized `seg.end - seg.start` would zero every sub-minute AI segment
    // (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…). Prompts are counts, not durations.
    let mut rollups_ms: HashMap<String, Vec<RollupCellMs>> = HashMap::new();
    for proj in &range.projects {
        let cells = rollups_ms
            .entry(proj.alias.clone())
            .or_insert_with(|| vec![RollupCellMs::default(); 7]);
        for s in &proj.sessions {
            let Some(&i) = s.day_iso.as_ref().and_then(|iso| day_index.get(iso)) else {
                continue;
            };
            cells[i].prompts += s.prompts;
            for seg in &s.segs {
                let d = seg.dur_ms;
                match seg.kind {
                    Kind::AiDoing => cells[i].ai_doing_ms += d,
                    Kind::Subagent => cells[i].subagent_ms += d,
                    Kind::AiReasoning => cells[i].ai_reasoning_ms += d,
                    Kind::Typing => cells[i].typing_ms += d,
                    Kind::Reviewing => cells[i].reviewing_ms += d,
                    Kind::Away => cells[i].away_ms += d,
                }
            }
        }
    }

    // Convert each ms-cell to the minute-unit RollupCell (one round per kind per cell).
    let rollups: HashMap<String, Vec<RollupCell>> = rollups_ms
        .into_iter()
        .map(|(alias, ms_cells)| {
            let cells = ms_cells.into_iter().map(|c| c.into_rollup_cell()).collect();
            (alias, cells)
        })
        .collect();

    let mut projects: Vec<(i64, WeekProject)> = rollups
        .into_iter()
        .map(|(alias, rollup)| {
            let total: i64 = rollup.iter().map(|c| c.ai_doing + c.subagent).sum();
            (
                total,
                WeekProject {
                    id: alias.clone(),
                    alias,
                    rollup,
                },
            )
        })
        .collect();
    projects.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.alias.cmp(&b.1.alias)));

    Ok(WeekPayload {
        label: format!(
            "WEEK {} · {} — {}",
            monday.iso_week().week(),
            monday.format("%b %d").to_string().to_uppercase(),
            sunday.format("%b %d").to_string().to_uppercase()
        ),
        days: day_labels,
        projects: projects.into_iter().map(|(_, p)| p).collect(),
    })
}

// ===========================================================================
// SQLite row → EventRow adapter (P2.2).
// ===========================================================================

/// Read the `events` rows whose `ts` falls in `[start_ms, end_ms)` into
/// [`EventRow`]s, ordered by `ts`. The window is a half-open interval on ts.
///
/// (P2.2 — the SQLite → EventRow adapter. Its consumer is the Phase 3
/// `time_analytics_query` command.)
pub fn rows_in_window(
    conn: &rusqlite::Connection,
    start_ms: i64,
    end_ms: i64,
) -> rusqlite::Result<Vec<EventRow>> {
    let mut stmt = conn.prepare(
        "SELECT ts, session_id, cwd, event, tool_name, agent_type, source, meta
         FROM events WHERE ts >= ?1 AND ts < ?2 ORDER BY ts",
    )?;
    let rows = stmt.query_map([start_ms, end_ms], |r| {
        Ok(EventRow {
            ts: r.get(0)?,
            session_id: r.get(1)?,
            cwd: r.get(2)?,
            event: r.get(3)?,
            tool_name: r.get(4)?,
            agent_type: r.get(5)?,
            source: r.get(6)?,
            meta: r.get(7)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests;
