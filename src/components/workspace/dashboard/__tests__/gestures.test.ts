// M9 WP6b-1 Phase 2 — pins the pure gesture math (`panViewport` / `zoomViewport`)
// the useTimelineGestures hook + Minimap consume. The hook's DOM glue (pointer
// capture, RAF, click-vs-pan target check) is verified live via the MCP bridge
// (project convention — no jsdom); the transferable MATH is pinned here.

import { describe, expect, it } from "vitest";
import { panViewport, zoomViewport, type Viewport } from "../viewport";

const vp = (a: number, b: number): Viewport => ({
  visible_start_min: a,
  visible_end_min: b,
});

// ── panViewport ────────────────────────────────────────────────────────────
describe("panViewport — px drag → minute pan, width-preserving", () => {
  const origin = vp(600, 1200); // 600-min-wide window over a 600px body

  it("drag RIGHT (dx>0) pans toward EARLIER time (negative minute delta)", () => {
    // dx=+300 over 600px body, range=600 → deltaMin = -(300/600)*600 = -300.
    const out = panViewport(origin, 300, 600);
    expect(out).toEqual(vp(300, 900));
  });

  it("drag LEFT (dx<0) pans toward LATER time", () => {
    const out = panViewport(origin, -150, 600);
    expect(out).toEqual(vp(750, 1350));
  });

  it("preserves width (both endpoints shift equally)", () => {
    const out = panViewport(origin, 123, 600);
    expect(out.visible_end_min - out.visible_start_min).toBe(600);
  });

  it("computes against the FROZEN origin (idempotent for a given dx)", () => {
    expect(panViewport(origin, 300, 600)).toEqual(panViewport(origin, 300, 600));
  });

  it("degenerate body width → no-op (returns origin, no NaN)", () => {
    expect(panViewport(origin, 300, 0)).toEqual(origin);
  });
});

// ── zoomViewport ──────────────────────────────────────────────────────────
describe("zoomViewport — cursor-anchored zoom", () => {
  const origin = vp(600, 1200); // 600-min window

  it("keeps the anchor minute at the same frac after zoom-in", () => {
    // frac=0.5 → anchorMin = 900. Zoom in by 1/1.1 (narrower). Anchor must stay at 0.5.
    const out = zoomViewport(origin, 1 / 1.1, 0.5);
    const newRange = out.visible_end_min - out.visible_start_min;
    const anchorAfter = out.visible_start_min + 0.5 * newRange;
    expect(anchorAfter).toBeCloseTo(900, 6);
    expect(newRange).toBeCloseTo(600 / 1.1, 6); // narrower = zoomed in
  });

  it("keeps the anchor minute at the same frac after zoom-out", () => {
    const out = zoomViewport(origin, 1.1, 0.25);
    const newRange = out.visible_end_min - out.visible_start_min;
    const anchorBefore = origin.visible_start_min + 0.25 * 600; // 750
    const anchorAfter = out.visible_start_min + 0.25 * newRange;
    expect(anchorAfter).toBeCloseTo(anchorBefore, 6);
    expect(newRange).toBeCloseTo(660, 6); // wider = zoomed out
  });

  it("anchor at frac=0 (left edge) keeps the left edge fixed on zoom", () => {
    const out = zoomViewport(origin, 1 / 1.1, 0);
    expect(out.visible_start_min).toBeCloseTo(600, 6); // left edge unmoved
  });

  it("anchor at frac=1 (right edge) keeps the right edge fixed on zoom", () => {
    const out = zoomViewport(origin, 1 / 1.1, 1);
    expect(out.visible_end_min).toBeCloseTo(1200, 6); // right edge unmoved
  });

  it("degenerate (0-width) viewport → no-op (returns vp, no NaN)", () => {
    expect(zoomViewport(vp(500, 500), 1.1, 0.5)).toEqual(vp(500, 500));
  });
});
