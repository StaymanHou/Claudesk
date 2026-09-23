// M13.5 WP4 P4 — when a drive-mode change may be applied to a running session.
//
// ## The interaction this serves
// Changing the mode in the workspace selector IS the intent to apply it. The selector raises a
// confirm; **Apply** drives the turn-level respawn (`/exit` → new env → relaunch with
// `--continue`), and **Cancel** is a true no-op — nothing is written, not even the stored value.
//
// ⚠️ **This replaces a REJECTED design** (operator, Phase 3 verify-human 2026-08-25): store the
// change silently, mark it stale, and leave a separate "apply" affordance for the operator to
// find later. That came from an assumption never actually reviewed — *"a `<select>` that silently
// kills and respawns CC is too much consequence behind a dropdown"* — whose CONCERN was right and
// whose RESOLUTION was wrong. A confirm surfaces the consequence without splitting one intent
// across two gestures. See the WIP's AC-5.

import type { WireWorkspaceState } from "../../state/workspaceStatus";

/**
 * Whether a workspace in `state` may be respawned **right now**.
 *
 * ⚠️ **`idle` ONLY, and every rejection below is deliberate rather than an oversight.**
 *
 * - `running` / `awaiting_input` — a turn is in flight. Respawning discards it.
 * - `background_work` — ⚠️ **the tempting wrong answer.** It means *control returned BUT a
 *   backgrounded job is still running* (`status_broadcaster`: a `Stop` carrying
 *   `background_task_count > 0`). The prompt is free, so it *looks* idle; respawning would kill
 *   the job. "Not busy" is not the same question as "safe to replace the process".
 * - `unknown` — ⚠️ **depends on whether a session is live** (corrected at Phase 4 verify-human).
 *   With NO live session it is genuinely unobserved: nothing has spawned, so there is nothing to
 *   respawn. With a LIVE session it means "spawned, no turn yet" — a fresh prompt, which is idle,
 *   and is the most common moment to change a drive mode. See the body for why this is fixed here
 *   rather than by mapping `SessionStart` to a state in the broadcaster.
 *
 * ⚠️ **DO NOT copy `recycleSession`'s `idle || background_work` match.** That one answers a
 * different question — *"did a `Stop` event arrive?"* — because the wire carries only the derived
 * state, so it must match every state a `Stop` can map to. Its own comment says to keep that list
 * in sync with `event_to_state`'s `Stop` arm, *"NOT with the set of states that happen to mean
 * 'not busy'"* — which is precisely what THIS predicate is. Conflating the two is the shape that
 * shipped a CRITICAL once (`[[derived-state-is-not-a-proxy-for-its-event]]`).
 *
 * ⚠️ **Extracted as a pure function so the table is assertable as a VALUE.** A predicate inlined
 * in the component could only be exercised by driving the whole UI, and the property that matters
 * — which states are excluded — is exactly the kind a source-text guard cannot express.
 */
export function readyToRespawn(
  state: WireWorkspaceState,
  sessionLive: boolean = true,
): boolean {
  if (state === "idle") return true;
  // ⚠️ `unknown` + a LIVE session means "spawned, but no turn has happened yet" — a session
  // sitting at a fresh prompt. That is idle in every sense the operator cares about, and it is
  // the MOST COMMON moment to change a drive mode (right after opening a project).
  //
  // Reported as a defect by the operator at Phase 4 verify-human: the dialog said *"Claude Code
  // is busy"* over a session plainly sitting at a prompt. The cause is that no hook event has
  // arrived yet — `SessionStart` IS registered and forwarded, but `event_to_state` deliberately
  // returns `None` for it ("registering them does NOT flip any dot", `hook_install/mod.rs`), so
  // the workspace stays `unknown` until the first `UserPromptSubmit`.
  //
  // ⚠️ **Fixed HERE rather than by mapping `SessionStart → Idle` in the broadcaster.** That would
  // flip the status DOT for every workspace at spawn — a status-channel decision with a far wider
  // blast radius than this feature, and one that contradicts a documented, deliberate exclusion.
  // Narrowing the question to "is this workspace safe to respawn" keeps the change local.
  //
  // ⚠️ **`sessionLive` is what keeps this honest.** `unknown` with NO session is genuinely
  // unobserved — nothing has spawned, so there is nothing to respawn and no grounds to call it
  // idle. Defaulted to `true` so the predicate reads naturally at the one call site that has no
  // session concept (the unit table), while the component always passes the real value.
  if (state === "unknown" && sessionLive) return true;
  return false;
}

