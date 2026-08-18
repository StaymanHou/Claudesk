// M13 WP3 Phase 1 — the Recycle completion state machine.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS IS A MACHINE OVER A SEQUENCE AND NOT A FILE POLL
//
// Recycle must know that `/session-handoff`, running INSIDE Claude Code, has FINISHED —
// and Claudesk has no completion protocol for that. WP1 captured three real handoff runs
// (hook events + filesystem events on one monotonic clock) and measured that **no single
// signal answers the question.** Each obvious candidate is killed by an observation:
//
//   • `Stop` alone — run 2 emitted a clean `Stop` having performed ZERO tool calls and
//     written NOTHING (CC hit its ambiguity guard and asked a question instead). Its whole
//     hook trace is a strict SUBSEQUENCE of a successful run's. A Recycle waiting on `Stop`
//     would have declared success on a handoff that never happened — and then killed the
//     session, destroying the very work the recycle existed to preserve.
//
//   • `.session.md` existence — already TRUE at t=0 in two of the three runs. Existence
//     answers "was there ever a handoff", never "did THIS one finish".
//
//   • ⚠️ the `.session.md` write itself — THE TRAP, and the one the roadmap's four words
//     ("wait for `.session.md` write completion") walk straight into. The file lands, then
//     the skill keeps working for **9.01s (run 3) / 12.19s (run 1)** appending the handoff
//     marker to the WIP file. Firing here kills CC mid-skill and truncates that annotation.
//     **The file write completing is NOT the handoff completing.**
//
// So the only unambiguous marker is a COMPOSITE with an ordering constraint:
//
//     a `.session.md` write (CREATE or MODIFY, ignoring `*.tmp.*`) whose mtime is strictly
//     newer than a baseline sampled BEFORE Recycle began — FOLLOWED BY the NEXT `Stop`.
//
// Ordering is what carries the meaning: `Stop` is meaningful only *relative to* an observed
// fresh write. Neither half means anything alone. That is why this is a machine over a
// sequence rather than a predicate over a file's current state.
//
// Full evidence, the three-run table, and the killed candidates:
// `workflow-system/state/archive/m13-wp1-probe.md` → "Phase 2 — Q3".
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE ILLEGAL STATE IS UNREPRESENTABLE — NOT GUARDED BY A FLAG PAIR
//
// The tempting shape is `{sawFreshWrite: boolean, sawStop: boolean}` and a rule about which
// combination means success. That shape can represent `{sawFreshWrite:false, sawStop:true}`
// — i.e. run 2 — as a *state you must remember to reject*. Here it is not a state at all:
// a `stop` received in `awaiting-fresh-write` transitions directly to `failed`. The ordering
// constraint is carried by the state graph, so no downstream reader can misinterpret it and
// no future edit can "simplify" the rejection away.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FAILURE ARM IS NOT OPTIONAL, AND ITS TWO WRONG ANSWERS ARE BOTH REAL
//
// Run 2 is the exact shape of a failed handoff. On `Stop` with no fresh write, Recycle must
// report FAILED — not "keep waiting" (it would hang forever, since the run is over and no
// further signal is coming) and not "done" (it would recycle a session whose handoff never
// happened). Both wrong answers are reachable from a plausible implementation, which is why
// `failed` is a first-class terminal state carrying a discriminated reason rather than a
// bare boolean the caller might coerce.
//
// ═══════════════════════════════════════════════════════════════════════════════
// PURE BY CONSTRUCTION
//
// No filesystem, no Tauri, no clock. Inputs are VALUES, so every arm — including the ones
// that took a live CC session and ~50s to observe — is a unit test that runs in
// microseconds. The caller (Phase 2) owns sampling the baseline, subscribing to the two
// real signal sources, and translating their payloads into this alphabet.
//
// ⚠️ Extracting a pure machine proves the MACHINE, not its CALLER — hit twice in M11 WP4,
// one a shipped CRITICAL. Phase 2 funnels every send through ONE function and guards THAT.

/**
 * The input alphabet — **only signals WP1 actually observed**, plus the caller's timeout.
 *
 * ⚠️ Deliberately not extensible-by-guessing: a signal nobody measured cannot be reasoned
 * about, and the probe's whole point was to replace speculation with three captured runs.
 */
