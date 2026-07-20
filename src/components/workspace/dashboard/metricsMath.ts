// M9 WP6c-1 — pure formatting + row-shaping helpers for the Metrics view.
//
// Repo posture (pure logic → vitest, live DOM → the MCP bridge): the ms→display
// formatting, the parallel-overlap derivation, and the 6-section row shaping live here so
// they're pinned in isolation, and MetricsView.tsx stays a thin presentational layer.
// All inputs are RAW ms from the `MetricsPayload` (build_metrics sums at ms precision;
// formatting-once here is the display step — the minute-quantization anti-pattern lives on
// the summing side, which the backend already handles).

import type { MetricsPayload } from "../../../state/timeAnalytics";

/** Milliseconds → `"Xh Ym"` / `"Xh"` / `"Ym"` / `"Ns"` / `"0m"`. Sub-minute durations
 *  render in seconds so a real (sub-minute) tool-call total is visible rather than "0m"
 *  (the whole point of summing at ms precision). Mirrors the family of `fmtDur` in
 *  dayStats.ts but takes ms (not minutes) so sub-minute values survive. */
export function fmtMsDur(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSec = Math.round(ms / 1000);
  // Sub-second totals rounding to "0s" here is EXPECTED and correct — this is display-time
  // rounding of an already-ms-precise TOTAL. The anti-pattern this whole ms path guards
  // against is MINUTE-flooring on the SUMMING side (quantizing each segment to the minute
  // before adding, which zeroes sub-minute tool work — SURFACE-2026-07-13-M9-WP4-MINUTE-
  // QUANTIZATION-…). Do NOT "fix" this into a misleading floor-up.
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** A parallelism multiplier → `"×N.NN"`. `0` (no wallclock) renders `"—"`. */
export function fmtMult(mult: number): string {
  if (!Number.isFinite(mult) || mult <= 0) return "—";
  return `×${mult.toFixed(2)}`;
}

/** Cross-session overlap ms = the summed wall-clock of every concurrency stratum with
 *  k ≥ 2 (time when ≥2 sessions were engaged at once). The "Parallel" headline tile. */
export function parallelMsOf(data: MetricsPayload): number {
  return data.concurrency
    .filter((s) => s.k >= 2)
    .reduce((acc, s) => acc + s.wallclock_ms, 0);
}

/** One rendered metric row. A `null` cell is omitted (concurrency/blocking rows carry no
 *  multiplier; single-value rows carry only wallclock). `count` is a non-duration integer
 *  shown in the wall-clock cell position (e.g. session count) — mutually exclusive with the
 *  duration cells. */
export interface MetricRow {
  label: string;
  wallclock_ms: number | null;
  effort_ms: number | null;
  multiplier: number | null;
  count?: number;
}

/** One MetricsPanel section: a title + a pure `rows(data)` builder. */
export interface MetricSection {
  title: string;
  rows: (data: MetricsPayload) => MetricRow[];
}

/** A standard wall/effort/mult triplet row. */
function triplet(
  label: string,
  m: { wallclock_ms: number; effort_ms: number; multiplier: number },
): MetricRow {
  return {
    label,
    wallclock_ms: m.wallclock_ms,
    effort_ms: m.effort_ms,
    multiplier: m.multiplier,
  };
}

/** The 6 detailed sections, in render order (matches the source MetricsPanel):
 *  Engaged session / AI agent / Tool call / Human active / Concurrency / Blocking.
 *  Concurrency + Blocking suppress the multiplier column (a ratio there misleads). */
export const METRIC_SECTIONS: readonly MetricSection[] = [
  {
    title: "Engaged session",
    rows: (d) => [
      triplet("Engaged", d.engaged_session),
      {
        label: "Sessions",
        wallclock_ms: null,
        effort_ms: null,
        multiplier: null,
        count: d.engaged_session.session_count,
      },
    ],
  },
  {
    title: "AI agent",
    rows: (d) => [
      triplet("AI agent", d.ai_agent),
      triplet("Subagent", d.ai_agent.subagent),
    ],
  },
  {
    title: "Tool call",
    rows: (d) => [
      triplet("All tools", d.tool_call),
      ...d.tool_call.top.map((t) => triplet(t.name, t)),
    ],
  },
  {
    title: "Human active",
    rows: (d) => [
      triplet("Human", d.human),
      {
        label: "Typing",
        wallclock_ms: d.human.typing_ms,
        effort_ms: null,
        multiplier: null,
      },
      {
        label: "Reviewing",
        wallclock_ms: d.human.reviewing_ms,
        effort_ms: null,
        multiplier: null,
      },
    ],
  },
  {
    title: "Concurrency",
    rows: (d) =>
      d.concurrency.map((s) => ({
        label: s.is_plus ? `k=${s.k}+` : `k=${s.k}`,
        wallclock_ms: s.wallclock_ms,
        effort_ms: s.effort_ms,
        multiplier: null, // effort == wallclock×k by construction; a ratio here misleads
      })),
  },
  {
    title: "Blocking",
    rows: (d) => [
      {
        label: "Human blocking agent",
        wallclock_ms: d.blocking.human_blocking_agent_ms,
        effort_ms: null,
        multiplier: null,
      },
      {
        label: "Agent blocking human",
        wallclock_ms: d.blocking.agent_blocking_human_ms,
        effort_ms: null,
        multiplier: null,
      },
    ],
  },
];
