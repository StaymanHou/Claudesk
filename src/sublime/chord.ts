// WP8 Phase 2 — in-app Sublime-Text-pop chord matcher.
//
// The Sublime Text hotkey is an in-app keybinding (NOT an OS-global shortcut): a
// plain webview `keydown` handler that fires only while Claudesk is the focused app.
// This pure predicate identifies the ⌘⇧O chord so the handler stays a one-liner and
// the match logic is unit-testable without a DOM.
//
// WP5 reassigned this chord ⌘⇧E → ⌘⇧O: ⌘⇧E now selects the Editor panel (the
// RightPanelHost panel-select scheme — ⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal). The
// Sublime *Text* pop is transitional and removed entirely at WP8 once the in-app
// editor proves parity; until then it lives on ⌘⇧O. (Sublime *Merge*, by contrast,
// is a permanent button with NO chord — see SublimeToolbar.)
//
// The displayed combo (for the button hint) is SUBLIME_CHORD_LABEL.

/** Human-facing label for the Sublime-Text-pop chord, shown on the right-panel button. */
export const SUBLIME_CHORD_LABEL = "⌘⇧O";

/** A minimal keydown shape — just the fields the matcher reads. */
export interface ChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the Sublime-Text-pop chord: Cmd+Shift+O (macOS-only app).
 *
 * `key` is matched case-insensitively because Shift makes the browser report `"O"`.
 * Ctrl/Alt are intentionally NOT required-absent — Cmd+Shift+O with extra modifiers
 * is rare and harmless; we keep the predicate permissive on those and strict on the
 * three that define the chord. (WP5: was `"e"`; ⌘⇧E is now the Editor-panel chord.)
 */
export function isSublimeChord(e: ChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "o";
}
