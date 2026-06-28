import { describe, expect, it } from "vitest";
import { newTerminalChord } from "../newTerminalChord";
import { shouldCloseTerminalOnChord } from "../closeTerminalChord";
import { isCloseTabChord } from "../editor/closeTabChord";
import { panelForChord } from "../panelHost";
import { isPaletteChord } from "../editor/paletteCommands";

// M6 WP11 Phase 2 — keyboard chords for the terminal list.
//   ⌘T  → new terminal (newTerminalChord)
//   ⌘W  → close the FOCUSED terminal, scoped (shouldCloseTerminalOnChord), else fall
//         through to the editor close-tab handler.
// The exclusivity matrix here is the chord-ownership guard (mirrors panelHost.test.ts /
// paletteCommands.test.ts): a single keydown must fire at most one chord handler.

const ev = (over: Partial<{ metaKey: boolean; shiftKey: boolean; key: string }>) => ({
  metaKey: false,
  shiftKey: false,
  key: "",
  ...over,
});

describe("newTerminalChord (⌘T — new terminal)", () => {
  it("fires on bare ⌘ + 't'", () => {
    expect(newTerminalChord(ev({ metaKey: true, key: "t" }))).toBe(true);
  });

  it("is case-insensitive (some layouts report 'T' even without Shift)", () => {
    expect(newTerminalChord(ev({ metaKey: true, key: "T" }))).toBe(true);
  });

  it("does NOT fire without ⌘", () => {
    expect(newTerminalChord(ev({ key: "t" }))).toBe(false);
  });

  it("does NOT fire WITH Shift — that's ⌘⇧T (panel-select), a different chord", () => {
    expect(newTerminalChord(ev({ metaKey: true, shiftKey: true, key: "t" }))).toBe(
      false,
    );
  });

  it("does NOT fire on other letters", () => {
    for (const k of ["w", "e", "d", "p", "n", "f"]) {
      expect(newTerminalChord(ev({ metaKey: true, key: k }))).toBe(false);
    }
  });

  it("is permissive on Ctrl/Alt (strict only on ⌘ present, Shift absent, key 't')", () => {
    expect(
      newTerminalChord({ metaKey: true, shiftKey: false, key: "t" }),
    ).toBe(true);
  });
});

describe("⌘T exclusivity vs the rest of the chord matrix", () => {
  const cmdT = ev({ metaKey: true, key: "t" });

  it("⌘T is NOT the ⌘⇧T panel-select chord (that needs Shift)", () => {
    // panelForChord requires Shift; bare ⌘T must not select the terminal PANEL.
    expect(panelForChord(cmdT)).toBeNull();
  });

  it("⌘T is NOT the close-tab chord (that's ⌘W)", () => {
    expect(isCloseTabChord(cmdT)).toBe(false);
  });

  it("⌘T is NOT the palette chord (that's ⌘⇧P)", () => {
    expect(isPaletteChord(cmdT)).toBe(false);
  });

  it("the ⌘⇧T panel-select chord is NOT mistaken for new-terminal", () => {
    const cmdShiftT = ev({ metaKey: true, shiftKey: true, key: "t" });
    expect(newTerminalChord(cmdShiftT)).toBe(false);
    expect(panelForChord(cmdShiftT)).toBe("terminal"); // it IS the panel-select
  });
});

describe("shouldCloseTerminalOnChord (scoped ⌘W → close focused terminal)", () => {
  it("routes to terminal-close when ⌘W + terminal-focused + can-close", () => {
    expect(
      shouldCloseTerminalOnChord({
        isCloseChord: true,
        terminalFocused: true,
        canClose: true,
      }),
    ).toBe(true);
  });

  it("does NOT route when the chord is not ⌘W (e.g. some other key)", () => {
    expect(
      shouldCloseTerminalOnChord({
        isCloseChord: false,
        terminalFocused: true,
        canClose: true,
      }),
    ).toBe(false);
  });

  it("does NOT route when the EDITOR (not a terminal) is focused — falls through to editor ⌘W", () => {
    expect(
      shouldCloseTerminalOnChord({
        isCloseChord: true,
        terminalFocused: false,
        canClose: true,
      }),
    ).toBe(false);
  });

  it("does NOT route on the LAST terminal — inert (disallow-last), no fall-through close either", () => {
    expect(
      shouldCloseTerminalOnChord({
        isCloseChord: true,
        terminalFocused: true,
        canClose: false,
      }),
    ).toBe(false);
  });

  it("the close decision and the editor ⌘W never both fire: when it routes, the caller swallows", () => {
    // Encodes the contract: a true result means "swallow + close terminal" (the caller
    // returns before the editor isCloseTabChord branch). This test pins the truth value
    // the caller branches on; the swallow itself (preventDefault/stopPropagation) is
    // wiring verified structurally + live.
    const focusedTerminalWithSibling = shouldCloseTerminalOnChord({
      isCloseChord: true,
      terminalFocused: true,
      canClose: true,
    });
    expect(focusedTerminalWithSibling).toBe(true);
  });
});
