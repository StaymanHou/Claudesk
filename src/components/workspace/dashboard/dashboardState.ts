// M9 WP6a — pure core for the GlobalDashboard's render-mode decision.
//
// The GLOBAL time-analytics view has three mutually-exclusive display modes,
// decided from two inputs the view already holds:
//   - `enabled`  — the WP5 tracking toggle (`time_get_tracking_enabled`), default OFF.
//   - `hasData`  — whether the queried window returned any project rows.
//
// Repo posture (pure logic → vitest, live DOM → the MCP bridge): this predicate is
// vitest-testable in isolation so the three-way branch is pinned without a running
// app. The view component (GlobalDashboard.tsx) is the wiring layer that feeds it the
// live flag + payload and renders the matching subtree.

/** The DashboardPanel's render mode.
 *  - `"off"`   — tracking disabled (WP5 toggle OFF) → the "enable tracking" empty-state.
 *  - `"empty"` — tracking ON but the window has no recorded activity → "no activity" msg.
 *  - `"data"`  — tracking ON and rows present → render the day breakdown. */
export type DashboardMode = "off" | "empty" | "data";

/**
 * Decide the render mode. Tracking-OFF dominates (the toggle is the gate — if it's
 * off there is nothing to show regardless of any stale payload). When ON, the mode
 * is data-vs-empty by whether the window produced rows.
 *
 * `hasData` is left to the caller to compute from the payload (e.g.
 * `result.kind === "range" && result.projects.length > 0`) so this stays a pure
 * two-boolean fold with no DTO coupling.
 */
export function dashboardMode(enabled: boolean, hasData: boolean): DashboardMode {
  if (!enabled) return "off";
  return hasData ? "data" : "empty";
}
