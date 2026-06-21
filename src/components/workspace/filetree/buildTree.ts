// WP10 Phase 2 — pure tree-builder for the FileTree navigator.
//
// The backend `fs_tree` command returns a FLAT, path-sorted list of entries
// (`{ path, is_dir }`, project-relative POSIX paths). This module nests that flat
// list into a tree the FileTree component renders. It's the PURE half (no React,
// no DOM) so it's vitest-testable — the repo posture (pure logic → vitest, live DOM
// → Playwright; same split as buildTree's siblings fuzzyMatch.ts / panelHost.ts).
//
// WHY a flat-then-nest split (vs. the backend returning a nested struct): the Rust
// walk stays dead-simple (one sorted Vec, no recursive serialization), and the
// nesting — the part with the interesting ordering rules — lives here as a pure fn
// that's trivial to unit-test. (WP10 plan decision.)

/** Mirrors the Rust `TreeEntry` wire shape from the `fs_tree` command. */
export interface TreeEntry {
  /** Project-relative POSIX path (e.g. "src/main.rs"). */
  path: string;
  is_dir: boolean;
}

/** A node in the nested tree: a directory (with children) or a file leaf. */
export interface TreeNode {
  /** The last path segment — what the row displays. */
  name: string;
  /** The full project-relative POSIX path — the open/expand key. */
  path: string;
  isDir: boolean;
  /** Child nodes (empty for files; possibly empty for an empty dir). */
  children: TreeNode[];
}

/**
 * Nest a flat `fs_tree` entry list into a `TreeNode[]` rooted at the project dir.
 *
 * Robust to ordering: a directory node is created on first need (either when its own
 * entry is seen, or implicitly when a descendant is — though `fs_tree` emits dir
 * entries explicitly, including empty dirs). Within each level, **directories sort
 * before files**, each group alphabetical (case-insensitive) — the Sublime/VS Code
 * sidebar convention. Pure: same input → same output, no DOM.
 */
export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // Index every node by its full path so children attach to the right parent
  // regardless of entry order. Dirs implied by a deeper path get created on demand.
  const byPath = new Map<string, TreeNode>();

  const ensureDir = (path: string): TreeNode => {
    const existing = byPath.get(path);
    if (existing) {
      // A path first created as an implied dir, later confirmed by its own entry —
      // already a dir; nothing to change.
      return existing;
    }
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path : path.slice(slash + 1);
    const node: TreeNode = { name, path, isDir: true, children: [] };
    byPath.set(path, node);
    if (slash === -1) {
      roots.push(node);
    } else {
      ensureDir(path.slice(0, slash)).children.push(node);
    }
    return node;
  };

  for (const entry of entries) {
    const { path, is_dir } = entry;
    if (path === "") continue; // defensive: the root itself is never an entry
    if (is_dir) {
      ensureDir(path);
      continue;
    }
    // File leaf: attach under its parent dir (created on demand if unseen).
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path : path.slice(slash + 1);
    const leaf: TreeNode = { name, path, isDir: false, children: [] };
    byPath.set(path, leaf);
    if (slash === -1) {
      roots.push(leaf);
    } else {
      ensureDir(path.slice(0, slash)).children.push(leaf);
    }
  }

  sortNodes(roots);
  return roots;
}

/** Sort a node list (and recursively its children): dirs first, then files; each alpha. */
function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // dirs before files
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortNodes(n.children);
  }
}
