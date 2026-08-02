// M11 WP3 — the Docs panel's fetch-once latch, extracted as a pure state machine.
//
// ── Why this is a module and not three lines inside the effect ──────────────────
// It shipped as three lines inside the effect and was BROKEN — it deadlocked under React
// StrictMode's mount → unmount → remount cycle and rendered a permanently blank panel
// (caught at verify-human, 2026-08-02). The bug was invisible to every gate: `tsc`, lint,
// 1538 tests and a production build all passed, because nothing modelled the remount
// sequence. Effect lifecycle is ordering-dependent async behavior, and this repo's own
// rule is that such logic must be a pure function asserted as a VALUE rather than trusted
// inside a hook or pinned by a source-text guard.
//
// The states are deliberately explicit rather than a boolean: "has fetched" and "may
// fetch" are different questions, and conflating them is precisely what caused the bug.

/** Whether a fetch may start, given the latch's current state. */
export type LatchState =
  /** No fetch has started, or the previous attempt was cancelled before it landed. */
  | "idle"
  /** A fetch is in flight for this effect run. */
  | "in-flight"
  /** A fetch completed and its result was committed. Do not fetch again. */
  | "settled";

/**
 * The latch as a pure transition table.
 *
 * ⚠️ The load-bearing transition is `in-flight` + `cancel` → **`idle`**, NOT `settled`.
 * Under StrictMode the first mount's fetch is always cancelled by the immediate unmount,
 * and its response is discarded — so if cancelling settled the latch, the remount would
 * refuse to fetch and no data would ever be committed. Returning to `idle` is what lets
 * the remount re-arm.
 *
 * The other transition worth naming is `settled` + `cancel` → `settled`: once data is
 * committed, a later unmount must NOT re-arm, or switching the center stage away and back
 * would refetch on every visit (the "all workspaces stay mounted" contract).
 */
export function latchNext(
  state: LatchState,
  event: "start" | "settle" | "cancel",
): LatchState {
  switch (event) {
    case "start":
      // Only an idle latch may start a fetch; anything else is a no-op guard.
      return state === "idle" ? "in-flight" : state;
    case "settle":
      // A cancelled-then-settled response is discarded by the caller, so only an
      // in-flight latch settles. An idle latch settling would mean committing data the
      // caller already threw away.
      return state === "in-flight" ? "settled" : state;
    case "cancel":
      // THE bug fix. See the doc comment above.
      return state === "in-flight" ? "idle" : state;
  }
}

/** Whether a fetch should be started for a latch in this state. */
export function shouldFetch(state: LatchState, visible: boolean): boolean {
  return visible && state === "idle";
}
