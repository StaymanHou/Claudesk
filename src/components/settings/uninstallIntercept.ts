// M10.9 WP3.5b task P3.2 — what happens when the user turns the workflow-features gate OFF.
//
// ## Why this is a pure function and not an `if` inside the checkbox handler
// The repo rule (root `CLAUDE.md`): a branch whose default is consequential must be asserted
// as a VALUE, never as source text. This branch decides whether a *destructive dialog* opens,
// and — more subtly — whether the setting is written at all. Both halves are load-bearing, and
// neither is observable from a `?raw` guard.
//
// ## The `[Cancel]` semantics are STRUCTURAL, not compensating
// The operator's spec: `[Cancel]` leaves the substrate alone and **reverts the gate to
// enabled**. There are two ways to build that:
//
//   1. Persist `false` immediately, then write `true` back if the user cancels.
//   2. Do not persist at all until the dialog resolves.
//
// This module implements (2), and the difference is not stylistic. Under (1) a crash, a quit,
// or an IPC failure between the two writes leaves the gate off with the substrate installed —
// i.e. silently in `[Keep mccc]`'s state, which is the exact confusion the three-button design
// exists to prevent. Under (2) "cancel" means the value was never written, so there is nothing
// to undo and no window in which the wrong state can persist. `[Cancel]` costs zero IPC.
//
// ## Trigger is provenance, NOT "the user turned it off"
// Only a `managed` substrate may be uninstalled by Claudesk (the provenance rule: we remove
// only what we recorded installing). A `developer` substrate is the operator's live repo or a
// hand-clone; an `absent` one is nothing at all. In both those cases turning the gate off is
// just a setting change, and interrupting it with a removal dialog would be offering to delete
// something Claudesk must never touch.

import type { InstallProvenance } from "./WorkflowSubstrateInfo";

/**
 * What a gate-toggle change should do.
 *
 * - `"persist"` — write the new value straight through the normal settings seam.
 * - `"open-uninstall-dialog"` — do NOT write anything yet; open the 3-intent dialog and let
 *   the user's button choice decide (see the module header for why not-writing is the point).
 */
export type GateToggleAction = "persist" | "open-uninstall-dialog";

/**
 * Decide what a change to `workflow_features_enabled` should do.
 *
 * @param nextValue the value the user just selected (`true` = enabling, `false` = disabling)
 * @param provenance the substrate's provenance, or `null` while unresolved
 *
 * Enabling always persists — installing and enabling are separate acts (milestone property 2),
 * so turning the feature layer on never triggers substrate work. Disabling intercepts only for
 * `managed`. An unresolved `null` persists: we do not know enough to justify a destructive
 * dialog, and the safe direction is to let the setting change and leave the substrate alone.
 */
export function gateToggleAction(
  nextValue: boolean,
  provenance: InstallProvenance,
): GateToggleAction {
  if (nextValue) return "persist";
  return provenance === "managed" ? "open-uninstall-dialog" : "persist";
}

/**
 * The three intents the uninstall dialog offers. Named for what the USER means, not for what
 * the code does — the operator specified them as intents precisely so the UI stops inferring.
 */
export type UninstallIntent = "uninstall" | "keep" | "cancel";

/**
 * How the uninstall dialog was opened (operator decision, 2026-07-31: BOTH entry points).
 *
 * ## Why this is an explicit parameter and not something the dialog infers
 * `[Cancel]` means "undo whatever brought me here", and what that is differs by entry point:
 *
 * - **`"toggle"`** — the user unchecked *Enable workflow features*. Cancel must leave the gate
 *   ON, which it does structurally: the setting is never written while the dialog is open, so
 *   there is nothing to revert.
 * - **`"button"`** — the user pressed *Uninstall & disable…* in the substrate row. Nothing has
 *   been touched, so Cancel simply closes. Confirming, though, must ALSO turn the gate off —
 *   that is the "& disable" half of the button's own promise.
 *
 * Inferring this from state would be the [[explicit-selectable-mode-over-inferred-mode]]
 * failure the project has hit before: two arrivals into one destructive dialog, distinguishable
 * only by a flag nobody can see. Passing it in keeps the difference legible and testable.
 */
export type UninstallTrigger = "toggle" | "button";

/**
 * Which intents a given entry point offers.
 *
 * `[Keep it installed]` exists ONLY on the toggle path. Arriving from the toggle, "turn the
 * features off but leave the substrate" is a coherent third answer — it is what the user asked
 * for, minus the removal. Arriving from a button that says *Uninstall & disable*, it is
 * incoherent: the user did not ask to disable anything, so offering "disable without
 * uninstalling" invents an intent they never expressed.
 */
export function offersKeepIntent(trigger: UninstallTrigger): boolean {
  return trigger === "toggle";
}

/**
 * Whether Cancel should speak to the gate.
 *
 * Only the toggle path has a *pending* change to reassure about — there the user proposed
 * turning the features off, so "the features stay on" is the sentence that matters. From the
 * button they proposed no such thing, and naming the gate would answer a question they never
 * asked. A separate predicate rather than an inline `trigger === "toggle"` at the call site,
 * for the same reason `offersKeepIntent` is one: trigger-dependent decisions live here, where
 * they are asserted as values.
 */
export function cancelMentionsGate(trigger: UninstallTrigger): boolean {
  return trigger === "toggle";
}

// NOTE: there is deliberately no `confirmDisablesGate(trigger)` helper. Confirming a removal
// turns the gate off on BOTH paths — from the toggle because that is what the user asked for,
// from the button because "& disable" is half its label — so a function taking `trigger` and
// returning a constant would be indirection dressed up as a decision. `outcomeForIntent`
// already carries that (`uninstall` → `persistGate: false`), and it is trigger-independent.

/** What an intent means for the substrate and for the gate. */
export interface IntentOutcome {
  /** Whether to run the real uninstall. */
  runsUninstall: boolean;
  /**
   * The value to persist for `workflow_features_enabled`, or `null` to persist NOTHING.
   *
   * `null` for `"cancel"` is the structural revert: the gate was never written, so the
   * checkbox simply stays as it was. See the module header.
   */
  persistGate: boolean | null;
}

/**
 * The intent → outcome table, as data.
 *
 * | intent      | substrate            | gate                          |
 * |-------------|----------------------|-------------------------------|
 * | `uninstall` | removed (runs script)| → disabled                    |
 * | `keep`      | left in place        | → disabled                    |
 * | `cancel`    | left in place        | unchanged (never written)     |
 *
 * `keep` and `cancel` differ ONLY in the gate, and that difference is the whole reason there
 * are three buttons instead of two: a user who cancels the dialog must not silently land in
 * `keep`'s state without having chosen it.
 */
export function outcomeForIntent(intent: UninstallIntent): IntentOutcome {
  switch (intent) {
    case "uninstall":
      // The gate is persisted OFF up front rather than after the run: the user asked for the
      // features to be off, and that intent stands regardless of whether the removal itself
      // succeeds (spec assumption 2 — a failed uninstall keeps the record, so the wizard
      // remains re-offerable on the next disable).
      return { runsUninstall: true, persistGate: false };
    case "keep":
      return { runsUninstall: false, persistGate: false };
    case "cancel":
      return { runsUninstall: false, persistGate: null };
  }
}
