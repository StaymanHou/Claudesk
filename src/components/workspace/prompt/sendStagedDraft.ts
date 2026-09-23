// F-a WP4 Phase 1 — the send decision, as pure values.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS IS A MODULE AND NOT THREE LINES IN THE PANEL.
//
// Same reasoning as `promptDraftSync.ts`, which this file sits beside deliberately: the panel
// will have TWO send entry points (a button and a hotkey) per mode, so FOUR call sites feed one
// behaviour. Four call sites is exactly the shape that shipped a CRITICAL in M11 WP4 — twice —
// because extracting a pure state machine proves the MACHINE, not its CALLERS. So the decision
// (send or not, which bytes, which label) is made HERE as data, and the panel's only job is to
// execute the plan it is handed.
//
// ⚠️ A `plan*` function with no live caller is worse than no function at all — `planPanelChange`
// shipped exported, documented and tested but UNWIRED, so its module promised a flush the panel
// never performed. `[[extracted-machine-needs-a-live-caller-guard]]`. If you add a function here,
// wire it in the same change.
//
// ⚠️ WHAT THIS MODULE DELIBERATELY DOES NOT DO: verify that the send LANDED. `injectCommand` has
// no retry and no readback, and parsing CC's output is forbidden outright by `arch.md`. The
// terminal is the evidence, which is acceptable precisely because the operator is looking at it
// next (F-a decision 3, recorded at the grill). **Do not build machinery to close this** — a
// "did it arrive?" check here would be either a lie or a forbidden output parse.

import { stagedPayload } from "../stagedPayload";

/**
 * ⚠️ The `label` every staged injection MUST pass to `injectCommand`.
 *
 * ⚠️ **THIS EXISTS BECAUSE THE DEFAULT IS WRONG FOR US, AND SILENTLY SO.** `injectCommand`'s
 * fourth argument defaults to `"auto-resume"`, and `console.warn` is the ONLY failure channel
 * that path has (no toast, no overlay — an operator decision). So a send that failed would read
 * as *"auto-resume: injecting … failed"*, pointing the one available diagnostic at M12's
 * automatic-resume arm instead of at the Prompt panel.
 *
 * ⚠️ That is not hypothetical: `injectCommand`'s own doc comment records M13's skill-button row
 * inheriting exactly this default and misattributing its failures, which is why the `label`
 * parameter was added at all. `SUPERVISOR_INJECT_LABEL` is the same constant for M15's arm —
 * this is that pattern, not a new one.
 */
export const STAGING_INJECT_LABEL = "staging";

/** Which of the two send modes fired. */
export type SendMode = "auto-submit" | "stage-only";

/**
 * What the caller should do, as data rather than as an effect.
 *
 * `null` means "nothing to send" — see {@link planSend} for when that happens.
 */
export interface SendPlan {
  /** The exact text being sent. ⚠️ Also what gets archived to the history ring. */
  readonly body: string;
  /** Human-readable text for `injectCommand`'s `command` argument and its `console.warn`. */
  readonly command: string;
  /** The label for attribution. Always {@link STAGING_INJECT_LABEL}. */
  readonly label: string;
  /**
   * Builds the byte payload. Handed to `injectCommand`'s `buildPayload` parameter.
   *
   * ⚠️ IGNORES ITS ARGUMENT AND CLOSES OVER `body`. `injectCommand` passes its `command`
   * argument in, but `command` is the human-readable diagnostic string — encoding THAT would
   * send the wrong bytes the moment the two ever differ. Closing over `body` makes the payload
   * independent of what the diagnostic happens to say.
   */
  readonly buildPayload: () => string;
}

/**
 * Decide what to do when the operator sends the staged draft.
 *
 * Returns `null` when there is nothing to send — an empty or whitespace-only body. ⚠️ **The
 * blank check is here rather than at the call sites** for the four-call-sites reason in the
 * module header, and it matters beyond tidiness: `appendToHistory` REFUSES a blank entry, so a
 * blank send would clear the draft and archive nothing, quietly destroying the buffer. Refusing
 * the send outright is the only behaviour where clear-and-archive stays consistent.
 *
 * ⚠️ **THE BODY IS SENT VERBATIM — never trimmed.** Only the blank TEST trims. A dictated
 * passage's leading indentation or trailing newline is the operator's text, and this feature
 * exists to preserve what they composed, not to tidy it.
 */
export function planSend(
  body: string,
  mode: SendMode,
  options: { readonly dictated: boolean },
): SendPlan | null {
  if (body.trim() === "") return null;

  // ⚠️ The ONE difference between the two modes, and the whole of decision 1: a single trailing
  // `\r` OUTSIDE the bracketed-paste envelope. The envelope inserts literal text and does not
  // submit; that byte is what submits. Getting it wrong in the stage-only direction silently
  // submits a half-finished dictation, which is the failure this feature exists to prevent.
  const submit = mode === "auto-submit";

  return {
    body,
    // ⚠️ Not the body itself: a long dictated passage in a `console.warn` is unreadable, and the
    // warn line is the only diagnostic this path has. The MODE is the useful half — it tells you
    // which of the two send buttons failed.
    command: `staged prompt (${mode})`,
    label: STAGING_INJECT_LABEL,
    // ⚠️ The dictated wrap happens HERE, inside the payload, and never in `body` above: `body`
    // is what gets archived, so a recovered-and-resent entry would otherwise be wrapped twice.
    buildPayload: () =>
      stagedPayload(body, { submit, dictated: options.dictated }),
  };
}
