// WP3a — pure builder for the editor's CodeMirror 6 extension set.
//
// EditorPanel used to assemble its extensions inline (saveKeymap + language +
// lineWrapping). WP3a layers the core-editing must-haves on top — multi-cursor /
// multiple selections, the VS-Code rectangular (alt-drag) selection, and in-file
// find/replace — and the set is now large enough to be worth extracting here so
// it is unit-testable WITHOUT a live EditorView (mirrors the editorLoad.ts /
// editorSave.ts pure-logic split; the repo posture is: pure logic → vitest, live
// DOM → Playwright).
//
// What `@uiw/react-codemirror`'s `basicSetup` already gives us (so we don't
// double-bind): line numbers, history + default keymap, `drawSelection`,
// `highlightSelectionMatches`, and `searchKeymap` (the bindings). What it does
// NOT give us and we add here: `EditorState.allowMultipleSelections`,
// `rectangularSelection` + `crosshairCursor` (alt-drag column/multi-cursor, the
// VS-Code gesture), the `search({ top: true })` PANEL placement, and the Cmd-D
// "select next occurrence" binding. All app-suppressing chords go through a
// single `Prec.highest` keymap so they win over CM6 + the browser default — the
// WP1 lesson for editor-focused chords (the same shape WP2's Mod-s used).

import {
  EditorView,
  keymap,
  rectangularSelection,
  crosshairCursor,
  scrollPastEnd,
} from "@codemirror/view";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import {
  search,
  searchKeymap,
  selectNextOccurrence,
  openSearchPanel,
} from "@codemirror/search";
import { showMinimap } from "@replit/codemirror-minimap";
import { languageForPath, languageForId } from "./language";
import {
  fontSizeCompartment,
  fontSizeTheme,
  languageCompartment,
} from "./theme";
import { nextFontSize, DEFAULT_FONT_PX } from "./fontZoom";

export interface EditorExtensionOptions {
  /** Path of the open file — drives the language mode. "" = plaintext. */
  openPath: string;
  /** Save handler bound to Mod-s. Returns nothing; the keybinding consumes the event. */
  onSave: () => void;
  /**
   * Current font size px — seeds the font-size compartment so the editor mounts
   * at the persisted zoom (no flash of the default then a jump).
   */
  fontSize: number;
  /**
   * Called after a Cmd+= / Cmd+- / Cmd+0 chord with the new size, so EditorPanel
   * can mirror it into React state + persist it. The keybinding itself does the
   * live compartment reconfigure via the view; this just syncs the outside world.
   */
  onFontSizeChange: (px: number) => void;
  /**
   * WP3b — palette syntax override. null = derive the mode from the file
   * extension (`languageForPath`); a syntax id = force that mode (`languageForId`).
   * Seeds the language compartment at mount; the palette reconfigures the override
   * by rebuilding the extensions with a new value (array identity changes → @uiw
   * reconfigures the view), the same mechanism the font-size seed uses.
   */
  languageOverrideId: string | null;
}

/**
 * The high-precedence keymap owning every chord that must beat CM6's own keymap
 * and the browser/OS default (print, etc.). Editor-scoped, so a CM6 keymap is
 * the right tool — the WP1 capture-phase document listener is for APP-level
 * chords (panel-switch / Cmd+P), which are WP5/WP6, not here.
 */
