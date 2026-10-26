// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { WORKSPACE_STATUS_EVENT } from "../../../state/workspaceStatus";
import {
  ipcCalls,
  mountWorkspace,
  settle,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";
import { resetActivityFeed } from "../../../state/supervisor/activityFeed";
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

// M16.5 WP4 Phase 3 — the verify-human blue on its CONSUMING SURFACE: the real `Workspace`, whose
// `useSupervisor` host reads the transcript and asks the backend to promote. The rule and the
// handler are pinned in `verifyHumanPause.test.tsx` on a hand-built host. What this file adds is
// the wiring `tsc` cannot see: the host `Workspace` builds (gate, PTY session ref, project path)
// and the command names, which are strings on both sides.

const tail = (skill: string) => ({
  path: "/t/a.jsonl",
  lines: [
    {
      type: "user",
      message: {
        role: "user",
        content: `<command-message>${skill}</command-message>\n<command-name>/${skill}</command-name>`,
      },
    },
    {
      type: "assistant",
      message: {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "## Manual Verification" }],
      },
    },
  ].map((l) => JSON.stringify(l)),
});

const STOP_AT = 1_792_603_012_366;

async function turnEnd() {
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, {
      workspace_id: "ws-1",
      state: "idle",
      is_turn_end: true,
      session_id: "cc-session-live",
      last_event_at: STOP_AT,
    });
  });
  await settle();
}

const calls = (cmd: string) => ipcCalls.filter((c) => c.cmd === cmd);

afterEach(async () => {
  await unmountWorkspace();
  resetActivityFeed();
  resetTurnEnds();
});

describe("the verify-human blue on a live Workspace", () => {
  it("a verify-human stop asks the backend to promote THIS workspace at THIS Stop", async () => {
    // No stored drive mode: the decision exits before reading, so the overlay's own read runs.
    await mountWorkspace({
      gate: true,
      storedDriveMode: null,
      ipcAnswers: {
        transcript_tail: tail("feature-verify-human"),
        workspace_status_promote: true,
      },
    });
    await turnEnd();

    expect(calls("workspace_status_promote").map((c) => c.args)).toEqual([
      { workspaceId: "ws-1", stopEventAt: STOP_AT },
    ]);
    // Positive control that the turn end was decided at all.
    expect(calls("supervisor_activity_append")).toHaveLength(1);
    expect(uncaught).toEqual([]);
  });

  it("⚠️ a supervised turn reuses the decision's read: ONE transcript read, one promote", async () => {
    await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      ipcAnswers: {
        transcript_tail: tail("feature-verify-human"),
        workspace_status_promote: true,
        wip_read: { path: null, text: "" },
      },
    });
    await turnEnd();

    expect(calls("transcript_tail")).toHaveLength(1);
    expect(calls("workspace_status_promote")).toHaveLength(1);
  });

  it("a stop after another skill does not promote", async () => {
    await mountWorkspace({
      gate: true,
      storedDriveMode: null,
      ipcAnswers: {
        transcript_tail: tail("feature-build"),
        workspace_status_promote: true,
      },
    });
    await turnEnd();

    expect(calls("transcript_tail")).toHaveLength(1);
    expect(calls("workspace_status_promote")).toEqual([]);
  });

  it("⚠️ with the gate OFF nothing is read and nothing is promoted (byte-identical)", async () => {
    await mountWorkspace({
      gate: false,
      storedDriveMode: null,
      ipcAnswers: {
        transcript_tail: tail("feature-verify-human"),
        workspace_status_promote: true,
      },
    });
    await turnEnd();

    expect(calls("transcript_tail")).toEqual([]);
    expect(calls("workspace_status_promote")).toEqual([]);
  });
});
