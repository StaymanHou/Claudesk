// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { bootIpc, ipcCalls, teardownIpc, uncaught } from "./liveWorkspace";
import { FIRE_DELAY_MS } from "../autoResumeFire";
import type { AutoResumeAction } from "../../../state/predictAction";

// paydown-2026-11-08 WP5 — the auto-resume fire on the REAL `XtermPane` (the consuming surface).
//
// Every other test of the fire drives `fireAutoResume` directly or reads XtermPane's source. This
// one mounts the real pane and runs its real spawn effect against `mockIPC`: `cc_spawn` → the
// listeners → `cc_ready` → the `FIRE_DELAY_MS` timer → `folder_trusted` → `cc_inject` (or not).
// So it sees what a source guard cannot: that the pane passes THIS project and THIS session id to
// the trust read, and that an untrusted answer really reaches no `cc_inject`.
//
// Only what jsdom cannot run is faked: xterm.js and its addons (they measure cells and paint),
// `ResizeObserver`, and `requestAnimationFrame` where jsdom lacks it.

vi.mock("@xterm/xterm", () => {
  class Terminal {
    options: Record<string, unknown> = {};
    rows = 24;
    cols = 80;
    buffer = { active: { length: 0, baseY: 0, viewportY: 0 } };
    loadAddon() {}
    open() {}
    focus() {}
    write() {}
    dispose() {}
    scrollToLine() {}
    registerMarker() {
      return undefined;
    }
    onData() {
      return { dispose() {} };
    }
  }
  return { Terminal };
});
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
    proposeDimensions() {
      return { cols: 80, rows: 24 };
    }
  },
}));
vi.mock("@xterm/addon-serialize", () => ({
  SerializeAddon: class {
    serializeAsHTML() {
      return "";
    }
  },
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  NoopResizeObserver;
globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0) as unknown as number;
globalThis.cancelAnimationFrame ??= (id: number) => clearTimeout(id);

const PROJECT = "/u/never-trusted";
const SESSION = "cc-41";
const RESTORE: AutoResumeAction = {
  kind: "inject",
  command: "/session-restore",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  // Real timers FIRST: the harness's teardown settles on a real `setTimeout`, which would never
  // run under the fake clock.
  vi.useRealTimers();
  await teardownIpc(root, host);
  root = null;
  host = null;
});

/** Mount the real pane, let it spawn, then run past the fire delay. */
async function openAndWaitPastFire(opts: {
  trusted: unknown;
  action: AutoResumeAction;
  projectPath?: string;
  onAutoResumeWithheld?: (notice: string) => void;
}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  bootIpc((cmd) => {
    if (cmd === "cc_spawn" || cmd === "cc_spawn_remote") return SESSION;
    if (cmd === "folder_trusted") return opts.trusted;
    return null;
  });
  const { XtermPane } = await import("../XtermPane");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <XtermPane
        ref={createRef()}
        workspaceId="ws-1"
        projectPath={opts.projectPath ?? PROJECT}
        pendingAction={opts.action}
        openIntent="fire"
        onAutoResumeWithheld={opts.onAutoResumeWithheld}
      />,
    );
  });
  // Spawn resolves on microtasks; the timers include the rAF stand-in and the fire delay.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FIRE_DELAY_MS + 500);
  });
  return ipcCalls.map((c) => c.cmd);
}

