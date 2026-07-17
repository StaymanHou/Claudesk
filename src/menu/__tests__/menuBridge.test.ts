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
    // M10 WP4 — "Check for Updates…" maps to the checkForUpdates callback (App runs the
    // manual check, ignoring skip/disable).
    expect(menuActionFor(MENU_IDS.CHECK_FOR_UPDATES)).toEqual({
      kind: "callback",
      callback: "checkForUpdates",
    });
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
    // Each of the six CC permission-mode radio items maps to setCcPermissionMode carrying
    // its target mode (no invert — unlike the old yolo toggle).
    expect(menuActionFor(MENU_IDS.CC_MODE_DEFAULT)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "default",
    });
    expect(menuActionFor(MENU_IDS.CC_MODE_PLAN)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "plan",
    });
    expect(menuActionFor(MENU_IDS.CC_MODE_ACCEPT_EDITS)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "acceptEdits",
    });
    expect(menuActionFor(MENU_IDS.CC_MODE_AUTO)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "auto",
    });
    expect(menuActionFor(MENU_IDS.CC_MODE_DONT_ASK)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "dontAsk",
    });
    expect(menuActionFor(MENU_IDS.CC_MODE_BYPASS)).toEqual({
      kind: "callback",
      callback: "setCcPermissionMode",
      mode: "bypassPermissions",
    });
  });
});

describe("the View-menu CC permission-mode radio wires to cc_set_permission_mode", () => {
  // Each menu id (in menuBridge) maps to setCcPermissionMode carrying that mode, which
  // App.tsx turns into invoke("cc_set_permission_mode", {mode}). No current-state tracking
  // is needed (the menu carries the target). Source guards pin the menu path so a refactor
  // can't sever it. Live spawn-argv behavior is verify-human-covered, not re-asserted here.
  it("the mode ids are byte-identical to the Rust app_menu::ids constants", () => {
    // CRITICAL contract: MENU_IDS must match app_menu::ids (Rust) byte-for-byte.
    expect(MENU_IDS.CC_MODE_DEFAULT).toBe("view.cc.mode.default");
    expect(MENU_IDS.CC_MODE_PLAN).toBe("view.cc.mode.plan");
    expect(MENU_IDS.CC_MODE_ACCEPT_EDITS).toBe("view.cc.mode.acceptEdits");
    expect(MENU_IDS.CC_MODE_AUTO).toBe("view.cc.mode.auto");
    expect(MENU_IDS.CC_MODE_DONT_ASK).toBe("view.cc.mode.dontAsk");
    expect(MENU_IDS.CC_MODE_BYPASS).toBe("view.cc.mode.bypassPermissions");
  });
  it("App.tsx's menu listener invokes cc_set_permission_mode with the carried mode", () => {
    expect(appTsx).toContain('action.callback === "setCcPermissionMode"');
    expect(appTsx).toContain(
      'invoke("cc_set_permission_mode", { mode: action.mode })',
    );
  });
  it("App.tsx no longer references the removed yolo names", () => {
    for (const stale of [
      "cc_get_yolo",
      "cc_set_yolo",
      "cc-yolo",
      "ccYoloRef",
      "ccYoloToggle",
    ]) {
      expect(appTsx).not.toContain(stale);
    }
  });
});

describe("menuBridge — unknown ids", () => {
  it("returns null for an unknown / empty id (defensive)", () => {
    expect(menuActionFor("")).toBeNull();
    expect(menuActionFor("file.save.label")).toBeNull(); // a label-only (disabled) id
    expect(menuActionFor("nope.nope")).toBeNull();
  });
});
