import { describe, expect, it } from "vitest";
import { isAutoSubmitChord, isStageOnlyChord } from "../promptSendChord";
import type { ChordEvent } from "../../chordEvent";

// F-a WP4 Phase 2 (task 4.2) — the send chords' disjointness.
//
// ⚠️ The property that matters is not "⌘↵ returns true" but that the two predicates are
// MUTUALLY EXCLUSIVE and inert everywhere else. A send has no undo (`injectCommand` has no
// retry and no pre-send cancel window), so a predicate that fires one key too widely is an
// unrecoverable write into a live conversation.

/** A keydown with everything off unless overridden. */
function ev(over: Partial<ChordEvent>): ChordEvent {
  return { metaKey: false, shiftKey: false, key: "a", ...over };
}

describe("isAutoSubmitChord — ⌘↵", () => {
  it("matches ⌘ + Enter with Shift absent", () => {
    expect(isAutoSubmitChord(ev({ metaKey: true, key: "Enter" }))).toBe(true);
  });

  it("does NOT match when Shift is held — that is the other mode", () => {
    // The disjointness that keeps stage-only from submitting.
    expect(
      isAutoSubmitChord(ev({ metaKey: true, shiftKey: true, key: "Enter" })),
    ).toBe(false);
  });

  it("does NOT match bare Enter — the key that inserts a newline in the buffer", () => {
    // ⚠️ THE MOST IMPORTANT NEGATIVE IN THIS FILE. The panel is a PROSE buffer; bare Enter
    // must insert a line break. If this matched, every paragraph break would fire a send.
    expect(isAutoSubmitChord(ev({ key: "Enter" }))).toBe(false);
  });

  it("is permissive on Ctrl and Alt", () => {
    expect(
      isAutoSubmitChord(
        ev({ metaKey: true, key: "Enter", ctrlKey: true, altKey: true }),
      ),
    ).toBe(true);
  });

  it("does NOT match any other key with ⌘ held", () => {
    // Swept rather than spot-checked: the defect guarded is "someone loosens the key test".
    for (const key of [
      "a",
      "t",
      "w",
      "1",
      "9",
      "Escape",
      "Tab",
      " ",
      "Return",
    ]) {
      expect(isAutoSubmitChord(ev({ metaKey: true, key })), key).toBe(false);
    }
  });
});

describe("isStageOnlyChord — ⇧⌘↵", () => {
  it("matches ⌘ + Shift + Enter", () => {
    expect(
      isStageOnlyChord(ev({ metaKey: true, shiftKey: true, key: "Enter" })),
    ).toBe(true);
  });

  it("does NOT match without Shift — that is the auto-submit mode", () => {
    expect(isStageOnlyChord(ev({ metaKey: true, key: "Enter" }))).toBe(false);
  });

  it("does NOT match bare Shift+Enter (no ⌘)", () => {
    // Shift+Enter is an ordinary newline in many editors; it must not send.
    expect(isStageOnlyChord(ev({ shiftKey: true, key: "Enter" }))).toBe(false);
  });

  it("does NOT match ⌘⇧ + any other key", () => {
    // ⚠️ ⌘⇧+DIGIT is reserved for filmstrip workspace switching, and ⌘⇧E/D/T/K/O are
    // panel-select. A stage-only predicate that ignored `key` would hijack all of them.
    for (const key of ["1", "9", "E", "D", "T", "K", "O", "P", "F", "N"]) {
      expect(
        isStageOnlyChord(ev({ metaKey: true, shiftKey: true, key })),
        key,
      ).toBe(false);
    }
  });
});

describe("the two are mutually exclusive", () => {
  it("no event satisfies both", () => {
    // Exhaustive over the modifier cube for the Enter key — the only key either can match.
    for (const metaKey of [false, true]) {
      for (const shiftKey of [false, true]) {
        for (const ctrlKey of [false, true]) {
          const e = ev({ metaKey, shiftKey, ctrlKey, key: "Enter" });
          expect(
            isAutoSubmitChord(e) && isStageOnlyChord(e),
            JSON.stringify({ metaKey, shiftKey, ctrlKey }),
          ).toBe(false);
        }
      }
    }
  });

  it("⌘-Enter matches exactly one of them, by Shift", () => {
    const auto = ev({ metaKey: true, key: "Enter" });
    const stage = ev({ metaKey: true, shiftKey: true, key: "Enter" });
    expect([isAutoSubmitChord(auto), isStageOnlyChord(auto)]).toEqual([
      true,
      false,
    ]);
    expect([isAutoSubmitChord(stage), isStageOnlyChord(stage)]).toEqual([
      false,
      true,
    ]);
  });
});
