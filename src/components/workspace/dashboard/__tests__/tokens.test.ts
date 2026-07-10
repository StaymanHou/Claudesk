import { describe, expect, it } from "vitest";
import { CT_TOKENS, textOn } from "../tokens";
import { colorForKind } from "../kinds";
import type { SegKind } from "../../../../state/timeAnalytics";

// M9 WP6a — `textOn` is the luminance-based ink picker that replaced every hardcoded
// `color:'#fff'` on a segment fill (the WP1 contrast fix). It is the guard that keeps
// on-fill text legible across the 6-kind palette AND survives a future recolor. Pure →
// unit-tested (live legibility was bridge-verified; this pins the logic).

describe("textOn — luminance-based ink", () => {
  it("returns near-black ink for a BRIGHT oklch fill (L > 0.6)", () => {
    expect(textOn("oklch(0.85 0.05 268)")).toBe("#111111");
  });

  it("returns light ink for a DARK oklch fill (L <= 0.6)", () => {
    expect(textOn("oklch(0.50 0.17 268)")).toBe("#f6f6f6");
  });

  it("falls back to light ink for a non-oklch fill", () => {
    // The dashboard's fills are all oklch; this is the defensive fallback.
    expect(textOn("#3355ff")).toBe("#f6f6f6");
    expect(textOn("rebeccapurple")).toBe("#f6f6f6");
  });

  it("returns a defined ink for every one of the 6 kinds' fills", () => {
    const kinds: SegKind[] = [
      "ai-doing",
      "subagent",
      "ai-reasoning",
      "typing",
      "reviewing",
      "away",
    ];
    for (const k of kinds) {
      const ink = textOn(colorForKind(k));
      expect([INK_DARK, INK_LIGHT]).toContain(ink);
    }
  });
});

const INK_DARK = "#111111";
const INK_LIGHT = "#f6f6f6";

describe("CT_TOKENS — dark palette shape", () => {
  it("exposes the 6-kind fills + the neutral/away tokens the port consumes", () => {
    // Guards against a rename that would silently break colorForKind/segStyle.
    for (const key of [
      "ai-doing",
      "subagent",
      "ai-reasoning",
      "reviewing",
      "typing",
      "awayBase",
      "awayStripe",
      "bg",
      "textPrimary",
    ] as const) {
      expect(typeof CT_TOKENS[key]).toBe("string");
      expect(CT_TOKENS[key].length).toBeGreaterThan(0);
    }
  });
});
