import { describe, expect, it } from "vitest";
import {
  filterCommands,
  isPaletteChord,
  type PaletteCommand,
} from "../paletteCommands";
import { panelForChord } from "../../panelHost";
import { isFinderChord } from "../../finder/finderChord";
import { isSearchChord } from "../../search/searchChord";
import { tabSwitchIndex } from "../tabSwitchChord";

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
        name: "Cmd+Shift+O (F-a WP3 Prompt panel)",
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

// WP5/WP8 — cross-predicate exclusivity: the app-level ⌘⇧ chords (palette + the
// ungated panel-select chords) must partition cleanly — no single keydown is claimed
// by more than one predicate. This is the codified contract that the RightPanelHost
// capture-phase listener and the palette listener never double-fire on the same
// event. WP8 deleted the Sublime-Text ⌘⇧O chord (both Sublime launchers are now
// click-only buttons), and F-a WP3 CLAIMED the freed letter for the Prompt panel.
describe("app-level ⌘⇧ chord exclusivity (WP5/WP8)", () => {
  const chords = [
    { name: "⌘⇧P palette", e: { metaKey: true, shiftKey: true, key: "p" } },
    { name: "⌘⇧E Editor", e: { metaKey: true, shiftKey: true, key: "e" } },
    { name: "⌘⇧D Diff", e: { metaKey: true, shiftKey: true, key: "d" } },
    { name: "⌘⇧O Prompt", e: { metaKey: true, shiftKey: true, key: "o" } },
    { name: "⌘⇧T Terminal", e: { metaKey: true, shiftKey: true, key: "t" } },
  ];

  for (const { name, e } of chords) {
    it(`${name} is claimed by exactly one predicate`, () => {
      const claims = [isPaletteChord(e), panelForChord(e) !== null].filter(
        Boolean,
      ).length;
      expect(claims, `${name} must be owned by exactly one handler`).toBe(1);
    });
  }

  it("⌘⇧O now resolves to the Prompt panel (F-a WP3 claimed the letter WP8 freed)", () => {
    // ⚠️ THIS ASSERTION WAS INVERTED, not deleted. It previously read "⌘⇧O is freed —
    // claimed by no predicate", pinning the post-WP8 vacancy. A freed chord staying free
    // forever was never the invariant; "exactly one predicate claims it" is, and a vacancy
    // is just the zero case of that. F-a WP3 fills it, so the same property is now
    // asserted with a count of 1 and an explicit owner.
    //
    // Naming the owner (not merely counting) is what makes this bite: a future chord that
    // stole ⌘⇧O from the Prompt panel would keep the count at 1 and slip through a
    // count-only check.
    const e = { metaKey: true, shiftKey: true, key: "o" };
    const claims = [isPaletteChord(e), panelForChord(e) !== null].filter(
      Boolean,
    ).length;
    expect(claims, "⌘⇧O must be owned by exactly one handler").toBe(1);
    expect(panelForChord(e), "⌘⇧O must resolve to the Prompt panel").toBe(
      "prompt",
    );
  });
});

// WP12 — the ⌘1..⌘9 editor-tab-switch chord must be claimed by EXACTLY ONE handler
// across the whole app-level chord set (palette + panel-select + finder + search +
// tab-switch). Bare ⌘+digit is disjoint from every ⌘⇧ chord and from bare ⌘P/F/etc.,
// so a digit keydown fires only tabSwitchIndex and a letter keydown never fires it.
describe("⌘1..⌘9 tab-switch chord exclusivity (WP12)", () => {
  // Every predicate that the RightPanelHost capture-phase listener consults, plus the
  // palette listener. tabSwitchIndex !== null is its "claims" test.
  const claimCount = (e: {
    metaKey: boolean;
    shiftKey: boolean;
    key: string;
  }) =>
    [
      isPaletteChord(e),
      panelForChord(e) !== null,
      isFinderChord(e),
      isSearchChord(e),
      tabSwitchIndex(e) !== null,
    ].filter(Boolean).length;

  for (let n = 1; n <= 9; n++) {
    it(`⌘${n} is claimed by exactly one handler (tab-switch) and yields ${n}`, () => {
      const e = { metaKey: true, shiftKey: false, key: String(n) };
      expect(tabSwitchIndex(e)).toBe(n);
      expect(claimCount(e), `⌘${n} must be owned by exactly one handler`).toBe(
        1,
      );
    });
  }

  it("⌘0 is NOT a tab chord (stays the CM6 font-reset) — claimed by no app predicate", () => {
    const e = { metaKey: true, shiftKey: false, key: "0" };
    expect(tabSwitchIndex(e)).toBeNull();
    expect(claimCount(e)).toBe(0);
  });

  it("the app letter chords do NOT fire tab-switch", () => {
    const letters = [
      { metaKey: true, shiftKey: false, key: "p" }, // finder
      { metaKey: true, shiftKey: true, key: "p" }, // palette
      { metaKey: true, shiftKey: true, key: "e" }, // editor panel
      { metaKey: true, shiftKey: true, key: "o" }, // prompt panel
      { metaKey: true, shiftKey: true, key: "f" }, // search
    ];
    for (const e of letters) expect(tabSwitchIndex(e)).toBeNull();
  });

  // F-a WP3 — ⌘⇧O against the FULL predicate set, not just the two-predicate matrix
  // above. The narrower block proves prompt does not collide with the palette; this
  // proves it does not collide with the finder, the project search, or tab-switch
  // either. Worth its own assertion because ⌘⇧O is a REUSED letter (WP8 freed it), and
  // a reused chord is likelier to have a forgotten second claimant than a virgin one.
  it("⌘⇧O (prompt) is claimed by exactly one handler across every app predicate", () => {
    const e = { metaKey: true, shiftKey: true, key: "o" };
    expect(panelForChord(e)).toBe("prompt");
    expect(claimCount(e), "⌘⇧O must be owned by exactly one handler").toBe(1);
  });

  it("bare ⌘O is untouched by the prompt chord", () => {
    // The Shift requirement is what keeps the chord off the unshifted letter — the same
    // separation that keeps ⌘⇧E off bare ⌘E. Pinned explicitly because `panelForChord`
    // matches `key` case-insensitively, so only the `metaKey && shiftKey` guard stands
    // between this chord and every bare-⌘ binding on the same letter.
    const e = { metaKey: true, shiftKey: false, key: "o" };
    expect(panelForChord(e)).toBeNull();
    expect(
      claimCount(e),
      "bare ⌘O must be claimed by no app-level predicate",
    ).toBe(0);
  });
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
