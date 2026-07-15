import { describe, expect, it } from "vitest";
import {
  fmtMsDur,
  fmtMult,
  parallelMsOf,
  METRIC_SECTIONS,
} from "../metricsMath";
import type { MetricsPayload } from "../../../../state/timeAnalytics";

// ── fmtMsDur — ms → display duration ────────────────────────────────────────
// The load-bearing display step: sub-minute durations MUST render in seconds, not floor
// to "0m" — that's the visible half of the "measure, don't infer" thesis (build_metrics
// already sums at ms precision; if the formatter floored, real tool time would still
// vanish on screen).
describe("fmtMsDur", () => {
  it("renders sub-minute durations in seconds (never 0m)", () => {
    expect(fmtMsDur(143)).toBe("0s"); // 143ms rounds to 0s — under a second
    expect(fmtMsDur(1_400)).toBe("1s");
    expect(fmtMsDur(45_000)).toBe("45s");
    expect(fmtMsDur(59_400)).toBe("59s");
  });
  it("renders minute/hour durations", () => {
    expect(fmtMsDur(60_000)).toBe("1m");
    expect(fmtMsDur(90_000)).toBe("2m"); // 1.5min rounds to 2min
    expect(fmtMsDur(10 * 60_000)).toBe("10m");
    expect(fmtMsDur(60 * 60_000)).toBe("1h");
    expect(fmtMsDur(90 * 60_000)).toBe("1h 30m");
    expect(fmtMsDur(125 * 60_000)).toBe("2h 5m");
  });
  it("clamps non-positive to 0m", () => {
    expect(fmtMsDur(0)).toBe("0m");
    expect(fmtMsDur(-5000)).toBe("0m");
  });
});

