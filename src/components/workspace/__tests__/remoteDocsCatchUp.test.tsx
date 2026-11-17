// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function harness(answer: () => CatchUp | Error | Promise<CatchUp>) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  const notices: DocsNotice[] = [];
  mockWindows("main");
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    if (cmd === "remote_poll_catch_up") {
      const a = answer();
      if (a instanceof Error) throw a;
      return a; // a Promise is awaited by mockIPC: the test settles it when it chooses
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

// The WP7 review MINOR: AC-4's "same words everywhere" was tied to Rust's `remote_fs::LINK_DOWN`
// only by a comment. Read the Rust constant and hold the frontend's sentence to it (its first
// letter lowercased, since it follows "Couldn't check the remote docs: ").
describe("the link-down words match the backend's", () => {
  it("catchUpNotice(link_down) quotes remote_fs::LINK_DOWN", () => {
    const rust = readFileSync(
      resolve(__dirname, "../../../../src-tauri/src/remote_fs/mod.rs"),
      "utf8",
    );
    const m = rust.match(/^pub const LINK_DOWN: &str = "([^"]+)";$/m);
    expect(m, "remote_fs::LINK_DOWN not found").not.toBeNull();
    const words = m![1];
    expect(catchUpNotice({ kind: "link_down" })?.text).toBe(
      `Couldn't check the remote docs: ${words[0].toLowerCase()}${words.slice(1)}`,
    );
  });
});

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

  // The WP7 review MAJOR: a catch-up whose panel left the screen before it answered is stale.
  describe("a return that leaves again before its answer", () => {
    function deferred() {
      let resolve!: (r: CatchUp) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<CatchUp>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    async function returnedThenLeft() {
      let next: CatchUp | Promise<CatchUp> = { kind: "baseline" };
      const h = harness(() => next);
      await h.render(REMOTE, true); // the opening baseline (answered)
      await settle();
      await h.render(REMOTE, false);
      const pending = deferred();
      next = pending.promise;
      await h.render(REMOTE, true); // the return: "checking…"
      await settle();
      expect(h.notices).toEqual([{ text: CHECKING_TEXT, kind: "info" }]);
      await h.render(REMOTE, false); // …left before the answer
      await settle();
      return { h, pending };
    }

    it("clears its own checking toast and announces no late success", async () => {
      const { h, pending } = await returnedThenLeft();
      expect(h.cmds().at(-1)).toBe("remote_poll_pause");
      expect(h.notices).toEqual([{ text: CHECKING_TEXT, kind: "info" }, null]);
      await act(async () => pending.resolve({ kind: "changed", paths: ["a"] }));
      await settle();
      expect(h.notices).toEqual([{ text: CHECKING_TEXT, kind: "info" }, null]);
    });

    it("announces and logs nothing for the dropped waiter's error", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const { h, pending } = await returnedThenLeft();
      await act(async () =>
        pending.reject("the workspace is no longer watched"),
      );
      await settle();
      expect(h.notices).toEqual([{ text: CHECKING_TEXT, kind: "info" }, null]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
    });

    it("an answer that already landed is not cleared by leaving (a failure stays)", async () => {
      let next: CatchUp = { kind: "baseline" };
      const h = harness(() => next);
      await h.render(REMOTE, true);
      await settle();
      await h.render(REMOTE, false);
      next = { kind: "link_down" };
      await h.render(REMOTE, true);
      await settle();
      await h.render(REMOTE, false);
      await settle();
      expect(h.notices.at(-1)?.kind).toBe("error"); // no trailing null
    });
  });
});
