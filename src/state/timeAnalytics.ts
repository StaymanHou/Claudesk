// M9 WP4 — the frontend mirror of the backend `time_store::query` segment-model DTOs
// + a typed wrapper around the `time_analytics_query` command. snake_case field names
// VERBATIM (the IPC-DTO casing convention, SURFACE-2026-06-21: Tauri does NOT
// camelCase-convert command payloads, so the TS type must mirror the serde field
// names exactly — the backend `dto_serde_shape_is_snake_case_and_kind_is_kebab_tag`
// test pins those keys).
//
// This is the SEAM WP6's dashboard tab consumes — WP4 ships the binding (types +
// invoke helper) with NO UI; WP6 owns the render. Times are integer minutes-from-
// LOCAL-midnight (the frozen-contract coordinate system). Segment `kind` is the WP3
// 6-kind kebab tag.

import { invoke } from "@tauri-apps/api/core";

/** The WP3 segment kinds (kebab tags, `Kind::as_str()`). Two color families:
 *  AI-execution (`ai-doing`/`subagent`/`ai-reasoning`) vs human (`typing`/`reviewing`/
 *  `away`) — WP6 assigns the palette. */
export type SegKind =
  | "ai-doing"
  | "subagent"
  | "ai-reasoning"
  | "typing"
  | "reviewing"
  | "away";

/** One tiled segment. `start`/`end` are minutes-from-local-midnight (`start <= end`) —
 *  RENDER POSITION only, quantized to the minute. `dur_ms` is the segment's TRUE
 *  duration in ms (pre-quantization) — the only correct source for summing per-kind
 *  duration, since AI tool-execution is sub-minute and `end - start` floors it to zero
 *  (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…). `label` is present only on
 *  `subagent` segments (the `agent_type`). */
export interface SegPayload {
  kind: SegKind;
  start: number;
  end: number;
  dur_ms: number;
  label?: string;
}

/** One dashboard session (one `session_id`'s engagement window, tiled into segs). */
export interface SessionPayload {
  id: string;
  start: number;
  end: number;
  prompts: number;
  /** tool-name → count. */
  tools: Record<string, number>;
  segs: SegPayload[];
  /** `"YYYY-MM-DD"` — present on range/week payloads (multi-day), absent on a bare day. */
  day_iso?: string;
}

/** One project row — a resolved alias grouping N sessions. */
export interface ProjectPayload {
  id: string;
  alias: string;
  path: string;
  sessions: SessionPayload[];
}

/** One project's per-day rollup cell (per-kind minute totals + prompts). */
export interface RollupCell {
  ai_doing: number;
  subagent: number;
  ai_reasoning: number;
  typing: number;
  reviewing: number;
  away: number;
  prompts: number;
}

/** `{start, end, day_count}` — a range's inclusive ISO bounds + day count. */
export interface RangeMeta {
  start: string;
  end: string;
  day_count: number;
}

/** A range payload (day / custom window). For a 1-day range, `iso` + `hour_range` are
 *  also present (back-compat with the single-day shape). */
export interface RangePayload {
  label: string;
  projects: ProjectPayload[];
  meta: RangeMeta;
  hour_range_by_day: Record<string, [number, number]>;
  day_window: [number, number];
  iso?: string;
  hour_range?: [number, number];
}

/** A week rollup payload (7 cells per project, Mon→Sun). */
export interface WeekPayload {
  label: string;
  days: string[];
  projects: { id: string; alias: string; rollup: RollupCell[] }[];
}

// ── M9 WP6c-1 — window-level AGGREGATE metrics (mirror of `time_store::query`'s
// MetricsPayload). All duration fields are RAW milliseconds (`*_ms`) — NOT quantized;
// the panels format ms → display units at render (so sub-minute AI work never floors to
// zero). snake_case VERBATIM (pinned by the backend `metrics_dto_serde_shape_is_snake_case`
// test). Re-derived onto WP3's 6-kind model: `ai_agent` folds in ai-reasoning; `human` =
// typing + reviewing (away carried separately); `blocking.human_blocking_agent_ms` =
// reviewing only. See the WP6c spec + research in workflow (SURFACE-2026-07-06-COLOR-
// FAMILIES / -RECLASSIFIER-IS-REDESIGN).

