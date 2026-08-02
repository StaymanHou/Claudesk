// @vitest-environment jsdom
//
// ⚠️ jsdom is needed ONLY for the `readGeometry` element-read tests at the bottom. Every
// decision test above them is a pure value check and would run in the default `node`
// environment — the pragma is here so both live in one file next to the code they cover.

import { describe, expect, it } from "vitest";
import {
  captureScroll,
  isMeasurable,
  planRestore,
  readGeometry,
  type ScrollGeometry,
} from "../docs/docsScrollRestore";

// M11 WP4 P2.2 — the scroll capture/restore lifecycle, asserted as VALUES.
//
// ── ⚠️ Why geometry is injected rather than read off a real element ──────────────
// MEASURED at build time (2026-08-02), not assumed: in jsdom `clientHeight` is **0 for
// visible and hidden elements alike** — it has no layout engine — while `scrollTop` is a
// plain writable property that persists whatever you assign it. So a module that sniffed
// `clientHeight` itself could not be tested for the one arm that matters: a "hidden box must
// not clobber the remembered offset" test would pass trivially, because jsdom considers
// EVERY box hidden. It would pass just as happily against code with the logic inverted.
//
// That is the vacuous-guard failure this WP has already paid for twice
// (`extract-for-import-when-a-raw-guard-cant-express-the-property`), wearing a new costume:
// a test that cannot distinguish the states it claims to distinguish. Injecting geometry as
// a value is what makes the hidden/visible arms actually separable here; the one-line DOM
// read is verified live in Phase 4, where a real WKWebView has real layout.

/** A measurable box: 400px viewport, 2000px of content, currently 600px down. */
const VISIBLE: ScrollGeometry = {
  scrollTop: 600,
  clientHeight: 400,
  scrollHeight: 2000,
};

/** The display:none case — a real browser reports zero height and scrollTop 0. */
const HIDDEN: ScrollGeometry = {
  scrollTop: 0,
  clientHeight: 0,
  scrollHeight: 2000,
};

describe("isMeasurable", () => {
  it("a laid-out box is measurable", () => {
    expect(isMeasurable(VISIBLE)).toBe(true);
  });

  it("a zero-height box is NOT measurable (display:none / detached / collapsed)", () => {
    expect(isMeasurable(HIDDEN)).toBe(false);
  });

  it("a null geometry (no element yet) is NOT measurable", () => {
    expect(isMeasurable(null)).toBe(false);
  });
});

describe("captureScroll", () => {
  it("records the offset from a measurable box", () => {
    expect(captureScroll(VISIBLE, null)).toBe(600);
  });

  it("overwrites a previous offset when the box is measurable", () => {
    expect(captureScroll(VISIBLE, 123)).toBe(600);
  });

  // ⚠️ THE load-bearing assertion of this module. A hidden box reports scrollTop 0, so
  // recording it would replace a good remembered offset with a fake "top of document" —
  // destroying exactly the position the feature exists to keep, and only in the case where
  // the reader was not looking (which is what makes it read as random rather than as a bug).
  it("⚠️ an unmeasurable box does NOT clobber the remembered offset", () => {
    expect(captureScroll(HIDDEN, 600)).toBe(600);
  });

  it("an unmeasurable box with nothing remembered stays null — it does not invent 0", () => {
    // `null` (nothing captured) and `0` (captured, at the top) are different states: the
    // first defers, the second is a real position. Collapsing them would make "no capture
    // yet" indistinguishable from "reader is at the top".
    expect(captureScroll(HIDDEN, null)).toBeNull();
  });

  it("a null geometry does not clobber either", () => {
    expect(captureScroll(null, 600)).toBe(600);
  });

  it("a genuine 0 from a MEASURABLE box is recorded as 0", () => {
    // The complement of the guard above: the reader really being at the top must be
    // recordable, or the guard would have been implemented as "ignore all zeroes".
    expect(captureScroll({ ...VISIBLE, scrollTop: 0 }, 600)).toBe(0);
  });
});

