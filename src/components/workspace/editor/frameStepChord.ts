// M16 WP3 — pure chord predicate for the review player's frame-step: bare `,` steps back one
// frame, bare `.` steps forward (±1 s for audio). The convention of NLEs and video players.
//
// BARE keys, so they only make sense where nothing types: MediaPlayer calls this from its own
// focused-wrapper `onKeyDown`, so it can never fire while CodeMirror, the CC pane or a terminal
// has focus (those never deliver a keydown to the player). Any modifier → null: ⌘, is Settings,
// and Shift turns the keys into `<` / `>`, which are not this chord.
//
// Pure (no React/DOM) → vitest-testable, same posture as the other *Chord.ts modules.

import type { ChordEvent } from "../chordEvent";

/** A minimal keydown shape — the canonical {@link ChordEvent}. */
export type FrameStepChordEvent = ChordEvent;

/** `-1` for `,`, `+1` for `.`, otherwise null. Strict on every modifier. */
export function frameStepForChord(e: FrameStepChordEvent): -1 | 1 | null {
  if (e.metaKey || e.shiftKey || e.ctrlKey || e.altKey) return null;
  if (e.key === ",") return -1;
  if (e.key === ".") return 1;
  return null;
}