export type RecycleSignal =
  /**
   * A write to `.session.md` was observed.
   *
   * `mtimeMs` is the file's modification time as epoch milliseconds — the freshness
   * evidence, NOT the event's arrival time (an event can be debounced or delivered late;
   * the mtime is what the filesystem recorded).
   *
   * ⚠️ `path` is carried so the machine ITSELF can reject the Edit tool's temp+rename
   * artifacts. An earlier revision left `isTempArtifactPath` as a caller-side predicate the
   * machine never invoked — which made the exclusion **dead code a caller was free to
   * forget**, and the machine would then have accepted `…/.session.md.tmp.<pid>.<hash>` as
   * a real fresh write. That is the standing project hazard in its exact shape: *extracting
   * a pure state machine proves the MACHINE, not its CALLER.* Carrying the path moves the
   * exclusion inside the thing that is mutation-proven, so no caller can omit it.
   */
  | {
      readonly kind: "session-md-write";
      readonly mtimeMs: number;
      readonly path: string;
    }
  /** CC ended a turn (`Stop`). ⚠️ Fires on EVERY turn end — meaningless on its own. */
  | { readonly kind: "stop" }
  /** The caller's per-operation deadline elapsed. */
  | { readonly kind: "timeout" };

/** Why a Recycle failed. Discriminated so a caller can surface the two cases differently. */
export type RecycleFailureReason =
  /**
   * `Stop` arrived without a preceding fresh write — run 2's shape. The handoff did not
   * happen (CC refused, errored, or answered with a question instead).
   */
  | "no-fresh-write"
  /** The deadline elapsed before the sequence completed. A hung step, visible not silent. */
  | "timeout";

/**
 * Machine state. Two non-terminal states expressing "how far through the ordered composite
 * are we", and two terminal ones.
 */
export type RecycleState =
  /** Start. A fresh `.session.md` write has not been seen yet. A `stop` here is FAILURE. */
  | { readonly phase: "awaiting-fresh-write" }
  /**
   * A fresh write landed; now waiting out the measured tail for the NEXT `Stop` (figures:
   * `RECYCLE_TIMEOUT_MS` in `recycleSession.ts`, the single authority).
   * `freshWriteMtimeMs` is retained as evidence for the caller's diagnostics.
   */
  | { readonly phase: "awaiting-stop"; readonly freshWriteMtimeMs: number }
  /** Terminal — the handoff completed. Only from here may the caller kill and respawn. */
  | { readonly phase: "succeeded" }
  /** Terminal — surface to the operator. ⚠️ Never kill the session on this arm. */
  | { readonly phase: "failed"; readonly reason: RecycleFailureReason };

/** The machine's start state. A function, so no caller can mutate a shared literal. */
export function initialRecycleState(): RecycleState {
  return { phase: "awaiting-fresh-write" };
}

/** The two terminal phases, as a type — so narrowing past them is a compiler guarantee. */
type TerminalState = Extract<RecycleState, { phase: "succeeded" | "failed" }>;

/**
 * Whether a state is terminal — the caller's cue to unsubscribe from both signal sources.
 *
 * ⚠️ Declared as a **type predicate**, not `: boolean`. A plain boolean return does not narrow
 * at the call site, which left `recycleTransition`'s switch unable to prove it had handled
 * every remaining phase (TS2366). Typing it this way makes the exhaustiveness real rather than
 * asserted — adding a fifth phase then fails to compile at the switch instead of silently
 * falling through to `undefined` at runtime.
 */
export function isTerminal(state: RecycleState): state is TerminalState {
  return state.phase === "succeeded" || state.phase === "failed";
}

/**
 * Whether a `.session.md` write is FRESH — i.e. produced by *this* Recycle rather than
 * left over from an earlier session.
 *
 * ⚠️ **Strictly greater.** Equality means the same write the baseline already saw. WP1 run 3
 * ran against a stale pointer whose delta was 102s, so the discrimination is not marginal in
 * practice — but `>=` would silently accept the stale file in the pathological same-
 * millisecond case, which is exactly the failure the baseline exists to prevent.
 *
 * `baselineMtimeMs === null` means no `.session.md` existed when Recycle began (run 1's
 * precondition), so ANY write is fresh.
 *
 * ⚠️ The baseline MUST be sampled BEFORE the operation starts. A baseline read after the
 * injection can race the write and be *newer* than it, which would make the real write look
 * stale and fail every Recycle. That obligation belongs to the caller; this function cannot
 * enforce it.
 */
export function isFreshWrite(
  mtimeMs: number,
  baselineMtimeMs: number | null,
): boolean {
  return baselineMtimeMs === null || mtimeMs > baselineMtimeMs;
}

