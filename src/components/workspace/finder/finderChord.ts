// WP6 Phase 3 — pure chord predicate for the Cmd+P fuzzy file finder.
//
// Bare ⌘P (no Shift) opens the finder. This is the counterpart to
// editor/paletteCommands.ts's isPaletteChord (⌘⇧P): the REQUIRED-ABSENT Shift is
// what keeps the two chords mutually exclusive, so ⌘P (finder) and ⌘⇧P (palette)
// never both fire on one keydown. Likewise distinct from the ⌘⇧E/D/T panel-select
// chords (panelHost.panelForChord — all require Shift). See the chord-ownership map
// in paletteCommands.ts.
//
// Pure (no React/DOM) → vitest-testable. The chord is REGISTERED in RightPanelHost
// via the WP1 capture-phase document listener so it fires while focus is inside a
// CodeMirror editor.

/** Human-facing label for the finder chord, shown in hints. */
export const FINDER_CHORD_LABEL = "⌘P";

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface FinderChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the file-finder chord: bare Cmd+P (macOS-only app).
 *
 * Shift is REQUIRED-ABSENT — that is what distinguishes the finder from the
 * ⌘⇧P command palette and the ⌘⇧E/D/T panel-select chords, so no two app-level
 * predicates fire on a single event. `key` is matched case-insensitively (defensive,
 * though without Shift the browser reports lowercase "p"). Ctrl/Alt are permissive
 * (extras allowed; strict only on the two facts that define the chord).
 */
export function isFinderChord(e: FinderChordEvent): boolean {
  return e.metaKey && !e.shiftKey && e.key.toLowerCase() === "p";
}
