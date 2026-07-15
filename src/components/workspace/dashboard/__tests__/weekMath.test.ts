import { describe, expect, it } from "vitest";
import type { RollupCell } from "../../../../state/timeAnalytics";
import {
  parseDayHeader,
  isWeekendDow,
  cellKindMinutes,
  cellSegments,
  cellTotal,
  cellActive,
  weekCeiling,
  projectWeekActive,
  mondayOfDate,
  prevMondayIso,
  nextMondayIso,
  weekNavLabel,
  isFutureMonday,
} from "../weekMath";

/** A rollup cell builder — zeros unless overridden. */
function cell(over: Partial<RollupCell> = {}): RollupCell {
  return {
    ai_doing: 0,
    subagent: 0,
    ai_reasoning: 0,
    typing: 0,
    reviewing: 0,
    away: 0,
    prompts: 0,
    ...over,
  };
}

describe("weekMath — parseDayHeader", () => {
  it("parses the current backend shape 'MON · JUL 13'", () => {
    expect(parseDayHeader("MON · JUL 13")).toEqual({ dow: "MON", dayNum: 13 });
  });

  it("parses the older 'MON 13' shape", () => {
    expect(parseDayHeader("MON 13")).toEqual({ dow: "MON", dayNum: 13 });
  });

  it("takes the LAST integer token as the day number", () => {
    // "· JUL 13" has JUL between the dot and the number — day number is still 13.
    expect(parseDayHeader("SUN · DEC 7").dayNum).toBe(7);
  });

  it("handles a single-digit day and extra whitespace", () => {
    expect(parseDayHeader("  TUE  ·  JAN  1 ")).toEqual({
      dow: "TUE",
      dayNum: 1,
    });
  });

  it("degrades to {dow: raw, dayNum: 0} on an unparseable label", () => {
    expect(parseDayHeader("")).toEqual({ dow: "", dayNum: 0 });
    expect(parseDayHeader("FRI")).toEqual({ dow: "FRI", dayNum: 0 });
  });
});

describe("weekMath — isWeekendDow", () => {
  it("SAT and SUN are weekend, case-insensitively; weekdays are not", () => {
    expect(isWeekendDow("SAT")).toBe(true);
    expect(isWeekendDow("sun")).toBe(true);
    expect(isWeekendDow("MON")).toBe(false);
    expect(isWeekendDow("Fri")).toBe(false);
  });
});

describe("weekMath — cell field mapping", () => {
  it("cellKindMinutes reads each SegKind from its snake_case RollupCell field", () => {
    const c = cell({
      ai_doing: 10,
      subagent: 20,
      ai_reasoning: 30,
      typing: 40,
      reviewing: 50,
      away: 60,
    });
    expect(cellKindMinutes(c, "ai-doing")).toBe(10);
    expect(cellKindMinutes(c, "subagent")).toBe(20);
    expect(cellKindMinutes(c, "ai-reasoning")).toBe(30);
    expect(cellKindMinutes(c, "typing")).toBe(40);
    expect(cellKindMinutes(c, "reviewing")).toBe(50);
    expect(cellKindMinutes(c, "away")).toBe(60);
  });
});

describe("weekMath — cellSegments", () => {
  it("returns only non-zero kinds, EXCLUDING away, bottom-to-top in RENDER_ORDER", () => {
    const c = cell({ ai_doing: 5, subagent: 3, reviewing: 2, away: 99, typing: 0 });
    const segs = cellSegments(c);
    // RENDER_ORDER (minus away): reviewing, ai-reasoning, typing, ai-doing, subagent
    expect(segs.map((s) => s.kind)).toEqual([
      "reviewing",
      "ai-doing",
      "subagent",
    ]);
    expect(segs.find((s) => s.kind === "away")).toBeUndefined();
  });

  it("an all-zero cell yields no segments", () => {
    expect(cellSegments(cell())).toEqual([]);
  });

  it("an away-only cell yields no painted segments", () => {
    expect(cellSegments(cell({ away: 120 }))).toEqual([]);
  });
});

describe("weekMath — cellTotal / cellActive", () => {
  it("cellTotal sums painted (non-away) minutes only", () => {
    const c = cell({ ai_doing: 10, typing: 5, away: 100 });
    expect(cellTotal(c)).toBe(15);
  });

  it("cellActive sums the AI family only (ai-doing + subagent + ai-reasoning)", () => {
    const c = cell({
      ai_doing: 10,
      subagent: 4,
      ai_reasoning: 6,
      typing: 99,
      reviewing: 99,
      away: 99,
    });
    expect(cellActive(c)).toBe(20);
  });
});

describe("weekMath — weekCeiling", () => {
  it("rounds the busiest day's painted total up to the next hour + 30m", () => {
    // busiest painted total = 70 → ceil(70/60)*60 + 30 = 120 + 30 = 150
    const rollups = [[cell({ ai_doing: 70 }), cell({ typing: 20 })]];
    expect(weekCeiling(rollups)).toBe(150);
  });

  it("an empty/flat week never divides by zero (ceiling >= 30)", () => {
    expect(weekCeiling([[cell(), cell()]])).toBe(30);
    expect(weekCeiling([])).toBe(30);
  });

  it("ignores away when finding the busiest day", () => {
    // away=1000 but painted=0 everywhere → ceiling stays 30
    expect(weekCeiling([[cell({ away: 1000 })]])).toBe(30);
  });
});

