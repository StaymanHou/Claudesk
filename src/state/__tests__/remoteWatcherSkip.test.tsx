// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { useWorkspaceStatus } from "../useWorkspaceStatus";
import type { Workspace } from "../workspace";

// M17 WP6 (AC-8) — the LOCAL fs watcher is never started for a remote workspace (its key is not a
// local path; WP7's poller watches a remote one). Registration still happens for both: the status
// channel needs every workspace. The local workspace in the same list is the positive control.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ws = (id: string, project_path: string) =>
  ({
    id,
    project_path,
    cc_session_id: null,
    display_name: id,
    pending_action: null,
    open_intent: null,
  }) as unknown as Workspace;

function Host({ list }: { list: Workspace[] }) {
  useWorkspaceStatus(list);
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  host?.remove();
  clearMocks();
});

describe("useWorkspaceStatus × workspace kind", () => {
  it("starts the watcher for the local workspace only, registers both", async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    mockWindows("main");
    mockIPC(
      (cmd, args) => {
        calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
        return null;
      },
      { shouldMockEvents: true },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <Host
          list={[
            ws("ws-remote", "ssh://me@mini-host/Users/me/proj"),
            ws("ws-local", "/Users/me/proj"),
          ]}
        />,
      ),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const of = (cmd: string) =>
      calls.filter((c) => c.cmd === cmd).map((c) => c.args.workspaceId);
    expect(of("workspace_register").sort()).toEqual(["ws-local", "ws-remote"]);
    expect(of("workspace_watch_start")).toEqual(["ws-local"]);
  });
});