/**
 * What the confirm dialog should say, given whether the respawn can happen immediately.
 *
 * ⚠️ **The dialog must NAME the consequence** — that Apply restarts Claude Code for this
 * workspace — because that consequence is the entire reason the operator required a confirm
 * rather than a silent write. A dialog that only says "Apply this change?" hides exactly what the
 * confirm exists to surface.
 *
 * ⚠️ It must also be honest about *when*. When the agent is mid-turn the respawn does not happen
 * on click; it is queued until the turn ends. Saying "Claude Code will restart" in that case
 * would be a small lie the operator discovers by watching nothing happen.
 */
export function applyConfirmBody(canApplyNow: boolean, next: string): string {
  return canApplyNow
    ? `Apply drive mode "${next}" to this session now? Claude Code restarts here and keeps ` +
        `this conversation.`
    : `Apply drive mode "${next}" as soon as this turn finishes? Claude Code is busy — the ` +
        `restart waits until it goes idle, then keeps this conversation.`;
}

/** The dialog's title. Short, and names the object being changed. */
export const APPLY_CONFIRM_TITLE = "Change drive mode";

/** Primary action. Named for what it does, not "OK". */
export const APPLY_CONFIRM_APPLY = "Apply";

/**
 * Secondary action.
 *
 * ⚠️ **Cancel is a TRUE no-op** — it must leave the stored value untouched, not merely close the
 * dialog. A Cancel that silently persisted while declining to respawn would produce exactly the
 * "looks live and is not" state this whole feature exists to prevent.
 */
export const APPLY_CONFIRM_CANCEL = "Cancel";

/** Label shown on the readout while an apply is queued behind a busy agent. */
export const APPLY_PENDING_LABEL = "applying when idle";

/**
 * The readout's tooltip while an apply is queued (R1, paydown 2026-09-23). It names the queued
 * mode and says why the readout will not open, because a disabled control that gives no reason
 * reads as broken.
 */
export function queuedDriveModeTitle(queued: string): string {
  return `Drive mode: ${queued} — ${APPLY_PENDING_LABEL}. It can be changed again once it applies.`;
}

/** How long to wait for a busy agent to go idle before abandoning a queued apply. */
export const IDLE_WAIT_MS = 10 * 60 * 1000;

/** How often to re-read the status while waiting. */
export const IDLE_POLL_MS = 250;

/**
 * Resolve `true` once the workspace is safe to respawn, or `false` on timeout.
 *
 * ⚠️ **POLLS THE STATE; does not wait on a transition EVENT — and the distinction is not
 * pedantry.** The status reaches the component from a COLLAPSED MAP keyed per workspace, so two
 * consecutive same-state updates overwrite and are indistinguishable
 * (`[[workspace-status-map-collapses-consecutive-events]]`, whose documented failure mode is *a
 * feature that silently never fires*). "It BECAME idle" is therefore not expressible from that
 * map; "is it idle NOW", re-read, is. The immediate case needs no separate branch: it is simply
 * the first poll succeeding.
 *
 * ⚠️ Reads a REF, not a captured value — a closure taken at click time would poll a frozen
 * status forever. Same idiom as `waitForFreshSessionId`.
 *
 * ⚠️ The timeout exists so a queued apply cannot hang forever on a session that never returns
 * to idle (a wedged turn, a crashed agent). Abandoning is the honest failure: the mode is already
 * persisted, so the change still applies on the next natural spawn.
 */
