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

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useState,
  forwardRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildTree, type TreeEntry, type TreeNode } from "./buildTree";
import { treeReducer, initialExpanded, type ExpandedDirs } from "./treeState";
import { statusClass, statusGlyph, type GitStatusMap } from "./gitStatus";

/** Imperative surface the parent drives the tree through (QoL-WP5 — ⌘N opens the input). */
export interface FileTreeHandle {
  /** Open the inline new-file name input (the ⌘N target + the "+" button action). */
  beginNewFile: () => void;
}

interface FileTreeProps {
  /** Workspace project dir — the root `fs_tree` walks. */
  projectPath: string;
  /** The currently-open file (project-relative), highlighted in the tree. Null = none. */
  openPath: string | null;
  /** Open a file (project-relative path) into the editor — the shared openFile seam. */
  onOpen: (path: string) => void;
  /**
   * QoL-WP5 — create a new file named `name` at the workspace root. Returns a Promise
   * resolving to an error string (shown inline) or null on success. The parent owns the
   * collision check + `write_file` IPC + open-into-editor + tree refresh; the tree owns
   * only the inline name input. `existingPaths` (current project-relative tree paths) is
   * passed so the parent can reject a clobber. Optional — older callers/tests omit it.
   */
  onCreateFile?: (
    name: string,
    existingPaths: string[],
  ) => Promise<string | null>;
  /**
   * QoL-WP5 — delete the file at `path` (project-relative). The parent owns the
   * confirm dialog + `delete_file` IPC + open-tab teardown + tree refresh. Optional.
   */
  onDeleteFile?: (path: string) => void;
  /**
   * WP11 — bump this to force a git-status re-fetch (the parent bumps it on each
   * file save so the indicators reflect the just-written file). Changing it re-runs
   * the status effect without re-walking fs_tree. Defaults to 0 (initial fetch).
   */
  gitStatusRefreshKey?: number;
  /**
   * QoL-WP0 — bump this to force an `fs_tree` RE-WALK (the parent bumps it on every
   * `fs-change` event from the backend filesystem watcher, so the rail reflects an
   * external on-disk create/remove/rename without a manual collapse/expand). The
   * expand/collapse state lives in a path-keyed reducer that survives the re-fetch,
   * and scroll is native on the same (never-remounted) container — both preserved.
   * Defaults to 0 (initial load only).
   */
  fsTreeRefreshKey?: number;
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(
  function FileTree(
    {
      projectPath,
      openPath,
      onOpen,
      onCreateFile,
      onDeleteFile,
      gitStatusRefreshKey = 0,
      fsTreeRefreshKey = 0,
    },
    ref,
  ) {
    const [entries, setEntries] = useState<TreeEntry[] | null>(null); // null = loading
    const [error, setError] = useState<string | null>(null);
    const [expanded, dispatch] = useReducer(treeReducer, initialExpanded);

    // QoL-WP5 — inline new-file name input. `newFileName` is null when the input is
    // closed; a string (possibly empty) while the operator types. `newFileError` shows a
    // rejected create (collision / invalid name / IPC error) inline below the input.
    const [newFileName, setNewFileName] = useState<string | null>(null);
    const [newFileError, setNewFileError] = useState<string | null>(null);

    // ⌘N (and the "+" button) opens the input; the parent drives ⌘N through this handle.
    useImperativeHandle(
      ref,
      () => ({
        beginNewFile: () => {
          setNewFileError(null);
          setNewFileName("");
        },
      }),
      [],
    );
    // WP11 — per-path git status for the row indicators. Empty until the first fetch
    // resolves; a non-git workspace stays empty (the backend returns an empty map, not
    // an error — so the tree renders with no indicators rather than an error row).
    const [gitStatus, setGitStatus] = useState<GitStatusMap>({});

    // Load the tree on mount (the rail stays mounted per the all-workspaces-mounted
    // rule), AND re-walk on each `fsTreeRefreshKey` bump (QoL-WP0: an `fs-change` event
    // from the backend watcher → an external on-disk create/remove/rename). An fs_tree
    // failure surfaces inline, never swallowed into an empty rail. The re-walk replaces
    // `entries` only; the path-keyed `expanded` reducer + native scroll are untouched,
    // so collapse state + scroll position survive a refresh.
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
    }, [projectPath, fsTreeRefreshKey]);

