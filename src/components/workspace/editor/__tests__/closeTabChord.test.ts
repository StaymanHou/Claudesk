// WP13 — tests for the pure ⌘W close-active-tab chord predicate.

import { describe, it, expect } from "vitest";
import { isCloseTabChord } from "../closeTabChord";

describe("isCloseTabChord", () => {
  it("matches bare ⌘W (lowercase and uppercase key value)", () => {
    expect(isCloseTabChord({ metaKey: true, shiftKey: false, key: "w" })).toBe(
      true,
    );
    expect(isCloseTabChord({ metaKey: true, shiftKey: false, key: "W" })).toBe(
      true,
    );
  });

  it("requires Cmd", () => {
    expect(isCloseTabChord({ metaKey: false, shiftKey: false, key: "w" })).toBe(
      false,
    );
  });

  it("requires Shift to be ABSENT (disjoint from the ⌘⇧ family, e.g. ⌘⇧W)", () => {
    expect(isCloseTabChord({ metaKey: true, shiftKey: true, key: "w" })).toBe(
      false,
    );
  });

  it("is disjoint from the other app chords (⌘P finder, ⌘1 tab-switch, ⌘⇧E panel)", () => {
    expect(isCloseTabChord({ metaKey: true, shiftKey: false, key: "p" })).toBe(
      false,
    );
    expect(isCloseTabChord({ metaKey: true, shiftKey: false, key: "1" })).toBe(
      false,
    );
    expect(isCloseTabChord({ metaKey: true, shiftKey: true, key: "e" })).toBe(
      false,
    );
  });

  it("does not fire on a bare W keypress (no Cmd)", () => {
    expect(isCloseTabChord({ metaKey: false, shiftKey: false, key: "W" })).toBe(
      false,
    );
  });
});
