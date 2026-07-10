// M9 WP6a — pure day-stats computation for the SummaryStrip.
//
// Ported from the source `Dashboard`-root `dayTotals`/`dayStats` (dashboard.jsx
// L3934-3972), remapped to the 6-kind set: "Active" = the whole AI-execution family
// (`sumActive`), "Away" = the `away` segs, longest-session ranked by AI-family minutes,
// most-used tool from the per-session `tools` map. NO week path (WP6a is day-only).
//
// Pure (no React) → vitest-testable in isolation, same posture as kinds.ts.

import type { RangePayload, SegPayload } from "../../../state/timeAnalytics";
import { sumActive, sumByKind } from "./kinds";

/** One SummaryStrip stat cell. `accent` tints the value; `sub` is a caption. */
export interface DayStat {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}

/** Minutes → "Xh Ym" / "Xh" / "Ym" / "0m". (Ported `fmtDur`, L41.) */
export function fmtDur(mins: number): string {
  if (mins < 1) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Minutes-from-midnight → "HH:MM". (Ported `fmtClock`, L49.) */
export function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute the three day-summary numbers from a 1-day range payload:
 *   - Active  = total AI-execution-family minutes across all sessions
 *   - Away    = total `away` minutes
 *   - Longest = the single session with the most AI-family minutes (alias + start clock)
 * Returns the raw numbers; {@link dayStats} formats them into DayStat cells.
 *
 * (The "Most-used tool" stat was removed at P3 verify-human — not useful. The per-
 * session `tools` map is still consumed elsewhere; it's just no longer summarized here.)
 */
export function computeDayTotals(data: RangePayload): {
  active: number;
  away: number;
  longest: { active: number; project: string; start: number };
} {
  let active = 0;
  let away = 0;
  const longest = { active: 0, project: "", start: 0 };

  for (const p of data.projects) {
    for (const s of p.sessions) {
      const segs: SegPayload[] = s.segs;
      active += sumActive(segs);
      away += sumByKind(segs, "away");
      const sessActive = sumActive(segs);
      if (sessActive > longest.active) {
        longest.active = sessActive;
        longest.project = p.alias;
        longest.start = s.start;
      }
    }
  }

  return { active, away, longest };
}

/**
 * Format the day totals into the SummaryStrip cells (Active / Away / Longest session).
 * `activeAccent` is the palette color used to tint the Active value (the caller passes
 * `colorForKind("ai-doing")` so the stat module stays palette-agnostic).
 */
export function dayStats(data: RangePayload, activeAccent: string): DayStat[] {
  const t = computeDayTotals(data);
  return [
    { label: "Active", value: fmtDur(t.active), accent: activeAccent },
    { label: "Away", value: fmtDur(t.away), sub: "between sessions" },
    {
      label: "Longest session",
      value: fmtDur(t.longest.active),
      sub: t.longest.project
        ? `${t.longest.project} · ${fmtClock(t.longest.start)}`
        : undefined,
    },
  ];
}
