// F-a WP3 Phase 2 — the CM6 extension set for the Prompt panel's PROSE view.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS NOT `editorExtensions.ts`, AND THE DUPLICATION IS THE POINT (F-a decision 5).
//
// The obvious move is to reuse the editor's builder. It is wrong here: `basicSetup` ships
// line numbers, a fold gutter, bracket matching, autocompletion and the full code keymap
// as ONE bundle, and this surface is for a person dictating a paragraph. Line numbers down
// the side of a dictated prompt are noise; bracket-matching a quote mark is worse than
// noise. So the set below is assembled from the individual CM6 packages rather than
// inherited and then subtracted — subtracting from `basicSetup` is not possible per-item,
// which is precisely why a second builder exists.
//
// What is DELIBERATELY IN (each earns its place for prose):
//   - history + historyKeymap  — undo AND redo. ⚠️ CM6 ships them as a PAIR; taking
//                                `undo` alone is a half-feature, and a dictation that
//                                cannot be re-done after an over-eager undo is the exact
//                                data-loss this feature exists to prevent.
//   - search + searchKeymap    — find-within-draft. A long dictation is scrollable prose;
//                                ⌘F is how you get back to a spot.
//   - fontSize compartment     — live ⌘= / ⌘- / ⌘0 without rebuilding the view.
//   - lineWrapping             — ⚠️ A REQUIREMENT, not a preference (operator, 2026-09-21).
//                                Prose must wrap; horizontal scrolling of a paragraph is
//                                not a thing anyone wants.
//
// What is DELIBERATELY OUT: line numbers, a fold gutter, syntax highlighting, a language
// mode, bracket matching, autocompletion, the rectangular-selection/multi-cursor set, and
// the minimap. None of them mean anything for a block of English.
//
// ⚠️ NO `Compartment` FOR WRAP, and that asymmetry with `editorExtensions.ts` is deliberate
// (`[[cm6-dont-copy-compartment-by-analogy]]`). A compartment earns its place only where a
// value is live-`reconfigure`d WITHOUT an array rebuild. Font size is (the zoom keybindings
// reconfigure in place, which is why it keeps its compartment). Wrap here is STATIC-ON —
// there is no toggle, so a compartment would be ceremony wrapping a constant.

import { EditorView, keymap } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import { history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { fontSizeCompartment, fontSizeTheme } from "../editor/theme";
import { DEFAULT_PROMPT_FONT_PX, nextFontSize } from "./promptFontZoom";

export interface PromptExtensionOptions {
  /**
   * Current font size px — seeds the compartment so the view mounts at the persisted
   * zoom rather than flashing the default and jumping.
   */
  readonly fontSize: number;
  /**
   * Called after a ⌘= / ⌘- / ⌘0 chord with the new size, so the panel can mirror it into
   * React state and persist it. The keybinding itself does the live compartment
   * reconfigure via the view; this only syncs the outside world.
   */
  readonly onFontSizeChange: (px: number) => void;
}

/**
 * Build the prose extension set.
 *
 * Returns a NEW array each call — `@uiw/react-codemirror` treats a new array identity as a
 * full reconfigure, so callers should `useMemo` this on its real dependencies rather than
 * rebuilding every render.
 */
export function promptExtensions(options: PromptExtensionOptions): Extension[] {
  const { fontSize, onFontSizeChange } = options;

  // Apply a zoom step: reconfigure the compartment live (no remount, cursor and scroll
  // preserved), then report the new size outward. Returns `true` so the keybinding
  // consumes the event — otherwise the browser's own page zoom fires on ⌘= / ⌘-.
  const zoomBy = (view: EditorView, direction: "in" | "out"): boolean => {
    const px = nextFontSize(fontSize, direction);
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(fontSizeTheme(px)),
    });
    onFontSizeChange(px);
    return true;
  };

  return [
    // ⚠️ Soft wrap, unconditional. See the header — a requirement, not a setting.
    EditorView.lineWrapping,

    // Undo AND redo, as a pair.
    history(),

    // Find-within-draft. The panel is placed at the top like the editor's, so a long
    // draft's search box does not sit under the fold.
    search({ top: true }),

    // ⚠️ `editorDarkTheme` is NOT here — it is passed via CodeMirror's `theme` PROP in
    // PromptPanel.tsx. Found at Phase 2 verify-self: @uiw/react-codemirror defaults that
    // prop to "light" when omitted and wraps the view in `.cm-theme-light`, whose rules
    // beat a dark theme supplied through `extensions`; the panel rendered WHITE. Putting
    // it back here would re-break it while looking more consistent with the editor's
    // builder (which ALSO passes it as the prop — `EditorPanel.tsx`). Do not "tidy" this.
    fontSizeCompartment.of(fontSizeTheme(fontSize)),

    // ⚠️ `Prec.highest` so these win over CM6's own bindings AND the browser default.
    // The editor's builder uses the same shape for the same reason — an app-suppressing
    // chord that merely sits in the default precedence loses to the browser on ⌘=.
    Prec.highest(
      keymap.of([
        { key: "Mod-=", run: (view) => zoomBy(view, "in") },
        // Both spellings: the unshifted key reports "=" on some layouts and "+" on others.
        { key: "Mod-+", run: (view) => zoomBy(view, "in") },
        { key: "Mod--", run: (view) => zoomBy(view, "out") },
        {
          key: "Mod-0",
          run: (view) => {
            view.dispatch({
              effects: fontSizeCompartment.reconfigure(
                fontSizeTheme(DEFAULT_PROMPT_FONT_PX),
              ),
            });
            onFontSizeChange(DEFAULT_PROMPT_FONT_PX);
            return true;
          },
        },
      ]),
    ),

    // History + search bindings last: they are ordinary-precedence and must not shadow
    // the app chords above.
    keymap.of([...historyKeymap, ...searchKeymap]),
  ];
}
