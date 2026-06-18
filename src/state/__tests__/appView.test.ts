import { describe, it, expect } from "vitest";
import { viewFor } from "../appView";
import { emptyWorkspaceList, openWorkspace } from "../workspace";

describe("viewFor — app-shell view state machine", () => {
  it("shows the picker when no workspace is open", () => {
    expect(viewFor(emptyWorkspaceList)).toBe("picker");
  });

  it("transitions picker → workspace-open when a workspace is opened", () => {
    const before = emptyWorkspaceList;
    expect(viewFor(before)).toBe("picker");

    const after = openWorkspace(before, "/Users/me/projects/claudesk");
    expect(viewFor(after)).toBe("workspace-open");
    // openWorkspace also produced exactly one focused workspace (Phase 1 N<=1).
    expect(after.workspaces).toHaveLength(1);
    expect(after.focusedId).toBe(after.workspaces[0].id);
  });

  it("stays on the picker if there are workspaces but none is focused", () => {
    // Defensive: a workspace present but focusedId null still routes to picker.
    const state = {
      workspaces: openWorkspace(emptyWorkspaceList, "/a").workspaces,
      focusedId: null,
    };
    expect(viewFor(state)).toBe("picker");
  });
});
