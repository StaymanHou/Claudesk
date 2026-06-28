// M6 WP11 Phase 2 — pure decision core for SCOPED ⌘W (close the focused terminal).
//
// ⌘W is already the editor close-tab chord (closeTabChord.ts, registered in
// RightPanelHost's capture-phase listener). WP11 overloads ⌘W so that when a RIGHT-PANEL
// TERMINAL holds focus, ⌘W closes THAT terminal instead of an editor tab — but only then.
// The disambiguation reuses the WP10 `deriveRightSurface` read: the term-pane's elements
// are focusable only when the terminal panel is front (the editor/diff slots are
// display:none), so "focus inside a term-pane" == "the terminal is the focused surface".
//
// This module is the PURE decision: given (is-the-chord-⌘W, is-the-focused-surface-a-
// terminal, can-we-close-it), return whether ⌘W should route to a terminal-close. The
// React side (RightPanelHost's listener) supplies the three facts and performs the close.
// Pure (no React/DOM) → vitest-testable, same posture as closeTabChord.ts / panelHost.ts.

/**
 * Decide whether a ⌘W keydown should CLOSE THE FOCUSED TERMINAL (vs fall through to the
 * editor's close-tab handler).
 *
 * Returns `true` only when ALL hold:
 *   - `isCloseChord` — the event is the ⌘W chord (caller passes `isCloseTabChord(e)`),
 *   - `terminalFocused` — the focused right-half surface is a terminal
 *     (caller passes `deriveRightSurface(activeElement) === "terminal"`),
 *   - `canClose` — closing is allowed (NOT the last terminal; caller passes
 *     `!isLastTerminal(state)`).
 *
 * When it returns `true`, the caller closes the active terminal + swallows the event
 * (preventDefault/stopPropagation) so the editor's ⌘W handler never also fires. When it
 * returns `false`, the caller leaves the existing editor ⌘W path untouched — so ⌘W in the
 * editor still closes an editor tab, and ⌘W on the LAST terminal is inert (disallow-last).
 */
export function shouldCloseTerminalOnChord(args: {
  isCloseChord: boolean;
  terminalFocused: boolean;
  canClose: boolean;
}): boolean {
  return args.isCloseChord && args.terminalFocused && args.canClose;
}
