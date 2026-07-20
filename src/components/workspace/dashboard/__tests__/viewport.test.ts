// M9 WP6b-1 Phase 1 — pins the pure viewport core. These are the vitest-pinned
// invariants the spec's `[PRIOR: explicit-selectable-mode-over-inferred-mode]`
// OVERRIDE promised to manage the bug surface with (clamp containment, no
// inversion, degenerate-window safety, adaptive tick density).

import { describe, expect, it } from "vitest";
import {
  clampViewport,
  dayOffsetMin,
  deriveDataWindow,
  formatDayLabel,
  fracToDataMin,
  framedRange,
  MAX_ZOOM_OUT_SPAN_MIN,
  needsExtend,
  nextExtendGuard,
  nowMarkerAbsMin,
  pickTickInterval,
  seedViewportToday,
  ticksInViewport,
  viewportFromHourRange,
  viewportPct,
  viewportSeedKey,
  type DataWindow,
  type Viewport,
  MAX_FRAMED_DAYS,
} from "../viewport";
import type { RangePayload } from "../../../../state/timeAnalytics";
import { MAX_RANGE_DAYS } from "../RangePicker";
import { rangeDayCount, validateRange } from "../rangeMath";

const vp = (a: number, b: number): Viewport => ({
  visible_start_min: a,
  visible_end_min: b,
});

// ── viewportFromHourRange (seed) ──────────────────────────────────────────
describe("viewportFromHourRange", () => {
  it("maps [h0,h1] hours → minute bounds", () => {
    expect(viewportFromHourRange([8, 18])).toEqual(vp(8 * 60, 18 * 60));
  });
  it("falls back to [6,23] when undefined", () => {
    expect(viewportFromHourRange(undefined)).toEqual(vp(360, 1380));
  });
});

// ── deriveDataWindow ──────────────────────────────────────────────────────
// FIX (WP6b-1 Phase 2 verify-human back-loop, 2026-07-13): the data window is ALWAYS
// the whole day [0,1440], REGARDLESS of hour_range. If it equalled hour_range (which
// also seeds the viewport), the default-zoom viewport would fill the whole pannable
// range → clampViewport refuses to pan → drag felt dead. Full-day bounds give the
// active-hours seed headroom to pan into + zoom out to.
describe("deriveDataWindow — always the whole day (pan/zoom headroom)", () => {
  const base = (hour_range?: [number, number]): RangePayload => ({
    label: "x",
    projects: [],
    meta: { start: "2026-07-13", end: "2026-07-13", day_count: 1 },
    hour_range_by_day: {},
    day_window: [0, 1440],
    hour_range,
  });
  it("returns [0,1440] even when hour_range is a narrow active span", () => {
    // The seed (hour_range) is [8,12] but the pannable window is the whole day, so a
    // default-zoom viewport is a SUB-window with room to drag/zoom-out.
    expect(deriveDataWindow(base([8, 12]))).toEqual([0, 1440]);
  });
  it("returns [0,1440] with no hour_range", () => {
    expect(deriveDataWindow(base(undefined))).toEqual([0, 1440]);
  });
  it("does NOT collapse to hour_range (the pre-fix bug that killed drag-pan)", () => {
    const dw = deriveDataWindow(base([8, 12]));
    expect(dw).not.toEqual([480, 720]); // regression guard
    expect(dw[1] - dw[0]).toBe(1440); // full-day width
  });
});

// ── deriveDataWindow — multi-day (WP6b-4) ─────────────────────────────────
describe("deriveDataWindow — multi-day window [0, day_count*1440]", () => {
  const multi = (dayCount: number): RangePayload => ({
    label: "x",
    projects: [],
    meta: { start: "2026-07-01", end: "2026-07-01", day_count: dayCount },
    hour_range_by_day: {},
    day_window: [0, 1440],
  });
  it("a 3-day range → [0, 4320]", () => {
    expect(deriveDataWindow(multi(3))).toEqual([0, 4320]);
  });
  it("the 31-day cap → [0, 44640]", () => {
    expect(deriveDataWindow(multi(31))).toEqual([0, 31 * 1440]);
  });
  it("day_count 1 stays [0, 1440] (single-day unchanged)", () => {
    expect(deriveDataWindow(multi(1))).toEqual([0, 1440]);
  });
  it("degenerate day_count (<1 / missing) → safe [0,1440]", () => {
    expect(deriveDataWindow(multi(0))).toEqual([0, 1440]);
    const noMeta = { ...multi(3), meta: undefined } as unknown as RangePayload;
    expect(deriveDataWindow(noMeta)).toEqual([0, 1440]);
  });
});

