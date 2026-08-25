// M13.5 WP3 — the pure turn-marker model + BIDIRECTIONAL position-based navigation.
//
// ⚠️ REWRITTEN at the WP3 re-plan (2026-08-25). The previous version modelled a
// backward-only WALK (`nextJump`/`TurnWalkState`) and had NO viewport geometry at all —
// which is exactly why 38 green tests could not see the shipped defect. Do not reintroduce
// it. What changed, and why each change is load-bearing:
//
//   1. POSITION, not a walk. `TurnPosition` is an index into the live list, so `prev`/`next`
//      are `-1`/`+1` on one value. A one-way walk cursor cannot express "go back".
//   2. OLDEST-FIRST indexing (`0` = oldest), the OPPOSITE of the old newest-first cursor.
//      With oldest-first, "earlier turn" is "lower index" in both the model and the buffer,
//      so neither direction is the inverted one.
//   3. VIEWPORT GEOMETRY is an input (`TurnViewport {length, rows}`). The clamp ceiling
//      `maxScroll = length - rows` is what the old model could not see: the NEWEST turn's
//      start is almost always ABOVE it (a turn that just ended leaves the cursor near the
//      buffer end), so `scrollToLine` clamped to where the viewport already was, the caller
//      read that as a successful jump, and the walk advanced past it. Measured on a live
//      pane: markers [19, 137], length 198, rows 68 → maxScroll 130; 137 > 130.
//
// ⚠️ SELECTION IS GEOMETRY-FREE, ON PURPOSE (AC-1). `stepTurn` takes NO viewport: a turn
// whose start is already on screen is still a valid position. Geometry enters only in
// `scrollTargetFor`, which computes WHERE to scroll — never WHICH turn is selected. Letting
// geometry pick the turn is the rejected "viewport-based" design: it skips already-visible
// turns, which makes prev/next non-symmetric (you cannot always get back).
//
// Owns two questions, kept separate: "which turn is selected now?" (`stepTurn`) and "what
// line should the terminal scroll to for that turn?" (`scrollTargetFor`). Everything about
// xterm (registerMarker, scrollToLine) lives in the caller; this module never imports xterm
// at runtime and never touches the DOM. Pure → vitest-testable, same posture as
// filmstripOrder.ts / closeTerminalChord.ts / panelHost.ts.
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
 * Which turn start is currently selected.
 *
 * `index` is an index into the *live* marker list, **oldest-first** (`0` = the oldest
 * reachable turn start). `null` means "at the newest / not navigating" — the resting state,
 * and where a newly-arrived turn puts us (AC-6).
 *
 * ⚠️ Oldest-first is deliberate and is the OPPOSITE of the walk cursor this replaced. It
 * makes `prev` = `index - 1` and `next` = `index + 1`, matching buffer order, so neither
 * direction is the inverted one. A newest-first index would make one of them read backwards
 * — the kind of asymmetry that produced an off-by-one-turn in the first place.
 */
export interface TurnPosition {
  readonly index: number | null;
}

/** The resting position — at the newest turn start; `prev` steps to the one before it. */
export const positionAtNewest: TurnPosition = { index: null };

/**
 * The terminal's scroll geometry, as a VALUE.
 *
 * ⚠️ Injected, never read off a DOM element. `arch.md`: jsdom reports `clientHeight === 0`
 * for visible elements, and WebKit retains `scrollTop` on a never-unmounted hidden node and
 * clamps out-of-range writes itself — which silently vacated two live proofs in a prior
 * milestone. The caller reads `term.buffer.active.length` and `term.rows` at call time and
 * passes them here.
 */
export interface TurnViewport {
  /** `buffer.active.length` — total lines, scrollback included. */
  readonly length: number;
  /** `term.rows` — the viewport height in lines. */
  readonly rows: number;
}

/**
 * The highest line `scrollToLine` can actually put at the viewport top.
 *
 * ⚠️ THIS IS THE VALUE THE OLD MODEL COULD NOT SEE. Above it, `scrollToLine` clamps: the
 * last `rows` lines of the buffer are always on screen together, so asking to put line
 * `length - 1` at the top is impossible. Floored at 0 — a buffer shorter than the viewport
 * cannot scroll at all.
 */
export function maxScroll(viewport: TurnViewport): number {
  return Math.max(0, viewport.length - viewport.rows);
}

/** Which way to step. */
export type StepDirection = "prev" | "next";

/**
 * What the navigation controls should show — the SINGLE source for both the disabled ends
 * (AC-4) and the position readout (AC-5), so the two can never disagree.
 *
 * `ordinal` is 1-based for display (`1/3` = oldest of three); `0` when nothing is recorded.
 */
