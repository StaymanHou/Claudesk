// WP7 P2.1 — Pure bridge logic for the embedded CC session.
//
// This module holds NO React and NO Tauri IPC — only the byte (de)coding and the
// session-lifecycle state machine that XtermPane drives. Keeping it pure makes it
// unit-testable under vitest without jsdom/RTL or a Tauri runtime (the WP5 frontend
// test posture: pure logic is unit-tested, live DOM/PTY is Playwright-verified in
// verify-self).
//
// Encoding: the backend emits PTY output as a base64 string on `cc-output-<sid>`
// and accepts keystrokes as a base64 string on `cc_input` (Vec<u8> over IPC is a
// heavy JSON number array; base64 is ~4x cheaper). These helpers are the single
// frontend chokepoint for that encoding.

/** Decode a base64 string (PTY output from the backend) to raw bytes. */
export function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode a UTF-8 string (an xterm `onData` chunk) to base64 for `cc_input`. */
export function encodeBase64(data: string): string {
  // Encode the string's real UTF-8 bytes so multi-byte input round-trips. A
  // pasted glyph (emoji, accented char, arrow, box-drawing) arrives as a JS
  // string whose code units are > 0xFF (or a surrogate pair); the old
  // `charCodeAt(i) & 0xff` truncated each to a single byte, so CC received `�`
  // (M10.5 WP4). `TextEncoder` yields the correct UTF-8 bytes, and the
  // byte→binary-string→btoa path is the exact inverse of decodeBase64. ASCII
  // and control bytes (CR/LF/ESC) are one-byte-per-char, so they round-trip
  // unchanged.
  const bytes = new TextEncoder().encode(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Lifecycle phase of the embedded session, as the pane renders it. */
export type BridgePhase = "spawning" | "live" | "ended" | "error";

export interface BridgeState {
  phase: BridgePhase;
  /** Backend session id, set once `cc_spawn` resolves. */
  sessionId: string | null;
  /** Present in `ended`: CC's exit info, if the backend reported one. */
  exitCode: number | null;
  /** Present in `error`: the spawn-failure message to surface to the user. */
  errorMsg: string | null;
}

export const initialBridgeState: BridgeState = {
  phase: "spawning",
  sessionId: null,
  exitCode: null,
  errorMsg: null,
};

/**
 * Bridge events, mirroring what XtermPane observes:
 * - `spawned`     — `cc_spawn` resolved with a session id
 * - `spawn-failed`— `cc_spawn` rejected (claude missing, etc.) → surface the error
 * - `exited`      — backend emitted `cc-exit-<sid>` (CC quit or was killed)
 * - `relaunch`    — user clicked Re-launch / Retry → back to spawning
 */
export type BridgeEvent =
  | { type: "spawned"; sessionId: string }
  | { type: "spawn-failed"; errorMsg: string }
  | { type: "exited"; exitCode?: number | null }
  | { type: "relaunch" };

/** Pure reducer for the session lifecycle. */
export function bridgeReducer(
  state: BridgeState,
  event: BridgeEvent,
): BridgeState {
  switch (event.type) {
    case "spawned":
      // Ignore a stale spawn ack once we've already ended/errored.
      if (state.phase !== "spawning") return state;
      return { ...state, phase: "live", sessionId: event.sessionId };
    case "spawn-failed":
      return {
        phase: "error",
        sessionId: null,
        exitCode: null,
        errorMsg: event.errorMsg,
      };
    case "exited":
      // A late exit event after an error stays in error (the error is the story).
      if (state.phase === "error") return state;
      return {
        ...state,
        phase: "ended",
        exitCode: event.exitCode ?? null,
      };
    case "relaunch":
      return { ...initialBridgeState };
    default:
      return state;
  }
}
