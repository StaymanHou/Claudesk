import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles Workspace.tsx's source text at test time (repo posture:
// pure logic → vitest, live DOM → Playwright verify-self; same ?raw trick as
// terminalSlotGuard.test.ts). The live "computed style is off-viewport" check is the
// M4 WP3 Phase-1 verify-self Browser observable outcome.
import workspaceSource from "../Workspace.tsx?raw";

// M4 WP3 P1.2 guard — backgrounds MUST be hidden OFF-VIEWPORT, never display:none.
//
// The failure mode this test exists to prevent: a future edit reverts the hidden
// (non-`visible`) workspace to `display:none`. That silently breaks the WP3 filmstrip
// live mirror — `display:none` gives the background xterm zero dimensions, so
// FitAddon's `fit()` throws AND the serialized buffer can't render into a sized tile
// (WP4 thumbnail-probe finding). The off-viewport (`left:-99999px`) approach keeps
// the element laid out with real dimensions while xterm's IntersectionObserver pauses
// the off-screen renderer for free. This invariant is load-bearing for P3, so it's
// pinned structurally rather than relying on a human noticing the regression.

describe("Workspace hides backgrounds off-viewport, not with display:none", () => {
  it("pushes the hidden workspace off-viewport with a large negative left", () => {
    expect(workspaceSource).toMatch(/left:\s*["']?-9{4,}px/);
  });

  it("does NOT use display:none to hide a workspace (would break FitAddon + mirror)", () => {
    // Tolerate whitespace/quote variants; the point is no `display: "none"` survives.
    expect(workspaceSource).not.toMatch(/display:\s*["']none["']/);
  });

  it("keeps the hidden workspace mounted as display:grid (real dimensions)", () => {
    // Both the visible and hidden branches render display:grid (only positioning differs).
    expect(workspaceSource).toMatch(/display:\s*["']grid["']/);
  });
});
