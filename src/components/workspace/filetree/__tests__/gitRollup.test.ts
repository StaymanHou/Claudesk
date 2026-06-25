import { describe, expect, it } from "vitest";
import { dominantStatus, dominantStatusByDir } from "../gitRollup";
import type { GitStatusMap } from "../gitStatus";

describe("dominantStatus (WP7 — fold mixed statuses to one dominant)", () => {
  it("picks the higher-precedence status from a mix", () => {
    // deleted > modified > added > untracked
    expect(dominantStatus(["modified", "untracked"])).toBe("modified");
    expect(dominantStatus(["deleted", "modified"])).toBe("deleted");
    expect(dominantStatus(["added", "untracked"])).toBe("added");
    expect(dominantStatus(["untracked", "added", "modified"])).toBe("modified");
    expect(dominantStatus(["untracked", "added", "modified", "deleted"])).toBe(
      "deleted",
    );
  });

  it("is order-independent (precedence, not insertion order)", () => {
    expect(dominantStatus(["untracked", "deleted"])).toBe("deleted");
    expect(dominantStatus(["deleted", "untracked"])).toBe("deleted");
  });

  it("ranks renamed just below modified (both amber)", () => {
    // A folder with both reads as modified (the more common signal).
    expect(dominantStatus(["renamed", "modified"])).toBe("modified");
    // renamed still out-ranks added/untracked.
    expect(dominantStatus(["added", "renamed"])).toBe("renamed");
  });

  it("returns the lone status when there's only one", () => {
    expect(dominantStatus(["untracked"])).toBe("untracked");
    expect(dominantStatus(["deleted"])).toBe("deleted");
  });

  it("returns undefined for an empty set (no roll-up)", () => {
    expect(dominantStatus([])).toBeUndefined();
  });
});

describe("dominantStatusByDir (WP7 — leaf statuses bubble up to ancestor dirs)", () => {
  it("returns an empty map for a clean tree", () => {
    expect(dominantStatusByDir({})).toEqual({});
  });

  it("keys every ancestor dir of a changed path with its status", () => {
    const git: GitStatusMap = { "src/a/b.ts": "modified" };
    const byDir = dominantStatusByDir(git);
    expect(byDir["src/a"]).toBe("modified");
    expect(byDir["src"]).toBe("modified");
    // The leaf itself is NOT a dir key — only ancestors.
    expect(byDir["src/a/b.ts"]).toBeUndefined();
  });

  it("applies precedence when a folder has a mix of descendant statuses", () => {
    const git: GitStatusMap = {
      "src/a.ts": "modified",
      "src/b.ts": "untracked",
    };
    // {modified, untracked} → modified
    expect(dominantStatusByDir(git)["src"]).toBe("modified");

    const git2: GitStatusMap = {
      "src/a.ts": "deleted",
      "src/b.ts": "modified",
    };
    // {deleted, modified} → deleted
    expect(dominantStatusByDir(git2)["src"]).toBe("deleted");

    const git3: GitStatusMap = {
      "src/a.ts": "added",
      "src/b.ts": "untracked",
    };
    // {added, untracked} → added
    expect(dominantStatusByDir(git3)["src"]).toBe("added");
  });

  it("matches on a real path prefix, not a bare string startsWith", () => {
    // `src/a.ts` keys `src` but must NOT key the sibling `src-utils`.
    const git: GitStatusMap = { "src/a.ts": "modified" };
    const byDir = dominantStatusByDir(git);
    expect(byDir["src"]).toBe("modified");
    expect(byDir["src-utils"]).toBeUndefined();
  });

  it("propagates the dominant status to ALL ancestor levels", () => {
    const git: GitStatusMap = {
      "a/b/c/deep.ts": "untracked",
      "a/b/other.ts": "deleted",
    };
    const byDir = dominantStatusByDir(git);
    // a/b/c sees only the untracked deep file.
    expect(byDir["a/b/c"]).toBe("untracked");
    // a/b and a see both → dominant is deleted.
    expect(byDir["a/b"]).toBe("deleted");
    expect(byDir["a"]).toBe("deleted");
  });

  it("handles a changed file at the workspace root (no ancestor dirs)", () => {
    const git: GitStatusMap = { "README.md": "modified" };
    // No "/" in the path → no ancestor dirs → empty roll-up map.
    expect(dominantStatusByDir(git)).toEqual({});
  });
});
