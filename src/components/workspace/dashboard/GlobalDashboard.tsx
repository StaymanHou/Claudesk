// M9 WP6a — GlobalDashboard: the GLOBAL (all-projects) time-analytics view.
//
// This is NOT a per-workspace right-panel tab. It is a TOP-LEVEL view, mounted ONCE,
// that overlays/replaces the center stage (the PickerOverlay pattern in App.tsx). It
// is opened by the ⌘⇧A app-level chord (dashboardChord.ts) or the Filmstrip analytics
// button, and dismissed via its own close/back affordance (`onClose`). Its data is
// all-projects (`queryTimeAnalytics` is `scope: "global"`) — showing it inside one
// workspace's panel would imply a workspace-scoping that does not exist
// (SURFACE-2026-07-08-M9-WP6A-DASHBOARD-IS-GLOBAL-NOT-PER-WORKSPACE).
//
// This is the LAZY default export mounted by App.tsx (React.lazy + Suspense — the
// chunk loads on first open, not at app boot; folds in
// SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD).
//
// PHASE 2 (this file): the frame (header + close) + the tracking-gate + the view render.
// It reads the WP5 tracking toggle (`getTimeTrackingEnabled`), stays in sync via the
// `TIME_TRACKING_ENABLED_EVENT` broadcast (mirror of ProjectPicker's seed+listen), and —
// when tracking is ON — fetches the active view's payload and renders it. Empty/loading
// states (per the pure `dashboardMode` predicate + a per-view `hasData`):
//   - tracking OFF → "enable tracking" (dashboard-empty-tracking-off)
//   - tracking ON, fetch in flight → loading
//   - tracking ON, no rows → "no activity recorded" (dashboard-empty-nodata)
//
// WP6b-2 makes this VIEW-DRIVEN: a `view` state selects Day (interactive timeline +
// Minimap) or Week (rollup grid); the fetch dispatches to `queryTimeAnalytics` with the
// matching QueryWindow and branches on `result.kind`. Month/Custom land in Phases 2/3.

import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  TIME_TRACKING_ENABLED_EVENT,
  getTimeTrackingEnabled,
  queryTimeAnalytics,
  type RangePayload,
  type WeekPayload,
  type MetricsPayload,
  type ComparisonPayload,
  type CompareSpec,
} from "../../../state/timeAnalytics";
import { dashboardMode } from "./dashboardState";
import { DayTimeline } from "./DayTimeline";
import { WeekTimeline } from "./WeekTimeline";
import { MonthView } from "./MonthView";
import { MetricsView } from "./MetricsView";
import { CompareViewContainer, type ComparePresetOrCustom } from "./CompareView";
import { RangePicker } from "./RangePicker";
import { SidePanel } from "./SidePanel";
import { resolveSelectedSeg } from "./sidePanelMath";
import {
  Toolbar,
  SummaryStrip,
  Legend,
  MonthNav,
  WeekNav,
  type DashboardView,
} from "./Chrome";
import { dayStats } from "./dayStats";
import { colorForKind } from "./kinds";
import {
  ViewportProvider,
  useViewport,
  useViewportSetter,
} from "./ViewportContext";
import { DayWindowProvider } from "./DayWindowContext";
import {
  dayOffsetMin,
  framedRange,
  needsExtend,
  seedViewportToday,
  MAX_ZOOM_OUT_SPAN_MIN,
} from "./viewport";
import { Minimap } from "./Minimap";
import {
  monthIsoToLabel,
  monthRangeMs,
  prevMonthIso,
  nextMonthIso,
  todayMonthIso,
  todayDateIso,
} from "./monthMath";
import { rangeToMs, stepIso } from "./rangeMath";
import {
  mondayOfDate,
  prevMondayIso,
  nextMondayIso,
  weekNavLabel,
  isFutureMonday,
} from "./weekMath";

interface GlobalDashboardProps {
  /** Dismiss the dashboard, returning to the workspace center stage. */
  onClose: () => void;
}

/** Inline "no activity" body shown INSIDE a data view (Day/Week) when the shown period
 *  has no rows — the toolbar + period-nav still render above it, so the operator can step
 *  back to a period with data (fixes the empty-period nav trap; Month has its own
 *  always-valid grid so it doesn't use this). `period` names what's empty ("this week" /
 *  "this day"). */
function InlinePeriodEmpty({ period }: { period: string }) {
  return (
    <div
      className="dashboard-empty dashboard-empty-inline"
      data-testid="dashboard-empty-period"
      style={{ flex: 1 }}
    >
      <p className="dashboard-empty-title">No activity {period}</p>
      <p className="dashboard-empty-hint">
        Nothing was recorded {period}. Use the arrows above to step to a period
        with activity.
      </p>
    </div>
  );
}

/** The fixed coordinate span of the flexible timeline: 30 day-lanes from `originIso`
 *  (WP6b-4 re-spec PD1/PD3/D9). The origin never moves, so a backward auto-extend keeps
 *  every already-rendered lane's coordinate identical (no viewport shift). */
const COORD_WINDOW_END_MIN = MAX_ZOOM_OUT_SPAN_MIN; // 30 * 1440

