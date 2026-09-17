// M14 WP0 Phase 1 verify-codify — WHAT THE CC PANE DOES WITH ONE CHUNK OF OPERATOR INPUT.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ EXTRACTED SO A TEST CAN DRIVE THE REAL THING, NOT A SOURCE-TEXT GUARD.
//
// The AC-7 structural guard in `fanOut.test.ts` asserts the WIRING SHAPE by reading source text
// — that exactly one site pushes into the watermark, and that `autoResumeFire.ts` never mentions
// it. That guard is load-bearing and stays. But `arch.md` is explicit that **`?raw` source-text
// guards verify STRUCTURE, never RUNTIME**, and this handler carries a genuine *ordering*
// property that no source-text predicate can express:
//
// ⚠️ **THE WATERMARK IS FED BEFORE THE SESSION-ID GUARD.** Input typed into a pane whose CC
// session has died is still unsent input the operator can SEE on screen. Feeding the watermark
// after `if (!sid) return` would silently stop tracking it in exactly that case — and the
// operator would be typing into a dead pane while the supervisor considered the workspace
// clear. A refactor that "tidies" the early return upward would **compile, pass `tsc`, and pass
// every existing test**, which is the shape this repo has been bitten by four times (*a
// mechanism correct in itself behind a caller that does not honor it*).
//
// ⚠️ **AND THE WATERMARK IS FED THE RAW CHUNK, NOT THE ENCODED ONE.** `encodeBase64` is
// transport; the watermark reads BYTES. Feeding it the base64 string would make every chunk look
// like ordinary printable input — `\r` would never be seen, so the watermark would **never
// clear** and the workspace would go permanently unsupervised. That is the silent-failure
// direction, and it is why this returns the raw chunk for the sink and the encoded one for the
// pty as two separate fields.

/** What the pane should do with one `term.onData` chunk. */
export interface CcInputRouting {
  /**
   * The chunk to hand the unsent-input watermark — RAW, never base64.
   *
   * ⚠️ Always present, even when {@link toPty} is null: a dead session does not make the
   * operator's typing disappear from the screen.
   */
  readonly toWatermark: string;
  /**
   * The chunk to write into the pty, already encoded — or `null` when there is no live session
   * to write to.
   */
  readonly toPty: string | null;
}

/**
 * Decide where one chunk of pane input goes.
 *
 * Pure so the ordering property above is a value a test can assert, rather than a shape a
 * source-text guard can only approximate.
 *
 * @param chunk raw input, exactly as `term.onData` delivers it
 * @param sessionId the live CC session id, or null/empty when the session is gone
 * @param encode the base64 encoder (injected so the test need not depend on its internals)
 */
export function routeCcInput(
  chunk: string,
  sessionId: string | null,
  encode: (s: string) => string,
): CcInputRouting {
  return {
    // ⚠️ Unconditional, and BEFORE the session check below. See the header.
    toWatermark: chunk,
    toPty: sessionId ? encode(chunk) : null,
  };
}
