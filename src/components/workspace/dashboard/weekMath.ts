// M9 WP6b-2 — pure math for the Week view (ported from dashboard.jsx WeekTimeline
// L3138-3302). The two mechanical remaps live here so WeekTimeline.tsx stays a thin
// render shell and the tricky parts are vitest-pinned:
//
//   (1) DAY-HEADER PARSE. The source split each `days[i]` on a single space
//       (`"MON 13".split(' ')` → ["MON","13"]). Claudesk's backend emits a RICHER
//       label — `day_label` = `%a · %b %d` uppercased → e.g. "MON · JUL 13"
//       (query.rs:197). So the space-split is WRONG here: it would yield
//       ["MON","·","JUL","13"]. `parseDayHeader` extracts {dow, dayNum} robustly
//       from either shape.
//
//   (2) ROLLUPCELL → STACKED BAR SEGMENTS. The source stacked 4 LIGHT kinds
//       (active/subagent/thinking/reading). WP3's `RollupCell` carries the 6-kind
//       minute totals (ai_doing/subagent/ai_reasoning/typing/reviewing/away).
//       `cellSegments` turns a cell into the ordered non-zero {kind, minutes} list
//       the bar renders (RENDER_ORDER, away excluded from the bar — it reads as a
//       gap, not a stacked band), and `cellTotal` / `cellActive` give the bar height
//       normalizer + the per-cell / per-project "active work" number (AI family).

import type { RollupCell, SegKind } from "../../../state/timeAnalytics";
// Date helpers shared with the Month view — `dateToIso`/`mondayIdx` were byte-identical
// re-implementations of these (SURFACE-2026-07-14-QUALITY-WP6B3-WEEKMATH-MONTHMATH-HELPER-
// DUP). `GlobalDashboard`/`MonthView` already import from both modules, so this cross-import
// adds no new edge. Aliased to the local names to keep this file's call sites unchanged.
import {
  todayDateIso as dateToIso,
  mondayIndex as mondayIdx,
} from "./monthMath";
import { AI_KINDS, RENDER_ORDER } from "./kinds";

/** Parsed pieces of a backend week-day header label. */
export interface DayHeader {
  /** Day-of-week token, e.g. "MON". */
  dow: string;
  /** Day-of-month number, e.g. 13 (0 if unparseable). */
  dayNum: number;
}

/**
 * Parse a backend day label into {dow, dayNum}. Handles the current backend shape
 * `"MON · JUL 13"` (dow first token, day-num last token) AND the older `"MON 13"`
 * shape — take the FIRST token as the dow and the LAST integer token as the day
 * number, so both render correctly. Unparseable → {dow: raw, dayNum: 0}.
 */
export function parseDayHeader(label: string): DayHeader {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { dow: label, dayNum: 0 };
  const dow = tokens[0];
  // Last token that is a pure integer is the day-of-month.
  let dayNum = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const n = Number(tokens[i]);
    if (Number.isInteger(n) && /^\d+$/.test(tokens[i])) {
      dayNum = n;
      break;
    }
  }
  return { dow, dayNum };
}

/** True if the dow token is a weekend (SAT/SUN), case-insensitive. */
export function isWeekendDow(dow: string): boolean {
  const d = dow.toUpperCase();
  return d === "SAT" || d === "SUN";
}

/** RollupCell field name per SegKind (the snake_case DTO fields). */
const CELL_FIELD: Record<SegKind, keyof RollupCell> = {
  "ai-doing": "ai_doing",
  subagent: "subagent",
  "ai-reasoning": "ai_reasoning",
  typing: "typing",
  reviewing: "reviewing",
  away: "away",
};

/** Minutes of one kind in a rollup cell. */
export function cellKindMinutes(cell: RollupCell, kind: SegKind): number {
  return cell[CELL_FIELD[kind]];
}

/** One stacked band in a week day-cell bar. */
export interface CellSegment {
  kind: SegKind;
  minutes: number;
}

/**
 * The ordered non-zero bands for a day-cell's stacked bar, bottom-to-top in
 * RENDER_ORDER. `away` is EXCLUDED — like the day timeline, away is a gap, not a
 * painted band (and the source week bar never stacked away either). Empty cell → [].
 */
export function cellSegments(cell: RollupCell): CellSegment[] {
  const out: CellSegment[] = [];
  for (const kind of RENDER_ORDER) {
    if (kind === "away") continue;
    const minutes = cellKindMinutes(cell, kind);
    if (minutes > 0) out.push({ kind, minutes });
  }
  return out;
}

/** Total painted (non-away) minutes in a cell — the stacked-bar height numerator. */
export function cellTotal(cell: RollupCell): number {
  return cellSegments(cell).reduce((a, s) => a + s.minutes, 0);
}