/** `{start, end, day_count}` — the metrics window's inclusive ISO bounds + day count. */
export interface MetricsWindowMeta {
  start: string;
  end: string;
  day_count: number;
}

/** Engaged-session time. `wallclock_ms` = merged/union (elapsed); `effort_ms` = summed
 *  per-session (parallel adds up); `multiplier` = effort ÷ wallclock (parallelism
 *  compression), 0 when wallclock 0; `session_count` = sessions with >0 engaged ms. */
export interface EngagedSession {
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
  session_count: number;
}

/** The subagent SUBSET of AI-agent activity. */
export interface SubagentMetric {
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
}

/** AI-agent activity = the AI family `{ai-doing, subagent, ai-reasoning}` (ai-reasoning
 *  folds in; subagent broken out as a subset). */
export interface AiAgentMetric {
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
  subagent: SubagentMetric;
}

/** One tool's wall-clock/effort/multiplier (for `tool_call.top`). */
export interface ToolSummary {
  name: string;
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
}

/** Tool-execution time (the `ai-doing` measured intervals). `top` = top-5 by effort. */
export interface ToolCallMetric {
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
  top: ToolSummary[];
}

/** Human activity = `typing + reviewing` (one brain → multiplier 1.0, effort == wallclock).
 *  `away_ms` is carried for the HeadlineCard Away tile but is NOT part of wallclock/effort. */
export interface HumanMetric {
  wallclock_ms: number;
  effort_ms: number;
  multiplier: number;
  typing_ms: number;
  reviewing_ms: number;
  away_ms: number;
}

/** One engaged-session concurrency stratum. `k` = # simultaneously-engaged sessions;
 *  `effort_ms` = `wallclock_ms × k`; the k=4 row aggregates k≥4 (`is_plus`). */
export interface ConcurrencyStratum {
  k: number;
  wallclock_ms: number;
  effort_ms: number;
  /** Present + true only on the k=4 (k≥4) stratum. */
  is_plus?: boolean;
}

/** Blocking metrics. `human_blocking_agent_ms` = reviewing (human reading = agent idle);
 *  `agent_blocking_human_ms` = AI wallclock (== `ai_agent.wallclock_ms`). */
export interface BlockingMetric {
  human_blocking_agent_ms: number;
  agent_blocking_human_ms: number;
}

/** The window-level aggregate-metrics payload (WP6c-1). Window-global (no per-project
 *  rollup — per-project lives in RangePayload). All durations RAW ms. */
export interface MetricsPayload {
  window: MetricsWindowMeta;
  engaged_session: EngagedSession;
  ai_agent: AiAgentMetric;
  tool_call: ToolCallMetric;
  human: HumanMetric;
  /** Exactly 4 strata: k=1, k=2, k=3, k=4+ (`is_plus`). */
  concurrency: ConcurrencyStratum[];
  blocking: BlockingMetric;
}

// ── M9 WP6c-2 — A/B comparison (mirror of `time_store::query`'s ComparisonPayload) ──────
// `{a, b, meta}` — each side a full `MetricsPayload` (under `metrics`) + its range label.
// NO `deltas` field: CompareView recomputes every delta FE-side from the two metrics trees
// (WP6c-research; pinned backend-side by `comparison_dto_serde_shape_has_no_deltas`).
// snake_case VERBATIM (the project IPC convention).

/** One side of an A/B comparison: the side's aggregate metrics + its range label. */
export interface CompareSide {
  metrics: MetricsPayload;
  range: MetricsWindowMeta;
}

/** A/B comparison window bounds + day counts (the CompareView header + length-mismatch
 *  banner read these). ISO `YYYY-MM-DD`, inclusive. */
export interface ComparisonMeta {
  a_start: string;
  a_end: string;
  b_start: string;
  b_end: string;
  a_day_count: number;
  b_day_count: number;
}

/** The A/B comparison payload (WP6c-2). `{a, b, meta}` — NO `deltas`. */
export interface ComparisonPayload {
  a: CompareSide;
  b: CompareSide;
  meta: ComparisonMeta;
}

