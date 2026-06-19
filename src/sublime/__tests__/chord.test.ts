import { describe, expect, it } from "vitest";
import { isSublimeChord } from "../chord";

describe("isSublimeChord", () => {
  it("matches Cmd+Shift+E (lowercase key)", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "e" })).toBe(
      true,
    );
  });

  it("matches Cmd+Shift+E when Shift uppercases the key to 'E'", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "E" })).toBe(
      true,
    );
  });

  it("does not match without Cmd", () => {
    expect(isSublimeChord({ metaKey: false, shiftKey: true, key: "e" })).toBe(
      false,
    );
  });

  it("does not match without Shift", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: false, key: "e" })).toBe(
      false,
    );
  });

  it("does not match a different key", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "r" })).toBe(
      false,
    );
  });
});
