import { describe, expect, it } from "vitest";
// M9 WP6b-2 Phase 1 — source-text WIRING tests for the dashboard Toolbar's view-mode
// tab strip, following the repo's `?raw` posture (pure logic → vitest; live render/IPC →
// the MCP bridge; NO React-render infra by design — see dashboardWiring.test.ts header).
//
// Phase 1 lit up the WEEK tab (was a disabled placeholder in WP6a). These pins guard the
// load-bearing tab config + click wiring the MCP-bridge verify-self confirmed live, so a
// regression — Week accidentally re-disabled, Month/Custom flipped on before their phases
// ship, or the click→onViewChange handler dropped — fails a cheap unit gate instead of
// only surfacing on the next live drive. Mirrors dashboardWiring.test.ts.
import chrome from "../Chrome.tsx?raw";

describe("M9 WP6b-2 P1 — Toolbar VIEW_MODES enablement (staged per phase)", () => {
  it("Day, Week, and Month are enabled (P1 lit Week; P2 lit Month)", () => {
    expect(chrome).toContain('{ value: "day", label: "Day", enabled: true }');
    expect(chrome).toContain('{ value: "week", label: "Week", enabled: true }');
    expect(chrome).toContain('{ value: "month", label: "Month", enabled: true }');
  });

  it("there is NO Custom tab (P3 merged Custom into Day's date picker — the tab was removed)", () => {
    // Regression guard for the Custom→Day merge (design-prior new-surface-must-earn-its-
    // place): a 1-day Custom tab was a strict subset of Day, so the tab was removed and
    // Day gained a date picker instead. Re-adding a Custom VIEW_MODES entry regresses that.
    expect(chrome).not.toContain('value: "custom"');
    expect(chrome).not.toContain('label: "Custom"');
  });

  it("Compare is still DISABLED (out of scope for WP6b-2 — it's a WP6c metrics surface)", () => {
    // Regression guard: Compare must not be enabled before WP6c lands its metrics panels.
    expect(chrome).toContain(
      '{ value: "compare", label: "Compare", enabled: false }',
    );
  });
});

describe("M9 WP6b-2 P1 — Toolbar tab strip is view-driven (aria + click wiring)", () => {
  it("Toolbar takes view + onViewChange props (the view-driven signature)", () => {
    expect(chrome).toContain("export function Toolbar({");
    expect(chrome).toContain("view: DashboardView;");
    expect(chrome).toContain("onViewChange: (view: DashboardView) => void;");
  });

  it("each tab renders aria-selected from the active view and disables/blanks the click on disabled tabs", () => {
    // current = m.value === view drives aria-selected; only ENABLED tabs get an onClick.
    expect(chrome).toContain("const current = m.value === view;");
    expect(chrome).toContain("aria-selected={current}");
    expect(chrome).toContain("disabled={!m.enabled}");
    expect(chrome).toContain(
      "onClick={m.enabled ? () => onViewChange(m.value) : undefined}",
    );
    expect(chrome).toContain("data-tab={m.value}");
  });

  it("the Fit-day control is Day-view-only (renders only when onFitDay is supplied)", () => {
    // Phase 1: onFitDay is passed only in the Day view; Week must not carry it.
    expect(chrome).toContain("{onFitDay && (");
    expect(chrome).toContain('data-testid="dashboard-fit-day"');
  });
});
