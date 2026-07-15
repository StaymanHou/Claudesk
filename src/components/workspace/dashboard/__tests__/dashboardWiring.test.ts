import { describe, expect, it } from "vitest";
// M9 WP6a — source-text WIRING tests (the repo's `?raw` posture: pure logic → vitest,
// live render/IPC → the MCP bridge; there is NO React-render test infra by design —
// no @testing-library, no jsdom). These pin the load-bearing wiring the MCP-bridge
// verify-self confirmed live, so a future edit that unwires the GLOBAL dashboard
// (or accidentally re-adds it as a per-workspace panel — the surface the operator
// CORRECTED, SURFACE-2026-07-08-M9-WP6A-DASHBOARD-IS-GLOBAL) fails a cheap unit gate
// instead of only surfacing on the next live drive. Mirrors pipEntryWiring.test.ts.
import appTsx from "../../../../App.tsx?raw";
import filmstrip from "../../Filmstrip.tsx?raw";
import globalDashboard from "../GlobalDashboard.tsx?raw";
import chrome from "../Chrome.tsx?raw";
import monthView from "../MonthView.tsx?raw";
import rangePicker from "../RangePicker.tsx?raw";
import dayTimeline from "../DayTimeline.tsx?raw";
import minimap from "../Minimap.tsx?raw";
import sidePanel from "../SidePanel.tsx?raw";
import rightPanelHost from "../../RightPanelHost.tsx?raw";
import projectPicker from "../../../picker/ProjectPicker.tsx?raw";

describe("M9 WP6a — the dashboard is a GLOBAL top-level view, wired in App.tsx", () => {
  it("App.tsx lazy-imports GlobalDashboard (chunk-split, not in the main bundle)", () => {
    expect(appTsx).toContain("lazy(");
    expect(appTsx).toContain("dashboard/GlobalDashboard");
  });

  it("App.tsx toggles a single showDashboard state via the ⌘⇧A app-level chord", () => {
    expect(appTsx).toContain("isDashboardChord");
    expect(appTsx).toContain("setShowDashboard");
    // capture-phase document listener — the app-level chord pattern (like ⌘⇧N).
    expect(appTsx).toMatch(/addEventListener\("keydown", onKeyDown, true\)/);
  });

  it("App.tsx renders <GlobalDashboard> behind Suspense as the overlay (with onClose)", () => {
    expect(appTsx).toContain("showDashboard &&");
    expect(appTsx).toContain("<GlobalDashboard");
    expect(appTsx).toContain("onClose={() => setShowDashboard(false)}");
    expect(appTsx).toContain("Suspense");
  });
});

describe("M9 WP6a — the Filmstrip carries the analytics open-control", () => {
  it("Filmstrip has an onOpenDashboard prop and the analytics button wired to it", () => {
    expect(filmstrip).toContain("onOpenDashboard");
    expect(filmstrip).toContain('data-testid="filmstrip-open-dashboard"');
    expect(filmstrip).toContain("onClick={onOpenDashboard}");
  });

  it("App.tsx threads onOpenDashboard into the Filmstrip (opens the global view)", () => {
    expect(appTsx).toContain("onOpenDashboard={() => setShowDashboard(true)}");
  });
});

