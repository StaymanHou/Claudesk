// Turn attribution: which CC turns did the SUPERVISOR start, rather than the operator?
//
// The supervisor ARMS a pending origin for its workspace immediately before it injects a command.
// The CC pane's next `is_turn_start` CLAIMS it and tags that turn's marker, and the turn readout
// then shows `⚙`. Operator input while the origin is pending CANCELS it.
//
// ⚠️ **THE CLAIM IS BOUNDED BY A WINDOW, AND THE WINDOW IS MEASURED, NOT GUESSED** (the P3.1
// probe, 2026-09-28). A live injection reached the webview as `is_turn_start` 32–40 ms after the
// `cc_input` invoke (n=4), and 49 ms at the broadcaster (n=1). The six clean 2026-09-15 fires
// each had their own `UserPromptSubmit` as the FIRST one after the `Stop`. The window is
// {@link ORIGIN_CLAIM_WINDOW_MS}, about 50× the worst sample. It exists so an injection that never
// produces a turn start (CC was busy and queued it) cannot tag some unrelated turn much later.
//
// ⚠️ **`is_turn_start` IS NOT ONLY A TURN START.** CC also emits `UserPromptSubmit` MID-TURN when
// it dequeues a prompt: a task notification, or a message the operator typed while the model was
// running (both seen on 2026-09-15). Those only happen while CC is busy, and the supervisor fires
// after a `Stop`, so the short window keeps them out in practice. A queued notification landing
// inside the ~40 ms gap would take the tag: accepted, and rare enough not to engineer around.
//
// ⚠️ **CANCELLATION IS CONSERVATIVE.** Every chunk the CC pane forwards cancels, including
// terminal-generated reports (focus in/out, DA and cursor replies) that are not typing. That is
// the SAME misclassification that raises the unsent-input watermark
// (`SURFACE-2026-09-14-…-NEVER-OBSERVED-…`), and it errs the safe way here: a missing `⚙`, never
// a wrong one. Fix both together, in the investigation.
//
// ⚠️ Frontend-only and in-memory. Workspace ids are reassigned every app run, and a pending
// origin lives ~40 ms, so nothing here needs to survive a relaunch.

/** What a supervisor-started turn carries. */
export interface SupervisorOrigin {
  /** The command the supervisor injected, e.g. `/feature-verify-auto`. */
  readonly command: string;
  /** When it was armed (epoch ms), immediately before the injection. */
  readonly firedAt: number;
}

/** How long after arming a turn start may still claim the origin. See the module header. */
export const ORIGIN_CLAIM_WINDOW_MS = 2000;

/** Is `origin` still claimable at `now`? A clock that went backwards is not a claim. */
export function isClaimable(
  origin: SupervisorOrigin,
  now: number,
  windowMs: number = ORIGIN_CLAIM_WINDOW_MS,
): boolean {
  const age = now - origin.firedAt;
  return age >= 0 && age <= windowMs;
}

const pending = new Map<string, SupervisorOrigin>();

/** The supervisor is about to inject into `workspaceId`. Replaces any origin already pending. */
export function armOrigin(workspaceId: string, origin: SupervisorOrigin): void {
  pending.set(workspaceId, origin);
}

/** Operator input, or a failed injection: the next turn start is not the supervisor's. */
export function cancelOrigin(workspaceId: string): void {
  pending.delete(workspaceId);
}

/**
 * A turn started in `workspaceId`: take its pending origin, if one is still claimable.
 *
 * ⚠️ Consume-once. The origin is removed whether or not it was claimable, so an expired origin
 * cannot linger and tag a later turn, and a second listener for the same turn start gets `null`.
 */
export function claimOrigin(
  workspaceId: string,
  now: number,
): SupervisorOrigin | null {
  const origin = pending.get(workspaceId);
  if (!origin) return null;
  pending.delete(workspaceId);
  return isClaimable(origin, now) ? origin : null;
}

/** Test seam: forget every pending origin. */
export function resetOrigins(): void {
  pending.clear();
}