// ── dayOffsetMin (WP6b-4 multi-day coordinate) ────────────────────────────
describe("dayOffsetMin — whole-days-between × 1440", () => {
  it("same day → 0", () => {
    expect(dayOffsetMin("2026-05-09", "2026-05-09")).toBe(0);
  });
  it("14 days later → 20160 (source-pinned example)", () => {
    expect(dayOffsetMin("2026-05-23", "2026-05-09")).toBe(14 * 1440);
  });
  it("one day later → 1440", () => {
    expect(dayOffsetMin("2026-07-02", "2026-07-01")).toBe(1440);
  });
  it("crosses a month boundary correctly", () => {
    // Jun 30 → Jul 2 is 2 days.
    expect(dayOffsetMin("2026-07-02", "2026-06-30")).toBe(2 * 1440);
  });
  it("null / undefined / empty either arg → 0 (single-day fallback)", () => {
    expect(dayOffsetMin(null, "2026-07-01")).toBe(0);
    expect(dayOffsetMin("2026-07-02", null)).toBe(0);
    expect(dayOffsetMin(undefined, undefined)).toBe(0);
    expect(dayOffsetMin("", "2026-07-01")).toBe(0);
  });
  it("malformed date → 0 (no NaN leak)", () => {
    expect(dayOffsetMin("not-a-date", "2026-07-01")).toBe(0);
  });
});

// ── formatDayLabel (WP6b-4 multi-day ruler labels) ────────────────────────
describe("formatDayLabel — 'MMM DD' from a day-index", () => {
  it("day 0 → the window start's date", () => {
    expect(formatDayLabel(0, "2026-07-15")).toBe("JUL 15");
  });
  it("day 1 → the next day", () => {
    expect(formatDayLabel(1, "2026-07-15")).toBe("JUL 16");
  });
  it("wraps a month boundary", () => {
    expect(formatDayLabel(2, "2026-06-30")).toBe("JUL 02");
  });
  it("zero-pads the day", () => {
    expect(formatDayLabel(0, "2026-01-05")).toBe("JAN 05");
  });
  it("absent / invalid windowStartIso → '' (safe blank, not a wrong label)", () => {
    expect(formatDayLabel(0, null)).toBe("");
    expect(formatDayLabel(3, undefined)).toBe("");
    expect(formatDayLabel(0, "garbage")).toBe("");
  });
});

// ── nowMarkerAbsMin (WP6b-4 P2 — the NOW-marker in-range guard + placement) ──
describe("nowMarkerAbsMin — today's marker coordinate, or null if out of window", () => {
  it("single-day (windowStartIso null) → nowMin, always shown (view IS today)", () => {
    expect(nowMarkerAbsMin(600, "2026-07-15", null, 1)).toBe(600);
    // todayIso is irrelevant in single-day mode (offset 0 by construction).
    expect(nowMarkerAbsMin(0, "any", null, 1)).toBe(0);
  });
  it("multi-day, today is the LAST day of the range → nowMin + lastDayOffset", () => {
    // 3-day range starting 07-13; today = 07-15 = lane 2 (in [0,3)). offset = 2*1440.
    expect(nowMarkerAbsMin(600, "2026-07-15", "2026-07-13", 3)).toBe(
      600 + 2 * 1440,
    );
  });
  it("multi-day, today is the FIRST day → nowMin + 0", () => {
    expect(nowMarkerAbsMin(480, "2026-07-13", "2026-07-13", 3)).toBe(480);
  });
  it("multi-day, today is a MIDDLE day → shifted onto that lane", () => {
    expect(nowMarkerAbsMin(720, "2026-07-14", "2026-07-13", 3)).toBe(
      720 + 1440,
    );
  });
  it("today AFTER the range (lane >= dayCount) → null (hidden)", () => {
    // 2-day range 07-13..07-14; today 07-15 = lane 2, not < 2 → out of range.
    expect(nowMarkerAbsMin(600, "2026-07-15", "2026-07-13", 2)).toBeNull();
  });
  it("today BEFORE the range (lane < 0) → null (hidden)", () => {
    // range starts 07-14; today 07-13 = lane -1 → out of range.
    expect(nowMarkerAbsMin(600, "2026-07-13", "2026-07-14", 3)).toBeNull();
  });
});

