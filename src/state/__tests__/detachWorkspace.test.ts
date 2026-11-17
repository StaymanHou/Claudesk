// M17 WP5 Phase 3 (AC-4) — the Detach funnel: detach FIRST, then the unclean close; a failed detach
// keeps the tile (closing it would run the unmount `cc_kill`, which ENDS the remote session).
import { describe, expect, it } from "vitest";
import { detachThenClose } from "../detachWorkspace";

function run(over: { sessionId?: string | null; fail?: string }) {
  const events: string[] = [];
  const promise = detachThenClose({
    sessionId: over.sessionId === undefined ? "cc-4" : over.sessionId,
    detach: async (sid) => {
      events.push(`detach ${sid}`);
      if (over.fail !== undefined) throw over.fail;
    },
    closeUnclean: () => events.push("close"),
    onError: (m) => events.push(`error ${m}`),
  });
  return { promise, events };
}

describe("detachThenClose", () => {
  it("detaches the session, THEN closes the tile (unclean)", async () => {
    const r = run({});
    expect(await r.promise).toBe("closed");
    expect(r.events).toEqual(["detach cc-4", "close"]);
  });

  it("a failed detach keeps the tile and says why", async () => {
    const r = run({ fail: "session registry lock poisoned" });
    expect(await r.promise).toBe("kept");
    expect(r.events).toEqual([
      "detach cc-4",
      "error session registry lock poisoned",
    ]);
  });

  it("a session already gone closes the tile (nothing left to keep or kill)", async () => {
    const r = run({ fail: "no such session: cc-4" });
    expect(await r.promise).toBe("closed");
    expect(r.events).toEqual(["detach cc-4", "close"]);
  });

  it("no live session: no IPC, the tile closes", async () => {
    const r = run({ sessionId: null });
    expect(await r.promise).toBe("closed");
    expect(r.events).toEqual(["close"]);
  });
});
