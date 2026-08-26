import { describe, expect, it } from "vitest";
import {
  readyToRespawn,
  applyConfirmBody,
  driveModeWriteFor,
} from "../applyDriveMode";
import type { WireWorkspaceState } from "../../../state/workspaceStatus";

describe("readyToRespawn", () => {
  // ⚠️ THE WHOLE UNION, asserted exhaustively rather than spot-checked. The property that
  // matters is which states are EXCLUDED, and a test that only checks `idle → true` would pass
  // while every other state was silently admitted.
  const cases: ReadonlyArray<readonly [WireWorkspaceState, boolean]> = [
    ["idle", true],
    ["running", false],
    ["awaiting_input", false],
    ["background_work", false],
    // ⚠️ `unknown` is now TWO cases — see the dedicated tests below.
  ];

  for (const [state, expected] of cases) {
    it(`${state} → ${expected}`, () => {
      expect(readyToRespawn(state)).toBe(expected);
    });
  }

  it("rejects background_work — control returned, but a job is still running", () => {
    // ⚠️ THE TEMPTING WRONG ANSWER, called out on its own because the codebase contains a
    // predicate that DOES accept it: `recycleSession` matches `idle || background_work`, and
    // copying that here would kill a live background job on every apply.
    //
    // The two answer different questions. That one asks "did a `Stop` event arrive?" — the wire
    // carries only the derived state, so it must match every state a `Stop` maps to, and its own
    // comment says to keep the list in sync with `event_to_state`'s `Stop` arm "NOT with the set
    // of states that happen to mean 'not busy'". THIS predicate is that second set.
    // (`[[derived-state-is-not-a-proxy-for-its-event]]`, a shipped CRITICAL.)
    expect(readyToRespawn("background_work")).toBe(false);
  });

  it("accepts unknown WITH a live session — spawned, no turn yet, sitting at a prompt", () => {
    // ⚠️ REGRESSION TEST. Reported by the operator at Phase 4 verify-human: the dialog said
    // "Claude Code is busy" over a session plainly idle at a fresh prompt.
    //
    // The cause is structural, not a typo: `SessionStart` IS registered and forwarded, but
    // `event_to_state` deliberately returns `None` for it ("registering them does NOT flip any
    // dot"), so a freshly-spawned workspace stays `unknown` until the FIRST `UserPromptSubmit`.
    // That is also the most common moment to change a drive mode — right after opening a project.
    expect(readyToRespawn("unknown", true)).toBe(true);
  });

  it("rejects unknown with NO live session — nothing has spawned to respawn", () => {
    // The other half, and what keeps the case above honest: with no session, `unknown` really is
    // unobserved. There is nothing to restart and no grounds to call it idle.
    expect(readyToRespawn("unknown", false)).toBe(false);
  });

  it("a live session does NOT make a BUSY state respawnable", () => {
    // ⚠️ The `sessionLive` flag must widen ONLY the `unknown` case. If it leaked into the busy
    // states, an apply would discard a turn in flight or kill a live background job — which is
    // the whole point of the predicate.
    for (const busy of [
      "running",
      "awaiting_input",
      "background_work",
    ] as const) {
      expect(readyToRespawn(busy, true)).toBe(false);
    }
  });
});

describe("applyConfirmBody", () => {
  it("names the consequence — that Claude Code restarts", () => {
    // ⚠️ The consequence is the entire reason a confirm exists rather than a silent write. A
    // dialog reading only "Apply this change?" would hide exactly what it was added to surface.
    const now = applyConfirmBody(true, "fsd");
    expect(now.toLowerCase()).toContain("restart");
    expect(now).toContain("fsd");
  });

  it("promises the conversation survives — this is NOT Recycle", () => {
    // The turn-level respawn keeps the conversation (`--continue`). Recycle, the
    // session-boundary instrument, restores from a handoff document instead. The copy must not
    // blur them, or the operator cannot tell which one they just triggered.
    expect(applyConfirmBody(true, "fsd").toLowerCase()).toContain(
      "keeps this conversation",
    );
  });

  it("is honest about WHEN when the agent is busy", () => {
    // ⚠️ Saying "Claude Code restarts" while the respawn is actually queued would be a small lie
    // the operator discovers by watching nothing happen. The busy copy must say it waits.
    const busy = applyConfirmBody(false, "stepping");
    expect(busy.toLowerCase()).toContain("finishes");
    expect(busy.toLowerCase()).toContain("waits");
    expect(busy).toContain("stepping");
  });

  it("the two bodies differ — the busy case is not the same sentence", () => {
    // Guards against a refactor that collapses the branch and silently drops the queued
    // semantics, which would leave the busy path making a promise it does not keep.
    expect(applyConfirmBody(true, "fsd")).not.toBe(
      applyConfirmBody(false, "fsd"),
    );
  });
});

describe("driveModeWriteFor", () => {
  it("CANCEL PERSISTS NOTHING — the whole point of the confirm", () => {
    // ⚠️ REGRESSION TEST FOR A REAL GAP. At verify-codify, a mutant that made Cancel persist the
    // new mode (while still declining to respawn) passed ALL 2255 TESTS. That is precisely the
    // "looks live and is not" state AC-5 forbids: disk and readout claim a mode the running
    // session is not obeying, and the operator has no way to see the divergence.
    //
    // The handlers were inline `useCallback`s, so nothing could observe their write behavior, and
    // a `?raw` source guard cannot express a behavioral property. Extracting the DECISION is
    // arch.md's documented structural fix — and both outcomes now funnel through it, so there is
    // no second write path to diverge.
    expect(driveModeWriteFor("cancel")).toEqual({
      persist: false,
      respawn: false,
    });
  });

  it("APPLY does both — the write and the respawn travel together", () => {
    // Persisting without respawning leaves the session on the old mode with no indication;
    // respawning without persisting restarts CC to pick up a value that is not on disk. Apply is
    // ONE intent, so neither half is optional.
    expect(driveModeWriteFor("apply")).toEqual({
      persist: true,
      respawn: true,
    });
  });

  it("the two outcomes differ on persist — cancel is not a relabelled apply", () => {
    // Guards a refactor that collapses the branch. If both rows returned the same value the two
    // assertions above would still pass individually while the distinction they exist to protect
    // had silently disappeared.
    expect(driveModeWriteFor("cancel").persist).not.toBe(
      driveModeWriteFor("apply").persist,
    );
  });
});
