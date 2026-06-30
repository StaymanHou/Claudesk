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
  lineWrapCompartment,
  lineWrapExtension,
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
   * The language is placed DIRECTLY in the extensions array — no compartment.
   * When the palette changes the override (or the file changes), EditorPanel's
   * `useMemo` rebuilds this array with the new value; `@uiw/react-codemirror`
   * applies the new-identity array as a full CM6 reconfigure, which swaps the
   * language. (Unlike `fontSizeCompartment`, which is live-`reconfigure`d in the
   * Cmd+=/-/0 keybindings WITHOUT an array rebuild, the language only ever
   * changes via a React dep already in the memo — so a compartment would be
   * vestigial. See memory `cm6-dont-copy-compartment-by-analogy`.)
   */
  languageOverrideId: string | null;
  /**
   * M6 WP5 — current line-wrap flag. Seeds the line-wrap compartment so the editor
   * mounts at the persisted wrap state. The ⌘\ keybinding reconfigures it live.
   */
  lineWrap: boolean;
  /**
   * Called after a ⌘\ chord with the new wrap flag, so EditorPanel can mirror it
   * into React state + persist it. The keybinding itself does the live compartment
   * reconfigure via the view; this just syncs the outside world (mirrors
   * onFontSizeChange).
   */
  onWrapChange: (on: boolean) => void;
}

/**
 * The high-precedence keymap owning every chord that must beat CM6's own keymap
 * and the browser/OS default (print, etc.). Editor-scoped, so a CM6 keymap is
 * the right tool — the WP1 capture-phase document listener is for APP-level
 * chords (panel-switch / Cmd+P), which are WP5/WP6, not here.
 */
function coreKeymap(opts: EditorExtensionOptions): Extension {
  const { onSave, fontSize, onFontSizeChange, lineWrap, onWrapChange } = opts;

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

  // M6 WP5 — apply a new wrap flag: live-reconfigure the line-wrap compartment on
  // the view (no remount; cursor/scroll preserved), then notify EditorPanel (React
  // state + persist). Mirrors applyZoom.
  const applyWrap = (view: EditorView, next: boolean): boolean => {
    view.dispatch({
      effects: lineWrapCompartment.reconfigure(lineWrapExtension(next)),
    });
    onWrapChange(next);
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
      // selectNextOccurrence is ALSO in the spread `...searchKeymap` below under
      // Mod-d, so this binding appears twice in the same keymap — deliberate
      // belt-and-suspenders: CM6 resolves first-match-wins, so this explicit
      // highest-prec entry can never be shadowed by a future lower-prec binding and
      // reads clearly as a core gesture.
      { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
      // Cmd+R → openSearchPanel (operator's chosen "replace" entry point,
      // verify-human 2026-06-20). This opens the SAME panel as Cmd+F — the replace
      // row is visible by default — so it's a convenience alias, not a functionally
      // distinct replace mode. preventDefault so the browser's Cmd+R reload never
      // fires while focus is in the editor.
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
      // M6 WP5 — ⌘\ toggles soft line-wrap (Sublime convention; confirmed disjoint
      // from every chord in paletteCommands.ts's ownership map). preventDefault so
      // the OS/browser never sees it. Reads the CURRENT `lineWrap` (closed over from
      // the latest buildEditorExtensions call) and flips it. Correctness relies on the
      // memo's `lineWrap` dep rebuilding this keymap on every change (CM6 reconfigures);
      // do NOT drop `lineWrap` from that deps array. (Same invariant as the fontSize chord.)
      {
        key: "Mod-\\",
        preventDefault: true,
        run: (view) => applyWrap(view, !lineWrap),
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
 *
 * WP11 — the container carries `cm-minimap-narrow` so App.css can clip the
 * package's `.cm-minimap-gutter` (whose width is set inline to its 120px MaxWidth)
 * down to ~75% (90px). The marker class scopes the override to our minimap only.
 */
function minimap(): Extension {
  return showMinimap.compute([], () => ({
    create: () => {
      const dom = document.createElement("div");
      dom.classList.add("cm-minimap-narrow");
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
  // extension-derived default. Placed directly in the array (no compartment) —
  // the memo rebuild on openPath/languageOverrideId change re-applies it.
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
    activeLanguage,
    // Font size in its own compartment, seeded at the current size — Cmd+=/-/0
    // reconfigure it at runtime (see coreKeymap.applyZoom).
    fontSizeCompartment.of(fontSizeTheme(opts.fontSize)),
    // Minimap (deferrable extra). Peer-deps cleared; shipped, not deferred.
    minimap(),
    // Scroll past the end so the last line can reach the TOP of the viewport
    // (VS Code's scrollBeyondLastLine; operator request at WP3a verify-human).
    // Built-in @codemirror/view extension — no new dep.
    scrollPastEnd(),
    // M6 WP5 — line-wrap in its own compartment, seeded at the current flag. Default
    // OFF preserves the deliberate no-wrap behavior (long lines scroll horizontally,
    // verify-human 2026-06-20); ⌘\ / the status-bar toggle reconfigure it live (see
    // coreKeymap.applyWrap).
    lineWrapCompartment.of(lineWrapExtension(opts.lineWrap)),
  ];
}
