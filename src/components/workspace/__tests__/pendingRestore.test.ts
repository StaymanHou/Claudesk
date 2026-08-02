import { describe, expect, it } from "vitest";
import {
  hasPending,
  NO_PENDING,
  pendingNext,
  type PendingEvent,
  type PendingRestore,
} from "../docs/pendingRestore";

// M11 WP4 P3.3 — the hold-and-retry machine, asserted as VALUES.
//
// ⚠️ This file exists because the Phase 2 verify-self subagent named this seam as WP4's
// highest risk: Phase 2 proved `planRestore` REPORTS a deferral, but nothing proved the
// caller HOLDS the offset and retries. It flagged it as where the
// `strictmode-remount-deadlocks-an-unreleased-fetch-latch` class hides — a latch set on one
// path and never released on another, which in this very component previously produced a
// permanently blank panel while every automated gate was green.
//
// The sequences below are the ones a hook cannot be trusted to get right by inspection:
// deferral, StrictMode remount, and doc-switch cancellation.

/** Fold a sequence of events over the machine — how the real effect drives it. */
function run(
  events: readonly PendingEvent[],
  from: PendingRestore = NO_PENDING,
): PendingRestore {
  return events.reduce(pendingNext, from);
}

describe("the happy path", () => {
  it("hold then applied returns to idle", () => {
    expect(run([{ type: "hold", offset: 600 }, { type: "applied" }])).toEqual(
      NO_PENDING,
    );
  });

  it("holding records the offset", () => {
    expect(run([{ type: "hold", offset: 600 }])).toEqual({ offset: 600 });
    expect(hasPending({ offset: 600 })).toBe(true);
    expect(hasPending(NO_PENDING)).toBe(false);
  });
});

describe("⚠️ deferral — the load-bearing transition", () => {
  // If this returned NO_PENDING, the symptom would be "I switched panels and came back to
  // the top of the document" — and no happy-path test would notice.
  it("a deferred apply LEAVES THE OFFSET HELD", () => {
    expect(run([{ type: "hold", offset: 600 }, { type: "deferred" }])).toEqual({
      offset: 600,
    });
  });

  it("repeated deferrals keep holding — a long stint on another panel loses nothing", () => {
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "deferred" },
        { type: "deferred" },
        { type: "deferred" },
      ]),
    ).toEqual({ offset: 600 });
  });

  it("the full defer-then-succeed sequence ends idle with the offset consumed exactly once", () => {
    // hidden reload → retry while still hidden → panel re-fronted → applied.
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "deferred" },
        { type: "deferred" },
        { type: "applied" },
      ]),
    ).toEqual(NO_PENDING);
  });
});

describe("a null capture must not clobber a held offset", () => {
  // `captureScroll` returns `null` when the box was unmeasurable and nothing was previously
  // held. That "nothing to record" result must not erase an offset already waiting — the
  // same clobber hazard Phase 2 guards on the capture side, restated on the hold side.
  it("hold(null) over a held offset preserves it", () => {
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "hold", offset: null },
      ]),
    ).toEqual({ offset: 600 });
  });

  it("hold(null) from idle stays idle", () => {
    expect(run([{ type: "hold", offset: null }])).toEqual(NO_PENDING);
  });

  it("a genuine 0 IS holdable — the reader really at the top", () => {
    // 0 and null are different states; collapsing them would make "at the top" unholdable.
    expect(run([{ type: "hold", offset: 0 }])).toEqual({ offset: 0 });
    expect(hasPending({ offset: 0 })).toBe(true);
  });
});

describe("reset — a held offset belongs to the doc it came from", () => {
  it("switching documents clears the pending offset", () => {
    // Applying 600px into a freshly opened, unrelated doc would drop the reader into the
    // middle of something they just chose to open from the top.
    expect(run([{ type: "hold", offset: 600 }, { type: "reset" }])).toEqual(
      NO_PENDING,
    );
  });

  it("reset from idle is a no-op", () => {
    expect(run([{ type: "reset" }])).toEqual(NO_PENDING);
  });

  it("a hold after a reset is honored", () => {
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "reset" },
        { type: "hold", offset: 120 },
      ]),
    ).toEqual({ offset: 120 });
  });
});

