// M14 WP0 Phase 1 — DOES THE OPERATOR HAVE A HALF-TYPED LINE SITTING IN THIS PANE?
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE PREDICATE IS **UNSENT INPUT PRESENT**, NOT "TYPING" — AND THAT IS AN OPERATOR RULING,
// NOT A NUANCE.
//
// *"Typing"* is a **race** on keystroke recency: a debounce answers *"did a key arrive in the
// last N ms?"*, which is false for the exact case that produced this feature — a line typed and
// then walked away from. *"There is a buffered line"* is a **state**, and it stays true until
// the operator resolves it. ⚠️ **A debounce-on-recent-keystrokes implementation does not satisfy
// the ruling and must be rejected at review.** There is deliberately **no timer, no timestamp
// and no clock read anywhere in this module** — if you find yourself adding one, the design has
// drifted back to the thing that was ruled out.
//
// ⚠️ **WHY AN INFERENCE AT ALL — CC'S INPUT BOX IS NOT OBSERVABLE.** It lives inside the PTY as
// terminal output, and `CLAUDE.md`'s rule is absolute: *"PTY byte-injection for input; hook
// channel for state. ⚠️ NEVER from PTY output."* ⚠️ **Scraping the xterm buffer was CONSIDERED
// AND REJECTED** — it violates that rule, and memory `xterm-dom-reads-fake-a-blank-pane`
// documents that exact read producing **false verdicts** (rows read empty; `innerText` returns
// xterm's injected stylesheet). So this module infers the state from what Claudesk sends **in**,
// and reads **no PTY output at all**. The rule holds by construction, not by discipline.
//
// ⚠️ **THE INFERENCE IS SOUND BECAUSE `term.onData` IS A REAL CHOKEPOINT — VERIFIED, NOT
// ASSUMED.** The spec enumerated every path bytes reach the pty (D-1): exactly two
// `invoke("cc_input")` sites exist in the frontend — the `onData` handler this module feeds
// from, and `injectCommand`, which is the machine's own funnel. xterm's `onData` contract
// covers **paste** ("when the user types *or pastes*") and `term.input()` routes through it too;
// there are zero callers of `term.input()`/`term.paste()` in this codebase. ⚠️ **Do NOT
// re-assert the "paste bypasses this" blind spot** from the pre-spec WIP text — it is refuted
// by the vendored typings.
//
// ⚠️ **WHAT REMAINS AN INFERENCE, STATED PLAINLY:** CC's TUI owns its own input buffer and
// Claudesk cannot see it. This module tracks what was *sent in*, never what CC currently
// *holds*. {@link CLEARING_BYTES} is the whole of the mitigation.

/**
 * The bytes that CLEAR the watermark — the line was either submitted or abandoned.
 *
 * ⚠️ **FOUR BYTES, AND EACH EARNS ITS PLACE INDIVIDUALLY (operator decision, 2026-09-17).**
 * `\r` alone is the strictest reading of the ruling, and it was **rejected**: a line the
 * operator Esc'd out of would suppress this workspace **forever** — until the next Enter — so
 * the workspace goes silently unsupervised, which is the same invisible-failure shape the
 * supervisor milestone exists to avoid.
 *
 * ⚠️ **AN IDLE TIMEOUT WAS CONSIDERED AND REJECTED.** It would bound the stale-watermark case,
 * but it re-introduces a **time-based race** — precisely the shape the ruling rejects. The
 * watermark must stay a state.
 *
 * ⚠️ **ACCEPTED COST, RECORDED NOT HIDDEN:** an Esc that dismisses a CC *menu* (rather than
 * clearing the input line) clears the watermark early, leaving a narrow wrong-fire window.
 * Accepted as strictly better than an indefinitely-dead supervisor.
 *
 * ⚠️ **A BACKSPACE-TO-EMPTY LINE IS NOT DETECTED** — Claudesk cannot see the buffer empty out,
 * so the watermark stays SET. That fails toward **suppression**, which is the safe direction:
 * the cost is a missed auto-chain, not a command injected over the operator's input.
 */
export const CLEARING_BYTES: readonly number[] = [
  0x0d, // CR — Enter. ⚠️ CR, not LF: raw mode disables CR→NL translation, so the byte the
  //        terminal actually delivers on Enter is 0x0d. Asserting on `\n` here would never
  //        match and the watermark would never clear on a submit.
  0x1b, // ESC — CC's own interrupt/dismiss.
  0x03, // ETX — Ctrl+C, abandon input.
  0x15, // NAK — Ctrl+U, kill-line.
];

/** The watermark's whole state. */
export interface UnsentInputState {
  /** True when input has been forwarded since the last clearing byte. */
  readonly unsentInput: boolean;
}

/** The state a pane starts in, and returns to whenever a clearing byte arrives. */
export const initialUnsentInputState: UnsentInputState = { unsentInput: false };

