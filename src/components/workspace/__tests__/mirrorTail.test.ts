import { describe, it, expect } from "vitest";
// Vite ?raw import: bundles XtermPane.tsx's source text at test time (repo posture:
// pure logic → vitest, live DOM → Playwright verify-self; same ?raw trick as
// terminalSlotGuard.test.ts / workspaceOffViewport.test.ts). The live "mirror visibly
// tails the latest output" check is the M4 WP3 Phase-3 verify-human observable.
import xtermSource from "../XtermPane.tsx?raw";

// M4 WP3 P3 guard — the filmstrip mirror MUST serialize a bottom-anchored TAIL.
//
// The failure mode this test exists to prevent: a future edit reverts the
// `serializeAsHTML` call back to `scrollback: 0`. That serializes only the parked
// viewport of a backgrounded terminal (whose ydisp does NOT auto-advance while its
// renderer is paused off-viewport), so the mirror FREEZES once output scrolls past the
// initial screen — the exact bug caught at P3 verify-human round 2 (2026-06-23,
// "doesn't tail the bottom"). A positive `scrollback` anchors the serialization at the
// buffer bottom, capturing the newest rows. Pinned structurally so the regression can't
// slip back in unnoticed.

describe("XtermPane mirror serializes a bottom-anchored tail (not scrollback:0)", () => {
  it("calls serializeAsHTML with a POSITIVE scrollback (tails the latest output)", () => {
    // Match `scrollback: <n>` inside the serializeAsHTML options and assert n > 0.
    const m = xtermSource.match(/serializeAsHTML\(\{[^}]*scrollback:\s*(\d+)/);
    expect(m, "serializeAsHTML({ scrollback: N }) call not found").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  it("includes the global background so the mirror is dark, not white", () => {
    expect(xtermSource).toMatch(/includeGlobalBackground:\s*true/);
  });
});
