import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles the component source text at test time (repo posture —
// pure logic → vitest, live DOM → operator verify-human; same ?raw trick as
// autofocusCcOnPromote.test.ts / terminalSlotGuard.test.ts). The pure seams
// (proposeNewFilePath/collides, openFiles close-path, isNewFileChord, deleteFileSpec)
// are unit-covered in their own tests; THESE assertions pin the Phase-3 WIRING that
// jsdom can't observe (the FileTree rail + RightPanelHost handlers + the editor handle
// plumbing), so a future edit can't silently sever create/delete/⌘N.
import rightPanelSource from "../RightPanelHost.tsx?raw";
import fileTreeSource from "../filetree/FileTree.tsx?raw";
import editorSplitSource from "../editor/EditorSplit.tsx?raw";
import paneTabsSource from "../editor/PaneTabs.tsx?raw";

// QoL-WP5 — editor file management (create + delete) wiring invariants.

describe("RightPanelHost create-file wiring (P3.2)", () => {
  it("validates the name + collision before writing (no clobber)", () => {
    expect(rightPanelSource).toMatch(/proposeNewFilePath\(/);
    expect(rightPanelSource).toMatch(/collides\(/);
  });

  it("creates via write_file with EMPTY contents, then opens it", () => {
    // The create primitive is write_file("") — not a dedicated backend command.
    expect(rightPanelSource).toMatch(/invoke<void>\("write_file"/);
    expect(rightPanelSource).toMatch(/contents:\s*""/);
    expect(rightPanelSource).toMatch(/openFile\(proposed\.path\)/);
  });

  it("bumps the tree refresh after a create (immediate, not only via the WP0 watcher)", () => {
    expect(rightPanelSource).toMatch(
      /setFsTreeRefreshKey\(\(k\)\s*=>\s*k\s*\+\s*1\)/,
    );
  });
});

describe("RightPanelHost delete-file wiring (P3.3)", () => {
  it("confirms before deleting (deleteFileSpec + ConfirmModal)", () => {
    expect(rightPanelSource).toMatch(/deleteFileSpec\(/);
    expect(rightPanelSource).toMatch(/pendingDelete/);
  });

  it("on confirm: delete_file, then close the tab(s), then refresh the tree", () => {
    expect(rightPanelSource).toMatch(/invoke<void>\("delete_file"/);
    expect(rightPanelSource).toMatch(
      /editorSplitRef\.current\?\.closeTabsForPath\(path\)/,
    );
  });
});

describe("RightPanelHost ⌘N opens the new-file input (P3.4)", () => {
  it("checks the new-file chord and drives the FileTree handle", () => {
    expect(rightPanelSource).toMatch(/isNewFileChord\(e\)/);
    expect(rightPanelSource).toMatch(
      /fileTreeRef\.current\?\.beginNewFile\(\)/,
    );
  });
});

describe("FileTree exposes the create/delete affordances (P3.1)", () => {
  it("is a forwardRef exposing beginNewFile()", () => {
    expect(fileTreeSource).toMatch(/forwardRef<\s*FileTreeHandle/);
    expect(fileTreeSource).toMatch(/beginNewFile/);
  });

  it("renders the inline new-file input + a per-row delete affordance", () => {
    expect(fileTreeSource).toMatch(/file-tree-newfile-input/);
    expect(fileTreeSource).toMatch(/file-tree-delete/);
    expect(fileTreeSource).toMatch(/onDeleteFile\(node\.path\)/);
  });

  it("surfaces a create error inline rather than swallowing it", () => {
    expect(fileTreeSource).toMatch(/file-tree-newfile-error/);
    expect(fileTreeSource).toMatch(/setNewFileError/);
  });
});

describe("editor handle plumbing for tab teardown on delete (P3.3)", () => {
  it("EditorSplit closeTabsForPath fans out to EVERY pane", () => {
    expect(editorSplitSource).toMatch(/closeTabsForPath/);
    // Iterates the pane-handle map (not just the focused one) — a deleted file can be
    // open in multiple split panes.
    expect(editorSplitSource).toMatch(
      /for\s*\(const handle of paneHandles\.current\.values\(\)\)/,
    );
  });

  it("PaneTabs closeTabsForPath dispatches the close-path action (no dirty guard)", () => {
    expect(paneTabsSource).toMatch(/closeTabsForPath/);
    expect(paneTabsSource).toMatch(/type:\s*"close-path"/);
  });
});
