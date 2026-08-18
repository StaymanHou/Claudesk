// M13 WP3 Phase 2 — Recycle Session as a CALLABLE OPERATION.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS THE ONE FUNNEL. EVERY CALLER ENTERS HERE.
//
// The button (Phase 3) is ONE caller; M15's context-pressure recycle will be another, and it
// is not a click. So the sequence lives in a function that takes explicit inputs, NOT in a
// click handler with the steps inlined — retrofitting a programmatic entry point later is the
// predictable-and-avoidable version of this cost.
//
// ⚠️ It is deliberately NOT a plugin surface or an abstraction over "operations". The WBS reuse
// inventory says to build no abstraction for an unspecced caller: one exported async function,
// explicit parameters, no registry.
//
// ⚠️ WHY A SINGLE FUNNEL MATTERS HERE SPECIFICALLY. The standing defect in this codebase is a
// correct mechanism behind a caller that does not honor it — hit four times, once shipped as a
// CRITICAL, and *again in this WP's own Phase 1* (a temp-path predicate with zero production
// callers, caught at verify-self). Funnelling every send through one function is what makes
// "a caller that skips a step" a thing a test can see: guard THIS function, not the primitives.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE SEQUENCE, AND WHY EACH WAIT IS WHERE IT IS
//
//   1. sample the baseline mtime of `.session.md`   ← BEFORE anything is injected
//   2. inject `/session-handoff`
//   3. wait for the composite completion marker      ← the whole difficulty (see recycleMachine)
//   4. on SUCCESS ONLY: mark the clean-exit route
//   5. kill + respawn CC                             ← via the pane's existing relaunch path
//   6. inject `/session-restore` into the fresh session
//
// Step 3 is not a sleep and not a file poll. WP1 measured that no single signal means "the
// handoff finished": `Stop` fires on every turn end (a refused handoff emits a clean one having
// written nothing), and the `.session.md` write lands well BEFORE the skill is done (figures:
// `RECYCLE_TIMEOUT_MS` below, the single authority). The machine in `state/recycleMachine.ts`
// owns that logic; this module owns turning real Tauri events into its alphabet and performing
// the effects.
//
// ⚠️ ON FAILURE NOTHING IS TORN DOWN. Not the flag, not the session. Run 2's shape — CC returns
// a clean `Stop` and a question, having written nothing — must never be treated as "done",
// because recycling there destroys the very work the handoff was meant to preserve.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  initialRecycleState,
  isTerminal,
  recycleTransition,
  type RecycleFailureReason,
  type RecycleSignal,
  type RecycleState,
} from "../../state/recycleMachine";
import {
  appliesToWorkspace,
  FS_CHANGE_EVENT,
  type FsChange,
} from "../../state/fsChange";
import {
  WORKSPACE_STATUS_EVENT,
  type WorkspaceStatusUpdate,
} from "../../state/workspaceStatus";
import { markSessionClean } from "../../state/cleanExit";
import { INJECT_SETTLE_MS } from "../../state/predictAction";
import { injectCommand } from "./autoResumeFire";

/** `.session.md`, project-relative. Mirrors Rust's `announce::SESSION_MD_REL`. */
export const SESSION_MD_REL = "workflow-system/state/.session.md";

/** The command Recycle types to write the handoff. */
export const HANDOFF_COMMAND = "/session-handoff";

/** The command Recycle types into the FRESH session after respawn. */
export const RESTORE_COMMAND = "/session-restore";

/**
 * How long to wait for the whole completion composite before giving up.
 *
 * ⚠️ **THE SINGLE AUTHORITY FOR RECYCLE'S MEASURED LATENCIES — among production modules.**
 * Other `src/` modules that need a figure point here rather than restating one, and a guard in
 * `__tests__/recycleSession.test.ts` enforces that. ⚠️ **Scope boundary, so this header does not
 * overclaim:** the WBS and roadmap still carry the figures as WP1's *historical record*, and one
 * test NAME does — both deliberate, neither enforced here. Provenance (the three-run capture
 * table, the killed single-signal candidates) lives in the M13 WP1 archive.
 *
 * | measurement | value | source |
 * |---|---|---|
 * | slowest handoff, prompt → terminal `Stop` | **51.9s** (write at 39.7s) | WP1 run 1 |
 * | observed range to the terminal `Stop` | **28–52s** | WP1, three runs |
 * | write-to-`Stop` tail — the write lands this far BEFORE the skill finishes | **9–12s** | WP1 |
 * | live end-to-end confirmation, click → write | **38s** | WP4 Phase 3, real session |
 *
 * ⚠️ Derived from measurement, not taste: ~3.5× the 51.9s worst case. Generous on purpose — the
 * cost of waiting too long is a late failure message the operator can see, while the cost of
 * firing too early is killing CC mid-skill, the exact hazard the composite marker exists to avoid.
 */
