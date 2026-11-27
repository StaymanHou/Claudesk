// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createdTerminals as created, installPaneShims } from "./xtermFakes";
import { bootIpc, ipcCalls, teardownIpc } from "./liveWorkspace";
import {
  COPY_TOO_LARGE_NOTICE,
  MAX_CLIPBOARD_BYTES,
  copyFailedNotice,
} from "../osc52";

// M18 WP2.5 — the REAL XtermPane wires OSC 52 to the Mac clipboard, write-only, on every pane.
// The fake Terminal records its constructor options, the OSC handlers registered on its parser,
// and every write back to the terminal, so a read reply would be seen.

vi.mock("@xterm/xterm", async () =>
  (await import("./xtermFakes")).xtermModule(),
);
vi.mock("@xterm/addon-fit", async () =>
  (await import("./xtermFakes")).fitAddonModule(),
);
vi.mock("@xterm/addon-serialize", async () =>
  (await import("./xtermFakes")).serializeAddonModule(),
);
installPaneShims();

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await teardownIpc(root, host);
  root = null;
  host = null;
  created.length = 0;
});

async function mount(
  projectPath: string,
  spawnCommand: "cc_spawn" | "term_spawn",
  opts: {
    onCopyFailed?: (notice: string) => void;
    /** Reject `clipboard_write` with this. */
    clipboardRejects?: string;
    /** Mount the real `TerminalPane` (the second terminal) instead of a bare `XtermPane`. */
    viaTerminalPane?: boolean;
  } = {},
) {
  bootIpc((cmd) => {
    if (cmd === "cc_spawn" || cmd === "cc_spawn_remote" || cmd === "term_spawn")
      return "sid-1";
    if (cmd === "clipboard_write" && opts.clipboardRejects !== undefined)
      throw opts.clipboardRejects;
    return null;
  });
  const { XtermPane } = await import("../XtermPane");
  const { TerminalPane } = await import("../TerminalPane");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      opts.viaTerminalPane ? (
        <TerminalPane
          sessionId="ws-1-term-1"
          projectPath={projectPath}
          active
          onCopyFailed={opts.onCopyFailed}
        />
      ) : (
        <XtermPane
          workspaceId="ws-1"
          projectPath={projectPath}
          pendingAction={null}
          spawnCommand={spawnCommand}
          onCopyFailed={opts.onCopyFailed}
        />
      ),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(created).toHaveLength(1);
  return created[0];
}

function clipboardWrites(): unknown[] {
  return ipcCalls
    .filter((c) => c.cmd === "clipboard_write")
    .map((c) => c.args.text);
}

const REMOTE = "ssh://user@host/Users/user/scratch";

describe("the real pane sends OSC 52 copies to the Mac clipboard (M18 WP2.5)", () => {
  it("a remote CC pane: tmux's drag copy reaches `clipboard_write`, and a read is never answered", async () => {
    const term = await mount(REMOTE, "cc_spawn");
    const osc = term.osc.get(52);
    expect(osc, "OSC 52 handler registered").toBeDefined();
    const writesBefore = term.writes.length;
    await act(async () => {
      expect(osc?.(";UFJPQkUtVEVYVC0xMjM=")).toBe(true);
      expect(osc?.("c;?")).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(clipboardWrites()).toEqual(["PROBE-TEXT-123"]);
    // The read query produced no reply: nothing written to the terminal or the PTY.
    expect(term.writes.length).toBe(writesBefore);
    expect(
      ipcCalls.filter((c) => c.cmd === "cc_input" || c.cmd === "term_input"),
    ).toEqual([]);
  });

  it("every pane registers it and allows Option+drag selection: a local CC pane and the second terminal", async () => {
    for (const [path, kind] of [
      ["/Users/user/project", "cc_spawn"],
      ["/Users/user/project", "term_spawn"],
    ] as const) {
      const term = await mount(path, kind);
      expect(term.osc.has(52), `${kind}`).toBe(true);
      expect(term.options.macOptionClickForcesSelection, `${kind}`).toBe(true);
      await teardownIpc(root, host);
      root = null;
      host = null;
      created.length = 0;
    }
  });
});

// paydown-2026-11-27 WP8 — a copy that did NOT reach the clipboard is told to the workspace (it
// used to be silent, and the operator pasted the previous clipboard as if it were this copy).
describe("a refused or failed copy is told through onCopyFailed", () => {
  const atCap = "a".repeat(MAX_CLIPBOARD_BYTES);

  it("too large: told, and nothing crosses the IPC", async () => {
    const fail = vi.fn();
    const term = await mount(REMOTE, "cc_spawn", { onCopyFailed: fail });
    await act(async () => {
      term.osc.get(52)?.(`c;${btoa(atCap + "a")}`);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(clipboardWrites()).toEqual([]);
    expect(fail.mock.calls).toEqual([[COPY_TOO_LARGE_NOTICE]]);
  });

  it("the clipboard write rejects: told with the backend's reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fail = vi.fn();
    const term = await mount(REMOTE, "cc_spawn", {
      onCopyFailed: fail,
      clipboardRejects: "pbcopy exited 1",
    });
    await act(async () => {
      term.osc.get(52)?.(";UFJPQkUtVEVYVC0xMjM=");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(clipboardWrites()).toEqual(["PROBE-TEXT-123"]); // it was attempted
    expect(fail.mock.calls).toEqual([[copyFailedNotice("pbcopy exited 1")]]);
  });

  it("a copy that works tells nobody", async () => {
    const fail = vi.fn();
    const term = await mount(REMOTE, "cc_spawn", { onCopyFailed: fail });
    await act(async () => {
      term.osc.get(52)?.(";UFJPQkUtVEVYVC0xMjM=");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(clipboardWrites()).toEqual(["PROBE-TEXT-123"]);
    expect(fail).not.toHaveBeenCalled();
  });

  it("the second terminal (the real TerminalPane) forwards it too", async () => {
    const fail = vi.fn();
    const term = await mount("/Users/user/project", "term_spawn", {
      onCopyFailed: fail,
      viaTerminalPane: true,
    });
    await act(async () => {
      term.osc.get(52)?.(`c;${btoa(atCap + "a")}`);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fail.mock.calls).toEqual([[COPY_TOO_LARGE_NOTICE]]);
  });
});