/**
 * WP6b-4 re-spec — wraps `DayView` in the two context providers under the FIXED-ORIGIN
 * flexible-timeline model (PD1/PD3). There is NO single-day-vs-multi-day mode: the
 * timeline is always one continuous camera over a fixed 30-day coordinate space anchored
 * at `originIso` (= today-29d).
 *   - `DayWindowProvider.windowStartIso` is ALWAYS `originIso` (PD3 — NOT `meta.start`),
 *     so `DayTimeline`'s per-session `dayOffsetMin(session.day_iso, originIso)` places
 *     each lane at an origin-stable coordinate that survives auto-extend re-fetches.
 *   - `ViewportProvider.dataWindow` is the LOADED window in coordinate minutes (the pan
 *     clamp bound) — pan reaches only where data is fetched; zoom-out is capped at 30d by
 *     `clampViewport` (Phase 1). It GROWS on auto-extend without re-seeding (the explicit
 *     `seedKey` decouples re-seed from `dataWindow` — see below).
 *   - `seed` is `seedViewportToday` (D6′ — open framed on today at a legible zoom); it is
 *     the reset ("Fit"→whole-loaded-window is handled in DayView, a different target).
 *   - `seedKey` bumps ONLY on an intentional re-frame (jump-to / Day-tab reset / tracking
 *     flip) — the parent controls it via `reFrameKey`. The auto-extend's `dataWindow`
 *     widen is NOT a re-frame, so the user's pan is preserved across the grow.
 */
function DayViewHost({
  dayData,
  originIso,
  loadedStartIso,
  loadedEndIso,
  todayIso,
  frameTarget,
  reFrameKey,
  onExtend,
  ...dayViewProps
}: {
  dayData: RangePayload;
  originIso: string;
  loadedStartIso: string;
  loadedEndIso: string;
  todayIso: string;
  /** The span to FRAME on the next re-seed (jump-to / Month drill-down). `null` → open
   *  framed on TODAY (D6′, the default). Changes to this bump `reFrameKey`. */
  frameTarget: { startIso: string; endIso: string } | null;
  /** Bumped by the parent on an intentional re-frame → the ViewportProvider re-seeds. */
  reFrameKey: string;
  /** Fired by the auto-extend watcher when the viewport nears a loaded edge. */
  onExtend: (dir: "older" | "newer") => void;
} & Omit<Parameters<typeof DayView>[0], "data" | "originIso" | "todayIso">) {
  // The seed (D6′): default → today's lane at a legible active-hours zoom (the open
  // state). On a jump-to (`frameTarget` set) → frame that span (start-lane's 00:00 to
  // end-lane's 24:00), so a picker/Month-drilldown lands the camera on the picked span.
  // `clampViewport` (via the provider) caps the framed span at 30 days + clamps to the
  // loaded window. `dayData.hour_range` gives the today-seed its legible active-hours.
  const seed = frameTarget
    ? {
        visible_start_min: dayOffsetMin(frameTarget.startIso, originIso),
        visible_end_min: dayOffsetMin(frameTarget.endIso, originIso) + 1440,
      }
    : seedViewportToday(originIso, todayIso, dayData.hour_range);
  // The loaded window in coordinate minutes = the pan clamp bound (PD3). Origin-relative,
  // so it's a sub-range of the fixed [0, 30*1440] coordinate space.
  const loadedWindow: [number, number] = [
    dayOffsetMin(loadedStartIso, originIso),
    dayOffsetMin(loadedEndIso, originIso) + 1440,
  ];
  return (
    <DayWindowProvider
      value={{
        windowStartIso: originIso, // PD3 — fixed origin, NOT meta.start
        // The COORDINATE span (30 lanes), NOT the loaded payload's day_count. `dayCount`
        // gates the NOW-marker lane-in-range check (`laneIx < dayCount`); today's lane in
        // the fixed-origin space is 29 (= today-29d origin), so this MUST be the full 30
        // or the NOW marker would (wrongly) hide. Origin-stable across auto-extend.
        dayCount: COORD_WINDOW_END_MIN / 1440,
      }}
    >
      <ViewportProvider
        seed={seed}
        dataWindow={loadedWindow}
        // Re-seed ONLY on an intentional re-frame: the parent's `reFrameKey` +
        // the seed's own numeric identity (so a genuinely different today-seed also
        // re-frames), but NOT the loaded-window bounds (auto-extend must not re-seed).
        seedKey={`${reFrameKey}|${seed.visible_start_min}|${seed.visible_end_min}`}
      >
        <AutoExtendWatcher
          loadedWindow={loadedWindow}
          coordWindowEnd={COORD_WINDOW_END_MIN}
          onExtend={onExtend}
        />
        <DayView
          data={dayData}
          originIso={originIso}
          todayIso={todayIso}
          {...dayViewProps}
        />
      </ViewportProvider>
    </DayWindowProvider>
  );
}

/**
 * WP6b-4 re-spec — the auto-extend edge-watcher (D7). Renders nothing; lives INSIDE the
 * ViewportProvider so it can read the live viewport via `useViewport()`. A debounced
 * effect calls the pure `needsExtend(viewport, loadedWindow, coordEnd)`; when the camera
 * nears the older (or newer, if the loaded window doesn't reach today) edge, it fires
 * `onExtend` so the parent widens the fetched span. Because the coordinate origin is
 * FIXED (PD1), the widened re-fetch keeps every existing lane's coordinate identical —
 * so `dataWindow` grows but the viewport is preserved (no jump under the operator). A ref
 * de-dupes rapid fires while an extend is in flight (the parent clears it on the new
 * payload by passing a wider `loadedWindow`, which flips `needsExtend` back to null).
 */
function AutoExtendWatcher({
  loadedWindow,
  coordWindowEnd,
  onExtend,
}: {
  loadedWindow: [number, number];
  coordWindowEnd: number;
  onExtend: (dir: "older" | "newer") => void;
}) {
  const viewport = useViewport();
  const firingRef = useRef(false);
  const [lo, hi] = loadedWindow;
  useEffect(() => {
    // A new loadedWindow (post-extend) clears the in-flight guard — the fetch landed.
    firingRef.current = false;
  }, [lo, hi]);
  useEffect(() => {
    if (firingRef.current) return; // an extend is already in flight
    const t = setTimeout(() => {
      const dir = needsExtend(viewport, [lo, hi], coordWindowEnd);
      if (dir) {
        firingRef.current = true;
        onExtend(dir);
      }
    }, 120); // debounce — don't fire mid-gesture-frame; ~2 RAF ticks of settle
    return () => clearTimeout(t);
  }, [viewport, lo, hi, coordWindowEnd, onExtend]);
  return null;
}

