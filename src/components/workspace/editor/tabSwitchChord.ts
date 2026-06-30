// WP12 — pure chord predicate for switching editor tabs by number (⌘1..⌘9).
//
// Bare ⌘+digit activates the Nth open file tab (⌘1 = first, … ⌘9 = last; n past the
// strip clamps to the last tab — the open-files reducer's activate-index handles the
// clamp). No Shift, so it is disjoint from the whole ⌘⇧ family (⌘⇧E/D/T panel-select,
// ⌘⇧P palette, ⌘⇧F search) AND from bare ⌘P (finder — a letter, not a digit). CM6,
// the browser, and the OS don't bind bare ⌘+digit, so there is no collision to manage.
//
// Pure (no React/DOM) → vitest-testable, same posture as finderChord.ts /
// searchChord.ts / paletteCommands.ts. REGISTERED in RightPanelHost via the WP1
// capture-phase document listener so it fires while focus is inside a CodeMirror
// editor. See the chord-ownership map in editor/paletteCommands.ts.

import type { ChordEvent } from "../chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent} (Theme H: shared, not re-declared). */
export type TabSwitchChordEvent = ChordEvent;

/**
 * If `e` is a tab-switch chord (bare ⌘ + a digit 1–9), return that digit (1-based);
 * otherwise null.
 *
 * Shift is REQUIRED-ABSENT (keeps it disjoint from the ⌘⇧ chords); ⌘0 is intentionally
 * NOT a tab chord (0 would be a no-op index and ⌘0 is the editor's font-reset). Ctrl/
 * Alt are permissive (strict only on the two facts that define the chord: ⌘ present,
 * Shift absent, key is 1–9).
 */
export function tabSwitchIndex(e: TabSwitchChordEvent): number | null {
  if (!e.metaKey || e.shiftKey) return null;
  if (e.key.length === 1 && e.key >= "1" && e.key <= "9") {
    return Number(e.key);
  }
  return null;
}