/**
 * Whether a changed path is an editor TEMP artifact that must not be mistaken for a real
 * write.
 *
 * WP1 observed `wip/probe-dummy-task.md.tmp.50784.4e1d70fe6f66` (CREATE→DELETE→MODIFY): the
 * Edit tool sometimes writes via temp+rename. ⚠️ **Observed ONCE, not on every Edit** — run
 * 3's in-window WIP edit was a bare MODIFY with no temp pair. The constraint is still correct
 * to adopt (a watcher must survive the form when it occurs) but must not be stated as
 * universal.
 *
 * ⚠️ **Matches the `.tmp.` infix in the FINAL PATH SEGMENT only.** A naive
 * `path.includes(".tmp.")` would also match a legitimate `.session.md` living under a
 * directory like `/Users/x/tmp.work/proj/…` — a false positive that would make Recycle
 * ignore the very write it is waiting for, and one that would never show up in a test whose
 * fixture paths are all tidy.
 */
export function isTempArtifactPath(path: string): boolean {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  return segment.includes(".tmp.");
}

/**
 * The transition function: current state + one signal → next state. Total, pure, and
 * deterministic.
 *
 * `baselineMtimeMs` is threaded in per-step rather than captured in the state because it is
 * the CALLER's measurement, fixed for the whole operation — keeping it out of the state makes
 * it impossible for a transition to accidentally revise the baseline mid-run.
 *
 * ⚠️ Signals arriving in a terminal state are IGNORED (the state is returned unchanged), not
 * an error. The two real sources are asynchronous and debounced, so a trailing `stop` after
 * success is ordinary — and the caller unsubscribes on terminal, which is inherently racy.
 */
export function recycleTransition(
  state: RecycleState,
  signal: RecycleSignal,
  baselineMtimeMs: number | null,
): RecycleState {
  if (isTerminal(state)) return state;

  if (signal.kind === "timeout") {
    return { phase: "failed", reason: "timeout" };
  }

  // ⚠️ The temp-artifact exclusion lives HERE, inside the machine — not in the caller.
  // WP1 observed `…md.tmp.50784.4e1d70fe6f66` (CREATE→DELETE→MODIFY) from the Edit tool's
  // temp+rename. Treating that transient as a real write would satisfy the freshness check
  // with a file that is about to be deleted, completing the composite on non-evidence.
  // A temp path is INERT: state unchanged, keep waiting for the real write.
  if (signal.kind === "session-md-write" && isTempArtifactPath(signal.path)) {
    return state;
  }

  switch (state.phase) {
    case "awaiting-fresh-write":
      if (signal.kind === "stop") {
        // ⚠️ RUN 2's SHAPE. `Stop` with nothing written = the handoff did not happen.
        // Never "keep waiting" (nothing more is coming) and never "done" (we would recycle
        // away unpreserved work).
        return { phase: "failed", reason: "no-fresh-write" };
      }
      // A write — fresh only if it postdates the baseline. A STALE write is not an error and
      // not a failure: it is simply not our evidence, so we keep waiting for the real one.
      return isFreshWrite(signal.mtimeMs, baselineMtimeMs)
        ? { phase: "awaiting-stop", freshWriteMtimeMs: signal.mtimeMs }
        : state;

    case "awaiting-stop":
      if (signal.kind === "stop") {
        // The measured write→`Stop` tail has now elapsed by construction: this is the first turn
        // end AFTER the fresh write, so the skill has finished its post-write work.
        return { phase: "succeeded" };
      }
      // A further write before the `Stop` (e.g. the skill rewriting the pointer). Keep the
      // latest FRESH mtime as evidence; the machine still waits for the next `Stop`.
      //
      // ⚠️ The freshness check is applied HERE TOO, and the asymmetry it removes is the point:
      // an earlier revision kept `signal.mtimeMs` unconditionally, so a STALE write arriving in
      // this phase would overwrite the real evidence with an older timestamp (measured: 100 → 5).
      // `awaiting-fresh-write` rejected exactly that write, so the machine's two phases disagreed
      // about what counts as evidence. It never changed the succeeded/failed verdict — which is
      // precisely why no behavioral test caught it and why the field's diagnostic value was the
      // only casualty. Found by enumerating the full state × signal matrix at verify-codify.
      return isFreshWrite(signal.mtimeMs, baselineMtimeMs)
        ? { phase: "awaiting-stop", freshWriteMtimeMs: signal.mtimeMs }
        : state;
  }
}
