// @vitest-environment jsdom
// M17 WP6 (AC-4) — the native menu's launcher items driven through the REAL `App`. The menu is
// app-global, so "Open in Sublime Text / Sublime Merge" and "Reveal in Finder" exist while a
// REMOTE workspace is focused. They must invoke NOTHING there and say so in that workspace's
// toast; with a LOCAL workspace focused they must still launch. The local case is the positive
// control, so "no invoke" cannot pass because the menu event never arrived.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { MENU_IDS } from "../menu/menuBridge";
import {
  bootIpc,
  ipcCalls as calls,
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

/** Boot the real App and open one workspace at `projectPath` (it becomes the focused one). */
async function mountFocused(projectPath: string) {
  bootIpc((cmd) => {
    if (cmd === "list_projects" || cmd === "prune_missing_projects") return [];
    if (cmd === "picker_announce_actions") return {};
    return null;
  });
  const { default: App } = await import("../App");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
  const seed = (window as { __seedWorkspace?: (p: string) => void })
    .__seedWorkspace!;
  await act(async () => seed(projectPath));
  await settle();
}

async function menu(id: string) {
  await act(async () => {
    await emit("menu", id);
  });
  await settle();
}

const toast = () =>
  host!.querySelector('[data-testid="workspace-inject-toast"]')?.textContent ??
  null;

const LAUNCHERS = [
  [MENU_IDS.OPEN_SUBLIME_TEXT, "sublime_open", "Sublime Text"],
  [MENU_IDS.OPEN_SUBLIME_MERGE, "smerge_open", "Sublime Merge"],
  [MENU_IDS.REVEAL_IN_FINDER, "finder_open", "Reveal in Finder"],
] as const;

describe("menu launchers × workspace kind (M17 WP6, AC-4)", () => {
  for (const [id, cmd, subject] of LAUNCHERS) {
    it(`${id} on a REMOTE workspace invokes nothing and says so`, async () => {
      await mountFocused(REMOTE);
      await menu(id);
      expect(calls.map((c) => c.cmd)).not.toContain(cmd);
      expect(toast()).toContain(
        `${subject} isn't available on a remote workspace.`,
      );
      // P3.verify-human.2 (decision B): an informational notice, not the red error.
      expect(
        host!
          .querySelector('[data-testid="workspace-inject-toast"]')
          ?.getAttribute("data-kind"),
      ).toBe("info");
    });

    it(`${id} on a LOCAL workspace still launches (positive control)`, async () => {
      await mountFocused(LOCAL);
      await menu(id);
      expect(
        calls.filter((c) => c.cmd === cmd).map((c) => c.args.projectPath),
      ).toEqual([LOCAL]);
      expect(toast()).toBeNull();
    });
  }
});
