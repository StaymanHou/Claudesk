import { describe, expect, it } from "vitest";
import {
  fmtSignedDurMs,
  fmtRelPct,
  fmtSignedPp,
  fmtSignedMult,
  relPctOf,
  aiEffortPerHumanPct,
  blockingShares,
  concurrencyShares,
  topConcurrencyShift,
  topBlockingShift,
} from "../compareMath";
import type { MetricsPayload } from "../../../../state/timeAnalytics";

const MINUS = "−"; // U+2212
const TIMES = "×"; // U+00D7

// ── signed formatters ────────────────────────────────────────────────────────
describe("fmtSignedDurMs", () => {
  it("signs positive with + and negative with the minus sign (not a hyphen)", () => {
    expect(fmtSignedDurMs(90_000)).toBe("+2m"); // 1.5min → 2m
    expect(fmtSignedDurMs(-90_000)).toBe(`${MINUS}2m`);
    expect(fmtSignedDurMs(60 * 60_000)).toBe("+1h");
  });
  it("renders a sub-minute magnitude in seconds (fidelity gain over source floor-to-0m)", () => {
    expect(fmtSignedDurMs(45_000)).toBe("+45s");
    expect(fmtSignedDurMs(-3_000)).toBe(`${MINUS}3s`);
  });
  it("reads 0m for a sub-second magnitude or zero", () => {
    expect(fmtSignedDurMs(0)).toBe("0m");
    expect(fmtSignedDurMs(400)).toBe("0m"); // rounds to 0s → 0m
    expect(fmtSignedDurMs(NaN)).toBe("0m");
  });
});

describe("fmtRelPct", () => {
  it("renders N/A for a null baseline", () => {
    expect(fmtRelPct(null)).toBe("(N/A)");
    expect(fmtRelPct(NaN)).toBe("(N/A)");
  });
  it("renders ±0% for a sub-1% magnitude", () => {
    expect(fmtRelPct(0)).toBe("(±0%)");
    expect(fmtRelPct(0.4)).toBe("(±0%)");
  });
  it("signs and rounds otherwise", () => {
    expect(fmtRelPct(23.6)).toBe("(+24%)");
    expect(fmtRelPct(-50)).toBe(`(${MINUS}50%)`);
  });
});

describe("fmtSignedPp", () => {
  it("renders ±0pp for a sub-0.5pp magnitude", () => {
    expect(fmtSignedPp(0)).toBe("(±0pp)");
    expect(fmtSignedPp(0.4)).toBe("(±0pp)");
  });
  it("signs and rounds otherwise", () => {
    expect(fmtSignedPp(12.6)).toBe("(+13pp)");
    expect(fmtSignedPp(-8)).toBe(`(${MINUS}8pp)`);
  });
});

describe("fmtSignedMult", () => {
  it("renders 0.00× for a sub-0.01 magnitude", () => {
    expect(fmtSignedMult(0)).toBe(`0.00${TIMES}`);
    expect(fmtSignedMult(0.005)).toBe(`0.00${TIMES}`);
  });
  it("signs and fixes to 2dp otherwise", () => {
    expect(fmtSignedMult(1.234)).toBe(`+1.23${TIMES}`);
    expect(fmtSignedMult(-0.5)).toBe(`${MINUS}0.50${TIMES}`);
  });
});

describe("relPctOf", () => {
  it("returns null when the A baseline is zero (no baseline to normalize)", () => {
    expect(relPctOf(0, 100)).toBeNull();
  });
  it("computes (b-a)/a * 100 otherwise", () => {
    expect(relPctOf(100, 150)).toBeCloseTo(50);
    expect(relPctOf(200, 100)).toBeCloseTo(-50);
  });
});

// ── derived shares / ratios ──────────────────────────────────────────────────
/** Minimal MetricsPayload fixture — only the fields the compareMath functions read. */
function metrics(over: {
  engagedWall?: number;
  aiEffort?: number;
  humanWall?: number;
  agentBlockingHuman?: number;
  humanBlockingAgent?: number;
  concurrency?: { k: number; wallclock_ms: number }[];
}): MetricsPayload {
  return {
    window: { start: "2026-05-13", end: "2026-05-13", day_count: 1 },
    engaged_session: {
      wallclock_ms: over.engagedWall ?? 0,
      effort_ms: 0,
      multiplier: 0,
      session_count: 0,
    },
    ai_agent: {
      wallclock_ms: 0,
      effort_ms: over.aiEffort ?? 0,
      multiplier: 0,
      subagent: { wallclock_ms: 0, effort_ms: 0, multiplier: 0 },
    },
    tool_call: { wallclock_ms: 0, effort_ms: 0, multiplier: 0, top: [] },
    human: {
      wallclock_ms: over.humanWall ?? 0,
      effort_ms: over.humanWall ?? 0,
      multiplier: 1,
      typing_ms: 0,
      reviewing_ms: 0,
      away_ms: 0,
    },
    concurrency: (over.concurrency ?? []).map((c) => ({
      k: c.k,
      wallclock_ms: c.wallclock_ms,
      effort_ms: c.wallclock_ms * c.k,
      is_plus: c.k === 4,
    })),
    blocking: {
      agent_blocking_human_ms: over.agentBlockingHuman ?? 0,
      human_blocking_agent_ms: over.humanBlockingAgent ?? 0,
    },
  };
}

