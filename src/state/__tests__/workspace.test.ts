import { describe, it, expect } from "vitest";
import {
  makeWorkspace,
  deriveDisplayName,
  openWorkspace,
  focusWorkspace,
  emptyWorkspaceList,
} from "../workspace";

describe("makeWorkspace", () => {
  it("applies the documented Phase 1 defaults", () => {
    const ws = makeWorkspace("/Users/me/projects/claudesk");
    expect(ws.status).toBe("idle");
    expect(ws.cc_session_id).toBeNull();
    expect(ws.project_path).toBe("/Users/me/projects/claudesk");
    expect(ws.display_name).toBe("claudesk");
    expect(ws.id).toMatch(/^ws-\d+$/);
  });

  it("mints unique ids", () => {
    const a = makeWorkspace("/a");
    const b = makeWorkspace("/b");
    expect(a.id).not.toBe(b.id);
  });

  it("honours overrides", () => {
    const ws = makeWorkspace("/x", { status: "running", display_name: "X" });
    expect(ws.status).toBe("running");
    expect(ws.display_name).toBe("X");
  });
});

describe("deriveDisplayName", () => {
  it("uses the last path segment", () => {
    expect(deriveDisplayName("/Users/me/projects/claudesk")).toBe("claudesk");
  });
  it("ignores a trailing slash", () => {
    expect(deriveDisplayName("/Users/me/projects/claudesk/")).toBe("claudesk");
  });
  it("falls back to the whole path when there is no segment", () => {
    expect(deriveDisplayName("/")).toBe("/");
  });
});

describe("openWorkspace — Phase 1 N<=1 invariant", () => {
  it("opens and focuses a workspace from empty", () => {
    const s = openWorkspace(emptyWorkspaceList, "/a");
    expect(s.workspaces).toHaveLength(1);
    expect(s.focusedId).toBe(s.workspaces[0].id);
    expect(s.workspaces[0].project_path).toBe("/a");
  });

  it("REPLACES the existing workspace rather than appending (length stays 1)", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = openWorkspace(s1, "/b");
    expect(s2.workspaces).toHaveLength(1);
    expect(s2.workspaces[0].project_path).toBe("/b");
    expect(s2.focusedId).toBe(s2.workspaces[0].id);
  });
});

describe("focusWorkspace", () => {
  it("focuses a known workspace", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = focusWorkspace(s1, s1.workspaces[0].id);
    expect(s2.focusedId).toBe(s1.workspaces[0].id);
  });
  it("is a no-op for an unknown id", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = focusWorkspace(s1, "ws-does-not-exist");
    expect(s2).toBe(s1);
  });
});
