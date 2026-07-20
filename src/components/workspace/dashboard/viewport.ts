// M9 WP6b-1 Phase 1 — the pure viewport core for the interactive day timeline.
//
// This module is the testable substrate under the interactive zoom/pan viewport
// that WP6a deliberately dropped (WP6a's DayTimeline used a FIXED viewport passed
// down as a prop). Everything here is pure — no React, no DOM, no `new Date()` —
// so the "manage the bug surface via vitest-pinned pure functions" obligation
// from the WP6b-1 spec's `[PRIOR: explicit-selectable-mode-over-inferred-mode]`
// OVERRIDE is discharged by `viewport.test.ts`.
//
// Ported/redesigned from the standalone claude-time dashboard.jsx viewport
// subsystem (surveyed implementation-level at spec time), with three deliberate
// IMPROVEMENTS over the source (the source omits all three; they map directly to
// the flagged bug surface — 0-width reflow, drag-vs-fit races):
//   1. A REAL `clampViewport` that EVERY write routes through. The source had no
//      such function — it clamped zoom inline but left PAN unbounded (you could
//      pan the window entirely off the data). Here pan is contained, width-
//      preserving.
//   2. A `dataWindow` degenerate guard (`width <= 0`) — the source divided by the
//      window width with no guard (divide-by-zero on an empty/one-instant day).
//   3. Single-day only — the source's multi-day `day_count*1440` branch and all
//      `dayOffset` math are dropped (WP6b-1 is single-day; every coordinate IS a
//      minute-of-day, source survey item 8).
//
// Coordinate unit throughout: minutes-from-LOCAL-midnight (the frozen WP4
// contract unit — same unit as SegPayload.start/.end). Values may be FRACTIONAL
// during gestures; only rounded at display time (which this module never does).

import type { RangePayload } from "../../../state/timeAnalytics";
import { stepIso } from "./rangeMath";

// ── Viewport ─────────────────────────────────────────────────────────────────
/** The visible time window: minutes-from-local-midnight bounds. Invariant (held
 *  by `clampViewport`, never by the raw type): `visible_start_min < visible_end_min`. */
export interface Viewport {
  visible_start_min: number;
  visible_end_min: number;
}

/** [start_min, end_min] — the pan/zoom bounds + the Minimap's full track extent. */
export type DataWindow = [number, number];

/** The default hour range when a payload carries no `hour_range` (matches WP6a). */
const DEFAULT_HOUR_RANGE: [number, number] = [6, 23];

/** The smallest visible span (max zoom-in), in minutes. Source-faithful (1m); the
 *  real `clampViewport` below makes the tiny floor safe (no more 0-width crash). */
export const MIN_SPAN_MIN = 1;

/**
 * The LARGEST visible span (max zoom-out), in minutes — 30 day-lanes (WP6b-4 re-spec
 * D9: "cap to 30 days"). The flexible timeline's coordinate space can be wider than
 * this (a 30-day fixed-origin window), but the camera never zooms out past ~30 lanes
 * on screen — older data beyond the framed 30 days is reached by PANNING, not by
 * zooming. This bounds the simultaneously-mounted lane count (the gesture-smoothness
 * budget) and doubles as the RangePicker's max span. `clampViewport` caps the span at
 * `min(dataWindow width, MAX_ZOOM_OUT_SPAN_MIN)`; pan still reaches the whole window.
 */
export const MAX_ZOOM_OUT_SPAN_MIN = 30 * 1440;

// ── Seed ───────────────────────────────────────────────────────────────────
/**
 * Compute the INITIAL viewport from a 1-day payload's `hour_range` (fallback
 * [6,23]). This is WP6a's `viewportFromHourRange` — in WP6a it was the permanent
 * fixed viewport; in WP6b-1 it becomes the interactive INITIAL STATE (the seed the
 * ViewportProvider starts at + the "Fit day" reset target).
 */
export function viewportFromHourRange(
  hourRange: [number, number] | undefined,
): Viewport {
  const [h0, h1] = hourRange ?? DEFAULT_HOUR_RANGE;
  return { visible_start_min: h0 * 60, visible_end_min: h1 * 60 };
}

