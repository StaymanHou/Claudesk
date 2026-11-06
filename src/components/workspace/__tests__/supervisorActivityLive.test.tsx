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
import {
  publishActivity,
  resetActivityFeed,
} from "../../../state/supervisor/activityFeed";
import { buildRecord } from "../../../state/supervisor/activityRecord";
import { resetTurnEnds } from "../../../state/supervisor/turnEndDedupe";

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
  // Module-level claim store: without this, a claim from one test could dedupe the next.
  resetTurnEnds();
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

  // Paydown 2026-11-04 WP8. WebKit does not focus a button on click, so after `▾` the focus is
  // still in the terminal. The popover must take it, or the Esc that closes the list also
  // reaches CC through xterm's textarea and can interrupt a running turn.
  it("⚠️ opening takes focus; Esc closes it WITHOUT reaching the page; focus goes back", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    // Stands in for xterm's helper textarea, which holds focus in a real workspace.
    const terminal = document.createElement("textarea");
    document.body.appendChild(terminal);
    terminal.focus();
    const leaked: string[] = [];
    const spy = (e: KeyboardEvent) => leaked.push(e.key);
    document.addEventListener("keydown", spy);
    try {
      // `click()` does not move focus (as in WebKit), so only the popover can take it.
      await click(q(el, "workspace-header-supervisor-activity"));
      const pop = q(el, "supervisor-activity-popover");
      expect(pop).not.toBeNull();
      expect(document.activeElement).toBe(pop);

      await act(async () => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      await settle();
      expect(q(el, "supervisor-activity-popover")).toBeNull();
      expect(leaked, "the closing Esc must not bubble to the page").toEqual([]);
      expect(document.activeElement).toBe(terminal);
    } finally {
      document.removeEventListener("keydown", spy);
      terminal.remove();
    }
  });

  it("an Esc aimed at the terminal no longer closes the popover from afar", async () => {
    // The old `document` listener closed the list on ANY Esc, including one meant for CC.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await click(q(el, "workspace-header-supervisor-activity"));
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settle();
    expect(q(el, "supervisor-activity-popover")).not.toBeNull();
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

// M16.5 WP3 3.2 / 3.6 — the structural-failure ALARM on the real `Workspace` header.
describe("the failure alarm on a live Workspace", () => {
  const ALARM = "workspace-header-supervisor-alarm";
  /** Oldest first, as the durable file holds them. */
  const failing = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      line({
        reason: "transcript-incomplete",
        edgeId: null,
        ts: Date.now() - 60_000 + i * 1_000,
      }),
    );

  it("⚠️ survives a relaunch: the mount seed replays the log and raises it", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: failing(3) },
    });
    const marker = q(el, ALARM);
    expect(marker?.textContent).toContain("!");
    expect(marker?.getAttribute("title")).toContain(
      "SUPERVISOR CANNOT READ TURNS",
    );
    expect(q(el, "workspace-header-supervisor")?.getAttribute("title")).toMatch(
      /^SUPERVISOR CANNOT READ TURNS/,
    );
  });

  it("⚠️ survives a live decision that lands BEFORE the mount seed (paydown WP8)", async () => {
    // The seed reads the file over async IPC. A decision published first is NEWER than every
    // replayed record; the old seed re-published each one and the feed dropped them all as
    // older, so the alarm the log shows silently restarted from zero.
    publishActivity(
      buildRecord({
        ts: Date.now(),
        appVersion: null,
        workspaceId: "ws-1",
        projectPath: OWN,
        sessionId: null,
        outcome: "withheld",
        reason: "no-pty-session", // neutral on both axes
      }),
    );
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: failing(3) },
    });
    expect(q(el, ALARM)?.getAttribute("title")).toContain(
      "SUPERVISOR CANNOT READ TURNS",
    );
  });

  it("a newer clean turn in the log means no alarm", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: {
        supervisor_activity_read: [
          ...failing(3),
          line({ reason: "no-verdict", ts: Date.now() - 1_000 }),
        ],
      },
    });
    expect(q(el, ALARM)).toBeNull();
  });

  it("appears live when the third failure is published, with no relaunch", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    const publish = async (i: number) =>
      act(async () => {
        publishActivity(
          buildRecord({
            ts: Date.now() + i,
            appVersion: null,
            workspaceId: "ws-1",
            projectPath: OWN,
            sessionId: null,
            outcome: "error",
            reason: "adjudicator-failed",
          }),
        );
      });
    await publish(1);
    await publish(2);
    expect(q(el, ALARM)).toBeNull();
    await publish(3);
    expect(q(el, ALARM)?.getAttribute("title")).toContain(
      "SUPERVISOR ADJUDICATOR FAILING",
    );
  });

  it("⚠️ with the gate OFF there is no alarm, even with the log full of failures", async () => {
    const el = await mountWorkspace({
      gate: false,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: failing(5) },
    });
    expect(q(el, ALARM)).toBeNull();
    expect(q(el, "workspace-header-supervisor")).toBeNull();
  });
});

// Paydown 2026-11-04 WP12 — the mount seed reads the file ONCE per project per run, and a FAILED
// read does not count as that once (`SURFACE-2026-11-06-QUALITY-WP8-SEED-ONCE-SWALLOWS-A-FAILED-READ`).
// Each test mounts the same project twice; the feed's module state carries between the mounts the
// way it carries between two workspaces of one app run.
describe("the mount seed: once per project, and a failed read is retried", () => {
  const reads = () =>
    ipcCalls.filter((c) => c.cmd === "supervisor_activity_read");
  // A thenable, so the rejection exists only once the IPC call awaits it.
  const failingRead = {
    then(_ok: unknown, fail: (e: Error) => void) {
      fail(new Error("read failed"));
    },
  };

  it("a failed first read leaves the project unseeded: the next mount reads again and seeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await mountWorkspace({
        gate: true,
        storedDriveMode: "autopilot",
        ipcAnswers: { supervisor_activity_read: failingRead },
      });
      expect(reads()).toHaveLength(1);
      await unmountWorkspace();
    } finally {
      warn.mockRestore();
    }
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: {
        supervisor_activity_read: [line({ reason: "unsent-input-present" })],
      },
    });
    expect(reads()).toHaveLength(1);
    expect(q(el, "workspace-header-supervisor")?.getAttribute("title")).toMatch(
      /Last: withheld: unsent-input-present/,
    );
  });

  it("a project seeded by an earlier mount is not read again", async () => {
    await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: [line({})] },
    });
    expect(reads(), "positive control: the first mount reads").toHaveLength(1);
    await unmountWorkspace();
    await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: [line({})] },
    });
    expect(reads()).toEqual([]);
  });

  it("an EMPTY successful read still seeds: a project with no records is not re-read per mount", async () => {
    await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: [] },
    });
    expect(reads()).toHaveLength(1);
    await unmountWorkspace();
    await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: { supervisor_activity_read: [] },
    });
    expect(reads()).toEqual([]);
  });
});