// ── clampViewport (the source's missing piece) ────────────────────────────
describe("clampViewport", () => {
  const dw: DataWindow = [360, 1380]; // 6:00 → 23:00, width 1020

  it("caps max zoom-out at the data-window width", () => {
    const out = clampViewport(vp(0, 5000), dw);
    expect(out.visible_end_min - out.visible_start_min).toBe(1020);
    expect(out).toEqual(vp(360, 1380));
  });

  it("floors max zoom-in at MIN_SPAN_MIN (1) and never inverts", () => {
    const out = clampViewport(vp(600, 600.2), dw);
    expect(out.visible_end_min - out.visible_start_min).toBeCloseTo(1, 5);
    expect(out.visible_start_min).toBeLessThan(out.visible_end_min);
  });

  it("collapses an inverted proposal to the floor (no NaN, no invert)", () => {
    const out = clampViewport(vp(800, 700), dw);
    expect(out.visible_start_min).toBeLessThan(out.visible_end_min);
    expect(Number.isNaN(out.visible_start_min)).toBe(false);
  });

  it("contains a pan past the LEFT edge, preserving width", () => {
    // 120-min window panned to start=0 (before lo=360) → parks at [360,480].
    const out = clampViewport(vp(0, 120), dw);
    expect(out.visible_end_min - out.visible_start_min).toBe(120);
    expect(out).toEqual(vp(360, 480));
  });

  it("contains a pan past the RIGHT edge, preserving width", () => {
    // 120-min window panned to end=2000 (after hi=1380) → parks at [1260,1380].
    const out = clampViewport(vp(1880, 2000), dw);
    expect(out.visible_end_min - out.visible_start_min).toBe(120);
    expect(out).toEqual(vp(1260, 1380));
  });

  it("leaves an in-bounds viewport unchanged", () => {
    expect(clampViewport(vp(600, 900), dw)).toEqual(vp(600, 900));
  });

  it("degenerate data window (width<=0) → safe non-NaN sliver", () => {
    const out = clampViewport(vp(100, 200), [500, 500]);
    expect(out).toEqual(vp(500, 501));
    expect(Number.isNaN(out.visible_end_min)).toBe(false);
  });
});

// ── clampViewport — 30-day zoom-out span cap (WP6b-4 re-spec D9) ────────────
describe("clampViewport — 30-day zoom-out cap (D9)", () => {
  const CAP = MAX_ZOOM_OUT_SPAN_MIN; // 30 * 1440 = 43200

  it("MAX_ZOOM_OUT_SPAN_MIN is 30 days of minutes", () => {
    expect(CAP).toBe(30 * 1440);
  });

  it("a window WIDER than 30 days cannot zoom out past the 30-day span", () => {
    // A fixed-origin coordinate window is exactly 30 days; a payload could feed a
    // slightly-wider window (e.g. an off-by-one guard) — the span still caps at 30d.
    const wide: DataWindow = [0, 45 * 1440]; // 45-day window
    const out = clampViewport(vp(0, 45 * 1440), wide);
    expect(out.visible_end_min - out.visible_start_min).toBe(CAP); // capped at 30d
  });

  it("pan still reaches the far (right) edge of a >30-day window (only span capped)", () => {
    const wide: DataWindow = [0, 45 * 1440];
    // Ask for a 30-day window parked at the right end.
    const out = clampViewport(vp(45 * 1440 - CAP, 45 * 1440), wide);
    expect(out.visible_end_min).toBe(45 * 1440); // reached the true right edge
    expect(out.visible_end_min - out.visible_start_min).toBe(CAP);
  });

  it("a window ≤30 days is byte-identical to the pre-cap behavior (back-compat)", () => {
    // 14-day window: the cap `min(windowWidth, 30d)` picks windowWidth → unchanged.
    const dw14: DataWindow = [0, 14 * 1440];
    const out = clampViewport(vp(-100, 14 * 1440 + 999), dw14);
    expect(out).toEqual(vp(0, 14 * 1440)); // full window, exactly the old max-zoom-out
  });

  it("an explicit maxSpanMin override caps below 30 days", () => {
    const dw: DataWindow = [0, 10 * 1440];
    const out = clampViewport(vp(0, 10 * 1440), dw, 1, 3 * 1440); // cap at 3 days
    expect(out.visible_end_min - out.visible_start_min).toBe(3 * 1440);
  });
});

