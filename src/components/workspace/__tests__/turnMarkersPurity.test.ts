import { describe, expect, it } from "vitest";
import turnMarkersSource from "../turnMarkers.ts?raw";

// M13.5 WP3 — turnMarkers.ts must stay DOM-free and dependency-free.
// (Anchors refreshed at the 2026-08-25 re-plan, which replaced the backward walk with
// bidirectional position-based navigation; the guard's PURPOSE is unchanged.)
//
// ⚠️ WHY THIS GUARD EXISTS AT ALL. The behavioural tests in `turnMarkers.test.ts` prove the navigation is
// correct; none of them would FAIL if a future edit reached into the DOM. That gap was surfaced by
// the Phase 2 verify-self subagent, and it matters more here than it would elsewhere: the module was
// extracted **precisely because** DOM/geometry reads are untrustworthy in this codebase. `arch.md`
// records that jsdom reports `clientHeight === 0` for VISIBLE elements, and that WebKit retains
// `scrollTop` on a never-unmounted hidden node and clamps out-of-range writes itself — which
// silently vacated two live proofs in a prior milestone. A DOM read added here would re-introduce
// exactly the hazard the extraction removed, and every existing test would stay green while it did.
//
// ⚠️ This is a STRUCTURAL guard, and that is all it is. Per `docs/lessons/source-text-guards.md` a
// `?raw` guard verifies shape, never runtime; the navigation's BEHAVIOUR is owned by
// `turnMarkers.test.ts`, which drives the real functions. This file only pins "the module cannot be
// reading the DOM", which is a property of the source text and therefore the one thing a source-text
// guard can honestly assert.
//
// ⚠️ COMMENTS ARE STRIPPED FIRST, and here the reason is INVERTED from the usual one. The normal trap
// is a guard satisfied by the module's own comments, passing exactly when the named code is deleted
// (`[[raw-guard-identifier-satisfied-by-own-comments]]`). Here the risk runs the other way: the
// module's header prose deliberately NAMES `clientHeight`, `scrollTop` and `xterm` while explaining
// why it avoids them, so an unstripped haystack would produce a permanent FALSE POSITIVE. Strip
// first, then assert absence.
const code = turnMarkersSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("turnMarkers.ts stays a pure module", () => {
  it("is not vacuous — the stripped source still contains the real implementation", () => {
    // ⚠️ The emptiness meta-guard, and it is load-bearing for an ABSENCE test in a way it is not for
    // a presence test. Every assertion below is `not.toMatch`, so an over-eager strip (a regex
    // change, a `?raw` import that silently resolved to "") would leave `code` empty and every
    // absence assertion would PASS while checking nothing. Pin the haystack before trusting it.
    // ⚠️ Pin the functions that CARRY the behaviour, so a rewrite that guts the module cannot
    // leave these absence assertions checking an empty string. Updated at the 2026-08-25 re-plan:
    // the old anchor was `nextJump`, which that re-plan DELETED — an emptiness guard naming a
    // removed symbol fails loudly (good), but naming a symbol that never returns would have made
    // this guard permanently vacuous. Anchor on live exports only.
    expect(code).toMatch(/export function stepTurn\(/);
    expect(code).toMatch(/export function scrollTargetFor\(/);
    expect(code).toMatch(/export function navState\(/);
    expect(code).toMatch(/export function isLiveMarker\(/);
    expect(code).toMatch(/export function liveMarkers\(/);
    expect(code.length).toBeGreaterThan(600);
  });

  it("has no imports at all — not even a type-only xterm import", () => {
    // `TurnMarker` is declared as a local structural interface on purpose: a type-only xterm import
    // would be harmless at runtime but would couple this module's shape to the addon's, and the
    // whole point is that a test can build a fixture without constructing a Terminal.
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });

  it("never touches the DOM or a global object", () => {
    // The core assertion. Each identifier is one this project has actually been burned by.
    for (const forbidden of [
      "document",
      "window",
      "globalThis",
      "getBoundingClientRect",
      "clientHeight",
      "clientWidth",
      "offsetHeight",
      "offsetWidth",
      "scrollTop",
      "scrollHeight",
      "querySelector",
    ]) {
      expect(
        code,
        `turnMarkers.ts must not reference \`${forbidden}\` — the module exists because DOM/geometry reads are untrustworthy here (see the header)`,
      ).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it("does not reach for xterm at runtime", () => {
    // A live `Terminal`/addon reference would mean the model had started driving the terminal
    // instead of returning a value for the caller to act on — the seam this module defines.
    expect(code).not.toMatch(/@xterm/);
    expect(code).not.toMatch(/\bnew Terminal\b/);
    expect(code).not.toMatch(/\bregisterMarker\b/);
    expect(code).not.toMatch(/\bregisterDecoration\b/);
    expect(code).not.toMatch(/\bscrollToLine\b/);
  });
});