export interface TurnNavState {
  /** Is there an older turn start to step to? */
  readonly canPrev: boolean;
  /** Is there a newer turn start to step to? */
  readonly canNext: boolean;
  /** 1-based position of the selected turn, or `0` when `total === 0`. */
  readonly ordinal: number;
  /** How many turn starts are currently reachable. */
  readonly total: number;
}

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
 * Resolve the current position against the live list — the eviction guard (AC-7).
 *
 * A position is an index into the live list, and eviction shortens that list, so an index
 * captured earlier can point past the end or at a marker xterm has already released. Every
 * read of the position goes through here, so a stale index can never reach `scrollToLine`.
 *
 * Returns `null` when there is nothing selectable (empty list), otherwise a valid index:
 * `null` position → the newest (`live.length - 1`); an out-of-range index → clamped into
 * range. Never returns an index into an empty list.
 */
export function resolvePosition(
  markers: readonly TurnMarker[],
  position: TurnPosition = positionAtNewest,
): number | null {
  const live = liveMarkers(markers);
  if (live.length === 0) return null;
  if (position.index === null) return live.length - 1;
  return Math.min(Math.max(position.index, 0), live.length - 1);
}

/**
 * Re-clamp a position after eviction, as a `TurnPosition` (AC-7).
 *
 * Thin wrapper over {@link resolvePosition} so the caller can store the corrected position
 * back without re-deriving the clamp — the caller funnels every position write through one
 * setter, and this is what that setter applies.
 */
export function clampPosition(
  markers: readonly TurnMarker[],
  position: TurnPosition = positionAtNewest,
): TurnPosition {
  const resolved = resolvePosition(markers, position);
  return resolved === null ? positionAtNewest : { index: resolved };
}

/**
 * Step one turn earlier (`prev`) or later (`next`).
 *
 * ⚠️ TAKES NO VIEWPORT, DELIBERATELY (AC-1). Selection is position arithmetic only: a turn
 * whose start is already on screen is still a valid position, and stepping to it still
 * counts as a step. Feeding geometry in here is the rejected viewport-based design — it
 * would skip already-visible turns, and prev/next would stop being symmetric.
 *
 * Clamps at both ends rather than wrapping. A wrap in a scrollback silently teleports the
 * reader from the top back to the bottom, which reads as a bug; and with a `canPrev`/
 * `canNext` disabled state (AC-4) an end-step is unreachable through the UI anyway — the
 * clamp is the belt to that braces.
 *
 * Returns the new position plus the nav state that goes with it, so a caller never has to
 * make a second call to find out whether the controls should now be disabled.
 */
export function stepTurn(
  markers: readonly TurnMarker[],
  position: TurnPosition,
  direction: StepDirection,
): { readonly position: TurnPosition; readonly nav: TurnNavState } {
  const live = liveMarkers(markers);
  const current = resolvePosition(markers, position);
  if (current === null) {
    // Nothing reachable — reset so a later turn starts clean, and report both ends closed.
    return {
      position: positionAtNewest,
      nav: navState(markers, positionAtNewest),
    };
  }
  const delta = direction === "prev" ? -1 : 1;
  const next = Math.min(Math.max(current + delta, 0), live.length - 1);
  const nextPosition: TurnPosition = { index: next };
  return { position: nextPosition, nav: navState(markers, nextPosition) };
}

/**
 * The buffer line to hand `term.scrollToLine` for the selected turn — or `null` when there
 * is nothing selected.
 *
 * ⚠️ CLAMPED TO {@link maxScroll} HERE, in the model, rather than discovered as a failed
 * scroll in the caller (AC-2). That inversion is the fix for the shipped defect: the old
 * code passed a raw marker line to `scrollToLine`, xterm clamped it silently, and the caller
 * reported "moved" for a viewport that had not moved. Returning the clamped target means the
 * caller can compare it to the current `viewportY` and know the truth — and, more
 * importantly, that the POSITION advances regardless, so the controls never stall.
 */
export function scrollTargetFor(
  markers: readonly TurnMarker[],
  position: TurnPosition,
  viewport: TurnViewport,
): number | null {
  const live = liveMarkers(markers);
  const index = resolvePosition(markers, position);
  if (index === null) return null;
  return Math.min(live[index].line, maxScroll(viewport));
}

/**
 * The nav state for the current position — both disabled ends (AC-4) and the readout (AC-5).
 *
 * ⚠️ ONE function for both so they cannot drift. A separate `canPrev` predicate and a
 * separate ordinal computation is exactly the shape that lets a UI show `1/3` next to an
 * enabled `prev` button.
 *
 * With zero reachable markers BOTH ends are closed and `ordinal`/`total` are `0` — the
 * fresh-pane state, where the controls are simply disabled with no explanatory copy.
 */
export function navState(
  markers: readonly TurnMarker[],
  position: TurnPosition = positionAtNewest,
): TurnNavState {
  const total = reachableCount(markers);
  const index = resolvePosition(markers, position);
  if (index === null) {
    return { canPrev: false, canNext: false, ordinal: 0, total: 0 };
  }
  return {
    canPrev: index > 0,
    canNext: index < total - 1,
    ordinal: index + 1,
    total,
  };
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
