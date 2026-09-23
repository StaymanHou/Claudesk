// F-a WP2 Phase 1 — the byte payload for STAGED (multi-line) prompt text.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS A SECOND BUILDER, NOT A CHANGE TO `slashCommandPayload`.
//
// `slashCommandPayload` strips trailing newlines and appends exactly one `\r`. That is
// correct for a one-line slash command and WRONG for staged prose: in raw mode `\r` IS
// Enter (`[[raw-mode-cr-is-enter]]`, `[[cc-tui-cr-not-lf]]`), so a multi-line body sent
// that way fires as N truncated prompts. Rather than widen the existing builder, this one
// sits alongside it so M12 (auto-resume), M13 (the skill row) and M15 (the supervisor) stay
// byte-identical. A guard in `stagedPayload.test.ts` pins that they are unaffected.
//
// ⚠️ THE ENVELOPE IS BRACKETED PASTE, AND IT IS NOT A GUESS — IT WAS MEASURED (2026-09-21).
// xterm.js's own paste path transforms `\r?\n → \r` and THEN wraps the result in
// `ESC[200~` … `ESC[201~`. A live PTY probe showed `claude` emits `ESC[?2004h` at startup
// and never `ESC[?2004l`, so bracketed paste is enabled for the session's entire life.
// Inside the envelope a `\r` is inserted as a literal newline rather than submitting, which
// is precisely why interior newlines are PRESERVED here and never normalized away.
//
// ⚠️ THE TRAILING `\r` IS A SEPARATE BYTE, OUTSIDE THE ENVELOPE. The envelope inserts text;
// it does not submit. That one byte is the ONLY difference between the two send modes:
//   - auto-submit (`⌘↵`)  → envelope + `\r`
//   - stage-only  (`⇧⌘↵`) → envelope alone; the text sits in CC's prompt for the operator
// Getting this wrong in the stage-only direction silently submits a half-finished dictation,
// which is the failure this whole feature exists to prevent.

import { encodeBase64 } from "../../cc/bridge";

/** Bracketed-paste start — `ESC [ 2 0 0 ~`. */
export const PASTE_START = "\x1b[200~";
/** Bracketed-paste end — `ESC [ 2 0 1 ~`. */
export const PASTE_END = "\x1b[201~";

/**
 * Paydown WP10 — the notes bounding a DICTATED body, so CC reads an ASR mishearing as a
 * transcription slip rather than as the operator's intent. Wording is an operator ruling
 * (2026-09-23), verbatim.
 *
 * ⚠️ Kept out of any `TRANSITION:` / slash-command shape, so a note can never be read as a
 * workflow token. ⚠️ An OPEN and a CLOSE note, not one leading sentence: the close bounds the
 * span, so text typed into CC's own prompt after a stage-only send is not covered by the caveat.
 */
export const DICTATED_OPEN =
  "[Dictated via speech recognition — may contain transcription errors.]";
export const DICTATED_CLOSE = "[End dictated section.]";

export interface StagedPayloadOptions {
  /**
   * Append the trailing `\r` that submits the prompt.
   *
   * `true` = auto-submit (`⌘↵`); `false` = stage-only (`⇧⌘↵`), leaving the text in CC's
   * prompt for the operator to review and send themselves.
   */
  readonly submit: boolean;
  /**
   * Wrap the body in {@link DICTATED_OPEN} … {@link DICTATED_CLOSE}.
   *
   * ⚠️ REQUIRED, not optional-with-a-default: a default would let a caller that forgot to thread
   * the panel's toggle through compile cleanly and silently ignore it.
   */
  readonly dictated: boolean;
}

/**
 * The exact `cc_input` payload for a staged body — base64, as the IPC expects.
 *
 * ⚠️ **Base64 is not optional decoration.** `cc_input` takes `{ sessionId, data }` where
 * `data` is base64 (a `Vec<u8>` over IPC would be a heavy JSON number array). Returning raw
 * text here would not arrive.
 *
 * ⚠️ **Uses `encodeBase64` from `cc/bridge` — the single frontend chokepoint for this
 * encoding.** Its binary string is built with a CHUNKED `String.fromCharCode` spread; a single
 * spread over the whole byte array would overflow the call-argument limit on a large body, and
 * a long single-take dictation is the input most likely to be large. The 200k-body test in
 * `stagedPayload.test.ts` fails if that chunking is removed.
 */
export function stagedPayload(
  body: string,
  options: StagedPayloadOptions,
): string {
  // ⚠️ Wrap FIRST, so the notes' own line breaks go through the same normalization below and the
  // `ESC[201~` neutralization covers the whole wrapped text, not just the body. Wrapping after
  // would put a raw `\n` on the wire, which in raw mode is autocomplete typeahead, not a newline.
  const text = options.dictated
    ? `${DICTATED_OPEN}\n${body}\n${DICTATED_CLOSE}`
    : body;

  // Interior newlines → `\r`, matching xterm's own paste transform. `\r\n` collapses to a
  // single `\r` (not two) so a CRLF-authored body does not gain blank lines.
  const normalized = text.replace(/\r\n|\n/g, "\r");

  // ⚠️ A literal `ESC[201~` inside the body would END the envelope early, and everything
  // after it would be interpreted as keystrokes rather than pasted text — control sequences
  // included. This is the one injection-shaped hole in the envelope, so the terminator is
  // neutralized rather than passed through. Dropping it (not escaping it) is deliberate:
  // there is no in-band escape for it in the bracketed-paste protocol, and the sequence has
  // no legitimate meaning in operator prose. `PASTE_START` is left alone — it is inert
  // inside an already-open envelope.
  const safe = normalized.split(PASTE_END).join("");

  const envelope = `${PASTE_START}${safe}${PASTE_END}`;
  return encodeBase64(options.submit ? `${envelope}\r` : envelope);
}
