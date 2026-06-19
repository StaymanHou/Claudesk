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

  it("encodeBase64 masks to a single byte per char", () => {
    // xterm onData never yields > 0xff, but the mask guards the contract.
    expect(encodeBase64("\x0d")).toBe(btoa("\r"));
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
