// M9 WP6b-1 Phase 3 — the Minimap overview strip (the priority deliverable).
//
// A compressed all-projects density track spanning the WHOLE data window, with a
// draggable/resizable rectangle marking the current viewport:
//   - drag rect BODY   → pan
//   - drag rect EDGES  → zoom (one endpoint moves, other fixed)
//   - click BACKGROUND → re-center the viewport there (preserving range)
//
// Reads the shared viewport via `useViewport()` (so the rect tracks every timeline
// gesture live) and writes via `useViewportSetter()` (so every Minimap gesture moves
// the timeline). All writes route through the clamped context setter. Mode dispatch is
// by `data-minimap-mode` on the mousedown target (source-faithful; no geometric
// hit-test). Pure geometry lives in `./minimapMath` (vitest-pinned); this file is the
// DOM/React glue (live-bridge-verified per project convention).
//
// Fixes over the source Minimap: a `dwWidth<=0` guard (via minimapMath) + the pending
// RAF is cancelled on unmount (the source leaked it).

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { RangePayload, SegKind } from "../../../state/timeAnalytics";
import { CT_TOKENS } from "./tokens";
import { segStyle } from "./kinds";
import {
  minimapDxToMin,
  minimapFracToDataMin,
  minimapPan,
  minimapRecenter,
  minimapRectPct,
  minimapResizeLeft,
  minimapResizeRight,
  minimapSegPct,
} from "./minimapMath";
import { dayOffsetMin, type Viewport } from "./viewport";
import { useViewport, useViewportSetter } from "./ViewportContext";
import { useDayWindow } from "./DayWindowContext";

const MINIMAP_HEIGHT = 80;

type DragMode = "pan" | "edge-left" | "edge-right";
interface MinimapDrag {
  mode: DragMode;
  startClientX: number;
  startViewport: Viewport;
  trackWidthPx: number;
}

/** One flattened density bar (all projects merged onto one track). */
interface DensitySeg {
  kind: SegKind;
  start: number;
  end: number;
}

export interface MinimapProps {
  /** The 1-day payload (same one DayTimeline renders) — supplies the density track. */
  data: RangePayload;
}

export function Minimap({ data }: MinimapProps) {
  const viewport = useViewport();
  const { setViewport, dataWindow } = useViewportSetter();
  // WP6b-4 re-spec fix (P2.7): the density track must place each seg on its multi-day
  // LANE, not its raw minute-of-day. `windowStartIso` is the fixed coordinate origin
  // (today-29d) provided by DayViewHost — the SAME origin DayTimeline shifts by — so the
  // Minimap density aligns with the timeline below. Single-day (windowStartIso===null) →
  // every dayOffset is 0 → byte-identical to the WP6b-1 single-day flattening.
  const { windowStartIso } = useDayWindow();
  // The track MUST span the SAME coordinate window as the ViewportProvider (the loaded
  // window, e.g. [12960,43200] = lane 9→30 under the fixed origin), NOT the payload-relative
  // `deriveDataWindow(data)=[0,day_count*1440]` which starts at 0 and would push the
  // fixed-origin-shifted density bars past 100% (P2.7 fix #2). `useViewportSetter().dataWindow`
  // is the single source of truth — the rect + density + pan/recenter math all use it, so
  // they stay in one frame. (`deriveDataWindow` is still the ViewportProvider's input in
  // GlobalDashboard; the Minimap just reads the resolved window from context.)

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<MinimapDrag | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cancel any pending RAF on unmount (the source Minimap LEAKS this).
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scheduleSet = useCallback(
    (next: (prev: Viewport) => Viewport) => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setViewport(next);
      });
    },
    [setViewport],
  );

  // Flatten every project's every seg onto one aggregate density track, SHIFTED by each
  // session's fixed-origin dayOffset (P2.7) so multi-day activity lands on its own lane
  // instead of collapsing onto lane 0. Mirrors DayTimeline's per-session offset.
  const density = useMemo<DensitySeg[]>(() => {
    const out: DensitySeg[] = [];
    for (const p of data.projects) {
      for (const s of p.sessions) {
        const dayOffset = dayOffsetMin(s.day_iso, windowStartIso);
        for (const seg of s.segs) {
          out.push({
            kind: seg.kind,
            start: seg.start + dayOffset,
            end: seg.end + dayOffset,
          });
        }
      }
    }
    return out;
  }, [data.projects, windowStartIso]);

  const rect = minimapRectPct(viewport, dataWindow);

  const onMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const r = track.getBoundingClientRect();
      if (r.width <= 0) return;
      const mode = (e.target as HTMLElement | null)?.dataset?.minimapMode as
        | DragMode
        | "background"
        | undefined;

      if (mode === "pan" || mode === "edge-left" || mode === "edge-right") {
        dragRef.current = {
          mode,
          startClientX: e.clientX,
          startViewport: viewport,
          trackWidthPx: r.width,
        };
      } else {
        // Click on the track background (or the density bars, which are
        // pointerEvents:none) → re-center on the clicked minute, preserving range.
        const frac = (e.clientX - r.left) / r.width;
        const centerMin = minimapFracToDataMin(frac, dataWindow);
        scheduleSet((prev) => minimapRecenter(prev, centerMin));
      }
      // Prevent the timeline's gesture handler (or text selection) from also reacting.
      e.stopPropagation();
      e.preventDefault();
    },
    [viewport, dataWindow, scheduleSet],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dxMin = minimapDxToMin(
        e.clientX - drag.startClientX,
        drag.trackWidthPx,
        dataWindow,
      );
      const origin = drag.startViewport;
      if (drag.mode === "pan") {
        scheduleSet(() => minimapPan(origin, dxMin));
      } else if (drag.mode === "edge-left") {
        scheduleSet(() => minimapResizeLeft(origin, dxMin));
      } else {
        scheduleSet(() => minimapResizeRight(origin, dxMin));
      }
    },
    [dataWindow, scheduleSet],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={trackRef}
      data-testid="dashboard-minimap"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      style={{
        position: "relative",
        height: MINIMAP_HEIGHT,
        flexShrink: 0,
        margin: "0 20px 8px",
        borderRadius: 6,
        border: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surfaceDim,
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {/* Aggregate density track — pointerEvents:none so bars never intercept a drag. */}
      {density.map((seg, i) => {
        const { left, width } = minimapSegPct(seg.start, seg.end, dataWindow);
        return (
          <div
            key={i}
            data-minimap-seg
            data-seg-kind={seg.kind}
            style={{
              position: "absolute",
              left,
              width,
              top: 22,
              bottom: 10,
              borderRadius: 1,
              ...segStyle(seg.kind),
              opacity: 0.6,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Visible-window rectangle: body (pan) + two 6px edge grab-strips (resize). */}
      <div
        data-minimap-mode="pan"
        data-minimap-rect
        style={{
          position: "absolute",
          left: rect.left,
          width: rect.width,
          top: 6,
          bottom: 4,
          boxSizing: "border-box",
          border: `1.5px solid ${CT_TOKENS.textSecondary}`,
          borderRadius: 3,
          background: "oklch(0.85 0 0 / 0.10)",
          cursor: "grab",
        }}
      >
        <div
          data-minimap-mode="edge-left"
          style={{
            position: "absolute",
            left: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "ew-resize",
          }}
        />
        <div
          data-minimap-mode="edge-right"
          style={{
            position: "absolute",
            right: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "ew-resize",
          }}
        />
      </div>
    </div>
  );
}
