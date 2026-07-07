//! M9 WP3 — the pure-logic reclassifier (metric-definitions REDESIGN, not a port).
//!
//! Turns the M9 event stream — CC-hook rows (`source="cc-hook"`) + Claudesk-native
//! signal rows (`source="claudesk-native"`), both persisted by [`crate::time_store`]
//! into one `events` table — into typed per-metric structs that the WP4 query layer
//! and WP6 dashboard consume.
//!
//! ## Pure by construction
//! Every function here takes a `&[EventRow]` slice and returns typed values — NO
//! `rusqlite::Connection`, NO DB I/O, NO `AppHandle`. WP4 owns the SQLite read and
//! maps DB rows into [`EventRow`]; this module is the transform. Keeps it unit-testable
//! against hand-built fixtures with no app (mirrors `claude-time`'s `reclassify.py`
//! discipline and `time_store`'s pure-core split).
//!
//! ## REDESIGN, not a port (operator, 2026-07-07)
//! `claude-time`'s `reclassify.py` is the **starting reference**, not the oracle. The
//! metric definitions were re-locked with the operator this session (see
//! `workflow/wip/m9-wp3-reclassifier-redesign.md` → `## Metric Definitions`). This
//! module (Phase 2) implements:
//! - the **AI-activity kinds** ([`Kind::AiDoing`] / [`Kind::Subagent`] /
//!   [`Kind::AiReasoning`]) and the reused interval mechanics ([`tool_intervals`],
//!   [`subagent_intervals`], [`active_bursts`]) that back them;
//! - the redesigned [`Kind`] enum + [`Family`] tag + [`Segment`] shape.
//!
//! The **human-state gap machine** ([`Kind::Typing`] / [`Kind::Reviewing`] /
//! [`Kind::Away`] — focus-fusion, the launch/AwaitingInput capped-working rule, the
//! A5/B5 away rules) is Phase 3 and is NOT built here.
//!
//! ## What "reused unchanged" means
//! `tool_durations_ms` / `tool_intervals` (Pre→Post by `tool_use_id`),
//! `subagent_intervals` / `subagent_durations_ms` (Start→Stop FIFO by `agent_type`),
//! and `active_bursts` / `session_active_ms` (last-UPS-before-Stop anchor) match the
//! operator's intent as-is, so their mechanics are ported verbatim from the reference.
//! `active` is NOT a segment kind in the redesign — `active_bursts`/`session_active_ms`
//! survive only to feed the DERIVED "engaged time" summary metric.
//!
//! ## Dormant until WP4 (the `dead_code` allow)
//! Every public item here is exercised by this module's own tests but has **no
//! non-test caller yet** — WP4 (the segment-model query layer) is the first consumer:
//! it will read the SQLite rows, map them into [`EventRow`], and call this module.
//! Until then the whole surface is "dead code" to the non-test build, so a module-wide
//! `#![allow(dead_code)]` keeps `-D warnings` green during the phased build. Mirrors how
//! `time_store` carried its dormant WP2.5 layer. **Remove this allow at WP4** once the
//! query layer imports the module (the same discipline `time_store` followed).
#![allow(dead_code)]

use std::collections::HashMap;

/// One event row, the reclassifier's input unit. A decoupled view of a
/// `time_store` `events` row — WP4 maps SQLite rows into this; the reclassifier never
/// touches the DB. Field-parallel to the persisted schema
/// (`ts, session_id, cwd, event, tool_name, agent_type, source, meta`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRow {
    /// Epoch-ms event time.
    pub ts: i64,
    /// PTY/CC session id (`cc-N` / hook `session_id`); empty for window-level native rows.
    pub session_id: String,
    /// Attributed project dir (git-root grouping happens on this).
    pub cwd: String,
    /// The event/signal kind — CC-hook event name or native signal name.
    pub event: String,
    /// Tool name on Pre/PostToolUse rows; `None` otherwise.
    pub tool_name: Option<String>,
    /// Agent type on Subagent rows; `None` otherwise.
    pub agent_type: Option<String>,
    /// Row source: `"cc-hook"` or `"claudesk-native"`.
    pub source: String,
    /// JSON blob of event-specific extras (`tool_use_id`, `prompt_length_chars`,
    /// `notification_type`, native `workspace_id`/`surface`/`byte_count`/…), or `None`.
    pub meta: Option<String>,
}

impl EventRow {
    /// Extract a string field from the JSON `meta` blob (the Rust equivalent of
    /// `reclassify.py::_meta_get`). Returns `None` if there is no meta, the meta is
    /// not valid JSON, the key is absent, or the value is not a string.
    pub fn meta_str(&self, key: &str) -> Option<String> {
        let raw = self.meta.as_ref()?;
        let v: serde_json::Value = serde_json::from_str(raw).ok()?;
        v.get(key)?.as_str().map(|s| s.to_string())
    }

