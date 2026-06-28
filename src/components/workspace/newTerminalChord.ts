// M6 WP11 Phase 2 — pure chord predicate for opening a NEW terminal in the right panel
// (⌘T — the keyboard parity for the ＋ button in the terminal sub-tab row).
//
// Disjoint from every existing chord (see the chord-ownership map in
// editor/paletteCommands.ts):
//   - ⌘⇧T (panel-select Terminal, WP5) requires Shift PRESENT — ⌘T requires Shift ABSENT.
//   - ⌘W (editor close-tab / WP11 scoped terminal-close) is the letter "w", not "t".
//   - ⌘1..⌘9 (editor tab-switch) are digit keys; bare ⌘P (finder) is "p".
//   - the ⌘⇧-letter chords (⌘⇧E/D/P/F) are other letters and require Shift.
//
// Pure (no React/DOM) → vitest-testable, same posture as newWorkspaceChord.ts /
// closeTabChord.ts. REGISTERED in RightPanelHost's `visible`-gated capture-phase keydown
// listener (it owns the terminal list), so it fires only for the focused workspace and
// regardless of where focus sits inside the right half.

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface NewTerminalChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * True iff `e` is the new-terminal chord: bare ⌘ + "t" (case-insensitive).
 *
 * Shift is REQUIRED-ABSENT — this is what keeps it disjoint from ⌘⇧T (panel-select
 * Terminal), exactly as ⌘W vs the ⌘⇧ family. Ctrl/Alt are permissive (strict only on the
 * facts that define the chord: ⌘ present, Shift absent, key is "t"/"T").
 */
export function newTerminalChord(e: NewTerminalChordEvent): boolean {
  if (!e.metaKey || e.shiftKey) return false;
  return e.key.toLowerCase() === "t";
}
