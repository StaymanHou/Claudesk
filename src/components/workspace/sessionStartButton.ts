// M12 WP3 Phase 5 — the third arm: the MANUAL `/session-start` button, and the already-open
// indicator that sits beside it.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY `/session-start` IS A BUTTON AND NEVER AN AUTO-FIRE
//
// This is the milestone's decision model, row 3, and it is a deliberate asymmetry rather than
// an omission. `wbs.md`'s log mining found `/session-start` is the opener in only **2.7% of
// cold opens** — and it is the *expensive* one when wrong: it starts a fresh workflow session
// rather than resuming, so a mistaken auto-fire discards the operator's context instead of
// restoring it. Arms 1 and 2 fail toward "resume the thing you were doing"; this one would fail
// toward "begin something new", which is not recoverable by ignoring it.
//
// So the rule the operator set: **`/session-start` is NEVER auto-fired. It is one click away.**
// A future reader who "completes" the decision table by adding a third auto-fire arm is
// reversing a specified decision, not filling a gap.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS FIRES INTO AN ALREADY-RUNNING SESSION — Phase 1's 1500 ms DOES NOT APPLY
//
// Phase 1 measured a ~1500 ms settle before a *freshly spawned* CC will execute an injected
// command, because its TUI has not started reading keystrokes yet. That measurement is about
// **cold boot**. This button is clicked by a human on a workspace that has been open long
// enough for them to look at it and aim — CC is already interactive, and the keystroke path
// (`cc_input`) is the same one every real keypress uses.
//
// Copying `INJECT_SETTLE_MS` here would add a 1.5 s lag to a button press for no measured
// reason. If a future change makes this fire on mount rather than on click, that is a COLD
// path and the measurement becomes relevant again — re-read `tooling/autofire-timing/` first.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ BOTH SURFACES IN THIS MODULE ARE GATED (unlike arm 1)
//
// Phase 3.5 decoupled the `--continue` arm from `workflow_features_enabled` because it reads
// Claudesk's own store and passes a stock CLI flag — applicable to every Claude Code user.
// Neither surface here is like that: `/session-start` is a companion-workflow **skill**, and
// the indicator's whole content is a promise about `workflow-system/` files. With the gate off
// they must not exist — not rendered-then-hidden, not disabled, not a no-op handler.

import type { AutoResumeAction } from "../../state/predictAction";

/** The command the manual button sends. A workflow skill — hence gated. */
export const SESSION_START_COMMAND = "/session-start";

/**
 * Whether the manual `/session-start` button should exist for this workspace.
 *
 * ⚠️ **Deliberately NOT conditioned on the workspace's signals.** An earlier reading of the
 * decision table suggested showing it only when the prediction is `null` (the "neither signal"
 * row). That is wrong, and the reason is worth stating: the table describes what **auto-fires
 * on open**, not what the operator may choose to do afterwards. Starting a fresh workflow
 * session is a legitimate act on a workspace that *could* have resumed — and hiding the button
 * in exactly the case where the operator has to decide something is the opposite of helpful.
 *
 * So the only conditions are: the gate is on, and there is a live session to inject into.
 * A `null` session id means the spawn has not resolved (or failed), and firing into it would
 * be a dead click — the WP6 picker MAJOR, which is why this is a precondition rather than a
 * runtime `if` inside the handler.
 */
export function showSessionStartButton(inputs: {
  workflowEnabled: boolean;
  ccSessionId: string | null;
}): boolean {
  return inputs.workflowEnabled && inputs.ccSessionId !== null;
}

/**
 * The label for the already-open indicator: what this workspace WOULD fire if reopened now,
 * or `null` to render nothing.
 *
 * ⚠️ **The point of this surface is that the unclean flag stops being write-only.** WP2 shipped
 * a ⏸ (pause-close) that sets the flag, and there was no way to confirm the click registered
 * short of reading `session-state.json` by hand — which is exactly why the operator deferred
 * WP2's hard-kill verification. This is the read-back.
 *
 * ⚠️ It is a PREDICTION, never an instruction (WP1 Verdict (b)). It shares that property with
 * the picker announcement, and the same rule follows: nothing may consume this string to decide
 * an action. The action is re-derived at open time. Worst case here is a stale label, which is
 * display-only and self-correcting.
 */
export function nextOpenIndicator(inputs: {
  workflowEnabled: boolean;
  action: AutoResumeAction;
}): string | null {
  if (!inputs.workflowEnabled) return null;
  const { action } = inputs;
  if (action === null) return null;
  // ⚠️ Branch on the KIND, never on a label or wire string. `predictAction`'s kinds are the
  // authority and this is the fourth consumer that must not re-derive them from text.
  switch (action.kind) {
    case "argv":
      // ⚠️ Says "continue", NOT "/resume". Phase 1 PROVED a bare `/resume` opens an interactive
      // session picker rather than resuming, so the arm is the CLI flag `--continue`. The WBS
      // and roadmap still say `/resume` in places
      // (`SURFACE-2026-08-04-BARE-RESUME-OPENS-AN-INTERACTIVE-PICKER-NOT-A-RESUME`); this
      // surface must not reintroduce the wrong name in front of the operator.
      return "will continue";
    case "inject":
      return `will run ${action.command}`;
  }
}
