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

/** One tiled segment. `start`/`end` are minutes-from-local-midnight (`start <= end`).
 *  `label` is present only on `subagent` segments (the `agent_type`). */
export interface SegPayload {
  kind: SegKind;
  start: number;
  end: number;
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

/** The internally-tagged result of `time_analytics_query` — a range (day/custom) or a
 *  week rollup. Branch on `kind`. */
export type TimeAnalyticsResult =
  | ({ kind: "range" } & RangePayload)
  | ({ kind: "week" } & WeekPayload);

/** The window a query covers (the tagged union the command deserializes). `day` =
 *  today (local); `week` = the ISO week containing today; `custom` = an explicit
 *  epoch-ms span. */
export type QueryWindow =
  | { kind: "day" }
  | { kind: "week" }
  | { kind: "custom"; start_ms: number; end_ms: number };

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
