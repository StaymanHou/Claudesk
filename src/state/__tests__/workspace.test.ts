import { describe, it, expect } from "vitest";
import {
  makeWorkspace,
  deriveDisplayName,
  canonicalizeProjectPath,
  openWorkspace,
  focusWorkspace,
  closeWorkspace,
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

describe("closeWorkspace — QoL-WP1", () => {
  /** Build a 3-workspace list /a /b /c with `focusPath` focused. */
  function threeWith(focusPath: string) {
    let s = openWorkspace(emptyWorkspaceList, "/a");
    s = openWorkspace(s, "/b");
    s = openWorkspace(s, "/c");
    const target = s.workspaces.find((w) => w.project_path === focusPath)!;
    return focusWorkspace(s, target.id);
  }

  it("removes the workspace from the list", () => {
    const s = threeWith("/c");
    const bId = s.workspaces.find((w) => w.project_path === "/b")!.id;
    const next = closeWorkspace(s, bId);
    expect(next.workspaces.map((w) => w.project_path)).toEqual(["/a", "/c"]);
  });

  it("leaves focus unchanged when closing a NON-focused workspace", () => {
    const s = threeWith("/c"); // /c focused
    const aId = s.workspaces.find((w) => w.project_path === "/a")!.id;
    const cId = s.focusedId;
    const next = closeWorkspace(s, aId);
    expect(next.focusedId).toBe(cId); // still /c
    expect(next.workspaces.map((w) => w.project_path)).toEqual(["/b", "/c"]);
  });

  it("promotes the LEFT neighbour when closing the focused workspace", () => {
    const s = threeWith("/c"); // /c focused (rightmost)
    const cId = s.focusedId!;
    const bId = s.workspaces.find((w) => w.project_path === "/b")!.id;
    const next = closeWorkspace(s, cId);
    expect(next.focusedId).toBe(bId); // left neighbour /b
    expect(next.workspaces.map((w) => w.project_path)).toEqual(["/a", "/b"]);
  });

  it("promotes the new LEFTMOST when closing the focused leftmost workspace", () => {
    const s = threeWith("/a"); // /a focused (leftmost, index 0)
    const aId = s.focusedId!;
    const bId = s.workspaces.find((w) => w.project_path === "/b")!.id;
    const next = closeWorkspace(s, aId);
    expect(next.focusedId).toBe(bId); // new leftmost /b (Math.max(0, 0-1) = 0)
    expect(next.workspaces.map((w) => w.project_path)).toEqual(["/b", "/c"]);
  });

  it("focuses null (→ picker) when closing the LAST workspace", () => {
    const s1 = openWorkspace(emptyWorkspaceList, "/only");
    const next = closeWorkspace(s1, s1.focusedId!);
    expect(next.workspaces).toHaveLength(0);
    expect(next.focusedId).toBeNull();
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const s = threeWith("/b");
    const next = closeWorkspace(s, "ws-does-not-exist");
    expect(next).toBe(s);
  });
});
