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

describe("M9 WP6a Phase 2 — GlobalDashboard fetches the day payload + feeds DayTimeline", () => {
  it("queries the GLOBAL day window via the WP4 command", () => {
    // The all-projects scope is the whole point (the corrected surface). A regression
    // to per-project scope or a different window should fail here.
    expect(globalDashboard).toContain('queryTimeAnalytics({ kind: "day" }, "global")');
  });

  it("branches on the range result + feeds it to <DayTimeline>", () => {
    expect(globalDashboard).toContain('result.kind === "range"');
    expect(globalDashboard).toContain("<DayTimeline");
    expect(globalDashboard).toContain("expandedProjects");
    expect(globalDashboard).toContain("onToggleProject");
  });

  it("renders the distinct tracking-ON-but-no-rows empty-state (not the OFF one)", () => {
    expect(globalDashboard).toContain('data-testid="dashboard-empty-nodata"');
    // still keeps the OFF empty-state + the tracking gate from Phase 1
    expect(globalDashboard).toContain('data-testid="dashboard-empty-tracking-off"');
  });
});
