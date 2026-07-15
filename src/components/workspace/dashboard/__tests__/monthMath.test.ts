import { describe, expect, it } from "vitest";
import type {
  RangePayload,
  SegPayload,
  SessionPayload,
} from "../../../../state/timeAnalytics";
import {
  monthIsoToParts,
  monthIsoToLabel,
  prevMonthIso,
  nextMonthIso,
  daysInMonth,
  mondayIndex,
  intensityColor,
  MONTH_INTENSITY_PALETTE,
  dayTotalsFromRange,
  monthMax,
  monthRangeMs,
  dayRangeMs,
  todayMonthIso,
  todayDateIso,
} from "../monthMath";

describe("monthMath — monthIsoToParts", () => {
  it("parses a valid ISO month", () => {
    expect(monthIsoToParts("2026-07")).toEqual({ year: 2026, month: 7 });
    expect(monthIsoToParts("2026-01")).toEqual({ year: 2026, month: 1 });
    expect(monthIsoToParts("2026-12")).toEqual({ year: 2026, month: 12 });
  });

  it("returns null on malformed input or out-of-range month", () => {
    expect(monthIsoToParts("2026-13")).toBeNull();
    expect(monthIsoToParts("2026-00")).toBeNull();
    expect(monthIsoToParts("2026-7")).toBeNull(); // not zero-padded
    expect(monthIsoToParts("2026")).toBeNull();
    expect(monthIsoToParts("")).toBeNull();
    // @ts-expect-error — defensive against non-string at runtime
    expect(monthIsoToParts(null)).toBeNull();
  });
});

describe("monthMath — monthIsoToLabel", () => {
  it("labels a valid month; em-dash on malformed", () => {
    expect(monthIsoToLabel("2026-07")).toBe("July 2026");
    expect(monthIsoToLabel("2025-12")).toBe("December 2025");
    expect(monthIsoToLabel("bogus")).toBe("—");
  });
});

describe("monthMath — prev/next month arithmetic (wraps the year)", () => {
  it("prevMonthIso wraps January → previous December", () => {
    expect(prevMonthIso("2026-07")).toBe("2026-06");
    expect(prevMonthIso("2026-01")).toBe("2025-12");
    expect(prevMonthIso("bogus")).toBeNull();
  });

  it("nextMonthIso wraps December → next January", () => {
    expect(nextMonthIso("2026-07")).toBe("2026-08");
    expect(nextMonthIso("2026-12")).toBe("2027-01");
    expect(nextMonthIso("bogus")).toBeNull();
  });
});

describe("monthMath — daysInMonth", () => {
  it("returns the correct day count including leap Feb", () => {
    expect(daysInMonth(2026, 7)).toBe(31); // July
    expect(daysInMonth(2026, 4)).toBe(30); // April
    expect(daysInMonth(2026, 2)).toBe(28); // Feb 2026 (not leap)
    expect(daysInMonth(2024, 2)).toBe(29); // Feb 2024 (leap)
  });
});

describe("monthMath — mondayIndex (Monday-first)", () => {
  it("maps JS Sunday-first getDay to Monday-first 0..6", () => {
    // 2026-07-13 is a Monday.
    expect(mondayIndex(new Date(2026, 6, 13))).toBe(0); // Mon → 0
    expect(mondayIndex(new Date(2026, 6, 14))).toBe(1); // Tue → 1
    expect(mondayIndex(new Date(2026, 6, 19))).toBe(6); // Sun → 6
    expect(mondayIndex(new Date(2026, 6, 18))).toBe(5); // Sat → 5
  });
});