describe("the auto-resume fire on the real XtermPane", () => {
  it("positive control: a TRUSTED folder types /session-restore into the spawned session", async () => {
    const cmds = await openAndWaitPastFire({ trusted: true, action: RESTORE });
    expect(cmds).toContain("cc_spawn");
    const input = ipcCalls.find((c) => c.cmd === "cc_inject");
    expect(input, `IPC seen: ${cmds.join(", ")}`).toBeDefined();
    expect(input?.args.sessionId).toBe(SESSION);
    expect(atob(String(input?.args.data))).toBe("/session-restore\r");
    expect(uncaught).toEqual([]);
  });

  it("asks folder_trusted about THIS project under THIS session, and only after the spawn", async () => {
    const cmds = await openAndWaitPastFire({ trusted: true, action: RESTORE });
    const read = ipcCalls.find((c) => c.cmd === "folder_trusted");
    expect(read?.args).toEqual({
      projectPath: PROJECT,
      ptySessionId: SESSION,
    });
    expect(cmds.indexOf("cc_spawn")).toBeLessThan(
      cmds.indexOf("folder_trusted"),
    );
    expect(cmds.indexOf("folder_trusted")).toBeLessThan(
      cmds.indexOf("cc_inject"),
    );
  });

  it("an UNTRUSTED folder reaches no cc_inject at all — the reported defect", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cmds = await openAndWaitPastFire({ trusted: false, action: RESTORE });
    // Non-vacuity: the fire DID run and ask, so the silence below is a decision, not a dead timer.
    expect(cmds).toContain("folder_trusted");
    expect(cmds).not.toContain("cc_inject");
    expect(String(warn.mock.calls.at(-1)?.[0])).toContain(
      "/session-restore withheld",
    );
    warn.mockRestore();
    expect(uncaught).toEqual([]);
  });

  it("a failed or non-boolean trust answer withholds too (D4)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cmds = await openAndWaitPastFire({
      trusted: "true",
      action: RESTORE,
    });
    expect(cmds).toContain("folder_trusted");
    expect(cmds).not.toContain("cc_inject");
    warn.mockRestore();
  });

  // M17 WP5 (operator ruling, P2.verify-human.3) — a REMOTE folder's withheld command reaches the
  // workspace's toast through the pane's prop; a local one's does not (its picker row warned).
  it("an untrusted REMOTE folder hands the workspace a notice naming the host and the command", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onWithheld = vi.fn();
    const cmds = await openAndWaitPastFire({
      trusted: false,
      action: RESTORE,
      projectPath: "ssh://me@mini-host.tail0000.ts.net/Users/me/p",
      onAutoResumeWithheld: onWithheld,
    });
    expect(cmds).toContain("folder_trusted");
    expect(cmds).not.toContain("cc_inject");
    expect(onWithheld).toHaveBeenCalledTimes(1);
    const notice = String(onWithheld.mock.calls[0][0]);
    expect(notice).toContain("on mini-host yet");
    expect(notice).toContain("type /session-restore");
    warn.mockRestore();
    expect(uncaught).toEqual([]);
  });

  // The pane reads the handler through a latest-ref when its timer wakes: a parent that re-renders
  // with a NEW handler before the fire gets the notice in the new one (a direct prop read in the
  // timer's closure would call the stale first one).
  it("a handler swapped by a re-render before the fire is the one told", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    bootIpc((cmd) => {
      if (cmd === "cc_spawn" || cmd === "cc_spawn_remote") return SESSION;
      if (cmd === "folder_trusted") return false;
      return null;
    });
    const { XtermPane } = await import("../XtermPane");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const first = vi.fn();
    const second = vi.fn();
    const pane = (onWithheld: (n: string) => void) => (
      <XtermPane
        ref={createRef()}
        workspaceId="ws-1"
        projectPath="ssh://me@mini-host/Users/me/p"
        pendingAction={RESTORE}
        openIntent="fire"
        onAutoResumeWithheld={onWithheld}
      />
    );
    await act(async () => root?.render(pane(first)));
    // Let the spawn resolve and the fire be scheduled, but not elapse.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => root?.render(pane(second)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRE_DELAY_MS + 500);
    });
    expect(ipcCalls.map((c) => c.cmd)).toContain("folder_trusted");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(uncaught).toEqual([]);
  });

  it("no notice for a LOCAL untrusted folder, nor for a trusted remote one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const local = vi.fn();
    await openAndWaitPastFire({
      trusted: false,
      action: RESTORE,
      onAutoResumeWithheld: local,
    });
    expect(local).not.toHaveBeenCalled();
    vi.useRealTimers();
    await teardownIpc(root, host);
    root = null;
    host = null;
    const trustedRemote = vi.fn();
    const cmds = await openAndWaitPastFire({
      trusted: true,
      action: RESTORE,
      projectPath: "ssh://me@mini-host/Users/me/p",
      onAutoResumeWithheld: trustedRemote,
    });
    expect(cmds).toContain("cc_inject");
    expect(trustedRemote).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("no inject action → no trust read and no input", async () => {
    const cmds = await openAndWaitPastFire({ trusted: true, action: null });
    expect(cmds).toContain("cc_spawn");
    expect(cmds).not.toContain("folder_trusted");
    expect(cmds).not.toContain("cc_inject");
  });
});
