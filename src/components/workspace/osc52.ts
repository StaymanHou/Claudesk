// M18 WP2.5 — OSC 52 ("set the clipboard") from a terminal pane, WRITE ONLY.
//
// A remote pane's tmux sends every copy (a drag-select under `mouse on`, or remote CC's own
// `/copy` passed through by `set-clipboard on`) to its client as `ESC ] 52 ; Pc ; Pd BEL`, where
// Pd is the base64 of the text. xterm.js has no OSC 52 handler of its own, so before this the text
// was dropped and a remote drag never reached the Mac (probe Q1, `m18-wp2-5-…` WIP).
//
// ⚠️ WRITE ONLY. A Pd of `?` is a READ query ("tell me the clipboard"). It is ignored and NEVER
// answered: nothing is written back to the terminal or the PTY, so no program in any pane can read
// this Mac's clipboard. (tmux answers in-pane reads from its own host-side buffer, which never
// reaches here.)
//
// Measured shapes: tmux sends an EMPTY Pc (`52;;<b64>`), and apps send `c`. Any Pc is treated as
// the clipboard. The write goes through Rust (`clipboard_write` → `pbcopy`), because WKWebView
// rejects `navigator.clipboard.writeText` with no live user activation (probe Q2), and an OSC 52 from
// `/copy` arrives with none.
import { invoke } from "@tauri-apps/api/core";

/** The largest decoded copy accepted. Mirrors `MAX_CLIPBOARD_BYTES` in `src-tauri/src/clipboard.rs`. */
export const MAX_CLIPBOARD_BYTES = 4 * 1024 * 1024;

/** The longest base64 payload that can decode to at most {@link MAX_CLIPBOARD_BYTES}. */
const MAX_PAYLOAD_CHARS = Math.ceil(MAX_CLIPBOARD_BYTES / 3) * 4;

/**
 * What an OSC 52 payload (`Pc;Pd`, everything after `52;`) asks for:
 * - `{ kind: "text" }`: put this text on the clipboard;
 * - `{ kind: "too-large" }`: a write over the cap, REFUSED (paydown-2026-11-27 WP8: the operator is
 *   told, because a silent refusal pastes the PREVIOUS clipboard as if it were this copy);
 * - `null`: nothing this handler does, and nothing to tell (a read query `?`, an empty Pd,
 *   malformed base64).
 */
export type Osc52Write = { kind: "text"; text: string } | { kind: "too-large" };

export function osc52Decode(data: string): Osc52Write | null {
  const semi = data.indexOf(";");
  if (semi < 0) return null;
  const pd = data.slice(semi + 1);
  // The READ query. `atob("?")` would also throw below, so no test can tell this line from its
  // absence (an equivalent mutant). It is kept so the write-only rule is stated where it is decided.
  if (pd === "" || pd === "?") return null;
  if (pd.length > MAX_PAYLOAD_CHARS) return { kind: "too-large" };
  let binary: string;
  try {
    binary = atob(pd);
  } catch {
    return null;
  }
  if (binary.length > MAX_CLIPBOARD_BYTES) return { kind: "too-large" };
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  // `atob` yields one char per BYTE; the text is UTF-8 (multi-byte copies, measured with `héllo ✓`).
  return { kind: "text", text: new TextDecoder("utf-8").decode(bytes) };
}

/** The text {@link osc52Decode} would copy, or `null` (refused or nothing to copy). */
export function osc52Text(data: string): string | null {
  const w = osc52Decode(data);
  return w?.kind === "text" ? w.text : null;
}

/** Where a decoded copy goes. The default sends it to the Mac clipboard through Rust. */
export type ClipboardSink = (text: string) => void;

/** Told, in plain words, when a copy did NOT reach the clipboard (the workspace's error notice). */
export type CopyFailureSink = (notice: string) => void;

/** The notice for a copy over the cap. */
export const COPY_TOO_LARGE_NOTICE = `That copy was larger than ${MAX_CLIPBOARD_BYTES / (1024 * 1024)} MiB, so it was not copied. The clipboard still holds what you copied before.`;

/** The notice for a copy the clipboard write rejected (`clipboard_write` / `pbcopy`). */
export function copyFailedNotice(reason: string): string {
  return `Couldn't copy to the clipboard: ${reason}. The clipboard still holds what you copied before.`;
}

/**
 * The Mac-clipboard sink: `clipboard_write` (→ `pbcopy`). A rejection is told to `onFailure`
 * (paydown-2026-11-27 WP8; it used to reach only `console.warn`, which nobody sees in this app).
 */
export function macClipboardSink(onFailure?: CopyFailureSink): ClipboardSink {
  return (text) => {
    invoke("clipboard_write", { text }).catch((e: unknown) => {
      console.warn("[claudesk] OSC 52 copy failed:", e);
      onFailure?.(copyFailedNotice(e instanceof Error ? e.message : String(e)));
    });
  };
}

export const writeMacClipboard: ClipboardSink = macClipboardSink();

/**
 * The OSC 52 handler for `term.parser.registerOscHandler(52, …)`. It always returns `true`
 * (consumed), so xterm.js never acts on the sequence itself, and it never writes a reply. A refused
 * (too-large) copy is told to `onFailure`; a read query or a malformed payload is not.
 */
export function osc52Handler(
  sink: ClipboardSink = writeMacClipboard,
  onFailure?: CopyFailureSink,
): (data: string) => boolean {
  return (data) => {
    const w = osc52Decode(data);
    if (w?.kind === "text") sink(w.text);
    else if (w?.kind === "too-large") onFailure?.(COPY_TOO_LARGE_NOTICE);
    return true;
  };
}

/** The slice of an xterm `Terminal` this module needs. */
export interface Osc52Host {
  parser: {
    registerOscHandler(
      ident: number,
      callback: (data: string) => boolean | Promise<boolean>,
    ): { dispose(): void };
  };
}

/** Register the write-only OSC 52 handler on `term`. Returns its disposable. */
export function registerOsc52(
  term: Osc52Host,
  sink: ClipboardSink = writeMacClipboard,
  onFailure?: CopyFailureSink,
): { dispose(): void } {
  return term.parser.registerOscHandler(52, osc52Handler(sink, onFailure));
}
