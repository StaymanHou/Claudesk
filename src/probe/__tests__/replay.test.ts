import { describe, it, expect, vi } from "vitest";
import { parseCast, startReplay } from "../replay";
import { computeStats } from "../frameStats";
// Vite ?raw import: bundles the committed fixture text at build/test time —
// works in vitest and the bundler with no node:fs / @types/node dependency.
import syntheticCast from "../../../public/probe-fixtures/synthetic.cast?raw";

const V2 = [
  JSON.stringify({ version: 2, width: 80, height: 24 }),
  JSON.stringify([0.0, "o", "\x1b[31mhello"]),
  JSON.stringify([0.1, "i", "ignored-input"]),
  JSON.stringify([0.2, "o", "\x1b[0m world"]),
  JSON.stringify([0.5, "o", "!"]),
].join("\n");

describe("parseCast", () => {
  it("parses a v2 header and keeps only output events", () => {
    const c = parseCast(V2);
    expect(c.width).toBe(80);
    expect(c.height).toBe(24);
    expect(c.events).toHaveLength(3); // the "i" event is dropped
    expect(c.events[0][2]).toBe("\x1b[31mhello");
    expect(c.duration).toBeCloseTo(0.5);
  });

  it("rejects a non-v2 header (asciicast-v3 guard)", () => {
    const v3 = JSON.stringify({ version: 3, width: 80, height: 24 }) + "\n" + JSON.stringify([0, "o", "x"]);
    expect(() => parseCast(v3)).toThrow(/asciicast v2/);
  });
});

describe("startReplay", () => {
  it("writes events verbatim, in order, scheduled by absolute time", () => {
    const cast = parseCast(V2);
    const writes: string[] = [];
    const term = { write: (d: string) => writes.push(d), reset: vi.fn() };

    // controllable clock + manual rAF pump
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    const handle = startReplay(term, cast, {
      loop: false,
      getNow: () => now,
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {},
    });

    const pump = () => {
      const cb = queue.shift();
      if (cb) cb(now);
    };

    // t=0 → first event only
    pump();
    expect(writes).toEqual(["\x1b[31mhello"]);

    // advance to 0.25s → flush 0.2 event (0.1 was input, dropped)
    now = 250;
    pump();
    expect(writes).toEqual(["\x1b[31mhello", "\x1b[0m world"]);

    // advance past end → final event, then non-loop stop
    now = 600;
    pump();
    expect(writes).toEqual(["\x1b[31mhello", "\x1b[0m world", "!"]);
    expect(term.reset).not.toHaveBeenCalled(); // loop:false → no reset
    handle.stop();
  });

  it("loops with term.reset() when loop:true and the clock wraps past the end", () => {
    const cast = parseCast(V2);
    const writes: string[] = [];
    const term = { write: (d: string) => writes.push(d), reset: vi.fn() };
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    const handle = startReplay(term, cast, {
      loop: true,
      getNow: () => now,
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {},
    });
    const pump = () => queue.shift()?.(now);

    now = 600; // past the 0.5s end → flush all 3, then wrap+reset on the same tick
    pump();
    expect(writes).toEqual(["\x1b[31mhello", "\x1b[0m world", "!"]);
    expect(term.reset).toHaveBeenCalledTimes(1);

    // after wrap the clock restarts; a fresh tick at t≈0 replays event 0 again
    now = 600; // wrap reset `start` to 600, so elapsed≈0 next tick
    pump();
    expect(writes[3]).toBe("\x1b[31mhello"); // first event replayed on the new loop
    handle.stop();
  });
});

describe("committed fixture: synthetic.cast", () => {
  it("is valid asciicast-v2 and parses into output events (guards the asciinema-v3-default regression)", () => {
    const cast = parseCast(syntheticCast); // throws if header is not v2
    expect(cast.width).toBeGreaterThan(0);
    expect(cast.height).toBeGreaterThan(0);
    expect(cast.events.length).toBeGreaterThan(100);
    expect(cast.duration).toBeGreaterThan(0);
    // contains real ANSI escapes (ESC = \x1b)
    expect(cast.events.some((e) => e[2].includes("\x1b["))).toBe(true);
  });
});

describe("computeStats", () => {
  it("computes median/p95/max and infers budget + dropped from the median", () => {
    // 10 frames at ~16.7ms, two janky 40ms frames
    const deltas = [16, 17, 16, 17, 16, 17, 16, 40, 17, 40];
    const s = computeStats(deltas);
    expect(s.frames).toBe(10);
    expect(s.budgetMs).toBeGreaterThan(15);
    expect(s.budgetMs).toBeLessThan(20);
    expect(s.max).toBe(40);
    expect(s.dropped).toBe(2); // the two 40ms frames exceed 1.5× ~17ms budget
  });

  it("is safe on empty input", () => {
    const s = computeStats([]);
    expect(s.frames).toBe(0);
    expect(s.dropped).toBe(0);
  });
});
