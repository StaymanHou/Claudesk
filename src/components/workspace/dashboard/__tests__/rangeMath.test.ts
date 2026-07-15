import { describe, expect, it } from "vitest";
import {
  validateRange,
  localTodayIso,
  rangeDayCount,
  isSingleDay,
  rangeToMs,
  stepIso,
} from "../rangeMath";

// A stable "today" for the future-branch tests. localTodayIso derives from a Date, so we
// pass a fixed one; validateRange calls localTodayIso(new Date()) internally, so the
// future test uses a date far in the past for `end` to stay valid regardless of run date,
// and a clearly-future date to trip the future branch.
describe("rangeMath — validateRange (branch order + all branches)", () => {
  const MAX = 90;

  it("missing either date → 'Pick both'", () => {
    expect(validateRange("", "2026-07-13", MAX)).toBe(
      "Pick both start and end dates.",
    );
    expect(validateRange("2026-07-13", "", MAX)).toBe(
      "Pick both start and end dates.",
    );
  });

  it("bad shape → 'YYYY-MM-DD form'", () => {
    expect(validateRange("2026-7-1", "2026-07-13", MAX)).toBe(
      "Dates must be in YYYY-MM-DD form.",
    );
    expect(validateRange("2026/07/13", "2026-07-14", MAX)).toBe(
      "Dates must be in YYYY-MM-DD form.",
    );
  });

  it("unreal date (well-formed but NaN parse) → 'not a real date'", () => {
    // "2026-13-40" matches the regex shape but Date.parse → NaN.
    expect(validateRange("2026-13-40", "2026-13-41", MAX)).toBe(
      "One of the dates is not a real date.",
    );
  });

  it("end before start → 'on or after'", () => {
    expect(validateRange("2026-07-14", "2026-07-13", MAX)).toBe(
      "End date must be on or after start date.",
    );
  });

  it("end in the future → 'not be in the future'", () => {
    // A year+ in the future relative to any plausible run date.
    expect(validateRange("2099-01-01", "2099-12-31", MAX)).toBe(
      "End date must not be in the future.",
    );
  });

  it("range longer than maxDays → 'too long'", () => {
    // 2026-01-01 .. 2026-06-30 is well over 90 days, and both are in the past.
    const err = validateRange("2026-01-01", "2026-06-30", MAX);
    expect(err).toContain("Range too long");
    expect(err).toContain("> 90");
  });

  it("valid single-day range → null", () => {
    expect(validateRange("2020-03-15", "2020-03-15", MAX)).toBeNull();
  });

  it("valid multi-day range within max → null", () => {
    expect(validateRange("2020-03-01", "2020-03-31", MAX)).toBeNull();
  });
});

describe("rangeMath — localTodayIso", () => {
  it("formats a Date as LOCAL YYYY-MM-DD (zero-padded)", () => {
    expect(localTodayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localTodayIso(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("rangeMath — rangeDayCount (inclusive)", () => {
  it("counts inclusive days", () => {
    expect(rangeDayCount("2026-07-13", "2026-07-13")).toBe(1);
    expect(rangeDayCount("2026-07-13", "2026-07-14")).toBe(2);
    expect(rangeDayCount("2026-07-01", "2026-07-31")).toBe(31);
  });

  it("0 on malformed", () => {
    expect(rangeDayCount("bogus", "2026-07-13")).toBe(0);
  });
});

describe("rangeMath — isSingleDay (render-path discriminator)", () => {
  it("true only when start === end (both well-formed)", () => {
    expect(isSingleDay("2026-07-13", "2026-07-13")).toBe(true);
    expect(isSingleDay("2026-07-13", "2026-07-14")).toBe(false);
    expect(isSingleDay("bogus", "bogus")).toBe(false); // not ISO shape
    expect(isSingleDay("", "")).toBe(false);
  });
});

describe("rangeMath — stepIso (Day-nav ±1-day, wraps month/year)", () => {
  it("steps forward/back within a month", () => {
    expect(stepIso("2026-07-13", 1)).toBe("2026-07-14");
    expect(stepIso("2026-07-13", -1)).toBe("2026-07-12");
  });

  it("wraps the month boundary (last→first, first→prev-last)", () => {
    expect(stepIso("2026-07-31", 1)).toBe("2026-08-01");
    expect(stepIso("2026-07-01", -1)).toBe("2026-06-30");
    // Feb-length aware: 2026-03-01 back one → 2026-02-28 (2026 not leap).
    expect(stepIso("2026-03-01", -1)).toBe("2026-02-28");
    // Leap year: 2024-03-01 back one → 2024-02-29.
    expect(stepIso("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("wraps the year boundary", () => {
    expect(stepIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(stepIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("returns the input unchanged on malformed", () => {
    expect(stepIso("bogus", 1)).toBe("bogus");
    expect(stepIso("2026-7-1", -1)).toBe("2026-7-1");
  });
});

describe("rangeMath — rangeToMs (LOCAL-midnight query bounds)", () => {
  it("start = start-date local midnight; end = end-date local 23:59:59.999", () => {
    const b = rangeToMs("2026-07-13", "2026-07-15")!;
    const start = new Date(b.start_ms);
    const end = new Date(b.end_ms);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6); // July
    expect(start.getDate()).toBe(13);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(b.end_ms).toBeGreaterThan(b.start_ms);
  });

  it("a single-day range spans that one local day", () => {
    const b = rangeToMs("2026-07-13", "2026-07-13")!;
    const start = new Date(b.start_ms);
    const end = new Date(b.end_ms);
    expect(start.getDate()).toBe(13);
    expect(end.getDate()).toBe(13);
    // ~24h - 1ms span.
    expect(b.end_ms - b.start_ms).toBeGreaterThan(86_000_000);
    expect(b.end_ms - b.start_ms).toBeLessThan(86_400_000);
  });

  it("null on malformed input", () => {
    expect(rangeToMs("2026-7-1", "2026-07-13")).toBeNull();
    expect(rangeToMs("", "")).toBeNull();
  });
});