// ── Flexible-timeline helpers (WP6b-4 re-spec — fixed-origin continuous timeline) ──
describe("seedViewportToday — legible ≈active-hours viewport on today's lane (D6′)", () => {
  const origin = "2026-06-16"; // today-29d for a 2026-07-15 "today"
  const today = "2026-07-15";

  it("frames today's lane at the given active-hours span", () => {
    // today is 29 days after origin → lane offset 29*1440. hour_range [8,18] → 480..1080.
    const out = seedViewportToday(origin, today, [8, 18]);
    expect(out).toEqual(vp(29 * 1440 + 480, 29 * 1440 + 1080));
  });

  it("falls back to the default [6,23] active-hours when hours are absent", () => {
    const out = seedViewportToday(origin, today, undefined);
    expect(out).toEqual(vp(29 * 1440 + 360, 29 * 1440 + 1380));
  });

  it("origin === today → lane offset 0 (single-day look)", () => {
    const out = seedViewportToday(today, today, [9, 17]);
    expect(out).toEqual(vp(540, 1020));
  });
});

describe("framedRange — the day-granular ISO span the viewport frames (D8 readout)", () => {
  const origin = "2026-06-16";
  const today = "2026-07-15";

  it("a one-lane viewport frames that single day (start===end)", () => {
    // lane 5 = 2026-06-21, framed 08:00..18:00 → both start & end are lane 5.
    const r = framedRange(vp(5 * 1440 + 480, 5 * 1440 + 1080), origin, today);
    expect(r).toEqual({ startIso: "2026-06-21", endIso: "2026-06-21" });
  });

  it("a viewport spanning three lanes frames a three-day range", () => {
    // start mid-lane 2, end mid-lane 4 → lanes 2..4 = Jun 18..Jun 20.
    const r = framedRange(vp(2 * 1440 + 600, 4 * 1440 + 600), origin, today);
    expect(r).toEqual({ startIso: "2026-06-18", endIso: "2026-06-20" });
  });

  it("a viewport ending exactly on a lane boundary does NOT count the next (empty) lane", () => {
    // start lane 0, end exactly at lane-2 boundary (2*1440) → last framed lane is 1.
    const r = framedRange(vp(0, 2 * 1440), origin, today);
    expect(r).toEqual({ startIso: "2026-06-16", endIso: "2026-06-17" });
  });

  it("clamps start to origin and end to today when the viewport over-pans the edges", () => {
    // start before origin (negative), end past today's lane (lane 40) → clamped.
    const r = framedRange(vp(-5000, 40 * 1440 + 100), origin, today);
    expect(r.startIso).toBe(origin); // clamped low
    expect(r.endIso).toBe(today); // clamped high
  });
});

