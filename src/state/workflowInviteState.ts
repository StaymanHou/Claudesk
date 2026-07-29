// M10.9 WP3 Phase 2 — the pure UX-state logic for the one-time workflow-features invite.
//
// No React, no `invoke`, no DOM — plain functions over plain args, so the suppression
// truth table is fully unit-testable without a running app. Mirrors
// `updater/updateNotifyState.ts`'s `shouldAutoNotify`, which is the same shape of problem
// (a one-time/suppressible notification gated on persisted prefs + live state).
//
// ## Why the predicate is extracted at all
// It has four inputs and one of them is React-only session state. Inlining it in `App.tsx`
// would make the two rows that actually matter — the already-resolved row and the `[Later]`
// row — unassertable except through a live app. This repo has already paid twice for
// verifying structure instead of behavior (WP2's `?raw` guards: one passed while the
// behavior was broken, another silently stopped matching after a Prettier reflow), so
// anything with a truth table gets extracted and asserted as a VALUE.

/**
 * How the one-time invite was resolved. Cross-language contract with the Rust
 * `WorkflowInviteOutcome` enum (`config_store::settings`), which serializes kebab-case.
 *
 * The ABSENCE of a value (`null`) is the meaningful third state — "unresolved, may still be
 * shown" — which is what lets `[Later]` work without a field of its own.
 */
export type WorkflowInviteOutcome = "acknowledged" | "dismissed";

/** The persisted inputs to the show decision (both read from Claudesk's own settings). */
export interface WorkflowInviteSettings {
  /**
   * The persisted outcome, or `null` when never resolved.
   *
   * `null` is the ONLY value that permits showing the invite. Note this is deliberately
   * separate from `workflowFeaturesEnabled` below: the gate is *current state*, this is a
   * *one-time lifecycle marker*, and conflating them breaks the already-resolved row.
   */
  workflowInvite: WorkflowInviteOutcome | null;
  /**
   * The workflow-features gate. The invite pitches a feature class the user has not opted
   * into, so an already-ON gate means there is nothing left to pitch.
   */
  workflowFeaturesEnabled: boolean;
}

/**
 * Should the one-time workflow-features invite be shown right now?
 *
 * Four conditions, all required:
 *
 * 1. **`workflowInvite === null`** — never resolved. Once it is `"acknowledged"` or
 *    `"dismissed"`, suppression is permanent and one-directional; nothing in the product
 *    ever resets it (the dev-only `window.__workflowInviteReset()` seam exists for
 *    re-driving verification and is absent from release builds).
 * 2. **the gate is OFF** — nothing to pitch if the features are already on.
 * 3. **`projectCount >= 1`** — NOT first-launch-unconditionally. A genuinely fresh install
 *    lands on the picker with zero projects, and pitching "workflow orchestration for your
 *    projects" to someone who has not opened a project yet is a pitch with no referent —
 *    wasted on the milestone's single shot, since the invite never re-shows. The user
 *    reaches `>= 1` within seconds of their first "Open Folder…".
 * 4. **not dismissed this session** — the `[Later]` term. React state only; never persisted.
 *
 * ## The two rows that are the feature (and that a naive model gets wrong)
 *
 * **Already-resolved (the disable-after-enable case).** A user who saw the invite, enabled
 * the features, tried them, then disabled them is back at `workflowFeaturesEnabled ===
 * false` — the *same gate state* as someone who never saw the invite. Condition 1 is what
 * stops them being re-pitched something they already evaluated and rejected. A
 * `workflowInviteSeen: boolean` handles this only by accident, and deriving the outcome
 * from the gate gets it actively wrong.
 *
 * **`[Later]` (the session-scoped hide).** `[Later]` writes NOTHING to disk, so
 * `workflowInvite` stays `null` and the invite returns next launch — while condition 4
 * hides it for the current run. Exactly the updater's `dismissBanner` (persists nothing,
 * reappears next launch) versus `skipVersion` (writes to disk, permanent). That precedent
 * is why `[Later]` needs no new persisted field.
 */
export function shouldShowWorkflowInvite(
  settings: WorkflowInviteSettings,
  projectCount: number,
  dismissedThisSession: boolean,
): boolean {
  if (settings.workflowInvite !== null) return false;
  if (settings.workflowFeaturesEnabled) return false;
  if (projectCount < 1) return false;
  if (dismissedThisSession) return false;
  return true;
}
