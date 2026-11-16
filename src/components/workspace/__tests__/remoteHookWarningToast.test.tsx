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