describe("monthMath — intensityColor (dark ramp, lower-biased quintiles)", () => {
  it("<= 0 → the empty bucket", () => {
    expect(intensityColor(0)).toBe(MONTH_INTENSITY_PALETTE[0]);
    expect(intensityColor(-1)).toBe(MONTH_INTENSITY_PALETTE[0]);
  });

  it("a tiny positive intensity still gets a visible bucket-1 cell (not empty)", () => {
    expect(intensityColor(0.01)).toBe(MONTH_INTENSITY_PALETTE[1]);
    expect(intensityColor(0.09)).toBe(MONTH_INTENSITY_PALETTE[1]);
  });

  it("climbs the ramp through the quintile boundaries", () => {
    expect(intensityColor(0.1)).toBe(MONTH_INTENSITY_PALETTE[2]);
    expect(intensityColor(0.3)).toBe(MONTH_INTENSITY_PALETTE[3]);
    expect(intensityColor(0.55)).toBe(MONTH_INTENSITY_PALETTE[4]);
    expect(intensityColor(0.8)).toBe(MONTH_INTENSITY_PALETTE[5]);
    expect(intensityColor(1)).toBe(MONTH_INTENSITY_PALETTE[5]);
  });

  it("the ramp is dark-anchored: empty is dark, busiest is the brightest", () => {
    // Extract L channels; the busiest bucket must be LIGHTER than empty (dark→bright).
    const L = (c: string) => parseFloat(/oklch\(\s*([0-9.]+)/.exec(c)![1]);
    expect(L(MONTH_INTENSITY_PALETTE[5])).toBeGreaterThan(
      L(MONTH_INTENSITY_PALETTE[0]),
    );
    // Empty bucket sits low (dark), just above the surfaceDim ground.
    expect(L(MONTH_INTENSITY_PALETTE[0])).toBeLessThan(0.35);
  });
});

// ── dayTotalsFromRange ──────────────────────────────────────────────────────
function seg(kind: SegPayload["kind"], durMs: number): SegPayload {
  return { kind, start: 0, end: 0, dur_ms: durMs };
}
function session(
  id: string,
  dayIso: string,
  segs: SegPayload[],
): SessionPayload {
  return { id, start: 0, end: 0, prompts: 0, tools: {}, segs, day_iso: dayIso };
}
function rangePayload(
  projects: { id: string; sessions: SessionPayload[] }[],
): RangePayload {
  return {
    label: "test",
    projects: projects.map((p) => ({
      id: p.id,
      alias: p.id,
      path: `/${p.id}`,
      sessions: p.sessions,
    })),
    meta: { start: "2026-07-01", end: "2026-07-31", day_count: 31 },
    hour_range_by_day: {},
    day_window: [0, 1440],
  };
}

describe("monthMath — dayTotalsFromRange (sums dur_ms, AI family only)", () => {
  it("null / empty payload → empty map", () => {
    expect(dayTotalsFromRange(null).size).toBe(0);
    expect(dayTotalsFromRange(rangePayload([])).size).toBe(0);
  });

  it("sums TRUE dur_ms across the AI family, rounds each day to minutes ONCE", () => {
    // Two sub-minute ai-doing segs on the same day: 40s + 40s = 80s → rounds to 1 min
    // (round-half-up: floor((80000+30000)/60000)=1). The old end-start sum would zero both.
    const payload = rangePayload([
      {
        id: "p1",
        sessions: [
          session("s1", "2026-07-13", [
            seg("ai-doing", 40_000),
            seg("ai-doing", 40_000),
          ]),
        ],
      },
    ]);
    expect(dayTotalsFromRange(payload).get("2026-07-13")).toBe(1);
  });

  it("excludes human kinds (typing/reviewing/away) from the intensity total", () => {
    const payload = rangePayload([
      {
        id: "p1",
        sessions: [
          session("s1", "2026-07-13", [
            seg("ai-doing", 120_000), // 2 min AI
            seg("typing", 600_000), // 10 min human — excluded
            seg("reviewing", 600_000), // excluded
            seg("away", 600_000), // excluded
          ]),
        ],
      },
    ]);
    expect(dayTotalsFromRange(payload).get("2026-07-13")).toBe(2);
  });

  it("aggregates multiple sessions/projects on the same iso", () => {
    const payload = rangePayload([
      {
        id: "p1",
        sessions: [
          session("s1", "2026-07-13", [seg("ai-doing", 120_000)]), // 2 min
          session("s2", "2026-07-13", [seg("subagent", 180_000)]), // 3 min
        ],
      },
      {
        id: "p2",
        sessions: [session("s3", "2026-07-13", [seg("ai-reasoning", 60_000)])], // 1 min
      },
    ]);
    // 120000 + 180000 + 60000 = 360000 ms → 6 min
    expect(dayTotalsFromRange(payload).get("2026-07-13")).toBe(6);
  });

  it("keys distinct isos separately", () => {
    const payload = rangePayload([
      {
        id: "p1",
        sessions: [
          session("s1", "2026-07-13", [seg("ai-doing", 120_000)]),
          session("s2", "2026-07-14", [seg("ai-doing", 300_000)]),
        ],
      },
    ]);
    const m = dayTotalsFromRange(payload);
    expect(m.get("2026-07-13")).toBe(2);
    expect(m.get("2026-07-14")).toBe(5);
  });
});

describe("monthMath — monthMax", () => {
  it("returns the busiest day's minutes (0 on empty)", () => {
    expect(monthMax(new Map())).toBe(0);
    expect(
      monthMax(
        new Map([
          ["2026-07-13", 30],
          ["2026-07-14", 90],
          ["2026-07-15", 5],
        ]),
      ),
    ).toBe(90);
  });
});

describe("monthMath — month/day range bounds", () => {
  it("monthRangeMs spans first-local-midnight to last-day 23:59:59.999", () => {
    const b = monthRangeMs("2026-07")!;
    const start = new Date(b.start_ms);
    const end = new Date(b.end_ms);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6); // July (0-based)
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(31); // July has 31 days
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(b.end_ms).toBeGreaterThan(b.start_ms);
    expect(monthRangeMs("bogus")).toBeNull();
  });

  it("dayRangeMs spans one local day's midnight-to-end", () => {
    const b = dayRangeMs("2026-07-13")!;
    const start = new Date(b.start_ms);
    const end = new Date(b.end_ms);
    expect(start.getDate()).toBe(13);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(13);
    expect(end.getHours()).toBe(23);
    expect(dayRangeMs("2026-07")).toBeNull(); // not a full date
    expect(dayRangeMs("bogus")).toBeNull();
  });
});

describe("monthMath — today iso helpers", () => {
  it("formats today's month + date from a Date (local, zero-padded)", () => {
    const d = new Date(2026, 0, 5); // 2026-01-05 local
    expect(todayMonthIso(d)).toBe("2026-01");
    expect(todayDateIso(d)).toBe("2026-01-05");
  });
});