/** "Active work" minutes in a cell = the AI-execution family (matches sumActive). */
export function cellActive(cell: RollupCell): number {
  return AI_KINDS.reduce((a, k) => a + cellKindMinutes(cell, k), 0);
}

/**
 * The bar-height ceiling for a week: round the busiest day's painted total up to the
 * next hour + 30m, so even the biggest day doesn't fill 100% (matches the source's
 * `Math.ceil(maxDayTotal/60)*60 + 30`). Guards against 0 (→ 30) so a flat/empty week
 * never divides by zero.
 */
export function weekCeiling(rollups: RollupCell[][]): number {
  let max = 0;
  for (const projectRollup of rollups) {
    for (const cell of projectRollup) {
      const t = cellTotal(cell);
      if (t > max) max = t;
    }
  }
  return Math.ceil(max / 60) * 60 + 30;
}

/** A project's whole-week "active work" total (AI family, summed over its 7 cells). */
export function projectWeekActive(rollup: RollupCell[]): number {
  return rollup.reduce((a, cell) => a + cellActive(cell), 0);
}

// ── ISO-week date arithmetic (WP6b-3 — Week-nav) ────────────────────────────
// Pure `"YYYY-MM-DD"` ↔ local-`Date` helpers for the Week view's prev/next nav. The
// dashboard keeps a `mondayIso` anchor and steps it ±7d; the backend `{kind:"week",
// monday}` window (WP6b-3 Phase 1) resolves any Monday to its 7-day rollup grid. All
// Monday-first, matching the Week view's convention (`mondayIndex` in monthMath). These
// siblings mirror monthMath's `prev/nextMonthIso` / `monthIsoToLabel` / `todayMonthIso`.

const MON_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Parse a `"YYYY-MM-DD"` iso into a LOCAL Date at 00:00 (null on malformed input). */
function isoToDate(iso: string): Date | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10);
  const day = parseInt(iso.slice(8, 10), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Reject overflow-normalized dates (e.g. "2026-02-31" → Mar 3): the round-trip must
  // preserve the requested day.
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/** The Monday (`"YYYY-MM-DD"`, local) of the ISO week containing `now`. `now` itself when
 *  it is a Monday; else steps back. This is the Week view's default anchor (today's week). */
export function mondayOfDate(now: Date): string {
  const back = mondayIdx(now);
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - back,
    0,
    0,
    0,
    0,
  );
  return dateToIso(monday);
}

/** The prior week's Monday (`mondayIso` − 7 days). Wraps month/year via Date arithmetic.
 *  Malformed input → today's Monday (never throws; matches monthMath's defensive lean). */
export function prevMondayIso(mondayIso: string): string {
  const d = isoToDate(mondayIso);
  if (!d) return mondayOfDate(new Date());
  d.setDate(d.getDate() - 7);
  return dateToIso(d);
}

/** The next week's Monday (`mondayIso` + 7 days). Wraps month/year. Malformed → today's
 *  Monday. (The dashboard blocks stepping past the current week via `isFutureMonday`;
 *  this helper is unconditional — the caller gates on the boundary.) */
export function nextMondayIso(mondayIso: string): string {
  const d = isoToDate(mondayIso);
  if (!d) return mondayOfDate(new Date());
  d.setDate(d.getDate() + 7);
  return dateToIso(d);
}

/** A Week-nav label for a Monday anchor: `"Jul 7 – Jul 13"` (Mon – Sun of that week).
 *  Em-dash spans the two dates; single "–" separates. Malformed input → "—". */
export function weekNavLabel(mondayIso: string): string {
  const mon = isoToDate(mondayIso);
  if (!mon) return "—";
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const fmt = (d: Date) => `${MON_ABBR[d.getMonth()]} ${d.getDate()}`;
  return `${fmt(mon)} – ${fmt(sun)}`;
}

/** True when `mondayIso` is strictly AFTER the current week's Monday — i.e. stepping to
 *  it would enter a FUTURE week (the Week-nav "next" disabled boundary, mirroring the
 *  Month view's no-future-months rule). Malformed input → true (fail safe: disable next).
 *  Compares iso strings directly (both are `"YYYY-MM-DD"` Mondays → lexicographic ==
 *  chronological). */
export function isFutureMonday(mondayIso: string, now: Date): boolean {
  // Validity guard only — a malformed iso fails safe to "future" (disable next). The compare
  // itself is lexicographic on the iso strings (see docstring), so we don't keep the parsed date.
  if (!isoToDate(mondayIso)) return true;
  return mondayIso > mondayOfDate(now);
}
