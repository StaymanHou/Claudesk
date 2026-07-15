import { describe, expect, it } from "vitest";
import {
  computeDayTotals,
  dayStats,
  fmtDur,
  fmtClock,
} from "../dayStats";
import type { RangePayload, SegKind } from "../../../../state/timeAnalytics";

// `dur_ms` defaults to the minute-span in ms (these fixtures are all minute-scale, so the
// duration sums equal the minute spans). Pass an explicit `durMs` to model a sub-minute
// segment whose true duration differs from its quantized end - start.
function seg(kind: SegKind, start: number, end: number, durMs?: number) {
  return { kind, start, end, dur_ms: durMs ?? (end - start) * 60_000 };
}

// A 2-project fixture: proj-a has a big AI-family session (10+5+3=18 active) + away 30;
// proj-b has a smaller one (typing/reviewing are human, so 0 active) + 4 Edit tools.
const DATA: RangePayload = {
  label: "WED · MAY 13",
  meta: { start: "2026-05-13", end: "2026-05-13", day_count: 1 },
  hour_range_by_day: { "2026-05-13": [9, 12] },
  day_window: [540, 720],
  iso: "2026-05-13",
  hour_range: [9, 12],
  projects: [
    {
      id: "proj-a",
      alias: "proj-a",
      path: "/repo/proj-a",
      sessions: [
        {
          id: "s1",
          start: 540,
          end: 600,
          prompts: 2,
          tools: { Edit: 3, Bash: 1 },
          segs: [
            seg("ai-doing", 540, 550), // AI 10
            seg("subagent", 550, 555), // AI 5
            seg("ai-reasoning", 555, 558), // AI 3
            seg("away", 558, 588), // away 30
          ],
        },
      ],
    },
    {
      id: "proj-b",
      alias: "proj-b",
      path: "/repo/proj-b",
      sessions: [
        {
          id: "s2",
          start: 600,
          end: 620,
          prompts: 1,
          tools: { Edit: 2 },
          segs: [
            seg("typing", 600, 607), // human
            seg("reviewing", 607, 612), // human
          ],
        },
      ],
    },
  ],
};

describe("computeDayTotals", () => {
  const t = computeDayTotals(DATA);

  it("Active = the whole AI-execution family across all sessions", () => {
    expect(t.active).toBe(18); // 10 + 5 + 3 (proj-b has no AI segs)
  });

  it("Away = total away minutes", () => {
    expect(t.away).toBe(30);
  });

  it("Longest session ranks by AI-family minutes (proj-a's s1)", () => {
    expect(t.longest.active).toBe(18);
    expect(t.longest.project).toBe("proj-a");
    expect(t.longest.start).toBe(540);
  });
});

describe("dayStats — formatted cells", () => {
  const cells = dayStats(DATA, "oklch(0.5 0.17 268)");

  it("emits the 3 stat cells in order (Most-used tool removed at P3)", () => {
    expect(cells.map((c) => c.label)).toEqual([
      "Active",
      "Away",
      "Longest session",
    ]);
  });

  it("Active is formatted + carries the passed accent", () => {
    expect(cells[0].value).toBe("18m");
    expect(cells[0].accent).toBe("oklch(0.5 0.17 268)");
  });

  it("empty day → Active 0m + longest 0m, no crash", () => {
    const empty: RangePayload = { ...DATA, projects: [] };
    const c = dayStats(empty, "x");
    expect(c[0].value).toBe("0m");
    expect(c[2].value).toBe("0m");
  });
});

describe("formatters", () => {
  it("fmtDur", () => {
    expect(fmtDur(0)).toBe("0m");
    expect(fmtDur(45)).toBe("45m");
    expect(fmtDur(60)).toBe("1h");
    expect(fmtDur(157)).toBe("2h 37m");
  });
  it("fmtClock", () => {
    expect(fmtClock(540)).toBe("09:00");
    expect(fmtClock(0)).toBe("00:00");
    expect(fmtClock(725)).toBe("12:05");
  });
});
