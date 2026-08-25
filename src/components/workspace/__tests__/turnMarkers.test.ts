import { describe, it, expect } from "vitest";
import {
  compact,
  initialWalkState,
  isLiveMarker,
  liveMarkers,
  inertAfter,
  nextJump,
  reachableCount,
  resetWalk,
  shouldRecordTurnStart,
  type TurnMarker,
} from "../turnMarkers";

/**
 * Build a live marker. `line` is the buffer line the caller would hand to
 * `term.scrollToLine`.
 */
const m = (id: number, line: number): TurnMarker => ({
  id,
  line,
  isDisposed: false,
});

/**
 * Build an EVICTED marker the way xterm actually leaves one: disposed AND `line === -1`.
 * ⚠️ Using a realistic -1 (rather than keeping the old line) is the point — a model that
 * only checked `isDisposed` would hand -1 to scrollToLine and scroll to the buffer top.
 */
const evicted = (id: number): TurnMarker => ({
  id,
  line: -1,
  isDisposed: true,
});

describe("isLiveMarker", () => {
  it("accepts a live marker", () => {
    expect(isLiveMarker(m(1, 40))).toBe(true);
  });

  it("accepts line 0 — the very top of the buffer is a valid target", () => {
    expect(isLiveMarker(m(1, 0))).toBe(true);
  });

  it("rejects a disposed marker", () => {
    expect(isLiveMarker(evicted(1))).toBe(false);
  });

  it("rejects a negative line even when isDisposed is somehow false", () => {
    // Defensive: the two fields normally agree, but -1 is the value that would silently
    // scroll to the top and read as a successful jump.
    expect(isLiveMarker({ id: 1, line: -1, isDisposed: false })).toBe(false);
  });
});

describe("liveMarkers / compact / reachableCount", () => {
  it("drops evicted markers and preserves oldest→newest order", () => {
    const list = [m(1, 10), evicted(2), m(3, 300), evicted(4), m(5, 900)];
    expect(liveMarkers(list).map((x) => x.line)).toEqual([10, 300, 900]);
  });

  it("compact agrees with liveMarkers — one definition of 'live'", () => {
    const list = [m(1, 10), evicted(2), m(3, 300)];
    expect(compact(list)).toEqual(liveMarkers(list));
  });

  it("does not mutate its input", () => {
    const list = [m(1, 10), evicted(2)];
    const copy = [...list];
    liveMarkers(list);
    compact(list);
    expect(list).toEqual(copy);
  });

  it("counts only reachable markers", () => {
    expect(reachableCount([m(1, 10), evicted(2), m(3, 30)])).toBe(2);
    expect(reachableCount([])).toBe(0);
    expect(reachableCount([evicted(1), evicted(2)])).toBe(0);
  });
});

