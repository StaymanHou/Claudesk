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
