import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles Workspace.tsx's source text at test time (repo posture:
// pure logic → vitest, live DOM → Playwright verify-self; same ?raw trick as
// terminalSlotGuard.test.ts). The live "computed style is off-viewport" check is the
// M4 WP3 Phase-1 verify-self Browser observable outcome.
import workspaceSource from "../Workspace.tsx?raw";

// M4 WP3 P1.2 guard — backgrounds MUST be hidden OFF-VIEWPORT, never display:none.
//
// The failure mode this test exists to prevent: a future edit reverts the hidden
// (non-`visible`) WORKSPACE to `display:none`. That silently breaks the WP3 filmstrip
// live mirror — `display:none` gives the background xterm zero dimensions, so
// FitAddon's `fit()` throws AND the serialized buffer can't render into a sized tile
// (WP4 thumbnail-probe finding). The off-viewport (`left:-99999px`) approach keeps
// the element laid out with real dimensions while xterm's IntersectionObserver pauses
// the off-screen renderer for free. This invariant is load-bearing for P3, so it's
// pinned structurally rather than relying on a human noticing the regression.
//
// M6 WP3 refinement: `display:none` IS now used legitimately for the intra-workspace
// HALF collapse (the ◀ CC / ED ▶ toggles hide `.workspace-left` / `.workspace-right`).
// That is a DIFFERENT concern from the workspace-level background hide and does NOT
// violate the invariant. So the guard below targets the *workspace root's hidden
// branch* (off-viewport + grid) rather than blanket-banning the `display:none`
// literal anywhere in the file.

describe("Workspace hides backgrounds off-viewport, not with display:none", () => {
  it("pushes the hidden workspace off-viewport with a large negative left", () => {
    expect(workspaceSource).toMatch(/left:\s*["']?-9{4,}px/);
  });

  it("keeps the hidden workspace mounted as display:grid (real dimensions)", () => {
    // Both the visible and hidden branches render display:grid (only positioning differs).
    expect(workspaceSource).toMatch(/display:\s*["']grid["']/);
  });

  it("uses display:none ONLY for the half-collapse, never for the workspace hide", () => {
    // The invariant is about the workspace-level background hide (off-viewport), not
    // the M6 intra-workspace half-collapse (which legitimately uses display:none on
    // `.workspace-left` / `.workspace-right`). Assert every `display:"none"` in the
    // source is a half-collapse usage — keyed on the `Collapsed` guard variable the
    // half-collapse styles read (`leftCollapsed`/`collapsed=rightCollapsed`). If a
    // future edit hides the WORKSPACE with display:none, it won't be on a *Collapsed
    // line, so this catches the real regression while allowing the collapse.
    const lines = workspaceSource.split("\n");
    const displayNoneLines = lines.filter((l) =>
      /display:\s*["']none["']/.test(l),
    );
    for (const line of displayNoneLines) {
      expect(line).toMatch(/Collapsed/);
    }
  });
});
