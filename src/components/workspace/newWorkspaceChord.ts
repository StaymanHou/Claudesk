// QoL-WP6 — pure chord predicate for opening the project picker to start a NEW
// workspace (⌘⇧N — the keyboard parity for the native "New Workspace" menu item,
// which previously displayed ⌘⇧N as label-only text).
//
// Disjoint from every existing chord (see the chord-ownership map in
// editor/paletteCommands.ts):
//   - ⌘N (editor new-file, WP5) requires Shift ABSENT — ⌘⇧N requires Shift PRESENT.
//   - ⌘⇧1..⌘⇧9 (filmstrip workspace switch) is a digit key, not "n".
//   - the ⌘⇧-letter chords (⌘⇧E/D/T/P/F) are other letters.
//
// Pure (no React/DOM) → vitest-testable, same posture as workspaceSwitchChord.ts.
// REGISTERED in App.tsx via an APP-LEVEL capture-phase document listener, gated on
// `view === "workspace-open"` (in "picker" view the full-screen picker is already
// up, so ⌘⇧N would be a no-op there anyway).

import type { ChordEvent } from "./chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent} (Theme H: shared, not re-declared). */
export type NewWorkspaceChordEvent = ChordEvent;

/**
 * True iff `e` is the new-workspace chord: ⌘ + Shift + "n" (case-insensitive — with
 * Shift held, macOS reports `e.key === "N"`). Ctrl/Alt are permissive (strict only on
 * the facts that define the chord: ⌘ present, Shift present, key is "n"/"N").
 */
export function newWorkspaceChord(e: NewWorkspaceChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "n";
}
