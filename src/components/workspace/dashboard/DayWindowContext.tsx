// M9 WP6b-4 Phase 2 — the day-window React context (PD1).
//
// A tiny context carrying the multi-day DATA-WINDOW framing: which ISO date is the
// window's first day (`windowStartIso`) and how many days it spans (`dayCount`).
// This is SEPARATE from `ViewportContext` (different concern):
//   - `ViewportContext` = the VISIBLE viewport (pan/zoom state), minute coordinates.
//   - `DayWindowContext` = the DATA window's day framing (which date is day 0), used
//     to convert a session's `day_iso` → its `dayOffset` lane + to date-label the ruler.
//
// WHY a context, not per-session props (PD1, chosen at /feature-plan): `DayTimeline`
// has ~6 `viewportPct` call-sites across `SegmentBar` / `CollapsedTrackRow` /
// `OverlapMarkerLayer` / `OverlapOverlayLayer` / the merge helper, plus `HourRuler` /
// `HourGridBackground` (which today take NO props at all) + the NOW marker — all of
// which need `windowStartIso` in multi-day mode. Threading a `windowStartIso` prop
// through every one of them (especially the currently-prop-less ruler/grid) is noisy;
// a context read where needed keeps the call-sites clean. Mirrors the source's
// `DayWindowContext` (dashboard.jsx L1996-2004).
//
// SINGLE-DAY back-compat: `DayView` provides `{ windowStartIso: null, dayCount: 1 }`
// for a bare-day payload → every `dayOffsetMin(day_iso, null)` returns 0 and
// `ticksInViewport(..., null)` emits the single-day labels → BYTE-IDENTICAL to the
// pre-WP6b-4 render (the regression gate). A default context value of `{null, 1}` also
// means a `DayTimeline` mounted outside a provider degrades to single-day, never crashes.

import { createContext, useContext, type ReactNode } from "react";

export interface DayWindow {
  /** The window's FIRST day as a local ISO date (`"YYYY-MM-DD"`), or `null` for a
   *  single-day (bare-day) payload — in which case every `dayOffset` is 0 and the
   *  ruler shows single-day labels. */
  windowStartIso: string | null;
  /** The number of days the window spans (1 for single-day). */
  dayCount: number;
}

const DEFAULT_DAY_WINDOW: DayWindow = { windowStartIso: null, dayCount: 1 };

const DayWindowContext = createContext<DayWindow>(DEFAULT_DAY_WINDOW);

export function DayWindowProvider({
  value,
  children,
}: {
  value: DayWindow;
  children: ReactNode;
}) {
  return (
    <DayWindowContext.Provider value={value}>
      {children}
    </DayWindowContext.Provider>
  );
}

/** Read the current day-window framing. Defaults to single-day (`{null, 1}`) when no
 *  provider is present — so a `DayTimeline` outside a provider degrades gracefully to
 *  the single-day render rather than throwing (unlike `useViewport`, which requires a
 *  provider because there is no safe default viewport). */
export function useDayWindow(): DayWindow {
  return useContext(DayWindowContext);
}