// ── Codified at verify-codify (P3.verify-codify) ────────────────────────────────
// The operator dogfooded this on the claudesk repo itself (P3.verify-human.4) under REAL CC
// churn — many rapid writes inside the 200ms debounce window — and approved it. That is the
// actual use case `SURFACE-2026-07-07` describes, and it had **no automated coverage**: every
// other test here drives one tidy cycle, and the live checks mutated a fixture by hand at a
// controlled pace.
//
// What a burst does to this machine: each debounced batch yields a `"content"` decision, which
// captures and HOLDS, then the retry applies. Interleavings that matter are (a) several holds
// before any apply (the reader's original offset must win, not the last write's), and (b) a
// hold arriving between an apply and the next render.
describe("rapid CC churn — many writes inside/around the debounce window", () => {
  it("a burst of holds before any apply keeps the FIRST offset, not the last", () => {
    // Successive reloads each re-capture. `captureScroll` returns the live scrollTop when
    // measurable, so during a burst the panel is scrolled where the READER left it — every
    // capture reads the same place. Modeled here as repeated holds of the same offset: the
    // invariant is that the machine neither drops it nor accumulates junk.
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "hold", offset: 600 },
        { type: "hold", offset: 600 },
      ]),
    ).toEqual({ offset: 600 });
  });

  it("a long alternating burst converges to idle with the offset consumed exactly once", () => {
    // hold→apply per batch, ten batches — the steady state during a CC turn. If any arm
    // leaked, the machine would end holding a stale offset and the next legitimate restore
    // would fight it.
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({ type: "hold", offset: 600 }, { type: "applied" });
    }
    expect(run(events as PendingEvent[])).toEqual(NO_PENDING);
  });

  it("a burst that lands entirely while HIDDEN holds the offset through every deferral", () => {
    // The dogfood case crossed with the hidden-panel case: CC writes repeatedly while the
    // operator is on another panel. Every apply defers; the offset must survive all of them
    // and still be there when the panel is re-fronted.
    const events: PendingEvent[] = [{ type: "hold", offset: 1200 }];
    for (let i = 0; i < 8; i++) {
      events.push({ type: "hold", offset: null }, { type: "deferred" });
    }
    expect(run(events)).toEqual({ offset: 1200 });
    // …and the eventual apply consumes it.
    expect(run([...events, { type: "applied" }])).toEqual(NO_PENDING);
  });

  it("a reset mid-burst (reader switches docs while CC writes) drops the stale offset", () => {
    // Without this the reader would open a different doc and get scrolled to the previous
    // doc's position by an in-flight restore.
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "hold", offset: 600 },
        { type: "reset" },
        { type: "hold", offset: 40 },
        { type: "applied" },
      ]),
    ).toEqual(NO_PENDING);
  });
});

describe("⚠️ StrictMode and idempotence — the sequences a hook gets wrong", () => {
  // The shape of the predecessor bug: a value set before an await, then the effect torn down
  // and remounted. Nothing here is set-once, so there is no latch to deadlock — this asserts
  // that property rather than assuming it.
  it("a double-applied (StrictMode double-invoke) does not resurrect the offset", () => {
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "applied" },
        { type: "applied" },
      ]),
    ).toEqual(NO_PENDING);
  });

  it("a deferred AFTER an applied does not resurrect a consumed offset", () => {
    // Ordering hazard: a stale retry arriving after a successful write must not re-hold.
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "applied" },
        { type: "deferred" },
      ]),
    ).toEqual(NO_PENDING);
  });

  it("a re-hold after applying starts a fresh cycle", () => {
    expect(
      run([
        { type: "hold", offset: 600 },
        { type: "applied" },
        { type: "hold", offset: 900 },
      ]),
    ).toEqual({ offset: 900 });
  });

  it("every event is total from idle — no undefined state", () => {
    const events: PendingEvent[] = [
      { type: "hold", offset: null },
      { type: "applied" },
      { type: "deferred" },
      { type: "reset" },
    ];
    for (const e of events) {
      const next = pendingNext(NO_PENDING, e);
      expect(next).toBeDefined();
      expect(next.offset).toBeNull();
    }
  });

  it("does not mutate the state it is given", () => {
    const state: PendingRestore = { offset: 600 };
    const snapshot = JSON.stringify(state);
    pendingNext(state, { type: "applied" });
    pendingNext(state, { type: "deferred" });
    pendingNext(state, { type: "reset" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
