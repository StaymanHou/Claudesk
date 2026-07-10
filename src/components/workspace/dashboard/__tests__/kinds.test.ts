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
  const segs = [
    { kind: "ai-doing" as SegKind, start: 0, end: 10 }, // AI 10
    { kind: "subagent" as SegKind, start: 10, end: 15 }, // AI 5
    { kind: "ai-reasoning" as SegKind, start: 15, end: 18 }, // AI 3
    { kind: "typing" as SegKind, start: 18, end: 25 }, // human 7
    { kind: "reviewing" as SegKind, start: 25, end: 30 }, // human 5
    { kind: "away" as SegKind, start: 30, end: 60 }, // human 30
  ];

  it("sumByKind totals exactly one kind's minutes", () => {
    expect(sumByKind(segs, "ai-doing")).toBe(10);
    expect(sumByKind(segs, "away")).toBe(30);
    expect(sumByKind(segs, "typing")).toBe(7);
  });

  it("sumActive = the whole AI-execution family (doing + subagent + reasoning)", () => {
    expect(sumActive(segs)).toBe(10 + 5 + 3);
  });
});

describe("kinds — labels", () => {
  it("every kind has a non-empty human label", () => {
    for (const k of SIX) {
      expect(labelForKind(k).length).toBeGreaterThan(0);
    }
  });
});