/** A named comparison preset. `today_vs_trailing` = today vs the trailing 7-day baseline. */
export type ComparePreset = "wow" | "mom" | "today_vs_trailing";

/** The A/B window selector sent inside a `{kind:"compare"}` query. `preset` → backend
 *  resolves the bounds from today (local); `custom` → two explicit epoch-ms spans. */
export type CompareSpec =
  | { preset: ComparePreset }
  | {
      custom: {
        a: { start_ms: number; end_ms: number };
        b: { start_ms: number; end_ms: number };
      };
    };

/** The internally-tagged result of `time_analytics_query` — a range (day/custom), a week
 *  rollup, (WP6c-1) the window-level aggregate metrics, or (WP6c-2) the A/B comparison.
 *  Branch on `kind`. */
export type TimeAnalyticsResult =
  | ({ kind: "range" } & RangePayload)
  | ({ kind: "week" } & WeekPayload)
  | ({ kind: "metrics" } & MetricsPayload)
  | ({ kind: "compare" } & ComparisonPayload);

/** The window a query covers (the tagged union the command deserializes). `day` =
 *  today (local); `week` = an ISO week — the one containing today by default, or (WP6b-3
 *  Week-nav) the week containing the optional `monday` anchor (`"YYYY-MM-DD"`, snapped to
 *  its Monday backend-side) so the Week view can step to a PAST week; `custom` = an
 *  explicit epoch-ms span; `metrics` (WP6c-1) = the aggregate-metrics query, wrapping an
 *  inner day/week/custom window selector. */
export type QueryWindow =
  | { kind: "day" }
  | { kind: "week"; monday?: string }
  | { kind: "custom"; start_ms: number; end_ms: number }
  | { kind: "metrics"; window: QueryWindow }
  | { kind: "compare"; spec: CompareSpec };

/** The query scope. v1 implements only `"global"` (all-projects, per-project
 *  breakdown — the resolved M9 WP4 scope); the param exists for forward-compat. */
export type QueryScope = "global";

/**
 * Fetch the segment-model payload for a window. Thin typed wrapper over the
 * `time_analytics_query` Tauri command (WP4). WP6's dashboard tab calls this and
 * branches on `result.kind`. On a fresh install the write-gate is OFF (WP2 default)
 * so the payload is empty — that is correct; WP5's toggle turns writing on.
 */
export async function queryTimeAnalytics(
  window: QueryWindow,
  scope: QueryScope = "global",
): Promise<TimeAnalyticsResult> {
  return invoke<TimeAnalyticsResult>("time_analytics_query", { scope, window });
}

// ── M9 WP5 — tracking toggle (universal-vs-workflow-coupled feature flag) ──────────
//
// The toggle gates BOTH write paths (CC-hook + native signals); default OFF. The picker
// checkbox is the surface: it seeds from `time_get_tracking_enabled`, stays in sync via
// the `time-tracking-enabled` broadcast (a future surface — the WP6 empty-state — reads
// the same signal), and sets via `time_set_tracking_enabled`. Mirrors the cc-permission-
// mode event/command trio in `cc/permissionMode.ts`. The event-name string is pinned on
// the backend by `time_tracking_enabled_event_name_is_stable`.

/** Broadcast fired when the tracking toggle changes (backend `TIME_TRACKING_ENABLED_EVENT`).
 *  Any surface reflecting the flag (picker checkbox now; WP6 empty-state later) listens. */
export const TIME_TRACKING_ENABLED_EVENT = "time-tracking-enabled";

/** Read the persisted tracking toggle (default `false`). Thin typed wrapper over the
 *  `time_get_tracking_enabled` command. */
export async function getTimeTrackingEnabled(): Promise<boolean> {
  return invoke<boolean>("time_get_tracking_enabled");
}

/** Persist the tracking toggle. The backend re-broadcasts `time-tracking-enabled` so
 *  every surface re-renders; takes effect on the next hook/native event. Thin typed
 *  wrapper over the `time_set_tracking_enabled` command. */
export async function setTimeTrackingEnabled(enabled: boolean): Promise<void> {
  return invoke<void>("time_set_tracking_enabled", { enabled });
}