describe("aiEffortPerHumanPct", () => {
  it("returns 0 when there is no human wall-clock (rendered as — by the consumer)", () => {
    expect(aiEffortPerHumanPct(metrics({ aiEffort: 5000, humanWall: 0 }))).toBe(0);
  });
  it("computes ai_effort / human_wallclock * 100", () => {
    // 2× AI effort vs human wall = 200%.
    expect(aiEffortPerHumanPct(metrics({ aiEffort: 200, humanWall: 100 }))).toBeCloseTo(200);
  });
});

describe("blockingShares", () => {
  it("is all-zero when there is no blocking time at all", () => {
    expect(blockingShares(metrics({ agentBlockingHuman: 0, humanBlockingAgent: 0 }))).toEqual({
      agentToHuman: 0,
      humanToAgent: 0,
    });
  });
  it("normalizes the two components to a SPLIT (fractions of their sum, → 100%)", () => {
    const m = metrics({ agentBlockingHuman: 700, humanBlockingAgent: 300 });
    const s = blockingShares(m);
    expect(s.agentToHuman).toBeCloseTo(70);
    expect(s.humanToAgent).toBeCloseTo(30);
    expect(s.agentToHuman + s.humanToAgent).toBeCloseTo(100);
  });
  it("stays a 0–100 split even when each component EXCEEDS engaged wall-clock (the overflow bug)", () => {
    // Both components can individually exceed engaged wall-clock (AI work sums across
    // parallel sessions; reviewing overlaps bursts). Old share-of-wallclock math summed
    // >100% and overflowed the stacked bar; the split normalization keeps it 0–100.
    const m = metrics({
      engagedWall: 1000,
      agentBlockingHuman: 1046, // > engagedWall (the real-data case from verify-self)
      humanBlockingAgent: 2622,
    });
    const s = blockingShares(m);
    expect(s.agentToHuman + s.humanToAgent).toBeCloseTo(100);
    expect(s.agentToHuman).toBeCloseTo((1046 / (1046 + 2622)) * 100);
    expect(s.agentToHuman).toBeLessThanOrEqual(100);
    expect(s.humanToAgent).toBeLessThanOrEqual(100);
  });
});

describe("concurrencyShares", () => {
  it("is all-zero when there is no engaged wall-clock", () => {
    expect(concurrencyShares(metrics({ engagedWall: 0 }))).toEqual({
      k1: 0,
      k2: 0,
      k3: 0,
      k4: 0,
    });
  });
  it("computes each stratum as a share of engaged wall-clock", () => {
    const m = metrics({
      engagedWall: 1000,
      concurrency: [
        { k: 1, wallclock_ms: 500 },
        { k: 2, wallclock_ms: 300 },
        { k: 4, wallclock_ms: 200 },
      ],
    });
    const s = concurrencyShares(m);
    expect(s.k1).toBeCloseTo(50);
    expect(s.k2).toBeCloseTo(30);
    expect(s.k3).toBeCloseTo(0);
    expect(s.k4).toBeCloseTo(20);
  });
});

describe("topConcurrencyShift", () => {
  it("reports the largest-magnitude stratum shift B−A", () => {
    const a = metrics({
      engagedWall: 1000,
      concurrency: [{ k: 1, wallclock_ms: 1000 }],
    });
    const b = metrics({
      engagedWall: 1000,
      concurrency: [
        { k: 1, wallclock_ms: 400 },
        { k: 2, wallclock_ms: 600 },
      ],
    });
    // k=2 went 0→60 (+60pp), k=1 went 100→40 (−60pp). Tie on magnitude → lower k wins (k=1).
    const shift = topConcurrencyShift(a, b);
    expect(shift.label).toBe("k=1");
    expect(shift.delta).toBeCloseTo(-60);
  });
});

describe("topBlockingShift", () => {
  it("reports the larger-magnitude blocking component shift with its label", () => {
    const a = metrics({ engagedWall: 1000, agentBlockingHuman: 800, humanBlockingAgent: 200 });
    const b = metrics({ engagedWall: 1000, agentBlockingHuman: 500, humanBlockingAgent: 500 });
    // agent→human: 80→50 (−30pp); human→agent: 20→50 (+30pp). Tie → agent→human wins.
    const shift = topBlockingShift(a, b);
    expect(shift.label).toBe("agent→human");
    expect(shift.delta).toBeCloseTo(-30);
  });
});
