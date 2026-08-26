// M13.5 WP4 P2 — the workspace drive-mode readout's derivation.
//
// The gate-OFF direction is owned by the OFF-invariant guard's ARM 6
// (`state/__tests__/offInvariantGuard.test.ts`), mutation-proven there and deliberately not
// duplicated here — one authority per property. This file covers the ON behaviour: the
// stored/running split, staleness, and the `sessionLive` distinction.

import { describe, it, expect } from "vitest";
import {
  workspaceDriveModeReadout,
  WORKSPACE_DRIVE_MODE_UNSET_LABEL,
} from "../workspaceDriveMode";

describe("workspaceDriveModeReadout", () => {
  it("shows the STORED mode, because that is what the next spawn will use", () => {
    const r = workspaceDriveModeReadout("autopilot", "autopilot", true, true);
    expect(r?.text).toBe("autopilot");
    expect(r?.isStale).toBe(false);
  });

  it("marks itself STALE when stored and running disagree", () => {
    // The operator changed the mode mid-session. The live process's env is fixed, so the
    // running session is still on the old value — the readout must say so rather than
    // reporting a mode the session is not obeying.
    const r = workspaceDriveModeReadout("fsd", "autopilot", true, true);
    expect(r?.isStale).toBe(true);
    expect(r?.stored).toBe("fsd");
    expect(r?.running).toBe("autopilot");
    // The tooltip must name BOTH values — a bare "stale" marker with no numbers leaves the
    // operator to guess which way round it is.
    expect(r?.title).toContain("fsd");
    expect(r?.title).toContain("autopilot");
  });

  it("the stale tooltip points at APPLYING here, never at a future session", () => {
    // ⚠️ REGRESSION GUARD — this exact copy shipped wrong and the operator rejected it at
    // Phase 2 verify-human as "against my spec". The first version read "takes effect on the
    // next session", which describes the DESIGN WP4 REJECTED: waiting for a new session is what
    // Recycle does (handoff → kill → restore from notes), and the whole point here is the
    // turn-level respawn that keeps the conversation (`OpenIntent::TurnRespawn`, P1).
    //
    // A copy rule with no guard decays, and this one already slipped once — so the prohibition
    // is asserted, not just documented.
    const r = workspaceDriveModeReadout("fsd", "autopilot", true, true);
    const title = r!.title;

    // (a) It must name what the session is ACTUALLY running, or the operator cannot tell which
    //     way round the mismatch is.
    expect(title).toContain("autopilot");
    expect(title).toContain("fsd");

    // (b) ⚠️ It must NOT defer to a future session. These are the phrasings that mean "wait",
    //     which is the rejected mechanism.
    for (const deferral of [
      "next session",
      "next spawn",
      "next time",
      "will use",
      "on reopen",
    ]) {
      expect(
        title.toLowerCase(),
        `the stale tooltip says "${deferral}" — that describes waiting for a new session, ` +
          `which is Recycle's semantics and the design WP4 rejected. Stale must point at ` +
          `APPLYING the mode to this session (turn-level respawn, keeping the conversation).`,
      ).not.toContain(deferral);
    }

    // (c) It must point at acting. Kept as a loose check on the ACTION word rather than the
    //     full sentence — pinning exact prose would break on every copy edit and teach the
    //     next person to delete the guard.
    expect(title.toLowerCase()).toContain("apply");
  });

  it("is NOT stale when no session is live, whatever the stored value", () => {
    // ⚠️ THE DISTINCTION `sessionLive` EXISTS FOR. A workspace whose CC has not spawned (or
    // whose spawn failed) has no running mode — which is NOT the same as "running under no
    // mode". Without this, a not-yet-spawned workspace with a stored mode would render stale
    // and (from Phase 4) offer an apply-now respawn against a session that does not exist.
    const r = workspaceDriveModeReadout("fsd", null, true, false);
    expect(r?.isStale).toBe(false);
    expect(r?.text).toBe("fsd");
  });

  it("distinguishes 'project pins no mode' from 'session got no mode'", () => {
    // Both are `null`, and they are different facts: a project CAN pin a mode that a
    // gate-off session never received. Stale is the honest answer for the second.
    const noneStored = workspaceDriveModeReadout(null, null, true, true);
    expect(noneStored?.text).toBe(WORKSPACE_DRIVE_MODE_UNSET_LABEL);
    expect(noneStored?.isStale).toBe(false);

    const storedButNotRunning = workspaceDriveModeReadout(
      "stepping",
      null,
      true,
      true,
    );
    expect(storedButNotRunning?.isStale).toBe(true);
    expect(storedButNotRunning?.title).toContain(
      WORKSPACE_DRIVE_MODE_UNSET_LABEL,
    );
  });

  it("renders every mode's wire string verbatim — no second vocabulary", () => {
    // ⚠️ `fsd` and `stepping` are the load-bearing spellings; `full-autopilot` /
    // `step-by-step` are the wrong guesses and fail serde on read, taking the whole project
    // list down. This surface must never invent a display alias for them.
    for (const mode of [
      "stepping",
      "orchestrated",
      "autopilot",
      "fsd",
    ] as const) {
      expect(workspaceDriveModeReadout(mode, mode, true, true)?.text).toBe(
        mode,
      );
    }
  });
});
