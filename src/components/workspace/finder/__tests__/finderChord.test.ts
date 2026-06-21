import { describe, it, expect } from "vitest";
import { isFinderChord } from "../finderChord";
import { isPaletteChord } from "../../editor/paletteCommands";
import { panelForChord } from "../../panelHost";

// Chord-exclusivity matrix: ⌘P (finder) must never collide with ⌘⇧P (palette) or
// the ⌘⇧E/D/T panel-select chords. These tests pin the boundaries (the codified
// counterpart to the chord-ownership map in paletteCommands.ts).

describe("isFinderChord — bare Cmd+P", () => {
  it("matches bare Cmd+P (no shift)", () => {
    expect(isFinderChord({ metaKey: true, shiftKey: false, key: "p" })).toBe(
      true,
    );
  });

  it("does NOT match Cmd+Shift+P (that is the palette)", () => {
    expect(isFinderChord({ metaKey: true, shiftKey: true, key: "P" })).toBe(
      false,
    );
  });

  it("does NOT match plain 'p' without Cmd", () => {
    expect(isFinderChord({ metaKey: false, shiftKey: false, key: "p" })).toBe(
      false,
    );
  });

  it("does NOT match Cmd + another key", () => {
    expect(isFinderChord({ metaKey: true, shiftKey: false, key: "e" })).toBe(
      false,
    );
  });

  it("is case-insensitive on the key (defensive)", () => {
    expect(isFinderChord({ metaKey: true, shiftKey: false, key: "P" })).toBe(
      true,
    );
  });
});

describe("chord exclusivity — no two predicates fire on one event", () => {
  it("bare ⌘P fires finder ONLY (not palette, not a panel chord)", () => {
    const e = { metaKey: true, shiftKey: false, key: "p" };
    expect(isFinderChord(e)).toBe(true);
    expect(isPaletteChord(e)).toBe(false);
    expect(panelForChord(e)).toBeNull();
  });

  it("⌘⇧P fires palette ONLY (not finder)", () => {
    const e = { metaKey: true, shiftKey: true, key: "P" };
    expect(isPaletteChord(e)).toBe(true);
    expect(isFinderChord(e)).toBe(false);
  });

  it("⌘⇧E fires the Editor panel chord ONLY (not finder)", () => {
    const e = { metaKey: true, shiftKey: true, key: "E" };
    expect(panelForChord(e)).toBe("editor");
    expect(isFinderChord(e)).toBe(false);
  });
});