describe("M9 WP6a — the GLOBAL dashboard is reachable from the picker scene, not only workspace-open", () => {
  // SURFACE-2026-07-08-M9-WP6A-DASHBOARD-FROM-PICKER: a global (all-projects) surface must
  // be openable at launch from the picker, not gated behind opening a workspace first.
  it("ProjectPicker accepts onOpenDashboard and wires a picker analytics button to it", () => {
    expect(projectPicker).toContain("onOpenDashboard");
    expect(projectPicker).toContain('data-testid="picker-open-dashboard"');
    expect(projectPicker).toContain("onClick={onOpenDashboard}");
  });

  it("App.tsx threads onOpenDashboard into the picker branch too", () => {
    // The picker branch (view === "picker") must pass the same opener the Filmstrip gets.
    expect(appTsx).toContain("<ProjectPicker");
    // both the picker branch and the Filmstrip use this exact opener string.
    expect(
      (appTsx.match(/onOpenDashboard=\{\(\) => setShowDashboard\(true\)\}/g) ?? [])
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("the ⌘⇧A chord effect is NOT gated on view === 'workspace-open' (fires in both scenes)", () => {
    // Regression guard: the dashboard chord listener must not early-return on the picker
    // view. We assert the chord handler body does not sit behind a workspace-open gate by
    // checking the dashboard comment marks it app-level/both-scenes and the isDashboardChord
    // effect has no view dependency. (Heuristic source-text check, matching the ?raw posture.)
    const chordIdx = appTsx.indexOf("isDashboardChord(e)");
    expect(chordIdx).toBeGreaterThan(-1);
    // The 400 chars preceding the chord check should NOT contain the workspace-open early
    // return that the ⌘⇧N / ⌘⇧+digit effects use.
    const preceding = appTsx.slice(Math.max(0, chordIdx - 400), chordIdx);
    expect(preceding).not.toContain('if (view !== "workspace-open") return;');
  });

  it("the GlobalDashboard overlay is rendered at the app-shell top level (outside the workspace-open branch)", () => {
    // It overlays whichever scene is up. The overlay must come AFTER the view ternary's
    // else-branch closes (`</>` + `)}`) — i.e. a sibling of the ternary, not nested inside
    // the workspace-open fragment (which would re-gate it on a workspace being open).
    const overlayIdx = appTsx.indexOf("{showDashboard && (");
    const elseBranchCloseIdx = appTsx.indexOf("</>\n      )}");
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(elseBranchCloseIdx).toBeGreaterThan(-1);
    expect(overlayIdx).toBeGreaterThan(elseBranchCloseIdx);
  });
});

describe("M9 WP6a — GlobalDashboard is the global view host (title + close + empty-state)", () => {
  it("exports a default component with the region testid and a close affordance", () => {
    expect(globalDashboard).toContain("export default function GlobalDashboard");
    expect(globalDashboard).toContain('data-testid="global-dashboard"');
    expect(globalDashboard).toContain('data-testid="global-dashboard-close"');
    expect(globalDashboard).toContain("onClose");
  });

  it("gates on the WP5 tracking toggle + renders the tracking-OFF empty-state", () => {
    expect(globalDashboard).toContain("getTimeTrackingEnabled");
    expect(globalDashboard).toContain("TIME_TRACKING_ENABLED_EVENT");
    expect(globalDashboard).toContain('data-testid="dashboard-empty-tracking-off"');
    expect(globalDashboard).toContain("dashboardMode");
  });
});

describe("M9 WP6a — the dashboard is NOT a per-workspace panel (the corrected surface)", () => {
  it("RightPanelHost has NO dashboard tab/slot (it is a global overlay, not a panel)", () => {
    // The operator correction: a global-data view must not live in a per-instance
    // container. Guards against re-introducing the reverted per-workspace wiring.
    expect(rightPanelHost).not.toContain('data-testid="panel-tab-dashboard"');
    expect(rightPanelHost).not.toContain("panel-dashboard-");
    expect(rightPanelHost).not.toContain("DashboardPanel");
  });
});

describe("M9 WP6a Phase 2 / WP6b-2 P1 — GlobalDashboard fetches the active-view payload", () => {
  it("queries the GLOBAL scope via the WP4 command (view-driven window)", () => {
    // The all-projects scope is the whole point (the corrected surface). A regression
    // to per-project scope should fail here. WP6b-2 made the WINDOW view-driven
    // (day/week), so the literal is `queryTimeAnalytics(window, "global")` — but the
    // scope must stay "global" and the day + week windows must both be constructed.
    // WP6b-3 gave the week window a `monday` anchor (`{ kind: "week", monday: … }`) so
    // Week-nav can step to a past week — assert that shape (the `kind:"week"` + `monday`
    // fields), not the old bare `{ kind: "week" }` literal.
    expect(globalDashboard).toContain('queryTimeAnalytics(window, "global")');
    expect(globalDashboard).toContain('kind: "week"');
    expect(globalDashboard).toMatch(/kind:\s*"week",\s*\n?\s*monday:/);
    expect(globalDashboard).toContain('{ kind: "day" }');
  });

  it("branches on the result kind + feeds range→DayTimeline, week→WeekTimeline", () => {
    expect(globalDashboard).toContain('result.kind === "range"');
    expect(globalDashboard).toContain('result.kind === "week"');
    expect(globalDashboard).toContain("<DayTimeline");
    expect(globalDashboard).toContain("<WeekTimeline");
    expect(globalDashboard).toContain("expandedProjects");
    expect(globalDashboard).toContain("onToggleProject");
  });

  it("renders the distinct tracking-ON-but-no-rows empty-state (not the OFF one)", () => {
    expect(globalDashboard).toContain('data-testid="dashboard-empty-nodata"');
    // still keeps the OFF empty-state + the tracking gate from Phase 1
    expect(globalDashboard).toContain('data-testid="dashboard-empty-tracking-off"');
  });

  it("WP6b-3: exposes the WeekNav prev/next control on the Week view", () => {
    // The Week view's period-nav (sibling of MonthNav). A regression that drops the
    // WeekNav wiring should fail here.
    expect(globalDashboard).toContain("<WeekNav");
    expect(globalDashboard).toContain("changeWeek");
    expect(globalDashboard).toContain("nextWeekDisabled");
    // Chrome.tsx exports WeekNav with the data-attr the live drive asserts on.
    expect(chrome).toContain('data-week-nav="prev"');
    expect(chrome).toContain('data-week-nav="next"');
  });

  it("WP6c-2: Chrome enables the Metrics AND Compare tabs (all 5 views enabled)", () => {
    // The tab must be ENABLED (`enabled: true`) or the tab strip greys it out. As of
    // WP6c-2 the Compare tab is enabled too (its producer + CompareView shipped). A
    // regression that flips either back to `false` should fail here.
    expect(chrome).toMatch(/value:\s*"metrics",\s*label:\s*"Metrics",\s*enabled:\s*true/);
    expect(chrome).toMatch(/value:\s*"compare",\s*label:\s*"Compare",\s*enabled:\s*true/);
    // The DashboardView union carries the metrics + compare members.
    expect(chrome).toContain('"metrics"');
    expect(chrome).toContain('"compare"');
  });

  it("WP6c-1: GlobalDashboard wires the metrics window/branch/view", () => {
    // The Metrics tab fetches the `{kind:"metrics"}` query, branches on
    // `result.kind === "metrics"`, and renders <MetricsView>. A regression dropping any
    // of these silently loses the tab's data path.
    expect(globalDashboard).toContain('kind: "metrics"');
    expect(globalDashboard).toContain('result.kind === "metrics"');
    expect(globalDashboard).toContain("<MetricsView");
    expect(globalDashboard).toContain("metricsData");
  });

  it("WP6b-3 (F12): empty-period nav trap fixed — nav-bearing views always render their nav + an INLINE empty body", () => {
    // The empty-period nav-trap fix (SURFACE-2026-07-14-M9-EMPTY-PERIOD-NAV-TRAP): a
    // regression that reverts `hasData` to the per-view row-count would drop the nav on an
    // empty Week/Day (the trap). Guard the fix's three markers:
    //   1. `hasData = trackingEnabled` — nav-bearing views always render their shell.
    //   2. an `activeEmpty` per-view flag threaded into the views as `isEmpty`.
    //   3. the InlinePeriodEmpty body (data-testid dashboard-empty-period) rendered INSIDE
    //      the views (NOT the full-screen dashboard-empty-nodata, which is now the
    //      fetch-error fallback only).
    expect(globalDashboard).toContain("const hasData = trackingEnabled");
    expect(globalDashboard).toContain("activeEmpty");
    expect(globalDashboard).toContain("isEmpty={activeEmpty}");
    expect(globalDashboard).toContain("InlinePeriodEmpty");
    expect(globalDashboard).toContain('data-testid="dashboard-empty-period"');
  });
});

describe("M9 WP6b-2 P2 — Month view: custom-range fetch, drill-down, nav (the live-verified wiring)", () => {
  // These pin the Month wiring the MCP-bridge verify-self confirmed live (Month tab →
  // custom month-range query → contribution grid → day-click drills to Day → prev/next
  // nav). Integration boundary: GlobalDashboard (the ⌘⇧A dashboard) + Chrome (Toolbar).
  it("Month is a custom month-range query (not a `month` window kind), built from monthRangeMs", () => {
    // There is NO {kind:"month"} — Month is a {kind:"custom"} over the month's local-
    // midnight bounds. A regression to a fictional month-window should fail here.
    expect(globalDashboard).toContain("monthRangeMs");
    expect(globalDashboard).toContain('{ kind: "custom", start_ms:');
    expect(globalDashboard).not.toContain('{ kind: "month" }');
  });

  it("renders MonthViewContainer for view==='month' and feeds it the month payload + nav", () => {
    expect(globalDashboard).toContain('view === "month"');
    expect(globalDashboard).toContain("<MonthViewContainer");
    expect(globalDashboard).toContain("monthData");
    expect(globalDashboard).toContain("onPrevMonth={() => changeMonth(");
    expect(globalDashboard).toContain("onNextMonth={() => changeMonth(");
    // Month day-click → changeRange(iso, iso) — a SINGLE-day range drill-down (WP6b-4:
    // changeDay was generalized to changeRange; a drill is start===end).
    expect(globalDashboard).toContain("onDayClick={(iso) => changeRange(iso, iso)}");
  });

  it("day-click drills into the Day view for that date via changeRange (a 1-day range)", () => {
    // changeRange sets rangeStart/rangeEnd + switches to Day + fetches (single day today →
    // {kind:"day"}, else via rangeToMs → {kind:"custom"}; a genuine multi-day span → the
    // Phase-2 multi-day timeline). WP6b-4 generalized the WP6b-2 changeDay into changeRange.
    expect(globalDashboard).toContain("const changeRange");
    expect(globalDashboard).toContain("rangeToMs");
    expect(globalDashboard).toContain('setView("day")');
  });

  it("the tracking-flip listener reads navRef (avoids the stale-closure mount-time view)", () => {
    // A regression that closes over `view` directly (instead of navRef.current) would
    // refetch the mount-time view after a tracking flip — the stale-closure bug this fixes.
    expect(globalDashboard).toContain("navRef");
    expect(globalDashboard).toContain("navRef.current");
  });

  it("MonthView renders the grid via the pure monthMath helpers + the data-month-day cells", () => {
    expect(monthView).toContain("dayTotalsFromRange");
    expect(monthView).toContain("intensityColor");
    expect(monthView).toContain('data-testid="dashboard-month"');
    expect(monthView).toContain("data-month-day={iso}");
    expect(monthView).toContain("onClick={() => onDayClick(iso)}");
  });
});

describe("M9 WP6b-2 P3 — Custom→Day MERGE: Day gains a date picker, the Custom tab is gone", () => {
  // The operator-chosen redesign (design-prior new-surface-must-earn-its-place): a 1-day
  // Custom tab was a strict subset of Day, so it was removed and Day gained a date picker
  // (DayDatePicker). These pin the merge so a regression that re-adds a Custom branch or
  // drops the Day date control fails the unit gate. Integration boundary: GlobalDashboard.
  it("GlobalDashboard has NO Custom render branch / Custom state (fully removed)", () => {
    expect(globalDashboard).not.toContain('view === "custom"');
    expect(globalDashboard).not.toContain("CustomToolbar");
    expect(globalDashboard).not.toContain("CustomMultiDayPending");
    expect(globalDashboard).not.toContain("customData");
    expect(globalDashboard).not.toContain("dashboard-custom-multiday-pending");
  });

  it("the Day view carries the RangePicker as a REACTIVE readout of the framed span + jump-to (WP6b-4 re-spec D8)", () => {
    // WP6b-4 re-spec: the picker is no longer a mode gate driven by committed rangeStart/
    // rangeEnd — it's a REACTIVE readout of what the camera currently frames (`framed`,
    // from the pure `framedRange(viewport, originIso, todayIso)`), and its onChange is a
    // jump-to (`onRangeChange` → the parent extends the fetch if outside the loaded window).
    expect(globalDashboard).toContain("import {");
    expect(globalDashboard).toContain("<RangePicker");
    expect(globalDashboard).toContain("framedRange");
    expect(globalDashboard).toContain("startIso={framed.startIso}");
    expect(globalDashboard).toContain("endIso={framed.endIso}");
    expect(globalDashboard).toContain("onChange={onRangeChange}");
    // The old committed-range wiring is gone (regression guard: no rangeStart/rangeEnd state,
    // no DayDatePicker re-add).
    expect(globalDashboard).not.toContain("<DayDatePicker");
    expect(globalDashboard).not.toContain("startIso={rangeStart}");
  });

  it("RangePicker exposes start+end date inputs + single-day prev/next nav, guarded at today", () => {
    expect(rangePicker).toContain('data-testid="dashboard-range-picker"');
    expect(rangePicker).toContain("data-range-start");
    expect(rangePicker).toContain("data-range-end");
    expect(rangePicker).toContain('data-day-nav="prev"');
    expect(rangePicker).toContain('data-day-nav="next"');
    // Validation gates the commit + drives the inline error state (30-day cap = D9).
    expect(rangePicker).toContain("validateRange");
    expect(rangePicker).toContain("MAX_RANGE_DAYS");
    // next disabled once the shown day is today (no future day); single-day arrows only.
    expect(rangePicker).toContain("atToday");
    expect(rangePicker).toContain("localTodayIso");
  });

  it("MAX_RANGE_DAYS is 30 (WP6b-4 re-spec D9 — matches the 30-day zoom-out cap)", () => {
    expect(rangePicker).toContain("export const MAX_RANGE_DAYS = 30");
  });

  it("GlobalDashboard wires the fixed-origin flexible timeline (WP6b-4 re-spec: no mode/gate)", () => {
    // The interaction-model rework: a fixed 30-day coordinate origin (today-29d), a loaded
    // window that pre-loads 14 days + auto-extends, the AutoExtendWatcher, and a reFrameKey
    // that decouples re-seed from the auto-extend window grow.
    expect(globalDashboard).toContain("originIso");
    expect(globalDashboard).toContain("loadedStartIso");
    expect(globalDashboard).toContain("loadedEndIso");
    expect(globalDashboard).toContain("AutoExtendWatcher");
    expect(globalDashboard).toContain("needsExtend");
    expect(globalDashboard).toContain("seedViewportToday");
    expect(globalDashboard).toContain("reFrameKey");
    expect(globalDashboard).toContain("const extendLoaded");
    // Pre-load 14 days (stepIso(today, -13)) + fixed origin 30 days back (stepIso(today, -29)).
    expect(globalDashboard).toContain("stepIso(todayDateIso(new Date()), -13)");
    expect(globalDashboard).toContain("stepIso(todayDateIso(new Date()), -29)");
  });

  it("the single-open project accordion collapses others on expand (WP6b-4 re-spec D10)", () => {
    // toggleProject → [id] (expand, others collapse) | [] (collapse the open one). At most
    // one expanded. Seeded to [] (all collapsed) on each fetch.
    expect(globalDashboard).toContain(
      "setExpandedProjects((prev) => (prev.includes(projectId) ? [] : [projectId]))",
    );
    expect(globalDashboard).toContain("setExpandedProjects([])");
    // The old all-expanded seed is gone.
    expect(globalDashboard).not.toContain("result.projects.map((p) => p.id)");
  });

  it("the Minimap applies the fixed-origin dayOffset shift + reads the shared window (WP6b-4 re-spec P2.7)", () => {
    // P2.7 caught defect: the Minimap flattened density by raw minute-of-day (all days
    // collapsed onto lane 0) + recomputed its own deriveDataWindow (density overflowed the
    // track). Both fixed: (a) shift each seg by dayOffsetMin(s.day_iso, windowStartIso) read
    // from useDayWindow (mirrors DayTimeline); (b) use the ViewportContext dataWindow (the
    // resolved loaded window), NOT a recomputed deriveDataWindow. These pins guard the exact
    // regression the operator caught ("Minimap is off").
    expect(minimap).toContain("useDayWindow");
    expect(minimap).toContain("dayOffsetMin(s.day_iso, windowStartIso)");
    expect(minimap).toContain("seg.start + dayOffset");
    expect(minimap).toContain("seg.end + dayOffset");
    // Reads dataWindow from the shared context setter, not a local deriveDataWindow recompute.
    expect(minimap).toContain("dataWindow } = useViewportSetter()");
    // `deriveDataWindow` is no longer IMPORTED (regression guard for fix #2 — a real recompute
    // requires the import; the name may still appear in the explanatory comment, so guard the
    // import form specifically, not prose mentions).
    expect(minimap).not.toContain("deriveDataWindow, ");
    expect(minimap).not.toContain(", deriveDataWindow");
  });
});

describe("M9 WP6b-2 P4 — SidePanel + click-to-select seam (the live-verified wiring)", () => {
  // These pin the Phase-4 wiring the MCP-bridge verify-self confirmed live (click a
  // segment bar → SidePanel opens on the right with the 6-kind breakdown; ✕ / view-switch
  // / day-change clear the selection). The pure math (resolveSelectedSeg / sessionBreakdown)
  // is unit-pinned in sidePanelMath.test.ts; these guard the cross-component wiring the
  // ?raw posture covers. Integration boundary: DayTimeline (Day timeline) + GlobalDashboard
  // (the ⌘⇧A dashboard Day view).

  it("DayTimeline threads onSelectSeg → SessionRow → SegmentBar (the click→select path)", () => {
    expect(dayTimeline).toContain("onSelectSeg");
    // SegmentBar's onClick fires the seg id in the `<session_id>:<segIndex>` shape.
    expect(dayTimeline).toContain("onSelectSeg(`${session.id}:${i}`)");
    // the click target must carry a pointer cursor + stopPropagation (so a bar click
    // selects instead of starting a pan — the gesture hook early-returns on [data-seg-id]).
    expect(dayTimeline).toContain('cursor: onSelect ? "pointer" : "default"');
    expect(dayTimeline).toContain("stopPropagation");
  });

  it("GlobalDashboard owns selectedSegId + clears it on view-switch, day-change, and close", () => {
    expect(globalDashboard).toContain("selectedSegId");
    expect(globalDashboard).toContain("setSelectedSegId");
    // cleared in changeView + changeRange (both reset to null) and via onCloseSidePanel.
    expect(globalDashboard).toContain("setSelectedSegId(null)");
    expect(globalDashboard).toContain("onCloseSidePanel={() => setSelectedSegId(null)}");
    expect(globalDashboard).toContain("onSelectSeg={setSelectedSegId}");
  });

  it("the Day view resolves the selection + renders <SidePanel> (Day-view-only)", () => {
    expect(globalDashboard).toContain("import { SidePanel }");
    expect(globalDashboard).toContain("resolveSelectedSeg(selectedSegId, data)");
    expect(globalDashboard).toContain("<SidePanel");
    // rendered inside the Day body flex row alongside DayTimeline (not in Week/Month).
    expect(globalDashboard).toContain('className="dashboard-day-body"');
    // the SidePanel is a child of DayView only — Week/Month containers must NOT render it.
    const weekViewIdx = globalDashboard.indexOf("function WeekView");
    const monthViewIdx = globalDashboard.indexOf("function MonthViewContainer");
    const dayViewIdx = globalDashboard.indexOf("function DayView");
    const weekBlock = globalDashboard.slice(weekViewIdx, monthViewIdx);
    const monthBlock = globalDashboard.slice(
      monthViewIdx,
      globalDashboard.indexOf("export default function GlobalDashboard"),
    );
    expect(dayViewIdx).toBeGreaterThan(-1);
    expect(weekBlock).not.toContain("<SidePanel");
    expect(monthBlock).not.toContain("<SidePanel");
  });

  it("SidePanel drops the Overlaps section + the cs_ session-id mock, guards empty tools", () => {
    // Deliberate port deltas (WP6b-2 plan §overlaps): no OverlapsContext, no cs_4f8e1a mock,
    // no crash on an empty tools map. Assert CODE usage (not raw substrings — the file
    // HEADER COMMENT names the dropped features by design, so `not.toContain("OverlapsContext")`
    // over the whole file would false-fail on the doc prose; check the import/call + the
    // rendered section instead — TEST-TRIAGE 2026-07-14).
    expect(sidePanel).not.toContain("useOverlaps("); // the source's overlap hook — not CALLED (bare name is in the header comment)
    expect(sidePanel).not.toContain('from "./OverlapsContext"'); // no such import
    expect(sidePanel).not.toContain("data-side-panel-overlaps"); // the Overlaps section is not rendered
    // the Session ID line shows the real `session.id`, not the `cs_4f8e1a · ` mock prefix.
    expect(sidePanel).toContain("{session.id}");
    // empty-tools guard: the "No tool calls recorded" fallback replaces the source's
    // unguarded tools[0][1] / maxTool.
    expect(sidePanel).toContain("No tool calls recorded");
    // the 6-kind breakdown comes from the pure sessionBreakdown reducer.
    expect(sidePanel).toContain("sessionBreakdown");
    // the close ✕ reuses the app's borderless header treatment (P4 verify-human fix).
    expect(sidePanel).toContain('className="global-dashboard-close"');
    expect(sidePanel).toContain('data-testid="side-panel-close"');
  });
});