export const RECYCLE_TIMEOUT_MS = 180_000;

/**
 * Why a Recycle attempt did not fully succeed, beyond the machine's own two reasons.
 *
 * ⚠️ These two are NOT interchangeable, and collapsing them into one string was a real defect
 * caught at verify-self. They have **opposite operator consequences**:
 *
 *   • `no-session`           — nothing happened. No handoff, no kill, no work at risk.
 *   • `restore-not-injected` — the handoff SUCCEEDED, the clean-exit flag was marked, and CC was
 *                              killed and respawned. Only the final `/session-restore` was
 *                              missed, so the operator must run it by hand.
 *
 * A caller switching on `reason` to render a message cannot tell "nothing to do" from "your
 * session was recycled, now restore it" if both arrive as the same value — and the second needs
 * an action from the operator that the first does not.
 */
export type RecycleCallerFailure = "no-session" | "restore-not-injected";

/** What a Recycle attempt produced. */
export type RecycleOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: RecycleFailureReason | RecycleCallerFailure;
    };

/** The file marker `stat_file` returns (mirrors Rust `FileMarker`; snake_case verbatim). */
interface FileMarker {
  mtime_ms: number;
  size: number;
}

/**
 * Read `.session.md`'s mtime, or `null` if it does not exist.
 *
 * ⚠️ A missing file and a failed stat are BOTH `null`, and that is the safe direction: `null`
 * means "no baseline", so any subsequent write counts as fresh. The opposite default (treat an
 * unreadable file as infinitely new) would make every Recycle fail.
 */
async function readSessionMdMtime(projectPath: string): Promise<number | null> {
  try {
    const marker = await invoke<FileMarker>("stat_file", {
      root: projectPath,
      path: SESSION_MD_REL,
    });
    return marker.mtime_ms;
  } catch {
    return null;
  }
}

/** Everything the operation needs from its caller. No globals, no context. */
export interface RecycleInputs {
  /** The workspace being recycled — used to filter `fs-change` and status events. */
  readonly workspaceId: string;
  /** Absolute project root; the clean-exit key and the `stat_file` root. */
  readonly projectPath: string;
  /** The CC session receiving the handoff. `null` means there is nothing to recycle. */
  readonly ccSessionId: string | null;
  /** Kill + respawn this pane's CC. Wired to `XtermPaneHandle.relaunch`. */
  readonly relaunch: () => void;
  /**
   * Resolve the session id of the pane's CC **after** `relaunch()` — or `null` if the respawn
   * did not produce one in time.
   *
   * ⚠️ This is a parameter rather than something the operation derives, and the reason is
   * structural: the respawned session's id arrives by a **push** (`XtermPane`'s `onSessionId`
   * callback → `Workspace` → React state), which an async function cannot await. Only the
   * caller owns that state and can say when the new id has landed.
   *
   * ⚠️ It must NOT return the pre-recycle id. `relaunch()` kills that session; typing into it
   * writes to a dead PTY and the restore silently never happens — a failure with no error,
   * since `cc_input` on an unknown session rejects into `injectCommand`'s `.catch` and only
   * `console.warn`s.
   */
  readonly awaitFreshSessionId: () => Promise<string | null>;
  /**
   * Called on every state change so a caller can render progress. Optional: the operation is
   * correct without it, and Phase 3 decides what (if anything) to show.
   */
  readonly onProgress?: (state: RecycleState) => void;
  /**
   * How long to wait for the fresh session's PTY before typing `/session-restore`.
   *
   * ⚠️ Unlike step 3's composite, this one IS a delay, and it is the same reason M12 needed
   * one: a COLD spawn's TUI has not started reading keystrokes yet, so bytes sent immediately
   * are dropped. M12 measured ~1500 ms (`INJECT_SETTLE_MS`). Injectable so tests need not wait.
   */
  readonly restoreSettleMs?: number;
  /**
   * Override the completion deadline. Production leaves it unset (`RECYCLE_TIMEOUT_MS`);
   * tests set it small so the timeout arm is exercisable without a 3-minute wait.
   */
  readonly completionTimeoutMs?: number;
}

/**
 * M12's measured cold-spawn settle, **imported rather than restated**.
 *
 * ⚠️ An earlier revision hardcoded `1_500` here with a comment saying it mirrored M12. That is a
 * silent-drift seam: retuning `INJECT_SETTLE_MS` after measuring a slower spawn would leave this
 * copy stale, and the symptom — a restore typed into a TUI not yet reading stdin — is a dropped
 * command with no error. There is no reason to copy a value the same bundle can import.
 */
