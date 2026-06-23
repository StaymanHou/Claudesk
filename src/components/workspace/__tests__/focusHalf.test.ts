import { describe, it, expect } from "vitest";
import { deriveFocusHalf } from "../focusHalf";

// The vitest env is node (no DOM — see vite.config.ts has no jsdom environment), so we
// duck-type the bits deriveFocusHalf reads: a `closest(sel)` that resolves to the owning
// half element, and that half's `classList.contains`. This mirrors the real DOM contract
// (`closest()` walks ancestors to the nearest match) without standing up jsdom.

/** Build a fake half element (.workspace-left or .workspace-right). */
function half(cls: "workspace-left" | "workspace-right") {
  return {
    classList: { contains: (c: string) => c === cls },
  };
}

/** A fake event target whose `closest(selector)` resolves to `owningHalf` (or null). */
function targetIn(owningHalf: ReturnType<typeof half> | null): EventTarget {
  return {
    closest: (selector: string) =>
      selector === ".workspace-left, .workspace-right" ? owningHalf : null,
  } as unknown as EventTarget;
}

describe("deriveFocusHalf", () => {
  it("returns 'left' for a target inside .workspace-left", () => {
    expect(deriveFocusHalf(targetIn(half("workspace-left")))).toBe("left");
  });

  it("returns 'right' for a target inside .workspace-right", () => {
    expect(deriveFocusHalf(targetIn(half("workspace-right")))).toBe("right");
  });

  it("returns 'none' for a target inside neither half (closest finds no match)", () => {
    expect(deriveFocusHalf(targetIn(null))).toBe("none");
  });

  it("returns 'none' for a null target (focus left the workspace entirely)", () => {
    expect(deriveFocusHalf(null)).toBe("none");
  });

  it("returns 'none' for a non-Element target (no closest method — e.g. window/document)", () => {
    // focusout.relatedTarget can be null; a stray non-Element EventTarget (window) has
    // no closest() — must narrow to none rather than throw.
    expect(deriveFocusHalf({} as EventTarget)).toBe("none");
    expect(deriveFocusHalf(globalThis as unknown as EventTarget)).toBe("none");
  });
});
