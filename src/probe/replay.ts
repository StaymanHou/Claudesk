// WP4 probe — asciicast-v2 parser + replay loop for xterm.js.
//
// Research-validated (WIP §Research, Thread 3):
//  - asciicast-v2: line 1 = header JSON; each subsequent line = [time, code, data].
//    `time` is ABSOLUTE seconds-from-start (we subtract to schedule), `code === "o"` is output.
//  - Pacing model: preserve original inter-event deltas (bursty cadence IS the test) —
//    NOT a fixed cadence, which would flatten the bursts that stress the renderer.
//  - Feed each event's `data` VERBATIM to term.write — never re-split/concat bytes.
//    xterm.js is a stateful stream parser that buffers incomplete escape sequences
//    across write() calls; the recording's chunk boundaries are already parser-safe.
//
// NOTE: asciinema 3.x records asciicast-v3 by default. Probe recordings MUST be made with
// `-f asciicast-v2` so this parser is correct (v3 changes event-time to inter-event deltas).

import type { Terminal } from "@xterm/xterm";

export type CastEvent = [number, string, string];

export interface CastData {
  width: number;
  height: number;
  /** output ("o") events only, in order, with absolute timestamps. */
  events: CastEvent[];
  /** absolute time of the last event (= one loop's duration). */
  duration: number;
}

/** Parse an asciicast-v2 string. Throws on a non-v2 header. */
export function parseCast(text: string): CastData {
  const lines = text.trim().split("\n");
  if (lines.length === 0) throw new Error("empty cast");
  const header = JSON.parse(lines[0]) as {
    version: number;
    width: number;
    height: number;
  };
  if (header.version !== 2) {
    throw new Error(
      `expected asciicast v2, got v${header.version} — re-record with 'asciinema rec -f asciicast-v2'`,
    );
  }
  const events: CastEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const ev = JSON.parse(line) as CastEvent;
    if (ev[1] === "o") events.push(ev);
  }
  const duration = events.length ? events[events.length - 1][0] : 0;
  return { width: header.width, height: header.height, events, duration };
}

export interface ReplayHandle {
  stop: () => void;
}

/**
 * Replay a parsed cast into a terminal at the recorded cadence, looping forever.
 * Driven by requestAnimationFrame: on each frame, flush every event whose absolute
 * time is ≤ elapsed wall-clock. On wrap, reset the terminal and restart the clock.
 *
 * `getNow` is injectable for tests (defaults to performance.now). RAF is injectable too.
 */
export function startReplay(
  term: Pick<Terminal, "write" | "reset">,
  cast: CastData,
  opts: {
    loop?: boolean;
    getNow?: () => number;
    raf?: (cb: FrameRequestCallback) => number;
    caf?: (id: number) => void;
  } = {},
): ReplayHandle {
  const loop = opts.loop ?? true;
  const getNow = opts.getNow ?? (() => performance.now());
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((id) => cancelAnimationFrame(id));

  const { events } = cast;
  let i = 0;
  let start = getNow();
  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const elapsed = (getNow() - start) / 1000;
    while (i < events.length && events[i][0] <= elapsed) {
      term.write(events[i][2]); // verbatim — preserve chunk boundaries
      i++;
    }
    if (i >= events.length) {
      if (loop) {
        i = 0;
        start = getNow();
        term.reset();
      } else {
        stopped = true;
        return;
      }
    }
    rafId = raf(tick);
  };

  // A zero-event cast has nothing to replay — return a no-op handle rather
  // than scheduling a rAF loop that does nothing.
  if (events.length === 0) {
    return { stop: () => {} };
  }

  rafId = raf(tick);
  return {
    stop: () => {
      stopped = true;
      caf(rafId);
    },
  };
}
