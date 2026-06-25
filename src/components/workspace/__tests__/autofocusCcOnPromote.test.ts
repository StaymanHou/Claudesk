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
    // The focus path must never write input. If a future edit adds a cc_input / newline
    // in Workspace, this fails — the left CC pane must stay byte-clean on focus.
    expect(workspaceSource).not.toMatch(/cc_input/);
    expect(workspaceSource).not.toMatch(/\\r\\n|\\r|\\n/);
  });
});
