// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { RightPanelHost } from "../RightPanelHost";
import "../../../test-support/cm6JsdomShims";

// M16.5 WP5 (5.2) — a failed delete / trash is SHOWN, not only logged
// (SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE), and a create that collides with a gitignored
// `.env` is refused inline. The REAL RightPanelHost + FileTree, real clicks, mocked IPC.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom gaps (ResizeObserver, matchMedia, Range rects) are patched by the shared shim module.

const PROJECT = "/tmp/scratch/file-op-fixture";
const calls: string[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount() {
  calls.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd) => {
      calls.push(cmd);
      switch (cmd) {
        case "fs_tree":
          return [
            { path: ".env", is_dir: false },
            { path: "locked", is_dir: true },
            { path: "locked/victim.txt", is_dir: false },
          ];
        case "delete_file":
          throw "file I/O error: Permission denied (os error 13)";
        case "trash_path":
          throw "file I/O error: locked does not exist";
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
  // The tree lives on the Editor panel.
  await click(q('[data-testid="panel-tab-editor"]'));
}

const q = (sel: string) => host!.querySelector(sel);

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function confirmButton(label: RegExp): Element | undefined {
  return [...document.querySelectorAll("button")].find((b) =>
    label.test((b.textContent ?? "").trim()),
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("RightPanelHost — a failed file op is visible (live)", () => {
  it("shows a failed delete above the tree, and × dismisses it", async () => {
    await mount();
    expect(q('[data-testid="file-tree-op-error"]')).toBeNull();

    const dir = [
      ...host!.querySelectorAll('[data-testid="file-tree-dir"]'),
    ].find((r) => r.textContent?.includes("locked"));
    await click(dir); // expand
    const file = [
      ...host!.querySelectorAll('[data-testid="file-tree-file"]'),
    ].find((r) => r.textContent?.includes("victim.txt"));
    await click(file?.querySelector('[data-testid="file-tree-delete"]'));
    await click(confirmButton(/^delete$/i));

    expect(calls).toContain("delete_file");
    const err = q('[data-testid="file-tree-op-error"]');
    expect(err?.textContent).toContain("Could not delete locked/victim.txt");
    expect(err?.textContent).toContain("Permission denied");

    await click(q('[data-testid="file-tree-op-error-dismiss"]'));
    expect(q('[data-testid="file-tree-op-error"]')).toBeNull();
  });

  it("shows a failed folder trash, with its own wording", async () => {
    await mount();
    const dir = [
      ...host!.querySelectorAll('[data-testid="file-tree-dir"]'),
    ].find((r) => r.textContent?.includes("locked"));
    await click(dir?.querySelector('[data-testid="file-tree-delete-folder"]'));
    await click(confirmButton(/^delete folder$/i));

    expect(calls).toContain("trash_path");
    expect(q('[data-testid="file-tree-op-error"]')?.textContent).toContain(
      "Could not move locked to the Trash",
    );
  });

  it("refuses a new file named like an existing gitignored .env, without writing", async () => {
    await mount();
    await click(q('[data-testid="file-tree-newfile-btn"]'));
    const input = q(
      '[data-testid="file-tree-newfile-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setValue.call(input, ".env");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settle();

    expect(q('[data-testid="file-tree-newfile-error"]')?.textContent).toBe(
      ".env already exists.",
    );
    expect(calls).not.toContain("write_file");
  });
});
