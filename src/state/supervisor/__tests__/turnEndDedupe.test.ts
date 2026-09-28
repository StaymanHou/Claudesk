import { afterEach, describe, expect, it } from "vitest";
import { claimTurnEnd, resetTurnEnds } from "../turnEndDedupe";

afterEach(() => resetTurnEnds());

describe("claimTurnEnd", () => {
  it("claims an event once", () => {
    expect(claimTurnEnd("ws-1", 100)).toBe(true);
    expect(claimTurnEnd("ws-1", 100)).toBe(false);
  });

  it("keys on the workspace AND the event time", () => {
    expect(claimTurnEnd("ws-1", 100)).toBe(true);
    expect(claimTurnEnd("ws-2", 100)).toBe(true);
    expect(claimTurnEnd("ws-1", 101)).toBe(true);
  });

  it("never deduplicates an event without a send time", () => {
    expect(claimTurnEnd("ws-1", undefined)).toBe(true);
    expect(claimTurnEnd("ws-1", undefined)).toBe(true);
  });

  it("remembers a bounded window, so it cannot grow for the life of the app", () => {
    expect(claimTurnEnd("ws-1", 0)).toBe(true);
    for (let t = 1; t <= 64; t++) claimTurnEnd("ws-1", t);
    // The oldest claim has been evicted; the most recent is still remembered.
    expect(claimTurnEnd("ws-1", 0)).toBe(true);
    expect(claimTurnEnd("ws-1", 64)).toBe(false);
  });
});