    /// Extract an integer field from the JSON `meta` blob. Accepts a JSON number
    /// (`prompt_length_chars`, `byte_count`). Returns `None` on absent/non-numeric.
    pub fn meta_i64(&self, key: &str) -> Option<i64> {
        let raw = self.meta.as_ref()?;
        let v: serde_json::Value = serde_json::from_str(raw).ok()?;
        v.get(key)?.as_i64()
    }
}

/// The redesigned segment `kind` enum (supersedes `claude-time`'s
/// `{active, reading, thinking, away, subagent}`). Locked with the operator
/// 2026-07-07. Two color families ([`Family`]): AI-execution vs human.
///
/// - [`Kind::AiDoing`] — **measured** tool-execution time (`PreToolUse`→`PostToolUse`).
/// - [`Kind::Subagent`] — **measured** subagent runs (`SubagentStart`→`SubagentStop`);
///   carries the `agent_type` as the segment `label`.
/// - [`Kind::AiReasoning`] — **inferred** model-thinking time: AI running but not
///   covered by a tool/subagent interval.
/// - [`Kind::Typing`] — **measured** human PTY input spans (native `KeystrokeActivity`)
///   + editor-active human work. *(Phase 3.)*
/// - [`Kind::Reviewing`] — **inferred** focused-idle "present but not typing" (collapses
///   `claude-time`'s reading+thinking into one honest bucket). *(Phase 3.)*
/// - [`Kind::Away`] — **measured-ish** (threshold over observed focus + keystroke gaps).
///   *(Phase 3.)*
///
/// `active` is deliberately absent — it conflated AI-working + human-watching and is
/// decomposed into the AI kinds (while the AI runs) + human kinds (in the gaps).
/// "Engaged session time" survives as a derived metric ([`session_active_ms`]), not a kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    AiDoing,
    Subagent,
    AiReasoning,
    Typing,
    Reviewing,
    Away,
}

/// The two color families the palette encodes (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-
/// AI-VS-HUMAN`): AI-execution vs human activity. WP6 assigns the exact hues; the
/// reclassifier only tags which family each kind belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Family {
    /// AI-execution: [`Kind::AiDoing`], [`Kind::Subagent`], [`Kind::AiReasoning`].
    Ai,
    /// Human activity: [`Kind::Typing`], [`Kind::Reviewing`], [`Kind::Away`].
    Human,
}

impl Kind {
    /// The color family this kind belongs to (drives the WP6 palette split).
    pub fn family(self) -> Family {
        match self {
            Kind::AiDoing | Kind::Subagent | Kind::AiReasoning => Family::Ai,
            Kind::Typing | Kind::Reviewing | Kind::Away => Family::Human,
        }
    }

    /// The stable string tag for this kind (feeds the WP4 DTO / WP6 legend). Matches
    /// the redesigned `kind` enum documented for the segment-model contract delta.
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::AiDoing => "ai-doing",
            Kind::Subagent => "subagent",
            Kind::AiReasoning => "ai-reasoning",
            Kind::Typing => "typing",
            Kind::Reviewing => "reviewing",
            Kind::Away => "away",
        }
    }
}

/// One classified time segment. Non-overlapping siblings tile a session window in the
/// WP4 segment model. `label` is present only on [`Kind::Subagent`] segments (the
/// `agent_type`, e.g. `"Explore"`), absent on the rest — matching the WP1 contract's
/// `label?` convention.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub kind: Kind,
    /// Segment start, epoch-ms. `start_ms <= end_ms`.
    pub start_ms: i64,
    /// Segment end, epoch-ms.
    pub end_ms: i64,
    /// Present on `Subagent` segments (the `agent_type`); `None` otherwise.
    pub label: Option<String>,
}

// ---------------------------------------------------------------------------
// Tool intervals / durations (reused mechanics — Pre→Post by tool_use_id).
// Ported verbatim from reclassify.py::tool_durations_ms / tool_intervals.
// ---------------------------------------------------------------------------

/// Sum per-tool wall-clock durations across all sessions. Pairs each `PreToolUse` with
/// the `PostToolUse`/`PostToolUseFailure` sharing the same `tool_use_id`; unpaired Pre
/// events (tool still running / session ended mid-tool) are skipped.
///
/// Returns `{tool_name: total_ms}`. Mechanics unchanged from `claude-time`.
pub fn tool_durations_ms(events: &[EventRow]) -> HashMap<String, i64> {
    let mut totals: HashMap<String, i64> = HashMap::new();
    let post_by_tuid = post_by_tool_use_id(events);

    for e in events {
        if e.event != "PreToolUse" {
            continue;
        }
        let Some(tuid) = e.meta_str("tool_use_id") else {
            continue;
        };
        let Some(post) = post_by_tuid.get(&tuid) else {
            continue;
        };
        let tool = e
            .tool_name
            .clone()
            .unwrap_or_else(|| "<unknown>".to_string());
        let duration = (post.ts - e.ts).max(0);
        *totals.entry(tool).or_insert(0) += duration;
    }
    totals
}

