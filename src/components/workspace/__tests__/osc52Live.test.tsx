// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createdTerminals as created, installPaneShims } from "./xtermFakes";
import { bootIpc, ipcCalls, teardownIpc } from "./liveWorkspace";

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
) {
  bootIpc((cmd) => {
    if (cmd === "cc_spawn" || cmd === "cc_spawn_remote" || cmd === "term_spawn")
      return "sid-1";
    return null;
  });
  const { XtermPane } = await import("../XtermPane");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <XtermPane
        workspaceId="ws-1"
        projectPath={projectPath}
        pendingAction={null}
        spawnCommand={spawnCommand}
      />,
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