export const RESTORE_SETTLE_MS = INJECT_SETTLE_MS;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait for the completion composite, feeding real events into the machine.
 *
 * ⚠️ **Subscribes to the RAW `workspace-status` event stream — NOT the status map.** The
 * backend emits one event per hook event with no dedupe, but the frontend reducer overwrites a
 * per-workspace map entry, so two consecutive `Stop`s both read as `state:"idle"` and a
 * `useEffect` on the derived value sees NO CHANGE. Q3's composite depends on observing *the
 * next* `Stop`, which the map structurally cannot express. Reading the map here is the single
 * most likely way to build this and have it silently never complete.
 *
 * ⚠️ The `fs-change` payload carries no mtime, so a fresh `stat` is taken per matching event;
 * the machine compares it against the baseline. `*.tmp.*` filtering is the MACHINE's job (it
 * takes the path) — not re-implemented here, so there is one rule in one place.
 */
async function awaitCompletion(
  inputs: RecycleInputs,
  baselineMtimeMs: number | null,
): Promise<RecycleState> {
  const { workspaceId, projectPath, onProgress } = inputs;
  let state = initialRecycleState();

  return new Promise<RecycleState>((resolve) => {
    const unlisteners: Array<() => void> = [];
    let settled = false;

    const finish = (final: RecycleState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const un of unlisteners) un();
      resolve(final);
    };

    // Feed one signal in. Sequential by construction — JS callbacks do not interleave — so the
    // machine sees a well-ordered stream even though two async sources produce it.
    const feed = (signal: RecycleSignal) => {
      if (settled) return;
      state = recycleTransition(state, signal, baselineMtimeMs);
      onProgress?.(state);
      if (isTerminal(state)) finish(state);
    };

    // ⚠️ Declared HERE, after `feed` — the callback closes over it, so it cannot be hoisted
    // above `feed`'s definition. `const` because it is assigned exactly once (eslint
    // prefer-const), and `finish` can therefore clear it unconditionally.
    const timer = setTimeout(
      () => feed({ kind: "timeout" }),
      inputs.completionTimeoutMs ?? RECYCLE_TIMEOUT_MS,
    );

    void listen<FsChange>(FS_CHANGE_EVENT, (event) => {
      if (settled) return;
      if (!appliesToWorkspace(event.payload, workspaceId)) return;
      // The watcher batches paths; only `.session.md` is evidence here.
      const touched = event.payload.paths.filter((p) =>
        p.endsWith(".session.md"),
      );
      if (touched.length === 0) return;
      void (async () => {
        const mtimeMs = await readSessionMdMtime(projectPath);
        // A write we cannot stat is not evidence — the file may already be gone. Drop it
        // rather than guessing an mtime, and keep waiting.
        if (mtimeMs === null) return;
        for (const path of touched) {
          feed({ kind: "session-md-write", mtimeMs, path });
        }
      })();
    }).then(
      (un) => (settled ? un() : unlisteners.push(un)),
      () => {
        /* a failed subscribe leaves the timeout as the backstop */
      },
    );

    void listen<WorkspaceStatusUpdate>(WORKSPACE_STATUS_EVENT, (event) => {
      if (settled) return;
      if (event.payload.workspace_id !== workspaceId) return;
      // `Stop` is what the backend maps to `idle`. Every other state is noise for this purpose.
      if (event.payload.state === "idle") feed({ kind: "stop" });
    }).then(
      (un) => (settled ? un() : unlisteners.push(un)),
      () => {
        /* same backstop */
      },
    );
  });
}

/**
 * **Recycle this workspace's CC session.** The one entry point; see the module header.
 *
 * Resolves `{ok:true}` only when the handoff verifiably completed AND the session was
 * respawned. Never throws: every failure is a value, because a caller that forgets a `.catch`
 * would otherwise lose the failure silently (the WP6 picker MAJOR).
 */