describe("nextJump — the backward walk", () => {
  it("first activation targets the NEWEST turn start", () => {
    const list = [m(1, 100), m(2, 500), m(3, 900)];
    const out = nextJump(list, initialWalkState);
    expect(out).toEqual({ kind: "scroll", line: 900, next: { cursor: 0 } });
  });

  it("walks backward newest → older → oldest on repeat activations", () => {
    const list = [m(1, 100), m(2, 500), m(3, 900)];

    const first = nextJump(list, initialWalkState);
    expect(first).toMatchObject({ kind: "scroll", line: 900 });

    const second = nextJump(list, first.next);
    expect(second).toMatchObject({ kind: "scroll", line: 500 });

    const third = nextJump(list, second.next);
    expect(third).toMatchObject({ kind: "scroll", line: 100 });
  });

  it("⚠️ goes INERT at the oldest — it must not wrap back to the newest", () => {
    // No-wrap is the deliberate choice (spec Assumed #2): wrapping teleports the reader
    // from the top of the scrollback back to the bottom, which reads as a bug.
    const list = [m(1, 100), m(2, 500)];
    const s1 = nextJump(list, initialWalkState); // → 500 (newest)
    const s2 = nextJump(list, s1.next); // → 100 (oldest)
    const s3 = nextJump(list, s2.next); // → nothing

    expect(s2).toMatchObject({ kind: "scroll", line: 100 });
    expect(s3.kind).toBe("none");
    expect(s3).toMatchObject({ reason: "at-oldest" });
  });

  it("holds position at the oldest — a repeat click is a stable no-op", () => {
    const list = [m(1, 100), m(2, 500)];
    let st = nextJump(list, nextJump(list, initialWalkState).next).next;
    for (let i = 0; i < 3; i++) {
      const out = nextJump(list, st);
      expect(out).toMatchObject({ kind: "none", reason: "at-oldest" });
      st = out.next;
    }
    // Still parked on the oldest, not reset to null (which would re-jump to newest).
    expect(st).toEqual({ cursor: 1 });
  });

  it("reports no-markers on a fresh session", () => {
    const out = nextJump([], initialWalkState);
    expect(out).toEqual({
      kind: "none",
      reason: "no-markers",
      next: initialWalkState,
    });
  });

  it("reports no-markers — and RESETS — when every marker has been evicted", () => {
    // AC-5 + AC-6: reachable even at scrollback 10000, since 10000 is still a bound.
    const out = nextJump([evicted(1), evicted(2)], { cursor: 1 });
    expect(out).toMatchObject({ kind: "none", reason: "no-markers" });
    expect(out.next).toEqual(initialWalkState);
  });

  it("skips evicted markers when choosing a target", () => {
    const list = [m(1, 100), evicted(2), m(3, 900)];
    const first = nextJump(list, initialWalkState);
    expect(first).toMatchObject({ kind: "scroll", line: 900 });
    // The evicted middle marker is not a step in the walk.
    expect(nextJump(list, first.next)).toMatchObject({
      kind: "scroll",
      line: 100,
    });
  });

  it("⚠️ never yields -1 as a scroll target, even mid-walk after evictions", () => {
    // The failure this guards: handing -1 to scrollToLine jumps to the buffer top and
    // looks like a successful jump.
    const list = [evicted(1), m(2, 250), evicted(3)];
    let st = initialWalkState;
    for (let i = 0; i < 4; i++) {
      const out = nextJump(list, st);
      if (out.kind === "scroll") expect(out.line).toBeGreaterThanOrEqual(0);
      st = out.next;
    }
  });

  it("re-clamps a stale cursor left over from a longer list", () => {
    // The reader jumped 4 turns back, then the buffer trimmed to 2 live markers. The
    // cursor must not strand: it re-clamps against the CURRENT live list.
    const out = nextJump([m(1, 10), m(2, 20)], { cursor: 7 });
    expect(out).toMatchObject({ kind: "none", reason: "at-oldest" });
    expect(out.next).toEqual({ cursor: 1 });
  });

  it("defaults to the initial state when no walk state is passed", () => {
    const list = [m(1, 100), m(2, 700)];
    expect(nextJump(list)).toMatchObject({ kind: "scroll", line: 700 });
  });

  it("handles a single marker: jump to it, then inert", () => {
    const list = [m(1, 42)];
    const first = nextJump(list, initialWalkState);
    expect(first).toMatchObject({ kind: "scroll", line: 42 });
    expect(nextJump(list, first.next)).toMatchObject({
      kind: "none",
      reason: "at-oldest",
    });
  });

  it("is pure — repeated calls with the same state give the same answer", () => {
    const list = [m(1, 100), m(2, 500)];
    expect(nextJump(list, initialWalkState)).toEqual(
      nextJump(list, initialWalkState),
    );
  });

  it("does not mutate the marker list", () => {
    const list = [m(1, 100), evicted(2), m(3, 900)];
    const copy = [...list];
    nextJump(list, initialWalkState);
    expect(list).toEqual(copy);
  });

  it("targets a line of 0 correctly (top-of-buffer turn start)", () => {
    // Guards an `if (line)` / falsy-zero bug in any future refactor.
    expect(nextJump([m(1, 0)], initialWalkState)).toMatchObject({
      kind: "scroll",
      line: 0,
    });
  });
});

describe("resetWalk", () => {
  it("returns to the not-walking state so the next jump targets the newest", () => {
    const list = [m(1, 100), m(2, 500)];
    const walked = nextJump(list, initialWalkState).next;
    expect(walked).not.toEqual(initialWalkState);

    // A new turn starts → reset → the next activation goes to the newest again.
    expect(resetWalk()).toEqual(initialWalkState);
    expect(nextJump(list, resetWalk())).toMatchObject({
      kind: "scroll",
      line: 500,
    });
  });
});

