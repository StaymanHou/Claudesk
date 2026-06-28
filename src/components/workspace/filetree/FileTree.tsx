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
  type CSSProperties,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  buildTree,
  countDescendants,
  type TreeEntry,
  type TreeNode,
} from "./buildTree";
import { treeReducer, initialExpanded, type ExpandedDirs } from "./treeState";
import {
  statusClass,
  statusGlyph,
  type GitFileStatus,
  type GitStatusMap,
} from "./gitStatus";
import { dominantStatusByDir } from "./gitRollup";

/** Imperative surface the parent drives the tree through (QoL-WP5 — ⌘N opens the input). */
export interface FileTreeHandle {
  /**
   * Open the inline new-file name input. QoL-WP5b: `dir` is the project-relative
   * directory the new file is created in — `null`/omitted = the workspace root (the
   * header "＋" button + ⌘N target). A per-DIR-row "＋" passes that dir, so the input
   * renders scoped to it (the "create here" model). Opening it also expands the dir.
   */
  beginNewFile: (dir?: string | null) => void;
  /**
   * QoL-WP5b Phase 3 — open the inline NEW-FOLDER name input, scoped to `dir`
   * (`null`/omitted = root). Same inline machinery as `beginNewFile`, but submit routes
   * to the folder-create path (the `create_dir` IPC). Opening it expands the dir.
   */
  beginNewFolder: (dir?: string | null) => void;
}

interface FileTreeProps {
  /** Workspace project dir — the root `fs_tree` walks. */
  projectPath: string;
  /** The currently-open file (project-relative), highlighted in the tree. Null = none. */
  openPath: string | null;
  /** Open a file (project-relative path) into the editor — the shared openFile seam. */
  onOpen: (path: string) => void;
  /**
   * QoL-WP5 — create a new file named `name`. QoL-WP5b adds `dir`: the project-relative
   * directory to create it in (`null` = the workspace root, the WP5 behavior). Returns a
   * Promise resolving to an error string (shown inline) or null on success. The parent
   * owns the collision check + `write_file` IPC + open-into-editor + tree refresh; the
   * tree owns only the inline name input. `existingPaths` (current project-relative tree
   * paths) is passed so the parent can reject a clobber. Optional — older callers/tests
   * omit it.
   */
  onCreateFile?: (
    name: string,
    existingPaths: string[],
    dir: string | null,
  ) => Promise<string | null>;
  /**
   * QoL-WP5b Phase 3 — create a new FOLDER named `name` inside `dir` (`null` = root).
   * Returns a Promise resolving to an error string (shown inline) or null on success.
   * The parent owns validation + the `create_dir` IPC + tree refresh; the tree owns the
   * inline name input (shared with the new-file input via a mode flag). Optional.
   */
  onCreateDir?: (name: string, dir: string | null) => Promise<string | null>;
  /**
   * QoL-WP5 — delete the file at `path` (project-relative). The parent owns the
   * confirm dialog + `delete_file` IPC + open-tab teardown + tree refresh. Optional.
   */
  onDeleteFile?: (path: string) => void;
  /**
   * QoL-WP5b — delete the FOLDER at `path` (project-relative, recursive). `descendantCount`
   * is the number of tree entries strictly under `path` (files + subdirs), computed here
   * where the `fs_tree` entry list lives, so the parent's stronger confirm can show the
   * blast radius. The parent owns the confirm + `trash_path` IPC + prefix-match tab teardown
   * + tree refresh. Optional. Renders a ✕ on dir rows when supplied.
   */
  onDeleteFolder?: (path: string, descendantCount: number) => void;
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
      onCreateDir,
      onDeleteFile,
      onDeleteFolder,
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
    // QoL-WP5b — `newFileDir` is the project-relative dir the input is scoped to (null =
    // workspace root); it positions the input (root → body top; a dir → inline under that
    // dir's row) and is the `dir` arg passed to onCreateFile.
    const [newFileName, setNewFileName] = useState<string | null>(null);
    const [newFileError, setNewFileError] = useState<string | null>(null);
    const [newFileDir, setNewFileDir] = useState<string | null>(null);
    // QoL-WP5b Phase 3 — the inline input is shared between "new file" and "new folder";
    // this flag routes the submit to onCreateFile vs onCreateDir and picks the placeholder.
    const [newFileMode, setNewFileMode] = useState<"file" | "dir">("file");

