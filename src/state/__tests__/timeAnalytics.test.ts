import { describe, expect, it } from "vitest";
import {
  type RangePayload,
  type SegPayload,
  type TimeAnalyticsResult,
  type WeekPayload,
} from "../timeAnalytics";
// ?raw source guard (repo convention — the runtime invoke() behavior is verify-self/
// human-covered via the MCP bridge; this pins the WIRING so a future edit that severs
// the command binding or renames a DTO key fails CI). See pipFanoutWiring.test.ts.
import timeAnalyticsSource from "../timeAnalytics.ts?raw";

// M9 WP4 P3.3 — the FE seam WP6 consumes. These tests pin (a) the snake_case DTO
// shape mirrors the backend serde keys verbatim (IPC-DTO casing lesson), and (b) the
// invoke wrapper targets the right command name with the right arg shape.

describe("M9 WP4 — time-analytics DTO contract (snake_case, verbatim)", () => {
  it("consumes a backend RangePayload with snake_case keys verbatim", () => {
    // A realistic payload exactly as it arrives from `time_analytics_query`
    // (snake_case, NOT camelCase — Tauri does not convert command payloads).
    const wire: TimeAnalyticsResult = {
      kind: "range",
      label: "WED · MAY 13",
      projects: [
        {
          id: "proj-a",
          alias: "proj-a",
          path: "/repo/proj-a",
          sessions: [
            {
              id: "sess1234",
              start: 540,
              end: 570,
              prompts: 1,
              tools: { Edit: 1 },
              segs: [{ kind: "ai-doing", start: 545, end: 546 }],
              day_iso: "2026-05-13",
            },
          ],
        },
      ],
      meta: { start: "2026-05-13", end: "2026-05-13", day_count: 1 },
      hour_range_by_day: { "2026-05-13": [8, 18] },
      day_window: [8, 18],
      iso: "2026-05-13",
      hour_range: [8, 18],
    };
    expect(wire.kind).toBe("range");
    const range = wire as { kind: "range" } & RangePayload;
    expect(range.meta.day_count).toBe(1);
    expect(range.projects[0].sessions[0].tools.Edit).toBe(1);
    expect(range.projects[0].sessions[0].day_iso).toBe("2026-05-13");
    expect(range.hour_range_by_day["2026-05-13"]).toEqual([8, 18]);
  });

  it("segment kind is a WP3 kebab tag and label is optional", () => {
    const sub: SegPayload = {
      kind: "subagent",
      start: 10,
      end: 20,
      label: "Explore",
    };
    const ai: SegPayload = { kind: "ai-reasoning", start: 0, end: 5 };
    expect(sub.label).toBe("Explore");
    expect(ai.label).toBeUndefined();
    // the six valid kebab tags
    const kinds: SegPayload["kind"][] = [
      "ai-doing",
      "subagent",
      "ai-reasoning",
      "typing",
      "reviewing",
      "away",
    ];
    expect(kinds).toHaveLength(6);
  });

  it("consumes a WeekPayload rollup with per-kind snake_case cells", () => {
    const week: TimeAnalyticsResult = {
      kind: "week",
      label: "WEEK 20 · MAY 11 — MAY 17",
      days: [
        "MON 11",
        "TUE 12",
        "WED 13",
        "THU 14",
        "FRI 15",
        "SAT 16",
        "SUN 17",
      ],
      projects: [
        {
          id: "proj-a",
          alias: "proj-a",
          rollup: [
            {
              ai_doing: 5,
              subagent: 0,
              ai_reasoning: 20,
              typing: 0,
              reviewing: 0,
              away: 0,
              prompts: 1,
            },
          ],
        },
      ],
    };
    expect(week.kind).toBe("week");
    const w = week as { kind: "week" } & WeekPayload;
    expect(w.days).toHaveLength(7);
    expect(w.projects[0].rollup[0].ai_reasoning).toBe(20);
  });
});

describe("M9 WP4 — the invoke wrapper wiring", () => {
  it("targets the time_analytics_query command with the { scope, window } arg shape", () => {
    expect(timeAnalyticsSource).toContain(
      'invoke<TimeAnalyticsResult>("time_analytics_query"',
    );
    expect(timeAnalyticsSource).toContain("{ scope, window }");
  });

  it("defaults scope to global (the resolved v1 scope)", () => {
    expect(timeAnalyticsSource).toContain('scope: QueryScope = "global"');
  });
});
