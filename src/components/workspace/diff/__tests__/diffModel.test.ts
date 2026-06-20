import { describe, it, expect } from "vitest";
import {
  type ChangedStatus,
  type CommitSummary,
  statusMeta,
  fileKey,
  relativeTime,
  initialDiffView,
  diffViewReducer,
  toggleCollapsed,
  isCollapsed,
  appendPage,
  hasMore,
  COMMIT_PAGE_SIZE,
} from "../diffModel";

describe("statusMeta", () => {
  it("maps each status to a label + single-char badge", () => {
    const cases: [ChangedStatus, string][] = [
      ["added", "A"],
      ["modified", "M"],
      ["deleted", "D"],
      ["renamed", "R"],
      ["untracked", "?"],
    ];
    for (const [status, badge] of cases) {
      expect(statusMeta(status).badge).toBe(badge);
      expect(statusMeta(status).label).toBe(status);
    }
  });
});

describe("fileKey", () => {
  it("folds in staged so the same path on both sides does not collide", () => {
    expect(fileKey({ path: "a.ts", staged: true })).toBe("staged:a.ts");
    expect(fileKey({ path: "a.ts", staged: false })).toBe("unstaged:a.ts");
    expect(fileKey({ path: "a.ts", staged: true })).not.toBe(
      fileKey({ path: "a.ts", staged: false }),
    );
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000;
  it("clamps sub-minute (and future) to 'just now'", () => {
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 30, now)).toBe("just now");
    expect(relativeTime(now + 500, now)).toBe("just now"); // clock skew → clamp
  });
  it("formats minutes / hours / days / months / years", () => {
    expect(relativeTime(now - 5 * 60, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3600, now)).toBe("3h ago");
    expect(relativeTime(now - 2 * 86400, now)).toBe("2d ago");
    expect(relativeTime(now - 60 * 86400, now)).toBe("2mo ago");
    expect(relativeTime(now - 400 * 86400, now)).toBe("1y ago");
  });
});

describe("diffViewReducer", () => {
  it("starts in working-directory view", () => {
    expect(initialDiffView).toEqual({ kind: "working" });
  });
  it("view-commit switches to that commit", () => {
    const next = diffViewReducer(initialDiffView, {
      type: "view-commit",
      sha: "abc123",
      subject: "fix bug",
    });
    expect(next).toEqual({ kind: "commit", sha: "abc123", subject: "fix bug" });
  });
  it("view-working returns to the working directory", () => {
    const onCommit = diffViewReducer(initialDiffView, {
      type: "view-commit",
      sha: "abc",
      subject: "x",
    });
    expect(diffViewReducer(onCommit, { type: "view-working" })).toEqual({
      kind: "working",
    });
  });
});

describe("toggleCollapsed / isCollapsed", () => {
  it("files default to expanded (empty set = nothing collapsed)", () => {
    const empty = new Set<string>();
    expect(isCollapsed(empty, "unstaged:a.ts")).toBe(false);
  });
  it("toggle adds then removes a key without mutating the input", () => {
    const empty = new Set<string>();
    const collapsed = toggleCollapsed(empty, "unstaged:a.ts");
    expect(isCollapsed(collapsed, "unstaged:a.ts")).toBe(true);
    expect(empty.size).toBe(0); // input not mutated
    const expanded = toggleCollapsed(collapsed, "unstaged:a.ts");
    expect(isCollapsed(expanded, "unstaged:a.ts")).toBe(false);
  });
  it("toggling one key leaves others untouched", () => {
    let s = new Set<string>();
    s = toggleCollapsed(s, "unstaged:a.ts");
    s = toggleCollapsed(s, "staged:b.ts");
    expect(isCollapsed(s, "unstaged:a.ts")).toBe(true);
    expect(isCollapsed(s, "staged:b.ts")).toBe(true);
    s = toggleCollapsed(s, "unstaged:a.ts");
    expect(isCollapsed(s, "unstaged:a.ts")).toBe(false);
    expect(isCollapsed(s, "staged:b.ts")).toBe(true);
  });
});

describe("commit pagination", () => {
  const mk = (sha: string): CommitSummary => ({
    sha,
    short_sha: sha.slice(0, 7),
    subject: `c ${sha}`,
    author: "Test",
    time: 1,
    is_head: false,
  });

  it("appendPage concatenates without mutating", () => {
    const existing = [mk("a")];
    const page = [mk("b"), mk("c")];
    const out = appendPage(existing, page);
    expect(out.map((c) => c.sha)).toEqual(["a", "b", "c"]);
    expect(existing.length).toBe(1); // not mutated
  });

  it("hasMore is true only for a full page", () => {
    expect(hasMore(COMMIT_PAGE_SIZE, COMMIT_PAGE_SIZE)).toBe(true);
    expect(hasMore(COMMIT_PAGE_SIZE - 1, COMMIT_PAGE_SIZE)).toBe(false);
    expect(hasMore(0, COMMIT_PAGE_SIZE)).toBe(false);
  });
  it("hasMore is false when page size is zero (guard)", () => {
    expect(hasMore(0, 0)).toBe(false);
  });
});
