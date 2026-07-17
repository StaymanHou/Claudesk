// Frontend bridge for the native macOS application menu (src-tauri/src/app_menu).
//
// The native menu's functional items have NO accelerator (a real one would steal the
// keystroke from the webview/CodeMirror — see app_menu/mod.rs). Instead, on click the
// Rust `on_menu_event` handler emits the item's id on the `menu` event, and this
// module maps that id to one of two actions:
//
//   - "key" — RE-DISPATCH a synthetic `KeyboardEvent` on `document`, reproducing the
//     exact chord the existing capture-phase handlers already listen for (panel-switch,
//     finder, search, palette, close-tab). Those handlers live in App.tsx +
//     RightPanelHost.tsx and are unchanged — the menu becomes a pure alias of the key.
//   - "callback" — a React-side action with no keyboard chord (New Workspace opens the
//     picker; the three launchers invoke their backend command with the focused
//     workspace's path). App.tsx's `menu` listener calls the matching seam.
//
// CRITICAL: the id STRINGS here must stay byte-identical to `app_menu::ids` in
// src-tauri/src/app_menu/mod.rs. The Rust side is the source of truth for which ids
// are functional (`is_functional_id`); this is the frontend half of that contract.
//
// Pure (no React/DOM/IPC) → vitest-testable: the tests assert each "key" action's
// synthetic init actually satisfies the matching existing chord predicate.

import type { CcPermissionMode } from "../cc/permissionMode";

/** Functional menu-item ids — must match `app_menu::ids` (Rust) byte-for-byte. */
export const MENU_IDS = {
  // Re-dispatch a synthetic KeyboardEvent (app-level document chords).
  PANEL_EDITOR: "view.panel.editor", // ⌘⇧E
  PANEL_DIFF: "view.panel.diff", // ⌘⇧D
  PANEL_TERMINAL: "view.panel.terminal", // ⌘⇧T
  COMMAND_PALETTE: "view.commandPalette", // ⌘⇧P
  GO_TO_FILE: "find.goToFile", // ⌘P finder
  FIND_IN_FILES: "find.findInFiles", // ⌘⇧F search
  CLOSE_TAB: "file.closeTab", // ⌘W
  // React callbacks (no existing accelerator).
  // M10 WP4 — "Check for Updates…" (manual check, ignores skip/disable). Value must
  // match `app_menu::ids::CHECK_FOR_UPDATES` byte-for-byte.
  CHECK_FOR_UPDATES: "app.checkForUpdates",
  NEW_WORKSPACE: "file.newWorkspace",
  OPEN_SUBLIME_TEXT: "workspace.openSublimeText",
  OPEN_SUBLIME_MERGE: "workspace.openSublimeMerge",
  REVEAL_IN_FINDER: "workspace.revealInFinder",
  // WP5 Phase 2 (rework) — tri-state PiP mode radio (Off/On/Auto). Each sets that mode
  // via pip_set_mode. Replaces the old PIP_TOGGLE + PIP_AUTO_SUMMON.
  PIP_MODE_OFF: "view.pip.mode.off",
  PIP_MODE_ON: "view.pip.mode.on",
  PIP_MODE_AUTO: "view.pip.mode.auto",
  // CC permission-mode radio (friend-requested dropdown, mirrored in the menu). Each item
  // sets that mode via cc_set_permission_mode; the backend broadcasts `cc-permission-mode`
  // so the menu radio + picker dropdown re-render. Ids must match `app_menu::ids` (Rust).
  CC_MODE_DEFAULT: "view.cc.mode.default",
  CC_MODE_PLAN: "view.cc.mode.plan",
  CC_MODE_ACCEPT_EDITS: "view.cc.mode.acceptEdits",
  CC_MODE_AUTO: "view.cc.mode.auto",
  CC_MODE_DONT_ASK: "view.cc.mode.dontAsk",
  CC_MODE_BYPASS: "view.cc.mode.bypassPermissions",
} as const;

/** A callback action's tag — App.tsx switches on this to call the right seam. */
export type MenuCallback =
  | "checkForUpdates"
  | "newWorkspace"
  | "openSublimeText"
  | "openSublimeMerge"
  | "revealInFinder"
  | "pipModeOff"
  | "pipModeOn"
  | "pipModeAuto"
  | "setCcPermissionMode";

/**
 * The action a functional menu-item id maps to:
 *  - `{ kind: "key", init }` — dispatch `new KeyboardEvent("keydown", init)` on document.
 *  - `{ kind: "callback", callback }` — run the named React-side seam. The CC
 *    permission-mode radio carries the target `mode` on the action (no invert — unlike
 *    the old yolo toggle, each of the six items sets one specific mode directly).
 *  - `null` — unknown id (defensive; the Rust side only emits functional ids).
 */
