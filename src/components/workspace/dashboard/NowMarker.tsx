// M9 WP6b-4 Phase 2 — the live "now" marker (revives the WP6a/6b-1-dropped source
// feature; D2). A thin vertical line at the current wall-clock minute, placed on
// TODAY's lane via the multi-day `dayOffset`. Shows in both single-day (today) and
// multi-day renders; absent when the shown window does not include today.
//
// Ported from dashboard.jsx `useNowMin` (L241-248) + the HourRuler nowFrac placement
// (L2193-2210), adapted: the impure "current time" lives in the `useNowMin` React hook
// (a 60s interval — NOT unit-pinned, per the pure-module convention), while the
// PLACEMENT math is `viewportPct` (pure, already pinned) + `dayOffsetMin` (pure, pinned
// in viewport.test.ts). The line reads the shared viewport so it tracks pan/zoom live.
//
// Coordinate: `nowAbs = nowMin + dayOffsetMin(todayIso, windowStartIso)` — the current
// minute-of-day shifted onto today's lane. In single-day mode `windowStartIso` is null
// → offset 0 → `nowAbs = nowMin` (today's minute-of-day), which is correct because a
// single-day view IS today (the Day view's default). If the window excludes today
// (a past range), `todayIso` falls outside `[start, end]` → we render nothing.

import { useEffect, useState } from "react";
import { CT_TOKENS } from "./tokens";
import { useViewport } from "./ViewportContext";
import { useDayWindow } from "./DayWindowContext";
import { nowMarkerAbsMin, viewportPct } from "./viewport";

/** Current local minute-of-day + today's local ISO date, re-read every 60s. Impure
 *  (reads the clock) — deliberately NOT a pinned pure function; the placement math it
 *  feeds is pure + pinned. Returns fresh values on each 60s tick so the line drifts. */
function useNowMin(): { nowMin: number; todayIso: string } {
  const compute = () => {
    const d = new Date();
    return {
      nowMin: d.getHours() * 60 + d.getMinutes(),
      todayIso: `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    };
  };
  const [now, setNow] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setNow(compute()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The live now-line, rendered as an absolutely-positioned overlay INSIDE the timeline
 * body (a sibling of the project rows, spanning full height). Renders `null` when the
 * shown window doesn't include today (a purely-past range) or when the marker would
 * fall outside the visible viewport.
 */
export function NowMarker() {
  const viewport = useViewport();
  const { windowStartIso, dayCount } = useDayWindow();
  const { nowMin, todayIso } = useNowMin();

  // Is today within the shown window, and at what absolute-minute? Pure decision
  // (nowMarkerAbsMin, unit-pinned): single-day → nowMin; multi-day → shifted onto
  // today's lane, or null when today is outside the shown range (→ hide the marker).
  const nowAbs = nowMarkerAbsMin(nowMin, todayIso, windowStartIso, dayCount);
  if (nowAbs === null) return null;

  // Only draw when inside the visible viewport (avoids a marker glued to an edge).
  if (
    nowAbs < viewport.visible_start_min ||
    nowAbs > viewport.visible_end_min
  ) {
    return null;
  }

  const { left } = viewportPct(nowAbs, nowAbs + 0.5, viewport);
  return (
    <div
      data-testid="dashboard-now-marker"
      data-now-min={nowMin}
      title="Now"
      style={{
        position: "absolute",
        left,
        top: 0,
        bottom: 0,
        width: 0,
        marginLeft: -1,
        borderLeft: `1.5px solid ${CT_TOKENS.nowMarker}`,
        pointerEvents: "none",
        zIndex: 3,
      }}
    />
  );
}