// ── framedRange × RangePicker off-by-one (SURFACE-2026-07-15-QUALITY-WP6B4- ───
//    FRAMEDRANGE-PICKER-OFFBYONE, MAJOR) — reproduce-first (WP2 of the paydown sweep).
//
// The bug: a LEGAL max-zoom-out viewport (span capped at MAX_ZOOM_OUT_SPAN_MIN = 30*1440
// by clampViewport) that is DAY-MISALIGNED (panned by a fractional day) maps to 31
// INCLUSIVE lanes: `floor(start/1440)` … `ceil(end/1440)-1`. framedRange then emits a
// 31-inclusive-day ISO span, which validateRange(…, MAX_RANGE_DAYS=30) — the picker's
// live readout validator — flags as "Range too long", sticking the RangePicker in a
// permanent red-border error on a value the operator never typed.
//
// These tests assert the FIXED invariant: framedRange's output span never exceeds
// MAX_RANGE_DAYS inclusive days, so the reactive picker readout is always a value the
// picker itself accepts. They fail against the pre-fix framedRange.
describe("framedRange never emits a span the RangePicker rejects (off-by-one repro)", () => {
  // A wide origin→today gap so a 30-lane span sits comfortably inside [origin, today].
  const origin = "2026-05-01";
  const today = "2026-07-15";
  const MAX_SPAN = MAX_ZOOM_OUT_SPAN_MIN; // 30 * 1440 — the clampViewport zoom-out cap

  it("a day-MISALIGNED max-span viewport frames ≤ MAX_RANGE_DAYS inclusive days", () => {
    // A legal max-span viewport (exactly MAX_SPAN wide) shifted by half a day. Pre-fix:
    // floor(5.5)=5 … ceil(5.5+30)-1 = ceil(35.5)-1 = 35 → lanes 5..35 = 31 inclusive days.
    const start = 5.5 * 1440;
    const r = framedRange(vp(start, start + MAX_SPAN), origin, today);
    const days = rangeDayCount(r.startIso, r.endIso);
    expect(days).toBeLessThanOrEqual(MAX_RANGE_DAYS);
  });

  it("that framed span is ACCEPTED by the picker's own validateRange (no red border)", () => {
    const start = 5.5 * 1440;
    const r = framedRange(vp(start, start + MAX_SPAN), origin, today);
    // validateRange returns null when valid, an error string when it would show red.
    expect(validateRange(r.startIso, r.endIso, MAX_RANGE_DAYS)).toBeNull();
  });

  it("holds across a sweep of fractional pan offsets at max span", () => {
    // Any misalignment (0.0 .. 0.95 days) of a max-span camera must stay ≤ 30 inclusive days.
    for (let frac = 0; frac < 1; frac += 0.05) {
      const start = (10 + frac) * 1440; // lane 10-ish, fractionally shifted
      const r = framedRange(vp(start, start + MAX_SPAN), origin, today);
      expect(validateRange(r.startIso, r.endIso, MAX_RANGE_DAYS)).toBeNull();
    }
  });

  it("a genuinely 30-inclusive-day-aligned viewport still frames 30 days (no over-correction)", () => {
    // Regression guard for the fix: a viewport exactly covering 30 lanes (lanes 0..29,
    // span = 30*1440 aligned to the lane grid) must still frame all 30 days, not 29.
    const r = framedRange(vp(0, 30 * 1440), origin, today);
    expect(rangeDayCount(r.startIso, r.endIso)).toBe(MAX_RANGE_DAYS); // 30 days, lanes 0..29
  });

  it("MAX_RANGE_DAYS is 30 AND is the same number as the zoom-out cap (the reconciliation)", () => {
    // The fix ties the picker max to the timeline's zoom-out cap so they can never drift
    // apart (the drift is exactly what produced the 31st lane). Pin both the value and the tie.
    expect(MAX_RANGE_DAYS).toBe(30);
    expect(MAX_RANGE_DAYS).toBe(MAX_ZOOM_OUT_SPAN_MIN / 1440);
    // The pure layer's MAX_FRAMED_DAYS and the picker's MAX_RANGE_DAYS are two parallel
    // derivations (kept separate to avoid a viewport↔RangePicker import cycle). This tie catches
    // a future `+1`-style drift in either (SURFACE-2026-07-20-QUALITY-WP2-MAXFRAMED-MAXRANGE-
    // PARALLEL-DERIVATION) — making the "they are one number" comments literally enforced.
    expect(MAX_FRAMED_DAYS).toBe(MAX_RANGE_DAYS);
  });
});