/// Per-tool list of `(start_ms, end_ms)` intervals across all sessions. Same pairing as
/// [`tool_durations_ms`]; the interval shape exposes start/end so callers can compute
/// both merged wall-clock and summed effort-time. Reverse/zero pairs (`end <= start`,
/// e.g. clock skew) are skipped. Order follows the `PreToolUse` occurrence order.
///
/// Mechanics unchanged from `claude-time`. Feeds [`Kind::AiDoing`] segmentation.
pub fn tool_intervals(events: &[EventRow]) -> HashMap<String, Vec<(i64, i64)>> {
    let mut intervals: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    let post_by_tuid = post_by_tool_use_id(events);

    for e in events {
        if e.event != "PreToolUse" {
            continue;
        }
        let Some(tuid) = e.meta_str("tool_use_id") else {
            continue;
        };
        let Some(post) = post_by_tuid.get(&tuid) else {
            continue;
        };
        let (s, end) = (e.ts, post.ts);
        if end <= s {
            continue;
        }
        let tool = e
            .tool_name
            .clone()
            .unwrap_or_else(|| "<unknown>".to_string());
        intervals.entry(tool).or_default().push((s, end));
    }
    intervals
}

/// Build a `tool_use_id → last Post event` lookup (Post/PostFailure). Shared by
/// [`tool_durations_ms`] and [`tool_intervals`] (mirrors `reclassify.py`'s
/// `post_by_tuid`). A later Post with the same id overwrites — matching the reference.
fn post_by_tool_use_id(events: &[EventRow]) -> HashMap<String, &EventRow> {
    let mut post_by_tuid: HashMap<String, &EventRow> = HashMap::new();
    for e in events {
        if e.event == "PostToolUse" || e.event == "PostToolUseFailure" {
            if let Some(tuid) = e.meta_str("tool_use_id") {
                post_by_tuid.insert(tuid, e);
            }
        }
    }
    post_by_tuid
}

// ---------------------------------------------------------------------------
// Subagent intervals / durations (reused — Start→Stop FIFO by agent_type/session).
// Ported verbatim from reclassify.py::subagent_intervals / subagent_durations_ms.
// ---------------------------------------------------------------------------

/// Flat list of `(start_ms, end_ms)` subagent intervals across all sessions. Pairs
/// `SubagentStart` with the next `SubagentStop` in the SAME session matching by
/// `agent_type` (chronological FIFO). `end <= start` pairs are skipped. Flat (not
/// per-agent-type) because the metrics layer merges all subagent work; per-type
/// breakdown is a future drill-down. Feeds [`Kind::Subagent`] segmentation.
///
/// Mechanics unchanged from `claude-time`.
pub fn subagent_intervals(events: &[EventRow]) -> Vec<(i64, i64)> {
    let mut pairs: Vec<(i64, i64)> = Vec::new();
    for sid_events in group_by_session(events, is_subagent_event).values() {
        let mut opens: HashMap<String, Vec<&EventRow>> = HashMap::new();
        for e in sid_events {
            let atype = e
                .agent_type
                .clone()
                .unwrap_or_else(|| "<unknown>".to_string());
            match e.event.as_str() {
                "SubagentStart" => opens.entry(atype).or_default().push(e),
                "SubagentStop" => {
                    if let Some(start) = opens.get_mut(&atype).and_then(|v| pop_front(v)) {
                        if e.ts > start.ts {
                            pairs.push((start.ts, e.ts));
                        }
                    }
                }
                _ => {}
            }
        }
    }
    pairs
}

/// Sum per-agent-type subagent wall-clock durations across all sessions. Same FIFO
/// pairing as [`subagent_intervals`], but keeps the per-`agent_type` rollup and does
/// not drop zero/negative durations (they add 0). Returns `{agent_type: total_ms}`.
///
/// Mechanics unchanged from `claude-time`.
pub fn subagent_durations_ms(events: &[EventRow]) -> HashMap<String, i64> {
    let mut totals: HashMap<String, i64> = HashMap::new();
    for sid_events in group_by_session(events, is_subagent_event).values() {
        let mut open_starts: HashMap<String, Vec<&EventRow>> = HashMap::new();
        for e in sid_events {
            let atype = e
                .agent_type
                .clone()
                .unwrap_or_else(|| "<unknown>".to_string());
            match e.event.as_str() {
                "SubagentStart" => open_starts.entry(atype).or_default().push(e),
                "SubagentStop" => {
                    if let Some(start) = open_starts.get_mut(&atype).and_then(|v| pop_front(v)) {
                        let duration = (e.ts - start.ts).max(0);
                        *totals.entry(atype).or_insert(0) += duration;
                    }
                }
                _ => {}
            }
        }
    }
    totals
}

fn is_subagent_event(e: &EventRow) -> bool {
    e.event == "SubagentStart" || e.event == "SubagentStop"
}

// ---------------------------------------------------------------------------
// Active bursts / session-active (reused — last-UPS-before-Stop anchor).
// Feeds the DERIVED "engaged time" metric, NOT a segment kind.
// Ported verbatim from reclassify.py::active_bursts / session_active_ms.
// ---------------------------------------------------------------------------

