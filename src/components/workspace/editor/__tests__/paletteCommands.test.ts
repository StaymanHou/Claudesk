import { describe, expect, it } from "vitest";
import {
  filterCommands,
  isPaletteChord,
  type PaletteCommand,
} from "../paletteCommands";
import { isSublimeChord } from "../../../../sublime/chord";
import { panelForChord } from "../../panelHost";

const cmd = (id: string, title: string): PaletteCommand => ({
  id,
  title,
  run: () => {},
});

describe("isPaletteChord", () => {
  it("matches Cmd+Shift+P (lowercase key)", () => {
    expect(isPaletteChord({ metaKey: true, shiftKey: true, key: "p" })).toBe(
      true,
    );
  });

  it("matches Cmd+Shift+P when Shift uppercases the key to 'P'", () => {
    expect(isPaletteChord({ metaKey: true, shiftKey: true, key: "P" })).toBe(
      true,
    );
  });

  it("does NOT match bare Cmd+P (WP6's fuzzy-finder chord — must stay distinct)", () => {
    expect(isPaletteChord({ metaKey: true, shiftKey: false, key: "p" })).toBe(
      false,
    );
  });

  it("does not match without Cmd", () => {
    expect(isPaletteChord({ metaKey: false, shiftKey: true, key: "p" })).toBe(
      false,
    );
  });

  it("does not match a different ⌘⇧ key (e.g. ⌘⇧E, the WP5 Editor-panel chord)", () => {
    expect(isPaletteChord({ metaKey: true, shiftKey: true, key: "e" })).toBe(
      false,
    );
  });

  // WP3b Phase 2 (extended WP5) — chord-exclusivity guarantee. The palette listener
  // is a capture-phase document handler that returns early for any chord where
  // isPaletteChord is false (so the editor's CM6 chords pass through untouched).
  // This matrix is the codified contract that ⌘⇧P collides with none of the chords
  // the editor / app already own — so WP5 (panel-select ⌘⇧E/D/T), WP6 (⌘P), the CM6
  // editing chords, and the Sublime pop (⌘⇧O) all coexist with the palette.
  it("rejects every other editor/app chord (no collision)", () => {
    const otherChords = [
      {
        name: "Cmd+P (WP6 fuzzy finder)",
        e: { metaKey: true, shiftKey: false, key: "p" },
      },
      { name: "Cmd+F (find)", e: { metaKey: true, shiftKey: false, key: "f" } },
      {
        name: "Cmd+R (replace)",
        e: { metaKey: true, shiftKey: false, key: "r" },
      },
      { name: "Cmd+S (save)", e: { metaKey: true, shiftKey: false, key: "s" } },
      {
        name: "Cmd+D (select-next)",
        e: { metaKey: true, shiftKey: false, key: "d" },
      },
      {
        name: "Cmd+= (zoom in)",
        e: { metaKey: true, shiftKey: false, key: "=" },
      },
      {
        name: "Cmd+Shift+E (WP5 Editor panel)",
        e: { metaKey: true, shiftKey: true, key: "e" },
      },
      {
        name: "Cmd+Shift+D (WP5 Diff panel)",
        e: { metaKey: true, shiftKey: true, key: "d" },
      },
      {
        name: "Cmd+Shift+T (WP5 Terminal panel)",
        e: { metaKey: true, shiftKey: true, key: "t" },
      },
      {
        name: "Cmd+Shift+O (Sublime Text pop)",
        e: { metaKey: true, shiftKey: true, key: "o" },
      },
      {
        name: "plain p (typing)",
        e: { metaKey: false, shiftKey: false, key: "p" },
      },
      {
        name: "Shift+P (typing capital P)",
        e: { metaKey: false, shiftKey: true, key: "P" },
      },
    ];
    for (const { name, e } of otherChords) {
      expect(isPaletteChord(e), `${name} must NOT be the palette chord`).toBe(
        false,
      );
    }
  });
});

// WP5 — cross-predicate exclusivity: the four app-level ⌘⇧ chords (palette, Sublime
// pop, and the three panel-select chords) must partition cleanly — no single keydown
// is claimed by more than one predicate. This is the codified contract that the
// RightPanelHost capture-phase listener, the palette listener, and the Sublime
// keydown handler never double-fire on the same event.
describe("app-level ⌘⇧ chord exclusivity (WP5)", () => {
  const chords = [
    { name: "⌘⇧P palette", e: { metaKey: true, shiftKey: true, key: "p" } },
    { name: "⌘⇧O Sublime", e: { metaKey: true, shiftKey: true, key: "o" } },
    { name: "⌘⇧E Editor", e: { metaKey: true, shiftKey: true, key: "e" } },
    { name: "⌘⇧D Diff", e: { metaKey: true, shiftKey: true, key: "d" } },
    { name: "⌘⇧T Terminal", e: { metaKey: true, shiftKey: true, key: "t" } },
  ];

  for (const { name, e } of chords) {
    it(`${name} is claimed by exactly one predicate`, () => {
      const claims = [
        isPaletteChord(e),
        isSublimeChord(e),
        panelForChord(e) !== null,
      ].filter(Boolean).length;
      expect(claims, `${name} must be owned by exactly one handler`).toBe(1);
    });
  }
});

describe("filterCommands", () => {
  const commands = [
    cmd("syntax.ts", "Set Syntax: TypeScript"),
    cmd("syntax.rust", "Set Syntax: Rust"),
    cmd("syntax.md", "Set Syntax: Markdown"),
    cmd("syntax.plain", "Set Syntax: Plain Text"),
  ];

  it("returns the full list for an empty query", () => {
    expect(filterCommands(commands, "")).toEqual(commands);
  });

  it("returns the full list for a whitespace-only query", () => {
    expect(filterCommands(commands, "   ")).toEqual(commands);
  });

  it("substring-matches case-insensitively on title", () => {
    const out = filterCommands(commands, "rust");
    expect(out.map((c) => c.id)).toEqual(["syntax.rust"]);
  });

  it("matches across the whole title, not just the start", () => {
    // "text" only appears in "Plain Text"
    expect(filterCommands(commands, "text").map((c) => c.id)).toEqual([
      "syntax.plain",
    ]);
  });

  it("preserves registry order in the filtered result", () => {
    const out = filterCommands(commands, "syntax");
    expect(out.map((c) => c.id)).toEqual([
      "syntax.ts",
      "syntax.rust",
      "syntax.md",
      "syntax.plain",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommands(commands, "python")).toEqual([]);
  });
});
