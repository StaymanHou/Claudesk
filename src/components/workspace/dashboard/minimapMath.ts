// M9 WP6b-1 Phase 3 — pure math for the Minimap overview strip.
//
// The Minimap spans the ENTIRE data window (the whole day), unlike the timeline body
// which spans the current viewport. So its px↔minute mapping is over `dwWidth`, not
// the viewport range — a distinct helper set from `viewport.ts`'s gesture math.
// Everything here is pure (no React/DOM); the DOM-glue (mousedown mode dispatch,
// pointer capture, RAF) lives in `Minimap.tsx` and is live-bridge-verified, per the
// project's no-jsdom convention. The caller CLAMPS every result (`clampViewport`) —
// these helpers only compute the proposed viewport.
//
// Named `minimapMath.ts` (not `minimap.ts`) to stay case-distinct from `Minimap.tsx`
// on the case-insensitive macOS FS (foo.ts + Foo.tsx collide — TS1149/TS1261).

import type { DataWindow, Viewport } from "./viewport";

/** The rectangle's CSS left%/width% within the full-day Minimap track. Guards a
 *  degenerate data window (`dwWidth <= 0`) → `0%/100%` so the rect renders without a
 *  divide-by-zero (the source Minimap had NO such guard — required fix). */
export function minimapRectPct(
  viewport: Viewport,
  dataWindow: DataWindow,
): { left: string; width: string } {
  const [lo, hi] = dataWindow;
  const dw = hi - lo;
  if (!(dw > 0)) return { left: "0%", width: "100%" };
  const left = ((viewport.visible_start_min - lo) / dw) * 100;
  const width =
    ((viewport.visible_end_min - viewport.visible_start_min) / dw) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

/** Percent left/width of a [start,end] segment within the full-day track (for the
 *  density bars). Min-width 0.1% so a zero-length seg still shows (source-faithful).
 *  Degenerate window → 0%/0% (no NaN). */
export function minimapSegPct(
  start: number,
  end: number,
  dataWindow: DataWindow,
): { left: string; width: string } {
  const [lo, hi] = dataWindow;
  const dw = hi - lo;
  if (!(dw > 0)) return { left: "0%", width: "0%" };
  const left = ((start - lo) / dw) * 100;
  const width = Math.max(0.1, ((end - start) / dw) * 100);
  return { left: `${left}%`, width: `${width}%` };
}

/** Convert a pointer x (fraction 0..1 of the full-day track) to a data-minute. Frac
 *  is clamped to [0,1] so a click just outside the track pins to an edge. */
export function minimapFracToDataMin(
  frac: number,
  dataWindow: DataWindow,
): number {
  const [lo, hi] = dataWindow;
  const clamped = Math.max(0, Math.min(1, frac));
  return lo + clamped * (hi - lo);
}

/** Convert a px drag delta on the Minimap to a minute delta (over the full-day
 *  track). `dxPx` positive = drag right. Degenerate track → 0. */
export function minimapDxToMin(
  dxPx: number,
  minimapWidthPx: number,
  dataWindow: DataWindow,
): number {
  if (!(minimapWidthPx > 0)) return 0;
  const dw = dataWindow[1] - dataWindow[0];
  return (dxPx / minimapWidthPx) * dw;
}

/** PAN the viewport by a minute delta (drag the rect body). Both endpoints shift
 *  equally (width preserved); the caller clamps. */
export function minimapPan(origin: Viewport, dxMin: number): Viewport {
  return {
    visible_start_min: origin.visible_start_min + dxMin,
    visible_end_min: origin.visible_end_min + dxMin,
  };
}

/** RESIZE by dragging the LEFT edge: move `visible_start_min` by `dxMin`, right edge
 *  fixed. Enforces a 1-minute min span (never crosses/collapses); the caller clamps
 *  to the data window. */
export function minimapResizeLeft(
  origin: Viewport,
  dxMin: number,
  minSpanMin: number = 1,
): Viewport {
  const newStart = origin.visible_start_min + dxMin;
  const maxStart = origin.visible_end_min - minSpanMin;
  return {
    visible_start_min: Math.min(newStart, maxStart),
    visible_end_min: origin.visible_end_min,
  };
}

/** RESIZE by dragging the RIGHT edge: move `visible_end_min` by `dxMin`, left edge
 *  fixed. 1-minute min span floor; caller clamps. */
export function minimapResizeRight(
  origin: Viewport,
  dxMin: number,
  minSpanMin: number = 1,
): Viewport {
  const newEnd = origin.visible_end_min + dxMin;
  const minEnd = origin.visible_start_min + minSpanMin;
  return {
    visible_start_min: origin.visible_start_min,
    visible_end_min: Math.max(newEnd, minEnd),
  };
}

/** RE-CENTER the viewport on `centerMin`, PRESERVING the current range (click the
 *  track background). The caller clamps back into the data window. */
export function minimapRecenter(vp: Viewport, centerMin: number): Viewport {
  const range = vp.visible_end_min - vp.visible_start_min;
  return {
    visible_start_min: centerMin - range / 2,
    visible_end_min: centerMin + range / 2,
  };
}
