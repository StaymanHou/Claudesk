// WP10 Phase 2 — FileTree: the collapsible left-rail file navigator.
//
// APP-LAYER subsystem (research.md correction, same as WP6's finder): a React tree
// over the backend `fs_tree` walk. On mount it loads the workspace's file+dir list
// via the `fs_tree` IPC command, nests it (buildTree), and renders a collapsible
// directory tree. Clicking a file opens it into the editor via the parent's onOpen
// seam (the same `openFile` the Cmd+P finder + diff "Open" use). Complements the
// finder: the finder is for files you can name, the tree is for browsing.
//
// IPC ERRORS ARE SURFACED, NEVER SWALLOWED (the WP6 picker IPC error-surfacing
// lesson): a failed `fs_tree` renders an inline error row, not an empty rail.
//
// Dark-only, styled to match the picker/finder chrome.

import { useEffect, useMemo, useReducer, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildTree, type TreeEntry, type TreeNode } from "./buildTree";
import { treeReducer, initialExpanded, type ExpandedDirs } from "./treeState";

interface FileTreeProps {
  /** Workspace project dir — the root `fs_tree` walks. */
  projectPath: string;
  /** The currently-open file (project-relative), highlighted in the tree. Null = none. */
  openPath: string | null;
  /** Open a file (project-relative path) into the editor — the shared openFile seam. */
  onOpen: (path: string) => void;
}

export function FileTree({ projectPath, openPath, onOpen }: FileTreeProps) {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [expanded, dispatch] = useReducer(treeReducer, initialExpanded);

  // Load the tree on mount (the rail stays mounted per the all-workspaces-mounted
  // rule, so this fires once per workspace). An fs_tree failure surfaces inline,
  // never swallowed into an empty rail.
  useEffect(() => {
    let cancelled = false;
    invoke<TreeEntry[]>("fs_tree", { root: projectPath })
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(String(e));
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const tree = useMemo(
    () => (entries === null ? [] : buildTree(entries)),
    [entries],
  );

  if (error !== null) {
    return (
      <div className="file-tree-body" data-testid="file-tree">
        <div
          className="file-tree-error"
          data-testid="file-tree-error"
          role="alert"
        >
          Could not list files: {error}
        </div>
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="file-tree-body" data-testid="file-tree">
        <div className="file-tree-loading" data-testid="file-tree-loading">
          Indexing…
        </div>
      </div>
    );
  }

  return (
    <div className="file-tree-body" data-testid="file-tree" role="tree">
      {tree.length === 0 ? (
        <div className="file-tree-empty" data-testid="file-tree-empty">
          No files
        </div>
      ) : (
        tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            openPath={openPath}
            onOpen={onOpen}
            onToggle={(path) => dispatch({ type: "toggle", path })}
          />
        ))
      )}
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: ExpandedDirs;
  openPath: string | null;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
}

/** One tree row + (for an expanded dir) its children, rendered recursively. */
function TreeRow({
  node,
  depth,
  expanded,
  openPath,
  onOpen,
  onToggle,
}: TreeRowProps) {
  const isOpen = expanded.has(node.path);
  const isActive = !node.isDir && node.path === openPath;
  // Indent by depth; the chevron/leaf marker keeps dirs and files visually distinct.
  const indent = { paddingLeft: `${depth * 12 + 6}px` };

  if (node.isDir) {
    return (
      <>
        <div
          className="file-tree-row file-tree-dir"
          data-testid="file-tree-dir"
          data-path={node.path}
          style={indent}
          role="treeitem"
          aria-expanded={isOpen}
          onClick={() => onToggle(node.path)}
        >
          <span className="file-tree-chevron">{isOpen ? "▾" : "▸"}</span>
          <span className="file-tree-name">{node.name}</span>
        </div>
        {isOpen &&
          node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              openPath={openPath}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
      </>
    );
  }

  return (
    <div
      className={
        "file-tree-row file-tree-file" + (isActive ? " is-active" : "")
      }
      data-testid="file-tree-file"
      data-path={node.path}
      data-active={isActive}
      style={indent}
      role="treeitem"
      onClick={() => onOpen(node.path)}
    >
      <span className="file-tree-name">{node.name}</span>
    </div>
  );
}