/**
 * Fold one chunk of forwarded input into the watermark.
 *
 * ⚠️ **BYTE-LEVEL, NOT STRING-LEVEL, AND THE DISTINCTION IS LOAD-BEARING.** `term.onData`
 * delivers a JS string whose code units are not bytes for any non-ASCII input, and a chunk may
 * carry several keystrokes at once (a paste, a fast burst, an escape sequence). Comparing the
 * whole chunk to `"\r"` would miss every chunk that carries a clearing key alongside anything
 * else.
 *
 * ⚠️ **THE LAST CLEARING BYTE IN THE CHUNK WINS, AND ORDER IS WHY THIS SCANS RATHER THAN
 * TESTS.** A chunk of `"abc\r"` submits and leaves nothing pending → CLEAR. A chunk of
 * `"\rabc"` submits and then types three more characters → SET. A test like
 * *"does this chunk contain a clearing byte?"* collapses both to CLEAR and would let the
 * supervisor fire over the `abc` in the second case. So the fold walks the chunk in order and
 * keeps the state each byte leaves behind.
 *
 * ⚠️ **Multi-byte UTF-8 is safe by construction:** every continuation byte of a multi-byte
 * sequence is ≥ 0x80, and all four clearing bytes are < 0x20, so a non-ASCII glyph can never
 * be mistaken for a clearing key.
 *
 * @param state the current watermark
 * @param chunk raw input as `term.onData` delivers it, BEFORE any base64 encoding
 */
export function foldInput(
  state: UnsentInputState,
  chunk: string,
): UnsentInputState {
  if (chunk.length === 0) return state;

  const bytes = new TextEncoder().encode(chunk);
  let unsent = state.unsentInput;
  for (const byte of bytes) {
    unsent = CLEARING_BYTES.includes(byte) ? false : true;
  }
  return unsent === state.unsentInput ? state : { unsentInput: unsent };
}

/**
 * Clear the watermark outright — the turn boundary.
 *
 * ⚠️ Exists so a caller never has to synthesize a fake `"\r"` chunk to reset the state, which
 * would read as "the operator pressed Enter" in any diagnostic built on this module later.
 */
export function clearUnsentInput(): UnsentInputState {
  return initialUnsentInputState;
}

/**
 * A mutable per-workspace watermark.
 *
 * ⚠️ **HELD IN A REF BY ITS OWNER, FOR THE SAME REASON `FireLedger` IS.** The turn-end callback
 * is registered once and closes over whatever it captured at mount; a watermark recreated per
 * render would read `false` on every turn and suppress nothing — a feature that silently never
 * fires, which is the failure mode this whole milestone keeps hitting.
 *
 * ⚠️ **`injectCommand`'s writes MUST NOT reach this** (AC-7). Only the `term.onData` handler
 * calls {@link push}. That is satisfied by construction — `injectCommand` invokes `cc_input`
 * directly and never routes through xterm — and it is pinned by a test, because "by
 * construction" is exactly the kind of claim that decays when someone adds a third writer.
 */
export class UnsentInputWatermark {
  private state: UnsentInputState = initialUnsentInputState;

  /**
   * M14 WP0 Phase 3 — notified when the watermark's value CHANGES, never on every keystroke.
   *
   * ⚠️ **TRANSITIONS ONLY, AND THAT IS A PERFORMANCE REQUIREMENT, NOT A STYLE CHOICE.**
   * {@link push} runs for every character the operator types. A callback fired unconditionally
   * would re-render a component hosting a LIVE xterm on every keystroke. The watermark is a
   * boolean, so it genuinely changes at most twice per line — set on the first character,
   * cleared on submit/abandon — and characters 2..n must cost nothing.
   *
   * ⚠️ **The ref remains the AUTHORITY for `fireOne`.** This is a render signal beside it, not a
   * replacement: the supervisor reads the live value at fire time (`hasUnsentInput`), because
   * React state could be one commit stale at the moment the irreversible injection happens.
   */
  private onChange?: (unsentInput: boolean) => void;

  constructor(onChange?: (unsentInput: boolean) => void) {
    this.onChange = onChange;
  }

  /** Fold one `term.onData` chunk in. */
  push(chunk: string): void {
    this.set(foldInput(this.state, chunk));
  }

  /** Is there unsent input in this pane right now? */
  get unsentInput(): boolean {
    return this.state.unsentInput;
  }

  /** Reset — used at a turn boundary, never to fake a submit. */
  clear(): void {
    this.set(clearUnsentInput());
  }

  /**
   * The ONE writer. Every mutation goes through here so the change-detection cannot be
   * bypassed by a future method that assigns `this.state` directly.
   *
   * ⚠️ That funnel-every-write shape is deliberate: `arch.md` records this repo's recurring
   * defect as *a mechanism correct in itself behind a caller that does not honor it*, hit four
   * times with one shipped CRITICAL. Guarding the setter is the structural fix; adding the
   * comparison at each call site is the version that decays.
   */
  private set(next: UnsentInputState): void {
    const changed = next.unsentInput !== this.state.unsentInput;
    this.state = next;
    if (changed) this.onChange?.(next.unsentInput);
  }
}
