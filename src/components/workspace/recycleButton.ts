// M13 WP3 P3.2 — the Recycle button's presentation contract.
//
// ⚠️ SEPARATE FROM `skillButtons.ts` ON PURPOSE, AND THIS IS THE WP'S STANDING SCOPE DECISION.
// `SKILL_BUTTONS` is typed `{command, label, title}` where `command` is a literal slash command
// routed to `injectCommand`. Recycle is not a slash command and not a skill — it is a multi-step
// OPERATION (inject `/session-handoff` → wait on a composite completion marker → clear the
// unclean-exit flag → kill + respawn CC → inject `/session-restore`). It renders as a SIBLING in
// the same `.workspace-skill-row`, wired to `recycleSession`.
//
// ⚠️ A `DECIDED_ROW_SIZE = 6` constant plus a test asserting this was BUILT AT WP2 AND REMOVED at
// code-quality review as unsound in both directions — do not rebuild it. `SKILL_BUTTONS.length
// === 6` is unsatisfiable given "Recycle is not a skill," and its "WP3 has landed" trigger matched
// only a literal string in `src/**`, invisible to a typed-parameter or Rust-side caller. The full
// autopsy is in `__tests__/skillButtons.test.ts`. **A test cannot enforce a future scope
// decision** — the WBS line was the enforcement, and this module is that line satisfied.

/** The Recycle button's visible label. Terse to match the row's other five. */
export const RECYCLE_LABEL = "recycle";

/** The `data-testid` the row renders. Static, unlike the skill buttons' templated ids. */
export const RECYCLE_TESTID = "workspace-recycle";

/**
 * Whether the Recycle affordance should exist for this workspace.
 *
 * ⚠️ **Deliberately its own predicate rather than an alias of `showSkillButtons`.** The two
 * currently evaluate identically — both require the gate and a live session — and it would be
 * tempting to reuse one function. They are not the same question: `showSkillButtons` asks "should
 * the slash-command row exist", this asks "should the Recycle operation be offered". Aliasing them
 * couples two affordances whose conditions can diverge (a future Recycle precondition — say,
 * requiring the workflow substrate on disk, which the skill row explicitly does NOT require —
 * would silently change the skill row too).
 *
 * ⚠️ `workflowEnabled` is a GATE, not a disable: with the gate off the button must be ABSENT, not
 * greyed. Recycle drives two companion-workflow skills, so it is meaningless without them, and
 * M10.9's invariant is that OFF is byte-identical to a build that never had the feature.
 *
 * ⚠️ `ccSessionId !== null` is the dead-click guard, mirroring the skill row's: a null id means the
 * spawn has not resolved (or failed), and firing into it would be the WP6 picker MAJOR.
 */
export function showRecycleButton(inputs: {
  workflowEnabled: boolean;
  ccSessionId: string | null;
}): boolean {
  return inputs.workflowEnabled && inputs.ccSessionId !== null;
}

/**
 * The button's tooltip. A function of the busy state because a recycle takes tens of seconds
 * (tens of seconds — figures live on `RECYCLE_TIMEOUT_MS`, the single authority), and a button
 * that looks inert for that long
 * without saying why reads as broken.
 */
export function recycleTitle(recycling: boolean): string {
  return recycling
    ? "Recycling — handing off, then restarting this session…"
    : "Recycle Session — /session-handoff, then restart CC and /session-restore";
}
