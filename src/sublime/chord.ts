// WP8 Phase 2 — in-app Sublime-pop chord matcher.
//
// The Sublime hotkey is an in-app keybinding (NOT an OS-global shortcut): a plain
// webview `keydown` handler that fires only while Claudesk is the focused app. This
// pure predicate identifies the ⌘⇧E chord so the handler stays a one-liner and the
// match logic is unit-testable without a DOM.
//
// The displayed combo (for the button hint) is SUBLIME_CHORD_LABEL.

/** Human-facing label for the Sublime-pop chord, shown on the right-panel button. */
export const SUBLIME_CHORD_LABEL = "⌘⇧E";

/** A minimal keydown shape — just the fields the matcher reads. */
export interface ChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the Sublime-pop chord: Cmd+Shift+E (macOS-only app).
 *
 * `key` is matched case-insensitively because Shift makes the browser report `"E"`.
 * Ctrl/Alt are intentionally NOT required-absent — Cmd+Shift+E with extra modifiers
 * is rare and harmless; we keep the predicate permissive on those and strict on the
 * three that define the chord.
 */
export function isSublimeChord(e: ChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "e";
}
