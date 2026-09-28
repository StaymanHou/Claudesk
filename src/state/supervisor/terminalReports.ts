// silent-supervisor Phase 2 — WHICH BYTES OF AN `onData` CHUNK THE TERMINAL GENERATED ITSELF.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ `term.onData` IS NOT ONLY THE OPERATOR'S TYPING.
//
// xterm answers the program's terminal queries through the same `onData` stream the keystrokes
// use, so the unsent-input watermark read them as typing. Captured live in the dev WKWebView
// (2026-09-28, `UnsentInputWatermark.prototype.push` tapped):
//
//   | When                                   | Chunk                  | What it is       |
//   |----------------------------------------|------------------------|------------------|
//   | workspace opens, CC starting, no input | `ESC [ I`              | focus-in report  |
//   | 260 ms later                           | `ESC [ ? 1 ; 2 c`      | DA1 reply        |
//   | switching to the picker                | `ESC [ O`              | focus-out report |
//   | focusing the pane                      | `ESC [ I`              | focus-in report  |
//
// Each ends on a byte outside the clearing set, so each RAISED the watermark: every workspace
// opened suppressed, and every focus change re-suppressed it. The supervisor went silent exactly
// when the operator looked away (`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-
// SESSION`, cause 2).
//
// ⚠️ **ONE CLASSIFIER FOR BOTH READERS.** The watermark (`foldInput`) and the turn-attribution
// cancel (`cancelOrigin`, via `routeCcInput`) both read what this leaves. The PTY still gets the
// RAW chunk: CC asked for these reports and must keep receiving them.
//
// ⚠️ **ONLY COMPLETE REPORT SEQUENCES ARE REMOVED; KEYSTROKE SEQUENCES STAY.** Arrows
// (`ESC [ A`–`D`), Home/End, PageUp/Down and function keys are operator input and still count.
// The one overlap: a cursor-position report (`ESC [ <row> ; <col> R`) has the same shape as a
// MODIFIED F3 (Shift+F3 is `ESC [ 1 ; 2 R`). Such a key is dropped too. It types nothing into
// CC's input line, so dropping it cannot hide a half-typed prompt.

const ESC = String.fromCharCode(0x1b);

/**
 * The report sequences xterm generates in reply to a program: focus in/out (`CSI I` /
 * `CSI O`, enabled by the program's `CSI ? 1004 h`), primary and secondary device attributes
 * (`CSI ? … c`, `CSI > … c`), and a cursor-position report (`CSI <row> ; <col> R`).
 */
const REPORT = new RegExp(`${ESC}\\[(?:[IO]|[?>][0-9;]*c|[0-9]+;[0-9]+R)`, "g");

/**
 * The chunk without its terminal-generated report sequences. What remains is what the operator
 * sent; an empty string means the chunk was reports only.
 */
export function stripTerminalReports(chunk: string): string {
  return chunk.replace(REPORT, "");
}
