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
    expect(
      m,
      "serializeAsHTML({ scrollback: N }) call not found",
    ).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  it("includes the global background so the mirror is dark, not white", () => {
    expect(xtermSource).toMatch(/includeGlobalBackground:\s*true/);
  });

  // Mirror fill-from-bottom (SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START).
  //
  // The single-seam contract: the serializer thunk must WRAP serializeAsHTML(...) in
  // trimTrailingBlankRows(...) so a sparse fresh session's real content bottom-anchors at the
  // tile edge (clear of the header) instead of being pushed up under it. This is the ONE serialize
  // site; both the filmstrip and the PiP read downstream of it (via mirrorFrame), so unwrapping it
  // silently re-breaks BOTH surfaces with green unit tests (mirrorTrim.test.ts still passes because
  // the function itself is untouched — only the call site regressed). Same failure-mode + same
  // ?raw source-assertion guard style as the scrollback pin above. Verified live on both surfaces
  // by the operator at verify-human (2026-07-06).
  it("wraps the serializeAsHTML call in trimTrailingBlankRows (fill-from-bottom, both surfaces)", () => {
    // The trim must be imported...
    expect(xtermSource).toMatch(
      /import\s*\{\s*trimTrailingBlankRows\s*\}\s*from\s*["']\.\/mirrorTrim["']/,
    );
    // ...AND the serializer thunk's serializeAsHTML(...) must be enclosed by a
    // trimTrailingBlankRows( ... ) call. Match the wrapper open before the call and allow the
    // options object + close paren in between (the call spans multiple lines).
    expect(xtermSource).toMatch(
      /trimTrailingBlankRows\(\s*serialize\.serializeAsHTML\(/,
    );
  });
});
