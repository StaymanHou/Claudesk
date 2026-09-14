// M15 WP4 Phase 1 — HOW FULL IS THE CONTEXT WINDOW?
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS MODULE ANSWERS A QUESTION IN ABSOLUTE TOKENS, NOT AS A PERCENTAGE — AND THAT IS A
// RULING, NOT A SIMPLIFICATION.
//
// ⚠️ **THERE IS NO MODEL→WINDOW MAP, AND ONE MUST NOT BE ADDED.** Ruling R-2 settled the FORM
// as an absolute token count, and measurement M-5 refuted the derivation a percentage would
// need: `claude-opus-5` was observed at **833,567** tokens and `claude-opus-4-7` at **268,743**,
// with **no `[1m]` suffix appearing anywhere in 238 transcripts** (a `<synthetic>` model value
// also occurs). So the window is **not** a function of `message.model`, and the roadmap's
// *"`message.model` is on the line so it is derivable"* is **wrong**.
//
// ⚠️ `roadmap.md`'s "above 50%" is **SUPERSEDED** and is corrected at WP5 (task 5.6), not here.
// A future reader who finds that line and "restores" the percentage will be reintroducing a
// derivation that was measured false. **Accepted cost, recorded:** the number carries less
// meaning in a 200k-window session than in an 800k one. That is the deliberate trade.
//
// ⚠️ **LAST ASSISTANT LINE ONLY — NEVER SUMMED ACROSS LINES.** `usage` on a CC assistant line
// is a *cumulative* snapshot of that turn's context (input + cache_creation + cache_read), not
// a per-turn delta. Summing the lines in a tail would therefore multiply the reading by the
// number of turns in the window and cross any threshold almost immediately. This is the single
// most likely wrong implementation, which is why the anti-sum case is mutation-proven in the
// tests rather than merely asserted.
//
// ⚠️ **UNKNOWN IS `null`, NEVER `0`.** A transcript with no assistant line, or whose last
// assistant line carries no `usage`, is a transcript we could not read. Returning 0 would say
// "the context is empty", which reads as *maximum headroom* and is the most dangerous possible
// default for a caller deciding whether to recycle. The supervisor's binding failure direction
// is WITHHOLDING (ruling R-6 condition 2), and `null` is what carries that through.

import type { TranscriptLine } from "./transcript";

/**
 * The context-pressure threshold, in absolute tokens.
 *
 * ⚠️ **A TUNABLE STARTING VALUE, NOT A DERIVED CONSTANT (ruling R-7).** Nothing computes this
 * and nothing should: it was chosen against the measured distribution of real sessions, and it
 * is expected to move once the recycle has been observed firing in practice.
 *
 * Measured at decomposition: 400,000 fires on **≤37.7% of sessions as an UPPER BOUND** — the
 * real trigger additionally requires a **non-final phase boundary** AND the **feature
 * workflow**, so observed firing is strictly lower. Deliberately **not** the median (340,730)
 * and **not** p90 (626,024): the median would recycle half of all sessions, and p90 would
 * almost never fire.
 *
 * ⚠️ **The next rung down, if this proves too eager, is 500,000 (21.7% of sessions).** Recorded
 * so a future tuning pass moves to a measured value rather than an invented one.
 */
export const RECYCLE_TOKEN_THRESHOLD = 400_000;

/**
 * Read the context size, in tokens, from a parsed transcript tail.
 *
 * Walks **backward** to the last assistant line carrying a `usage` object and sums its three
 * context components: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
 * `output_tokens` is deliberately excluded — it is what the turn *produced*, not what it
 * *occupied*.
 *
 * ⚠️ **The backward walk skips assistant lines that carry no `usage` rather than stopping at
 * them.** Verified live: every assistant line in a 200-line window carried `usage`, so this
 * path is rare — but stopping at the first `usage`-less assistant line would report `null` for
 * a transcript whose reading sits one line further back, and `null` suppresses the recycle.
 *
 * @returns the token count, or `null` when no assistant line carries a readable `usage`.
 *          ⚠️ `null` means *unknown*, never *empty* — see the module header.
 */
export function readContextTokens(
  lines: readonly TranscriptLine[],
): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.type !== "assistant") continue;
    const usage = line.message?.usage;
    // ⚠️ The OBJECT's absence is the unknown, not a zero total. `usage: {}` is a real reading
    // of zero and is returned as 0; a missing `usage` keeps walking.
    if (!usage || typeof usage !== "object") continue;
    return (
      num(usage.input_tokens) +
      num(usage.cache_creation_input_tokens) +
      num(usage.cache_read_input_tokens)
    );
  }
  return null;
}

/**
 * Coerce one usage field to a number.
 *
 * ⚠️ A non-finite or non-numeric value contributes 0 rather than poisoning the whole sum with
 * `NaN`. A `NaN` total would compare `false` against the threshold and so silently withhold —
 * the safe direction, but for the wrong reason and with no way to tell it apart from a genuine
 * under-threshold reading.
 */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Is the context over the recycle threshold?
 *
 * ⚠️ **`null` (unknown) is `false`.** An unreadable transcript must never trigger a recycle:
 * the recycle is the more destructive of the two branches (it ends the CC session), so
 * "no evidence" resolves to "do not recycle" — the same withholding bias the verdict applies
 * everywhere else.
 */
export function isOverPressure(
  tokens: number | null,
  threshold: number = RECYCLE_TOKEN_THRESHOLD,
): boolean {
  return tokens !== null && tokens > threshold;
}
