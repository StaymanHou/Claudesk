// WP13 — pure chord predicate for closing the active editor tab (⌘W).
//
// Bare ⌘W closes the active tab of the FOCUSED pane (Sublime/VS-Code parity),
// routed through the WP12 requestClose dirty-guard. No Shift, so it is disjoint
// from the whole ⌘⇧ family (⌘⇧E/D/T panel-select, ⌘⇧P palette, ⌘⇧F search) AND
// from bare ⌘P (finder) / ⌘1..9 (tab-switch) — those are a letter and digits, this
// is the letter "w". The OS-level ⌘W (close window) is pre-empted by the
// capture-phase handler's preventDefault, same as the other app chords. CM6 does
// not bind bare ⌘W.
//
// Pure (no React/DOM) → vitest-testable, same posture as tabSwitchChord.ts /
// finderChord.ts / searchChord.ts. REGISTERED in RightPanelHost via the WP1
// capture-phase document listener so it fires while focus is inside a CodeMirror
// editor. See the chord-ownership map in editor/paletteCommands.ts.

import type { ChordEvent } from "../chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent} (Theme H: shared, not re-declared). */
export type CloseTabChordEvent = ChordEvent;

/**
 * Whether `e` is the close-active-tab chord: bare ⌘ + the "w" key.
 *
 * Shift is REQUIRED-ABSENT (keeps it disjoint from the ⌘⇧ chords). Ctrl/Alt are
 * permissive (strict only on the two facts that define the chord: ⌘ present, Shift
 * absent, key is "w"). `key` is matched case-insensitively because the value the
 * browser reports for ⌘W can be "w" or (under some layouts) "W".
 */
export function isCloseTabChord(e: CloseTabChordEvent): boolean {
  if (!e.metaKey || e.shiftKey) return false;
  return e.key.toLowerCase() === "w";
}
