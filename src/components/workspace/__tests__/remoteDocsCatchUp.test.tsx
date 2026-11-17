// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import {
  catchUpNotice,
  CATCH_UP_TOAST_MS,
  CHECKING_TEXT,
  useRemoteDocsPolling,
  type CatchUp,
  type DocsNotice,
} from "../docs/remoteDocsCatchUp";

// M17 WP7 P3.verify-human.2 — a remote workspace is polled only while its Docs panel is on screen,
// and a RETURN announces its catch-up in the workspace toast ("checking…", then the result); the
// opening activation (the baseline) announces nothing.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REMOTE = "ssh://me@mini-host/Users/me/proj";
const LOCAL = "/Users/me/proj";

describe("catchUpNotice", () => {
  it("words each outcome, success clearing itself and failure staying", () => {
    expect(catchUpNotice({ kind: "unchanged" })).toEqual({
      text: "Remote docs checked: no changes.",
      kind: "info",
      autoDismissMs: CATCH_UP_TOAST_MS,
    });
    expect(catchUpNotice({ kind: "changed", paths: ["a"] })?.text).toBe(
      "Remote docs checked: 1 doc changed.",
    );
    expect(catchUpNotice({ kind: "changed", paths: ["a", "b"] })?.text).toBe(
      "Remote docs checked: 2 docs changed.",
    );
    expect(catchUpNotice({ kind: "baseline" })?.text).toBe(
      "Remote docs checked.",
    );
    const down = catchUpNotice({ kind: "link_down" });
    expect(down).toEqual({
      text: "Couldn't check the remote docs: the remote host isn't reachable right now.",
      kind: "error",
    });
    const failed = catchUpNotice({
      kind: "failed",
      reason: "the listing was incomplete",
    });
    expect(failed?.kind).toBe("error");
    expect(failed?.autoDismissMs).toBeUndefined();
    expect(catchUpNotice({ kind: "gate_off" })).toBeNull();
  });
});

function Host(props: {
  projectPath: string;
  onScreen: boolean;
  onNotice: (n: DocsNotice) => void;
}) {
  useRemoteDocsPolling({ workspaceId: "ws-1", ...props });
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  clearMocks();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

function harness(answer: () => CatchUp | Error) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  const notices: DocsNotice[] = [];
  mockWindows("main");
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    if (cmd === "remote_poll_catch_up") {
      const a = answer();
      if (a instanceof Error) throw a;
      return a;
    }
    return null;
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const render = (projectPath: string, onScreen: boolean) =>
    act(async () =>
      root!.render(
        <Host
          projectPath={projectPath}
          onScreen={onScreen}
          onNotice={(n) => notices.push(n)}
        />,
      ),
    );
  const cmds = () => calls.map((c) => c.cmd);
  return { calls, notices, render, cmds };
}

describe("useRemoteDocsPolling", () => {
  it("catches up silently on the first show, pauses when hidden, announces the return", async () => {
    let next: CatchUp = { kind: "baseline" };
    const h = harness(() => next);

    await h.render(REMOTE, true);
    await settle();
    expect(h.cmds()).toEqual(["remote_poll_catch_up"]);
    expect(h.calls[0].args).toEqual({
      workspaceId: "ws-1",
      projectPath: REMOTE,
    });
    expect(h.notices).toEqual([]); // the opening baseline is not announced

    await h.render(REMOTE, false);
    await settle();
    expect(h.cmds()).toEqual(["remote_poll_catch_up", "remote_poll_pause"]);
    expect(h.calls[1].args).toEqual({ workspaceId: "ws-1" });

    next = { kind: "changed", paths: ["workflow-system/product/vision.md"] };
    await h.render(REMOTE, true);
    await settle();
    expect(h.cmds()).toEqual([
      "remote_poll_catch_up",
      "remote_poll_pause",
      "remote_poll_catch_up",
    ]);
    expect(h.notices).toEqual([
      { text: CHECKING_TEXT, kind: "info" },
      {
        text: "Remote docs checked: 1 doc changed.",
        kind: "info",
        autoDismissMs: CATCH_UP_TOAST_MS,
      },
    ]);
  });

  it("announces a failed return, and an error at open still counts as the first answer", async () => {
    let next: CatchUp | Error = new Error("the check took too long");
    const h = harness(() => next);
    await h.render(REMOTE, true); // the link is still connecting at open
    await settle();
    expect(h.notices).toEqual([]);

    await h.render(REMOTE, false);
    next = { kind: "link_down" };
    await h.render(REMOTE, true);
    await settle();
    expect(h.notices).toEqual([
      { text: CHECKING_TEXT, kind: "info" },
      {
        text: "Couldn't check the remote docs: the remote host isn't reachable right now.",
        kind: "error",
      },
    ]);

    // A command-level failure on a return reads in the same words family.
    await h.render(REMOTE, false);
    next = new Error("the check took too long");
    await h.render(REMOTE, true);
    await settle();
    expect(h.notices.at(-1)?.kind).toBe("error");
    expect(h.notices.at(-1)?.text).toContain("Couldn't check the remote docs:");
  });

  it("does nothing for a local workspace", async () => {
    const h = harness(() => ({ kind: "unchanged" }));
    await h.render(LOCAL, true);
    await h.render(LOCAL, false);
    await h.render(LOCAL, true);
    await settle();
    expect(h.cmds()).toEqual([]);
    expect(h.notices).toEqual([]);
  });
});
