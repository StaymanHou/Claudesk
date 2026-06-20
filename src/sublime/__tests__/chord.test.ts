import { describe, expect, it } from "vitest";
import { isSublimeChord } from "../chord";

// WP5: the Sublime-Text-pop chord moved ⌘⇧E → ⌘⇧O (⌘⇧E is now the Editor panel).
describe("isSublimeChord", () => {
  it("matches Cmd+Shift+O (lowercase key)", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "o" })).toBe(
      true,
    );
  });

  it("matches Cmd+Shift+O when Shift uppercases the key to 'O'", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "O" })).toBe(
      true,
    );
  });

  it("does not match without Cmd", () => {
    expect(isSublimeChord({ metaKey: false, shiftKey: true, key: "o" })).toBe(
      false,
    );
  });

  it("does not match without Shift", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: false, key: "o" })).toBe(
      false,
    );
  });

  it("does not match the old ⌘⇧E chord (now the Editor panel)", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "e" })).toBe(
      false,
    );
  });

  it("does not match a different key", () => {
    expect(isSublimeChord({ metaKey: true, shiftKey: true, key: "r" })).toBe(
      false,
    );
  });
});
