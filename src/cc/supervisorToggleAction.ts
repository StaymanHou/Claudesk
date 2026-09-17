// M14 WP0 Phase 2 verify-codify — the supervisor toggle's CLICK behavior.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ EXTRACTED SO A TEST DRIVES THE REAL THING. The derivation (`workspaceSupervisor.ts`) is
// already covered and the CSS/gate guards are source-level, but the *action* — what a click
// actually does — lived only inside a `useCallback` in `Workspace.tsx`, where nothing exercised
// it. `arch.md`'s standing rule: a `?raw`/source-text guard cannot express a behavioral
// property; extract the code so a test can drive it.
//
// ⚠️ **THE OPTIMISTIC WRITE IS THE WHOLE RISK, AND ITS FAILURE DIRECTION IS THE WORST ONE FOR
// THIS PARTICULAR CONTROL.** The UI flips immediately (the operator must see the click land),
// but the write can genuinely reject — `project_set_supervisor_enabled` errors rather than
// silently inserting when no project record exists. A toggle that STAYED flipped after a failed
// write would tell the operator "this project is unsupervised" while the supervisor kept firing
// into it. That is precisely the confusion WP0 exists to end, so the revert is not politeness:
// it is the correctness property.
//
// ⚠️ **REVERT TO `previous`, NEVER TO `!next`.** They differ in the one case that matters: when
// `previous` is `null` (the value had not loaded yet), `!next` would fabricate a concrete
// boolean the store never reported and the UI would claim to know a state it does not. `null`
// must round-trip back to `null` so the not-yet-loaded window stays honest — and the supervisor
// reads anything that is not an explicit `false` as ON, which is the ruled default.

/** The state the toggle reads and writes. `null` = not loaded from `projects.json` yet. */
export type SupervisorToggleState = boolean | null;

/** What one click should do. Pure — the caller performs the effects. */
export interface SupervisorToggleAction {
  /** The value to render immediately (the optimistic update). */
  readonly next: boolean;
  /** The value to restore if the write rejects. ⚠️ May be `null`; see the header. */
  readonly revertTo: SupervisorToggleState;
}

/**
 * Decide what a click on the supervisor toggle does.
 *
 * ⚠️ **A not-yet-loaded (`null`) state flips to `false`, not to `true`.** `null` renders as
 * "supervised" (the ruled default, applied by the readout's `?? true`), so the operator clicking
 * it is asking to turn supervision OFF — the only reason to click a control that already shows
 * the state you want. Treating `null` as "unknown, so turn it on" would make the first click on
 * a slow-loading workspace do the opposite of what it appears to do.
 */
export function supervisorToggleAction(
  current: SupervisorToggleState,
): SupervisorToggleAction {
  return {
    next: !(current ?? true),
    revertTo: current,
  };
}
