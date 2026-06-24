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
  NEW_WORKSPACE: "file.newWorkspace",
  OPEN_SUBLIME_TEXT: "workspace.openSublimeText",
  OPEN_SUBLIME_MERGE: "workspace.openSublimeMerge",
  REVEAL_IN_FINDER: "workspace.revealInFinder",
} as const;

/** A callback action's tag — App.tsx switches on this to call the right seam. */
export type MenuCallback =
  | "newWorkspace"
  | "openSublimeText"
  | "openSublimeMerge"
  | "revealInFinder";

/**
 * The action a functional menu-item id maps to:
 *  - `{ kind: "key", init }` — dispatch `new KeyboardEvent("keydown", init)` on document.
 *  - `{ kind: "callback", callback }` — run the named React-side seam.
 *  - `null` — unknown id (defensive; the Rust side only emits functional ids).
 */
export type MenuAction =
  | { kind: "key"; init: KeyboardEventInit }
  | { kind: "callback"; callback: MenuCallback };

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
    case MENU_IDS.NEW_WORKSPACE:
      return { kind: "callback", callback: "newWorkspace" };
    case MENU_IDS.OPEN_SUBLIME_TEXT:
      return { kind: "callback", callback: "openSublimeText" };
    case MENU_IDS.OPEN_SUBLIME_MERGE:
      return { kind: "callback", callback: "openSublimeMerge" };
    case MENU_IDS.REVEAL_IN_FINDER:
      return { kind: "callback", callback: "revealInFinder" };
    default:
      return null;
  }
}