describe("the realistic long-turn scenario", () => {
  it("a 5-turn session walks back through every start in order", () => {
    // Lines chosen to resemble a real session: long turns, so the gaps are large.
    const list = [m(1, 12), m(2, 480), m(3, 1_150), m(4, 3_990), m(5, 7_720)];
    const seen: number[] = [];
    let st = initialWalkState;
    for (let i = 0; i < 5; i++) {
      const out = nextJump(list, st);
      expect(out.kind).toBe("scroll");
      if (out.kind === "scroll") seen.push(out.line);
      st = out.next;
    }
    expect(seen).toEqual([7_720, 3_990, 1_150, 480, 12]);
    expect(nextJump(list, st)).toMatchObject({
      kind: "none",
      reason: "at-oldest",
    });
  });

  it("older starts evicted mid-session: the walk stops at the oldest SURVIVING one", () => {
    // scrollback is a bound even at 10000 — the two oldest turns have scrolled out.
    const list = [
      evicted(1),
      evicted(2),
      m(3, 1_150),
      m(4, 3_990),
      m(5, 7_720),
    ];
    const seen: number[] = [];
    let st = initialWalkState;
    for (let i = 0; i < 3; i++) {
      const out = nextJump(list, st);
      if (out.kind === "scroll") seen.push(out.line);
      st = out.next;
    }
    expect(seen).toEqual([7_720, 3_990, 1_150]);
    expect(nextJump(list, st)).toMatchObject({
      kind: "none",
      reason: "at-oldest",
    });
  });
});

// ── The CALLER's contract (added at the P3.verify-self.2 back-loop) ──────────────────────────
//
// ⚠️ WHY THESE EXIST. The walk above was fully proven while the LISTENER predicate — the part a
// real defect would live in — had ZERO coverage. A stale dev runtime then made the live check
// unanswerable, and there was no standing test to ask instead. That is `arch.md`'s recurring
// shape ("extracting a pure state machine proves the MACHINE, not its CALLER") and its corollary
// ("only a caller-side guard answers it"). These drive `shouldRecordTurnStart` with the real
// payload shapes the broadcaster emits.
describe("shouldRecordTurnStart — the listener's contract", () => {
  const base = { markTurnStarts: true, paneWorkspaceId: "ws-1" };

  it("records on a turn-start event for THIS pane's workspace", () => {
    expect(
      shouldRecordTurnStart({
        ...base,
        payload: { workspace_id: "ws-1", is_turn_start: true },
      }),
    ).toBe(true);
  });

  it("⚠️ does NOT record when markTurnStarts is off — the shared login-shell pane", () => {
    // XtermPane is shared with TerminalPane (`term_spawn`), which has no turns. If this guard
    // regressed, every second-terminal panel would grow markers and a meaningless affordance.
    expect(
      shouldRecordTurnStart({
        ...base,
        markTurnStarts: false,
        payload: { workspace_id: "ws-1", is_turn_start: true },
      }),
    ).toBe(false);
  });

  it("⚠️ does NOT record another workspace's turn — the event is broadcast to EVERY pane", () => {
    // `workspace-status` goes to all panes in the window; without this filter, switching
    // workspaces would scatter markers into the wrong buffers.
    expect(
      shouldRecordTurnStart({
        ...base,
        payload: { workspace_id: "ws-2", is_turn_start: true },
      }),
    ).toBe(false);
  });

  it("⚠️ does NOT record when is_turn_start is ABSENT — the stale/older-backend payload", () => {
    // This is the exact shape that made the Phase 3 live check unanswerable: a backend built
    // before the field existed emits a payload without it. Absent must mean "no marker", never a
    // wrong one — and never a crash.
    expect(
      shouldRecordTurnStart({ ...base, payload: { workspace_id: "ws-1" } }),
    ).toBe(false);
  });

  it("⚠️ does NOT record on `state: running` alone — the CRITICAL this field exists to prevent", () => {
    // `event_to_state` maps BOTH UserPromptSubmit (once per turn) and PostToolUse (many times per
    // turn) to Running. A predicate keyed on the state would mark every tool call — hundreds in a
    // measured p95 turn. The payload below is a realistic PostToolUse update.
    expect(
      shouldRecordTurnStart({
        ...base,
        payload: {
          workspace_id: "ws-1",
          is_turn_start: false,
          // Extra fields the real DTO carries; the predicate must ignore them.
          ...{ state: "running", last_event_at: 1_718_000_000_000 },
        } as never,
      }),
    ).toBe(false);
  });

  it("requires strict true — a truthy non-boolean does not qualify", () => {
    expect(
      shouldRecordTurnStart({
        ...base,
        payload: { workspace_id: "ws-1", is_turn_start: 1 as never },
      }),
    ).toBe(false);
  });

  it("a realistic full turn: ONE record across a prompt + three tool calls + a stop", () => {
    // The end-to-end shape the Rust socket test pins, asserted here on the CALLER side: exactly
    // one marker per turn, not one per tool call.
    const stream = [
      { workspace_id: "ws-1", is_turn_start: true }, // UserPromptSubmit
      { workspace_id: "ws-1", is_turn_start: false }, // PostToolUse
      { workspace_id: "ws-1", is_turn_start: false }, // PostToolUse
      { workspace_id: "ws-1", is_turn_start: false }, // PostToolUse
      { workspace_id: "ws-1", is_turn_start: false }, // Stop
    ];
    const recorded = stream.filter((payload) =>
      shouldRecordTurnStart({ ...base, payload }),
    ).length;
    expect(recorded).toBe(1);
  });
});

