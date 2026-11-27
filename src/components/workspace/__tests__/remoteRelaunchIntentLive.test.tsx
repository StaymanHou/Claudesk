// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installPaneShims } from "./xtermFakes";
import { bootIpc, ipcCalls, teardownIpc } from "./liveWorkspace";
import type { XtermPaneHandle } from "../XtermPane";
import type { OpenIntent } from "../../../state/predictAction";

// M18 WP1 — `SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`, reproduced on the REAL pane.
//
// A workspace's `open_intent` is the picker DOOR, and it lives as long as the workspace. A remote
// workspace opened through the Reconnect door carries `"reconnect"` for its whole life, and
// `cc_spawn_remote` turns `intent == Reconnect` into `attach = true`: `tmux attach -t =<name>`,
// never `new -A` (a session that died while disconnected is never silently restarted).
//
// Recycle respawns through `relaunch()`, AFTER its own `/exit` has ended that tmux session. If the
// relaunch re-sends the door's `"reconnect"`, the respawn attaches to a session that no longer
// exists, the attach ends at once, and no CC is ever started: exactly the WP8 evidence (handoff
// and `/exit` ran, then no `SessionStart`, no tmux server, `.session.md` unconsumed).
//
// The property: Reconnect is the FIRST spawn's door only. A relaunch of the pane is a new session.

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

const REMOTE = "ssh://user@host/Users/user/scratch";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await teardownIpc(root, host);
  root = null;
  host = null;
});

/** The intents the pane's `cc_spawn_remote` calls carried, in order. */
function remoteSpawnIntents(): unknown[] {
  return ipcCalls
    .filter((c) => c.cmd === "cc_spawn_remote")
    .map((c) => c.args.intent);
}

/** Mount the real pane through `door`, let it spawn, then relaunch it (Recycle's step 5). */
async function openThenRelaunch(door: OpenIntent): Promise<unknown[]> {
  let next = 0;
  bootIpc((cmd) => {
    if (cmd === "cc_spawn_remote") return `cc-${++next}`;
    return null;
  });
  const { XtermPane } = await import("../XtermPane");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const pane = createRef<XtermPaneHandle>();
  await act(async () => {
    root?.render(
      <XtermPane
        ref={pane}
        workspaceId="ws-1"
        projectPath={REMOTE}
        pendingAction={null}
        openIntent={door}
      />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => {
    pane.current?.relaunch();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return remoteSpawnIntents();
}

describe("a remote pane's relaunch is a new session, not a reconnect (M18 WP1)", () => {
  it("a workspace opened through the Reconnect door attaches on its FIRST spawn only", async () => {
    const intents = await openThenRelaunch("reconnect");
    // Exact, not `not.toBe("reconnect")`: a relaunch mapped to `no-fire` would skip the
    // unclean-flag resume and still pass a negative assertion.
    expect(intents).toEqual(["reconnect", "fire"]);
  });

  it("positive control: a Fire-door workspace's relaunch spawns with Fire", async () => {
    const intents = await openThenRelaunch("fire");
    expect(intents).toEqual(["fire", "fire"]);
  });
});
