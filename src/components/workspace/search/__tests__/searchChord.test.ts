import { describe, it, expect } from "vitest";
import { isSearchChord } from "../searchChord";
import { isFinderChord } from "../../finder/finderChord";
import { isPaletteChord } from "../../editor/paletteCommands";
import { panelForChord } from "../../panelHost";

// Chord-exclusivity matrix for ⌘⇧F (project search): it must never collide with the
// bare ⌘F in-file find (CM6), ⌘P (finder), ⌘⇧P (palette), or the ⌘⇧E/D/T panel
// chords. These pin the boundaries (the codified counterpart to the chord-ownership
// map in editor/paletteCommands.ts).

describe("isSearchChord — Cmd+Shift+F", () => {
  it("matches Cmd+Shift+F", () => {
    expect(isSearchChord({ metaKey: true, shiftKey: true, key: "F" })).toBe(
      true,
    );
  });

  it("does NOT match bare Cmd+F (that is CM6's in-file find)", () => {
    expect(isSearchChord({ metaKey: true, shiftKey: false, key: "f" })).toBe(
      false,
    );
  });

  it("does NOT match plain 'f' without Cmd", () => {
    expect(isSearchChord({ metaKey: false, shiftKey: true, key: "F" })).toBe(
      false,
    );
  });

  it("does NOT match Cmd+Shift+ another key", () => {
    expect(isSearchChord({ metaKey: true, shiftKey: true, key: "E" })).toBe(
      false,
    );
  });

  it("is case-insensitive on the key (defensive)", () => {
    expect(isSearchChord({ metaKey: true, shiftKey: true, key: "f" })).toBe(
      true,
    );
  });
});

describe("chord exclusivity — no two predicates fire on one event", () => {
  it("⌘⇧F fires search ONLY (not finder, not palette, not a panel chord)", () => {
    const e = { metaKey: true, shiftKey: true, key: "F" };
    expect(isSearchChord(e)).toBe(true);
    expect(isFinderChord(e)).toBe(false);
    expect(isPaletteChord(e)).toBe(false);
    expect(panelForChord(e)).toBeNull();
  });

  it("bare ⌘F (CM6 in-file find) fires NONE of the app-level predicates", () => {
    const e = { metaKey: true, shiftKey: false, key: "f" };
    expect(isSearchChord(e)).toBe(false);
    expect(isFinderChord(e)).toBe(false);
    expect(isPaletteChord(e)).toBe(false);
    expect(panelForChord(e)).toBeNull();
  });

  it("⌘P (finder) does NOT fire search", () => {
    const e = { metaKey: true, shiftKey: false, key: "p" };
    expect(isSearchChord(e)).toBe(false);
    expect(isFinderChord(e)).toBe(true);
  });

  it("⌘⇧E (Editor panel) does NOT fire search", () => {
    const e = { metaKey: true, shiftKey: true, key: "E" };
    expect(isSearchChord(e)).toBe(false);
    expect(panelForChord(e)).toBe("editor");
  });
});
