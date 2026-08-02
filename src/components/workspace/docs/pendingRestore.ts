// M11 WP4 P3.3 — the hold-and-retry state machine for a deferred scroll restore.
//
// ── Why this is a module and not two `useRef`s in the effect ─────────────────────
// The Phase 2 verify-self subagent named this exact seam as the highest-risk part of WP4:
// Phase 2 proved the *decision* logic (`planRestore` returns `apply: false` when the box is
// unmeasurable), but nothing proved the CALLER honors it — that the offset is actually HELD
// and RE-ATTEMPTED rather than quietly dropped. It flagged it as where the
// `strictmode-remount-deadlocks-an-unreleased-fetch-latch` defect class hides.
//
// That warning is earned. The predecessor bug in this very component was a latch SET before
// an await and never RELEASED on the cancelled path, which deadlocked under StrictMode's
// mount → unmount → remount and rendered a permanently blank panel — while `tsc`, lint, a
// 1600-test suite and a clean build were all green. The lesson recorded from it is that a
// state machine living only inside a hook ships broken; modelled as a pure transition
// function, the same sequence is asserted as a VALUE.
//
// So: this module owns "is there an offset waiting, and should it be applied now?" as a
// total function of (state, event). The effect below it only dispatches events and performs
// the DOM write.
//
// ── The lifecycle ───────────────────────────────────────────────────────────────
//   idle ──capture(600)──▶ held(600) ──applied──▶ idle
//                             │
//                             └──deferred──▶ held(600)   (stays held; retry later)
//
// The one rule that makes it correct rather than merely stated: **a deferred apply must
// leave the offset held.** Dropping it there is precisely the "switched panels, came back to
// the top" bug, and it is invisible to any test that only checks the happy path.

/**
 * A pending scroll restore.
 *
 * `null` offset = nothing waiting. Deliberately a nullable number rather than a
 * `{held: boolean, offset: number}` pair: "held with no offset" is not a representable state,
 * so it cannot be reached by a partial update.
 */
export interface PendingRestore {
  /** The offset waiting to be applied, or `null` when nothing is pending. */
  offset: number | null;
}

export const NO_PENDING: PendingRestore = { offset: null };

/** Events that move the machine. */
export type PendingEvent =
  /** A reload captured an offset that must survive the content swap. */
  | { type: "hold"; offset: number | null }
  /**
   * The offset was successfully written to the DOM. Clears the pending state.
   *
   * ⚠️ Only dispatch this when the write actually LANDED (`planRestore().apply === true`).
   * Dispatching it on a deferred attempt is the drop-the-offset bug.
   */
  | { type: "applied" }
  /**
   * An apply was attempted but the box was unmeasurable. The offset STAYS held.
   *
   * This event exists — rather than "do nothing" — so the deferral is an explicit, testable
   * transition instead of an absence of code. An absence cannot be asserted; a transition can.
   */
  | { type: "deferred" }
  /**
   * The selection changed to a different document. Clears any pending offset.
   *
   * A held offset belongs to the doc it was captured from: applying 600px into a freshly
   * opened, unrelated document would scroll the reader into the middle of something they
   * just chose to open from the top.
   */
  | { type: "reset" };

/**
 * Advance the pending-restore machine. Total: every (state, event) pair is defined.
 *
 * Pure — no DOM, no refs, no side effects — so the full mount/unmount/remount and
 * hidden-then-shown sequences are asserted as values in `pendingRestore.test.ts`.
 */
export function pendingNext(
  state: PendingRestore,
  event: PendingEvent,
): PendingRestore {
  switch (event.type) {
    case "hold":
      // A `null` offset means the capture had nothing to record (unmeasurable box, nothing
      // previously held) — that must not overwrite an offset already waiting.
      return event.offset === null ? state : { offset: event.offset };
    case "applied":
      return NO_PENDING;
    case "deferred":
      // ⚠️ THE load-bearing transition: the offset survives a failed apply.
      return state;
    case "reset":
      return NO_PENDING;
  }
}

/** Whether an offset is waiting to be (re-)applied. */
export function hasPending(state: PendingRestore): boolean {
  return state.offset !== null;
}
