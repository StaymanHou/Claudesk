// M5 WP4 Phase 3 (content-driven rebuild) — compute the PiP panel size from the LAYOUT
// and the WORKSPACE COUNT, capped to the screen with wrap-to-a-second-row/column.
//
// Operator model (2026-06-26, superseding the static per-layout table): the panel size
// must REACT to the layout AND the number of open workspaces — it must NOT cram N tiles
// into a fixed box. Each layout has a fixed per-workspace "tile unit" (the same tile size
// the main-app filmstrip uses, for visual consistency); the panel grows along the layout's
// flow axis as unit × N, and when that would exceed ~90% of the screen edge the tiles WRAP
// to a second row/column (a grid) rather than scrolling or shrinking.
//
// PURE (no React/DOM/IPC) so it's vitest-pinnable. The PiP webview reads its live roster
// (frame.tiles.length) + window.screen and calls this, then asks the backend to resize via
// `pip_resize`. Keeping the math here (where the roster + screen live) is simpler than
// threading N into the backend, and keeps the backend resize command dumb.

import type { PipLayout } from "./pipLayout";

/** The shared tile-unit + chrome dimensions, mirroring the main-app filmstrip
 *  (App.css `.filmstrip-tile` 112×64, `.filmstrip` gap 8 / padding 10) so a PiP mirror
 *  tile is the SAME size as its filmstrip counterpart. Compact/minimal use their own
 *  smaller per-row / per-dot units (no mirror to size to). */
export const TILE = {
  /** Mirror tile (horizontal/vertical) — matches `.filmstrip-tile`. */
  mirrorW: 112,
  mirrorH: 64,
  /** Compact row — name+dot row. Width MATCHES the mirror tile (112) so the compact panel
   *  is the SAME width as the vertical-mirror panel (both are column-stacked layouts — they
   *  should read as the same narrow strip; operator 2026-06-26). Height is the row. */
  compactRowH: 24,
  compactW: 112,
  /** Minimal dot cell — a dot + padding. */
  minimalCell: 22,
  /** Gap between tiles (mirrors `.pip-tiles` gap + the main-app filmstrip gap:8). */
  gap: 8,
  /** `.pip-root` padding on each edge — MUST match the CSS `.pip-root { padding }`
   *  (8px) so the computed panel width equals tile-unit×N + padding with NO empty band
   *  (the "title row too long" bug was pad:10 here vs 6 in CSS → panel wider than content). */
  pad: 8,
  /** The switcher row height + the `.pip-root` column gap above the tiles
   *  (`.pip-switch-row` 18 + `.pip-root` gap 4 = 22). */
  switchRowH: 22,
} as const;

/** A panel size in logical points. */
export interface PanelSize {
  width: number;
  height: number;
}

/** The screen real-estate the panel may occupy (logical points). The PiP passes
 *  `window.screen.availWidth/availHeight`; tests pass explicit values. */
export interface ScreenBox {
  availWidth: number;
  availHeight: number;
}

/** Fraction of the screen edge the panel may grow to before wrapping. */
const SCREEN_CAP = 0.9;

/**
 * How many tiles fit along the primary axis before wrapping, given the per-tile stride
 * (tile size + gap), the available axis length (screen-capped), and the fixed padding.
 * At least 1 (a single tile always "fits" even if it alone exceeds the cap — we never
 * return a zero-column grid). Pure integer math.
 */
function tilesPerAxis(axisAvail: number, stride: number, pad: number): number {
  const usable = axisAvail - pad * 2;
  return Math.max(1, Math.floor((usable + TILE.gap) / stride));
}

/**
 * Compute the panel content size for a layout + workspace count, capped to the screen
 * with wrap. The flow axis differs per layout:
 *   - horizontal-mirror → tiles flow in a ROW (grow WIDTH); wrap to extra rows (grow H).
 *   - vertical-mirror   → tiles flow in a COLUMN (grow HEIGHT); wrap to extra cols (grow W).
 *   - compact           → name+dot rows flow in a COLUMN (grow HEIGHT); wrap to extra cols.
 *   - minimal           → dots flow in a ROW (grow WIDTH); wrap to extra rows.
 * Every height budgets the switcher row. Never returns < one tile's worth.
 */
export function computePanelSize(
  layout: PipLayout,
  count: number,
  screen: ScreenBox,
): PanelSize {
  const n = Math.max(1, count); // a 0-roster panel still sizes for the "No workspaces" line
  const { gap, pad, switchRowH } = TILE;

  // Per-layout tile unit (w, h) + flow axis ("row" grows width, "col" grows height).
  let unitW: number;
  let unitH: number;
  let flow: "row" | "col";
  switch (layout) {
    case "horizontal-mirror":
      unitW = TILE.mirrorW;
      unitH = TILE.mirrorH;
      flow = "row";
      break;
    case "vertical-mirror":
      unitW = TILE.mirrorW;
      unitH = TILE.mirrorH;
      flow = "col";
      break;
    case "compact":
      unitW = TILE.compactW;
      unitH = TILE.compactRowH;
      flow = "col";
      break;
    case "minimal":
      unitW = TILE.minimalCell;
      unitH = TILE.minimalCell;
      flow = "row";
      break;
  }

  if (flow === "row") {
    // Primary axis = width. Wrap when unit×n width would exceed SCREEN_CAP * availWidth.
    const perRow = Math.min(
      n,
      tilesPerAxis(screen.availWidth * SCREEN_CAP, unitW + gap, pad),
    );
    const rows = Math.ceil(n / perRow);
    const width = pad * 2 + perRow * unitW + (perRow - 1) * gap;
    const height = switchRowH + pad * 2 + rows * unitH + (rows - 1) * gap;
    return { width, height };
  } else {
    // Primary axis = height. Wrap when unit×n height (+switch row) would exceed cap.
    const colAvail = screen.availHeight * SCREEN_CAP - switchRowH;
    const perCol = Math.min(n, tilesPerAxis(colAvail, unitH + gap, pad));
    const cols = Math.ceil(n / perCol);
    const height = switchRowH + pad * 2 + perCol * unitH + (perCol - 1) * gap;
    const width = pad * 2 + cols * unitW + (cols - 1) * gap;
    return { width, height };
  }
}
