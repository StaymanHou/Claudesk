// WP12 — tests for the pure ⌘1..⌘9 tab-switch chord predicate.

import { describe, it, expect } from "vitest";
import { tabSwitchIndex } from "../tabSwitchChord";

describe("tabSwitchIndex", () => {
  it("returns the digit for bare ⌘1..⌘9", () => {
    for (let n = 1; n <= 9; n++) {
      expect(
        tabSwitchIndex({ metaKey: true, shiftKey: false, key: String(n) }),
      ).toBe(n);
    }
  });

  it("ignores ⌘0 (font-reset, not a tab chord)", () => {
    expect(
      tabSwitchIndex({ metaKey: true, shiftKey: false, key: "0" }),
    ).toBeNull();
  });

  it("requires Cmd", () => {
    expect(
      tabSwitchIndex({ metaKey: false, shiftKey: false, key: "1" }),
    ).toBeNull();
  });

  it("requires Shift to be ABSENT (keeps it disjoint from the ⌘⇧ family)", () => {
    expect(
      tabSwitchIndex({ metaKey: true, shiftKey: true, key: "1" }),
    ).toBeNull();
  });

  it("ignores non-digit keys", () => {
    expect(
      tabSwitchIndex({ metaKey: true, shiftKey: false, key: "p" }),
    ).toBeNull();
    expect(
      tabSwitchIndex({ metaKey: true, shiftKey: false, key: "=" }),
    ).toBeNull();
  });
});
