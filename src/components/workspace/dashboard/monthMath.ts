// M9 WP6b-2 Phase 2 — pure math for the Month view (ported from dashboard.jsx month
// helpers L173-239 + the MonthView `dayTotals` reducer L3354-3373). Month is rendered as
// a `custom`-range query (there is NO `month` QueryWindow — see the WIP plan): the
// dashboard fetches `{kind:"custom", start_ms, end_ms}` for the month's local-midnight
// bounds and this module turns the resulting RangePayload into a per-day intensity grid.
//
// Two things are Claudesk-specific (not a mechanical port):
//
//   (1) DARK INTENSITY RAMP. The source `_MONTH_INTENSITY_PALETTE` is a LIGHT
//       contribution-graph ramp (top-of-ramp `oklch(0.965 … 268)` = near-white). On dark
//       the ramp must INVERT: empty = a faint near-`surfaceDim` tint, busiest = a bright
//       saturated indigo (the `ai-doing` hue 268 from tokens.ts). `MONTH_INTENSITY_PALETTE`
//       below is dark-anchored so a busy day GLOWS against #1e1e1e instead of washing out.
//
//   (2) dur_ms SUMMING. The source `dayTotals` summed `seg.end - seg.start` — the exact
//       minute-quantization anti-pattern the WP4 fix corrected (SURFACE-2026-07-13-M9-WP4-
//       MINUTE-QUANTIZATION-…). `dayTotalsFromRange` sums TRUE `dur_ms` and rounds the
//       per-day total to minutes once, so sub-minute AI work is not zeroed.

import type { RangePayload } from "../../../state/timeAnalytics";
import { AI_KINDS } from "./kinds";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** {year, month} parsed from an ISO month string. `month` is 1-based (1 = Jan). */
export interface MonthParts {
  year: number;
  month: number;
}

/** Parse `"2026-07"` → `{year: 2026, month: 7}`. Null on malformed input or month
 *  out of 1..12. */
