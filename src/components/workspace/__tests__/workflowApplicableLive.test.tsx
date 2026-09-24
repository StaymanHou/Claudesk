// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ipcCalls,
  mountWorkspace,
  rightPanel,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";

vi.mock(
  "../XtermPane",
  async () => (await import("./liveWorkspace")).xtermPaneModule,
);
vi.mock(
  "../RightPanelHost",
  async () => (await import("./liveWorkspace")).rightPanelModule,
);
vi.mock(
  "../../../state/useWorkflowFeaturesEnabled",
  async () => (await import("./liveWorkspace")).gateModule,
);

// F-b ruling 4 on a LIVE mount: with the gate ON, a workspace on a non-default profile has NO
// workflow layer. Each surface is asserted by IDENTITY (its own testid), not by a count, and every
// "absent" assertion is paired with the SAME query on a default-profile mount (the positive
// control) — an absent element proves nothing if it would be absent anyway.

const SURFACES = [
  "workspace-skill-row",
  "workspace-header-drivemode",
  "workspace-header-supervisor",
] as const;

afterEach(async () => {
  await unmountWorkspace();
});

describe("workflow applicability — per workspace (F-b ruling 4)", () => {
  it("DEFAULT profile, gate ON: every workflow surface is present (positive control)", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      profile: null,
    });
    for (const id of SURFACES) {
      expect(el.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
    }
    expect(uncaught).toEqual([]);
  });

  it("NON-DEFAULT profile, gate ON: every workflow surface is absent", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      profile: "neo",
    });
    for (const id of SURFACES) {
      expect(el.querySelector(`[data-testid="${id}"]`), id).toBeNull();
    }
    // The workflow reads never even happen: the drive-mode/supervisor effect is gated too.
    expect(ipcCalls.map((c) => c.cmd)).not.toContain(
      "project_get_default_drive_mode",
    );
    expect(uncaught).toEqual([]);
  });

  it("the right panel receives THIS workspace's profile (its docs-panel gate reads it)", async () => {
    await mountWorkspace({ gate: true, profile: "neo" });
    expect(rightPanel.props?.workspaceProfile).toBe("neo");
    await unmountWorkspace();
    await mountWorkspace({ gate: true, profile: null });
    expect(rightPanel.props?.workspaceProfile).toBeNull();
  });

  it("the live session's profile is read for the CURRENT session id", async () => {
    await mountWorkspace({ gate: true, profile: "neo" });
    const reads = ipcCalls.filter((c) => c.cmd === "cc_session_profile");
    expect(reads.map((c) => c.args.sessionId)).toEqual(["cc-1"]);
  });
});
