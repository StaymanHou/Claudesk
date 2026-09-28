// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { WORKSPACE_STATUS_EVENT } from "../../../state/workspaceStatus";
import {
  click,
  ipcCalls,
  mountWorkspace,
  settle,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";
import { resetActivityFeed } from "../../../state/supervisor/activityFeed";

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

// The supervisor activity record on its CONSUMING SURFACE: the real `Workspace`, whose
// `useSupervisor` host appends through the real recorder to the `supervisor_activity_append` IPC
// command. The funnel's per-exit behavior is pinned in `activityFunnel.test.tsx`; what this file
// adds is the wiring that `tsc` cannot see: the command NAME and its `line` argument are strings,
// so a rename on either side compiles and silently records nothing.

const appends = () =>
  ipcCalls.filter((c) => c.cmd === "supervisor_activity_append");

async function turnEnd() {
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, {
      workspace_id: "ws-1",
      state: "idle",
      is_turn_end: true,
      session_id: "cc-session-live",
    });
  });
  await settle();
}

afterEach(async () => {
  await unmountWorkspace();
  resetActivityFeed();
});

const OWN = "/tmp/scratch/scratch-a";

/** A durable-file line, as `supervisor_activity_read` returns it. */
const line = (over: Record<string, unknown>) =>
  JSON.stringify({
    v: 1,
    ts: Date.now() - 120_000,
    appVersion: "0.7.0",
    workspaceId: "ws-9",
    projectPath: OWN,
    sessionId: null,
    outcome: "withheld",
    reason: "policy-not-auto",
    transcriptPath: null,
    edgeId: "F3",
    mode: "autopilot",
    detail: "policy cell PAUSE",
    command: null,
    tokens: null,
    ...over,
  });

const q = (el: ParentNode, id: string) =>
  el.querySelector(`[data-testid="${id}"]`);

describe("the activity record on a live Workspace", () => {
  it("a turn end appends ONE record line naming this workspace, its session and the decision", async () => {
    // No stored drive mode, so the decision is the formerly-silent `no-stored-mode` exit.
    await mountWorkspace({ gate: true, storedDriveMode: null });
    await turnEnd();

    expect(appends()).toHaveLength(1);
    const line = appends()[0].args.line;
    expect(typeof line).toBe("string");
    expect(JSON.parse(line as string)).toMatchObject({
      v: 1,
      workspaceId: "ws-1",
      projectPath: "/tmp/scratch/scratch-a",
      sessionId: "cc-session-live",
      outcome: "withheld",
      reason: "no-stored-mode",
    });
    expect(uncaught).toEqual([]);
  });

  it("⚠️ with the gate OFF a turn end appends nothing (byte-identical)", async () => {
    await mountWorkspace({ gate: false, storedDriveMode: null });
    await turnEnd();
    expect(appends()).toEqual([]);
  });
});

describe("the activity popover and hint on a live Workspace", () => {
  it("the trigger opens a popover listing THIS project's records, newest first", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: {
        supervisor_activity_read: [
          line({
            outcome: "fired",
            reason: null,
            command: "/feature-plan",
            edgeId: "F5",
          }),
          // Another project's record, from an earlier run that also used id ws-1: excluded.
          line({
            projectPath: "/elsewhere",
            workspaceId: "ws-1",
            reason: "no-verdict",
          }),
          line({
            reason: "unsent-input-present",
            edgeId: "F8",
            ts: Date.now() - 5_000,
          }),
        ],
      },
    });
    expect(q(el, "supervisor-activity-popover")).toBeNull();

    await click(q(el, "workspace-header-supervisor-activity"));
    const rows = [
      ...el.querySelectorAll('[data-testid="supervisor-activity-row"]'),
    ].map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("withheld: unsent-input-present");
    expect(rows[0]).toContain("F8");
    expect(rows[1]).toContain("fired /feature-plan");
    expect(rows.join()).not.toContain("no-verdict");
    expect(uncaught).toEqual([]);
  });

  it("⚠️ clicking the trigger does NOT toggle the supervisor; the badge stays the toggle", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    const badge = q(el, "workspace-header-supervisor");
    expect(badge?.getAttribute("aria-pressed")).toBe("true");
    await click(q(el, "workspace-header-supervisor-activity"));
    expect(badge?.getAttribute("aria-pressed")).toBe("true");
    // The toggle's WRITE, not its mount-time read.
    expect(
      ipcCalls.filter((c) => c.cmd === "project_set_supervisor_enabled"),
    ).toEqual([]);
  });

  it("positive control: clicking the BADGE does write the toggle", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await click(q(el, "workspace-header-supervisor"));
    expect(
      ipcCalls.filter((c) => c.cmd === "project_set_supervisor_enabled"),
    ).toHaveLength(1);
  });

  it("Esc closes the popover", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await click(q(el, "workspace-header-supervisor-activity"));
    expect(q(el, "supervisor-activity-popover")).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await settle();
    expect(q(el, "supervisor-activity-popover")).toBeNull();
  });

  it("a pointerdown outside the popover closes it; one inside does not", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await click(q(el, "workspace-header-supervisor-activity"));
    const pop = q(el, "supervisor-activity-popover");
    expect(pop).not.toBeNull();
    await act(async () => {
      pop!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await settle();
    expect(q(el, "supervisor-activity-popover")).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    await settle();
    expect(q(el, "supervisor-activity-popover")).toBeNull();
  });

  it("the badge's title carries the newest decision, seeded from the file on mount", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: {
        supervisor_activity_read: [line({ reason: "unsent-input-present" })],
      },
    });
    expect(q(el, "workspace-header-supervisor")?.getAttribute("title")).toMatch(
      /Last: withheld: unsent-input-present · 2m ago/,
    );
  });

  it("the hint updates live when a turn end is recorded", async () => {
    const el = await mountWorkspace({ gate: true, storedDriveMode: null });
    await turnEnd();
    expect(q(el, "workspace-header-supervisor")?.getAttribute("title")).toMatch(
      /Last: withheld: no-stored-mode · just now/,
    );
  });

  it("⚠️ with the gate OFF there is no trigger and the file is never read", async () => {
    const el = await mountWorkspace({
      gate: false,
      storedDriveMode: "autopilot",
    });
    expect(q(el, "workspace-header-supervisor-activity")).toBeNull();
    expect(
      ipcCalls.filter((c) => c.cmd === "supervisor_activity_read"),
    ).toEqual([]);
  });
});
