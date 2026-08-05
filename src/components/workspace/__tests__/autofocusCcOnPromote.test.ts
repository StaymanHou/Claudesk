import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles the component source text at test time (repo posture —
// pure logic → vitest, live DOM → Playwright/operator verify-human; same ?raw trick as
// workspaceOffViewport.test.ts / terminalSlotGuard.test.ts). The live "focus lands in
// the CC terminal on promote" check is the QoL-WP3 verify-human Browser observable
// outcome; these structural assertions pin the wiring so a future edit can't silently
// sever it.
import workspaceSource from "../Workspace.tsx?raw";
import xtermPaneSource from "../XtermPane.tsx?raw";

// QoL-WP3 — auto-focus the LEFT CC terminal when a workspace is promoted to center stage.
//
// The failure modes these tests exist to prevent:
//  1. The imperative focus handle is dropped from XtermPane → Workspace can no longer
//     focus the pane on promote (the feature silently no-ops).
//  2. The focus effect stops keying on `visible` (e.g. someone refactors it to fire
//     unconditionally, or removes the edge), so background workspaces steal focus or
//     promotion stops focusing.
//  3. Someone adds a PTY write on focus (cc_input / a stray \r\n inside the focus path),
//     re-introducing the WP4 spurious-prompt bug class on the LEFT pane.
// All three are wiring invariants not observable in jsdom (xterm needs a real DOM), so
// they're pinned structurally rather than relying on a human noticing the regression.

describe("XtermPane exposes an imperative focus handle (QoL-WP3 P1.1)", () => {
  it("is a forwardRef component", () => {
    expect(xtermPaneSource).toMatch(/forwardRef<\s*XtermPaneHandle/);
  });

  it("exports the XtermPaneHandle type with a focus() method", () => {
    expect(xtermPaneSource).toMatch(/export interface XtermPaneHandle/);
    expect(xtermPaneSource).toMatch(/focus\(\)\s*:\s*void/);
  });

  it("wires the handle's focus() to term.focus() via useImperativeHandle", () => {
    expect(xtermPaneSource).toMatch(/useImperativeHandle/);
    expect(xtermPaneSource).toMatch(
      /focus:\s*\(\)\s*=>\s*termRef\.current\?\.focus\(\)/,
    );
  });
});

/**
 * The focus effect's source text — the region the WP4 spurious-prompt guard actually governs.
 *
 * Anchored on `if (!visible) return;`, the effect's own early-return guard (which a sibling test
 * asserts independently), and terminated at the effect's closing `}, [visible]);`. Anchoring on
 * content rather than on a line number or an ordinal `useEffect` occurrence matters: `Workspace.tsx`
 * has several effects and Phase 5 added another, so "the Nth useEffect" would silently retarget.
 *
 * ⚠️ Throws rather than returning `""` when the anchors are gone. A slice that quietly yields an
 * empty string makes `not.toMatch(...)` pass vacuously — the positional-`?raw`-slicing hole this
 * repo has hit three times (`SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`,
 * `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`).
 */
function extractFocusEffect(source: string): string {
  const start = source.indexOf("if (!visible) return;");
  if (start === -1) {
    throw new Error(
      "could not locate the focus effect's `if (!visible) return;` anchor in Workspace.tsx. " +
        "If the effect was reshaped, update this extractor DELIBERATELY — it is what scopes the " +
        "WP4 spurious-prompt guard to the focus path.",
    );
  }
  const end = source.indexOf("}, [visible]);", start);
  if (end === -1) {
    throw new Error(
      "found the focus effect's start but not its `}, [visible]);` terminator in Workspace.tsx.",
    );
  }
  return source.slice(start, end);
}

describe("the focus-effect extractor fails loudly rather than scanning nothing", () => {
  it("throws when the start anchor is missing", () => {
    // Proves the `throw` is reachable, so a reshaped effect surfaces as an explicit failure
    // instead of an assertion that matched an empty string.
    expect(() => extractFocusEffect("const x = 1;")).toThrow(
      /could not locate/,
    );
  });

  it("throws when the terminator is missing", () => {
    expect(() => extractFocusEffect("if (!visible) return;")).toThrow(
      /not its/,
    );
  });

  it("returns only the effect, not the whole file", () => {
    // The slice must be a strict subset — otherwise the narrowing is cosmetic and the guard
    // still scans everything.
    const sliced = extractFocusEffect(workspaceSource);
    expect(sliced.length).toBeGreaterThan(0);
    expect(sliced.length).toBeLessThan(workspaceSource.length / 4);
  });
});

describe("Workspace auto-focuses the CC pane on the visible edge (QoL-WP3 P1.2)", () => {
  it("holds a ref to the CC pane and passes it to the LEFT-half XtermPane", () => {
    expect(workspaceSource).toMatch(
      /ccPaneRef\s*=\s*useRef<\s*XtermPaneHandle\s*>\(null\)/,
    );
    expect(workspaceSource).toMatch(/ref=\{ccPaneRef\}/);
  });

  it("focuses only when visible (the false→true promote edge), never a background", () => {
    // The effect must early-return when not visible — a background workspace must not
    // steal focus. `if (!visible) return;` inside the focus effect is the guard.
    expect(workspaceSource).toMatch(/if\s*\(!visible\)\s*return;/);
    // And it must call the pane's focus() (deferred); the rAF mirrors XtermPane's pattern.
    expect(workspaceSource).toMatch(/ccPaneRef\.current\?\.focus\(\)/);
  });

  it("does NOT send any byte to the PTY on focus (no WP4 spurious-prompt regression)", () => {
    // The focus path must never write input. The PTY-write seam is `cc_input` (the only
    // byte-write invoke), so its absence in the FOCUS EFFECT is the primary guard.
    //
    // ⚠️ NARROWED at M12 WP3 Phase 5, from a whole-file `not.toMatch(/cc_input/)` scan.
    // Read the reason before widening it back: this test's contract (its own header, failure
    // mode 3) is *"someone adds a PTY write ON FOCUS"* — and `Workspace.tsx` now contains a
    // LEGITIMATE `cc_input`, the manual `/session-start` button, which fires on an explicit
    // click and is required by WP3's Acceptance Criteria. The whole-file scan was a sound
    // approximation only while no legitimate write existed; Phase 5 is the first, which is
    // exactly when an over-broad guard surfaces as a false failure.
    //
    // So the scan is scoped to the focus effect itself. A `cc_input` inside it still fails
    // (the WP4 class stays guarded); one on a click handler passes. Mutation-proven in BOTH
    // directions — narrowing a guard is the move most likely to quietly disable one.
    // Full triage in the WIP under "Test Triage — autofocusCcOnPromote.test.ts (Phase 5)".
    const focusEffect = extractFocusEffect(workspaceSource);
    expect(focusEffect).not.toMatch(/cc_input/);
    // Meta-guard: if the slice ever stops finding the effect it must FAIL LOUDLY rather than
    // scan an empty string and pass vacuously — the exact hole a positional `?raw` slice
    // creates (this repo has been bitten by it three times).
    expect(focusEffect).toContain("ccPaneRef.current?.focus()");
    // Scoped newline check: a stray \r/\n is only a regression if it rides a PTY-write
    // call, so assert no `invoke(...)`/`cc_`-write line in Workspace carries one — rather
    // than the old whole-file scan, which a future unrelated \n literal (a tooltip, a
    // multiline template) would trip with a misleading "spurious-prompt regression".
    const ptyWriteWithNewline =
      /(?:invoke\(\s*["'`]cc_|cc_input|cc_write)[^\n]*\\(?:r\\n|r|n)/;
    expect(workspaceSource).not.toMatch(ptyWriteWithNewline);
  });
});
