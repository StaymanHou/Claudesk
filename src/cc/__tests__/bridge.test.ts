// WP7 P2.1 — unit coverage for the pure CC bridge logic (base64 + state machine).
// DOM/PTY behavior is Playwright-verified in verify-self per the WP5 test posture;
// only the pure logic is unit-tested here.

import { describe, it, expect } from "vitest";
import {
  decodeBase64,
  encodeBase64,
  bridgeReducer,
  initialBridgeState,
  type BridgeState,
} from "../bridge";

describe("base64 helpers", () => {
  it("decodeBase64 round-trips raw bytes", () => {
    // "hi" + CR (the load-bearing 0x0d) + a high byte (ANSI ESC=0x1b).
    const b64 = btoa("hi\r\x1b");
    expect(Array.from(decodeBase64(b64))).toEqual([0x68, 0x69, 0x0d, 0x1b]);
  });

  it("encodeBase64 is the inverse of decodeBase64 for control bytes", () => {
    const input = "\r\n\x1b[2J"; // CR, LF, ESC, clear-screen — terminal control
    const decoded = decodeBase64(encodeBase64(input));
    expect(Array.from(decoded)).toEqual(
      Array.from(input, (c) => c.charCodeAt(0)),
    );
  });

  it("encodeBase64 emits UTF-8 bytes (ASCII/control one-byte, multi-byte expands)", () => {
    // Contract guard: a single-byte char round-trips to exactly its byte...
    expect(encodeBase64("\x0d")).toBe(btoa("\r"));
    // ...and a multi-byte glyph expands to its real UTF-8 bytes (not truncated).
    expect(encodeBase64("é")).toBe(btoa("\xc3\xa9")); // é = U+00E9 → [0xC3, 0xA9]
  });

  // WP4 (M10.5) reproduce-first — RED. The input side corrupts any multi-byte
  // glyph: `encodeBase64`'s `charCodeAt(i) & 0xff` truncates code units > 0xFF
  // (and code points that are surrogate pairs) instead of emitting the glyph's
  // UTF-8 bytes. Pasting an emoji / accented char into the CC prompt therefore
  // arrives at CC as `�`. The contract CC actually needs: encodeBase64 must send
  // the string's real UTF-8 bytes, so decoding yields those bytes losslessly.
  it("encodeBase64 sends a glyph's real UTF-8 bytes (multi-byte input round-trips)", () => {
    const enc = new TextEncoder();
    for (const glyph of ["é", "€", "café", "🎉", "→"]) {
      const sent = Array.from(decodeBase64(encodeBase64(glyph)));
      const utf8 = Array.from(enc.encode(glyph));
      expect(sent).toEqual(utf8);
    }
  });

  // WP4 codify — the user-observable property verify-human confirmed: the exact
  // string the user types/pastes into the CC prompt is the string CC receives
  // (FE encodes → CC decodes the bytes as UTF-8 → same string). Locks the
  // round-trip as a whole, above the byte-layout anchor.
  it("encodeBase64→decode→TextDecoder round-trips the original string", () => {
    const dec = new TextDecoder();
    for (const s of ["hi", "é", "café → 🎉 é", "日本語", "a\r\nb", ""]) {
      const roundTripped = dec.decode(decodeBase64(encodeBase64(s)));
      expect(roundTripped).toBe(s);
    }
  });

  it("encodeBase64 handles the empty string (no glyphs to encode)", () => {
    expect(encodeBase64("")).toBe("");
    expect(Array.from(decodeBase64(encodeBase64("")))).toEqual([]);
  });
});

describe("bridgeReducer", () => {
  it("starts spawning, goes live on spawned with the session id", () => {
    const next = bridgeReducer(initialBridgeState, {
      type: "spawned",
      sessionId: "cc-1",
    });
    expect(next.phase).toBe("live");
    expect(next.sessionId).toBe("cc-1");
  });

  it("goes to error with the message on spawn-failed", () => {
    const next = bridgeReducer(initialBridgeState, {
      type: "spawn-failed",
      errorMsg: "claude not found on PATH",
    });
    expect(next.phase).toBe("error");
    expect(next.errorMsg).toBe("claude not found on PATH");
    expect(next.sessionId).toBeNull();
  });

  it("goes to ended with the exit code on exited", () => {
    const live: BridgeState = {
      phase: "live",
      sessionId: "cc-1",
      exitCode: null,
      errorMsg: null,
    };
    const next = bridgeReducer(live, { type: "exited", exitCode: 0 });
    expect(next.phase).toBe("ended");
    expect(next.exitCode).toBe(0);
    expect(next.sessionId).toBe("cc-1");
  });

  it("relaunch resets to the initial spawning state", () => {
    const ended: BridgeState = {
      phase: "ended",
      sessionId: "cc-1",
      exitCode: 0,
      errorMsg: null,
    };
    expect(bridgeReducer(ended, { type: "relaunch" })).toEqual(
      initialBridgeState,
    );
  });

  it("ignores a stale spawned ack after the session already ended", () => {
    const ended: BridgeState = {
      phase: "ended",
      sessionId: "cc-1",
      exitCode: 0,
      errorMsg: null,
    };
    expect(bridgeReducer(ended, { type: "spawned", sessionId: "cc-2" })).toBe(
      ended,
    );
  });

  it("a late exit after an error stays in error", () => {
    const errored: BridgeState = {
      phase: "error",
      sessionId: null,
      exitCode: null,
      errorMsg: "boom",
    };
    expect(bridgeReducer(errored, { type: "exited" })).toBe(errored);
  });
});
