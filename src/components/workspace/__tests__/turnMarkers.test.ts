import { describe, it, expect } from "vitest";
import {
  clampPosition,
  compact,
  isLiveMarker,
  liveMarkers,
  maxScroll,
  navState,
  positionAtNewest,
  reachableCount,
  resolvePosition,
  scrollTargetFor,
  shouldRecordTurnStart,
  stepTurn,
  type TurnMarker,
  type TurnPosition,
  type TurnViewport,
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

  it("⚠️ rejects a DISPOSED marker whose line is still non-negative — the belt, not the braces", () => {
    // ⚠️ ADDED AT VERIFY-CODIFY (2026-08-25) because a mutation probe found this uncovered:
    // deleting the `!marker.isDisposed` half of the predicate left ALL 61 tests green. Every
    // other evicted fixture sets BOTH `isDisposed: true` AND `line: -1` (which is what xterm
    // really does), so the `line >= 0` half alone caught them and the disposal half was never
    // load-bearing in any assertion. The module's comment calls the pair "belt and braces" —
    // this is the test that proves the BELT exists.
    //
    // The scenario is real, not hypothetical: xterm sets `line = -1` on disposal, but a marker
    // observed in the window BETWEEN `dispose()` and that write — or any future xterm version
    // that stops writing -1 — would present exactly this shape. Scrolling to it would target a
    // line that is no longer in the buffer while reading as a successful jump.
    expect(isLiveMarker({ id: 1, line: 42, isDisposed: true })).toBe(false);
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

// ---------------------------------------------------------------------------------------
// THE SHIPPED DEFECT, as a test. This is the red-green anchor for the whole re-plan.
// ---------------------------------------------------------------------------------------
//
// ⚠️ Measured on a LIVE CC pane 2026-08-25 (signal-trace probe), not invented:
//   markers [19, 137] · buffer.length 198 · rows 68 → maxScroll = 198 - 68 = 130
//
// The old model handed marker line 137 straight to `scrollToLine`. xterm clamped it to 130 —
// where the viewport already was — so nothing moved, the caller read the return as success,
// and the walk advanced past it. Click 2 then went to line 19 (two turns back) and click 3
// exhausted and dimmed the button. That is exactly what the operator reported at 0/1/2 turns.
//
// These tests fail against the old semantics and pass against the new ones.

describe("⚠️ THE SHIPPED DEFECT — the newest turn start is above maxScroll", () => {
  const markers = [m(1, 19), m(2, 137)];
  const viewport: TurnViewport = { length: 198, rows: 68 };

  it("maxScroll is the clamp ceiling the old model could not see", () => {
    expect(maxScroll(viewport)).toBe(130);
  });

  it("⚠️ the newest marker's line is ABOVE maxScroll — unreachable by scrolling", () => {
    expect(markers[1].line).toBeGreaterThan(maxScroll(viewport));
  });

  it("⚠️ the scroll target for the newest turn is CLAMPED, and the model says so", () => {
    // The old code passed 137 and let xterm clamp silently. The model now returns 130, so
    // the caller can compare against viewportY and know the truth.
    expect(scrollTargetFor(markers, positionAtNewest, viewport)).toBe(130);
  });

  it("⚠️ the resting position is the NEWEST turn and reads 2/2 — not 'nothing to jump to'", () => {
    expect(navState(markers, positionAtNewest)).toEqual({
      canPrev: true,
      canNext: false,
      ordinal: 2,
      total: 2,
    });
  });

  it("⚠️ ONE prev step reaches the older turn — not two clicks with a dead one first", () => {
    // The defect burned click 1 on the already-visible newest turn. Now the resting position
    // IS the newest, so the first prev goes somewhere.
    const { position, nav } = stepTurn(markers, positionAtNewest, "prev");
    expect(scrollTargetFor(markers, position, viewport)).toBe(19);
    expect(nav).toEqual({
      canPrev: false,
      canNext: true,
      ordinal: 1,
      total: 2,
    });
  });

  it("⚠️ prev then next RETURNS to the newest — the round-trip the old walk could not do", () => {
    const back = stepTurn(markers, positionAtNewest, "prev");
    const forward = stepTurn(markers, back.position, "next");
    expect(forward.position).toEqual({ index: 1 });
    expect(scrollTargetFor(markers, forward.position, viewport)).toBe(
      scrollTargetFor(markers, positionAtNewest, viewport),
    );
  });
});

describe("maxScroll", () => {
  it("is length - rows", () => {
    expect(maxScroll({ length: 198, rows: 68 })).toBe(130);
  });

  it("is 0 when the buffer exactly fills the viewport — nothing can scroll", () => {
    expect(maxScroll({ length: 68, rows: 68 })).toBe(0);
  });

  it("⚠️ FLOORS AT 0 for a buffer shorter than the viewport — never negative", () => {
    // A negative ceiling would clamp every target to a negative line, and a negative line
    // fed to scrollToLine scrolls to the top while reading as success.
    expect(maxScroll({ length: 10, rows: 68 })).toBe(0);
  });
});

describe("resolvePosition / clampPosition — the eviction guard (AC-7)", () => {
  const markers = [m(1, 10), m(2, 20), m(3, 30)];

  it("a null position resolves to the NEWEST (last) index", () => {
    expect(resolvePosition(markers, positionAtNewest)).toBe(2);
  });

  it("an in-range index resolves to itself", () => {
    expect(resolvePosition(markers, { index: 1 })).toBe(1);
  });

  it("⚠️ an index past the end is clamped — the post-eviction case", () => {
    // Position captured when 5 markers were live; 2 have since been evicted.
    expect(resolvePosition(markers, { index: 4 })).toBe(2);
  });

  it("a negative index is clamped to 0", () => {
    expect(resolvePosition(markers, { index: -3 })).toBe(0);
  });

  it("⚠️ returns null on an empty list — never an index into nothing", () => {
    expect(resolvePosition([], { index: 2 })).toBeNull();
  });

  it("⚠️ returns null when every marker is evicted", () => {
    expect(resolvePosition([evicted(1), evicted(2)], { index: 1 })).toBeNull();
  });

  it("ignores evicted markers when resolving against the LIVE list", () => {
    // 3 recorded, 1 evicted → live length 2, so the newest live index is 1.
    expect(resolvePosition([m(1, 10), evicted(2), m(3, 30)])).toBe(1);
  });

  it("clampPosition returns a storable position, resetting to newest when empty", () => {
    expect(clampPosition(markers, { index: 9 })).toEqual({ index: 2 });
    expect(clampPosition([], { index: 9 })).toEqual(positionAtNewest);
  });
});

describe("stepTurn — bidirectional, position-based (AC-1)", () => {
  const markers = [m(1, 10), m(2, 20), m(3, 30), m(4, 40)];

  it("prev steps one turn EARLIER (lower index)", () => {
    expect(stepTurn(markers, { index: 2 }, "prev").position).toEqual({
      index: 1,
    });
  });

  it("next steps one turn LATER (higher index)", () => {
    expect(stepTurn(markers, { index: 1 }, "next").position).toEqual({
      index: 2,
    });
  });

  it("from the resting position, prev goes to the second-newest", () => {
    expect(stepTurn(markers, positionAtNewest, "prev").position).toEqual({
      index: 2,
    });
  });

  it("⚠️ CLAMPS at the oldest — does NOT wrap to the newest", () => {
    // A wrap would teleport the reader from the top of the scrollback to the bottom.
    expect(stepTurn(markers, { index: 0 }, "prev").position).toEqual({
      index: 0,
    });
  });

  it("⚠️ CLAMPS at the newest — does NOT wrap to the oldest", () => {
    expect(stepTurn(markers, { index: 3 }, "next").position).toEqual({
      index: 3,
    });
  });

  it("⚠️ BOTH DIRECTIONS round-trip — step away and back returns to the start", () => {
    // The F12 lesson: a two-way thing tested one way has an untested half.
    for (const [from, first, second] of [
      [{ index: 2 }, "prev", "next"],
      [{ index: 2 }, "next", "prev"],
    ] as const) {
      const away = stepTurn(markers, from, first);
      const home = stepTurn(markers, away.position, second);
      expect(home.position).toEqual(from);
    }
  });

  it("walks the whole list with prev, then all the way back with next", () => {
    let pos: TurnPosition = positionAtNewest;
    const down: number[] = [];
    for (let i = 0; i < 3; i++) {
      pos = stepTurn(markers, pos, "prev").position;
      down.push(pos.index as number);
    }
    expect(down).toEqual([2, 1, 0]);
    const up: number[] = [];
    for (let i = 0; i < 3; i++) {
      pos = stepTurn(markers, pos, "next").position;
      up.push(pos.index as number);
    }
    expect(up).toEqual([1, 2, 3]);
  });

  it("resets to the resting position when nothing is reachable", () => {
    const { position, nav } = stepTurn([], positionAtNewest, "prev");
    expect(position).toEqual(positionAtNewest);
    expect(nav.total).toBe(0);
  });

  it("⚠️ re-clamps a stale index BEFORE stepping — eviction cannot strand it", () => {
    // index 9 against a 4-long live list resolves to 3, so prev lands on 2 (not 8).
    expect(stepTurn(markers, { index: 9 }, "prev").position).toEqual({
      index: 2,
    });
  });

  it("carries the nav state for the new position", () => {
    const { nav } = stepTurn(markers, { index: 1 }, "prev");
    expect(nav).toEqual({
      canPrev: false,
      canNext: true,
      ordinal: 1,
      total: 4,
    });
  });

  it("is pure — same inputs, same answer; input not mutated", () => {
    const before = JSON.stringify(markers);
    const a = stepTurn(markers, { index: 2 }, "prev");
    const b = stepTurn(markers, { index: 2 }, "prev");
    expect(a).toEqual(b);
    expect(JSON.stringify(markers)).toBe(before);
  });

  it("⚠️ selection takes NO viewport — geometry must not pick the turn (AC-1)", () => {
    // The whole signature is the assertion: stepTurn has no viewport parameter, so an
    // already-visible turn cannot be skipped. Proven here by stepping onto a turn whose
    // line is above maxScroll and confirming it IS selected.
    const tight: TurnViewport = { length: 100, rows: 68 }; // maxScroll 32
    const ms = [m(1, 5), m(2, 90)];
    const { position } = stepTurn(ms, { index: 0 }, "next");
    expect(position).toEqual({ index: 1 });
    // ...and only the SCROLL is clamped.
    expect(scrollTargetFor(ms, position, tight)).toBe(32);
  });
});

describe("scrollTargetFor — geometry enters here and only here (AC-2)", () => {
  const markers = [m(1, 10), m(2, 137)];
  const roomy: TurnViewport = { length: 500, rows: 68 }; // maxScroll 432

  it("returns the marker's line when it is reachable", () => {
    expect(scrollTargetFor(markers, { index: 1 }, roomy)).toBe(137);
  });

  it("⚠️ clamps to maxScroll when the line is above it", () => {
    expect(
      scrollTargetFor(markers, { index: 1 }, { length: 198, rows: 68 }),
    ).toBe(130);
  });

  it("returns null when nothing is selected", () => {
    expect(scrollTargetFor([], positionAtNewest, roomy)).toBeNull();
  });

  it("⚠️ NEVER returns -1 — an evicted marker cannot become a scroll target", () => {
    // -1 would scroll to the buffer top and read as a successful jump.
    const target = scrollTargetFor(
      [m(1, 10), evicted(2)],
      positionAtNewest,
      roomy,
    );
    expect(target).toBe(10);
    expect(target).toBeGreaterThanOrEqual(0);
  });

  it("targets line 0 correctly — a top-of-buffer turn start", () => {
    expect(scrollTargetFor([m(1, 0)], positionAtNewest, roomy)).toBe(0);
  });

  it("clamps every target to 0 when the buffer cannot scroll at all", () => {
    expect(
      scrollTargetFor(markers, { index: 1 }, { length: 40, rows: 68 }),
    ).toBe(0);
  });
});

describe("navState — one source for disabled ends (AC-4) and the readout (AC-5)", () => {
  const markers = [m(1, 10), m(2, 20), m(3, 30)];

  it("⚠️ a fresh pane: BOTH ends closed, 0/0 — the disabled state, no copy needed", () => {
    expect(navState([], positionAtNewest)).toEqual({
      canPrev: false,
      canNext: false,
      ordinal: 0,
      total: 0,
    });
  });

  it("at the newest: prev open, next closed", () => {
    expect(navState(markers, positionAtNewest)).toEqual({
      canPrev: true,
      canNext: false,
      ordinal: 3,
      total: 3,
    });
  });

  it("at the oldest: prev closed, next open", () => {
    expect(navState(markers, { index: 0 })).toEqual({
      canPrev: false,
      canNext: true,
      ordinal: 1,
      total: 3,
    });
  });

  it("in the middle: both open", () => {
    expect(navState(markers, { index: 1 })).toEqual({
      canPrev: true,
      canNext: true,
      ordinal: 2,
      total: 3,
    });
  });

  it("⚠️ a single turn: both ends closed but total is 1 — distinct from the fresh pane", () => {
    // The readout must show 1/1 rather than hiding, so the operator knows a turn exists.
    expect(navState([m(1, 10)], positionAtNewest)).toEqual({
      canPrev: false,
      canNext: false,
      ordinal: 1,
      total: 1,
    });
  });

  it("counts only LIVE markers", () => {
    expect(navState([m(1, 10), evicted(2), m(3, 30)]).total).toBe(2);
  });

  it("⚠️ ordinal and canPrev/canNext AGREE at every position — they share one derivation", () => {
    // The failure this pins: a UI showing "1/3" beside an enabled prev button.
    for (let i = 0; i < 3; i++) {
      const nav = navState(markers, { index: i });
      expect(nav.canPrev).toBe(nav.ordinal > 1);
      expect(nav.canNext).toBe(nav.ordinal < nav.total);
    }
  });

  it("⚠️ agrees with what stepTurn reports at the same position", () => {
    const stepped = stepTurn(markers, positionAtNewest, "prev");
    expect(stepped.nav).toEqual(navState(markers, stepped.position));
  });
});

describe("the realistic long-turn scenario", () => {
  it("a 5-turn session steps back through every start, then forward again", () => {
    const markers = [m(1, 0), m(2, 90), m(3, 210), m(4, 350), m(5, 512)];
    const viewport: TurnViewport = { length: 580, rows: 68 }; // maxScroll 512
    let pos: TurnPosition = positionAtNewest;
    const visited: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      pos = stepTurn(markers, pos, "prev").position;
      visited.push(scrollTargetFor(markers, pos, viewport));
    }
    expect(visited).toEqual([350, 210, 90, 0]);
    expect(navState(markers, pos).canPrev).toBe(false);
    // ...and all the way back.
    for (let i = 0; i < 4; i++) pos = stepTurn(markers, pos, "next").position;
    expect(pos).toEqual({ index: 4 });
    expect(navState(markers, pos).canNext).toBe(false);
  });

  it("older starts evicted mid-session: navigation stays inside the SURVIVING list", () => {
    const markers = [evicted(1), evicted(2), m(3, 12), m(4, 140)];
    const viewport: TurnViewport = { length: 200, rows: 68 }; // maxScroll 132
    expect(navState(markers, positionAtNewest)).toEqual({
      canPrev: true,
      canNext: false,
      ordinal: 2,
      total: 2,
    });
    const { position } = stepTurn(markers, positionAtNewest, "prev");
    expect(scrollTargetFor(markers, position, viewport)).toBe(12);
    expect(navState(markers, position).canPrev).toBe(false);
  });

  it("⚠️ a new turn arriving resets to the newest (AC-6)", () => {
    // The caller applies `positionAtNewest` on the turn-recorded edge; this pins what that
    // then reads as — the newest of the GROWN list, with next closed.
    const before = [m(1, 10), m(2, 60)];
    const scrolledBack = stepTurn(before, positionAtNewest, "prev").position;
    expect(scrolledBack).toEqual({ index: 0 });
    const after = [...before, m(3, 130)];
    const nav = navState(after, positionAtNewest);
    expect(nav).toEqual({
      canPrev: true,
      canNext: false,
      ordinal: 3,
      total: 3,
    });
  });
});
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
