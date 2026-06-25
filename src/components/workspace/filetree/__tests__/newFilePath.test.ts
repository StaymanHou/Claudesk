import { describe, it, expect } from "vitest";
import {
  proposeNewFilePath,
  proposeNewDirPath,
  collides,
} from "../newFilePath";

// QoL-WP5 — the pure new-file path composition + collision guard.

describe("proposeNewFilePath", () => {
  it("joins a name to the workspace root (null dir)", () => {
    const r = proposeNewFilePath(null, "notes.md");
    expect(r).toEqual({ ok: true, path: "notes.md" });
  });

  it("joins a name to an existing project-relative dir", () => {
    const r = proposeNewFilePath("src/components", "Foo.tsx");
    expect(r).toEqual({ ok: true, path: "src/components/Foo.tsx" });
  });

  it("trims surrounding whitespace from the name", () => {
    const r = proposeNewFilePath("", "  a.ts  ");
    expect(r).toEqual({ ok: true, path: "a.ts" });
  });

  it("strips a trailing slash from the dir before joining", () => {
    expect(proposeNewFilePath("src/", "a.ts")).toEqual({
      ok: true,
      path: "src/a.ts",
    });
  });

  it("rejects an empty / whitespace-only name", () => {
    expect(proposeNewFilePath(null, "").ok).toBe(false);
    expect(proposeNewFilePath(null, "   ").ok).toBe(false);
  });

  it("rejects a name containing a path separator (v1 — no nested-dir create)", () => {
    expect(proposeNewFilePath(null, "sub/a.ts").ok).toBe(false);
    expect(proposeNewFilePath(null, "sub\\a.ts").ok).toBe(false);
  });

  it("rejects '.' and '..'", () => {
    expect(proposeNewFilePath(null, ".").ok).toBe(false);
    expect(proposeNewFilePath(null, "..").ok).toBe(false);
  });

  it("rejects an absolute-looking name", () => {
    expect(proposeNewFilePath(null, "/etc/passwd").ok).toBe(false);
    expect(proposeNewFilePath(null, "~/secret").ok).toBe(false);
  });

  // QoL-WP5b — create-in-folder: the per-dir "＋" passes a real `dir`. The name must
  // STILL be a single segment (no nested-dir create), and the result is dir-scoped.
  describe("create-in-folder (WP5b — real dir arg)", () => {
    it("composes a dir-scoped path from a nested dir + single-segment name", () => {
      expect(proposeNewFilePath("src/components/workspace", "Foo.tsx")).toEqual({
        ok: true,
        path: "src/components/workspace/Foo.tsx",
      });
    });

    it("still rejects a separator in the name even with a dir (no nested create)", () => {
      const r = proposeNewFilePath("src", "nested/Foo.tsx");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/path separator|existing folder/i);
    });

    it("rejects '.' / '..' / absolute even inside a dir", () => {
      expect(proposeNewFilePath("src", "..").ok).toBe(false);
      expect(proposeNewFilePath("src", "/abs").ok).toBe(false);
    });
  });

  // QoL-WP5b Phase 3 — nested-file create (allowNested) + the default still rejects.
  describe("nested-file create (WP5b P3 — allowNested)", () => {
    it("default (allowNested omitted) still rejects a separator (Phase-1 behavior)", () => {
      expect(proposeNewFilePath("src", "sub/x.txt").ok).toBe(false);
    });

    it("allowNested=true composes a nested path under the dir", () => {
      expect(proposeNewFilePath("src", "util/helpers.ts", true)).toEqual({
        ok: true,
        path: "src/util/helpers.ts",
      });
    });

    it("allowNested=true composes a nested path at root (null dir)", () => {
      expect(proposeNewFilePath(null, "a/b/c.txt", true)).toEqual({
        ok: true,
        path: "a/b/c.txt",
      });
    });

    it("allowNested still rejects '..' / absolute / empty-segment", () => {
      expect(proposeNewFilePath("src", "../escape.txt", true).ok).toBe(false);
      expect(proposeNewFilePath("src", "a//b.txt", true).ok).toBe(false);
      expect(proposeNewFilePath("src", "/abs/x.txt", true).ok).toBe(false);
      expect(proposeNewFilePath(null, "a/../../x.txt", true).ok).toBe(false);
    });
  });
});

describe("proposeNewDirPath (WP5b P3 — new folder)", () => {
  it("composes a single-segment dir at root and inside a dir", () => {
    expect(proposeNewDirPath(null, "newdir")).toEqual({
      ok: true,
      path: "newdir",
    });
    expect(proposeNewDirPath("src", "components")).toEqual({
      ok: true,
      path: "src/components",
    });
  });

  it("allows a nested folder path (backend create_dir does mkdir -p)", () => {
    expect(proposeNewDirPath("src", "a/b/c")).toEqual({
      ok: true,
      path: "src/a/b/c",
    });
  });

  it("trims a trailing slash off the folder name", () => {
    expect(proposeNewDirPath(null, "dir/")).toEqual({ ok: true, path: "dir" });
  });

  it("rejects empty, '..', absolute, and empty-segment names", () => {
    expect(proposeNewDirPath(null, "   ").ok).toBe(false);
    expect(proposeNewDirPath("src", "..").ok).toBe(false);
    expect(proposeNewDirPath("src", "a/../../x").ok).toBe(false);
    expect(proposeNewDirPath(null, "/abs").ok).toBe(false);
    expect(proposeNewDirPath(null, "a//b").ok).toBe(false);
  });
});

describe("collides", () => {
  const existing = ["a.ts", "src/main.rs", "README.md"];

  it("reports a collision for an exact existing path", () => {
    expect(collides("src/main.rs", existing)).toBe(true);
  });

  it("does NOT collide for a fresh path", () => {
    expect(collides("src/new.rs", existing)).toBe(false);
  });

  it("is exact-match (a prefix is not a collision)", () => {
    expect(collides("src", existing)).toBe(false);
    expect(collides("a.ts.bak", existing)).toBe(false);
  });

  // QoL-WP5b — a dir-scoped create collides against the dir-scoped path, so an
  // identically-named file in a DIFFERENT dir is NOT a collision.
  it("collides on the dir-scoped path, not the bare name", () => {
    const r = proposeNewFilePath("src", "main.rs");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(collides(r.path, existing)).toBe(true); // src/main.rs IS in the set
    }
    const fresh = proposeNewFilePath("lib", "main.rs");
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(collides(fresh.path, existing)).toBe(false); // lib/main.rs is not
    }
  });
});
