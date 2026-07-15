import { describe, expect, it } from "vitest";
import {
  AI_KINDS,
  HUMAN_KINDS,
  ALL_KINDS,
  familyOf,
  colorForKind,
  segStyle,
  sumByKind,
  sumActive,
  labelForKind,
  RENDER_ORDER,
  type SegKind,
} from "../kinds";

const SIX: SegKind[] = [
  "ai-doing",
  "subagent",
  "ai-reasoning",
  "typing",
  "reviewing",
  "away",
];

describe("kinds — the 6-kind family model", () => {
  it("AI family + human family partition all 6 kinds with no overlap", () => {
    expect([...AI_KINDS, ...HUMAN_KINDS].sort()).toEqual([...SIX].sort());
    expect(AI_KINDS.some((k) => HUMAN_KINDS.includes(k))).toBe(false);
    expect(ALL_KINDS).toHaveLength(6);
  });

  it("familyOf maps each kind to its lineage", () => {
    expect(familyOf("ai-doing")).toBe("ai");
    expect(familyOf("subagent")).toBe("ai");
    expect(familyOf("ai-reasoning")).toBe("ai");
    expect(familyOf("typing")).toBe("human");
    expect(familyOf("reviewing")).toBe("human");
    expect(familyOf("away")).toBe("human");
  });
});

describe("kinds — colors + fill styles", () => {
  it("colorForKind returns a defined non-empty token for all 6 kinds", () => {
    for (const k of SIX) {
      expect(typeof colorForKind(k)).toBe("string");
      expect(colorForKind(k).length).toBeGreaterThan(0);
    }
  });

  it("colorForKind has a safe fallback for an unknown kind", () => {
    // @ts-expect-error — exercise the defensive default with an off-union value.
    expect(typeof colorForKind("nope")).toBe("string");
  });

  it("segStyle gives a solid background for non-away kinds and stripes for away", () => {
    expect(segStyle("ai-doing")).toHaveProperty("background");
    expect(segStyle("typing")).toHaveProperty("background");
    const away = segStyle("away");
    expect(away).toHaveProperty("backgroundImage");
    expect(String(away.backgroundImage)).toContain("repeating-linear-gradient");
  });

  it("RENDER_ORDER covers exactly the 6 kinds (away backmost)", () => {
    expect([...RENDER_ORDER].sort()).toEqual([...SIX].sort());
    expect(RENDER_ORDER[0]).toBe("away");
  });
});

describe("kinds — sums", () => {
  // Minute-scale segs: dur_ms == the span × 60000, so the sums equal the minute spans.
  const M = 60_000;
  const segs = [
    { kind: "ai-doing" as SegKind, start: 0, end: 10, dur_ms: 10 * M }, // AI 10
    { kind: "subagent" as SegKind, start: 10, end: 15, dur_ms: 5 * M }, // AI 5
    { kind: "ai-reasoning" as SegKind, start: 15, end: 18, dur_ms: 3 * M }, // AI 3
    { kind: "typing" as SegKind, start: 18, end: 25, dur_ms: 7 * M }, // human 7
    { kind: "reviewing" as SegKind, start: 25, end: 30, dur_ms: 5 * M }, // human 5
    { kind: "away" as SegKind, start: 30, end: 60, dur_ms: 30 * M }, // human 30
  ];

  it("sumByKind totals exactly one kind's minutes", () => {
    expect(sumByKind(segs, "ai-doing")).toBe(10);
    expect(sumByKind(segs, "away")).toBe(30);
    expect(sumByKind(segs, "typing")).toBe(7);
  });

  it("sumActive = the whole AI-execution family (doing + subagent + reasoning)", () => {
    expect(sumActive(segs)).toBe(10 + 5 + 3);
  });

  // REGRESSION (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…): sums must use TRUE
  // dur_ms, NOT the minute-quantized end - start. Four sub-minute ai-doing segs that all
  // render in the SAME clock-minute (start==end) but total 48s of real work → must sum to
  // 1 min, not 0. Subtracting end-start would return 0 (the bug).
  it("sumByKind/sumActive use dur_ms, not the quantized end - start (sub-minute)", () => {
    const sub = [
      { kind: "ai-doing" as SegKind, start: 9, end: 9, dur_ms: 12_000 },
      { kind: "ai-doing" as SegKind, start: 9, end: 9, dur_ms: 12_000 },
      { kind: "ai-doing" as SegKind, start: 9, end: 9, dur_ms: 12_000 },
      { kind: "ai-doing" as SegKind, start: 9, end: 9, dur_ms: 12_000 },
    ];
    // 4 × 12s = 48s → round-half-up = 1 min (buggy end-start sum would be 0).
    expect(sumByKind(sub, "ai-doing")).toBe(1);
    expect(sumActive(sub)).toBe(1);
  });
});

describe("kinds — labels", () => {
  it("every kind has a non-empty human label", () => {
    for (const k of SIX) {
      expect(labelForKind(k).length).toBeGreaterThan(0);
    }
  });
});