/// One engaged-with-agent burst: `(last UserPromptSubmit → next Stop)`. Consecutive
/// UPSes before a Stop overwrite the anchor (narrow definition); the superseded ones
/// are recorded as `interrupts`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Burst {
    pub start_ts: i64,
    pub end_ts: i64,
    /// UPS timestamps superseded by a later UPS within the same open burst.
    pub interrupts: Vec<i64>,
}

/// Per-session list of active-burst windows. A burst is one `(UserPromptSubmit, next
/// Stop)` window; when multiple UPSes arrive before a Stop closes the open burst
/// (mid-turn interrupts), the LATEST UPS anchors the burst and the earlier ones are
/// recorded as `interrupts`. Returns `{session_id: [Burst, ...]}`.
///
/// Mechanics unchanged from `claude-time`. NOTE: `active` is not a segment kind in the
/// redesign — this exists to feed [`session_active_ms`] (the derived engaged-time metric).
pub fn active_bursts(events: &[EventRow]) -> HashMap<String, Vec<Burst>> {
    let mut out: HashMap<String, Vec<Burst>> = HashMap::new();
    for (sid, sid_events) in group_by_session(events, |_| true) {
        let mut bursts: Vec<Burst> = Vec::new();
        let mut last_ups_ts: Option<i64> = None;
        let mut interrupts: Vec<i64> = Vec::new();
        for e in sid_events {
            match e.event.as_str() {
                "UserPromptSubmit" => {
                    if let Some(prev) = last_ups_ts {
                        // Mid-turn UPS — record the previous anchor as an interrupt,
                        // advance the anchor to the new one.
                        interrupts.push(prev);
                    }
                    last_ups_ts = Some(e.ts);
                }
                "Stop" => {
                    if let Some(start) = last_ups_ts.take() {
                        bursts.push(Burst {
                            start_ts: start,
                            end_ts: e.ts,
                            interrupts: std::mem::take(&mut interrupts),
                        });
                    }
                }
                _ => {}
            }
        }
        out.insert(sid, bursts);
    }
    out
}