describe("needsExtend — auto-extend edge trigger (D7)", () => {
  const coordEnd = 30 * 1440; // fixed 30-day coordinate window end
  // Loaded = the last 14 days ending today, in coordinate minutes. Origin=today-29d,
  // so today's lane is 29; the 14-day window is lanes 16..29 → [16*1440, 30*1440).
  const loaded: DataWindow = [16 * 1440, 30 * 1440];

  it("fires 'older' when the viewport nears the loaded LOWER bound and older data exists", () => {
    // viewport start just inside the ½-day threshold of loaded lo (16*1440).
    const vpNearLo = vp(16 * 1440 + 300, 16 * 1440 + 900);
    expect(needsExtend(vpNearLo, loaded, coordEnd)).toBe("older");
  });

  it("does NOT fire 'older' when the loaded window already reaches the origin (lo===0)", () => {
    const fullyBack: DataWindow = [0, 30 * 1440];
    const vpAtOrigin = vp(0, 600);
    expect(needsExtend(vpAtOrigin, fullyBack, coordEnd)).toBe(null);
  });

  it("fires 'newer' when the viewport nears the loaded UPPER bound and loaded doesn't reach today", () => {
    // Loaded window that stops short of today (hi < coordEnd), e.g. after a jump-to-past.
    const pastLoaded: DataWindow = [5 * 1440, 12 * 1440];
    const vpNearHi = vp(11 * 1440 + 800, 12 * 1440 - 100);
    expect(needsExtend(vpNearHi, pastLoaded, coordEnd)).toBe("newer");
  });

  it("does NOT fire 'newer' when the loaded window already reaches the coordinate end (today)", () => {
    // loaded hi === coordEnd (reaches today) → no forward extend even at the right edge.
    const vpNearHi = vp(29 * 1440 + 800, 30 * 1440 - 50);
    expect(needsExtend(vpNearHi, loaded, coordEnd)).toBe(null);
  });

  it("returns null in the comfortable middle of the loaded window", () => {
    const vpMiddle = vp(22 * 1440, 23 * 1440);
    expect(needsExtend(vpMiddle, loaded, coordEnd)).toBe(null);
  });

  it("'older' takes precedence when a very wide viewport nears both edges", () => {
    // A viewport spanning nearly the whole loaded window touches both thresholds.
    const wideVp = vp(16 * 1440 + 100, 30 * 1440 - 100);
    const bothOpen: DataWindow = [16 * 1440, 20 * 1440]; // lo>0 and hi<coordEnd
    expect(needsExtend(wideVp, bothOpen, coordEnd)).toBe("older");
  });
});

// ── nextExtendGuard: firingRef latch (SURFACE-2026-07-15-QUALITY-WP6B4- ───────
//    AUTOEXTEND-FIRINGREF-LATCH, MAJOR) — reproduce-first (WP2 of the paydown sweep).
//
// The AutoExtendWatcher's `firingRef` de-dupes fires WHILE an extend is in flight; a wider
// loadedWindow (post-fetch) clears it. But an `onExtend` that is a NO-OP at a coordinate
// edge (already at origin floor / today) never changes loadedWindow → the clearing effect
// never runs → the guard stays latched. Because ONE guard gates both directions, a latched
// `older` guard then blocks a later legitimate `newer` extend at the opposite edge.
//
// `nextExtendGuard(dir, currentGuard)` is the pure decision the debounced tick makes. These
// tests assert the FIXED invariant: a `null` needsExtend result must CLEAR the guard so a
// no-op-latched guard can never permanently block the other direction. They fail against the
// pre-fix "null leaves the guard unchanged" behavior.
describe("nextExtendGuard — the in-flight guard must not latch on a no-op extend", () => {
  it("fires and arms the guard when a direction is needed and none is in flight", () => {
    expect(nextExtendGuard("older", false)).toEqual({
      fire: true,
      nextGuard: true,
    });
    expect(nextExtendGuard("newer", false)).toEqual({
      fire: true,
      nextGuard: true,
    });
  });

  it("holds (no double-fire) while an extend is already in flight", () => {
    expect(nextExtendGuard("older", true)).toEqual({
      fire: false,
      nextGuard: true,
    });
    expect(nextExtendGuard("newer", true)).toEqual({
      fire: false,
      nextGuard: true,
    });
  });

  it("CLEARS the guard when no extend is needed (the latch fix)", () => {
    // The load-bearing assertion: a null result must reset the guard to false, so a guard
    // that was latched by a no-op edge-fire is released the next time the camera is not at
    // an extend threshold.
    expect(nextExtendGuard(null, true)).toEqual({
      fire: false,
      nextGuard: false,
    });
    expect(nextExtendGuard(null, false)).toEqual({
      fire: false,
      nextGuard: false,
    });
  });

  it("does NOT permanently block the opposite direction after a no-op edge latch (full trace)", () => {
    // Trace the exact latent-bug sequence:
    //   1. Camera nears the OLDER edge but we're already at the origin floor → onExtend is a
    //      no-op; loadedWindow never changes, so the guard is NOT cleared by a new window.
    let guard = false;
    const step1 = nextExtendGuard("older", guard); // needs older, none in flight
    guard = step1.nextGuard;
    expect(step1.fire).toBe(true);
    expect(guard).toBe(true); // guard armed by the (no-op) fire

    //   2. Camera moves away from any edge (needsExtend → null). This tick MUST release the
    //      guard — otherwise the no-op fire has latched it permanently.
    const step2 = nextExtendGuard(null, guard);
    guard = step2.nextGuard;
    expect(guard).toBe(false); // <-- fails pre-fix (guard stays true)

    //   3. Camera later nears the NEWER edge with real forward data available. With the guard
    //      released it fires; with a latched guard it would be silently blocked.
    const step3 = nextExtendGuard("newer", guard);
    expect(step3.fire).toBe(true); // legitimate newer extend not blocked
  });
});