// ── Multi-day day math (WP6b-4) ─────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;
const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * Whole-days-between × 1440 — the minute offset of `dayIso`'s lane within a multi-day
 * window whose first day is `windowStartIso`. `dayOffsetMin(x, x) === 0`;
 * `dayOffsetMin("2026-05-23", "2026-05-09") === 14 * 1440 === 20160`. Either arg
 * absent/null → 0 (the single-day fallback: a bare-day payload has no `day_iso`, so
 * every segment stays at its minute-of-day). UTC-anchored (both dates parse at
 * `T00:00:00Z` so the difference is offset-stable — pure day-level math, matching
 * `rangeMath`'s day arithmetic). Ported from dashboard.jsx `dayOffsetMin` (L1914).
 */
export function dayOffsetMin(
  dayIso: string | null | undefined,
  windowStartIso: string | null | undefined,
): number {
  if (!dayIso || !windowStartIso) return 0;
  const d = new Date(dayIso + "T00:00:00Z").getTime();
  const s = new Date(windowStartIso + "T00:00:00Z").getTime();
  if (Number.isNaN(d) || Number.isNaN(s)) return 0;
  return Math.round((d - s) / MS_PER_DAY) * 1440;
}

/**
 * The absolute-minute coordinate for the live NOW marker, or `null` when today is
 * NOT inside the shown window (so the marker hides). Pure so the "does today's line
 * show, and where" decision is unit-pinned (the NowMarker component is thin glue that
 * reads the clock + this).
 *   - SINGLE-DAY (`windowStartIso === null`): the view IS today by construction → the
 *     marker is at `nowMin` (today's minute-of-day, offset 0). Always in-window.
 *   - MULTI-DAY: today's lane index is `dayOffsetMin(todayIso, windowStartIso)/1440`;
 *     the marker shows only if that lane ∈ `[0, dayCount)` (today is one of the shown
 *     days), at `nowMin + dayOffset`. Today before/after the range → `null` (hidden).
 * `nowMin` is the current minute-of-day (0–1440); `dayCount` the window's day span.
 */
export function nowMarkerAbsMin(
  nowMin: number,
  todayIso: string,
  windowStartIso: string | null,
  dayCount: number,
): number | null {
  if (windowStartIso === null) return nowMin; // single-day view == today
  const off = dayOffsetMin(todayIso, windowStartIso);
  const laneIx = off / 1440;
  if (laneIx < 0 || laneIx >= dayCount) return null; // today not in the shown range
  return nowMin + off;
}

/**
 * Format a day-index (relative to `windowStartIso`, the window's first day) as
 * `"MMM DD"` (e.g. `"JUL 15"`) for multi-day ruler labels. `dayIx` is
 * `floor(absMinute / 1440)`. Absent/invalid `windowStartIso` → `""` (a safe blank
 * rather than a wrong label — matches the source's defensive default). UTC-anchored
 * to pair with `dayOffsetMin`. Ported from dashboard.jsx `_formatDayLabel` (L2148).
 */
export function formatDayLabel(
  dayIx: number,
  windowStartIso: string | null | undefined,
): string {
  if (!windowStartIso) return "";
  const start = new Date(windowStartIso + "T00:00:00Z").getTime();
  if (Number.isNaN(start)) return "";
  const d = new Date(start + dayIx * MS_PER_DAY);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Flexible-timeline helpers (WP6b-4 re-spec — fixed-origin continuous timeline) ──
//
// The re-spec (2026-07-15) replaces the "type-a-range-to-unlock-multi-day mode" (D1)
// with ONE continuous camera over a fixed-origin coordinate space. Three windows are
// kept distinct (PD3): the COORDINATE window (`[0, 30*1440]`, origin `originIso =
// today-29d`, never moves), the LOADED window (the fetched sub-span — the pan clamp
// bound; grows via auto-extend), and the VIEWPORT (the framed span). Lane coordinates
// are `dayOffsetMin(day_iso, originIso)` — origin-STABLE, so a backward extend re-fetch
// keeps every existing lane's coordinate identical (no viewport shift; PD1). The three
// pure helpers below feed the impure `GlobalDashboard` wiring (seed, reactive picker
// readout, auto-extend trigger).

/**
 * The INITIAL viewport for the flexible timeline (D6′): frame TODAY's lane at a legible
 * ≈active-hours zoom. Today's lane offset in the fixed-origin coordinate space is
 * `dayOffsetMin(todayIso, originIso)`; `lastHours` (today's `hour_range`, fallback
 * [6,23]) is the intra-day span. So the camera opens showing today at a readable zoom
 * and the first gesture is a productive pan/zoom BACK through days — never a rescue from
 * a slivered full-window view. Pure + `now`-free (today is the `todayIso` param).
 */
export function seedViewportToday(
  originIso: string,
  todayIso: string,
  lastHours: [number, number] | undefined,
): Viewport {
  const offset = dayOffsetMin(todayIso, originIso);
  const [h0, h1] = lastHours ?? DEFAULT_HOUR_RANGE;
  return {
    visible_start_min: offset + h0 * 60,
    visible_end_min: offset + h1 * 60,
  };
}

/**
 * The largest INCLUSIVE-day span the framed-range readout may emit — derived from the same
 * `MAX_ZOOM_OUT_SPAN_MIN` (30 lanes) the camera's zoom-out is capped at, so the two "30"s
 * are one number. This is ALSO the `RangePicker`'s `MAX_RANGE_DAYS` bound; keeping the
 * derivation here (the pure layer) lets `framedRange` cap its own output to a value the
 * picker will always accept without importing the React component (which owns the picker copy
 * of the constant). See `framedRange` for why the cap is needed (the misalignment off-by-one).
 *
 * Exported (not to be imported into `RangePicker` — that would cycle, since RangePicker imports
 * `MAX_ZOOM_OUT_SPAN_MIN` from here) purely so a test can pin `MAX_FRAMED_DAYS === MAX_RANGE_DAYS`
 * (SURFACE-2026-07-20-QUALITY-WP2-MAXFRAMED-MAXRANGE-PARALLEL-DERIVATION): the two derivations stay
 * separate to avoid the cycle, but a tie assertion catches a future `+1`-style drift in either one.
 */
export const MAX_FRAMED_DAYS = MAX_ZOOM_OUT_SPAN_MIN / 1440; // 30

/**
 * The day-granular ISO range the viewport currently FRAMES (D8 — the reactive RangePicker
 * readout). Maps the viewport's visible bounds → lane indices (relative to `originIso`) →
 * ISO dates, clamped to `[originIso, todayIso]`:
 *   - `startIso` = origin + `floor(visible_start / 1440)` days (the first framed lane).
 *   - `endIso`   = origin + `floor((visible_end - ε) / 1440)` days (the last framed lane;
 *     the `-ε` via `Math.ceil(visible_end/1440) - 1` so a viewport ending exactly on a
 *     lane boundary doesn't count the next, empty lane).
 *
 * SPAN CAP (SURFACE-2026-07-15-QUALITY-WP6B4-FRAMEDRANGE-PICKER-OFFBYONE): the camera's zoom-out
 * is capped at 30 *lanes* on screen (`MAX_ZOOM_OUT_SPAN_MIN`), but a LANE COUNT and an INCLUSIVE
 * DAY COUNT are off-by-one — a 30-lane-wide viewport that is day-MISALIGNED (panned a fractional
 * day) touches 31 inclusive lanes (`floor(start)` … `ceil(start+30)-1`), which would present a
 * 31-inclusive-day span to the `RangePicker` and stick its `validateRange(…, 30)` readout in a
 * permanent red-border error on a value the operator never typed. So the LAST framed lane is
 * additionally capped to `startLane + (MAX_FRAMED_DAYS - 1)` — the readout never exceeds 30
 * inclusive days, exactly the picker's max. This does NOT touch `clampViewport`'s on-screen lane
 * budget (that 30-lane cap is the gesture-smoothness contract); only the day-granular readout.
 *
 * Clamped so a viewport panned/slivered past the coordinate edges still yields a valid,
 * in-range picker value. Pure; the only clock input is `todayIso` (a param). Reuses
 * `stepIso` (the established day-stepper — inverse of `dayOffsetMin` at day granularity).
 */
export function framedRange(
  viewport: Viewport,
  originIso: string,
  todayIso: string,
): { startIso: string; endIso: string } {
  const startLane = Math.floor(viewport.visible_start_min / 1440);
  // Last lane with any visible coverage: ceil(end/1440)-1 (a boundary end doesn't spill
  // into the next lane). Floor of start guarantees startLane ≤ endLane for any span ≥0.
  const endLane = Math.max(
    startLane,
    Math.ceil(viewport.visible_end_min / 1440) - 1,
  );
  let startIso = stepIso(originIso, startLane);
  let endIso = stepIso(originIso, endLane);
  // Clamp into [originIso, todayIso] (a slivered/over-panned viewport can index outside).
  if (startIso < originIso) startIso = originIso;
  if (endIso > todayIso) endIso = todayIso;
  if (endIso < startIso) endIso = startIso;
  // Cap the INCLUSIVE-day span AFTER the coordinate clamp so a day-misaligned max-zoom
  // viewport never presents a 31st lane the picker would reject (the off-by-one fix above).
  // Applied on the clamped ISO span — NOT on raw lane indices — so an over-panned viewport
  // whose valid [origin,today] projection is already ≤30 days is left untouched.
  const maxEndIso = stepIso(startIso, MAX_FRAMED_DAYS - 1);
  if (endIso > maxEndIso) endIso = maxEndIso;
  return { startIso, endIso };
}

/**
 * Does the current viewport sit close enough to a LOADED-window edge that we should
 * auto-extend the fetched span (D7)? Returns:
 *   - `"older"` — the viewport's start is within `thresholdMin` of the loaded window's
 *     LOWER bound AND older data exists in the coordinate space (`loadedWindow[0] > 0`).
 *     → the caller prepends ~7 more days (down to the origin floor at coordinate 0).
 *   - `"newer"` — the viewport's end is within `thresholdMin` of the loaded window's
 *     UPPER bound AND the loaded window does NOT yet reach the coordinate end
 *     (`loadedWindow[1] < coordWindowEnd`, i.e. `..today`). → the caller appends toward
 *     today.
 *   - `null` — no extend needed.
 * `"older"` takes precedence when (rarely) both fire — a very wide viewport near both
 * edges resolves the backward direction first. Pure predicate; the impure debounced
 * effect calls it each viewport change. `thresholdMin` defaults to ½ day (720) — enough
 * lead time to fetch before the operator pans into the void, small enough not to
 * pre-fetch on a first legible one-day view.
 */
export function needsExtend(
  viewport: Viewport,
  loadedWindow: DataWindow,
  coordWindowEnd: number,
  thresholdMin: number = 720,
): "older" | "newer" | null {
  const [lo, hi] = loadedWindow;
  if (viewport.visible_start_min <= lo + thresholdMin && lo > 0) return "older";
  if (viewport.visible_end_min >= hi - thresholdMin && hi < coordWindowEnd) {
    return "newer";
  }
  return null;
}

/**
 * The `AutoExtendWatcher`'s in-flight-guard next-state decision (pure so the guard's
 * latch behavior is unit-pinned without a render toolchain — the watcher effect is thin
 * glue around this). Given the `needsExtend` result inside the debounced tick and the
 * guard's CURRENT value, returns:
 *   - `fire` — whether to call `onExtend(dir)` this tick (only when a direction is needed
 *     AND no extend is already in flight).
 *   - `nextGuard` — what the in-flight guard (`firingRef`) should become.
 *
 * The guard exists to de-dupe rapid fires WHILE an extend is in flight; the parent clears
 * it by landing a wider `loadedWindow` (which flips `needsExtend` back to null). But when a
 * fired extend is a NO-OP at a coordinate edge (already at the origin floor / at today), the
 * loaded window never changes, so the "new window clears the guard" effect never runs. If a
 * null result left the guard UNCHANGED, a guard latched `true` by such a no-op fire would never
 * clear — and because a SINGLE guard gates both directions, a stuck `older` guard would then
 * block a later legitimate `newer` extend at the opposite edge
 * (SURFACE-2026-07-15-QUALITY-WP6B4-AUTOEXTEND-FIRINGREF-LATCH).
 *
 * The FIX (WP2, backlog-paydown 2026-07-19): a `null` result CLEARS the guard — nothing is
 * needed, so nothing is in flight; a no-op edge fire can no longer latch it permanently. The
 * `currentGuard === true` hold still de-dupes a genuine in-flight extend (the wider-window
 * effect clears it on landing); a directional result fires and arms the guard.
 */
export function nextExtendGuard(
  dir: "older" | "newer" | null,
  currentGuard: boolean,
): { fire: boolean; nextGuard: boolean } {
  // No extend needed → release the guard UNCONDITIONALLY. This is the latch fix: it must run
  // BEFORE the in-flight hold, so a guard latched `true` by a no-op edge fire (which leaves
  // needsExtend returning null once the camera moves off the edge) is cleared rather than held.
  if (!dir) return { fire: false, nextGuard: false };
  // A direction IS needed: hold if an extend is already in flight (de-dupe), else fire + arm.
  if (currentGuard) return { fire: false, nextGuard: true };
  return { fire: true, nextGuard: true };
}

// ── Data window (clamp bounds) ─────────────────────────────────────────────
/**
 * Derive the pan/zoom bounds for a payload: the WHOLE window `[0, day_count * 1440]`
 * (WP6b-4 multi-day — revives the source's `meta.day_count*1440` branch). A single-day
 * payload has `day_count === 1` → `[0, 1440]` (unchanged from WP6b-1).
 *
 * WHY the whole day(s), not `hour_range` (fix, WP6b-1 Phase 2 verify-human back-loop
 * 2026-07-13): `hour_range` is the *active-hours* span (e.g. `[8,12]`), and it is
 * ALSO what seeds the initial viewport (`viewportFromHourRange`). If the data window
 * equalled that span, the default-zoom viewport would fill the entire pannable range
 * → `clampViewport` (correctly) refuses to pan → drag-pan feels dead until you zoom
 * in (operator: "drag does nothing"). Making the data window the whole day(s) means the
 * active-hours seed is a *sub-window* with headroom: drag-pan works immediately, and
 * zoom-out reveals the rest of the range — the natural "timeline" model. The seed
 * itself is unchanged (still the active hours / a legible one-day window — see
 * `viewportFromHourRange` / `seedViewportToday`); only the pan/zoom BOUNDS widen with
 * the day count.
 *
 * WP6b-4: the multi-day coordinate is `dayOffset*1440 + minute-of-day`, so a range of
 * `N` days spans `[0, N*1440]` minutes (each day is its own 1440-min lane). Guard a
 * missing / degenerate `day_count` (`< 1`) → the single-day `[0, 1440]` (defensive —
 * `meta.day_count` is always ≥1 from WP4, but never emit an inverted/zero window).
 */
export function deriveDataWindow(data: RangePayload): DataWindow {
  const dayCount = data.meta?.day_count;
  if (!(typeof dayCount === "number") || !(dayCount >= 1)) return [0, 1440];
  return [0, dayCount * 1440];
}

// ── Clamp (the source's missing piece) ────────────────────────────────────
/**
 * Constrain a proposed viewport to `dataWindow` with a min visible span. EVERY
 * viewport write (drag-pan, wheel-zoom, keyboard, Minimap pan/edge/recenter) must
 * route through this — it is the single containment point the source lacked.
 *
 * Rules:
 *   - **Max zoom-out:** visible span cannot exceed `min(data-window width, maxSpanMin)`.
 *     `maxSpanMin` defaults to `MAX_ZOOM_OUT_SPAN_MIN` (30 days, WP6b-4 D9) — so a
 *     coordinate/data window WIDER than 30 days still can't zoom the camera out past
 *     30 lanes (older data is reached by panning). A window ≤30 days is unaffected (the
 *     `min` picks the window width, exactly the WP6b-1 behavior — back-compat).
 *   - **Max zoom-in:** visible span floors at `minSpanMin`; never inverts.
 *   - **Pan containment, width-preserving:** if the (already span-capped) window
 *     falls outside the bounds, TRANSLATE it back in (shift both endpoints by the
 *     same delta) rather than shrinking an edge — so panning to a boundary parks
 *     the window at the edge at its current width instead of collapsing it. Pan still
 *     reaches the WHOLE `[lo,hi]` — only the SPAN is capped, not the pannable extent.
 *   - **Degenerate `dataWindow` (`width <= 0`):** returns a safe non-NaN viewport
 *     (`minSpanMin` wide at the window start) — no divide-by-zero downstream.
 */
export function clampViewport(
  vp: Viewport,
  dataWindow: DataWindow,
  minSpanMin: number = MIN_SPAN_MIN,
  maxSpanMin: number = MAX_ZOOM_OUT_SPAN_MIN,
): Viewport {
  const [lo, hi] = dataWindow;
  const windowWidth = hi - lo;

  // Degenerate window (empty / one-instant day): nothing to clamp against; hand
  // back a safe, non-NaN sliver anchored at the window start.
  if (!(windowWidth > 0)) {
    return { visible_start_min: lo, visible_end_min: lo + minSpanMin };
  }

  // The zoom-out ceiling: never wider than the window, and never wider than the
  // 30-day cap (D9). For a ≤30-day window this is just `windowWidth` (unchanged).
  const spanCap = Math.min(windowWidth, maxSpanMin);

  // 1. Clamp the SPAN: floor at minSpanMin, cap at the span ceiling.
  let span = vp.visible_end_min - vp.visible_start_min;
  if (!(span > 0)) span = minSpanMin; // inverted/zero → collapse to the floor
  span = Math.min(Math.max(span, minSpanMin), spanCap);

  // 2. Position the (span-fixed) window, then translate it back inside [lo, hi],
  //    preserving width. Start from vp's current start.
  let start = vp.visible_start_min;
  let end = start + span;
  if (start < lo) {
    start = lo;
    end = lo + span;
  } else if (end > hi) {
    end = hi;
    start = hi - span;
  }
  return { visible_start_min: start, visible_end_min: end };
}

// ── Coordinate math (pure) ─────────────────────────────────────────────────
/** Percent left/width of a [start,end] minute span within a viewport (CSS %). */
export function viewportPct(
  start: number,
  end: number,
  viewport: Viewport,
): { left: string; width: string } {
  const range = viewport.visible_end_min - viewport.visible_start_min;
  // Guard a degenerate (0-width) viewport so we never emit NaN% geometry.
  if (!(range > 0)) return { left: "0%", width: "0%" };
  const left = ((start - viewport.visible_start_min) / range) * 100;
  const width = ((end - start) / range) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

/**
 * Convert a fractional position within a viewport (0..1) to a data-minute. Used by
 * gestures/Minimap to map a pointer x → a time. `frac` is NOT clamped here; the
 * caller clamps to [0,1] when the surface spans the whole data window (Minimap).
 */
export function fracToDataMin(frac: number, viewport: Viewport): number {
  const range = viewport.visible_end_min - viewport.visible_start_min;
  return viewport.visible_start_min + frac * range;
}

/**
 * A stable string key identifying a (seed, dataWindow) pair by its four numeric
 * bounds — NOT object identity. The `ViewportProvider` re-seeds its viewport only
 * when this key CHANGES, so a re-fetch that produces the same window (e.g. an
 * identical day re-query) is a no-op that preserves the user's current pan/zoom,
 * while a genuinely new payload (different day / different active-hours) resets the
 * window. Extracted as a pure function so the re-seed decision is codified without
 * a jsdom render test (the project has no component-test toolchain by convention —
 * behavior is verified live via the MCP bridge).
 */
export function viewportSeedKey(
  seed: Viewport,
  dataWindow: DataWindow,
): string {
  return `${seed.visible_start_min}|${seed.visible_end_min}|${dataWindow[0]}|${dataWindow[1]}`;
}

// ── Gesture math (pure; consumed by useTimelineGestures + the Minimap) ──────
/**
 * Pan `origin` by a pixel drag delta. `dx` is the pointer's px displacement,
 * `bodyWidthPx` the pannable surface width. Convention: drag RIGHT (dx>0) pans the
 * viewport toward EARLIER time (content moves right), so the minute delta is
 * negated. Width is preserved (both endpoints shift equally); the caller clamps.
 */
export function panViewport(
  origin: Viewport,
  dx: number,
  bodyWidthPx: number,
): Viewport {
  if (!(bodyWidthPx > 0)) return origin;
  const range = origin.visible_end_min - origin.visible_start_min;
  const deltaMin = -(dx / bodyWidthPx) * range;
  return {
    visible_start_min: origin.visible_start_min + deltaMin,
    visible_end_min: origin.visible_end_min + deltaMin,
  };
}

/**
 * Zoom `vp` by `factor` (>1 = zoom out / wider, <1 = zoom in / narrower) anchored at
 * fractional position `frac` (0..1) of the surface — the data-minute under `frac`
 * stays at `frac` after the zoom (cursor-anchored zoom). The caller clamps the
 * result (span floor / data-window cap).
 */
export function zoomViewport(
  vp: Viewport,
  factor: number,
  frac: number,
): Viewport {
  const oldRange = vp.visible_end_min - vp.visible_start_min;
  if (!(oldRange > 0)) return vp;
  const anchorMin = vp.visible_start_min + frac * oldRange;
  const newRange = oldRange * factor;
  const newStart = anchorMin - frac * newRange;
  return { visible_start_min: newStart, visible_end_min: newStart + newRange };
}

// ── Adaptive tick density (ported dashboard.jsx pickTickInterval/ticksInViewport)
/** Candidate tick intervals in minutes, coarse → fine (source scale set). */
const TICK_SCALES = [1440, 360, 60, 30, 15, 10, 5, 1] as const;

/**
 * Pick the DENSEST tick interval whose tick count lands in the [8, 30] band for
 * the current viewport width. Iterates coarse→fine and returns the first in-band
 * interval; extreme zoom-in (<8 min span) → 1m; extreme zoom-out (>~30 days) →
 * 1440m. (Source survey item 5.)
 */
export function pickTickInterval(viewport: Viewport): number {
  const range = viewport.visible_end_min - viewport.visible_start_min;
  if (!(range > 0)) return TICK_SCALES[TICK_SCALES.length - 1]; // degenerate → 1m
  for (const m of TICK_SCALES) {
    const ticks = Math.ceil(range / m);
    if (ticks >= 8 && ticks <= 30) return m;
  }
  if (range < 8) return 1; // extreme zoom-in
  return 1440; // extreme zoom-out
}

/** One ruler/grid tick: its minute position + its display label. */
export interface Tick {
  min: number;
  label: string;
}

/**
 * Generate minute-aligned ticks from the first aligned position >= visible_start
 * up to (exclusive) visible_end.
 *
 * Label formats (WP6b-4 revives the source's multi-day branches — dashboard.jsx
 * `ticksInViewport` L2119-2145):
 *   - `intervalMin >= 1440` (day-level zoom-out): `"MMM DD"` via `formatDayLabel`.
 *   - viewport CROSSES a midnight AND `windowStartIso` given: intra-day ticks stay
 *     `HH:MM`, but the first tick of each new day (`minOfDay === 0`) gets the
 *     `"MMM DD"` day label so you can tell the lanes apart.
 *   - else (single-day / no midnight crossing / no `windowStartIso`): `HH:00` for
 *     the 60m interval, else `HH:MM` — BYTE-IDENTICAL to the WP6b-1 single-day
 *     output. `windowStartIso` is OPTIONAL and defaults to null, so today's
 *     single-day callers that pass only `(viewport, interval)` are unchanged.
 */
export function ticksInViewport(
  viewport: Viewport,
  intervalMin: number,
  windowStartIso: string | null = null,
): Tick[] {
  const out: Tick[] = [];
  if (!(intervalMin > 0)) return out;
  const startTick =
    Math.ceil(viewport.visible_start_min / intervalMin) * intervalMin;
  // Does the visible window span more than one calendar day? (Only meaningful with a
  // windowStartIso — drives the per-day-boundary "MMM DD" prefix.)
  const crossesMidnight =
    Math.floor(viewport.visible_start_min / 1440) !==
    Math.floor((viewport.visible_end_min - 1) / 1440);
  for (let t = startTick; t < viewport.visible_end_min; t += intervalMin) {
    const dayIx = Math.floor(t / 1440);
    const minOfDay = ((t % 1440) + 1440) % 1440; // safe modulo (fractional-safe)
    const h = Math.floor(minOfDay / 60);
    const m = Math.floor(minOfDay % 60);
    let label: string;
    if (intervalMin >= 1440) {
      // Day-level ticks: label each with its date.
      label = formatDayLabel(dayIx, windowStartIso);
    } else if (crossesMidnight && windowStartIso && minOfDay === 0) {
      // First tick of a new day inside a multi-day viewport → prefix the date.
      label = formatDayLabel(dayIx, windowStartIso);
    } else if (intervalMin >= 60) {
      label = `${String(h).padStart(2, "0")}:00`;
    } else {
      label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    out.push({ min: t, label });
  }
  return out;
}
