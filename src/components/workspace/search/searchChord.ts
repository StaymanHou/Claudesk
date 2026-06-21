// WP7 Phase 2 — pure chord predicate for the ⌘⇧F project-wide search overlay.
//
// ⌘⇧F (Cmd+Shift+F) opens the "Find in Files" overlay. Shift is REQUIRED — that is
// what keeps it distinct from CM6's bare ⌘F in-file find (editorExtensions coreKeymap)
// AND from WP6's bare ⌘P finder, so no two app-level predicates fire on one keydown.
// The letter F also distinguishes it from the ⌘⇧E/D/T panel-select chords
// (panelHost.panelForChord) and ⌘⇧P (palette). See the chord-ownership map in
// editor/paletteCommands.ts.
//
// Pure (no React/DOM) → vitest-testable. The chord is REGISTERED in RightPanelHost
// via the WP1 capture-phase document listener so it fires while focus is inside a
// CodeMirror editor.

/** Human-facing label for the search chord, shown in the overlay placeholder. */
export const SEARCH_CHORD_LABEL = "⌘⇧F";

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface SearchChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the project-search chord: Cmd+Shift+F (macOS-only app).
 *
 * Shift is REQUIRED — distinguishes it from CM6's bare ⌘F in-file find and from WP6's
 * bare ⌘P finder, so the predicates are mutually exclusive. `key` is matched
 * case-insensitively because Shift makes the browser report "F". Ctrl/Alt are
 * permissive (extras allowed; strict only on the two facts that define the chord).
 */
export function isSearchChord(e: SearchChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "f";
}