// ── viewportPct / fracToDataMin ────────────────────────────────────────────
describe("viewportPct", () => {
  it("computes left/width % within the viewport", () => {
    // viewport 600..1200 (600 wide); span 700..760 → left 100/600, width 60/600.
    const out = viewportPct(700, 760, vp(600, 1200));
    expect(out.left).toBe(`${(100 / 600) * 100}%`);
    expect(out.width).toBe(`${(60 / 600) * 100}%`);
  });
  it("degenerate (0-width) viewport → 0%/0%, never NaN", () => {
    expect(viewportPct(10, 20, vp(500, 500))).toEqual({
      left: "0%",
      width: "0%",
    });
  });
});

describe("fracToDataMin", () => {
  it("maps a fractional position to a data-minute", () => {
    expect(fracToDataMin(0.5, vp(600, 1200))).toBe(900);
    expect(fracToDataMin(0, vp(600, 1200))).toBe(600);
    expect(fracToDataMin(1, vp(600, 1200))).toBe(1200);
  });
});

// ── viewportSeedKey (the ViewportProvider re-seed decision, pinned pure) ────
describe("viewportSeedKey — re-seed only on a genuinely new window", () => {
  const dw: DataWindow = [360, 1380];

  it("is STABLE across identical (seed, dataWindow) inputs from a re-fetch", () => {
    // Two fresh objects with the same numeric bounds (what an identical day re-query
    // produces) → same key → provider does NOT re-seed → user's pan/zoom preserved.
    const a = viewportSeedKey({ ...vp(360, 1380) }, [...dw] as DataWindow);
    const b = viewportSeedKey({ ...vp(360, 1380) }, [...dw] as DataWindow);
    expect(a).toBe(b);
  });

  it("CHANGES when the seed window differs (a different day's active hours)", () => {
    const a = viewportSeedKey(vp(360, 1380), dw);
    const b = viewportSeedKey(vp(480, 1260), dw); // different hour_range → re-seed
    expect(a).not.toBe(b);
  });

  it("CHANGES when the data window differs", () => {
    const a = viewportSeedKey(vp(360, 1380), [360, 1380]);
    const b = viewportSeedKey(vp(360, 1380), [0, 1440]);
    expect(a).not.toBe(b);
  });
});