// ── The inert-flag machine (added at the Phase 3 verify-human F12 back-loop) ─────────────────
//
// ⚠️ THE REGRESSION THESE PIN, in the operator's words: "I clicked it before prompting CC — it
// did nothing but disabled the button itself. And then prompting CC won't re-enable it."
// The flag had ONE clearing edge (a successful jump), so a dead click on a fresh session latched
// it dimmed forever, still claiming "no earlier turn start is still in the scrollback" once turns
// existed. A lying affordance is worse than the dead click it was added to explain.
//
// ⚠️ Note what the ORIGINAL AC-5 tests covered: only the ENTERING transition. Every one of the
// 36 tests passed while the LEAVING transition did not exist. That asymmetry is the lesson.
describe("inertAfter — the jump affordance's inert flag", () => {
  it("a click that finds nothing sets inert", () => {
    expect(inertAfter("jump-found-nothing")).toBe(true);
  });

  it("a successful jump clears inert", () => {
    expect(inertAfter("jump-moved")).toBe(false);
  });

  it("⚠️ A NEW TURN clears inert — the edge whose absence was the shipped defect", () => {
    expect(inertAfter("turn-recorded")).toBe(false);
  });

  it("⚠️ THE OPERATOR'S EXACT SEQUENCE: dead click on a fresh session, then prompt CC", () => {
    // 1. Fresh workspace, no turns yet. Click → nothing to jump to → dimmed.
    let inert = inertAfter("jump-found-nothing");
    expect(inert).toBe(true);

    // 2. Prompt CC. A turn start is recorded → the button MUST come back.
    inert = inertAfter("turn-recorded");
    expect(inert).toBe(false); // ← was `true` before the fix: the button stayed dead.
  });

  it("is idempotent per event — repeats do not flip the flag", () => {
    expect(inertAfter("jump-found-nothing")).toBe(true);
    expect(inertAfter("jump-moved")).toBe(false);
    expect(inertAfter("turn-recorded")).toBe(false);
  });

  it("a long realistic session: dead click, turn, jump, exhaust, new turn", () => {
    let inert = false;
    inert = inertAfter("jump-found-nothing"); // fresh session dead click
    expect(inert).toBe(true);
    inert = inertAfter("turn-recorded"); // CC answers
    expect(inert).toBe(false);
    inert = inertAfter("jump-moved"); // jump to that turn
    expect(inert).toBe(false);
    inert = inertAfter("jump-found-nothing"); // walked past the oldest
    expect(inert).toBe(true);
    inert = inertAfter("turn-recorded"); // next turn revives it
    expect(inert).toBe(false);
  });
});
