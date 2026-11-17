// @vitest-environment jsdom
// M17 WP5 Phase 3 (AC-4) — the Detach control driven through the REAL `App`, like `closeWiring`:
// a remote and a local workspace opened through App's DEV-only `__seedWorkspace` seam, the stub
// pane reporting its session id the way the real one does, and a real click on the tile control.
// What this pins that the pure `detachThenClose` tests cannot: only the REMOTE tile offers it,
// `cc_detach` carries THAT workspace's session id and lands BEFORE the tile closes, the close is
// the UNCLEAN one (no `session_state_mark_clean`), no confirm opens even while busy, and a failed
// detach keeps the tile and says why in that workspace's toast.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { WORKSPACE_STATUS_EVENT } from "../state/workspaceStatus";
import { REMOTE_CLOSE_NOT_ENDED_EVENT } from "../state/remoteCloseNotEnded";
import {
  bootIpc,
  ipcCalls as calls,
  paneFor,
  settle,
  teardownIpc,
  uncaught,
} from "../components/workspace/__tests__/liveWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock(
  "../components/workspace/XtermPane",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .xtermPaneModule,
);
vi.mock(
  "../components/workspace/RightPanelHost",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .rightPanelModule,
);
vi.mock(
  "../state/useWorkflowFeaturesEnabled",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .gateModule,
);

const REMOTE = "ssh://me@mini-host/Users/me/remote-proj";
const LOCAL = "/tmp/scratch/scratch-a";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await teardownIpc(root, host);
  root = null;
  host = null;
  expect(uncaught).toEqual([]);
});

/** Boot the real App, open REMOTE then LOCAL, and have each pane report a session id. */
async function mount(detachError?: string) {
  bootIpc((cmd) => {
    if (cmd === "list_projects" || cmd === "prune_missing_projects") return [];
    if (cmd === "picker_announce_actions") return {};
    if (cmd === "cc_detach" && detachError !== undefined) throw detachError;
    return null;
  });
  const { default: App } = await import("../App");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
  const seed = (window as { __seedWorkspace?: (p: string) => void })
    .__seedWorkspace!;
  await act(async () => seed(REMOTE));
  await act(async () => seed(LOCAL));
  await settle();
  const r = idOf("remote-proj");
  const l = idOf("scratch-a");
  await act(async () => paneFor(r).props?.onSessionId?.("cc-r"));
  await act(async () => paneFor(l).props?.onSessionId?.("cc-l"));
  await settle();
  return { r, l };
}

function idOf(name: string): string {
  const el = host!.querySelector(`[aria-label="Close ${name}"]`);
  const id = el?.getAttribute("data-testid")?.replace("filmstrip-close-", "");
  if (!id) throw new Error(`no open workspace named ${name}`);
  return id;
}

const openIds = () =>
  [...host!.querySelectorAll('[data-testid^="filmstrip-close-"]')]
    .map((e) => e.getAttribute("data-testid")!.replace("filmstrip-close-", ""))
    .sort();

const detachOf = (id: string) =>
  host!.querySelector<HTMLElement>(`[data-testid="filmstrip-detach-${id}"]`);

async function click(el: Element | null) {
  if (!el) throw new Error("click target not found");
  await act(async () => (el as HTMLElement).click());
  await settle();
}

describe("Detach through the real App (M17 WP5 Phase 3)", () => {
  it("only the remote tile offers Detach", async () => {
    const { r, l } = await mount();
    expect(detachOf(r)).not.toBeNull();
    expect(detachOf(l)).toBeNull();
  });

  it("detaches THAT session first, then closes the tile UNCLEAN, with no confirm even while busy", async () => {
    const { r, l } = await mount();
    // Busy: a × would ask first. Detach is explicit and keeps its meaning (AC-4.1).
    await act(async () => {
      await emit(WORKSPACE_STATUS_EVENT, { workspace_id: r, state: "running" });
    });
    await settle();
    await click(detachOf(r));
    expect(host!.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    expect(openIds()).toEqual([l]);
    const cmds = calls.map((c) => c.cmd);
    expect(calls.filter((c) => c.cmd === "cc_detach")).toEqual([
      { cmd: "cc_detach", args: { sessionId: "cc-r" } },
    ]);
    // The detach takes the session out BEFORE the pane unmounts and asks `cc_kill` (which would
    // END the remote session): so if a kill follows at all, it comes after.
    const kill = cmds.indexOf("cc_kill");
    if (kill !== -1) expect(cmds.indexOf("cc_detach")).toBeLessThan(kill);
    // Unclean: the flag stays, so nothing marks the project clean.
    expect(calls.filter((c) => c.cmd === "session_state_mark_clean")).toEqual(
      [],
    );
  });

  it("a failed detach keeps the tile and says why in that workspace's toast", async () => {
    const { r, l } = await mount("session registry lock poisoned");
    await click(detachOf(r));
    expect(openIds()).toEqual([l, r].sort());
    const toast = host!.querySelector('[data-testid="workspace-inject-toast"]');
    expect(toast?.textContent).toContain(
      "Could not detach: session registry lock poisoned.",
    );
    expect(calls.map((c) => c.cmd)).not.toContain("cc_kill");
  });

  // M17 WP5 Phase 4 (AC-5.3) — a remote close whose host was unreachable: the workspace is gone,
  // so the APP says the session is still running and the next open will ask.
  it("the app shows the close-not-ended toast, naming the host, and it dismisses", async () => {
    await mount();
    expect(host!.querySelector('[data-testid="app-toast"]')).toBeNull();
    await act(async () => {
      await emit(REMOTE_CLOSE_NOT_ENDED_EVENT, {
        projectPath: REMOTE,
        host: "mini-host",
      });
    });
    await settle();
    const toast = host!.querySelector('[data-testid="app-toast"]');
    expect(toast?.getAttribute("role")).toBe("alert");
    expect(toast?.textContent).toContain(
      "Couldn't end the Claude Code session on mini-host",
    );
    expect(toast?.textContent).toContain(
      "will ask whether to end it or reconnect",
    );
    await click(toast?.querySelector('[aria-label="Dismiss"]') ?? null);
    expect(host!.querySelector('[data-testid="app-toast"]')).toBeNull();
  });
});
