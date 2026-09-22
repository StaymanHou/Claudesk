// F-a WP4 Phase 3 — recovering a sent draft from the history ring.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE ONLY REAL DECISION HERE IS WHAT HAPPENS TO A DRAFT ALREADY IN THE BUFFER.
//
// Recovery exists for the third failure mode in the operator's own words: text that was SENT and
// is now gone from the panel. But the operator can also have started typing something new before
// reaching for it, and a recover that silently replaced that buffer would destroy unsent work
// while trying to restore sent work.
//
// ⚠️ **CONFIRM, THEN OVERWRITE — OPERATOR RULING 2026-09-22. DO NOT RE-LITIGATE.**
// Operator's words: *"don't append. instead, show a 'discard' confirmation that can 'cancel' the
// action before overwrite, if confirmed, just overwrite"*.
//
//   - EMPTY buffer     → recover straight through, no prompt (nothing to discard).
//   - NON-EMPTY buffer → CONFIRM first. Cancel leaves the buffer untouched; confirming
//                        OVERWRITES it with the recovered entry.
//
// ⚠️ **THIS REVERSED AN EARLIER APPEND IMPLEMENTATION, AND THE REVERSAL IS THE BETTER SHAPE.**
// Append preserved everything automatically — but at the cost of a MERGED document the operator
// then had to clean up on *every* recover-over-text. Confirm-then-overwrite gives a clean swap
// and pays its cost only in the case where something would actually be lost. The rejected
// reasoning ("a modal is friction on a recovery path") weighed the prompt's cost while
// under-weighting the recurring cost of the merge.
//
// ⚠️ Pure and separate from the panel for the reason `promptSendRouting.ts` gives at length: a
// decision inline in a component is a decision no test can reach. The panel is the only caller,
// and `promptRecover.test.ts` asserts that it really calls this.

/** What the panel should do when the operator picks an entry to recover. */
export type RecoverAction =
  /** Replace the buffer immediately — there was nothing to lose. */
  | { readonly kind: "replace"; readonly text: string }
  /**
   * Ask before replacing. The buffer holds unsent text that confirming will DESTROY.
   *
   * ⚠️ Carries the text so the caller does not re-derive it after the confirm returns — the
   * buffer could have changed while the prompt was open, and re-reading it there would recover
   * against a different document than the one the operator was warned about.
   */
  | { readonly kind: "confirm"; readonly text: string };

/**
 * Decide how to recover `entry` into a buffer currently holding `current`.
 *
 * ⚠️ **THE DISCRIMINATOR IS WHETHER ANYTHING WOULD BE LOST**, not whether the buffer is
 * literally `""`. A whitespace-only buffer confirms nothing: there is no work in `"   "` worth a
 * modal, and prompting for it would train the operator to dismiss the dialog reflexively — which
 * is exactly how a confirm stops protecting anything.
 *
 * ⚠️ Note this matches `planSend`'s blank rule and INVERTS `saveDraft`'s (which preserves a
 * whitespace-only draft verbatim). `saveDraft` is a buffer that must hold exactly what was typed;
 * this is a judgment about whether the operator has work at risk. Both deliberate — see
 * `draftStore.ts` and `draftHistory.ts` for the canonical statement of that asymmetry.
 *
 * ⚠️ **NEVER RETURNS A JOINED STRING.** The recovered text replaces the buffer in both arms; the
 * arms differ only in whether the caller must ask first.
 */
export function planRecover(current: string, entry: string): RecoverAction {
  if (current.trim() === "") return { kind: "replace", text: entry };
  return { kind: "confirm", text: entry };
}

/**
 * The message shown in the discard confirmation.
 *
 * ⚠️ Exported so the test asserts the SAME string the panel shows, rather than a copy that can
 * drift. ⚠️ It must name the consequence ("Discard") rather than ask a bare "are you sure?" — a
 * prompt that does not say what is lost is one the operator cannot make a decision from.
 */
export const DISCARD_CONFIRM_MESSAGE =
  "Discard the text currently in the prompt and replace it with the recovered draft?";

/** The two outcomes of the discard confirmation. */
export type DiscardChoice = "cancel" | "discard";

/**
 * The discard dialog's spec — extracted so its SAFETY-CRITICAL props are testable.
 *
 * ⚠️ **THE TWO PROPS THAT MATTER ARE `variant: "primary"` AND `escValue`, AND BOTH ARE INVISIBLE
 * TO A SOURCE GUARD.** `ConfirmModal` focuses the button carrying `variant: "primary"` on open,
 * so that button is what Enter activates; `escValue` is what Esc and a backdrop click resolve to.
 * Put `primary` on "Discard" and Enter silently destroys the buffer — a one-word change that no
 * type error, no lint rule and no comment-stripped grep would catch. This project shipped TWO
 * prop defects past a fully green 2859-test gate for exactly this reason.
 *
 * ⚠️ **Cancel is the primary/default and the esc target — deliberately.** The destructive arm is
 * never the one a reflexive Enter or Esc reaches. That asymmetry is the whole safety property.
 */
export function discardConfirmSpec() {
  return {
    title: "Discard current prompt?",
    message: DISCARD_CONFIRM_MESSAGE,
    buttons: [
      {
        id: "cancel",
        label: "Cancel",
        value: "cancel" as DiscardChoice,
        variant: "primary" as const,
      },
      {
        id: "discard",
        label: "Discard",
        value: "discard" as DiscardChoice,
        variant: "danger" as const,
      },
    ],
    escValue: "cancel" as DiscardChoice,
  };
}