/// Per-session sum of `(last_UPS → next Stop)` windows — the derived "engaged in this
/// session" metric. Consumes [`active_bursts`] so the two stay consistent by
/// construction. Returns `{session_id: total_ms}`.
///
/// Mechanics unchanged from `claude-time`.
pub fn session_active_ms(events: &[EventRow]) -> HashMap<String, i64> {
    active_bursts(events)
        .into_iter()
        .map(|(sid, bursts)| {
            let total = bursts.iter().map(|b| (b.end_ts - b.start_ts).max(0)).sum();
            (sid, total)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// AI-kind segmentation (the redesign's new work for Phase 2).
// ---------------------------------------------------------------------------

/// Build the AI-activity segments for one session's engaged burst window.
///
/// Within `[burst_start, burst_end]` (a `UserPromptSubmit`→`Stop` span, i.e. the AI is
/// running), tile the time into:
/// - [`Kind::Subagent`] segments (from [`subagent_intervals`] overlapping the window) —
///   labeled with the `agent_type`;
/// - [`Kind::AiDoing`] segments (from [`tool_intervals`] overlapping the window);
/// - [`Kind::AiReasoning`] segments filling the residual — AI running but not covered by
///   a tool or subagent interval (the inferred model-thinking time).
///
/// Overlapping tool/subagent intervals are merged into an "AI busy" cover; the gaps
/// between the cover and the burst window become `ai-reasoning`. Subagent intervals take
/// precedence over tool intervals where they overlap (a tool call inside a subagent is
/// the subagent's work). The returned segments are sorted by `start_ms` and clipped to
/// the burst window.
///
/// This is the Phase-2 AI half of the timeline; the human-gap half (between bursts) is
/// Phase 3.
pub fn ai_segments_for_window(
    events: &[EventRow],
    window_start: i64,
    window_end: i64,
) -> Vec<Segment> {
    if window_end <= window_start {
        return Vec::new();
    }

    // Subagent intervals (with labels), clipped to the window. Subagent wins over tool.
    let mut labeled_sub: Vec<(i64, i64, Option<String>)> = Vec::new();
    for sid_events in group_by_session(events, is_subagent_event).values() {
        let mut opens: HashMap<String, Vec<&EventRow>> = HashMap::new();
        for e in sid_events {
            let atype = e
                .agent_type
                .clone()
                .unwrap_or_else(|| "<unknown>".to_string());
            match e.event.as_str() {
                "SubagentStart" => opens.entry(atype).or_default().push(e),
                "SubagentStop" => {
                    if let Some(start) = opens.get_mut(&atype).and_then(|v| pop_front(v)) {
                        if e.ts > start.ts {
                            if let Some(clip) = clip(start.ts, e.ts, window_start, window_end) {
                                labeled_sub.push((clip.0, clip.1, Some(atype.clone())));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Tool intervals, clipped, EXCLUDING spans already covered by a subagent.
    let sub_spans: Vec<(i64, i64)> = labeled_sub.iter().map(|(s, e, _)| (*s, *e)).collect();
    let mut tool_segs: Vec<(i64, i64)> = Vec::new();
    for intervals in tool_intervals(events).values() {
        for &(s, e) in intervals {
            if let Some((cs, ce)) = clip(s, e, window_start, window_end) {
                tool_segs.extend(subtract_spans(cs, ce, &sub_spans));
            }
        }
    }

    // Assemble labeled segments: subagent (label) + ai-doing (no label).
    let mut segs: Vec<Segment> = Vec::new();
    for (s, e, label) in labeled_sub {
        segs.push(Segment {
            kind: Kind::Subagent,
            start_ms: s,
            end_ms: e,
            label,
        });
    }
    for (s, e) in tool_segs {
        segs.push(Segment {
            kind: Kind::AiDoing,
            start_ms: s,
            end_ms: e,
            label: None,
        });
    }

    // ai-reasoning fills the residual (window minus the AI-busy cover).
    let mut busy: Vec<(i64, i64)> = segs.iter().map(|s| (s.start_ms, s.end_ms)).collect();
    for (rs, re) in complement(window_start, window_end, &mut busy) {
        segs.push(Segment {
            kind: Kind::AiReasoning,
            start_ms: rs,
            end_ms: re,
            label: None,
        });
    }

    segs.sort_by_key(|s| (s.start_ms, s.end_ms));
    segs
}

// ---------------------------------------------------------------------------
// Small pure helpers (interval algebra + session grouping).
// ---------------------------------------------------------------------------

/// Group events by `session_id` (skipping rows with an empty session id), keeping each
/// group sorted by `ts`. `keep` filters which events are grouped. Defensive sort — the
/// caller may not have ordered the rows (mirrors `reclassify.py`).
fn group_by_session(
    events: &[EventRow],
    keep: impl Fn(&EventRow) -> bool,
) -> HashMap<String, Vec<&EventRow>> {
    let mut by_session: HashMap<String, Vec<&EventRow>> = HashMap::new();
    for e in events {
        if keep(e) && !e.session_id.is_empty() {
            by_session.entry(e.session_id.clone()).or_default().push(e);
        }
    }
    for v in by_session.values_mut() {
        v.sort_by_key(|e| e.ts);
    }
    by_session
}

/// Pop the front element of a Vec used as a FIFO queue (the `list.pop(0)` equivalent).
fn pop_front<'a>(v: &mut Vec<&'a EventRow>) -> Option<&'a EventRow> {
    if v.is_empty() {
        None
    } else {
        Some(v.remove(0))
    }
}

/// Clip `[s, e]` to `[lo, hi]`; returns `None` if the clipped span is empty.
fn clip(s: i64, e: i64, lo: i64, hi: i64) -> Option<(i64, i64)> {
    let cs = s.max(lo);
    let ce = e.min(hi);
    if ce > cs {
        Some((cs, ce))
    } else {
        None
    }
}

/// Subtract a set of spans from `[s, e]`, returning the remaining sub-spans (sorted).
/// Used to carve subagent-covered time out of a tool interval.
fn subtract_spans(s: i64, e: i64, minus: &[(i64, i64)]) -> Vec<(i64, i64)> {
    let mut result = vec![(s, e)];
    for &(ms, me) in minus {
        let mut next: Vec<(i64, i64)> = Vec::new();
        for (rs, re) in result {
            // Non-overlapping → keep whole.
            if me <= rs || ms >= re {
                next.push((rs, re));
                continue;
            }
            // Left remainder.
            if ms > rs {
                next.push((rs, ms.min(re)));
            }
            // Right remainder.
            if me < re {
                next.push((me.max(rs), re));
            }
        }
        result = next;
    }
    result.retain(|(a, b)| b > a);
    result.sort();
    result
}

/// The complement of a set of `busy` spans within `[lo, hi]` — the gaps not covered by
/// any busy span (merged + sorted). `busy` is sorted in place.
fn complement(lo: i64, hi: i64, busy: &mut [(i64, i64)]) -> Vec<(i64, i64)> {
    busy.sort();
    let mut gaps: Vec<(i64, i64)> = Vec::new();
    let mut cursor = lo;
    for &(s, e) in busy.iter() {
        let s = s.max(lo);
        let e = e.min(hi);
        if s > cursor {
            gaps.push((cursor, s));
        }
        if e > cursor {
            cursor = e;
        }
    }
    if cursor < hi {
        gaps.push((cursor, hi));
    }
    gaps
}

// ===========================================================================
// Phase 3 — the human-state gap machine (the novel redesign core).
//
// When the AI is idle (no tool/subagent/burst covers the moment), the interval is a
// HUMAN gap and gets classified here. Focus/blur is consulted ONLY in these gaps —
// while the AI is running, the interval is an AI kind regardless of window focus (the
// structural realization from the operator's scenario walk-through, 2026-07-07).
// ===========================================================================

/// Hardcoded thresholds (operator-locked 2026-07-07 — NO user settings; design-prior
/// `explicit-selectable-mode-over-inferred-mode`, risk-surface-vs-value). Tune by
/// recompile if ever needed; a setting is bug surface the operator explicitly declined.
pub mod constants {
    /// The reset-on-activity silence cap. A launch / AwaitingInput blur credits "working"
    /// only until this much *total silence* (no keystroke, no hook event) elapses — then
    /// the operator is judged AWAY (the "popped Sublime then pulled into a meeting" case).
    /// Any activity resets the timer. Operator-locked at 10 min.
    pub const SILENCE_CAP_MS: i64 = 10 * 60 * 1000;

    /// Focused-but-dead-quiet → AWAY threshold (scenario A5: window left in front, operator
    /// gone) and bare-blur-quiet → AWAY (B5). Leaned to match the silence cap (10 min): a
    /// gap quiet this long with no working-credit is away.
    pub const AWAY_THRESHOLD_MS: i64 = 10 * 60 * 1000;

    /// How long before a `WindowBlur` a launch signal (native `ExternalLaunch` or a
    /// cc-hook `open`/Bash) still counts as "this blur is because the operator went to
    /// the launched tool" (scenario B1/B2). A short window — the launch should immediately
    /// precede the blur. Leaned to 30s.
    pub const BLUR_LAUNCH_CORRELATION_MS: i64 = 30 * 1000;

    /// Typing-rate fallback (chars/sec) used ONLY when a gap has no native
    /// `KeystrokeActivity` coverage (pre-capture sessions / native signals off). With
    /// native rows present, real keystroke timestamps supersede this. `claude-time`'s value.
    pub const CHARS_PER_SEC_FALLBACK: f64 = 6.0;
}

/// The human states a gap can be classified as (the [`Kind`] subset produced by the gap
/// machine). Kept as a distinct enum from [`Kind`] at the classify boundary for clarity;
/// mapped to [`Kind`] when emitting [`Segment`]s.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HumanState {
    /// Measured PTY input (native `KeystrokeActivity`) or editor-active human work.
    Typing,
    /// Present but not typing (focused-idle under the away threshold; or working-credit
    /// from a launch/AwaitingInput that hasn't hit the silence cap).
    Reviewing,
    /// Away — A5 (focused dead-quiet), B5 (bare blur silent), or expired working cap.
    Away,
}

impl HumanState {
    fn to_kind(self) -> Kind {
        match self {
            HumanState::Typing => Kind::Typing,
            HumanState::Reviewing => Kind::Reviewing,
            HumanState::Away => Kind::Away,
        }
    }
}

/// The union of "AI is running" intervals, merged across all sessions. The AI is busy
/// during any tool interval, subagent interval, OR engaged burst (`last-UPS → Stop`).
/// The COMPLEMENT of this union (within a day/session window) is the set of human gaps
/// the gap machine classifies. (P3.1.)
pub fn ai_busy_intervals(events: &[EventRow]) -> Vec<(i64, i64)> {
    let mut spans: Vec<(i64, i64)> = Vec::new();
    for intervals in tool_intervals(events).values() {
        spans.extend(intervals.iter().copied());
    }
    spans.extend(subagent_intervals(events));
    for bursts in active_bursts(events).values() {
        for b in bursts {
            if b.end_ts > b.start_ts {
                spans.push((b.start_ts, b.end_ts));
            }
        }
    }
    merge_spans(&mut spans)
}

/// The intervals during which CC was AwaitingInput — from a `Notification` row whose
/// `notification_type` means "blocked on the user", until the next event in that session
/// that resumes it (`PostToolUse` / `Stop` / `UserPromptSubmit`), or the last known ts.
/// Uses [`crate::status_broadcaster::notification_awaits_input`] as the SINGLE SOURCE OF
/// TRUTH so the retrospective analytics and the live dot agree on "was CC blocked". (P3.2.)
///
/// NOTE the honest-fallback nuance: `notification_awaits_input(None) == true` (an absent
/// type is treated as input-needed, matching the live dot). For a historical row that is
/// the same conservative choice — an unrecognized/absent notification is assumed to be a
/// real prompt.
pub fn awaiting_input_spans(events: &[EventRow]) -> Vec<(i64, i64)> {
    use crate::status_broadcaster::notification_awaits_input;
    let mut spans: Vec<(i64, i64)> = Vec::new();
    for sid_events in group_by_session(events, |_| true).values() {
        let mut open: Option<i64> = None;
        for e in sid_events {
            match e.event.as_str() {
                "Notification" => {
                    let ntype = e.meta_str("notification_type");
                    if notification_awaits_input(ntype.as_deref()) {
                        if open.is_none() {
                            open = Some(e.ts);
                        }
                    } else if let Some(start) = open.take() {
                        // An informational Notification arriving mid-await resolves it.
                        if e.ts > start {
                            spans.push((start, e.ts));
                        }
                    }
                }
                // Any resume signal closes an open AwaitingInput span.
                "PostToolUse" | "Stop" | "UserPromptSubmit" => {
                    if let Some(start) = open.take() {
                        if e.ts > start {
                            spans.push((start, e.ts));
                        }
                    }
                }
                _ => {}
            }
        }
        // An await still open at the session's last event: leave open-ended (no close).
        // The gap machine treats "inside an await span" via point-membership, so an
        // unclosed await simply has no upper bound here and is handled by the caller's
        // window clamp. We drop it (can't bound it) — conservative.
    }
    merge_spans(&mut spans)
}

/// Timestamps of "external launch" marks — signals that a subsequent `WindowBlur` is the
/// operator going to a launched tool, NOT leaving. Two sources (per the split-launch
/// picture, WP2.5 doc §2): native `ExternalLaunch` rows (Claudesk-initiated) AND cc-hook
/// `PostToolUse` rows whose tool is `Bash` (CC ran `open`/opened a browser). Computed
/// from BOTH streams — `preceded_by_launch` on blur rows is NOT trusted (always false in
/// current data). (P3.3.)
pub fn launch_marks(events: &[EventRow]) -> Vec<i64> {
    let mut marks: Vec<i64> = Vec::new();
    for e in events {
        let is_native_launch = e.source == "claudesk-native" && e.event == "ExternalLaunch";
        let is_cc_open = e.source == "cc-hook"
            && e.event == "PostToolUse"
            && e.tool_name.as_deref() == Some("Bash");
        if is_native_launch || is_cc_open {
            marks.push(e.ts);
        }
    }
    marks.sort_unstable();
    marks
}

/// Timestamps of all "activity" marks — any keystroke or hook event that proves the
/// operator (or the machine on their behalf) is still doing something. Used to RESET the
/// silence cap: as long as activity keeps arriving, working-credit is sustained; a
/// `SILENCE_CAP_MS` quiet stretch ends it. (P3.4 input.)
///
/// Activity = native `KeystrokeActivity` rows + every cc-hook event (the agent doing
/// anything on the operator's turn is a sign they're engaged, not gone).
pub fn activity_marks(events: &[EventRow]) -> Vec<i64> {
    let mut marks: Vec<i64> = Vec::new();
    for e in events {
        let is_keystroke = e.source == "claudesk-native" && e.event == "KeystrokeActivity";
        let is_hook = e.source == "cc-hook";
        if is_keystroke || is_hook {
            marks.push(e.ts);
        }
    }
    marks.sort_unstable();
    marks
}

/// Context the gap machine needs, precomputed once per event set so per-gap
/// classification is cheap. Built by [`GapContext::build`].
pub struct GapContext {
    awaiting: Vec<(i64, i64)>,
    launches: Vec<i64>,
    activity: Vec<i64>,
    /// Timestamps of native `KeystrokeActivity` rows (real PTY input moments).
    keystrokes: Vec<i64>,
}

impl GapContext {
    /// Precompute the awaiting-input spans, launch marks, activity marks, and keystroke
    /// timestamps for a full event set.
    pub fn build(events: &[EventRow]) -> Self {
        let keystrokes = events
            .iter()
            .filter(|e| e.source == "claudesk-native" && e.event == "KeystrokeActivity")
            .map(|e| e.ts)
            .collect();
        GapContext {
            awaiting: awaiting_input_spans(events),
            launches: launch_marks(events),
            activity: activity_marks(events),
            keystrokes,
        }
    }

    /// Whether any launch mark falls within `[gap_start - BLUR_LAUNCH_CORRELATION_MS,
    /// gap_start]` — i.e. a launch immediately preceded the gap's start (a blur/gap that
    /// began because the operator went to a launched tool). (P3.3.)
    fn launch_precedes(&self, gap_start: i64) -> bool {
        let lo = gap_start - constants::BLUR_LAUNCH_CORRELATION_MS;
        self.launches.iter().any(|&m| m >= lo && m <= gap_start)
    }

    /// Whether CC is AwaitingInput at `ts` (point-membership in an await span).
    fn awaiting_at(&self, ts: i64) -> bool {
        self.awaiting.iter().any(|&(s, e)| ts >= s && ts < e)
    }

    /// The longest stretch of TOTAL SILENCE (no activity mark) inside `[start, end]`,
    /// counting the leading run from `start` to the first activity mark and every gap
    /// between consecutive marks. Returns the max silent run. If there is NO activity in
    /// the interval, the whole `[start, end]` is silent. (P3.4.)
    fn longest_silence(&self, start: i64, end: i64) -> i64 {
        let inside: Vec<i64> = self
            .activity
            .iter()
            .copied()
            .filter(|&m| m > start && m < end)
            .collect();
        if inside.is_empty() {
            return (end - start).max(0);
        }
        let mut max_run = (inside[0] - start).max(0); // leading run
        for w in inside.windows(2) {
            max_run = max_run.max(w[1] - w[0]);
        }
        max_run = max_run.max(end - *inside.last().unwrap()); // trailing run
        max_run
    }

    /// Whether the gap contains any real PTY keystroke activity → the operator is typing
    /// (measured). (P3.5 branch 1.)
    fn has_keystrokes(&self, start: i64, end: i64) -> bool {
        self.keystrokes.iter().any(|&ts| ts >= start && ts < end)
    }
}

/// Classify ONE AI-idle gap `[gap_start, gap_end]` into a [`HumanState`], per the locked
/// 5-branch machine (operator 2026-07-07). `surface_editor` is whether the active
/// right-panel surface during the gap is the editor (from `ActiveSurface` rows — the
/// caller resolves it). (P3.5.)
///
/// Branch order (first match wins):
/// 1. keystrokes present, OR editor-active → **Typing** (measured human work).
/// 2. a launch preceded the gap, OR CC is AwaitingInput in the gap → **capped-working**:
///    Reviewing until `SILENCE_CAP_MS` of total silence, then Away.
/// 3. no working-credit + total silence > `AWAY_THRESHOLD_MS` → **Away** (A5/B5).
/// 4. otherwise (short, present, idle) → **Reviewing** (A4/A6 — fused/inferred).
pub fn classify_gap(
    ctx: &GapContext,
    gap_start: i64,
    gap_end: i64,
    surface_editor: bool,
) -> HumanState {
    // Branch 1: measured typing / editor-active human work.
    if ctx.has_keystrokes(gap_start, gap_end) || surface_editor {
        return HumanState::Typing;
    }

    // Branch 2: launch/AwaitingInput → capped-working (reset-on-activity).
    let working_credit = ctx.launch_precedes(gap_start)
        || ctx.awaiting_at(gap_start)
        || ctx
            .awaiting
            .iter()
            .any(|&(s, _)| s >= gap_start && s < gap_end);
    if working_credit {
        // Working until SILENCE_CAP_MS of total silence elapses; then away.
        if ctx.longest_silence(gap_start, gap_end) > constants::SILENCE_CAP_MS {
            return HumanState::Away;
        }
        return HumanState::Reviewing;
    }

    // Branch 3: no working-credit + long dead-quiet → away (A5 focused / B5 blurred).
    if ctx.longest_silence(gap_start, gap_end) > constants::AWAY_THRESHOLD_MS {
        return HumanState::Away;
    }

    // Branch 4: short, present, idle → reviewing (reading/thinking fused — inferred).
    HumanState::Reviewing
}

/// Whether the active right-panel surface at `ts` is the editor, from the most recent
/// `ActiveSurface`/focus native row at-or-before `ts` whose `meta.surface == "editor"`.
/// A gap with editor-active surface + no keystrokes is the operator READING code — the
/// dominant idle state — which the machine measures as Typing-family human work (per the
/// locked definition: "editor-active + no PTY keystrokes" is the reading signal). (P3.5.)
pub fn surface_is_editor_at(events: &[EventRow], ts: i64) -> bool {
    let mut latest: Option<(i64, String)> = None;
    for e in events {
        if e.source != "claudesk-native" {
            continue;
        }
        if e.ts > ts {
            continue;
        }
        if matches!(
            e.event.as_str(),
            "ActiveSurface" | "WindowFocus" | "WindowBlur"
        ) {
            if let Some(surface) = e.meta_str("surface") {
                match &latest {
                    Some((prev_ts, _)) if *prev_ts >= e.ts => {}
                    _ => latest = Some((e.ts, surface)),
                }
            }
        }
    }
    matches!(latest, Some((_, s)) if s == "editor")
}

/// Merge overlapping/adjacent spans into a sorted, non-overlapping cover. `spans` is
/// sorted in place. Shared by [`ai_busy_intervals`] / [`awaiting_input_spans`].
fn merge_spans(spans: &mut Vec<(i64, i64)>) -> Vec<(i64, i64)> {
    spans.retain(|(s, e)| e > s);
    spans.sort();
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for &(s, e) in spans.iter() {
        if let Some(last) = merged.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        merged.push((s, e));
    }
    merged
}

/// The full human-gap tiling for a session/day window `[window_start, window_end]`:
/// compute the AI-busy union, take its complement inside the window (the human gaps), and
/// classify each gap into a [`Kind::Typing`] / [`Kind::Reviewing`] / [`Kind::Away`]
/// segment. This is the human half of the timeline; [`ai_segments_for_window`] builds the
/// AI half over each AI-busy window. (P3.5 entry point.)
pub fn human_segments_for_window(
    events: &[EventRow],
    window_start: i64,
    window_end: i64,
) -> Vec<Segment> {
    if window_end <= window_start {
        return Vec::new();
    }
    let ctx = GapContext::build(events);
    let mut busy = ai_busy_intervals(events);
    let gaps = complement(window_start, window_end, &mut busy);

    gaps.into_iter()
        .map(|(gs, ge)| {
            let surface_editor = surface_is_editor_at(events, gs);
            let state = classify_gap(&ctx, gs, ge, surface_editor);
            Segment {
                kind: state.to_kind(),
                start_ms: gs,
                end_ms: ge,
                label: None,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
