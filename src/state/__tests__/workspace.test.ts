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

describe("pending_action — M12 WP3's auto-resume intent", () => {
  it("rides onto a NEWLY minted workspace", () => {
    const s = openWorkspace(emptyWorkspaceList, "/p/a", {
      kind: "inject",
      command: "/session-restore",
    });
    expect(s.workspaces[0].pending_action).toEqual({
      kind: "inject",
      command: "/session-restore",
    });
  });

  it("defaults to null when no action is supplied", () => {
    // Every pre-M12 caller (the dev seam, the mock, other tests) keeps its behavior.
    expect(
      openWorkspace(emptyWorkspaceList, "/p/a").workspaces[0].pending_action,
    ).toBeNull();
  });

  it("reopening a LIVE workspace does not carry a pending action", () => {
    // ⚠️ This asserts a DELIBERATE omission, so a future reader does not "fix" it.
    //
    // `openWorkspace` focuses an already-open path rather than minting a second workspace,
    // and a focus has NO SPAWN to apply an action to. Injecting a resumption command into a
    // session that is already running would type a slash command mid-conversation — strictly
    // worse than doing nothing. So the action is dropped on this branch by design.
    const first = openWorkspace(emptyWorkspaceList, "/p/a");
    const again = openWorkspace(first, "/p/a", {
      kind: "inject",
      command: "/session-restore",
    });
    expect(again.workspaces).toHaveLength(1);
    expect(again.workspaces[0].pending_action).toBeNull();
    expect(again.focusedId).toBe(first.workspaces[0].id);
  });

  it("the argv arm rides through unchanged", () => {
    const s = openWorkspace(emptyWorkspaceList, "/p/b", {
      kind: "argv",
      flag: "--continue",
    });
    expect(s.workspaces[0].pending_action).toEqual({
      kind: "argv",
      flag: "--continue",
    });
  });
});

describe("open_intent — P4.6's argv-arm authorization", () => {
  // ⚠️ WHY THIS IS A SEPARATE FIELD FROM `pending_action`, asserted rather than commented:
  // `pending_action === null` conflates the no-fire door with "row door, no signal", and the
  // ARGV arm needs those distinguished — it is resolved in the backend from the unclean flag, so
  // it does not consult `pending_action` at all. Deriving the door from the action is what
  // shipped a defect where `⏵` resumed a conversation the user had declined.

  it("rides onto a newly minted workspace as a VALUE", () => {
    const s = openWorkspace(emptyWorkspaceList, "/p/a", null, "no-fire");
    expect(s.workspaces[0].open_intent).toBe("no-fire");
  });

  it("defaults to 'fire', NOT 'no-fire'", () => {
    // ⚠️ The default direction is load-bearing and counter-intuitive. `no-fire` looks like the
    // safe default and is wrong: it would silently suppress auto-resume for every caller that
    // omitted the argument (the dev seam, the mock, older tests) — a feature that stops working
    // with no error. Contrast `pending_action`, which correctly defaults to null: that withholds
    // an action nobody supplied, whereas this would withhold an authorization.
    expect(
      openWorkspace(emptyWorkspaceList, "/p/a").workspaces[0].open_intent,
    ).toBe("fire");
  });

  it("is INDEPENDENT of pending_action — the no-fire door with a null action", () => {
    // The exact live combination that was broken: the `⏵` door nulls the action (correctly),
    // and the intent is the only thing left that can tell the backend to suppress the argv arm.
    // If a future refactor derives the intent from the action, this fails.
    const s = openWorkspace(emptyWorkspaceList, "/p/a", null, "no-fire");
    expect(s.workspaces[0].pending_action).toBeNull();
    expect(s.workspaces[0].open_intent).toBe("no-fire");
  });

  it("distinguishes the two states a null action cannot", () => {
    // Same `pending_action` (null), opposite argv authorization — proving the field carries
    // information the action provably does not. This is the assertion that makes "why two
    // fields?" answerable from the test suite rather than from a comment.
    const noFire = openWorkspace(emptyWorkspaceList, "/p/a", null, "no-fire");
    const rowNoSignal = openWorkspace(emptyWorkspaceList, "/p/b", null, "fire");
    expect(noFire.workspaces[0].pending_action).toBeNull();
    expect(rowNoSignal.workspaces[0].pending_action).toBeNull();
    expect(noFire.workspaces[0].open_intent).not.toBe(
      rowNoSignal.workspaces[0].open_intent,
    );
  });
});
