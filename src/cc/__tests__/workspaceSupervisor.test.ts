// M14 WP0 Phase 2 — the supervisor toggle's derivation.
//
// The OFF-invariant guard (arm 6) already pins the GATE behavior and the anti-vacuity positive.
// This file owns the rest of the contract: the two states are distinguishable, the copy states
// the consequence rather than the flag, and the label names the workspace.

import { describe, expect, it } from "vitest";
import {
  SUPERVISOR_OFF_LABEL,
  SUPERVISOR_ON_LABEL,
  workspaceSupervisorReadout,
} from "../workspaceSupervisor";

describe("workspaceSupervisorReadout — the two states", () => {
  it("reports ON with the on label", () => {
    const r = workspaceSupervisorReadout(true, true, "Claudesk");
    expect(r?.enabled).toBe(true);
    expect(r?.text).toBe(SUPERVISOR_ON_LABEL);
  });

  it("reports OFF with the off label", () => {
    const r = workspaceSupervisorReadout(false, true, "Claudesk");
    expect(r?.enabled).toBe(false);
    expect(r?.text).toBe(SUPERVISOR_OFF_LABEL);
  });

  it("⚠️ the two labels are DISTINCT — a shared label makes the control decorative", () => {
    expect(SUPERVISOR_ON_LABEL).not.toBe(SUPERVISOR_OFF_LABEL);
  });
});

describe("workspaceSupervisorReadout — the copy", () => {
  // ⚠️ The tooltip must state what will HAPPEN, not merely restate the flag. "Supervisor: on"
  // tells the operator nothing the label does not already show; naming the consequence is what
  // makes a two-state control self-explaining on hover. Asserted on the CONSEQUENCE words so a
  // rewrite to a bare state restatement fails here.
  it("the ON tooltip names the consequence and the escape", () => {
    const t = workspaceSupervisorReadout(true, true, "Claudesk")?.title ?? "";
    expect(t).toMatch(/auto-run/i);
    expect(t, "must say the off switch is per-project").toMatch(
      /this project/i,
    );
  });

  it("the OFF tooltip promises no firing, and says how to undo it", () => {
    const t = workspaceSupervisorReadout(false, true, "Claudesk")?.title ?? "";
    expect(t).toMatch(/never auto-run/i);
    expect(t).toMatch(/back on/i);
  });

  it("the accessible label names the workspace and the state", () => {
    // Several workspaces stay mounted at once, so a label that omitted the name would be
    // ambiguous to a screen reader moving between headers.
    const on = workspaceSupervisorReadout(true, true, "Project Alpha");
    expect(on?.label).toContain("Project Alpha");
    expect(on?.label).toMatch(/\bon\b/);

    const off = workspaceSupervisorReadout(false, true, "Project Beta");
    expect(off?.label).toContain("Project Beta");
    expect(off?.label).toMatch(/\boff\b/);
  });
});

describe("⚠️ the toggle does NOT depend on the drive mode", () => {
  // ⚠️ A project with no stored drive mode is not supervised TODAY, so hiding the toggle there
  // would be superficially reasonable — and wrong: the operator could never pre-set it, and the
  // control would appear and disappear as the mode is set and cleared. The derivation takes no
  // drive-mode argument at all, which is what makes that structural rather than incidental.
  it("takes no drive-mode input — the two settings are independent", () => {
    // ⚠️ `.length` counts only params BEFORE the first default, so Phase 3's optional
    // `unsentInput` does not appear here. That makes this assertion quietly weaker than it
    // looks, so the real property is asserted directly instead: the function cannot consult a
    // drive mode it never receives.
    expect(workspaceSupervisorReadout.length).toBe(3);
    const src = workspaceSupervisorReadout.toString();
    expect(src).not.toMatch(/driveMode|DriveMode|storedMode/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M14 WP0 Phase 3 (D-5) — THE THIRD STATE.
//
// ⚠️ **FOUR CASES, ASSERTED INDIVIDUALLY.** Three of them collapse into "no marker", so a single
// negative case would pass with two of the three unimplemented — the same per-arm discipline the
// four clearing bytes get in `unsentInput.test.ts`.
describe("the SUPPRESSED state (D-5)", () => {
  it("1/4 — gate ON + toggle ON + unsent input → SUPPRESSED", () => {
    const r = workspaceSupervisorReadout(true, true, "W", true);
    expect(r?.suppressed).toBe(true);
  });

  it("2/4 — gate OFF → no readout at all (so no marker)", () => {
    expect(workspaceSupervisorReadout(true, false, "W", true)).toBeNull();
  });

  it("3/4 — toggle OFF → NOT suppressed, even with unsent input", () => {
    // ⚠️ A workspace the operator turned off is not "held back by your typing" — it is off.
    // Showing both would make the badge mean two things at once.
    const r = workspaceSupervisorReadout(false, true, "W", true);
    expect(r?.suppressed).toBe(false);
    expect(r?.enabled).toBe(false);
  });

  it("4/4 — no unsent input → NOT suppressed", () => {
    expect(workspaceSupervisorReadout(true, true, "W", false)?.suppressed).toBe(
      false,
    );
  });

  it("defaults to NOT suppressed when the argument is omitted", () => {
    // Back-compat: every pre-Phase-3 call site passes three arguments.
    expect(workspaceSupervisorReadout(true, true, "W")?.suppressed).toBe(false);
  });
});

describe("the SUPPRESSED copy", () => {
  // ⚠️ The tooltip must say the supervisor is WORKING, not broken, and name what clears it —
  // otherwise a held-back workspace reads as a faulty one, the opposite of the reassurance the
  // marker exists to give.
  it("says it is held back, not off, and names the way out", () => {
    const t = workspaceSupervisorReadout(true, true, "W", true)?.title ?? "";
    expect(t).toMatch(/held back/i);
    expect(t, "must name the clearing keys").toMatch(/esc/i);
    expect(t).toMatch(/unsent input/i);
  });

  it("the accessible label mentions the held-back state", () => {
    const l = workspaceSupervisorReadout(true, true, "W", true)?.label ?? "";
    expect(l).toMatch(/held back/i);
  });

  it("⚠️ a NON-suppressed ON readout does NOT claim to be held back", () => {
    // The anti-vacuity half: if the suppressed copy were returned unconditionally, every
    // assertion above would pass while the state was meaningless.
    const l = workspaceSupervisorReadout(true, true, "W", false)?.label ?? "";
    const t = workspaceSupervisorReadout(true, true, "W", false)?.title ?? "";
    expect(l).not.toMatch(/held back/i);
    expect(t).not.toMatch(/held back/i);
  });
});
