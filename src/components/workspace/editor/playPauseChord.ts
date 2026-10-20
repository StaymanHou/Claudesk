// M16 WP3 — pure chord predicate for the review player's play/pause: bare Space, the
// convention every media player shares (spec assumption A-2).
//
// Like frameStepChord.ts it is called ONLY from MediaPlayer's focused-wrapper `onKeyDown`, so
// it never sees a keystroke meant for the editor or a terminal. Any modifier → null.
//
// Pure (no React/DOM) → vitest-testable, same posture as the other *Chord.ts modules.

import type { ChordEvent } from "../chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent}. */
export type PlayPauseChordEvent = ChordEvent;

/** True for a bare Space. */
export function isPlayPauseChord(e: PlayPauseChordEvent): boolean {
  return e.key === " " && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey;
}
