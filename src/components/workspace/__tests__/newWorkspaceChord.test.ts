import { describe, it, expect } from "vitest";
import { newWorkspaceChord } from "../newWorkspaceChord";

const chord = (over: Partial<Parameters<typeof newWorkspaceChord>[0]>) => ({
  metaKey: false,
  shiftKey: false,
  key: "n",
  ...over,
});

describe("newWorkspaceChord", () => {
  it("matches ⌘⇧N (lowercase key)", () => {
    expect(newWorkspaceChord(chord({ metaKey: true, shiftKey: true, key: "n" }))).toBe(
      true,
    );
  });

  it("matches ⌘⇧N when macOS reports the shifted uppercase key", () => {
    expect(newWorkspaceChord(chord({ metaKey: true, shiftKey: true, key: "N" }))).toBe(
      true,
    );
  });

  it("requires Shift — disjoint from the bare ⌘N editor new-file chord", () => {
    expect(newWorkspaceChord(chord({ metaKey: true, key: "n" }))).toBe(false);
  });

  it("requires Meta (no bare Shift+N)", () => {
    expect(newWorkspaceChord(chord({ shiftKey: true, key: "n" }))).toBe(false);
  });

  it("ignores plain 'n' with no modifiers", () => {
    expect(newWorkspaceChord(chord({ key: "n" }))).toBe(false);
  });

  it("ignores other ⌘⇧-letter chords (⌘⇧E)", () => {
    expect(newWorkspaceChord(chord({ metaKey: true, shiftKey: true, key: "e" }))).toBe(
      false,
    );
  });

  it("ignores ⌘⇧+digit (the filmstrip switch chord)", () => {
    expect(newWorkspaceChord(chord({ metaKey: true, shiftKey: true, key: "1" }))).toBe(
      false,
    );
  });

  it("is permissive on Ctrl/Alt (only Meta+Shift+'n' defines the chord)", () => {
    expect(newWorkspaceChord({ metaKey: true, shiftKey: true, key: "N" })).toBe(true);
  });
});
