import { describe, it, expect } from "vitest";
import {
  makeWorkspace,
  deriveDisplayName,
  canonicalizeProjectPath,
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

describe("canonicalizeProjectPath", () => {
  it("trims trailing slashes so /a and /a/ are the same project", () => {
    expect(canonicalizeProjectPath("/a/")).toBe("/a");
    expect(canonicalizeProjectPath("/a///")).toBe("/a");
    expect(canonicalizeProjectPath("/a")).toBe("/a");
  });
});

describe("openWorkspace — M4 WP2 N>1 (append + focus-existing)", () => {
  it("opens and focuses a workspace from empty", () => {
    const s = openWorkspace(emptyWorkspaceList, "/a");
    expect(s.workspaces).toHaveLength(1);
    expect(s.focusedId).toBe(s.workspaces[0].id);
    expect(s.workspaces[0].project_path).toBe("/a");
  });

  it("APPENDS a new workspace for a different path and focuses it (N>1)", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = openWorkspace(s1, "/b");
    expect(s2.workspaces).toHaveLength(2);
    // The first workspace is preserved (kept mounted in the background).
    expect(s2.workspaces[0].project_path).toBe("/a");
    expect(s2.workspaces[1].project_path).toBe("/b");
    // Focus switches to the newly-opened one.
    expect(s2.focusedId).toBe(s2.workspaces[1].id);
  });

  it("FOCUSES the existing workspace when reopening the same path (no duplicate)", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = openWorkspace(s1, "/b");
    const firstId = s2.workspaces[0].id;
    // Reopen /a — focus the existing one, mint nothing.
    const s3 = openWorkspace(s2, "/a");
    expect(s3.workspaces).toHaveLength(2);
    expect(s3.focusedId).toBe(firstId);
    // No new id minted (the same workspace objects are retained).
    expect(s3.workspaces).toBe(s2.workspaces);
  });

  it("treats /a and /a/ as the same project (canonicalized dedup)", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/a");
    const s2 = openWorkspace(s1, "/a/");
    expect(s2.workspaces).toHaveLength(1);
    expect(s2.focusedId).toBe(s1.workspaces[0].id);
  });

  it("generalizes to 3+ workspaces in open order (M4's real N=3–4 case)", () => {
    // Append is not a special-cased 2-element behavior — opening four distinct
    // projects yields four workspaces in open order, with the last focused.
    let s = openWorkspace(emptyWorkspaceList, "/a");
    s = openWorkspace(s, "/b");
    s = openWorkspace(s, "/c");
    s = openWorkspace(s, "/d");
    expect(s.workspaces.map((w) => w.project_path)).toEqual([
      "/a",
      "/b",
      "/c",
      "/d",
    ]);
    expect(s.focusedId).toBe(s.workspaces[3].id);
    // Reopening a middle one focuses it without disturbing order or count.
    const reopened = openWorkspace(s, "/b");
    expect(reopened.workspaces).toHaveLength(4);
    expect(reopened.workspaces.map((w) => w.project_path)).toEqual([
      "/a",
      "/b",
      "/c",
      "/d",
    ]);
    expect(reopened.focusedId).toBe(s.workspaces[1].id);
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