    // The header / ⌘N (root) and per-dir-row affordances open the inline input via this
    // handle. A dir target also EXPANDS that dir so the inline input is visible under it.
    // `beginNewFile`/`beginNewFolder` differ only in the mode they set.
    useImperativeHandle(
      ref,
      () => ({
        beginNewFile: (dir: string | null = null) => {
          setNewFileError(null);
          setNewFileMode("file");
          setNewFileDir(dir);
          setNewFileName("");
          if (dir !== null) dispatch({ type: "expand", path: dir });
        },
        beginNewFolder: (dir: string | null = null) => {
          setNewFileError(null);
          setNewFileMode("dir");
          setNewFileDir(dir);
          setNewFileName("");
          if (dir !== null) dispatch({ type: "expand", path: dir });
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

    // QoL-WP7 — directory → dominant git status, bubbled up from the leaf statuses.
    // Same key space as the per-file lookup (gitStatus[node.path]), recomputed on the
    // same `gitStatus` source the leaf indicators use — so a folder's roll-up agrees
    // with the indicators on the rows inside it. Empty until the first fetch resolves.
    const rollupByDir = useMemo(() => dominantStatusByDir(gitStatus), [gitStatus]);

    // QoL-WP5 — submit the inline new-file input: hand the name + the current tree path
    // set + the target dir (QoL-WP5b) up to the parent (which validates collision,
    // write_files, opens it, refreshes). On success (null) close the input; on a
    // rejection keep it open with the error shown.
    const submitNewFile = () => {
      if (newFileName === null) return;
      // Route by mode: a folder create goes to onCreateDir, a file to onCreateFile.
      const handler =
        newFileMode === "dir"
          ? onCreateDir
            ? onCreateDir(newFileName, newFileDir)
            : null
          : onCreateFile
            ? onCreateFile(
                newFileName,
                (entries ?? []).map((e) => e.path),
                newFileDir,
              )
            : null;
      if (!handler) return;
      void handler.then((err) => {
        if (err) {
          setNewFileError(err);
        } else {
          setNewFileName(null);
          setNewFileError(null);
          setNewFileDir(null);
        }
      });
    };

    const cancelNewFile = () => {
      setNewFileName(null);
      setNewFileError(null);
      setNewFileDir(null);
    };

    // The inline new-file input row. Rendered at the body top for a root create
    // (newFileDir === null) or inline under a dir's row for a per-dir create
    // (newFileDir === that dir — see TreeRow). Enter submits, Esc cancels; the error
    // (collision / invalid / IPC) shows below until the name changes. Built as a
    // factory so it can be placed in either location with a depth-appropriate indent.
    const renderNewFileInput = (indentStyle?: CSSProperties) =>
      newFileName !== null ? (
        <div
          className="file-tree-newfile"
          data-testid="file-tree-newfile"
          style={indentStyle}
        >
          <input
            className="file-tree-newfile-input"
            data-testid="file-tree-newfile-input"
            autoFocus
            value={newFileName}
            placeholder={
              newFileMode === "dir" ? "new-folder-name" : "new-file-name.ext"
            }
            aria-label={newFileMode === "dir" ? "New folder name" : "New file name"}
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

    // A per-dir-row "＋" opens the new-file input scoped to that dir.
    const beginNewFileInDir = (dir: string) => {
      setNewFileError(null);
      setNewFileMode("file");
      setNewFileDir(dir);
      setNewFileName("");
      dispatch({ type: "expand", path: dir });
    };

    // QoL-WP5b Phase 3 — a per-dir-row "new folder" opener (creates a subfolder in dir).
    const beginNewFolderInDir = (dir: string) => {
      setNewFileError(null);
      setNewFileMode("dir");
      setNewFileDir(dir);
      setNewFileName("");
      dispatch({ type: "expand", path: dir });
    };

    // QoL-WP5b — wrap the parent's onDeleteFolder so it carries the descendant count
    // (computed HERE, where the fs_tree entry list lives). TreeRow sees a bare
    // (path) => void; the parent's stronger confirm gets the blast-radius count.
    const deleteFolderWithCount = onDeleteFolder
      ? (path: string) =>
          onDeleteFolder(path, countDescendants(entries ?? [], path))
      : undefined;

    return (
      <div className="file-tree-body" data-testid="file-tree" role="tree">
        {/* Root-scoped new-file input renders at the body top (newFileDir === null);
            a dir-scoped one renders inline under its dir row (see TreeRow). */}
        {newFileDir === null && renderNewFileInput()}
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
              rollupByDir={rollupByDir}
              onOpen={onOpen}
              onDeleteFile={onDeleteFile}
              onDeleteFolder={deleteFolderWithCount}
              onNewFileInDir={onCreateFile ? beginNewFileInDir : undefined}
              onNewFolderInDir={onCreateDir ? beginNewFolderInDir : undefined}
              newFileDir={newFileDir}
              renderNewFileInput={renderNewFileInput}
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
  /** QoL-WP7 — directory path → dominant rolled-up git status, for the folder-row indicator. */
  rollupByDir: Record<string, GitFileStatus>;
  onOpen: (path: string) => void;
  /** QoL-WP5 — delete a file row (parent confirms + does the IPC). Undefined → no ✕. */
  onDeleteFile?: (path: string) => void;
  /** QoL-WP5b — delete a DIR row recursively (count already resolved by FileTree). Undefined → no dir ✕. */
  onDeleteFolder?: (path: string) => void;
  /** QoL-WP5b — open the new-file input scoped to a DIR row (the per-dir "＋"). Undefined → no "＋". */
  onNewFileInDir?: (dir: string) => void;
  /** QoL-WP5b P3 — open the new-FOLDER input scoped to a DIR row. Undefined → no folder affordance. */
  onNewFolderInDir?: (dir: string) => void;
  /** QoL-WP5b — the dir the new-file input is currently scoped to (null = root). */
  newFileDir: string | null;
  /** QoL-WP5b — render the inline new-file input at a depth-appropriate indent. */
  renderNewFileInput: (indentStyle?: CSSProperties) => ReactNode;
  onToggle: (path: string) => void;
}

/** One tree row + (for an expanded dir) its children, rendered recursively. */
function TreeRow({
  node,
  depth,
  expanded,
  openPath,
  gitStatus,
  rollupByDir,
  onOpen,
  onDeleteFile,
  onDeleteFolder,
  onNewFileInDir,
  onNewFolderInDir,
  newFileDir,
  renderNewFileInput,
  onToggle,
}: TreeRowProps) {
  const isOpen = expanded.has(node.path);
  const isActive = !node.isDir && node.path === openPath;
  // Indent by depth; the chevron/leaf marker keeps dirs and files visually distinct.
  const indent = { paddingLeft: `${depth * 12 + 6}px` };

  if (node.isDir) {
    // QoL-WP7 — the dominant rolled-up status for this dir (undefined → no indicator).
    const rollupStatus = rollupByDir[node.path];
    const rollupGlyph = statusGlyph(rollupStatus);
    const rollupCls = statusClass(rollupStatus);
    return (
      <>
        <div
          className={
            "file-tree-row file-tree-dir" +
            (node.pruned ? " file-tree-dir-pruned" : "")
          }
          data-testid="file-tree-dir"
          data-path={node.path}
          data-pruned={node.pruned || undefined}
          style={indent}
          role="treeitem"
          aria-expanded={isOpen}
          onClick={() => onToggle(node.path)}
        >
          {/* M6 WP6 — a pruned heavy dir (node_modules/target/…) has no walked children,
              so its chevron is inert; render a placeholder glyph in the chevron slot to
              keep alignment but signal "nothing to expand". */}
          <span className="file-tree-chevron">
            {node.pruned ? "·" : isOpen ? "▾" : "▸"}
          </span>
          <span className="file-tree-name">{node.name}</span>
          {/* M6 WP6 — heavy-dir "(not indexed)" marker: distinguishes a pruned dir from a
              genuinely-empty one. Dim, non-interactive; sits right after the name. */}
          {node.pruned && (
            <span
              className="file-tree-pruned-label"
              data-testid="file-tree-pruned-label"
              title="Heavy/generated directory — listed but not indexed"
            >
              (not indexed)
            </span>
          )}
          {/* QoL-WP7 — rolled-up git status for this folder (dominant of its changed
              descendants). Always visible (collapsed AND expanded) so a folder hiding a
              change still reads. Same glyph + color tokens as the per-file indicator;
              margin-left:auto pins it right, ahead of the hover-only ＋/⊞/✕ buttons.
              A clean folder (no changed descendants) → undefined → no element. */}
          {rollupGlyph !== null && (
            <span
              className={`file-tree-status file-tree-dir-status ${rollupCls}`}
              data-testid="file-tree-dir-status"
              data-status={rollupStatus}
              aria-label={`git: ${rollupStatus} (rolled up)`}
              title={`git: ${rollupStatus} (rolled up from contents)`}
            >
              {rollupGlyph}
            </span>
          )}
          {/* QoL-WP5b — per-dir "＋ new file here", hover-revealed like the file ✕.
              stopPropagation so the click opens the input rather than toggling the dir;
              mousedown-preventDefault keeps editor focus until the input mounts.
              M6 WP6 — suppressed on a pruned heavy dir: it isn't indexed, so creating/
              deleting inside it (node_modules/target/…) is nonsensical + a footgun. */}
          {onNewFileInDir && !node.pruned && (
            <button
              type="button"
              className="file-tree-newhere"
              data-testid="file-tree-newhere"
              aria-label={`New file in ${node.name}`}
              title="New file here"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onNewFileInDir(node.path);
              }}
            >
              ＋
            </button>
          )}
          {/* QoL-WP5b P3 — per-dir "new folder" (⊞, monochrome, distinct from the file ＋).
              Hover-revealed; stopPropagation so it doesn't toggle the dir.
              M6 WP6 — suppressed on a pruned heavy dir (same rationale as the file ＋). */}
          {onNewFolderInDir && !node.pruned && (
            <button
              type="button"
              className="file-tree-newhere"
              data-testid="file-tree-newfolder-here"
              aria-label={`New folder in ${node.name}`}
              title="New folder here"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onNewFolderInDir(node.path);
              }}
            >
              ⊞
            </button>
          )}
          {/* QoL-WP5b — per-dir delete ✕ (recursive). Hover-revealed like the file ✕;
              stopPropagation so it doesn't toggle the dir. The parent shows a STRONGER
              confirm (descendant count + "everything inside it") before trashing.
              M6 WP6 — suppressed on a pruned heavy dir: the tree never indexed its
              contents, so a recursive trash from here would delete an un-shown subtree. */}
          {onDeleteFolder && !node.pruned && (
            <button
              type="button"
              className="file-tree-delete"
              data-testid="file-tree-delete-folder"
              aria-label={`Delete folder ${node.name}`}
              title="Delete folder"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.path);
              }}
            >
              ✕
            </button>
          )}
        </div>
        {isOpen && (
          <>
            {/* The dir-scoped new-file input renders as this dir's first child when the
                "＋" targeted it — indented one level deeper than the dir row. */}
            {newFileDir === node.path &&
              renderNewFileInput({ paddingLeft: `${(depth + 1) * 12 + 6}px` })}
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                openPath={openPath}
                gitStatus={gitStatus}
                rollupByDir={rollupByDir}
                onOpen={onOpen}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                onNewFileInDir={onNewFileInDir}
                onNewFolderInDir={onNewFolderInDir}
                newFileDir={newFileDir}
                renderNewFileInput={renderNewFileInput}
                onToggle={onToggle}
              />
            ))}
          </>
        )}
      </>
    );
  }

  // WP11 — per-file git-status indicator (Sublime-sidebar style). A clean/absent path
  // → glyph null → no element rendered. (QoL-WP7 added the dir-row roll-up above; leaf
  // rows keep their own per-file indicator — the roll-up does not suppress it.)
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
