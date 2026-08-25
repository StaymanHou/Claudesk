// M13.5 WP3 P2.1 — the pure turn-marker model + backward jump walk.
//
// Owns the answer to one question: "given the turn starts recorded so far and where the
// walk currently sits, which buffer line should the terminal scroll to next?" Everything
// about xterm (registerMarker, registerDecoration, scrollToLine) lives in the caller;
// this module never imports xterm at runtime and never touches the DOM. Pure →
// vitest-testable, same posture as filmstripOrder.ts / closeTerminalChord.ts / panelHost.ts.
//
// ⚠️ WHY THIS IS EXTRACTED RATHER THAN INLINED IN XtermPane. `arch.md` records that scroll
// geometry must be an injected VALUE, never read off an element: jsdom reports
// `clientHeight === 0` for visible elements, and WebKit retains `scrollTop` on a
// never-unmounted hidden node and clamps out-of-range writes itself — which silently
// vacated two live proofs in a prior milestone. A live assertion that "the viewport moved"
// therefore cannot distinguish our scroll from the platform's own behaviour. Asserting the
// TARGET as a value can. That is this module's reason to exist.
//
// ⚠️ Eviction is a NORMAL state, not an error. xterm disposes a marker whose line leaves the
// scrollback (`IMarker.isDisposed`), and sets its `line` to **-1** at the same time. The
// foreground pane holds `scrollback: 10000` (raised from 1000 in P3.1) so realistic long
// turns stay reachable — but 10000 is still a bound, and the measured max turn is 1239
// events, so this path is reachable and is tested.

/**
 * The subset of xterm's `IMarker` this model needs. Declared structurally rather than
 * imported so the module stays runtime-free of xterm (types only would also work, but a
 * local shape keeps the test fixtures honest — a test can build one without a Terminal).
 *
 * ⚠️ Both fields matter. `isDisposed` is the eviction flag; `line` goes to **-1** on
 * disposal. A filter on `isDisposed` alone is not enough — see `isLiveMarker`.
 */
export interface TurnMarker {
  /** xterm's marker id — stable for the marker's life. */
  readonly id: number;
  /** The buffer line, or **-1** once disposed. */
  readonly line: number;
  /** True once the line has scrolled out of the scrollback. */
  readonly isDisposed: boolean;
}

/**
 * Where the backward walk currently sits.
 *
 * `cursor` is an index into the *live* marker list as of the last step, counting from the
 * NEWEST marker: `null` = "not walking" (the next jump goes to the newest), `0` = sitting
 * on the newest, `1` = one older, and so on.
 */
export interface TurnWalkState {
  readonly cursor: number | null;
}

/** The initial walk state — not walking; the next jump lands on the newest turn start. */
export const initialWalkState: TurnWalkState = { cursor: null };

/**
 * What the caller should do for one activation of the jump affordance.
 *
 * `kind: "scroll"` carries the concrete buffer line to hand to `term.scrollToLine`.
 * `kind: "none"` means there is nothing to jump to — the caller must surface that
 * honestly (inert/disabled affordance), never scroll to an arbitrary line (AC-5).
 */
export type JumpOutcome =
  | {
      readonly kind: "scroll";
      readonly line: number;
      readonly next: TurnWalkState;
    }
  | {
      readonly kind: "none";
      readonly reason: NoJumpReason;
      readonly next: TurnWalkState;
    };

/**
 * Why no jump is available. Distinguished so the caller can word the affordance honestly:
 * `no-markers` is a fresh session (nothing recorded yet, or everything evicted), while
 * `at-oldest` means the walk has reached the oldest reachable turn start.
 */
export type NoJumpReason = "no-markers" | "at-oldest";

/**
 * Is this marker still usable as a scroll target?
 *
 * ⚠️ Checks BOTH `isDisposed` and a non-negative `line`. xterm sets `line = -1` on
 * disposal, so the two normally agree — but a `-1` target would scroll to the top of the
 * buffer, which reads as "the jump worked" while being completely wrong. Belt and braces
 * on the one value the caller feeds straight into `scrollToLine`.
 */
export function isLiveMarker(marker: TurnMarker): boolean {
  return !marker.isDisposed && marker.line >= 0;
}

/**
 * The live markers, oldest → newest, with evicted ones dropped.
 *
 * Input order is assumed to be recording order (oldest first), which is what pushing on
 * each turn start produces. Returns a new array; never mutates.
 */
export function liveMarkers(markers: readonly TurnMarker[]): TurnMarker[] {
  return markers.filter(isLiveMarker);
}

/**
 * Drop evicted markers from a recorded list. The caller uses this to keep its stored list
 * from growing without bound across a long session — xterm has already released the
 * marker, so retaining it buys nothing.
 *
 * Separate from `liveMarkers` only in intent (compaction vs. querying); same predicate, so
 * the two can never disagree about what "live" means.
 */
export function compact(markers: readonly TurnMarker[]): TurnMarker[] {
  return liveMarkers(markers);
}

/**
 * How many turn starts are currently reachable. Drives the affordance's
 * enabled/disabled state (AC-5): `0` → nothing to jump to.
 */
export function reachableCount(markers: readonly TurnMarker[]): number {
  return liveMarkers(markers).length;
}

/**
 * Resolve one activation of the jump affordance.
 *
 * Walks BACKWARD from the newest turn start: the first activation lands on the newest,
 * each subsequent one steps to the next older, and reaching the oldest returns
 * `kind: "none"` with `at-oldest` rather than **wrapping**. No-wrap is deliberate — a
 * wrap in a scrollback silently teleports the reader from the top back to the bottom,
 * which reads as a bug, not a feature (recorded as Assumed #2 in the spec).
 *
 * The walk is recomputed against the CURRENT live list on every call, so markers evicted
 * since the last activation cannot strand the cursor: the index is re-clamped here rather
 * than trusted from the previous state.
 */