// ── fmtMult — parallelism multiplier ────────────────────────────────────────
describe("fmtMult", () => {
  it("formats a multiplier as ×N.NN", () => {
    expect(fmtMult(2)).toBe("×2.00");
    expect(fmtMult(1.5)).toBe("×1.50");
    expect(fmtMult(1.337)).toBe("×1.34");
  });
  it("renders a dash for zero / non-finite (no wallclock)", () => {
    expect(fmtMult(0)).toBe("—");
    expect(fmtMult(Number.NaN)).toBe("—");
    expect(fmtMult(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

// ── test fixture ────────────────────────────────────────────────────────────
function payload(over: Partial<MetricsPayload> = {}): MetricsPayload {
  return {
    window: { start: "2026-05-13", end: "2026-05-13", day_count: 1 },
    engaged_session: {
      wallclock_ms: 10 * 60_000,
      effort_ms: 20 * 60_000,
      multiplier: 2,
      session_count: 2,
    },
    ai_agent: {
      wallclock_ms: 8 * 60_000,
      effort_ms: 8 * 60_000,
      multiplier: 1,
      subagent: { wallclock_ms: 2 * 60_000, effort_ms: 2 * 60_000, multiplier: 1 },
    },
    tool_call: {
      wallclock_ms: 143,
      effort_ms: 143,
      multiplier: 1,
      top: [
        { name: "Bash", wallclock_ms: 90, effort_ms: 90, multiplier: 1 },
        { name: "Edit", wallclock_ms: 53, effort_ms: 53, multiplier: 1 },
      ],
    },
    human: {
      wallclock_ms: 5 * 60_000,
      effort_ms: 5 * 60_000,
      multiplier: 1,
      typing_ms: 2 * 60_000,
      reviewing_ms: 3 * 60_000,
      away_ms: 7 * 60_000,
    },
    concurrency: [
      { k: 1, wallclock_ms: 4 * 60_000, effort_ms: 4 * 60_000 },
      { k: 2, wallclock_ms: 3 * 60_000, effort_ms: 6 * 60_000 },
      { k: 3, wallclock_ms: 1 * 60_000, effort_ms: 3 * 60_000 },
      { k: 4, wallclock_ms: 0, effort_ms: 0, is_plus: true },
    ],
    blocking: {
      human_blocking_agent_ms: 3 * 60_000,
      agent_blocking_human_ms: 8 * 60_000,
    },
    ...over,
  };
}

// ── parallelMsOf — cross-session overlap (k ≥ 2) ────────────────────────────
describe("parallelMsOf", () => {
  it("sums the wallclock of every k >= 2 stratum", () => {
    // k2 (3min) + k3 (1min) + k4+ (0) = 4 min. k1 excluded.
    expect(parallelMsOf(payload())).toBe(4 * 60_000);
  });
  it("is 0 when nothing overlapped (all k=1)", () => {
    const d = payload({
      concurrency: [
        { k: 1, wallclock_ms: 10 * 60_000, effort_ms: 10 * 60_000 },
        { k: 2, wallclock_ms: 0, effort_ms: 0 },
        { k: 3, wallclock_ms: 0, effort_ms: 0 },
        { k: 4, wallclock_ms: 0, effort_ms: 0, is_plus: true },
      ],
    });
    expect(parallelMsOf(d)).toBe(0);
  });
});

// ── METRIC_SECTIONS — the 6-section row shaping ─────────────────────────────
describe("METRIC_SECTIONS", () => {
  it("has the 6 sections in render order", () => {
    expect(METRIC_SECTIONS.map((s) => s.title)).toEqual([
      "Engaged session",
      "AI agent",
      "Tool call",
      "Human active",
      "Concurrency",
      "Blocking",
    ]);
  });

  it("Engaged section carries the triplet + a session-count row", () => {
    const rows = METRIC_SECTIONS[0].rows(payload());
    expect(rows[0]).toMatchObject({
      label: "Engaged",
      wallclock_ms: 10 * 60_000,
      effort_ms: 20 * 60_000,
      multiplier: 2,
    });
    expect(rows[1]).toMatchObject({ label: "Sessions", count: 2 });
    expect(rows[1].wallclock_ms).toBeNull();
  });

  it("AI agent section breaks out the subagent subset", () => {
    const rows = METRIC_SECTIONS[1].rows(payload());
    expect(rows.map((r) => r.label)).toEqual(["AI agent", "Subagent"]);
    expect(rows[1].wallclock_ms).toBe(2 * 60_000);
  });

  it("Tool call section lists all-tools then the top tools", () => {
    const rows = METRIC_SECTIONS[2].rows(payload());
    expect(rows.map((r) => r.label)).toEqual(["All tools", "Bash", "Edit"]);
    // Sub-minute tool effort survives to the row (143ms, not floored to 0).
    expect(rows[0].effort_ms).toBe(143);
  });

  it("Human active section breaks out typing + reviewing (away NOT here)", () => {
    const rows = METRIC_SECTIONS[3].rows(payload());
    expect(rows.map((r) => r.label)).toEqual(["Human", "Typing", "Reviewing"]);
    expect(rows[0].wallclock_ms).toBe(5 * 60_000); // typing + reviewing
    expect(rows[1].wallclock_ms).toBe(2 * 60_000);
    expect(rows[2].wallclock_ms).toBe(3 * 60_000);
    // away is not a row in this section (it's a headline tile, read from human.away_ms).
    expect(rows.some((r) => r.label.toLowerCase().includes("away"))).toBe(false);
  });

  it("Concurrency rows suppress the multiplier and label k=4+ with is_plus", () => {
    const rows = METRIC_SECTIONS[4].rows(payload());
    expect(rows.map((r) => r.label)).toEqual(["k=1", "k=2", "k=3", "k=4+"]);
    expect(rows.every((r) => r.multiplier === null)).toBe(true);
    expect(rows[1].effort_ms).toBe(6 * 60_000); // k=2 → wallclock×2
  });

  it("Blocking section has the two directional rows, no multiplier", () => {
    const rows = METRIC_SECTIONS[5].rows(payload());
    expect(rows.map((r) => r.label)).toEqual([
      "Human blocking agent",
      "Agent blocking human",
    ]);
    expect(rows[0].wallclock_ms).toBe(3 * 60_000); // reviewing only
    expect(rows[1].wallclock_ms).toBe(8 * 60_000); // == ai_agent.wallclock
    expect(rows.every((r) => r.multiplier === null)).toBe(true);
  });
});
