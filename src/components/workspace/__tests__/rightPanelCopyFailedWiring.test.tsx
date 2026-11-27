// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { RightPanelHost } from "../RightPanelHost";
import { resetHostSubstrateStoreForTests } from "../../../state/useHostSubstrate";
import "../../../test-support/cm6JsdomShims";

// paydown-2026-11-27 WP8 — the REAL RightPanelHost hands the workspace's `onCopyFailed` to every
// second-terminal `TerminalPane` (a refused or failed OSC 52 copy there is an error notice too).
// `TerminalPane` is stubbed to record its props; `osc52Live.test.tsx` covers TerminalPane → pane.

const termProps: Array<{ onCopyFailed?: (n: string) => void }> = [];
vi.mock("../TerminalPane", async () => {
  const { forwardRef } = await import("react");
  return {
    TerminalPane: forwardRef(function TerminalPaneStub(props: {
      onCopyFailed?: (n: string) => void;
    }) {
      termProps.push(props);
      return <div data-testid="term-pane-stub" />;
    }),
  };
});
vi.mock("../../../state/useWorkflowFeaturesEnabled", () => ({
  useWorkflowFeaturesEnabled: () => false,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  termProps.length = 0;
  resetHostSubstrateStoreForTests();
  clearMocks();
});

describe("RightPanelHost → TerminalPane: onCopyFailed", () => {
  it("the second terminal receives the workspace's onCopyFailed", async () => {
    mockWindows("main");
    mockIPC(
      (cmd) => {
        if (cmd === "fs_tree" || cmd === "fs_index") return [];
        if (cmd === "git_file_statuses") return {};
        if (cmd === "git_changed_files" || cmd === "git_recent_commits")
          return [];
        return null;
      },
      { shouldMockEvents: true },
    );
    const onCopyFailed = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <RightPanelHost
          workspaceId="ws-wp8"
          projectPath="/tmp/scratch/wp8-local"
          visible
          workspaceProfile={null}
          collapsed={false}
          onCopyFailed={onCopyFailed}
        />,
      ),
    );
    await settle();
    const tab = host.querySelector<HTMLElement>(
      '[data-testid="panel-tab-terminal"]',
    );
    expect(tab, "the terminal tab (positive control)").not.toBeNull();
    await act(async () => tab!.click());
    await settle();
    expect(termProps.length, "a TerminalPane mounted").toBeGreaterThan(0);
    expect(termProps.at(-1)?.onCopyFailed).toBe(onCopyFailed);
  });
});
