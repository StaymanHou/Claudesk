import { afterEach, describe, expect, it } from "vitest";
import {
  ORIGIN_CLAIM_WINDOW_MS,
  armOrigin,
  cancelOrigin,
  claimOrigin,
  isClaimable,
  resetOrigins,
} from "../turnOrigin";

// Turn attribution: the supervisor arms an origin before it injects, and the next turn start on
// that workspace claims it. See `turnOrigin.ts` for the P3.1 probe numbers behind the window.

const AT = 1_000_000;
const fire = (command = "/feature-verify-auto") => ({ command, firedAt: AT });

afterEach(() => resetOrigins());

describe("isClaimable", () => {
  it("claims at the moment of arming and at the window's last millisecond", () => {
    expect(isClaimable(fire(), AT)).toBe(true);
    expect(isClaimable(fire(), AT + ORIGIN_CLAIM_WINDOW_MS)).toBe(true);
  });

  it("refuses one millisecond past the window", () => {
    expect(isClaimable(fire(), AT + ORIGIN_CLAIM_WINDOW_MS + 1)).toBe(false);
  });

  it("refuses a clock that went backwards", () => {
    expect(isClaimable(fire(), AT - 1)).toBe(false);
  });

  it("covers the measured latency with a wide margin", () => {
    // P3.1: the worst sample was 49 ms (broadcaster) and 40 ms at the webview.
    expect(ORIGIN_CLAIM_WINDOW_MS).toBeGreaterThanOrEqual(49 * 10);
  });
});

describe("arm / claim / cancel", () => {
  it("a turn start inside the window claims the armed origin, by identity", () => {
    const origin = fire();
    armOrigin("ws-1", origin);
    expect(claimOrigin("ws-1", AT + 40)).toBe(origin);
  });

  it("is consume-once: a second turn start gets nothing", () => {
    armOrigin("ws-1", fire());
    expect(claimOrigin("ws-1", AT + 40)).not.toBeNull();
    expect(claimOrigin("ws-1", AT + 41)).toBeNull();
  });

  it("an expired origin is discarded, not left to tag a later turn", () => {
    armOrigin("ws-1", fire());
    expect(claimOrigin("ws-1", AT + ORIGIN_CLAIM_WINDOW_MS + 1)).toBeNull();
    // Even a turn start whose clock reads inside the window now finds nothing.
    expect(claimOrigin("ws-1", AT + 40)).toBeNull();
  });

  it("operator input cancels the pending origin", () => {
    armOrigin("ws-1", fire());
    cancelOrigin("ws-1");
    expect(claimOrigin("ws-1", AT + 40)).toBeNull();
  });

  it("is per workspace: another workspace's turn start neither claims nor consumes it", () => {
    const origin = fire();
    armOrigin("ws-1", origin);
    expect(claimOrigin("ws-2", AT + 40)).toBeNull();
    cancelOrigin("ws-2");
    expect(claimOrigin("ws-1", AT + 40)).toBe(origin);
  });

  it("a newer fire replaces an older pending one", () => {
    armOrigin("ws-1", fire("/feature-build"));
    const newer = fire("/feature-verify-auto");
    armOrigin("ws-1", newer);
    expect(claimOrigin("ws-1", AT + 40)).toBe(newer);
  });

  it("nothing armed → nothing claimed", () => {
    expect(claimOrigin("ws-1", AT)).toBeNull();
  });
});