export async function waitForIdle(
  ref: { readonly current: WireWorkspaceState },
  sessionLiveRef: { readonly current: boolean },
  timeoutMs = IDLE_WAIT_MS,
  pollMs = IDLE_POLL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // ⚠️ BOTH refs, and the second is not optional here. The dialog's `canApplyNow` and this
    // poll must answer the SAME question — if the dialog says "now" on a live-but-unobserved
    // session while this poll ignored `sessionLive`, the apply would hang until timeout on a
    // session the operator was just told was ready. Two predicates that disagree is the
    // "mechanism correct behind a caller that does not honor it" shape; one predicate, two
    // callers, same arguments.
    if (readyToRespawn(ref.current, sessionLiveRef.current)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * How long to keep the `turn-respawn` intent latched after calling `relaunch()`.
 *
 * ⚠️ **Not a guess at how long a spawn takes.** The relaunch chain is asynchronous (kill → clear
 * the spawn-once latch → nonce bump → spawn effect), and `openIntent` is deliberately NOT in the
 * spawn effect's dependency list — it is read from the closure at nonce-bump time. So the latch
 * only has to survive the React commit that triggers the bump, not the spawn itself. Clearing it
 * synchronously after `relaunch()` would let the spawn read the workspace's ORIGINAL door, which
 * for a `fire` open would CONSUME the unclean-exit flag and silently disable auto-resume on the
 * next real open.
 *
 * ⚠️ **The 400 ms is UNMEASURED.** It is a margin chosen to comfortably outlast one React commit,
 * not a sampled figure: no measurement, no test pinning it, one call site. Do not read it as a
 * sibling of `INJECT_SETTLE_MS`, which IS measured and pinned — question this number freely.
 */
export const RESPAWN_INTENT_HOLD_MS = 400;

/**
 * The write a drive-mode interaction should perform, given how it ended.
 *
 * ⚠️ **EXTRACTED AT VERIFY-CODIFY BECAUSE THE GAP WAS REAL, not hypothetical.** A mutant that
 * made **Cancel persist** — writing the new mode while declining to respawn — passed **all 2255
 * tests**. That is the precise "looks live and is not" state AC-5 forbids: the readout and disk
 * claim a mode the running session is not obeying, and the operator has no way to see it.
 *
 * The handlers are inline `useCallback`s in `Workspace.tsx`, so nothing could observe their write
 * behavior; a `?raw` source guard cannot express a behavioral property
 * (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). Extracting the DECISION
 * makes it assertable as a value, which is `arch.md`'s documented structural fix for exactly this
 * shape — *"a mechanism correct in itself sitting behind a caller that does not honor it."*
 *
 * ⚠️ **`"cancel"` MUST map to `persist: false`.** That single row is the whole property. Cancel is
 * a true no-op: it leaves `projects.json` byte-identical, so the stored value cannot drift away
 * from what the session is running.
 */
export type DriveModeOutcome = "cancel" | "apply";

export interface DriveModeWrite {
  /** Whether to call `setProjectDefaultDriveMode`. */
  readonly persist: boolean;
  /** Whether to respawn CC so the running session picks the mode up. */
  readonly respawn: boolean;
}

export function driveModeWriteFor(outcome: DriveModeOutcome): DriveModeWrite {
  switch (outcome) {
    // ⚠️ BOTH false. Not "persist but skip the respawn" — that is the rejected design and the
    // mutant this function exists to kill.
    case "cancel":
      return { persist: false, respawn: false };
    // Apply is one intent: the write and the respawn travel together. Persisting without
    // respawning would leave the session on the old mode with no indication; respawning without
    // persisting would restart CC to pick up a value that is not on disk.
    case "apply":
      return { persist: true, respawn: true };
  }
}
