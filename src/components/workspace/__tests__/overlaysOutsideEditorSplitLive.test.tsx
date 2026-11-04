// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { RightPanelHost } from "../RightPanelHost";
import "../../../test-support/cm6JsdomShims";

// M16.5 WP6 Phase 1 — app overlays draw above CodeMirror's find bar.
//
// The fix is `isolation: isolate` on `.editor-split` (pinned by
// `editor/__tests__/editorStackingContext.test.ts`). That only works while every
// `.command-palette-backdrop` overlay mounts OUTSIDE `.editor-split`: one rendered inside it
// would be back in the same stacking context as `.cm-panels` (z-index 300) and lose again.
// ⌘⇧P is the one at risk. It lives in `EditorPanel` and portals up to `.workspace-right`,
// falling back to rendering INLINE when that ancestor is missing. So this mounts the real
// RightPanelHost, opens a file, fires each chord and checks where the overlay landed.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom gaps (ResizeObserver, matchMedia, Range rects) are patched by the shared shim module.

const PROJECT = "/tmp/scratch/overlay-fixture";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount() {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      switch (cmd) {
        case "fs_tree":
          return [{ path: "main.ts", is_dir: false }];
        case "fs_index":
          return ["main.ts"];
        case "stat_file":
          return { mtime_ms: 1, size: 13 };
        case "read_file":
          return "const x = 1;\n";
        case "git_file_statuses":
          return {};
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <RightPanelHost
        workspaceId="ws-test"
        projectPath={PROJECT}
        visible={true}
        workspaceProfile={null}
        collapsed={false}
      />,
    ),
  );
  await settle();
  await click(host!.querySelector('[data-testid="panel-tab-editor"]'));
  const file = [
    ...host!.querySelectorAll('[data-testid="file-tree-file"]'),
  ].find((r) => r.textContent?.includes("main.ts"));
  await click(file);
  // The lazy EditorPanel chunk + the read round trip. Two settles were the whole wait until
  // 2026-11-04, and under a loaded run the chunk could take longer, so `.cm-content` was not
  // there yet (2 of 3 harness runs failed at paydown WP3). The two settles stay as the minimum;
  // then wait on the CONDITION, bounded.
  await settle();
  await settle();
  const deadline = Date.now() + 2000;
  while (!host!.querySelector(".editor-split .cm-content")) {
    if (Date.now() > deadline)
      throw new Error("mount(): the editor never rendered .cm-content");
    await settle();
  }
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function chord(key: string, code: string, shift: boolean) {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        code,
        metaKey: true,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

const CHORDS = [
  {
    name: "⌘P file finder",
    key: "p",
    code: "KeyP",
    shift: false,
    testid: "file-finder",
  },
  {
    name: "⌘⇧F find in files",
    key: "F",
    code: "KeyF",
    shift: true,
    testid: "project-search",
  },
  {
    name: "⌘⇧P command palette",
    key: "P",
    code: "KeyP",
    shift: true,
    testid: "command-palette",
  },
] as const;

describe("app overlays mount outside the isolated editor (M16.5 WP6, live)", () => {
  for (const c of CHORDS) {
    it(`${c.name} renders its backdrop outside .editor-split`, async () => {
      await mount();
      // The precondition the claim depends on: a file is open in a real editor.
      const split = host!.querySelector(".editor-split");
      expect(split).not.toBeNull();
      expect(split!.querySelector(".cm-content")).not.toBeNull();
      expect(document.querySelector(".command-palette-backdrop")).toBeNull();

      await chord(c.key, c.code, c.shift);

      const backdrops = [
        ...document.querySelectorAll(".command-palette-backdrop"),
      ];
      expect(backdrops).toHaveLength(1);
      // Identity, not just a count: THIS chord opened THIS overlay.
      expect(backdrops[0].getAttribute("data-testid")).toBe(c.testid);
      expect(backdrops[0].closest(".editor-split")).toBeNull();
      // Still inside this workspace's right half, so it covers the panel it belongs to.
      expect(backdrops[0].closest(".workspace-right")).not.toBeNull();
    });
  }
});