    // WP11 — fetch the git-status map (parallel to fs_tree), re-running on workspace
    // change AND on `gitStatusRefreshKey` bumps (a save in the editor). A failure here
    // does NOT blank the tree or set the error row — git status is decorative, and a
    // non-git dir legitimately "fails" by returning an empty map; we clear to empty
    // (no indicators) and let the file list stand. (Distinct from the fs_tree error,
    // which IS surfaced — losing the file list is a real failure.)
    useEffect(() => {
      let cancelled = false;
      invoke<GitStatusMap>("git_file_statuses", { root: projectPath })
        .then((map) => {
          if (!cancelled) setGitStatus(map);
        })
        .catch(() => {
          if (!cancelled) setGitStatus({});
        });
      return () => {
        cancelled = true;
      };
    }, [projectPath, gitStatusRefreshKey]);

    const tree = useMemo(
      () => (entries === null ? [] : buildTree(entries)),
      [entries],
    );

    // QoL-WP5 — submit the inline new-file input: hand the name + the current tree path
    // set up to the parent (which validates collision, write_files, opens it, refreshes).
    // On success (null) close the input; on a rejection keep it open with the error shown.
    const submitNewFile = () => {
      if (newFileName === null || !onCreateFile) return;
      const existingPaths = (entries ?? []).map((e) => e.path);
      void onCreateFile(newFileName, existingPaths).then((err) => {
        if (err) {
          setNewFileError(err);
        } else {
          setNewFileName(null);
          setNewFileError(null);
        }
      });
    };

    const cancelNewFile = () => {
      setNewFileName(null);
      setNewFileError(null);
    };

    // The inline new-file input row (rendered at the top of the loaded body). Enter submits,
    // Esc cancels; the error (collision / invalid / IPC) shows below until the name changes.
    const newFileInput =
      newFileName !== null ? (
        <div className="file-tree-newfile" data-testid="file-tree-newfile">
          <input
            className="file-tree-newfile-input"
            data-testid="file-tree-newfile-input"
            autoFocus
            value={newFileName}
            placeholder="new-file-name.ext"
            aria-label="New file name"
            onChange={(e) => {
              setNewFileName(e.target.value);
              if (newFileError) setNewFileError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNewFile();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelNewFile();
              }
            }}
            onBlur={cancelNewFile}
          />
          {newFileError && (
            <div
              className="file-tree-newfile-error"
              data-testid="file-tree-newfile-error"
              role="alert"
            >
              {newFileError}
            </div>
          )}
        </div>
      ) : null;

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
        {newFileInput}
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
              gitStatus={gitStatus}
              onOpen={onOpen}
              onDeleteFile={onDeleteFile}
              onToggle={(path) => dispatch({ type: "toggle", path })}
            />
          ))
        )}
      </div>
    );
  },
);

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: ExpandedDirs;
  openPath: string | null;
  /** WP11 — repo-relative path → git status, for the per-row indicator. */
  gitStatus: GitStatusMap;
  onOpen: (path: string) => void;
  /** QoL-WP5 — delete a file row (parent confirms + does the IPC). Undefined → no ✕. */
  onDeleteFile?: (path: string) => void;
  onToggle: (path: string) => void;
}

/** One tree row + (for an expanded dir) its children, rendered recursively. */
function TreeRow({
  node,
  depth,
  expanded,
  openPath,
  gitStatus,
  onOpen,
  onDeleteFile,
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
              gitStatus={gitStatus}
              onOpen={onOpen}
              onDeleteFile={onDeleteFile}
              onToggle={onToggle}
            />
          ))}
      </>
    );
  }

  // WP11 — per-file git-status indicator (Sublime-sidebar style). File rows only
  // (no dir roll-up in v1). A clean/absent path → glyph null → no element rendered.
  const status = gitStatus[node.path];
  const glyph = statusGlyph(status);
  const statusCls = statusClass(status);

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
      {glyph !== null && (
        <span
          className={`file-tree-status ${statusCls}`}
          data-testid="file-tree-status"
          data-status={status}
          aria-label={`git: ${status}`}
          title={`git: ${status}`}
        >
          {glyph}
        </span>
      )}
      {/* QoL-WP5 — per-file delete ✕, shown on row hover (CSS). The parent confirms
          + runs delete_file + tears down any open tab. stopPropagation so the click
          doesn't also open the file. mousedown-preventDefault keeps editor focus. */}
      {onDeleteFile && (
        <button
          type="button"
          className="file-tree-delete"
          data-testid="file-tree-delete"
          aria-label={`Delete ${node.name}`}
          title="Delete file"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFile(node.path);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