export function monthIsoToParts(iso: string): MonthParts | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}$/.test(iso)) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** `"2026-07"` → `"July 2026"`. Em-dash on malformed input. */
export function monthIsoToLabel(iso: string): string {
  const p = monthIsoToParts(iso);
  if (!p) return "—";
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** Previous ISO month (wraps the year). Null on malformed input. */
export function prevMonthIso(iso: string): string | null {
  const p = monthIsoToParts(iso);
  if (!p) return null;
  const py = p.month === 1 ? p.year - 1 : p.year;
  const pm = p.month === 1 ? 12 : p.month - 1;
  return `${String(py).padStart(4, "0")}-${String(pm).padStart(2, "0")}`;
}

/** Next ISO month (wraps the year). Null on malformed input. */
export function nextMonthIso(iso: string): string | null {
  const p = monthIsoToParts(iso);
  if (!p) return null;
  const ny = p.month === 12 ? p.year + 1 : p.year;
  const nm = p.month === 12 ? 1 : p.month + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

/** Number of days in a (year, 1-based month). Standard `Date(y, m, 0)` last-day trick. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday-first day-of-week index (0 = Mon … 6 = Sun) for a Date — matches the Week
 *  view's Monday-first convention. JS `getDay()` is Sunday-first; shift by +6 % 7. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// ── Dark intensity ramp ────────────────────────────────────────────────────
// 6 buckets: empty + 5 populated steps, all on the `ai-doing` indigo hue (268) so the
// Month grid coheres with the dashboard's AI-family palette. DARK-ANCHORED (inverts the
// source's light ramp): empty is a faint tint just above `surfaceDim`, and the busiest
// bucket is a bright saturated indigo that GLOWS on the #1e1e1e ground. Lightness climbs
// with intensity (opposite of the light ramp, where it fell) so "busier = brighter".
export const MONTH_INTENSITY_PALETTE = [
  "oklch(0.26 0.02 268)", // empty / 0 — faint indigo tint, just above surfaceDim
  "oklch(0.34 0.06 268)", // bucket 1 — very low
  "oklch(0.43 0.10 268)", // bucket 2
  "oklch(0.52 0.14 268)", // bucket 3 — mid (≈ the ai-doing token)
  "oklch(0.62 0.16 268)", // bucket 4 — high
  "oklch(0.72 0.17 268)", // bucket 5 — busiest, brightest
] as const;

/**
 * Map a 0..1 normalized intensity to a ramp color. `<= 0` → the empty bucket. Populated
 * intensities map to buckets 1..5 with a lower-biased quintile split (matches the source),
 * so even one active minute on a busy-max day gets a visible bucket-1 cell instead of
 * washing into "empty".
 */
export function intensityColor(intensity: number): string {
  if (!(intensity > 0)) return MONTH_INTENSITY_PALETTE[0];
  const idx =
    intensity >= 0.8
      ? 5
      : intensity >= 0.55
        ? 4
        : intensity >= 0.3
          ? 3
          : intensity >= 0.1
            ? 2
            : 1;
  return MONTH_INTENSITY_PALETTE[idx];
}

/**
 * Per-day total AI-execution minutes from a month-range RangePayload → `Map<iso, minutes>`.
 * The Month grid's intensity signal is "how busy was this day" (1D), so we sum the AI
 * family (ai-doing + subagent + ai-reasoning — matches `sumActive` / `cellActive`).
 *
 * Sums TRUE `dur_ms` per segment then rounds each day's total to minutes ONCE (the WP4
 * minute-quantization fix — subtracting the quantized `end - start` zeroes sub-minute AI
 * tool-execution). Sessions carry their date in `day_iso` on a multi-day range payload.
 */
export function dayTotalsFromRange(payload: RangePayload | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!payload || !payload.projects) return out;
  const aiSet = new Set<string>(AI_KINDS);
  // Accumulate ms per iso, convert to minutes once at the end (round-half-up).
  const msByIso = new Map<string, number>();
  for (const p of payload.projects) {
    for (const s of p.sessions ?? []) {
      const iso = s.day_iso;
      if (!iso) continue;
      let dayMs = 0;
      for (const seg of s.segs ?? []) {
        if (!aiSet.has(seg.kind)) continue;
        if (seg.dur_ms > 0) dayMs += seg.dur_ms;
      }
      msByIso.set(iso, (msByIso.get(iso) ?? 0) + dayMs);
    }
  }
  for (const [iso, ms] of msByIso) {
    out.set(iso, ms <= 0 ? 0 : Math.floor((ms + 30_000) / 60_000));
  }
  return out;
}

/** The busiest day's minutes in a totals map (0 if empty) — the intensity normalizer. */
export function monthMax(dayTotals: Map<string, number>): number {
  let max = 0;
  for (const v of dayTotals.values()) if (v > max) max = v;
  return max;
}

// ── Month → custom-query bounds ─────────────────────────────────────────────
// Month is a `{kind:"custom", start_ms, end_ms}` query over the month's LOCAL-midnight
// span. start = first-day 00:00 local; end = last-day 23:59:59.999 local (the inclusive
// end of the month, matching the backend's inclusive `resolve_window` bounds).

/** Local-midnight epoch-ms bounds for an ISO month → `{start_ms, end_ms}`. `end_ms` is
 *  the last millisecond of the last day (local), so the custom range covers the whole
 *  month inclusively. Null on malformed input. */
export function monthRangeMs(
  iso: string,
): { start_ms: number; end_ms: number } | null {
  const p = monthIsoToParts(iso);
  if (!p) return null;
  const start = new Date(p.year, p.month - 1, 1, 0, 0, 0, 0);
  const dim = daysInMonth(p.year, p.month);
  const end = new Date(p.year, p.month - 1, dim, 23, 59, 59, 999);
  return { start_ms: start.getTime(), end_ms: end.getTime() };
}

/** Local-midnight epoch-ms bounds for a single ISO date (`"YYYY-MM-DD"`) → the 1-day
 *  custom-range span used by the Month→Day drill-down. Null on malformed input. */
export function dayRangeMs(
  iso: string,
): { start_ms: number; end_ms: number } | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10);
  const day = parseInt(iso.slice(8, 10), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start_ms: start.getTime(), end_ms: end.getTime() };
}

/** Today as an ISO month string `"YYYY-MM"` (local). */
export function todayMonthIso(now: Date): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Today as an ISO date string `"YYYY-MM-DD"` (local). */
export function todayDateIso(now: Date): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
