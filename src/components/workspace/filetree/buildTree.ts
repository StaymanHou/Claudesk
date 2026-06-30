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
  /**
   * M6 WP6 — true iff this is a **heavy dir** (`node_modules`/`target`/… by name, or
   * detected-big) that the walker LISTED but did not descend into. Such a dir has zero
   * child entries on the wire; this flag lets the tree render "(not indexed)" so a
   * pruned heavy dir is distinguishable from a genuinely-empty dir. Optional — older
   * `fs_tree` payloads (and most test fixtures) omit it (treated as `false`).
   */
  pruned?: boolean;
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
  /**
   * M6 WP6 — a heavy dir the walker pruned (listed, not descended). Carried from the
   * wire `TreeEntry.pruned`. The FileTree renders a dim "(not indexed)" marker on such
   * rows so an operator doesn't read a pruned `node_modules` as a genuinely-empty dir.
   * `false` for files and for ordinary dirs.
   */
  pruned: boolean;
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
/**
 * QoL-WP5b — count the `fs_tree` entries strictly UNDER `dir` (files + subdirs), for the
 * folder-delete confirm's blast-radius message. Prefix match on `dir + "/"`, so it's
 * precise (`src` counts `src/a.ts` but not `src-utils/a.ts`) and excludes the dir itself.
 * Pure (no DOM); operates on the same flat `fs_tree` list buildTree nests.
 */
export function countDescendants(entries: TreeEntry[], dir: string): number {
  const prefix = dir + "/";
  let n = 0;
  for (const e of entries) {
    if (e.path.startsWith(prefix)) n++;
  }
  return n;
}

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
    const node: TreeNode = {
      name,
      path,
      isDir: true,
      children: [],
      pruned: false,
    };
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
      // M6 WP6 — carry the wire `pruned` flag onto the dir node. ensureDir creates the
      // node (or returns one made on-demand by an earlier descendant); set pruned from
      // THIS explicit entry, which is the authoritative source for the flag.
      const node = ensureDir(path);
      if (entry.pruned) node.pruned = true;
      continue;
    }
    // File leaf: attach under its parent dir (created on demand if unseen).
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path : path.slice(slash + 1);
    const leaf: TreeNode = {
      name,
      path,
      isDir: false,
      children: [],
      pruned: false,
    };
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
