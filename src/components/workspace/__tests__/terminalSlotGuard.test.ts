import { describe, expect, it } from "vitest";
import { AVAILABLE_PANELS } from "../panelHost";
// Vite ?raw import: bundles RightPanelHost's source text at test time — works in
// vitest with NO node:fs / @types/node dependency (the repo convention; same trick
// as probe/__tests__/replay.test.ts).
import hostSource from "../RightPanelHost.tsx?raw";

// SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED guard.
//
// The failure mode this test exists to prevent: `selectPanel` can return a panel
// (e.g. "terminal") for which RightPanelHost renders NO mounted slot — so the right
// half goes blank. The fix discipline (WP9) is "add to AVAILABLE_PANELS + mount the
// slot + the tab in the SAME change." This test enforces the invariant structurally
// without pulling in jsdom/RTL (repo posture: pure logic → vitest, live DOM →
// Playwright verify-self): for EVERY panel in AVAILABLE_PANELS, RightPanelHost's
// source must (a) gate a `.right-panel-slot` on `panel === "<name>"` and (b) expose a
// clickable `panel-tab-<name>` tab. The live "the slot is non-empty on screen" check
// is the Phase-1 verify-self Browser observable outcome.

describe("RightPanelHost mounts a slot + tab for every available panel", () => {
  it.each([...AVAILABLE_PANELS])(
    "panel '%s' has a display-gated slot",
    (panel) => {
      // The slot is rendered with `display: panel === "<name>" ? ... : "none"`.
      expect(hostSource).toContain(`panel === "${panel}"`);
    },
  );

  it.each([...AVAILABLE_PANELS])("panel '%s' has a selectable tab", (panel) => {
    expect(hostSource).toContain(`panel-tab-${panel}`);
  });

  it("renders the terminal pane component (not a placeholder)", () => {
    // The specific regression: AVAILABLE_PANELS gained "terminal" but the slot was
    // never wired to a real pane. Assert the TerminalPane is mounted.
    expect(hostSource).toContain("<TerminalPane");
  });
});

// Theme E (WP6) — the panel-tab row is a WAI-ARIA tablist; each tab must point at its
// panel via aria-controls, and the matching panel must be role=tabpanel labelled back
// by the tab. A drift (tab's aria-controls with no matching tabpanel id) is an a11y
// dead-link that ships green; this pins the id pairing structurally (same ?raw idiom).
describe("RightPanelHost panel tabs are aria-wired to their tabpanels", () => {
  // The source builds the ids as workspace-scoped template literals, e.g.
  //   id={`panel-editor-${workspaceId}`}  /  aria-controls={`panel-editor-${workspaceId}`}
  // We match the literal `panel-<name>-` / `paneltab-<name>-` prefixes (the `${workspaceId}`
  // suffix varies at runtime), which is enough to pin tab↔panel id agreement per panel.
  it.each([...AVAILABLE_PANELS])(
    "tab '%s' aria-controls a matching role=tabpanel slot",
    (panel) => {
      // Tab declares the relationship + carries a stable id the panel labels back to…
      expect(hostSource).toContain(`aria-controls={\`panel-${panel}-`);
      expect(hostSource).toContain(`id={\`paneltab-${panel}-`);
      // …and the slot is that tabpanel target, labelled by the tab.
      expect(hostSource).toContain(`id={\`panel-${panel}-`);
      expect(hostSource).toContain(`aria-labelledby={\`paneltab-${panel}-`);
    },
  );

  it("the panel-tab row and each slot carry the tablist/tabpanel roles", () => {
    expect(hostSource).toContain('role="tablist"');
    expect(hostSource).toContain('role="tabpanel"');
  });
});
