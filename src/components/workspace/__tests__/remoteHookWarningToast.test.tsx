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
/** Every notice row, as `[text, data-kind, role]`. */
const rowsOf = (el: Element) =>
  [
    ...el.querySelectorAll<HTMLElement>(
      '[data-testid="workspace-inject-toast"]',
    ),
  ].map((r) => [
    r.querySelector("span")?.textContent ?? "",
    r.getAttribute("data-kind"),
    r.getAttribute("role"),
  ]);

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
    expect(rowsOf(el)).toEqual([[WARNING, "error", "alert"]]);
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
    // paydown-2026-11-27 WP8 — nothing failed: neutral info, a status, not a red alert.
    expect(rowsOf(el)).toEqual([[NOTICE, "info", "status"]]);
    expect(uncaught).toEqual([]);
  });

  // paydown-2026-11-27 WP8 — TWO rows, each with its own kind: the hook failure is never shown
  // neutral because it shares a toast with an informational notice.
  it("the notice and a hook warning are two rows, the notice (info) first, the warning (error) second", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_open_notice: NOTICE, remote_hook_warning: WARNING },
    });
    await spawnResolves();
    expect(rowsOf(el)).toEqual([
      [NOTICE, "info", "status"],
      [WARNING, "error", "alert"],
    ]);
  });

  // The QF's WP5 update: five writers, last wins. A later withheld notice now ADDS a row.
  it("a later withheld notice adds a row and erases neither", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_open_notice: NOTICE, remote_hook_warning: WARNING },
    });
    await spawnResolves();
    const withheld =
      "Claude Code hasn't trusted this folder on mini-host yet, so /session-restore was not typed. Trust the folder, then type /session-restore.";
    await act(async () => pane.props?.onAutoResumeWithheld?.(withheld));
    await settle();
    expect(rowsOf(el)).toEqual([
      [NOTICE, "info", "status"],
      [WARNING, "error", "alert"],
      [withheld, "info", "status"],
    ]);
  });

  // The QF: the sticky warning is re-read after every respawn (Recycle, drive-mode apply-now).
  it("a respawn's re-read neither duplicates the warning nor brings back a dismissed one", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: { remote_open_notice: null, remote_hook_warning: WARNING },
    });
    await spawnResolves("cc-1");
    await spawnResolves("cc-2"); // a respawn, warning still showing
    expect(rowsOf(el)).toEqual([[WARNING, "error", "alert"]]);
    const dismiss = toastOf(el)?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss"]',
    );
    await act(async () => dismiss?.click());
    expect(rowsOf(el)).toEqual([]);
    await spawnResolves("cc-3"); // the next respawn re-reads the same sticky warning
    expect(
      ipcCalls.filter((c) => c.cmd === "remote_hook_warning"),
    ).toHaveLength(3); // positive control: it WAS re-read
    expect(rowsOf(el)).toEqual([]);
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
    // paydown-2026-11-27 WP8 (the BL's M18 WP2 addendum) — nothing failed: info.
    expect(rowsOf(el)).toEqual([[notice, "info", "status"]]);
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
    expect(rowsOf(el)).toEqual([[text, "error", "alert"]]);
    expect(uncaught).toEqual([]);
  });
});