/**
 * The interactive flexible timeline (WP6b-4 re-spec) — rendered INSIDE the
 * `ViewportProvider` so it can (a) wire the Toolbar's "Fit" button to a
 * fit-the-whole-loaded-window zoom-out, and (b) derive the RangePicker's REACTIVE
 * readout from the LIVE viewport (`framedRange`). There is no mode: the picker reflects
 * whatever the camera currently frames and its `onChange` is a jump-to (the parent
 * extends the fetch if the target span is outside the loaded window).
 */
function DayView({
  view,
  onViewChange,
  data,
  isEmpty,
  originIso,
  todayIso,
  onRangeChange,
  expandedProjects,
  onToggleProject,
  selectedSegId,
  onSelectSeg,
  onCloseSidePanel,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  data: RangePayload;
  /** The loaded window has no rows — render an inline empty body instead of the timeline,
   *  but KEEP the toolbar + RangePicker so the operator can jump/pick to an active span. */
  isEmpty: boolean;
  /** The fixed coordinate origin (today-29d) — maps the live viewport → the framed ISO
   *  span for the reactive RangePicker readout. */
  originIso: string;
  /** Today (local ISO) — the framed-range upper clamp + the picker's `max`. */
  todayIso: string;
  /** Jump-to a span (RangePicker onChange / Month drill-down). The parent moves the
   *  camera there + extends the fetch if the span is outside the loaded window. */
  onRangeChange: (startIso: string, endIso: string) => void;
  expandedProjects: string[];
  onToggleProject: (projectId: string) => void;
  /** `"<session_id>:<segIndex>"` of the selected segment, or null (no panel). */
  selectedSegId: string | null;
  /** A segment bar was clicked — open the SidePanel on it. */
  onSelectSeg: (id: string) => void;
  /** Close the SidePanel + clear the selection. */
  onCloseSidePanel: () => void;
}) {
  const { setViewport, dataWindow } = useViewportSetter();
  const viewport = useViewport();
  // Resolve the selection id → {project, session} against the current payload. Null when
  // nothing is selected OR the id no longer resolves (e.g. a stale selection after the
  // range changed) — in both cases the panel is omitted.
  const selected = resolveSelectedSeg(selectedSegId, data);
  // REACTIVE picker readout (D8): the day-granular ISO span the camera currently frames,
  // derived LIVE from the viewport. As the operator pans/zooms, the picker's start→end
  // fields track the visible range (no committed "picked range" state). `framedRange` is
  // pure + day-granular, so this doesn't thrash on sub-day gesture jitter.
  const framed = framedRange(viewport, originIso, todayIso);
  // "Fit" (WP6b-4 re-spec): always zoom to the WHOLE loaded window (`dataWindow`) — the
  // on-demand see-everything gesture. The seed opens framed on today (D6′); Fit is the
  // distinct zoom-all-the-way-out. `clampViewport`'s 30-day span cap keeps it ≤30 lanes.
  const onFit = () =>
    setViewport({
      visible_start_min: dataWindow[0],
      visible_end_min: dataWindow[1],
    });
  return (
    <>
      <Toolbar
        view={view}
        onViewChange={onViewChange}
        dateLabel={data.label}
        onFitDay={isEmpty ? undefined : onFit}
        fitLabel="Fit range"
        rightSlot={
          <RangePicker
            startIso={framed.startIso}
            endIso={framed.endIso}
            onChange={onRangeChange}
          />
        }
      />
      {isEmpty ? (
        // Empty loaded window: keep the toolbar + range picker (above) so the operator can
        // jump/pick to an active span; the Summary/Legend/Minimap/timeline are data-driven,
        // so show the inline empty body in their place.
        <InlinePeriodEmpty
          period={framed.startIso !== framed.endIso ? "in this range" : "this day"}
        />
      ) : (
        <>
          <SummaryStrip stats={dayStats(data, colorForKind("ai-doing"))} />
          <div className="dashboard-legend-row">
            <Legend />
          </div>
          {/* WP6b-1 Phase 3: the Minimap overview strip — a sibling of DayTimeline inside
              the ViewportProvider, so both read/write the one shared viewport. Sits
              between the Legend and the timeline body. */}
          <Minimap data={data} />
          {/* WP6b-2 Phase 4: the timeline + SidePanel share the remaining height in a
              horizontal flex row. DayTimeline is `flex:1` (grows); SidePanel is a fixed
              360px `flexShrink:0` sibling that appears on the right only when a segment is
              selected. */}
          <div className="dashboard-day-body">
            <DayTimeline
              data={data}
              expandedProjects={expandedProjects}
              onToggleProject={onToggleProject}
              selectedSegId={selectedSegId}
              onSelectSeg={onSelectSeg}
            />
            {selected && (
              <SidePanel
                session={selected.session}
                project={selected.project}
                onClose={onCloseSidePanel}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

/** The week rollup view — Toolbar (Week tab + the prev/next WeekNav in the right slot) +
 *  Legend + the WeekTimeline grid. No ViewportProvider/Minimap (those are Day-only). The
 *  WeekNav steps a `mondayIso` anchor ±7d → the backend `{kind:"week",monday}` window
 *  (WP6b-3); Week stays the day-count-agnostic rollup grid, so a past week renders with
 *  zero multi-day-timeline dependency. */
function WeekView({
  view,
  onViewChange,
  data,
  isEmpty,
  mondayIso,
  onPrevWeek,
  onNextWeek,
  nextWeekDisabled,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  data: WeekPayload;
  /** The shown week has no rows — render an inline empty body instead of the grid, but
   *  KEEP the toolbar + WeekNav so the operator can step back to an active week. */
  isEmpty: boolean;
  mondayIso: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  nextWeekDisabled: boolean;
}) {
  return (
    <>
      <Toolbar
        view={view}
        onViewChange={onViewChange}
        dateLabel={data.label}
        rightSlot={
          <WeekNav
            label={weekNavLabel(mondayIso)}
            mondayIso={mondayIso}
            onPrev={onPrevWeek}
            onNext={onNextWeek}
            nextDisabled={nextWeekDisabled}
          />
        }
      />
      <div className="dashboard-legend-row">
        <Legend />
      </div>
      {isEmpty ? <InlinePeriodEmpty period="this week" /> : <WeekTimeline data={data} />}
    </>
  );
}

/** The month contribution-calendar view — Toolbar (Month tab + the prev/next MonthNav in
 *  the right slot) + the MonthView grid. Clicking a day drills into the Day view. No
 *  Legend (the grid encodes 1D intensity, not the per-kind families) and no
 *  ViewportProvider/Minimap. */
function MonthViewContainer({
  view,
  onViewChange,
  monthIso,
  monthLabel,
  nextMonthDisabled,
  onPrevMonth,
  onNextMonth,
  payload,
  onDayClick,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  monthIso: string;
  monthLabel: string;
  nextMonthDisabled: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  payload: RangePayload | null;
  onDayClick: (iso: string) => void;
}) {
  return (
    <>
      <Toolbar
        view={view}
        onViewChange={onViewChange}
        dateLabel=""
        rightSlot={
          <MonthNav
            label={monthLabel}
            monthIso={monthIso}
            onPrev={onPrevMonth}
            onNext={onNextMonth}
            nextDisabled={nextMonthDisabled}
          />
        }
      />
      <MonthView monthIso={monthIso} payload={payload} onDayClick={onDayClick} />
    </>
  );
}

export default function GlobalDashboard({ onClose }: GlobalDashboardProps) {
  // Seed from the backend (single source of truth) + stay in sync via the broadcast,
  // so flipping the WP5 checkbox in the picker flips this view live — no remount, no
  // manual refresh. `cancelled` guards the async seed/listen under StrictMode.
  // (Mirror of ProjectPicker's tracking seed+listen effect.)
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  // Active view. Day = interactive timeline; Week = rollup grid; Month = contribution
  // calendar. (Custom: P3.)
  const [view, setView] = useState<DashboardView>("day");
  // The fetched payloads, one slot per shape (null = not-yet-loaded / loading).
  const [dayData, setDayData] = useState<RangePayload | null>(null);
  const [weekData, setWeekData] = useState<WeekPayload | null>(null);
  const [monthData, setMonthData] = useState<RangePayload | null>(null);
  // WP6c-1: the window-level aggregate metrics (Metrics tab). v1 window = today (day).
  const [metricsData, setMetricsData] = useState<MetricsPayload | null>(null);
  // WP6c-2: the A/B comparison (Compare tab). `comparePreset` drives the fetch (default
  // WoW); `custom` uses the two RangePicker spans. Custom A/B default to the two prior
  // weeks (a sensible non-empty default until the operator picks).
  const [compareData, setCompareData] = useState<ComparisonPayload | null>(null);
  const [comparePreset, setComparePreset] = useState<ComparePresetOrCustom>("wow");
  const [compareCustomA, setCompareCustomA] = useState<{ start: string; end: string }>(() => ({
    start: stepIso(todayDateIso(new Date()), -13),
    end: stepIso(todayDateIso(new Date()), -7),
  }));
  const [compareCustomB, setCompareCustomB] = useState<{ start: string; end: string }>(() => ({
    start: stepIso(todayDateIso(new Date()), -6),
    end: todayDateIso(new Date()),
  }));
  const [loading, setLoading] = useState(false);
  // WP6b-4 re-spec (D10): SINGLE-OPEN project accordion. Rows start ALL COLLAPSED
  // (`[]`); expanding one auto-collapses the others → at most ONE id here at a time.
  // Owned here; DayTimeline is presentational (reads membership). Re-seeded to `[]` on
  // each fetch (a fresh payload opens collapsed).
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  // Month nav: which month the calendar shows (default current month, local).
  const [monthIso, setMonthIso] = useState<string>(() =>
    todayMonthIso(new Date()),
  );
  // Week nav (WP6b-3): which week the rollup grid shows, as its Monday anchor
  // (`"YYYY-MM-DD"`, local). Default this week; stepped by the WeekNav prev/next arrows.
  // When it equals this week's Monday the query is effectively the fast default (the
  // backend snaps identically); a past Monday fetches that week's rollup.
  const [mondayIso, setMondayIso] = useState<string>(() =>
    mondayOfDate(new Date()),
  );
  // WP6b-4 re-spec — the flexible-timeline window model (PD1/PD3). The COORDINATE origin
  // is FIXED at today-29d (the 30-day-cap floor); it never moves, so a backward
  // auto-extend keeps every rendered lane's coordinate identical (no viewport shift).
  // Computed once on mount (a session doesn't cross local midnight often enough to matter;
  // a stale origin at worst shifts the 30-day floor by a day).
  const todayIso = useState<string>(() => todayDateIso(new Date()))[0];
  const originIso = useState<string>(() => stepIso(todayDateIso(new Date()), -29))[0];
  // The LOADED window (the fetched sub-span = the pan clamp bound). Opens as the LAST 14
  // DAYS (D7 — pre-load recent history so panning back is instant), framed on today (D6′).
  // Grows via auto-extend (older → prepend 7d down to the origin; newer → toward today).
  const [loadedStartIso, setLoadedStartIso] = useState<string>(() =>
    stepIso(todayDateIso(new Date()), -13),
  );
  const [loadedEndIso, setLoadedEndIso] = useState<string>(() => todayDateIso(new Date()));
  // The span to FRAME on the next intentional re-seed: `null` → open on today (D6′);
  // a jump-to (picker / Month drill-down) sets it so the camera lands on the picked span.
  const [frameTarget, setFrameTarget] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);
  // Bumped on every INTENTIONAL re-frame (jump-to / Day-tab reset / tracking flip) → the
  // ViewportProvider re-seeds. Auto-extend does NOT bump it (it widens the pan clamp but
  // preserves the viewport — the fixed origin makes the widen coordinate-stable).
  const [reFrameKey, setReFrameKey] = useState(0);
  // WP6b-2 Phase 4: the selected segment (`"<session_id>:<segIndex>"`) — drives the Day
  // view's SidePanel + the highlight ring. Null = no panel. Cleared on any view switch,
  // day change, and the panel's own close (a stale selection also self-clears because
  // `resolveSelectedSeg` returns null when the id no longer resolves in the payload).
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);

  // A live mirror of the active-view nav-state, read by the tracking-flip listener (which
  // is registered once on mount and would otherwise close over the mount-time view/nav —
  // a stale-closure refetch). Synced in an effect (never written during render) so a
  // tracking-ON flip refetches the CURRENTLY active view (day/week/month) with its
  // current shown day / month.
  const navRef = useRef({
    view,
    monthIso,
    loadedStartIso,
    loadedEndIso,
    mondayIso,
    comparePreset,
    compareCustomA,
    compareCustomB,
  });
  useEffect(() => {
    navRef.current = {
      view,
      monthIso,
      loadedStartIso,
      loadedEndIso,
      mondayIso,
      comparePreset,
      compareCustomA,
      compareCustomB,
    };
  }, [
    view,
    monthIso,
    loadedStartIso,
    loadedEndIso,
    mondayIso,
    comparePreset,
    compareCustomA,
    compareCustomB,
  ]);

  // Fetch the active view's global (all-projects) breakdown. Dispatches on `v` to the
  // matching QueryWindow and stores the result in its typed slot, branching on
  // `result.kind` (the backend returns `range` for day/custom, `week` for week). Nav
  // params (`monthIso` for month, `dayIso` for the Day view's shown day) are passed in so
  // this stays a stable `[]`-dep callback with no stale-closure reads. Called on open, on
  // view change, on nav (prev/next month, Day date pick/step/drill-down), and on the
  // tracking-ON flip.
  const fetchView = useCallback(
    (
      v: DashboardView,
      nav?: {
        monthIso?: string;
        loadedStartIso?: string;
        loadedEndIso?: string;
        mondayIso?: string;
        comparePreset?: ComparePresetOrCustom;
        compareCustomA?: { start: string; end: string };
        compareCustomB?: { start: string; end: string };
      },
    ) => {
      setLoading(true);
      let window: import("../../../state/timeAnalytics").QueryWindow;
      if (v === "week") {
        // Send the shown week's Monday anchor (WP6b-3). This-week's Monday is the fast
        // default (the backend snaps it identically to a bare `{kind:"week"}`).
        window = {
          kind: "week",
          monday: nav?.mondayIso ?? mondayOfDate(new Date()),
        };
      } else if (v === "month") {
        const bounds = monthRangeMs(nav?.monthIso ?? todayMonthIso(new Date()));
        // Malformed month should never happen (nav derives from valid isos); fall back
        // to today's day rather than throwing.
        window = bounds
          ? { kind: "custom", start_ms: bounds.start_ms, end_ms: bounds.end_ms }
          : { kind: "day" };
      } else if (v === "metrics") {
        // WP6c-1 v1: the aggregate metrics over TODAY (a `{kind:"metrics"}` wrapping the
        // day window). A window selector (day/week/custom parity with the timeline views)
        // is a deliberate WP6c follow-up; v1 answers "today's aggregate".
        window = { kind: "metrics", window: { kind: "day" } };
      } else if (v === "compare") {
        // WP6c-2: the A/B comparison. A named preset resolves its bounds backend-side (from
        // today, local); Custom sends the two RangePicker spans as explicit epoch-ms. The
        // preset/custom params come through `nav` (avoids a stale-closure read of state).
        const p = nav?.comparePreset ?? "wow";
        let spec: CompareSpec;
        if (p === "custom") {
          const ca = nav?.compareCustomA ?? { start: todayDateIso(new Date()), end: todayDateIso(new Date()) };
          const cb = nav?.compareCustomB ?? { start: todayDateIso(new Date()), end: todayDateIso(new Date()) };
          const aMs = rangeToMs(ca.start, ca.end);
          const bMs = rangeToMs(cb.start, cb.end);
          // Malformed custom span (should not happen — RangePicker gates) → fall back to WoW.
          spec =
            aMs && bMs
              ? {
                  custom: {
                    a: { start_ms: aMs.start_ms, end_ms: aMs.end_ms },
                    b: { start_ms: bMs.start_ms, end_ms: bMs.end_ms },
                  },
                }
              : { preset: "wow" };
        } else {
          spec = { preset: p };
        }
        window = { kind: "compare", spec };
      } else {
        // Day (WP6b-4 re-spec): the flexible timeline fetches the LOADED WINDOW (a span,
        // default the last 14 days, grown by auto-extend). Always a `{kind:"custom"}`
        // range EXCEPT the degenerate loaded===today-only case, which uses the `{kind:
        // "day"}` fast path (e.g. right after a Month drill-down to today).
        const s = nav?.loadedStartIso ?? stepIso(todayDateIso(new Date()), -13);
        const e = nav?.loadedEndIso ?? todayDateIso(new Date());
        const isTodayOnly = s === e && s === todayDateIso(new Date());
        if (isTodayOnly) {
          window = { kind: "day" };
        } else {
          const bounds = rangeToMs(s, e);
          window = bounds
            ? { kind: "custom", start_ms: bounds.start_ms, end_ms: bounds.end_ms }
            : { kind: "day" };
        }
      }
      void queryTimeAnalytics(window, "global")
        .then((result) => {
          if (result.kind === "week") {
            setWeekData(result);
          } else if (result.kind === "metrics") {
            setMetricsData(result);
          } else if (result.kind === "compare") {
            setCompareData(result);
          } else if (result.kind === "range") {
            if (v === "month") {
              setMonthData(result);
            } else {
              setDayData(result);
              setExpandedProjects([]); // D10: open ALL COLLAPSED (single-open accordion)
            }
          }
        })
        .catch((e) => {
          console.error(`[claudesk] time_analytics_query (${v}) failed:`, e);
          if (v === "week") setWeekData(null);
          else if (v === "month") setMonthData(null);
          else if (v === "metrics") setMetricsData(null);
          else if (v === "compare") setCompareData(null);
          else setDayData(null);
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  // D10: single-open accordion. Expanding a project auto-collapses every other row →
  // `[id]`; clicking the already-open one collapses it → `[]`. At most one expanded.
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => (prev.includes(projectId) ? [] : [projectId]));
  }, []);

  // Switch view via the tab strip + fetch its payload (if tracking is on). Refetch every
  // switch so the active view is always fresh. Selecting the Day TAB resets the flexible
  // timeline to its open state: the loaded window → the last 14 days, framed on today (the
  // reset-to-current-period convention).
  const changeView = useCallback(
    (v: DashboardView) => {
      setView(v);
      setSelectedSegId(null); // clear any open SidePanel selection on a view switch
      const today = todayDateIso(new Date());
      const thisMonday = mondayOfDate(new Date());
      // Day tab → reset the loaded window to the last 14 days + re-frame on today (D6′);
      // Week tab → this week; Month keeps its shown month.
      let dayNav: { loadedStartIso: string; loadedEndIso: string } | undefined;
      if (v === "day") {
        const ls = stepIso(today, -13);
        setLoadedStartIso(ls);
        setLoadedEndIso(today);
        setFrameTarget(null); // frame today on the re-seed
        setReFrameKey((k) => k + 1); // intentional re-frame
        dayNav = { loadedStartIso: ls, loadedEndIso: today };
      }
      if (v === "week") setMondayIso(thisMonday);
      const nav =
        v === "month"
          ? { monthIso }
          : v === "day"
            ? dayNav
            : v === "week"
              ? { mondayIso: thisMonday }
              : v === "compare"
                ? { comparePreset, compareCustomA, compareCustomB }
                : undefined;
      if (trackingEnabled) fetchView(v, nav);
    },
    [trackingEnabled, fetchView, monthIso, comparePreset, compareCustomA, compareCustomB],
  );

  // WP6c-2: Compare preset switch → set the preset + refetch. Custom keeps the current
  // spans (the RangePickers already show them); a preset selection fetches immediately.
  const changeComparePreset = useCallback(
    (p: ComparePresetOrCustom) => {
      setComparePreset(p);
      if (trackingEnabled)
        fetchView("compare", { comparePreset: p, compareCustomA, compareCustomB });
    },
    [trackingEnabled, fetchView, compareCustomA, compareCustomB],
  );

  // WP6c-2: Custom A/B range change → update the side's span + refetch (only meaningful when
  // the Custom preset is active, which is the only time the RangePickers render).
  const changeCompareRange = useCallback(
    (side: "a" | "b", start: string, end: string) => {
      const nextA = side === "a" ? { start, end } : compareCustomA;
      const nextB = side === "b" ? { start, end } : compareCustomB;
      if (side === "a") setCompareCustomA(nextA);
      else setCompareCustomB(nextB);
      if (trackingEnabled)
        fetchView("compare", {
          comparePreset: "custom",
          compareCustomA: nextA,
          compareCustomB: nextB,
        });
    },
    [trackingEnabled, fetchView, compareCustomA, compareCustomB],
  );

  // JUMP-TO (D8): the RangePicker's typed span + the Month drill-down land here. Move the
  // camera to `[start,end]`, EXTENDING the loaded window if the span falls outside it (the
  // unified model — typed-jump, pan, zoom all drive one continuous window). Always a Day-view
  // action; bumps `reFrameKey` (intentional re-frame → the ViewportProvider seeds to the
  // jumped span). `start`/`end` are already valid (RangePicker gates via validateRange; the
  // Month drill-down passes a real in-range day).
  const changeRange = useCallback(
    (start: string, end: string) => {
      setSelectedSegId(null); // a new span's segments — clear any stale SidePanel selection
      if (view !== "day") setView("day");
      // Grow the loaded window to cover the jumped span (never past today / before origin).
      const newStart = start < loadedStartIso ? start : loadedStartIso;
      const newEnd = end > loadedEndIso ? end : loadedEndIso;
      const clampedStart = newStart < originIso ? originIso : newStart;
      const clampedEnd = newEnd > todayIso ? todayIso : newEnd;
      setLoadedStartIso(clampedStart);
      setLoadedEndIso(clampedEnd);
      setFrameTarget({ startIso: start, endIso: end }); // frame the jumped span on re-seed
      setReFrameKey((k) => k + 1); // intentional re-frame
      if (trackingEnabled)
        fetchView("day", {
          loadedStartIso: clampedStart,
          loadedEndIso: clampedEnd,
        });
    },
    [view, trackingEnabled, fetchView, loadedStartIso, loadedEndIso, originIso, todayIso],
  );

  // AUTO-EXTEND (D7): the edge-watcher fires this when the camera nears a loaded edge.
  // "older" → prepend 7 days (down to the origin floor); "newer" → extend toward today.
  // Does NOT bump `reFrameKey` (the fixed origin keeps existing lanes coordinate-stable, so
  // the viewport is preserved across the widen — no jump). Re-fetches the widened window.
  const extendLoaded = useCallback(
    (dir: "older" | "newer") => {
      if (dir === "older") {
        const proposed = stepIso(loadedStartIso, -7);
        const clamped = proposed < originIso ? originIso : proposed;
        if (clamped === loadedStartIso) return; // already at the origin floor
        setLoadedStartIso(clamped);
        if (trackingEnabled)
          fetchView("day", { loadedStartIso: clamped, loadedEndIso });
      } else {
        const proposed = stepIso(loadedEndIso, 7);
        const clamped = proposed > todayIso ? todayIso : proposed;
        if (clamped === loadedEndIso) return; // already at today
        setLoadedEndIso(clamped);
        if (trackingEnabled)
          fetchView("day", { loadedStartIso, loadedEndIso: clamped });
      }
    },
    [loadedStartIso, loadedEndIso, originIso, todayIso, trackingEnabled, fetchView],
  );

  // Month prev/next nav: step the shown month, then refetch it. Never step past the
  // current month (matches the source's `nextDisabled`).
  const changeMonth = useCallback(
    (dir: "prev" | "next") => {
      const next = dir === "prev" ? prevMonthIso(monthIso) : nextMonthIso(monthIso);
      if (!next) return;
      if (dir === "next" && next > todayMonthIso(new Date())) return; // no future months
      setMonthIso(next);
      if (trackingEnabled) fetchView("month", { monthIso: next });
    },
    [monthIso, trackingEnabled, fetchView],
  );

  // Week prev/next nav (WP6b-3): step the shown week's Monday anchor ±7d, then refetch.
  // Never step into a future week (mirrors `changeMonth`'s no-future rule via
  // `isFutureMonday`). The next-arrow is also disabled in the UI at the current week.
  const changeWeek = useCallback(
    (dir: "prev" | "next") => {
      const next =
        dir === "prev" ? prevMondayIso(mondayIso) : nextMondayIso(mondayIso);
      if (dir === "next" && isFutureMonday(next, new Date())) return; // no future weeks
      setMondayIso(next);
      if (trackingEnabled) fetchView("week", { mondayIso: next });
    },
    [mondayIso, trackingEnabled, fetchView],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getTimeTrackingEnabled()
      .then((enabled) => {
        if (!cancelled) {
          setTrackingEnabled(enabled);
          // ON at open → fetch the currently active view (via the live nav mirror).
          if (enabled) {
            const n = navRef.current;
            fetchView(n.view, {
              monthIso: n.monthIso,
              loadedStartIso: n.loadedStartIso,
              loadedEndIso: n.loadedEndIso,
              mondayIso: n.mondayIso,
              comparePreset: n.comparePreset,
              compareCustomA: n.compareCustomA,
              compareCustomB: n.compareCustomB,
            });
          }
        }
      })
      .catch((e) =>
        console.error(
          "[claudesk] time_get_tracking_enabled (dashboard) failed:",
          e,
        ),
      );
    void listen<boolean>(TIME_TRACKING_ENABLED_EVENT, (event) => {
      setTrackingEnabled(event.payload);
      // Flipped ON → fetch the CURRENTLY active view (navRef avoids the stale closure);
      // OFF → the gate hides the body.
      if (event.payload) {
        const n = navRef.current;
        fetchView(n.view, {
          monthIso: n.monthIso,
          loadedStartIso: n.loadedStartIso,
          loadedEndIso: n.loadedEndIso,
          mondayIso: n.mondayIso,
          comparePreset: n.comparePreset,
          compareCustomA: n.compareCustomA,
          compareCustomB: n.compareCustomB,
        });
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // Seed/listen once on mount. The active view + nav-state are read through `navRef`
    // (a ref, not a dep) so this effect never re-registers the listener on a view switch;
    // view changes fetch directly through `changeView`.
  }, [fetchView]);

  // `dashboardMode` folds tracking-vs-data into off/empty/data; `loading` layers on top.
  //
  // ALL THREE data views (Day/Week/Month) carry a period-nav control (RangePicker /
  // WeekNav / MonthNav) that IS part of the surface — an empty period is still a valid
  // render, because the nav is how you step BACK to a period with data. If an empty period
  // folded to the full-screen `mode==="empty"` block (no toolbar/nav), the operator would
  // be TRAPPED with no forward affordance (the empty-period nav trap, SURFACE-2026-07-14-
  // M9-EMPTY-PERIOD-NAV-TRAP — Week+Day regressed here; Month was already exempt). So
  // `hasData` is `trackingEnabled` for every nav-bearing view: once tracking is ON the
  // view always renders its nav shell, and each view shows an INLINE "no activity" body
  // (not the full-screen empty-state) when its own payload has no rows. The full-screen
  // `mode==="empty"` path is now only reachable transiently before the first fetch settles.
  const activeData =
    view === "week" ? weekData : view === "month" ? monthData : dayData;
  const hasData = trackingEnabled;
  // Per-view "the shown period has no rows" — drives the inline empty body inside each view
  // (the toolbar + nav still render around it). A null payload (fetch not yet settled) also
  // counts as empty for this flag; the `&& xData` guards on the render branches keep the
  // grid components from receiving null.
  // Metrics has no `projects` array (it's window-global) — its emptiness is "no engaged
  // sessions AND no human/AI activity"; MetricsView renders its own inline zero-state, so
  // this flag only gates the shell, like the other nav-bearing views.
  const metricsEmpty =
    !metricsData ||
    (metricsData.engaged_session.session_count === 0 &&
      metricsData.ai_agent.effort_ms === 0 &&
      metricsData.human.wallclock_ms === 0);
  const activeEmpty =
    view === "metrics"
      ? metricsEmpty
      : view === "compare"
        ? // CompareView handles its own null/empty rendering (it takes `comparison`), so the
          // shell's emptiness flag is irrelevant here — never trips the full-screen path.
          false
        : !activeData || activeData.projects.length === 0;
  const mode = dashboardMode(trackingEnabled, hasData);
  const monthLabel = monthIsoToLabel(monthIso);
  const nextMonthDisabled =
    (nextMonthIso(monthIso) ?? "") > todayMonthIso(new Date());
  // Week "next" is disabled when the shown week is the current week (stepping forward
  // would enter a future week) — mirrors the Month no-future rule.
  const nextWeekDisabled = isFutureMonday(nextMondayIso(mondayIso), new Date());

  return (
    <div
      className="global-dashboard"
      data-testid="global-dashboard"
      role="region"
      aria-label="Time analytics"
    >
      <header className="global-dashboard-header">
        <span className="global-dashboard-title">Time Analytics</span>
        <span className="global-dashboard-scope">All projects</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="global-dashboard-close"
          data-testid="global-dashboard-close"
          aria-label="Close analytics"
          title="Close analytics (Esc)"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="global-dashboard-body">
        {mode === "off" ? (
          <div
            className="dashboard-empty"
            data-testid="dashboard-empty-tracking-off"
          >
            <p className="dashboard-empty-title">Time tracking is off</p>
            <p className="dashboard-empty-hint">
              Enable tracking to see analytics. Turn on{" "}
              <strong>Time tracking</strong> in the project picker, then your
              per-project activity will appear here.
            </p>
          </div>
        ) : mode === "data" && view === "week" && weekData ? (
          // Week rollup grid — no ViewportProvider/Minimap (Day-only). WP6b-3: the WeekNav
          // prev/next steps the shown week; Week stays the day-count-agnostic rollup grid.
          <WeekView
            view={view}
            onViewChange={changeView}
            data={weekData}
            isEmpty={activeEmpty}
            mondayIso={mondayIso}
            onPrevWeek={() => changeWeek("prev")}
            onNextWeek={() => changeWeek("next")}
            nextWeekDisabled={nextWeekDisabled}
          />
        ) : mode === "data" && view === "month" ? (
          // Month contribution calendar. Renders whenever tracking is ON (an empty month
          // is a valid grid — the nav steps to a month with data), so it's gated on
          // `view === "month"` (mode "data" for month == tracking on), not on row count.
          <MonthViewContainer
            view={view}
            onViewChange={changeView}
            monthIso={monthIso}
            monthLabel={monthLabel}
            nextMonthDisabled={nextMonthDisabled}
            onPrevMonth={() => changeMonth("prev")}
            onNextMonth={() => changeMonth("next")}
            payload={monthData}
            onDayClick={(iso) => changeRange(iso, iso)}
          />
        ) : mode === "data" && view === "metrics" ? (
          // WP6c-1: window-level aggregate metrics (HeadlineCard + MetricsPanel). Renders
          // whenever tracking is ON (an empty window shows MetricsView's inline zero-state,
          // keeping the tab strip — same nav-bearing convention as Day/Week/Month), so it's
          // gated on `view === "metrics"`, not on a row count.
          <MetricsView
            view={view}
            onViewChange={changeView}
            data={metricsData}
            isEmpty={metricsEmpty}
          />
        ) : mode === "data" && view === "compare" ? (
          // WP6c-2: A/B comparison (PresetSelector + CompareView). Renders whenever
          // tracking is ON (CompareView shows its own inline empty/absent states, keeping
          // the tab strip + preset selector — same nav-bearing convention as the others),
          // so it's gated on `view === "compare"`, not on a row count.
          <CompareViewContainer
            view={view}
            onViewChange={changeView}
            comparison={compareData}
            preset={comparePreset}
            customA={compareCustomA}
            customB={compareCustomB}
            onPresetChange={changeComparePreset}
            onCustomRangeChange={changeCompareRange}
          />
        ) : mode === "data" && view === "day" && dayData ? (
          // WP6b-4 re-spec — the flexible timeline. One continuous camera over a FIXED
          // 30-day coordinate space (origin = today-29d, PD1/PD3): NO mode, NO picker-gate.
          // `DayViewHost` wires the ViewportProvider (seeded on today, D6′) + DayWindowProvider
          // (windowStartIso = originIso so lanes are origin-stable) + the AutoExtendWatcher
          // (D7 — grows the loaded window as the camera nears an edge, no viewport shift).
          // The RangePicker is a REACTIVE readout of the framed span + a jump-to (D8), not a
          // gate. Pan/zoom out from today fluidly reveals prior days — the D1-rejected behavior
          // this rework delivers.
          <DayViewHost
            dayData={dayData}
            originIso={originIso}
            loadedStartIso={loadedStartIso}
            loadedEndIso={loadedEndIso}
            todayIso={todayIso}
            frameTarget={frameTarget}
            reFrameKey={String(reFrameKey)}
            onExtend={extendLoaded}
            view={view}
            onViewChange={changeView}
            isEmpty={activeEmpty}
            onRangeChange={changeRange}
            expandedProjects={expandedProjects}
            onToggleProject={toggleProject}
            selectedSegId={selectedSegId}
            onSelectSeg={setSelectedSegId}
            onCloseSidePanel={() => setSelectedSegId(null)}
          />
        ) : loading ? (
          <div className="dashboard-empty" data-testid="dashboard-empty-loading">
            <p className="dashboard-empty-hint">Loading activity…</p>
          </div>
        ) : (
          // Fallback: tracking ON + fetch settled but the active view's payload is null
          // (a fetch ERROR — the `.catch` nulls the slot). The empty-BUT-present case no
          // longer lands here: an empty period now renders its view with the inline
          // "no activity <period>" body (keeping the nav — SURFACE-2026-07-14-M9-EMPTY-
          // PERIOD-NAV-TRAP). So this is the query-failed safety net, not the normal
          // empty-data path.
          <div className="dashboard-empty" data-testid="dashboard-empty-nodata">
            <p className="dashboard-empty-title">No activity recorded</p>
            <p className="dashboard-empty-hint">
              Once you work in a tracked project, your per-project breakdown
              will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
