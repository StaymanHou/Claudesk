// M9 WP6a — pure chord predicate for opening the GLOBAL time-analytics dashboard
// (⌘⇧A — Analytics). This is an APP-LEVEL chord (registered in App.tsx via a
// capture-phase document listener, alongside ⌘⇧N new-workspace + ⌘⇧+digit
// workspace-switch), NOT a right-panel-select — the dashboard is a top-level global
// view, not a per-workspace panel.
//
// Disjoint from every existing chord (see the chord-ownership map in
// editor/paletteCommands.ts):
//   - ⌘⇧E/D/T (panel-select, panelHost.panelForChord) are other letters — and
//     panelForChord deliberately does NOT map "a".
//   - ⌘⇧N (new-workspace) / ⌘⇧F (search) / ⌘⇧P (palette) / ⌘⇧O (freed) are other letters.
//   - ⌘⇧1..⌘⇧9 (filmstrip workspace switch) are digit keys, not "a".
//   - bare ⌘A (select-all) requires Shift ABSENT — ⌘⇧A requires Shift PRESENT.
//
// Pure (no React/DOM) → vitest-testable, same posture as newWorkspaceChord.ts /
// workspaceSwitchChord.ts.

import type { ChordEvent } from "../chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent}. */
export type DashboardChordEvent = ChordEvent;

/**
 * True iff `e` is the dashboard chord: ⌘ + Shift + "a" (case-insensitive — with
 * Shift held, macOS reports `e.key === "A"`). Ctrl/Alt are permissive (strict only
 * on the facts that define the chord: ⌘ present, Shift present, key is "a"/"A").
 */
export function isDashboardChord(e: DashboardChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "a";
}
