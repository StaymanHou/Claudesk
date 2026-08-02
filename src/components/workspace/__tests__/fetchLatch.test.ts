import { describe, expect, it } from "vitest";
import { latchNext, shouldFetch, type LatchState } from "../docs/fetchLatch";

// M11 WP3 — the StrictMode regression test.
//
// This file exists because the Docs panel shipped a fetch latch that deadlocked under
// React StrictMode and rendered a permanently BLANK panel. It reached verify-human. Every
// automated gate was green: tsc, lint, 1538 unit tests, a clean production build. Nothing
// modelled the mount → unmount → remount sequence, so nothing could have caught it.
//
// The lesson encoded here: an effect's LIFECYCLE is ordering-dependent behavior, and this
// repo's rule is that such logic must be a pure function asserted as a value. A comment
// claiming "the ref is never reset and that is sound" was the whole proof before — and it
// was wrong.

/** Replay a sequence of latch events, returning the final state. */
function replay(events: Array<"start" | "settle" | "cancel">): LatchState {
  return events.reduce<LatchState>((s, e) => latchNext(s, e), "idle");
}

describe("the StrictMode sequence (the bug that shipped)", () => {
  it("re-arms after a cancelled in-flight fetch, so the remount CAN fetch", () => {
    // mount → fetch starts → unmount cancels it. React will remount immediately.
    const afterFirstMount = replay(["start", "cancel"]);
    expect(afterFirstMount).toBe("idle");
    // The remount must be allowed to fetch. This is the exact assertion that would have
    // caught the blank panel: with the old never-released latch this was `false`.
    expect(shouldFetch(afterFirstMount, true)).toBe(true);
  });

  it("full StrictMode cycle ends with data committed exactly once", () => {
    // mount, cancel (unmount), remount, settle — the real sequence in dev.
    let s: LatchState = "idle";
    s = latchNext(s, "start"); // first mount fires
    s = latchNext(s, "cancel"); // StrictMode unmount discards it
    expect(shouldFetch(s, true)).toBe(true); // remount may fetch
    s = latchNext(s, "start"); // remount fires
    s = latchNext(s, "settle"); // response commits
    expect(s).toBe("settled");
    expect(shouldFetch(s, true)).toBe(false); // and never fetches again
  });

  it("REGRESSION: a settled latch is never re-armed by a later unmount", () => {
    // The opposite failure. Workspaces stay mounted and switching the center stage away
    // and back must NOT refetch — so cancel-after-settle has to be a no-op. A naive fix
    // that always re-armed on cleanup would pass the test above and break this one.
    const s = replay(["start", "settle", "cancel"]);
    expect(s).toBe("settled");
    expect(shouldFetch(s, true)).toBe(false);
  });
});

describe("fetch-once, stated rather than emergent", () => {
  it("does not start a second fetch while one is in flight", () => {
    const s = replay(["start", "start"]);
    expect(s).toBe("in-flight");
  });

  it("does not fetch while the workspace is not visible", () => {
    // `visible` gates the FIRST fetch so a backgrounded workspace never hits the disk.
    expect(shouldFetch("idle", false)).toBe(false);
    expect(shouldFetch("idle", true)).toBe(true);
  });

  it("ignores a settle for a fetch that was already cancelled", () => {
    // The discarded-response path: the caller drops the data, so the latch must not
    // record it as committed — otherwise the remount's own fetch would be blocked.
    const s = replay(["start", "cancel", "settle"]);
    expect(s).toBe("idle");
    expect(shouldFetch(s, true)).toBe(true);
  });
});
