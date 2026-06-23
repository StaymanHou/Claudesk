import { describe, it, expect } from "vitest";
// Vite ?raw import: bundles Filmstrip.tsx's source text at test time (repo posture:
// pure logic → vitest, live DOM → Playwright verify-self; same ?raw trick as
// terminalSlotGuard / workspaceOffViewport / mirrorTail). The live "drag actually
// reorders both directions" check is the M4 WP3 Phase-4 verify-human observable
// (operator-validated + a real-Playwright-mouse self-test).
import filmstripSource from "../Filmstrip.tsx?raw";

// M4 WP3 P4 guard — pointer-drag capture MUST be on the stable strip container, not the
// per-tile button.
//
// The failure mode this test exists to prevent (P4 verify-human round 3 root cause): the
// live reorder re-renders the tile buttons on every pointermove, which destroys+recreates
// the dragged button. If `setPointerCapture` were on the tile, that rebuild drops the
// capture after the FIRST frame → no further pointermove arrives → the drag freezes (the
// "won't move / only moves right" bug that survived two earlier fixes). Capturing on the
// strip <div> (never rebuilt) is what makes the drag work. Pinned structurally so a future
// refactor that moves the handlers back onto the tile can't silently reintroduce the freeze.

describe("Filmstrip drag captures on the stable strip, not the per-tile button", () => {
  it("calls setPointerCapture via stripRef (the stable container)", () => {
    expect(filmstripSource).toMatch(/stripRef\.current\?\.setPointerCapture/);
  });

  it("does NOT capture on the tile button (e.currentTarget.setPointerCapture)", () => {
    // The pre-fix code used `e.currentTarget.setPointerCapture(...)` inside the tile's own
    // onPointerDown — that's exactly what dropped the capture on re-render.
    expect(filmstripSource).not.toMatch(/currentTarget\.setPointerCapture/);
  });

  it("wires the pointer handlers on the .filmstrip strip element", () => {
    // The strip <div> owns onPointerDown/Move/Up (closest() resolves the pressed tile).
    expect(filmstripSource).toMatch(/onPointerDown=\{onStripPointerDown\}/);
    expect(filmstripSource).toMatch(/onPointerMove=\{onStripPointerMove\}/);
    expect(filmstripSource).toMatch(/onPointerUp=\{onStripPointerUp\}/);
  });
});
