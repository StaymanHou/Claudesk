import { describe, it, expect } from "vitest";
import {
  deriveRightSurface,
  TERM_PANE_SELECTOR,
} from "../rightSurface";

// The vitest env is node (no DOM — vite.config.ts has no jsdom environment), so we
// duck-type the bit deriveRightSurface reads: a `closest(sel)` that resolves to the
// term-pane host (or null). Mirrors focusHalf.test.ts's fake-node approach without
// standing up jsdom.

/** A fake event target whose `closest(selector)` resolves to a node iff `inTerm`. */
function targetIn(inTerm: boolean): EventTarget {
  return {
    closest: (selector: string) =>
      selector === TERM_PANE_SELECTOR && inTerm ? {} : null,
  } as unknown as EventTarget;
}

describe("deriveRightSurface", () => {
  it("returns 'terminal' for a target inside the term-pane", () => {
    expect(deriveRightSurface(targetIn(true))).toBe("terminal");
  });

  it("returns 'other' for a target NOT inside the term-pane (editor/diff/tree)", () => {
    expect(deriveRightSurface(targetIn(false))).toBe("other");
  });

  it("returns 'other' for a null target (focus left the workspace)", () => {
    expect(deriveRightSurface(null)).toBe("other");
  });

  it("returns 'other' for a non-Element target (no closest — window/document)", () => {
    expect(deriveRightSurface({} as EventTarget)).toBe("other");
    expect(deriveRightSurface(globalThis as unknown as EventTarget)).toBe(
      "other",
    );
  });

  it("uses the term-pane testid selector (not the CC pane)", () => {
    // Guard: the selector must target the SECOND terminal's testId ("term-pane"),
    // not the left CC pane ("xterm-pane") — routing to the wrong pane would zoom CC
    // while focus is in the right-panel terminal.
    expect(TERM_PANE_SELECTOR).toBe('[data-testid="term-pane"]');
  });
});
