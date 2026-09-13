// M15 WP3 Phase 4 — THE RESIDUAL ADJUDICATOR. The three R-6 conditions live here.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS COMPONENT IS LOAD-BEARING FOR CORRECTNESS, NOT A CLEANUP TAIL.
//
// Ruling R-5 set the mechanism as a HYBRID: the mechanical rule decides everything it can
// (~1,900 of ~2,284 turns), and the residual routes to a headless `claude -p` answering ONE
// question — *is this turn awaiting operator input?* ⚠️ R-5 explicitly notes this **partially
// inverts** §4's rationale for exempting the adjudicator from its own probe WP, because it is
// no longer merely off the dominant path. Treat it as a first-class component with real
// failure handling; "best-effort polish" is the posture R-5 rejected.
//
// ⚠️ WHY NOT A REGEX (settled, do not re-open). A reply-instruction regex catches only 7 of 30
// wrong-fires at a cost of 4 of 43 true breaks, and needed a carve-out hand-fitted to FOUR
// records. **A regex over natural-language tails IS a prose-reading adjudicator with worse
// judgment than an LLM** — the exact failure class this milestone exists to remove, in a
// cheaper-looking form. The "question-shaped tail" framing was also REFUTED: a trailing-`?`
// predicate fires on 2% of true breaks vs 10% of wrong-fires, which is noise.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THREE BINDING CONDITIONS FROM R-6 (GO-WITH-CONDITIONS), AND WHERE EACH LIVES:
//
//   1. ⚠️ PIN THE MODEL AND FAIL LOUDLY ON ABSENCE OR CHANGE.
//      `haiku` is NOT_SEPARABLE on identical data (23/29 vs sonnet's 25/29 against a >=24
//      bar). A silent downgrade would regress the supervisor **with no code change and no
//      signal**. → `ADJUDICATOR_MODEL` + `assertPinnedModel`.
//
//   2. ⚠️ BIAS EVERY FAILURE TOWARD WITHHOLDING.
//      On error, timeout, unavailability, or an unparseable answer the supervisor must NOT
//      fire. "Stays silent, operator nudges" is today's recoverable status quo; firing into a
//      turn that is awaiting an answer is unrecoverable — `injectCommand` has no retry and no
//      pre-send cancel window, and the only mitigation is CC's own Esc.
//      → every failure path returns `AWAITING`, never `PROCEED`.
//
//   3. ⚠️ RE-MEASURE ON A LARGER LABELLED SET BEFORE RELYING ON THE MARGIN.
//      Sonnet clears the bar by EXACTLY ONE RECORD, with only 70 of 96 scorable. That is a
//      WP5 obligation, recorded in the WIP's "Deferred to WP5" — it is NOT discharged here,
//      and nothing fails without it, which is why it is written down.
//
// ⚠️ ROUTE EVERY FIRE CANDIDATE, NOT JUST THE DENSE CLASS. The narrow edge-class router
// (verify-human-adjacent only) sends 40 of 96 and MISSES 10 of 32 awaiting-turns, which would
// then fire silently with no adjudication at all. The 70%-concentration finding is a DENSITY
// fact, not a COVERAGE fact. → the caller routes all candidates; this module never self-selects.
//
// ⚠️ ACCEPTED COST: ~3s per fire on the critical path (operator-accepted at R-6).

/**
 * The pinned adjudicator model. ⚠️ **Changing this string is a behavior change that must go
 * through a re-measurement**, not a config tweak — see condition 1 above.
 */
export const ADJUDICATOR_MODEL = "sonnet";

/** How long to wait for the adjudicator before giving up (and withholding). */
export const ADJUDICATOR_TIMEOUT_MS = 20_000;

/**
 * The adjudicator's answer vocabulary — the same two values the WP1 probe scored.
 *
 * ⚠️ `AWAITING` means *"this turn is waiting on the operator"* → **do not fire**.
 * `PROCEED` means *"nothing is being asked"* → the mechanical verdict stands.
 */
export type Adjudication = "AWAITING" | "PROCEED";

/** Why the adjudicator produced the answer it did — for the diagnostic, never for control. */
export type AdjudicationBasis =
  /** The model answered and its answer was parsed. */
  | "model"
  /** ⚠️ A failure path. Always pairs with `AWAITING` — see condition 2. */
  | "withheld-on-error"
  | "withheld-on-timeout"
  | "withheld-on-unparseable";

export interface AdjudicationResult {
  readonly answer: Adjudication;
  readonly basis: AdjudicationBasis;
  /** Model-reported text or the error, for `console.warn`. Never parsed for control flow. */
  readonly detail: string;
}