describe("planRestore", () => {
  it("applies a remembered offset to a measurable box", () => {
    expect(planRestore(VISIBLE, 600)).toEqual({ apply: true, scrollTop: 600 });
  });

  // ⚠️ Defer, never discard. `apply: false` means "hold it and try again when the panel is
  // re-fronted" — dropping the offset here is what produces "I switched panels and came back
  // to the top".
  it("⚠️ DEFERS (does not discard) when the box is unmeasurable, preserving the offset", () => {
    expect(planRestore(HIDDEN, 600)).toEqual({ apply: false, scrollTop: 600 });
  });

  it("nothing to restore → no-op", () => {
    expect(planRestore(VISIBLE, null)).toEqual({ apply: false, scrollTop: 0 });
  });

  // ── Codified at verify-codify (P2.verify-codify) ─────────────────────────────
  // ⚠️ Added because a mutation probe found this UNPINNED: relaxing the guard to
  // `geom !== null && !isMeasurable(geom)` — i.e. treating a NULL geometry as applicable —
  // left all 20 prior tests passing. That mutant is not hypothetical; it throws a TypeError
  // on `geom.scrollHeight` the first time a restore is attempted before the ref has
  // attached, which is precisely the first-mount case.
  //
  // "No element yet" and "element has no layout" are two DIFFERENT reasons a box is
  // unmeasurable, and only the second had coverage. Both must defer.
  it("⚠️ a NULL geometry (ref not attached yet) DEFERS and preserves the offset", () => {
    expect(planRestore(null, 600)).toEqual({ apply: false, scrollTop: 600 });
  });

  it("a null geometry with nothing remembered is a clean no-op", () => {
    expect(planRestore(null, null)).toEqual({ apply: false, scrollTop: 0 });
  });

  it("CLAMPS an offset past the end of a shrunken document", () => {
    // A live doc can shrink (a WIP file rewritten shorter, a `git checkout`). The stale
    // offset is past the new end; clamping keeps the reader as close as the document allows
    // rather than leaving a value the browser will silently pin.
    const shrunk: ScrollGeometry = {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 500,
    };
    expect(planRestore(shrunk, 600)).toEqual({ apply: true, scrollTop: 100 });
  });

  it("clamps to 0 when the document is shorter than its viewport", () => {
    const tiny: ScrollGeometry = {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 120,
    };
    // `scrollHeight - clientHeight` is negative here; 0 is the only correct answer.
    expect(planRestore(tiny, 600)).toEqual({ apply: true, scrollTop: 0 });
  });

  it("never produces a negative offset", () => {
    expect(planRestore(VISIBLE, -50).scrollTop).toBe(0);
  });

  it("a doc that GREW keeps the exact offset (no clamp applied)", () => {
    const grown: ScrollGeometry = { ...VISIBLE, scrollHeight: 9_000 };
    expect(planRestore(grown, 600)).toEqual({ apply: true, scrollTop: 600 });
  });
});

describe("readGeometry — the one DOM-touching function", () => {
  it("returns null for a missing element", () => {
    // So callers route "no box yet" and "box has no layout" through one `isMeasurable` path.
    expect(readGeometry(null)).toBeNull();
  });

  it("reads the three fields off a real element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.scrollTop = 250; // writable and persisted in jsdom (measured)
    const geom = readGeometry(el);
    expect(geom).not.toBeNull();
    expect(geom?.scrollTop).toBe(250);
    // ⚠️ NOT asserting clientHeight/scrollHeight VALUES here: jsdom reports 0 for both
    // regardless of styling, so any expectation about them would be a statement about
    // jsdom rather than about this code. The shape is what is checkable here; the real
    // numbers are Phase 4's live check in a WKWebView that has actual layout.
    expect(typeof geom?.clientHeight).toBe("number");
    expect(typeof geom?.scrollHeight).toBe("number");
    el.remove();
  });
});

describe("the round trip — capture then restore", () => {
  it("mid-document position survives a re-render while visible", () => {
    const captured = captureScroll(VISIBLE, null);
    const plan = planRestore(VISIBLE, captured);
    expect(plan).toEqual({ apply: true, scrollTop: 600 });
  });

  // The full hidden-panel sequence, which is the bug this module exists to prevent:
  // reader scrolls → switches panel (box goes unmeasurable) → file changes on disk →
  // reload fires → reader switches back. The offset must survive every step.
  it("⚠️ mid-document position survives a reload that lands while the panel is HIDDEN", () => {
    // 1. Reader is 600px down, panel visible.
    let held = captureScroll(VISIBLE, null);
    expect(held).toBe(600);

    // 2. Panel switched away; an fs-change fires and the reload captures again.
    held = captureScroll(HIDDEN, held);
    expect(held).toBe(600); // NOT clobbered to 0

    // 3. The restore is attempted while still hidden → deferred, offset intact.
    const deferred = planRestore(HIDDEN, held);
    expect(deferred.apply).toBe(false);
    expect(deferred.scrollTop).toBe(600);

    // 4. Panel re-fronted → the held offset applies.
    const applied = planRestore(VISIBLE, held);
    expect(applied).toEqual({ apply: true, scrollTop: 600 });
  });
});