export function nextJump(
  markers: readonly TurnMarker[],
  state: TurnWalkState = initialWalkState,
): JumpOutcome {
  const live = liveMarkers(markers);
  if (live.length === 0) {
    // Nothing reachable — reset the walk so a later turn starts clean from the newest.
    return { kind: "none", reason: "no-markers", next: initialWalkState };
  }

  // `cursor` counts from the newest; null means "haven't jumped yet" → target the newest.
  const target = state.cursor === null ? 0 : state.cursor + 1;

  if (target >= live.length) {
    // Already sitting on the oldest reachable start. Hold position (do NOT wrap, and do
    // NOT reset) so a repeat click is a stable no-op rather than a jump back to newest.
    return {
      kind: "none",
      reason: "at-oldest",
      next: { cursor: live.length - 1 },
    };
  }

  // Index from the END: cursor 0 is the last element (newest).
  const marker = live[live.length - 1 - target];
  return { kind: "scroll", line: marker.line, next: { cursor: target } };
}

/**
 * Reset the walk. The caller invokes this when a NEW turn starts, so the next activation
 * goes to the newest turn start rather than continuing an older walk the reader has since
 * abandoned.
 */
export function resetWalk(): TurnWalkState {
  return initialWalkState;
}

/**
 * The minimum of a `workspace-status` payload this decision needs. Structural rather than an
 * import so this module stays dependency-free; `WorkspaceStatusUpdate` is assignable to it.
 */
export interface TurnStartSignal {
  readonly workspace_id: string;
  readonly is_turn_start?: boolean;
}

/**
 * Should THIS pane record a turn-start marker for THIS event?
 *
 * ⚠️ **Extracted so the CALLER can be tested, not just the model.** `arch.md` records this repo's
 * recurring defect shape — hit four times, once as a shipped CRITICAL: *"extracting a pure state
 * machine proves the MACHINE, not its CALLER,"* with the corollary that when the risk is *"does
 * the caller honor the contract?"*, only a caller-side guard answers it. The marker walk was fully
 * proven while this three-guard predicate — the part a real defect would live in — had **zero**
 * coverage, and a stale dev runtime then made it unanswerable live. This function is the seam that
 * makes it answerable offline.
 *
 * The three guards, and why each matters:
 * - `markTurnStarts` — `XtermPane` is SHARED with the login-shell terminal (`term_spawn`), which
 *   has no turns. Default-false opt-in.
 * - `workspace_id` — the `workspace-status` event is broadcast to **every** pane in the window, so
 *   an unfiltered listener would mark other workspaces' turns in this buffer.
 * - `is_turn_start === true` — ⚠️ **NEVER `state === "running"`.** `event_to_state` maps BOTH
 *   `UserPromptSubmit` (a turn starts, once) and `PostToolUse` (a turn resumes, many times per
 *   turn) to `Running`, so keying on the state would plant a marker on every tool call — hundreds
 *   in a measured p95 turn. Strict `=== true` also makes an ABSENT field (an older or degraded
 *   payload, e.g. a backend that predates the field) mean "no marker" rather than a wrong one.
 */
export function shouldRecordTurnStart(args: {
  markTurnStarts: boolean;
  paneWorkspaceId: string;
  payload: TurnStartSignal;
}): boolean {
  return (
    args.markTurnStarts &&
    args.payload.workspace_id === args.paneWorkspaceId &&
    args.payload.is_turn_start === true
  );
}

/**
 * The jump affordance's "inert" flag — a tiny state machine, extracted because getting it
 * wrong shipped a defect.
 *
 * ⚠️ **The bug this exists to prevent** (operator, Phase 3 verify-human): the flag was set by a
 * click that found nothing and cleared ONLY by a later successful click. So after one dead
 * click on a fresh session the button stayed dimmed and kept asserting *"no earlier turn start
 * is still in the scrollback"* even once turns existed. The affordance was **lying**, which is
 * strictly worse than the dead click it was added to explain.
 *
 * There are therefore **two** clearing edges, not one, and the second is the one that was
 * missing:
 * - a jump that SUCCEEDS (`jump-moved`) — the reader is now somewhere, so nothing is inert;
 * - a NEW TURN being recorded (`turn-recorded`) — there is now something to jump to, whatever
 *   the last click found.
 *
 * Extracted rather than left inline in `Workspace.tsx` for the same reason
 * `shouldRecordTurnStart` was: `arch.md`'s recurring shape is a correct mechanism behind a
 * caller nothing tests, and this flag lived entirely in a JSX `onClick` where no unit test
 * could reach it.
 */
export type JumpInertEvent =
  | "jump-moved"
  | "jump-found-nothing"
  | "turn-recorded";

/**
 * The inert flag implied by one event. Pure; `true` means "show the inert/dimmed state".
 *
 * ⚠️ Takes the event ONLY — deliberately **not** the previous flag. `tsc` caught the first draft
 * threading a `prev` it never read, and the unused parameter was a real signal rather than
 * noise: every event fully determines the outcome, so a signature implying history would invite
 * a future edit to add state this decision does not need. The exhaustive `switch` over the union
 * is what makes a new event a **compile** error instead of a silent fall-through.
 */
export function inertAfter(event: JumpInertEvent): boolean {
  switch (event) {
    case "jump-found-nothing":
      return true;
    case "jump-moved":
    case "turn-recorded":
      return false;
  }
}
