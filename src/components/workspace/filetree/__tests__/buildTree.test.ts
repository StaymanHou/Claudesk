import { describe, it, expect } from "vitest";
import { buildTree, type TreeEntry } from "../buildTree";

const e = (path: string, is_dir: boolean): TreeEntry => ({ path, is_dir });

describe("buildTree — flat fs_tree entries → nested tree", () => {
  it("nests files under their directory", () => {
    const tree = buildTree([
      e("src", true),
      e("src/main.rs", false),
      e("src/lib.rs", false),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: "src", path: "src", isDir: true });
    expect(tree[0].children.map((c) => c.name)).toEqual(["lib.rs", "main.rs"]);
    expect(tree[0].children.every((c) => !c.isDir)).toBe(true);
  });

  it("includes empty directories (the WP10 reason for the dirs-included backend)", () => {
    const tree = buildTree([e("emptydir", true), e("file.txt", false)]);
    const empty = tree.find((n) => n.name === "emptydir");
    expect(empty).toBeDefined();
    expect(empty!.isDir).toBe(true);
    expect(empty!.children).toEqual([]);
  });

  it("sorts directories before files, each alphabetical", () => {
    const tree = buildTree([
      e("zebra.txt", false),
      e("alpha.txt", false),
      e("mid", true),
      e("aaa", true),
    ]);
    expect(tree.map((n) => n.name)).toEqual([
      "aaa", // dirs first, alpha
      "mid",
      "alpha.txt", // then files, alpha
      "zebra.txt",
    ]);
  });

  it("handles deep nesting", () => {
    const tree = buildTree([
      e("a", true),
      e("a/b", true),
      e("a/b/c", true),
      e("a/b/c/deep.txt", false),
    ]);
    const a = tree[0];
    expect(a.path).toBe("a");
    const b = a.children[0];
    expect(b.path).toBe("a/b");
    const c = b.children[0];
    expect(c.path).toBe("a/b/c");
    expect(c.children[0]).toMatchObject({
      name: "deep.txt",
      path: "a/b/c/deep.txt",
      isDir: false,
    });
  });

  it("creates implied parent dirs even if their own entry is missing", () => {
    // Defensive: a file under an un-emitted dir still nests correctly.
    const tree = buildTree([e("nested/file.ts", false)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: "nested", isDir: true });
    expect(tree[0].children[0]).toMatchObject({
      name: "file.ts",
      path: "nested/file.ts",
      isDir: false,
    });
  });

  it("empty input → empty tree", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("ignores a stray empty-path entry", () => {
    const tree = buildTree([e("", true), e("real.txt", false)]);
    expect(tree.map((n) => n.name)).toEqual(["real.txt"]);
  });
});
