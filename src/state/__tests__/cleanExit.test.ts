import { describe, expect, it, vi, beforeEach } from "vitest";

// M12 WP2 — the frontend clean-exit clearing seam.
//
// These tests drive the REAL module (not a replica) per the standing
// `extract-for-import-when-a-raw-guard-cant-express-the-property` method. The IPC boundary
// is mocked because that is the thing being asserted: WHICH route name goes over the wire,
// and — more importantly — that the unclean path sends NOTHING.

const invokeMock = vi.fn<(cmd: string, args?: unknown) => Promise<boolean>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

import {
  markSessionClean,
  resolveCloseIntent,
  type CleanExitRoute,
} from "../cleanExit";

describe("resolveCloseIntent — the ⏸ intent must survive the confirm dialog", () => {
  // The × and the ⏸ share ONE confirm gate (a dirty or busy workspace shows the same
  // dialog for both), so the resolve has to remember which control opened it. A dropped
  // intent is SILENT and asymmetric: a ⏸ resolving as a clean close clears the very flag
  // the button exists to preserve, and nothing in the UI would reveal it.

  it("runs a CLEAN close when the × opened the confirm", () => {
    expect(resolveCloseIntent("close", { id: "ws-1", unclean: false })).toEqual(
      {
        action: "close-clean",
        id: "ws-1",
      },
    );
  });

  it("runs an UNCLEAN close when the ⏸ opened the confirm", () => {
    // The load-bearing case. If this ever returns "close-clean", the pause button is
    // silently broken for exactly the workspaces most likely to need it — the busy ones.
    expect(resolveCloseIntent("close", { id: "ws-1", unclean: true })).toEqual({
      action: "close-unclean",
      id: "ws-1",
    });
  });

  it("does nothing on cancel, for either intent", () => {
    expect(
      resolveCloseIntent("cancel", { id: "ws-1", unclean: false }),
    ).toEqual({ action: "none" });
    expect(resolveCloseIntent("cancel", { id: "ws-1", unclean: true })).toEqual(
      {
        action: "none",
      },
    );
  });

  it("does nothing when no close is pending", () => {
    // Guards the double-resolve / stale-dialog path: `setPendingClose(null)` runs before
    // this, so a second resolve must not tear down an already-closed workspace.
    expect(resolveCloseIntent("close", null)).toEqual({ action: "none" });
  });
});

describe("markSessionClean — M12 WP2 clean-exit clearing", () => {
  beforeEach(() => {
    // `mockReset` (not `mockClear`) + a fresh resolved default: the production code chains
    // `.catch()` onto the returned promise, so a bare `vi.fn()` returning `undefined` would
    // throw a TypeError inside the module under test and the failure would look like a
    // production bug rather than a mock gap.
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(true);
  });

  it("sends the project path and route to the backend command", () => {
    markSessionClean("/Users/dev/project-a", "workspace-close");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("session_state_mark_clean", {
      projectPath: "/Users/dev/project-a",
      route: "workspace-close",
    });
  });

  it("carries each clean route's wire name through unchanged", () => {
    // The wire vocabulary is a contract with the Rust `CleanExitRoute::from_wire`. A
    // renamed or reshaped string here silently stops clearing — the backend refuses to
    // clear on an unrecognized route (fail-safe), so the failure is a stale flag, which
    // is quiet rather than loud. Hence pinning every member.
    const routes: CleanExitRoute[] = [
      "workspace-close",
      "app-quit",
      "recycle-session",
    ];
    for (const route of routes) {
      invokeMock.mockClear();
      markSessionClean("/p", route);
      expect(invokeMock).toHaveBeenCalledWith(
        "session_state_mark_clean",
        expect.objectContaining({ route }),
      );
    }
  });

  it("never throws when the IPC call rejects — a close must not be blocked", () => {
    invokeMock.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    // The cost of a clearing failure is one spurious /resume offer; the cost of throwing
    // here would be a broken close on a teardown the user already committed to.
    expect(() => markSessionClean("/p", "workspace-close")).not.toThrow();
  });

  it("RECYCLE SESSION is a CLEAN boundary — pinned for M13 (P2.5)", () => {
    // M13's Recycle Session writes `.session.md` FIRST, so it is clean *by intent*: the
    // workflow state was deliberately handed off, and firing `/resume` over a recycled
    // session would resume work the user explicitly wrapped up.
    //
    // This test exists so M13 INHERITS the contract instead of rediscovering it — the
    // route already exists in the vocabulary and is proven to reach the backend. M13's
    // job is to CALL it, not to decide whether recycling is clean.
    markSessionClean("/Users/dev/recycled", "recycle-session");
    expect(invokeMock).toHaveBeenCalledWith("session_state_mark_clean", {
      projectPath: "/Users/dev/recycled",
      route: "recycle-session",
    });
  });

  it("has no route that would clear on an UNCLEAN exit (P2.4, by construction)", async () => {
    // The unclean-exit close must clear nothing. It achieves that by NOT CALLING this
    // module at all — there is deliberately no `markSessionUnclean` and no route whose
    // name suggests one. Asserting the absence is what makes "the button cannot forget to
    // opt out" a structural property rather than a call-site convention.
    //
    // ⚠️ Read the REAL module's exports. An earlier draft asserted over `Object.keys({})`,
    // which passes no matter what the module contains — a vacuous guard is worse than none,
    // because it reads as proof.
    const mod = await import("../cleanExit");
    expect(Object.keys(mod)).not.toContain("markSessionUnclean");
    expect(Object.keys(mod)).toContain("markSessionClean");

    const routes: CleanExitRoute[] = [
      "workspace-close",
      "app-quit",
      "recycle-session",
    ];
    expect(routes.some((r) => r.includes("unclean"))).toBe(false);
  });
});