describe("weekMath — projectWeekActive", () => {
  it("sums AI-family minutes across all 7 cells", () => {
    const rollup = [
      cell({ ai_doing: 10, typing: 99 }),
      cell({ subagent: 5 }),
      cell({ ai_reasoning: 3, away: 500 }),
      cell(),
      cell(),
      cell(),
      cell(),
    ];
    expect(projectWeekActive(rollup)).toBe(18);
  });
});

// ── ISO-week date arithmetic (WP6b-3 — Week-nav) ────────────────────────────
// Fixed anchors with known weekdays (all local-constructed to avoid TZ flakiness):
//   2026-06-15 = Monday · 2026-06-18 = Thursday · 2026-07-13 = Monday
//   2025-12-29 = Monday (its Sunday is 2026-01-04 — cross-year week)

describe("weekMath — mondayOfDate", () => {
  it("returns the same day when it is already a Monday", () => {
    // 2026-06-15 is a Monday.
    expect(mondayOfDate(new Date(2026, 5, 15))).toBe("2026-06-15");
  });

  it("steps back to the week's Monday from any weekday", () => {
    // Thursday 2026-06-18 → Monday 2026-06-15.
    expect(mondayOfDate(new Date(2026, 5, 18))).toBe("2026-06-15");
    // Sunday 2026-06-21 → Monday 2026-06-15 (Sunday is the last day, Monday-first).
    expect(mondayOfDate(new Date(2026, 5, 21))).toBe("2026-06-15");
  });

  it("wraps across a month boundary", () => {
    // Wednesday 2026-07-01 → Monday 2026-06-29.
    expect(mondayOfDate(new Date(2026, 6, 1))).toBe("2026-06-29");
  });
});

describe("weekMath — prevMondayIso / nextMondayIso", () => {
  it("steps ±7 days", () => {
    expect(prevMondayIso("2026-06-15")).toBe("2026-06-08");
    expect(nextMondayIso("2026-06-15")).toBe("2026-06-22");
  });

  it("wraps across a month boundary", () => {
    // Monday 2026-07-06 → prev Monday 2026-06-29.
    expect(prevMondayIso("2026-07-06")).toBe("2026-06-29");
    // Monday 2026-06-29 → next Monday 2026-07-06.
    expect(nextMondayIso("2026-06-29")).toBe("2026-07-06");
  });

  it("wraps across a year boundary", () => {
    // Monday 2026-01-05 → prev Monday 2025-12-29.
    expect(prevMondayIso("2026-01-05")).toBe("2025-12-29");
    // Monday 2025-12-29 → next Monday 2026-01-05.
    expect(nextMondayIso("2025-12-29")).toBe("2026-01-05");
  });

  it("falls back to today's Monday on malformed input (never throws)", () => {
    const today = mondayOfDate(new Date());
    expect(prevMondayIso("garbage")).toBe(today);
    expect(nextMondayIso("2026-13-40")).toBe(today);
    // @ts-expect-error — defensive against non-string at runtime
    expect(prevMondayIso(null)).toBe(today);
  });
});

describe("weekMath — weekNavLabel", () => {
  it("labels the Mon–Sun span of a week", () => {
    // Monday 2026-06-15 → Sunday 2026-06-21.
    expect(weekNavLabel("2026-06-15")).toBe("Jun 15 – Jun 21");
  });

  it("spans a month boundary in the label", () => {
    // Monday 2026-06-29 → Sunday 2026-07-05.
    expect(weekNavLabel("2026-06-29")).toBe("Jun 29 – Jul 5");
  });

  it("spans a year boundary in the label", () => {
    // Monday 2025-12-29 → Sunday 2026-01-04.
    expect(weekNavLabel("2025-12-29")).toBe("Dec 29 – Jan 4");
  });

  it("returns an em-dash on malformed input", () => {
    expect(weekNavLabel("nope")).toBe("—");
    expect(weekNavLabel("")).toBe("—");
  });
});

describe("weekMath — isFutureMonday", () => {
  it("is false for the current week's Monday", () => {
    // now = Thursday 2026-06-18 → this week's Monday is 2026-06-15.
    const now = new Date(2026, 5, 18);
    expect(isFutureMonday("2026-06-15", now)).toBe(false);
  });

  it("is false for a past week's Monday", () => {
    const now = new Date(2026, 5, 18);
    expect(isFutureMonday("2026-06-08", now)).toBe(false);
    expect(isFutureMonday("2026-05-04", now)).toBe(false);
  });

  it("is true for a future week's Monday", () => {
    // now = 2026-06-18 (week of 06-15); next week's Monday 06-22 is in the future.
    const now = new Date(2026, 5, 18);
    expect(isFutureMonday("2026-06-22", now)).toBe(true);
    expect(isFutureMonday("2026-07-06", now)).toBe(true);
  });

  it("fails safe (true → disable next) on malformed input", () => {
    expect(isFutureMonday("garbage", new Date(2026, 5, 18))).toBe(true);
  });
});