export async function recycleSession(
  inputs: RecycleInputs,
): Promise<RecycleOutcome> {
  const { ccSessionId, projectPath, relaunch } = inputs;

  // No live session ⇒ nothing to hand off. Not an error state worth surfacing loudly; the row
  // does not render a Recycle button without a session id, so this is belt-and-braces.
  if (ccSessionId === null) return { ok: false, reason: "no-session" };

  // ⚠️ STEP 1 — the baseline, BEFORE the injection. A baseline read after the operation starts
  // can race the write and come back NEWER than it, which would make the real write look stale
  // and fail every Recycle. This ordering is load-bearing; do not move it below step 2.
  const baselineMtimeMs = await readSessionMdMtime(projectPath);

  // STEP 2 — type the handoff. `injectCommand` owns the `.catch` and the `\r` payload rule.
  await injectCommand(ccSessionId, HANDOFF_COMMAND, undefined, "recycle");

  // STEP 3 — wait for the composite marker.
  const final = await awaitCompletion(inputs, baselineMtimeMs);
  if (final.phase !== "succeeded") {
    // ⚠️ FAILURE ARM: nothing is torn down. No clean-exit mark (the exit was not clean), no
    // kill (the session still holds the work), no restore. The caller surfaces the reason.
    return {
      ok: false,
      reason: final.phase === "failed" ? final.reason : "timeout",
    };
  }

  // ⚠️ STEP 4 — mark the clean-exit route BEFORE the kill, and only on success.
  //
  // Recycle IS a clean boundary, so without this every recycle leaves a false unclean mark and
  // the next open fires a spurious `--continue`. Clearing is OPT-IN PER ROUTE — never a side
  // effect of teardown — which is why it is an explicit call here and not inside `relaunch`.
  //
  // Ordering rationale (decided at plan time, restated because it is not obvious): marking
  // before the kill means a crash *between* the two leaves the flag CLEAR on a session that
  // never respawned. That is the benign direction — the workspace's handoff is on disk and
  // `.session.md` will drive a restore on next open. The opposite order risks a crash leaving
  // the flag SET after a clean handoff, producing the spurious `--continue` this call exists
  // to prevent.
  markSessionClean(projectPath, "recycle-session");

  // STEP 5 — kill + respawn through the pane's EXISTING relaunch path (one nonce-bump path,
  // no double-spawn). Synchronous dispatch; the spawn resolves asynchronously inside the pane.
  relaunch();

  // STEP 6 — type the restore into the FRESH session, after the cold-spawn settle.
  //
  // ⚠️ The automatic auto-resume arm will NOT do this for us: `hasFiredRef` is consume-once for
  // the pane's whole lifetime and is deliberately NOT cleared by relaunch (M12's double-restore
  // defect). So this injection is the only one, and there is no double-fire to defend against.
  // ⚠️ Do NOT "fix" that latch to make this automatic — it would re-open the M12 defect for the
  // ordinary Relaunch button.
  await sleep(inputs.restoreSettleMs ?? RESTORE_SETTLE_MS);

  // ⚠️ The session id CHANGED — `relaunch()` killed the old one. Injecting into `ccSessionId`
  // here would write to a dead PTY and the restore would silently never happen.
  const freshSessionId = await inputs.awaitFreshSessionId();
  if (freshSessionId === null) {
    // ⚠️ A DISTINCT reason from `no-session`. The handoff DID complete, the flag IS correctly
    // clear, and the session WAS recycled — only the restore injection was missed. Reporting
    // this as `no-session` (as an earlier revision did) would tell the caller "nothing
    // happened" about the one case where something very much did, and the operator needs to
    // run `/session-restore` by hand. `.session.md` is on disk, so the work is recoverable —
    // but only if the message says so.
    return { ok: false, reason: "restore-not-injected" };
  }
  await injectCommand(freshSessionId, RESTORE_COMMAND, undefined, "recycle");

  return { ok: true };
}

/**
 * Wait for the pane's session id to become BOTH non-null AND different from `killedSessionId`.
 *
 * ⚠️ **Waiting for merely non-null is the trap.** After `relaunch()` the caller's mirrored id
 * still holds the OLD value until the respawn resolves and pushes a new one — so a
 * "wait until not null" poll returns immediately with the id of the session that was just
 * killed. The restore would then be typed into a dead PTY and vanish into `injectCommand`'s
 * `.catch` with only a `console.warn`. The comparison against the killed id is the whole point.
 *
 * Returns `null` on timeout rather than throwing: the caller treats that as
 * `restore-not-injected`, which is a reportable outcome, not an exception.
 *
 * Polling (rather than a subscription) because the value arrives as a React prop — there is no
 * event to await, and a ref read is cheap. `ref` is read live each tick, so it never goes stale.
 */
export async function waitForFreshSessionId(
  ref: { readonly current: string | null },
  killedSessionId: string,
  timeoutMs = RESPAWN_WAIT_MS,
  pollMs = RESPAWN_POLL_MS,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const current = ref.current;
    if (current !== null && current !== killedSessionId) return current;
    if (Date.now() >= deadline) return null;
    await sleep(pollMs);
  }
}

/**
 * How long to wait for the respawn to publish a new session id.
 *
 * A cold `cc_spawn` resolves in well under a second in practice; this allows generous headroom
 * because the cost of waiting is a slightly late restore, while the cost of giving up early is
 * a recycled session the operator must restore by hand.
 */
export const RESPAWN_WAIT_MS = 15_000;

/** Poll interval for the above. Short enough to feel immediate, long enough to be free. */
export const RESPAWN_POLL_MS = 50;
