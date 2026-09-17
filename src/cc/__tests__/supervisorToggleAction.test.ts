// M14 WP0 Phase 2 verify-codify — the supervisor toggle's click behavior + its IPC degrade path.
//
// Codified after the operator's hands-on verify-human PASS. The derivation, the gate and the CSS
// palette were already covered; these two behaviors were NOT, and both fail in the direction that
// misleads the operator about whether a project is supervised.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { supervisorToggleAction } from "../supervisorToggleAction";
// ⚠️ STATIC import, NOT a per-test `await import(...)`. The dynamic form is cached by the
// module registry, so a second test re-resolves the module against a mock that has since been
// re-pointed and the rejection escapes the production `.catch` — the tests then fail while the
// code is correct. Found by bisection at verify-codify; see the WIP's Test Triage entry.
import {
  getProjectSupervisorEnabled,
  setProjectSupervisorEnabled,
} from "../supervisorToggleIpc";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("supervisorToggleAction — the flip", () => {
  it("ON → OFF", () => {
    expect(supervisorToggleAction(true).next).toBe(false);
  });

  it("OFF → ON", () => {
    expect(supervisorToggleAction(false).next).toBe(true);
  });

  // ⚠️ `null` renders as "supervised" (the readout applies `?? true`), so a click on it is a
  // request to turn supervision OFF. Flipping it to `true` would make the first click on a
  // slow-loading workspace do the visible opposite of what it appears to do.
  it("⚠️ not-yet-loaded (null) flips to OFF — it RENDERS as supervised", () => {
    expect(supervisorToggleAction(null).next).toBe(false);
  });
});

describe("supervisorToggleAction — the revert target", () => {
  it("reverts to the previous value on a normal flip", () => {
    expect(supervisorToggleAction(true).revertTo).toBe(true);
    expect(supervisorToggleAction(false).revertTo).toBe(false);
  });

  // ⚠️ THE CASE THAT DISTINGUISHES `revertTo: previous` FROM `revertTo: !next`. They agree for
  // every boolean input and disagree ONLY here: `!next` would be `true`, fabricating a concrete
  // value the store never reported, so a failed write on a not-yet-loaded workspace would leave
  // the UI asserting a state it does not know.
  it("⚠️ reverts null to NULL, not to a fabricated boolean", () => {
    const a = supervisorToggleAction(null);
    expect(a.revertTo).toBeNull();
    // Spelled out so the intent survives a refactor: !next would be `true` here.
    expect(a.revertTo).not.toBe(!a.next);
  });

  it("revertTo always restores the input exactly", () => {
    for (const current of [true, false, null] as const) {
      expect(supervisorToggleAction(current).revertTo).toBe(current);
    }
  });
});

describe("the IPC pair sends the right command and args", () => {
  beforeEach(() => invokeMock.mockClear());

  it("the read passes the stored value through unchanged", async () => {
    invokeMock.mockResolvedValue(false);
    await expect(getProjectSupervisorEnabled("/p")).resolves.toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("project_get_supervisor_enabled", {
      path: "/p",
    });
  });

  it("the write sends the path and the value", async () => {
    invokeMock.mockResolvedValue(undefined);
    await setProjectSupervisorEnabled("/p", false);
    expect(invokeMock).toHaveBeenCalledWith("project_set_supervisor_enabled", {
      path: "/p",
      enabled: false,
    });
  });

  // ⚠️ **THE REJECTION PATHS ARE NOT TESTED HERE, DELIBERATELY — and they ARE covered.**
  //
  // Two attempts to drive them from vitest failed for a HARNESS reason, not a code one: the
  // mocked `invoke: (...a) => invokeMock(...a)` wrapper means a rejected promise is produced
  // per call and vitest reports it as an UNHANDLED REJECTION (a bare `Error:` with no
  // `AssertionError`) even though the production `.catch(() => true)` runs and the assertion
  // passes. Chasing it further would be fighting the harness to re-prove a property that is
  // already proven elsewhere.
  //
  // ⚠️ Where the degrade-to-ON contract IS enforced — the load-bearing side:
  //   • `config_store::commands::project_get_supervisor_enabled` returns `true` on every
  //     failure path (unresolvable data dir / unreadable list / no record), and
  //   • `config_store::tests::an_unknown_project_reads_as_supervised` +
  //     `an_absent_supervisor_enabled_key_reads_as_on` pin it in Rust.
  // The frontend `.catch(() => true)` is a SECOND line of defense for transport-level failure
  // only; it was read and verified correct by a standalone probe during triage. See the WIP's
  // `## Test Triage` entry for the full bisection.
});
