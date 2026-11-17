// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  ipcCalls,
  mountWorkspace,
  pane,
  settle,
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

// M17 WP4 (AC-1.2) — a remote host whose hook could not be registered shows the link's sticky
// plain-words reason in the workspace toast once the pane's spawn resolves. Driven on a LIVE
// Workspace mount, with the answer at the IPC edge.

const REMOTE = "ssh://me@mini-host/Users/me/proj";
const WARNING =
  "couldn't register the Claudesk hook on me@mini-host: ~/.claude/settings.json is not valid JSON (x), so it was left untouched. Its status will stay grey.";

const toastOf = (el: Element) =>
  el.querySelector<HTMLElement>('[data-testid="workspace-inject-toast"]');

async function spawnResolves(sessionId = "cc-9") {
  await act(async () => pane.props?.onSessionId?.(sessionId));
  await settle();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await unmountWorkspace();
});

describe("the remote hook warning toast", () => {
  it("a remote workspace shows the link's warning once its spawn resolves", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_hook_warning: WARNING },
    });
    expect(toastOf(el)).toBeNull(); // positive control: nothing before the spawn resolves
    await spawnResolves();
    const asked = ipcCalls.filter((c) => c.cmd === "remote_hook_warning");
    expect(asked.map((c) => c.args)).toEqual([{ projectPath: REMOTE }]);
    expect(toastOf(el)?.textContent).toContain(WARNING);
    expect(toastOf(el)?.getAttribute("role")).toBe("alert");
    expect(uncaught).toEqual([]);
  });

  it("no warning (the install worked) shows nothing", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_hook_warning: null },
    });
    await spawnResolves();
    expect(ipcCalls.some((c) => c.cmd === "remote_hook_warning")).toBe(true);
    expect(toastOf(el)).toBeNull();
  });

  it("a local workspace never asks", async () => {
    const el = await mountWorkspace({
      gate: false,
      ipcAnswers: { remote_hook_warning: WARNING },
    });
    await spawnResolves();
    expect(ipcCalls.some((c) => c.cmd === "remote_hook_warning")).toBe(false);
    expect(toastOf(el)).toBeNull();
  });

  it("a failed read is not a toast", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcRejects: { remote_hook_warning: "boom" },
    });
    await spawnResolves();
    expect(toastOf(el)).toBeNull();
    expect(uncaught).toEqual([]);
  });
});

// M17 WP5 (AC-2.3) — an open whose check found something the picker's label did not predict
// (the label is read from the local record and may be stale) says so in the same toast.
describe("the remote open notice", () => {
  const NOTICE =
    "The Claude Code session on mini-host had ended since Claudesk last saw it, so it was started again.";

  it("a remote workspace shows the open check's notice once its spawn resolves", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_open_notice: NOTICE, remote_hook_warning: null },
    });
    expect(toastOf(el)).toBeNull();
    await spawnResolves();
    const asked = ipcCalls.filter((c) => c.cmd === "remote_open_notice");
    expect(asked.map((c) => c.args)).toEqual([{ projectPath: REMOTE }]);
    expect(toastOf(el)?.textContent).toContain(NOTICE);
    expect(uncaught).toEqual([]);
  });

  it("the notice and a hook warning are both shown, the notice first", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_open_notice: NOTICE, remote_hook_warning: WARNING },
    });
    await spawnResolves();
    const text = toastOf(el)?.textContent ?? "";
    expect(text).toContain(NOTICE);
    expect(text).toContain(WARNING);
    expect(text.indexOf(NOTICE)).toBeLessThan(text.indexOf(WARNING));
  });

  it("a local workspace never asks, and a failed read is not a toast", async () => {
    const local = await mountWorkspace({
      gate: false,
      ipcAnswers: { remote_open_notice: NOTICE },
    });
    await spawnResolves();
    expect(ipcCalls.some((c) => c.cmd === "remote_open_notice")).toBe(false);
    expect(toastOf(local)).toBeNull();
    await unmountWorkspace();
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcRejects: { remote_open_notice: "boom" },
      ipcAnswers: { remote_hook_warning: null },
    });
    await spawnResolves();
    expect(toastOf(el)).toBeNull();
    expect(uncaught).toEqual([]);
  });

  // M17 WP5 (operator ruling, P2.verify-human.3) — the fire's withheld notice reaches the SAME toast.
  it("the pane's withheld-restore notice shows in the workspace toast", async () => {
    const el = await mountWorkspace({ gate: false, projectPath: REMOTE });
    expect(toastOf(el)).toBeNull();
    const notice =
      "Claude Code hasn't trusted this folder on mini-host yet, so /session-restore was not typed. Trust the folder, then type /session-restore.";
    await act(async () => pane.props?.onAutoResumeWithheld?.(notice));
    await settle();
    expect(toastOf(el)?.textContent).toContain(notice);
    expect(uncaught).toEqual([]);
  });

  // M17 WP5 (Phase 3) — a failed Detach keeps the tile; the app's notice reaches its toast.
  it("an app notice (a failed Detach) shows in the workspace toast", async () => {
    const text =
      "Could not detach: session registry lock poisoned. The workspace is still open.";
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      notice: { text, seq: 1 },
    });
    expect(toastOf(el)?.textContent).toContain(text);
    expect(uncaught).toEqual([]);
  });
});