function coreKeymap(opts: EditorExtensionOptions): Extension {
  const { onSave, fontSize, onFontSizeChange } = opts;

  // Apply a new font size: live-reconfigure the compartment on the view, then
  // notify EditorPanel (React state + persist). `target` is the resolved size so
  // a clamped no-op (already at min/max) still keeps everything in sync.
  const applyZoom = (view: EditorView, target: number): boolean => {
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(fontSizeTheme(target)),
    });
    onFontSizeChange(target);
    return true;
  };

  return Prec.highest(
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          onSave();
          return true;
        },
      },
      // VS-Code-style "select next occurrence of the current selection/word".
      // selectNextOccurrence is in searchKeymap by default under Mod-d already,
      // but we bind it explicitly at highest prec so it can never be shadowed by
      // a future lower-prec binding and reads clearly as a core gesture.
      { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
      // Cmd+R → open the find/replace panel (operator's chosen replace chord,
      // verify-human 2026-06-20). openSearchPanel opens the panel; the panel
      // includes the replace fields. preventDefault so the browser's Cmd+R
      // reload never fires while focus is in the editor.
      { key: "Mod-r", run: openSearchPanel, preventDefault: true },
      // Font-size zoom (Sublime parity). Cmd+= grows, Cmd+- shrinks, Cmd+0
      // resets. preventDefault so the browser's native page-zoom never fires
      // while focus is in the editor. `Mod-=` plus its bare-`Mod-+` alias cover
      // both the unshifted and shifted forms of the "+" key across keyboards.
      {
        key: "Mod-=",
        preventDefault: true,
        run: (view) => applyZoom(view, nextFontSize(fontSize, "in")),
      },
      {
        key: "Mod-+",
        preventDefault: true,
        run: (view) => applyZoom(view, nextFontSize(fontSize, "in")),
      },
      {
        key: "Mod--",
        preventDefault: true,
        run: (view) => applyZoom(view, nextFontSize(fontSize, "out")),
      },
      {
        key: "Mod-0",
        preventDefault: true,
        run: (view) => applyZoom(view, DEFAULT_FONT_PX),
      },
      // The search keymap (find/replace open, find-next/prev, etc.) — included in
      // basicSetup, but re-asserted at highest prec so the find panel always opens
      // even if a future extension grabs Mod-f first.
      ...searchKeymap,
    ]),
  );
}

/**
 * The multi-selection feature group: allow multiple ranges + the rectangular
 * (column) selection on Cmd-drag with a matching crosshair affordance.
 *
 * Operator choices (verify-human 2026-06-20): the trigger is the Cmd/Meta key,
 * NOT the CM6 default of Alt — so `eventFilter` gates on `event.metaKey` and the
 * crosshair hint keys off "Meta". CM6 only begins a rectangular selection once
 * the pointer actually drags, so a stationary Cmd+click falls through to normal
 * click handling and does NOT create a stray one-character range (the "selects
 * the next character" artifact the operator saw with the Alt default).
 */
function multiSelection(): Extension {
  return [
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection({ eventFilter: (e) => e.metaKey }),
    crosshairCursor({ key: "Meta" }),
  ];
}

/**
 * Minimap (DEFERRABLE per WBS WP3a Phase 3). `@replit/codemirror-minimap`'s
 * peer-deps are all satisfied by our pinned CM6 (view 6.43.1 / state 6.6.0 /
 * language 6.12.3 / lint 6.9.7), so it integrates without a version fight.
 * `displayText: "blocks"` renders condensed blocks (legible at minimap scale and
 * naturally dark-toned over the #1e1e1e editor); the overlay shows the viewport.
 * The minimap creates its own container element via `create`.
 */
function minimap(): Extension {
  return showMinimap.compute([], () => ({
    create: () => {
      const dom = document.createElement("div");
      return { dom };
    },
    displayText: "blocks",
    showOverlay: "always",
  }));
}

/**
 * Build the full extension array for the editor. Pure — no React, no view.
 * The font-size compartment is SEEDED here at `opts.fontSize` so the editor
 * mounts at the persisted zoom; the zoom keybindings reconfigure it live.
 */
export function buildEditorExtensions(
  opts: EditorExtensionOptions,
): Extension[] {
  // WP3b: the active language is the palette override if set, else the
  // extension-derived default. It lives in a compartment so the palette can swap
  // it; we seed the compartment here at the resolved value.
  const activeLanguage =
    opts.languageOverrideId == null
      ? languageForPath(opts.openPath)
      : languageForId(opts.languageOverrideId);

  return [
    coreKeymap(opts),
    multiSelection(),
    // Panel at the top of the editor (VS-Code-like). basicSetup ships the search
    // KEYMAP but not this placement config; adding search() is idempotent with it.
    search({ top: true }),
    languageCompartment.of(activeLanguage),
    // Font size in its own compartment, seeded at the current size — Cmd+=/-/0
    // reconfigure it at runtime (see coreKeymap.applyZoom).
    fontSizeCompartment.of(fontSizeTheme(opts.fontSize)),
    // Minimap (deferrable extra). Peer-deps cleared; shipped, not deferred.
    minimap(),
    // Scroll past the end so the last line can reach the TOP of the viewport
    // (VS Code's scrollBeyondLastLine; operator request at WP3a verify-human).
    // Built-in @codemirror/view extension — no new dep.
    scrollPastEnd(),
    // No EditorView.lineWrapping — the operator wants long lines to scroll
    // horizontally, not soft-wrap (verify-human 2026-06-20). CM6's default (no
    // wrapping) is the desired behavior, so nothing is added here.
  ];
}
