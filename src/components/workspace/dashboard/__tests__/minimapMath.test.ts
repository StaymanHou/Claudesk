// M9 WP6b-1 Phase 3 — pins the pure Minimap math. DOM-glue (mode dispatch, capture,
// RAF) is live-bridge-verified per convention; the transferable geometry is pinned here.

import { describe, expect, it } from "vitest";
import {
  minimapDxToMin,
  minimapFracToDataMin,
  minimapPan,
  minimapRecenter,
  minimapRectPct,
  minimapResizeLeft,
  minimapResizeRight,
  minimapSegPct,
} from "../minimapMath";
import type { DataWindow, Viewport } from "../viewport";

const vp = (a: number, b: number): Viewport => ({
  visible_start_min: a,
  visible_end_min: b,
});
const DAY: DataWindow = [0, 1440];

// ── minimapRectPct ─────────────────────────────────────────────────────────
describe("minimapRectPct — visible-window rectangle over the full-day track", () => {
  it("maps a viewport to left/width % of the day", () => {
    // 08:00–12:00 within [0,1440]: left 480/1440, width 240/1440.
    expect(minimapRectPct(vp(480, 720), DAY)).toEqual({
      left: `${(480 / 1440) * 100}%`,
      width: `${(240 / 1440) * 100}%`,
    });
  });
  it("full-day viewport → left 0% width 100%", () => {
    expect(minimapRectPct(vp(0, 1440), DAY)).toEqual({
      left: "0%",
      width: "100%",
    });
  });
  it("degenerate data window (dw<=0) → 0%/100%, no NaN (source-missing guard)", () => {
    expect(minimapRectPct(vp(100, 200), [500, 500])).toEqual({
      left: "0%",
      width: "100%",
    });
  });
});

// ── minimapSegPct ──────────────────────────────────────────────────────────
describe("minimapSegPct — density-bar geometry", () => {
  it("maps a seg to left/width % of the day", () => {
    const out = minimapSegPct(600, 660, DAY);
    expect(out.left).toBe(`${(600 / 1440) * 100}%`);
    expect(out.width).toBe(`${(60 / 1440) * 100}%`);
  });
  it("zero-length seg still gets a 0.1% min-width (stays visible)", () => {
    expect(minimapSegPct(600, 600, DAY).width).toBe("0.1%");
  });
  it("degenerate window → 0%/0%, no NaN", () => {
    expect(minimapSegPct(1, 2, [5, 5])).toEqual({ left: "0%", width: "0%" });
  });
});

// ── minimapFracToDataMin ───────────────────────────────────────────────────
describe("minimapFracToDataMin — pointer frac → data-minute, clamped", () => {
  it("maps mid-track to the day midpoint", () => {
    expect(minimapFracToDataMin(0.5, DAY)).toBe(720);
  });
  it("clamps frac < 0 to the left edge", () => {
    expect(minimapFracToDataMin(-0.3, DAY)).toBe(0);
  });
  it("clamps frac > 1 to the right edge", () => {
    expect(minimapFracToDataMin(1.5, DAY)).toBe(1440);
  });
});

// ── minimapDxToMin ─────────────────────────────────────────────────────────
describe("minimapDxToMin — px drag → minutes over the full-day track", () => {
  it("scales dx by dw/minimapWidth", () => {
    // 640px drag over a 1280px minimap spanning 1440 min → 720 min.
    expect(minimapDxToMin(640, 1280, DAY)).toBe(720);
  });
  it("degenerate minimap width → 0", () => {
    expect(minimapDxToMin(100, 0, DAY)).toBe(0);
  });
});

// ── minimapPan ─────────────────────────────────────────────────────────────
describe("minimapPan — drag rect body", () => {
  it("shifts both endpoints, preserving width", () => {
    expect(minimapPan(vp(480, 720), 120)).toEqual(vp(600, 840));
  });
});

// ── minimapResizeLeft / Right ──────────────────────────────────────────────
describe("minimapResizeLeft — drag left edge (right fixed)", () => {
  it("moves only the left edge", () => {
    expect(minimapResizeLeft(vp(480, 720), -60)).toEqual(vp(420, 720));
  });
  it("enforces the 1-min floor (never crosses the right edge)", () => {
    const out = minimapResizeLeft(vp(480, 720), 1000); // would push start past end
    expect(out.visible_start_min).toBe(719); // end(720) - 1
    expect(out.visible_end_min).toBe(720);
  });
});

describe("minimapResizeRight — drag right edge (left fixed)", () => {
  it("moves only the right edge", () => {
    expect(minimapResizeRight(vp(480, 720), 60)).toEqual(vp(480, 780));
  });
  it("enforces the 1-min floor (never crosses the left edge)", () => {
    const out = minimapResizeRight(vp(480, 720), -1000);
    expect(out.visible_start_min).toBe(480);
    expect(out.visible_end_min).toBe(481); // start(480) + 1
  });
});

// ── minimapRecenter ────────────────────────────────────────────────────────
describe("minimapRecenter — click background, preserve range", () => {
  it("centers the viewport on the clicked minute, same width", () => {
    // 240-min window recentered on 900 → [780, 1020].
    expect(minimapRecenter(vp(480, 720), 900)).toEqual(vp(780, 1020));
  });
  it("preserves the range exactly", () => {
    const out = minimapRecenter(vp(600, 660), 300);
    expect(out.visible_end_min - out.visible_start_min).toBe(60);
  });
});