export type MenuAction =
  | { kind: "key"; init: KeyboardEventInit }
  | { kind: "callback"; callback: Exclude<MenuCallback, "setCcPermissionMode"> }
  | { kind: "callback"; callback: "setCcPermissionMode"; mode: CcPermissionMode };

// The synthetic-key inits, each reproducing one existing chord. macOS reports the
// digit/letter in `e.key`; the predicates match on `metaKey` + `shiftKey` + `key`
// (Ctrl/Alt permissive), so these minimal inits are exactly what they read. We set
// `bubbles: true` and `cancelable: true` so the capture-phase document listeners (and
// their `preventDefault`) behave as on a real keypress.
const KEY_BASE = { bubbles: true, cancelable: true } as const;

/** Map a menu-item id to its action. Pure. */
export function menuActionFor(id: string): MenuAction | null {
  switch (id) {
    // ⌘⇧E/D/T — panelForChord requires meta+shift+letter.
    case MENU_IDS.PANEL_EDITOR:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "e", metaKey: true, shiftKey: true },
      };
    case MENU_IDS.PANEL_DIFF:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "d", metaKey: true, shiftKey: true },
      };
    case MENU_IDS.PANEL_TERMINAL:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "t", metaKey: true, shiftKey: true },
      };
    // ⌘⇧P — isPaletteChord requires meta+shift+"p".
    case MENU_IDS.COMMAND_PALETTE:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "p", metaKey: true, shiftKey: true },
      };
    // ⌘P — isFinderChord requires meta, shift ABSENT, "p".
    case MENU_IDS.GO_TO_FILE:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "p", metaKey: true, shiftKey: false },
      };
    // ⌘⇧F — isSearchChord requires meta+shift+"f".
    case MENU_IDS.FIND_IN_FILES:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "f", metaKey: true, shiftKey: true },
      };
    // ⌘W — isCloseTabChord requires meta, shift ABSENT, "w".
    case MENU_IDS.CLOSE_TAB:
      return {
        kind: "key",
        init: { ...KEY_BASE, key: "w", metaKey: true, shiftKey: false },
      };
    // React callbacks.
    // M10 WP4 — manual "Check for Updates…" (App.tsx calls useUpdater.checkNow, which
    // ignores the skip-list + disable pref and surfaces the outcome).
    case MENU_IDS.CHECK_FOR_UPDATES:
      return { kind: "callback", callback: "checkForUpdates" };
    case MENU_IDS.NEW_WORKSPACE:
      return { kind: "callback", callback: "newWorkspace" };
    case MENU_IDS.OPEN_SUBLIME_TEXT:
      return { kind: "callback", callback: "openSublimeText" };
    case MENU_IDS.OPEN_SUBLIME_MERGE:
      return { kind: "callback", callback: "openSublimeMerge" };
    case MENU_IDS.REVEAL_IN_FINDER:
      return { kind: "callback", callback: "revealInFinder" };
    // WP5 Phase 2 (rework) — tri-state PiP mode. Each radio item sets that mode via
    // pip_set_mode (App.tsx); the backend broadcasts `pip-mode` so the menu/icon reflect it.
    case MENU_IDS.PIP_MODE_OFF:
      return { kind: "callback", callback: "pipModeOff" };
    case MENU_IDS.PIP_MODE_ON:
      return { kind: "callback", callback: "pipModeOn" };
    case MENU_IDS.PIP_MODE_AUTO:
      return { kind: "callback", callback: "pipModeAuto" };
    // CC permission-mode radio (friend-requested dropdown, mirrored in the menu). Each of
    // the six items carries its target mode; App.tsx invokes cc_set_permission_mode with
    // that mode (no invert). The backend broadcasts `cc-permission-mode` so the menu radio
    // + picker dropdown re-render. Takes effect on the NEXT cc_spawn.
    case MENU_IDS.CC_MODE_DEFAULT:
      return { kind: "callback", callback: "setCcPermissionMode", mode: "default" };
    case MENU_IDS.CC_MODE_PLAN:
      return { kind: "callback", callback: "setCcPermissionMode", mode: "plan" };
    case MENU_IDS.CC_MODE_ACCEPT_EDITS:
      return {
        kind: "callback",
        callback: "setCcPermissionMode",
        mode: "acceptEdits",
      };
    case MENU_IDS.CC_MODE_AUTO:
      return { kind: "callback", callback: "setCcPermissionMode", mode: "auto" };
    case MENU_IDS.CC_MODE_DONT_ASK:
      return { kind: "callback", callback: "setCcPermissionMode", mode: "dontAsk" };
    case MENU_IDS.CC_MODE_BYPASS:
      return {
        kind: "callback",
        callback: "setCcPermissionMode",
        mode: "bypassPermissions",
      };
    default:
      return null;
  }
}
