// M10.9 WP2 — pure chord predicate for opening the Settings panel (⌘, — the macOS
// system-standard Preferences shortcut, which is why it is worth claiming despite being
// the app's first bare-⌘-punctuation chord).
//
// APP-LEVEL chord (registered in App.tsx via a capture-phase document listener, alongside
// ⌘⇧N new-workspace, ⌘⇧A dashboard, and ⌘⇧+digit workspace-switch), NOT a right-panel
// select — the Settings panel is a top-level global overlay, not a per-workspace panel.
// Reachable from BOTH scenes (picker and open workspace); the whole point of WP1's
// verdict (iii-b) was that the settings surface must be reachable with a workspace
// focused, which the retired picker strip was not.
//
// Disjoint from every existing chord (see the chord-ownership map in
// editor/paletteCommands.ts):
//   - ⌘⇧E/D/T (panel-select) / ⌘⇧N / ⌘⇧F / ⌘⇧P / ⌘⇧A are letters WITH Shift.
//   - ⌘P (finder) is a bare-⌘ LETTER; "," is punctuation.
//   - ⌘⇧1..⌘⇧9 (filmstrip switch) are digits.
//   - No existing chord uses "," at all.
//
// SHIFT MUST BE ABSENT: on a US layout ⌘⇧, is ⌘< — a distinct chord we do not own, and
// swallowing it would be exactly the "registered-with-a-no-op-handler" shape the gate's
// seam contract forbids elsewhere. Ctrl/Alt are permissive (strict only on the facts that
// define the chord), matching every sibling predicate.
//
// Pure (no React/DOM) → vitest-testable, same posture as dashboardChord.ts /
// newWorkspaceChord.ts.

import type { ChordEvent } from "../workspace/chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent}. */
export type SettingsChordEvent = ChordEvent;

/**
 * True iff `e` is the Settings chord: ⌘ + "," with Shift ABSENT.
 *
 * Matches on `e.key === ","` (the character), not `e.code === "Comma"` — consistent with
 * the other predicates in this codebase, which all read `e.key`.
 */
export function isSettingsChord(e: SettingsChordEvent): boolean {
  return e.metaKey && !e.shiftKey && e.key === ",";
}
