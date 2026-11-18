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
 * The text an OSC 52 payload (`Pc;Pd`, everything after `52;`) asks to put on the clipboard, or
 * `null` when it asks for nothing this handler does: a read query (`?`), an empty Pd, a payload
 * over the cap, or malformed base64.
 */
export function osc52Text(data: string): string | null {
  const semi = data.indexOf(";");
  if (semi < 0) return null;
  const pd = data.slice(semi + 1);
  // The READ query. `atob("?")` would also throw below, so no test can tell this line from its
  // absence (an equivalent mutant). It is kept so the write-only rule is stated where it is decided.
  if (pd === "" || pd === "?") return null;
  if (pd.length > MAX_PAYLOAD_CHARS) return null;
  let binary: string;
  try {
    binary = atob(pd);
  } catch {
    return null;
  }
  if (binary.length > MAX_CLIPBOARD_BYTES) return null;
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  // `atob` yields one char per BYTE; the text is UTF-8 (multi-byte copies, measured with `héllo ✓`).
  return new TextDecoder("utf-8").decode(bytes);
}

/** Where a decoded copy goes. The default sends it to the Mac clipboard through Rust. */
export type ClipboardSink = (text: string) => void;

export const writeMacClipboard: ClipboardSink = (text) => {
  invoke("clipboard_write", { text }).catch((e: unknown) => {
    console.warn("[claudesk] OSC 52 copy failed:", e);
  });
};

/**
 * The OSC 52 handler for `term.parser.registerOscHandler(52, …)`. It always returns `true`
 * (consumed), so xterm.js never acts on the sequence itself, and it never writes a reply.
 */
export function osc52Handler(
  sink: ClipboardSink = writeMacClipboard,
): (data: string) => boolean {
  return (data) => {
    const text = osc52Text(data);
    if (text !== null) sink(text);
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
): { dispose(): void } {
  return term.parser.registerOscHandler(52, osc52Handler(sink));
}
