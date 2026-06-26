// M5 WP4 Phase 3 (content-driven rebuild) — the panel-size computation contract.
import { describe, expect, it } from "vitest";
import { computePanelSize, TILE, type ScreenBox } from "../pipPanelSize";

// A big screen so the cap doesn't force wrapping in the base cases.
const BIG: ScreenBox = { availWidth: 3000, availHeight: 2000 };

describe("computePanelSize — grows with workspace count along the flow axis", () => {
  it("horizontal-mirror: width grows with N, height is one tile-row", () => {
    const one = computePanelSize("horizontal-mirror", 1, BIG);
    const three = computePanelSize("horizontal-mirror", 3, BIG);
    // More workspaces → wider panel (row flow).
    expect(three.width).toBeGreaterThan(one.width);
    // Height unchanged (still one row) when not wrapping.
    expect(three.height).toBe(one.height);
    // Width = pad*2 + 3 tiles + 2 gaps.
    expect(three.width).toBe(
      TILE.pad * 2 + 3 * TILE.mirrorW + 2 * TILE.gap,
    );
  });

  it("vertical-mirror: height grows with N, width is one tile-column", () => {
    const one = computePanelSize("vertical-mirror", 1, BIG);
    const four = computePanelSize("vertical-mirror", 4, BIG);
    expect(four.height).toBeGreaterThan(one.height);
    expect(four.width).toBe(one.width); // still one column
  });

  it("compact: height grows with N (stacked rows)", () => {
    const two = computePanelSize("compact", 2, BIG);
    const six = computePanelSize("compact", 6, BIG);
    expect(six.height).toBeGreaterThan(two.height);
  });

  it("minimal: width grows with N (dots in a row), smallest unit", () => {
    const one = computePanelSize("minimal", 1, BIG);
    const five = computePanelSize("minimal", 5, BIG);
    expect(five.width).toBeGreaterThan(one.width);
    // Minimal's single-tile panel is the smallest of all layouts (tiny dots).
    const hOne = computePanelSize("horizontal-mirror", 1, BIG);
    expect(one.width * one.height).toBeLessThan(hOne.width * hOne.height);
  });
});

describe("computePanelSize — mirror tile unit matches the filmstrip tile", () => {
  it("a single horizontal mirror tile is filmstrip-tile-sized (112 wide)", () => {
    const one = computePanelSize("horizontal-mirror", 1, BIG);
    expect(one.width).toBe(TILE.pad * 2 + TILE.mirrorW); // pad*2 + 112
    expect(TILE.mirrorW).toBe(112); // pinned to App.css .filmstrip-tile width
    expect(TILE.mirrorH).toBe(64); // pinned to App.css .filmstrip-tile height
  });
});

describe("computePanelSize — caps at ~90% screen then WRAPS to a 2nd row/col", () => {
  it("horizontal: a row that would exceed 90% screen width wraps to 2 rows", () => {
    // Narrow screen so ~3 tiles fit per row; 7 workspaces → ceil(7/perRow) ≥ 2 rows.
    const narrow: ScreenBox = { availWidth: 480, availHeight: 2000 };
    const many = computePanelSize("horizontal-mirror", 7, narrow);
    const one = computePanelSize("horizontal-mirror", 1, narrow);
    // Wrapped → height is more than a single tile row.
    expect(many.height).toBeGreaterThan(one.height);
    // Width capped under ~90% of the screen (didn't grow unbounded).
    expect(many.width).toBeLessThanOrEqual(narrow.availWidth * 0.9 + 1);
  });

  it("vertical: a column that would exceed 90% screen height wraps to 2 columns", () => {
    const short: ScreenBox = { availWidth: 3000, availHeight: 360 };
    const many = computePanelSize("vertical-mirror", 10, short);
    const one = computePanelSize("vertical-mirror", 1, short);
    // Wrapped → width is more than a single column.
    expect(many.width).toBeGreaterThan(one.width);
    expect(many.height).toBeLessThanOrEqual(short.availHeight * 0.9 + 1);
  });
});

describe("computePanelSize — defensive", () => {
  it("count 0 sizes as if for 1 (the empty-roster line still needs a panel)", () => {
    const zero = computePanelSize("horizontal-mirror", 0, BIG);
    const one = computePanelSize("horizontal-mirror", 1, BIG);
    expect(zero).toEqual(one);
  });

  it("never returns a non-positive dimension", () => {
    for (const layout of ["horizontal-mirror", "vertical-mirror", "compact", "minimal"] as const) {
      const s = computePanelSize(layout, 1, { availWidth: 100, availHeight: 100 });
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });
});