/**
 * The one question the adjudicator is asked.
 *
 * ⚠️ Deliberately NOT "should the supervisor fire?" — that would hand the LLM the whole
 * policy decision, which is what the mechanical rule exists to own. It is asked only the
 * narrow natural-language question a rule genuinely cannot answer.
 *
 * ⚠️ The answer format is constrained to a single bare token so parsing is exact-match rather
 * than prose interpretation. A model that editorializes yields an unparseable answer, which
 * (per condition 2) withholds rather than guessing.
 */
export function adjudicationPrompt(tail: string): string {
  return [
    "You are judging one thing about the end of an AI assistant's turn.",
    "",
    "QUESTION: Is this turn waiting for the human to reply before work can continue?",
    "",
    "Answer AWAITING if the turn asks a question, requests a decision, presents options to",
    "choose from, or instructs the human to run something and report back.",
    "Answer PROCEED if the turn simply reports what was done or states what happens next,",
    "without needing anything from the human.",
    "",
    "Reply with exactly one word: AWAITING or PROCEED. No punctuation, no explanation.",
    "",
    "--- END OF TURN ---",
    tail,
  ].join("\n");
}

/**
 * Parse the model's reply into an {@link Adjudication}.
 *
 * ⚠️ **Anything unrecognized is `null`, which the caller turns into `AWAITING`.** A lenient
 * parser ("it contains the word proceed somewhere") is how a hedging answer becomes a fire.
 * The reply must BE the token, modulo surrounding whitespace and case.
 */
export function parseAdjudication(reply: string): Adjudication | null {
  const t = reply.trim().toUpperCase();
  if (t === "AWAITING") return "AWAITING";
  if (t === "PROCEED") return "PROCEED";
  return null;
}

/**
 * ⚠️ CONDITION 1 — fail loudly when the model is not the pinned one.
 *
 * Called with whatever model the runtime actually reports. A mismatch is thrown, NOT logged
 * and swallowed: a silent downgrade to `haiku` regresses the supervisor with no code change
 * and no signal, which is precisely the failure this assertion exists to make impossible.
 */
export function assertPinnedModel(actual: string | null | undefined): void {
  if (actual !== ADJUDICATOR_MODEL) {
    throw new Error(
      `supervisor adjudicator model must be "${ADJUDICATOR_MODEL}", got ` +
        `${actual === null || actual === undefined ? "none" : `"${actual}"`}. ` +
        "haiku is NOT_SEPARABLE on identical data (23/29 vs 25/29 against a >=24 bar), " +
        "so a downgrade regresses break detection silently. Re-measure before changing.",
    );
  }
}

/** What the caller supplies to run one adjudication. Injected so this module stays pure. */
export interface AdjudicatorDeps {
  /**
   * Run the headless model and return its raw stdout.
   *
   * Rejects on spawn failure, non-zero exit, or timeout — every one of which this module
   * turns into `AWAITING`.
   */
  readonly run: (args: {
    model: string;
    prompt: string;
    timeoutMs: number;
  }) => Promise<string>;
  /** Diagnostic sink. Defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
}

/**
 * Ask the adjudicator whether this turn is awaiting the operator.
 *
 * ⚠️ **EVERY failure path returns `AWAITING`** (condition 2). There is deliberately no way for
 * this function to return `PROCEED` except by the pinned model explicitly saying so.
 */
export async function adjudicate(
  tail: string,
  deps: AdjudicatorDeps,
): Promise<AdjudicationResult> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const withheld = (
    basis: Exclude<AdjudicationBasis, "model">,
    detail: string,
  ): AdjudicationResult => {
    warn(`supervisor adjudicator: ${basis} — withholding the fire. ${detail}`);
    return { answer: "AWAITING", basis, detail };
  };

  let raw: string;
  try {
    raw = await deps.run({
      model: ADJUDICATOR_MODEL,
      prompt: adjudicationPrompt(tail),
      timeoutMs: ADJUDICATOR_TIMEOUT_MS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // ⚠️ Timeout is reported separately from other errors only for the DIAGNOSTIC. Both
    // withhold — the distinction must never reach the control flow.
    const basis = /timed? ?out/i.test(message)
      ? "withheld-on-timeout"
      : "withheld-on-error";
    return withheld(basis, message);
  }

  const parsed = parseAdjudication(raw);
  if (parsed === null) {
    return withheld(
      "withheld-on-unparseable",
      `reply was ${JSON.stringify(raw.slice(0, 120))}`,
    );
  }
  return { answer: parsed, basis: "model", detail: raw.trim() };
}
