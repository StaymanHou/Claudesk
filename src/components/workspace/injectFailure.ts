// M17 WP3 P4.verify-human.2 (operator decision A, 2026-11-16) — the words of the workspace's
// "your injection did not go through" toast.
//
// ⚠️ WHY THIS EXISTS. Since Phase 4 every Claudesk injection goes through `cc_inject`, which for
// a REMOTE pane waits (≤ 15 s) for CC to be ready and then REFUSES rather than send into a TUI
// that would split or swallow it. Before this toast that refusal reached only `console.warn`,
// while the Prompt panel had already archived and cleared the text, so a dropped send read as
// "sent". The operator chose a visible, plain-words toast.
//
// ⚠️ The toast shows the BACKEND's reason verbatim (`reason`), not `injectCommand`'s diagnostic
// `message`: the backend's refusal is already written for a person, and the diagnostic's
// label/command strings ("staging could not run staged prompt (auto-submit)") are not.
//
// Recycle IS a caller (P4.6). P4.5 first left it out on the belief that recycle's own outcome
// already reported a refused handoff; verify-self showed that was wrong (the outcome arrived 180 s
// later as a `console.warn`, and a refused restore was reported as success).

/** Toast text for a skill-button command that did not go through. */
export function skillInjectFailure(command: string, reason: string): string {
  return `${command} was not sent: ${reason}`;
}

/**
 * Toast text for a Prompt-panel send that did not go through. The panel archives the text to
 * Recent and clears the editor BEFORE the injection settles, so the toast says where it went —
 * otherwise the operator would believe the text was lost as well as unsent.
 */
export function promptInjectFailure(reason: string): string {
  return `Your prompt was not sent: ${reason}. The text is in Recent.`;
}

/**
 * Toast text for a Recycle whose injection was refused. The two steps have OPPOSITE
 * consequences (see `RecycleCallerFailure`), so the words say which one the operator is in.
 */
export function recycleInjectFailure(
  step: "handoff" | "restore",
  reason: string,
): string {
  return step === "handoff"
    ? `Recycle stopped, nothing was changed: /session-handoff was not sent: ${reason}.`
    : `Recycled, but /session-restore was not sent: ${reason}. Run /session-restore yourself.`;
}
