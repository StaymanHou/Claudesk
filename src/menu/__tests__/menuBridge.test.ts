import { describe, it, expect } from "vitest";
import { menuActionFor, MENU_IDS, type MenuAction } from "../menuBridge";
import { panelForChord } from "../../components/workspace/panelHost";
import { isPaletteChord } from "../../components/workspace/editor/paletteCommands";
import { isFinderChord } from "../../components/workspace/finder/finderChord";
import { isSearchChord } from "../../components/workspace/search/searchChord";
import { isCloseTabChord } from "../../components/workspace/editor/closeTabChord";
// Source-text guard for the App.tsx menu-path wiring (the repo ?raw convention; the
// live spawn behavior is verify-human-covered, not re-asserted here).
import appTsx from "../../App.tsx?raw";

// A KeyboardEventInit carries optional fields; the chord predicates read
// {metaKey, shiftKey, key}. Coerce to the shape the predicates expect (the real
// KeyboardEvent dispatched at runtime always has these as booleans/string).
function asChord(init: KeyboardEventInit) {
  return {
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    key: init.key ?? "",
  };
}

function keyInit(id: string): KeyboardEventInit {
  const action = menuActionFor(id);
  expect(action, `${id} should map to an action`).not.toBeNull();
  expect((action as MenuAction).kind, `${id} should be a key action`).toBe(
    "key",
  );
  return (action as Extract<MenuAction, { kind: "key" }>).init;
}

describe("menuBridge — re-dispatch ids satisfy the existing chord predicates", () => {
  // This is the contract: each menu item's synthetic KeyboardEvent must match the
  // SAME predicate the original keyboard chord matches, so clicking the menu item
  // fires the exact same handler. If a predicate ever tightens, these tests break.

  it("Editor Panel → panelForChord returns 'editor'", () => {
    expect(panelForChord(asChord(keyInit(MENU_IDS.PANEL_EDITOR)))).toBe(
      "editor",
    );
  });
  it("Diff Panel → panelForChord returns 'diff'", () => {
    expect(panelForChord(asChord(keyInit(MENU_IDS.PANEL_DIFF)))).toBe("diff");
  });
  it("Terminal Panel → panelForChord returns 'terminal'", () => {
    expect(panelForChord(asChord(keyInit(MENU_IDS.PANEL_TERMINAL)))).toBe(
      "terminal",
    );
  });

  it("Command Palette → isPaletteChord true (and NOT the finder chord)", () => {
    const chord = asChord(keyInit(MENU_IDS.COMMAND_PALETTE));
    expect(isPaletteChord(chord)).toBe(true);
    expect(isFinderChord(chord)).toBe(false); // shift present → not the finder
  });

  it("Go to File → isFinderChord true (and NOT the palette chord)", () => {
    const chord = asChord(keyInit(MENU_IDS.GO_TO_FILE));
    expect(isFinderChord(chord)).toBe(true);
    expect(isPaletteChord(chord)).toBe(false); // shift absent → not the palette
  });

  it("Find in Files → isSearchChord true", () => {
    expect(isSearchChord(asChord(keyInit(MENU_IDS.FIND_IN_FILES)))).toBe(true);
  });

  it("Close Tab → isCloseTabChord true", () => {
    expect(isCloseTabChord(asChord(keyInit(MENU_IDS.CLOSE_TAB)))).toBe(true);
  });

  it("re-dispatch inits are bubbling + cancelable (so capture handlers + preventDefault work)", () => {
    for (const id of [
      MENU_IDS.PANEL_EDITOR,
      MENU_IDS.PANEL_DIFF,
      MENU_IDS.PANEL_TERMINAL,
      MENU_IDS.COMMAND_PALETTE,
      MENU_IDS.GO_TO_FILE,
      MENU_IDS.FIND_IN_FILES,
      MENU_IDS.CLOSE_TAB,
    ]) {
      const init = keyInit(id);
      expect(init.bubbles, `${id} bubbles`).toBe(true);
      expect(init.cancelable, `${id} cancelable`).toBe(true);
    }
  });
});

describe("menuBridge — callback ids", () => {
  it("maps each callback id to its tag", () => {
    expect(menuActionFor(MENU_IDS.NEW_WORKSPACE)).toEqual({
      kind: "callback",
      callback: "newWorkspace",
    });
    expect(menuActionFor(MENU_IDS.OPEN_SUBLIME_TEXT)).toEqual({
      kind: "callback",
      callback: "openSublimeText",
    });
    expect(menuActionFor(MENU_IDS.OPEN_SUBLIME_MERGE)).toEqual({
      kind: "callback",
      callback: "openSublimeMerge",
    });
    expect(menuActionFor(MENU_IDS.REVEAL_IN_FINDER)).toEqual({
      kind: "callback",
      callback: "revealInFinder",
    });
    // WP5 Phase 2 (rework) — the tri-state PiP mode radio maps each id to its set-mode callback.
    expect(menuActionFor(MENU_IDS.PIP_MODE_OFF)).toEqual({
      kind: "callback",
      callback: "pipModeOff",
    });
    expect(menuActionFor(MENU_IDS.PIP_MODE_ON)).toEqual({
      kind: "callback",
      callback: "pipModeOn",
    });
    expect(menuActionFor(MENU_IDS.PIP_MODE_AUTO)).toEqual({
      kind: "callback",
      callback: "pipModeAuto",
    });
    // M6 WP7 — the CC yolo toggle maps to its callback tag.
    expect(menuActionFor(MENU_IDS.CC_YOLO_TOGGLE)).toEqual({
      kind: "callback",
      callback: "ccYoloToggle",
    });
  });
});

describe("M6 WP7 — the View-menu yolo toggle wires to cc_set_yolo", () => {
  // The toggle (in menuBridge) maps to the ccYoloToggle callback, which App.tsx turns
  // into invoke("cc_set_yolo", {yolo: !current}), tracking current via cc_get_yolo + the
  // `cc-yolo` broadcast. Source guards pin the menu path so a refactor can't sever it.
  // Live spawn-argv behavior is verify-human-covered (installed .app), not re-asserted here.
  it("the toggle id is byte-identical to the Rust app_menu::ids constant", () => {
    // CRITICAL contract: MENU_IDS must match app_menu::ids (Rust) byte-for-byte.
    expect(MENU_IDS.CC_YOLO_TOGGLE).toBe("view.cc.yolo");
  });
  it("App.tsx's menu listener inverts current state + invokes cc_set_yolo", () => {
    expect(appTsx).toContain('action.callback === "ccYoloToggle"');
    expect(appTsx).toContain('invoke("cc_set_yolo"');
    expect(appTsx).toContain("!ccYoloRef.current");
  });
  it("App.tsx seeds + tracks the current yolo state from the backend", () => {
    expect(appTsx).toContain('invoke<boolean>("cc_get_yolo")');
    expect(appTsx).toContain('listen<boolean>("cc-yolo"');
  });
});

describe("menuBridge — unknown ids", () => {
  it("returns null for an unknown / empty id (defensive)", () => {
    expect(menuActionFor("")).toBeNull();
    expect(menuActionFor("file.save.label")).toBeNull(); // a label-only (disabled) id
    expect(menuActionFor("nope.nope")).toBeNull();
  });
});
