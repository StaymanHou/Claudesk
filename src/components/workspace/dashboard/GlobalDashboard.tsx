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
// PHASE 2 (this file): the frame (header + close) + the tracking-gate + the DAY-VIEW
// render. It reads the WP5 tracking toggle (`getTimeTrackingEnabled`), stays in sync via
// the `TIME_TRACKING_ENABLED_EVENT` broadcast (mirror of ProjectPicker's seed+listen),
// and — when tracking is ON — fetches `queryTimeAnalytics({kind:"day"}, "global")` and
// feeds the 1-day `RangePayload` into <DayTimeline>. Three empty/loading states:
//   - tracking OFF → "enable tracking" (dashboard-empty-tracking-off)
//   - tracking ON, fetch in flight → loading
//   - tracking ON, no rows → "no activity recorded today" (dashboard-empty-nodata)
//
// The tracking-vs-data mode is the pure `dashboardMode(enabled, hasData)` predicate
// (dashboardState.ts, vitest-pinned).

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  TIME_TRACKING_ENABLED_EVENT,
  getTimeTrackingEnabled,
  queryTimeAnalytics,
  type RangePayload,
} from "../../../state/timeAnalytics";
import { dashboardMode } from "./dashboardState";
import { DayTimeline } from "./DayTimeline";
import { Toolbar, SummaryStrip, Legend } from "./Chrome";
import { dayStats } from "./dayStats";
import { colorForKind } from "./kinds";

interface GlobalDashboardProps {
  /** Dismiss the dashboard, returning to the workspace center stage. */
  onClose: () => void;
}

export default function GlobalDashboard({ onClose }: GlobalDashboardProps) {
  // Seed from the backend (single source of truth) + stay in sync via the broadcast,
  // so flipping the WP5 checkbox in the picker flips this view live — no remount, no
  // manual refresh. `cancelled` guards the async seed/listen under StrictMode.
  // (Mirror of ProjectPicker's tracking seed+listen effect.)
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  // The fetched day payload (null = not-yet-loaded / loading), + a loading flag.
  const [dayData, setDayData] = useState<RangePayload | null>(null);
  const [loading, setLoading] = useState(false);
  // Which project rows are expanded (default: all). Owned here; DayTimeline is
  // presentational. Seeded from the payload each fetch (all-expanded) then toggled.
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);

  // Fetch today's global (all-projects) breakdown. Called on open + on the tracking-ON
  // flip. A day query returns a 1-day `range` payload; a `week` result never comes back
  // from a {kind:"day"} query, but we branch defensively.
  const fetchDay = useCallback(() => {
    setLoading(true);
    void queryTimeAnalytics({ kind: "day" }, "global")
      .then((result) => {
        if (result.kind === "range") {
          setDayData(result);
          setExpandedProjects(result.projects.map((p) => p.id)); // default all-expanded
        } else {
          setDayData(null);
        }
      })
      .catch((e) => {
        console.error("[claudesk] time_analytics_query (day) failed:", e);
        setDayData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId],
    );
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getTimeTrackingEnabled()
      .then((enabled) => {
        if (!cancelled) {
          setTrackingEnabled(enabled);
          if (enabled) fetchDay(); // ON at open → fetch immediately
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
      if (event.payload) fetchDay(); // flipped ON → fetch; OFF → gate hides it
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
  }, [fetchDay]);

  // hasData = tracking ON AND the day query returned ≥1 project row. `dashboardMode`
  // folds tracking-vs-data into off/empty/data. `loading` is layered on top (only
  // meaningful when tracking is ON and a fetch is in flight before data arrives).
  const hasData = !!dayData && dayData.projects.length > 0;
  const mode = dashboardMode(trackingEnabled, hasData);

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
        ) : mode === "data" && dayData ? (
          <>
            <Toolbar dateLabel={dayData.label} />
            <SummaryStrip
              stats={dayStats(dayData, colorForKind("ai-doing"))}
            />
            <div className="dashboard-legend-row">
              <Legend />
            </div>
            <DayTimeline
              data={dayData}
              expandedProjects={expandedProjects}
              onToggleProject={toggleProject}
            />
          </>
        ) : loading ? (
          <div className="dashboard-empty" data-testid="dashboard-empty-loading">
            <p className="dashboard-empty-hint">Loading today’s activity…</p>
          </div>
        ) : (
          // tracking ON, fetch settled, but no rows for today.
          <div className="dashboard-empty" data-testid="dashboard-empty-nodata">
            <p className="dashboard-empty-title">No activity recorded today</p>
            <p className="dashboard-empty-hint">
              Once you work in a tracked project today, your per-project
              breakdown will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
