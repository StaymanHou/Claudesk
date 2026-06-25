// QoL-WP5 — pure chord predicate for the editor's "new file" action.
//
// Bare ⌘N (no Shift) opens the new-file name input in the FileTree rail. This is the
// counterpart to WP6's ⌘⇧N "new workspace" chord (the REQUIRED-ABSENT Shift keeps the
// two mutually exclusive, so ⌘N (new file) and ⌘⇧N (new workspace) never both fire on
// one keydown). Also distinct from the ⌘P finder (different key) and the ⌘⇧E/D/T
// panel-select chords (all require Shift). The ⌘N reservation is deliberate (the
// editor-new-file / new-workspace chord pair lands coherently with WP6); it does NOT
// collide with the ⌘⇧+digit filmstrip-switch reservation (that's Shift+digit).
//
// Pure (no React/DOM) → vitest-testable. Registered in RightPanelHost via the WP1
// capture-phase document listener so it fires while focus is inside a CodeMirror editor.

/** Human-facing label for the new-file chord, shown in hints/titles. */
export const NEW_FILE_CHORD_LABEL = "⌘N";

/** A minimal keydown shape — just the fields the matcher reads (mirrors FinderChordEvent). */
export interface NewFileChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the new-file chord: bare Cmd+N (macOS-only app).
 *
 * Shift is REQUIRED-ABSENT — that is what distinguishes the new-file chord from WP6's
 * ⌘⇧N new-workspace chord, so the two never both fire on one event. `key` is matched
 * case-insensitively (defensive; without Shift the browser reports lowercase "n").
 * Ctrl/Alt are permissive (extras allowed; strict only on the two facts that define
 * the chord — meta down, shift up, key n).
 */
export function isNewFileChord(e: NewFileChordEvent): boolean {
  return e.metaKey && !e.shiftKey && e.key.toLowerCase() === "n";
}
