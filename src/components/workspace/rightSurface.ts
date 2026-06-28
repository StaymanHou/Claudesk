// M6 WP10 — which RIGHT-half surface holds keyboard focus: the second terminal panel,
// or something else (the editor / diff / file tree).
//
// WP4 shipped focus-scoped ⌘+/⌘−/⌘0 zoom routed by `deriveFocusHalf` (left CC terminal
// vs right panel). The right half is one of several panels (Editor / Diff / Terminal);
// only the TERMINAL panel wants the chord-driven font zoom (the editor has its own CM6
// keymap). So when focus is in the right half, WP10 needs a finer read: is the focused
// element inside the second-terminal pane?
//
// This is the pure seam (sibling of focusHalf.ts): given a focus target node, decide
// whether it lives inside the right-panel terminal. The React side (Workspace.tsx's
// capture-phase zoom router) calls this only after `deriveFocusHalf === "right"`, so the
// answer disambiguates terminal-vs-editor within the right half.
//
// Why a DOM-ancestry read (not lifted panel state): the terminal pane's elements are
// only focusable when the terminal panel is FRONT — the editor/diff slots are
// `display:none`, so their descendants can't hold focus. Therefore "focus is inside the
// term-pane" already means "the terminal panel is the focused right-half surface"; no
// `RightPanelHost.panel` state needs lifting up to Workspace.
//
// Duck-typed `closest()` (does the target have one?) rather than `instanceof Element`:
// the repo's vitest env is node (no DOM globals — `Element` is undefined there), so
// structural narrowing keeps this seam unit-testable with minimal fakes while behaving
// identically against real nodes. Mirrors deriveFocusHalf exactly.

export type RightSurface = "terminal" | "other";

/** The data-testid on the second-terminal pane host (XtermPane testId via TerminalPane). */
export const TERM_PANE_SELECTOR = '[data-testid="term-pane"]';

/**
 * Given a focus event target (or any node), return `"terminal"` if it lives inside the
 * right-panel terminal pane (`[data-testid="term-pane"]`), else `"other"`. Non-Elements
 * (text nodes, window, null) → `"other"`.
 *
 * Intended to be called only when `deriveFocusHalf(target) === "right"`, so `"other"`
 * there means "the editor/diff/tree holds focus" and the existing CM6 zoom keymap
 * should handle the chord unchanged.
 */
export function deriveRightSurface(target: EventTarget | null): RightSurface {
  // Non-Elements (text nodes, window, null, the document) have no `closest` → other.
  if (!target || typeof (target as Element).closest !== "function") {
    return "other";
  }
  return (target as Element).closest(TERM_PANE_SELECTOR) ? "terminal" : "other";
}
