import { describe, it, expect } from "vitest";
import { workspaceSwitchIndex } from "../workspaceSwitchChord";

const chord = (over: Partial<Parameters<typeof workspaceSwitchIndex>[0]>) => ({
  metaKey: false,
  shiftKey: false,
  key: "1",
  ...over,
});

describe("workspaceSwitchIndex", () => {
  it("returns the 1-based digit for ⌘⇧1..⌘⇧9", () => {
    for (let n = 1; n <= 9; n++) {
      expect(
        workspaceSwitchIndex(
          chord({ metaKey: true, shiftKey: true, key: String(n) }),
        ),
      ).toBe(n);
    }
  });

  it("requires Meta (no bare Shift+digit)", () => {
    expect(
      workspaceSwitchIndex(chord({ shiftKey: true, key: "2" })),
    ).toBeNull();
  });

  it("requires Shift — disjoint from the bare ⌘+digit editor tab chord", () => {
    expect(workspaceSwitchIndex(chord({ metaKey: true, key: "2" }))).toBeNull();
  });

  it("ignores ⌘⇧0 (0 is not a valid 1-based index)", () => {
    expect(
      workspaceSwitchIndex(chord({ metaKey: true, shiftKey: true, key: "0" })),
    ).toBeNull();
  });

  it("ignores non-digit keys", () => {
    expect(
      workspaceSwitchIndex(chord({ metaKey: true, shiftKey: true, key: "e" })),
    ).toBeNull();
    expect(
      workspaceSwitchIndex(
        chord({ metaKey: true, shiftKey: true, key: "Enter" }),
      ),
    ).toBeNull();
  });

  it("is permissive on Ctrl/Alt (only Meta+Shift+digit defines the chord)", () => {
    expect(
      workspaceSwitchIndex({
        metaKey: true,
        shiftKey: true,
        key: "3",
      }),
    ).toBe(3);
  });
});
