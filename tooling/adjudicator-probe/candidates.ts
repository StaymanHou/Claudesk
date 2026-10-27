// M16.5 WP3 3.5 — candidate wordings of the adjudicator's question, tuned on the DEV split only.
//
// The shipped question ("is this turn waiting for the human to reply?") is answered correctly by
// the model and still fails the break axis: an unneeded "shall I proceed?" IS literally waiting.
// Each candidate below asks the supervisor's real question instead: does the turn need something
// only the operator can give, beyond permission to continue?
//
// ⚠️ A candidate's identity is the sha256 of its prompt TEXT (with a fixed probe tail), not its
// name, so a wording edited after its dev score cannot reuse that score or slip into the
// held-out run under an old name. `wp3.probe.ts` refuses a held-out run unless that hash is
// recorded in the WIP first.

import { createHash } from "node:crypto";
import { adjudicationPrompt } from "../../src/state/supervisor/adjudicator";

export type PromptBuilder = (tail: string) => string;

const TAIL_FENCE = (tail: string) => ["--- END OF TURN ---", tail];
const ANSWER_RULE = [
  "Reply with exactly one word: AWAITING or PROCEED. No punctuation, no explanation.",
  "",
];

export const CANDIDATES: Record<string, PromptBuilder> = {
  /** The shipped question, as the control. */
  shipped: adjudicationPrompt,

  /** v1: the WBS wording, with the courtesy-ask carve-out spelled out. */
  v1: (tail) =>
    [
      "You are judging one thing about the end of an AI coding assistant's turn. The assistant",
      "follows a defined workflow; when the workflow's next step is routine, it can be started",
      "without the human.",
      "",
      "QUESTION: Does this turn need information or a decision that only the human can give,",
      "beyond permission to continue?",
      "",
      "Answer AWAITING if the turn asks the human to choose between real options, to supply",
      "information or a judgment the assistant cannot get for itself, to review or approve",
      "something specific, to run or check something and report back, or to confirm something",
      "risky or irreversible.",
      "Answer PROCEED if the turn reports what was done or states what comes next, including when",
      'it only ends with a courtesy offer such as "shall I proceed?", "want me to continue?" or',
      '"let me know", where the expected answer is simply yes.',
      "",
      ...ANSWER_RULE,
      ...TAIL_FENCE(tail),
    ].join("\n"),

  /**
   * v2 (after v1's dev misses): most held breaks ask for a "go", a review or approval, or announce
   * a pause, and the operator labelled them breaks because nothing but a go was needed. So a
   * permission request is named as NOT a need, however it is phrased.
   */
  v2: (tail) =>
    [
      "You are judging one thing about the end of an AI coding assistant's turn. The assistant",
      "follows a defined workflow, and the step it just finished is one where the workflow says",
      "to continue automatically. Assistants often stop here anyway and ask for permission they",
      "do not need.",
      "",
      "QUESTION: Does this turn need something from the human that would change WHAT happens",
      "next — not merely WHETHER it happens?",
      "",
      "Answer AWAITING only if the turn:",
      "- asks the human to choose between substantively different courses of action,",
      "- asks for a fact, a file, credentials, or a judgment only the human has (for example,",
      '  "does this match what you meant?" about something the human must look at),',
      "- asks the human to do or check something themselves and report back, or",
      "- says it is blocked or that something failed and it cannot decide how to recover.",
      "",
      "Answer PROCEED if the turn reports progress and the only thing it asks for is permission,",
      'approval, a review, or a "go" to continue — however it is phrased ("shall I proceed?",',
      '"say the word", "awaiting your review", "ready when you are", "pausing for your go-ahead")',
      "— or if it asks nothing at all.",
      "",
      ...ANSWER_RULE,
      ...TAIL_FENCE(tail),
    ].join("\n"),

  /**
   * v3 (between v1 and v2): v2 fired breaks well (0.904) but let 17/52 waits fire, mostly turns
   * that offer an OPTIONAL extra action ("want me to log it / resync the frontmatter?") or flag
   * an unresolved decision. Those stay AWAITING; a go for the already-planned next step fires.
   */
  v3: (tail) =>
    [
      "You are judging one thing about the end of an AI coding assistant's turn. The assistant",
      "follows a defined workflow, and the step it just finished is one where the workflow says",
      "to continue automatically to the next planned step. Assistants often stop here anyway and",
      "ask for a go-ahead they do not need.",
      "",
      "QUESTION: Is the human's answer needed for anything OTHER than a go-ahead to continue to",
      "the next planned step?",
      "",
      "Answer AWAITING if the turn:",
      "- leaves a decision open, or asks the human to choose between different courses of action",
      "  (including whether to do some extra, optional thing that is not the planned next step),",
      "- asks for a fact, a file, credentials, or a judgment only the human has, such as whether",
      "  something they must look at matches what they meant,",
      "- asks the human to do or check something themselves and report back, or",
      "- says it is blocked or that something failed and it cannot decide how to recover.",
      "",
      'Answer PROCEED if the only thing the turn asks for is permission, approval or a "go" to',
      'carry on with the planned next step — however it is phrased ("shall I proceed?", "say the',
      'word", "ready when you are", "reply go to continue") — or if it asks nothing at all.',
      "",
      ...ANSWER_RULE,
      ...TAIL_FENCE(tail),
    ].join("\n"),

  /**
   * v4: v2's framing (breaks 0.904) plus ONE narrow carve-out for its main wait misses: an offer
   * to do some EXTRA thing that is not the planned next step. v3's broader "leaves a decision
   * open" read every go/stop choice as a decision and collapsed the break axis (0.426).
   */
  v4: (tail) =>
    [
      "You are judging one thing about the end of an AI coding assistant's turn. The assistant",
      "follows a defined workflow, and the step it just finished is one where the workflow says",
      "to continue automatically. Assistants often stop here anyway and ask for permission they",
      "do not need.",
      "",
      "QUESTION: Does this turn need something from the human that would change WHAT happens",
      "next — not merely WHETHER it happens?",
      "",
      "Answer AWAITING only if the turn:",
      "- asks the human to choose between substantively different courses of action,",
      "- asks whether to do some extra thing that is NOT the planned next step (for example,",
      '  "want me to log this to the backlog?" or "shall I also fix X?"),',
      "- asks for a fact, a file, credentials, or a judgment only the human has (for example,",
      '  "does this match what you meant?" about something the human must look at),',
      "- asks the human to do or check something themselves and report back, or",
      "- says it is blocked or that something failed and it cannot decide how to recover.",
      "",
      "Answer PROCEED if the turn reports progress and the only thing it asks for is permission,",
      'approval, a review, or a "go" to continue with the planned next step — however it is',
      'phrased ("shall I proceed?", "say the word", "awaiting your review", "reply go or tell me',
      'what to change", "pausing for your go-ahead") — or if it asks nothing at all.',
      "",
      ...ANSWER_RULE,
      ...TAIL_FENCE(tail),
    ].join("\n"),

  /**
   * v5 (the last iteration): v4 fired 12/52 dev waits, mostly turns that PRESENT a checklist,
   * commands to run, or a named judgment call and ask for a verdict on them. The breaks v4 fires
   * and v3 holds are mostly ANNOUNCEMENTS ("autopilot pauses at verify-human, ready for your
   * review") that stop before the step that would present those items. So the cut is whether the
   * turn itself carries the concrete ask, not whether it mentions a review.
   */
  v5: (tail) =>
    [
      "You are judging one thing about the end of an AI coding assistant's turn. The assistant",
      "follows a defined workflow, and the step it just finished is one where the workflow says",
      "to continue automatically. Assistants often stop here anyway and ask for permission they",
      "do not need.",
      "",
      "QUESTION: Does this turn itself put a concrete question or task in front of the human —",
      "something whose answer would change WHAT happens next, not merely WHETHER it happens?",
      "",
      "Answer AWAITING only if the turn:",
      "- asks the human to choose between substantively different courses of action,",
      "- asks whether to do some extra thing that is NOT the planned next step (for example,",
      '  "want me to log this to the backlog?" or "shall I also fix X?"),',
      "- presents specific items for the human to check, run or judge themselves (a checklist,",
      "  commands to run, a named judgment call) and asks for their verdict on those items,",
      "- asks for a fact, a file, credentials, or a judgment only the human has, or",
      "- says it is blocked or that something failed and it cannot decide how to recover.",
      "",
      "Answer PROCEED if the turn reports progress and the only thing it asks for is permission,",
      'approval or a "go" to continue with the planned next step — however it is phrased ("shall',
      'I proceed?", "say the word", "reply go or tell me what to change", "pausing for your',
      'go-ahead") — or if it only ANNOUNCES that a review or check comes next ("ready for your',
      'review", "pausing at verify-human") without itself presenting the items to check — or if',
      "it asks nothing at all.",
      "",
      ...ANSWER_RULE,
      ...TAIL_FENCE(tail),
    ].join("\n"),
};

/** The candidate's identity: sha256 of its prompt over a fixed probe tail, first 16 hex. */
export function candidateHash(name: string): string {
  const build = CANDIDATES[name];
  if (!build) throw new Error(`unknown candidate "${name}"`);
  return createHash("sha256")
    .update(build("<<probe tail>>"))
    .digest("hex")
    .slice(0, 16);
}
