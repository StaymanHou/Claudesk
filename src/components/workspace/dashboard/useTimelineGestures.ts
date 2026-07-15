// M9 WP6b-1 Phase 2 — the timeline gesture hook.
//
// Drives the shared viewport from the DayTimeline body surface: drag-pan,
// ctrl/cmd-wheel + trackpad-pinch zoom (cursor-anchored), and click-vs-pan
// disambiguation. Ported/redesigned from the standalone claude-time
// `useTimelineGestures` (dashboard.jsx:2729), with the WP6b-1 improvements baked in:
//   - EVERY write goes through the context `setViewport`, which clamps — so pan is
//     CONTAINED (the source left pan unbounded).
//   - The pending RAF is CANCELLED on unmount (the source leaked it).
//   - No 232px `ROW_LEFT_WIDTH` gutter math: the hook attaches to the timeline BODY
//     (the flex:1 region right of the label column), so a pointer x maps directly
//     over the body width with no gutter offset.
//
// Click-vs-pan (source item 4): the pan `pointerdown` EARLY-RETURNS when the target
// is inside a `[data-seg-id]` element, so a mousedown on a SegmentBar never starts a
// pan and its onClick select (Phase 3 / WP6b-2) fires normally. NO pixel threshold.
//
// Trackpad pinch (source item 4): NOT a separate handler — browsers synthesize
// `ctrlKey === true` on a pinch wheel event, so the `ctrlKey || metaKey` gate covers
// both ctrl-wheel and trackpad-pinch with one path.
//
// All coordinates are minutes-from-local-midnight (the shared-viewport unit).

import { useCallback, useEffect, useRef } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { panViewport, zoomViewport, type Viewport } from "./viewport";
import { useViewport, useViewportSetter } from "./ViewportContext";

/** The frozen state captured at pointerdown, so pan deltas are computed against a
 *  stable origin (idempotent under RAF frame-coalescing). */
interface DragState {
  startClientX: number;
  startViewport: Viewport;
  bodyWidthPx: number;
}

/** Fixed zoom factor per wheel tick (source-faithful ~1.1). */
const ZOOM_FACTOR = 1.1;

export interface TimelineGestureHandlers {
  /** Attach to the timeline BODY wrapper (the flex:1 region, NOT the label column). */
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onWheel: (e: ReactWheelEvent) => void;
}

/**
 * Returns the pointer/wheel handlers to spread onto the timeline body element.
 * Reads the live viewport (for wheel-anchor math) and writes via the clamped
 * context setter. Pan uses a frozen origin captured at pointerdown.
 */
export function useTimelineGestures(): TimelineGestureHandlers {
  const viewport = useViewport();
  const { setViewport } = useViewportSetter();

  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cancel any pending RAF on unmount (the source LEAKS this).
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Coalesce viewport writes to one per animation frame (cancel-and-reschedule;
  // the latest updater wins). `next` is an UPDATER `(prev) => Viewport` so it computes
  // against the COMMITTED viewport — no stale ref, so even multiple wheel events within
  // one frame each anchor off the correct prior state. The context setter clamps.
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

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Click-vs-pan: a press that lands on a segment bar OR any interactive control
      // must NOT start a pan — otherwise `setPointerCapture` below retargets the
      // pointerup and STEALS the control's click. Covers the segment bars (select) +
      // the project-row chevron (collapse/expand) + any future in-timeline button/link.
      // (P3.verify-human.6 regression: without `[data-chevron-toggle]` here the pan
      // captured the chevron's click and the project stopped collapsing.) DOM-target
      // check — no pixel threshold.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          "[data-seg-id], [data-chevron-toggle], button, [role=button], a",
        )
      )
        return;

      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return; // degenerate body — nothing to pan against
      // Freeze the current (committed) viewport as the drag origin — pan deltas are
      // relative to where the pointer went DOWN, not the accumulating window. The
      // render-time `viewport` IS the committed value (pointerdown fires between
      // renders), so no ref is needed.
      dragRef.current = {
        startClientX: e.clientX,
        startViewport: viewport,
        bodyWidthPx: rect.width,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw if the pointer is already released; ignore.
      }
      document.body.style.cursor = "grabbing";
    },
    [viewport],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      // Pan against the FROZEN origin (idempotent under RAF coalescing) — the updater
      // ignores `prev` because a drag's target is always relative to the pointerdown
      // state, not the accumulating viewport. `panViewport` owns the px→minute +
      // width-preserving math.
      scheduleSet(() => panViewport(drag.startViewport, dx, drag.bodyWidthPx));
    },
    [scheduleSet],
  );

  const endDrag = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    const el = e.currentTarget as HTMLElement;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // already released — ignore.
    }
  }, []);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      // Plain wheel = page scroll (do nothing to the viewport). Only ctrl/cmd-wheel
      // (and trackpad pinch, which the browser reports as ctrlKey) zooms.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      // Cursor anchor: the fractional position under the pointer, over the body.
      const frac = (e.clientX - rect.left) / rect.width;
      // deltaY > 0 (wheel down / pinch out) → zoom OUT (bigger range). Compute off the
      // COMMITTED `prev` (functional updater) so rapid multi-event-per-frame zooming
      // stays exact — the pure `zoomViewport` keeps the anchor minute at `frac`.
      const factor = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      scheduleSet((prev) => zoomViewport(prev, factor, frac));
    },
    [scheduleSet],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onWheel,
  };
}