// ── pickTickInterval (adaptive density) ────────────────────────────────────
describe("pickTickInterval — densest in the [8,30] band", () => {
  it("full-day-ish window → 60m (17h → 17 ticks)", () => {
    // 360..1380 = 1020 min. 1020/60 = 17 ticks (in-band). 1020/30 = 34 (out).
    expect(pickTickInterval(vp(360, 1380))).toBe(60);
  });
  it("~6h window → 30m (12 ticks)", () => {
    // 360 min. /60 = 6 (below 8); /30 = 12 (in-band).
    expect(pickTickInterval(vp(600, 960))).toBe(30);
  });
  it("~2h window → 15m ... verifies the descent past 60/30", () => {
    // 120 min. /30 = 4 (below 8); /15 = 8 (in-band).
    expect(pickTickInterval(vp(600, 720))).toBe(15);
  });
  it("extreme zoom-in (<8m span) → 1m", () => {
    expect(pickTickInterval(vp(600, 605))).toBe(1);
  });
  it("extreme zoom-out (>30 days) → 1440m", () => {
    expect(pickTickInterval(vp(0, 60000))).toBe(1440);
  });
  it("degenerate (0-width) → 1m, no crash", () => {
    expect(pickTickInterval(vp(500, 500))).toBe(1);
  });
});

// ── ticksInViewport ────────────────────────────────────────────────────────
describe("ticksInViewport", () => {
  it("emits minute-aligned ticks, HH:00 labels at 60m, none past end", () => {
    const ticks = ticksInViewport(vp(360, 540), 60); // 6:00..9:00
    expect(ticks.map((t) => t.min)).toEqual([360, 420, 480]); // 540 excluded (strict <)
    expect(ticks.map((t) => t.label)).toEqual(["06:00", "07:00", "08:00"]);
  });
  it("HH:MM labels at a finer interval", () => {
    const ticks = ticksInViewport(vp(600, 660), 15); // 10:00..11:00
    expect(ticks.map((t) => t.label)).toEqual([
      "10:00",
      "10:15",
      "10:30",
      "10:45",
    ]);
  });
  it("aligns the first tick to the interval when start is off-grid", () => {
    const ticks = ticksInViewport(vp(607, 700), 30); // first aligned 30m >= 607 = 630
    expect(ticks[0].min).toBe(630);
  });
  it("empty when interval is non-positive (no crash)", () => {
    expect(ticksInViewport(vp(360, 540), 0)).toEqual([]);
  });

  // ── WP6b-4 multi-day label branches ──────────────────────────────────────
  it("single-day output is BYTE-IDENTICAL whether windowStartIso is absent or given", () => {
    // Back-compat regression gate: passing windowStartIso must not change a
    // non-crossing single-day viewport's labels.
    const a = ticksInViewport(vp(360, 540), 60);
    const b = ticksInViewport(vp(360, 540), 60, "2026-07-15");
    expect(b).toEqual(a);
  });
  it("day-level interval (>=1440) → 'MMM DD' labels per day", () => {
    // A 3-day viewport [0, 4320] at 1440m interval → one tick per day, date-labeled.
    const ticks = ticksInViewport(vp(0, 4320), 1440, "2026-07-15");
    expect(ticks.map((t) => t.min)).toEqual([0, 1440, 2880]);
    expect(ticks.map((t) => t.label)).toEqual(["JUL 15", "JUL 16", "JUL 17"]);
  });
  it("multi-day intra-day ticks: first tick of each new day gets the 'MMM DD' prefix", () => {
    // A viewport crossing one midnight (day 0 → day 1) at 60m, with windowStart:
    // the tick AT minute 1440 (midnight of day 1, minOfDay 0) → the date label;
    // the others stay HH:00.
    const ticks = ticksInViewport(vp(1380, 1560), 60, "2026-07-15"); // 23:00 day0 → 02:00 day1
    const byMin = Object.fromEntries(ticks.map((t) => [t.min, t.label]));
    expect(byMin[1380]).toBe("23:00"); // day 0, 23:00
    expect(byMin[1440]).toBe("JUL 16"); // day 1 midnight → date prefix
    expect(byMin[1500]).toBe("01:00"); // day 1, 01:00
  });
  it("crossing midnight WITHOUT windowStartIso → no date prefix (single-day fallback labels)", () => {
    const ticks = ticksInViewport(vp(1380, 1560), 60); // no windowStart
    const byMin = Object.fromEntries(ticks.map((t) => [t.min, t.label]));
    expect(byMin[1440]).toBe("00:00"); // plain HH:00, no date
  });
});
