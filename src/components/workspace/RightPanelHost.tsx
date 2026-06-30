// WP5 — RightPanelHost: per-workspace owner of the right half.
//
// Owns the active-panel state and swaps between the Editor (WP2/3), the git Diff
// viewer (WP4), and — once WP9 lands — a second terminal. Replaces the WP4 stopgap
// (an inline `useState` + segmented toggle that lived in Workspace.tsx).
//
// Panel selection is DIRECT-SELECT (not cycling): each panel has a ⌘⇧+mnemonic
// chord (⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal — P3) AND a clickable tab; both route
// through `selectPanel`. The chords fire via a capture-phase document listener (the
// WP1-proven pattern) so they work even while focus is inside a CodeMirror editor.
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): both panels stay
// MOUNTED and are hidden with `display:none` when not front, so each keeps its state
// (the editor's open file + scroll, the diff's selected file) across a panel switch
// AND across a center-stage switch. `visible` gates the active panel's liveness.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from "react";
import { EditorSplit, type EditorSplitHandle } from "./editor/EditorSplit";
import type { XtermPaneHandle } from "./XtermPane";
import { tabSwitchIndex } from "./editor/tabSwitchChord";
import { isCloseTabChord } from "./editor/closeTabChord";
import { newTerminalChord } from "./newTerminalChord";
import { shouldCloseTerminalOnChord } from "./closeTerminalChord";
import { deriveRightSurface } from "./rightSurface";
import { DiffPanel } from "./diff/DiffPanel";
import { TerminalPane } from "./TerminalPane";
import {
  canOpenTerminal,
  closeTerminal,
  initialTerminalList,
  isLastTerminal,
  openTerminal,
  switchTerminal,
  MAX_TERMINALS,
} from "./terminalList";
import { panelForChord, selectPanel, type RightPanel } from "./panelHost";
import { FileFinder } from "./finder/FileFinder";
import { isFinderChord } from "./finder/finderChord";
import { FileTree, type FileTreeHandle } from "./filetree/FileTree";
import { isNewFileChord } from "./filetree/newFileChord";
import {
  proposeNewFilePath,
  proposeNewDirPath,
  collides,
} from "./filetree/newFilePath";
import {
  clampRailWidth,
  loadRailWidth,
  saveRailWidth,
  effectiveRailWidth,
} from "./filetree/railWidth";
import { ProjectSearch } from "./search/ProjectSearch";
import { isSearchChord } from "./search/searchChord";
import {
  matchTargetFor,
  totalMatchCount,
  type SearchQuery,
} from "./search/searchModel";
import type { FileMatches, HighlightTarget } from "./search/searchModel";
import { formatFindResults, type FlatMatch } from "./search/findResultsBuffer";
import { replaceAllSpec, type ReplaceAllChoice } from "./search/replaceConfirm";
import { ConfirmModal } from "./editor/ConfirmModal";
import {
  deleteFileSpec,
  deleteFolderSpec,
  type DeleteFileChoice,
} from "./editor/confirmDialog";
import { labelForPath } from "./editor/PaneTabs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  FS_CHANGE_EVENT,
  appliesToWorkspace,
  type FsChange,
} from "../../state/fsChange";
import { openSublime, openSublimeMerge } from "../../sublime/sublimeLaunch";
import { openFinder } from "../../finder/finderLaunch";
import { SublimeTextIcon } from "../../sublime/icons/SublimeTextIcon";
import { SublimeMergeIcon } from "../../sublime/icons/SublimeMergeIcon";
import { FinderIcon } from "../../finder/icons/FinderIcon";
import { PipIcon } from "../../pip/icons/PipIcon";

interface RightPanelHostProps {
  /** The workspace id — keys the WP9 second-terminal session (one shell per workspace). */
  workspaceId: string;
  /** The workspace's project directory — passed to every panel + the Sublime launch buttons. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab (display:block vs none). */
  visible: boolean;
  /**
   * M6 WP3 Phase 2 — true when the right half is collapsed by the ED▶ split toggle.
   * Applies display:none to `.workspace-right` (the panel + its state stay mounted —
   * collapse is a layout hide, not a teardown). Optional; defaults to not-collapsed.
   */
  collapsed?: boolean;
  /**
   * QoL-WP1 — register a probe that returns this workspace's current unsaved-doc count,
   * so App's workspace-close dirty guard can ask "does closing this discard edits?".
   * Registered on mount, unregistered (probe=null) on unmount. Optional so existing
   * callers/tests that don't wire it still work.
   */
  registerDirtyProbe?: (
    workspaceId: string,
    probe: (() => number) | null,
  ) => void;
  /**
   * M6 WP10 — forwarded to the second-terminal `TerminalPane` so the parent `Workspace`
   * (which owns the focus-scoped zoom router) can drive the shell xterm's `setFontSize`.
   * Mirrors how `Workspace` drives the CC pane via `ccPaneRef`; lives in `Workspace` so
   * both terminal handles sit beside the keydown router. Optional (tests/old callers omit).
   */
  terminalPaneRef?: Ref<XtermPaneHandle>;
}

export function RightPanelHost({
  workspaceId,
  projectPath,
  visible,
  collapsed = false,
  registerDirtyProbe,
  terminalPaneRef,
}: RightPanelHostProps) {
  // WP12 — open files live in PER-PANE TAB STRIPS (EditorSplit owns the pane model;
  // each pane has its own tab strip + open-file set). The open seams (finder, tree,
  // diff "Open", WP7 search) call `openFile`, which drives EditorSplit via this
  // imperative handle → the FOCUSED pane's open-or-activate. `activePath` mirrors the
  // focused pane's active file here only so the FileTree can highlight the open file.
  const editorSplitRef = useRef<EditorSplitHandle>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

  // QoL-WP5 — the FileTree's imperative handle (⌘N → open its inline new-file input)
  // + the file pending a delete-confirm (null = no dialog). The create flow lives in
  // FileTree (the inline input); RightPanelHost owns the collision check + write_file +
  // open + tree refresh, and the delete flow's confirm + delete_file + tab teardown.
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // QoL-WP5b — the FOLDER pending a delete-confirm (null = no dialog). Carries the
  // descendant count (resolved by FileTree from its fs_tree entries) so the stronger
  // confirm can show the blast radius.
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<{
    path: string;
    count: number;
  } | null>(null);

  // QoL-WP1 — register this workspace's unsaved-doc probe with App's close guard. The
  // probe reads the editor's live dirty count at call time (the close handler invokes it
  // on an ×-click). Registered on mount, cleared on unmount so a closed workspace's
  // stale probe never lingers. `registerDirtyProbe` is identity-stable in App (useCallback)
  // so this effect runs once per workspace.
  useEffect(() => {
    if (!registerDirtyProbe) return;
    registerDirtyProbe(
      workspaceId,
      () => editorSplitRef.current?.dirtyDocCount() ?? 0,
    );
    return () => registerDirtyProbe(workspaceId, null);
  }, [workspaceId, registerDirtyProbe]);

  // WP5 Phase 2 (rework) — the tri-state PiP mode (Off/On/Auto), the single user-facing
  // control. The icon button cycles it; the View-menu radio also sets it. Seed from the
  // backend (pip_get_mode) on mount + track the `pip-mode` broadcast (the backend is the
  // source of truth — a menu/other-surface change reflects here too). App-global, so it's
  // fine that this lives per-RightPanelHost: every mounted instance shows the same mode.
  const [pipMode, setPipMode] = useState<"off" | "on" | "auto">("auto");
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void invoke<"off" | "on" | "auto">("pip_get_mode")
      .then((m) => {
        if (!cancelled) setPipMode(m);
      })
      .catch(() => {
        /* default 'auto' stands */
      });
    void listen<string>("pip-mode", (e) => {
      const m = e.payload;
      if (m === "off" || m === "on" || m === "auto") setPipMode(m);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // WP6 — whether the Cmd+P fuzzy file-finder overlay is open.
  const [finderOpen, setFinderOpen] = useState(false);

  // WP7 — the match to scroll-to + highlight in the editor after a search-result
  // open (null for a plain open via the finder/tree/diff). Threaded to EditorPanel.
  const [highlightTarget, setHighlightTarget] =
    useState<HighlightTarget | null>(null);

  // WP7 — project-search QUERY overlay state. `searchOpen` toggles the overlay; the
  // last query lives HERE (lifted) so re-opening ⌘⇧F restores it. RESULTS do NOT live
  // here — they render into the "Find Results" editor tab (the WP12 synthetic-tab seam),
  // which is persistent across re-opens so the operator can click through many matches.
  const [searchOpen, setSearchOpen] = useState(false);

  // WP13 — mirror "an overlay is open" into a ref so the capture-phase keydown listener
  // (registered once on [visible]) can read the CURRENT value without re-registering on
  // every overlay toggle. Used to suppress ⌘W while the finder/search overlay covers the
  // editor (closing a hidden tab would be surprising — cf. the wp6 overlay shadowing nit).
  const overlayOpenRef = useRef(false);
  useEffect(() => {
    overlayOpenRef.current = finderOpen || searchOpen;
  }, [finderOpen, searchOpen]);
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({
    pattern: "",
    regex: false,
    caseSensitive: false,
    wholeWord: false,
  });
  const [searchError, setSearchError] = useState<string | null>(null);

  // WP7 Phase 3 — the replacement text (lifted, persists across re-opens) + the last
  // search's counts (drives the Replace-All gate + the confirm's blast-radius message) +
  // whether the Replace-All confirm dialog is open. Counts are null until a search runs.
  const [replacement, setReplacement] = useState("");
  const [lastCounts, setLastCounts] = useState<{
    matches: number;
    files: number;
  } | null>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  // WP7 — the Find Results tab's current buffer-line → match map. A click in the
  // synthetic tab reports a 1-based buffer line; `findResultsLineMap.current[line - 1]`
  // resolves it to the {file, match} to open. Held in a ref (not state) because the
  // synthetic tab's click callback is registered ONCE (on first addSynthetic) and must
  // read the LATEST map after a re-search without re-registering. null on non-match lines.
  const findResultsLineMap = useRef<(FlatMatch | null)[]>([]);
  // Whether the "find-results" synthetic tab has been created this session (addSynthetic
  // registers the click callback only on first add; later searches just replace content).
  const findResultsAdded = useRef(false);

  // WP10 — whether the FileTree left rail is collapsed (to a strip) to reclaim the
  // editor's horizontal width in the 50/50 split. State lives here so it persists
  // across center-stage switches (the panels-stay-mounted rule). Default expanded.
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // WP11 — bumped on each successful editor save so the FileTree re-fetches the
  // git-status map (a save changes the file's status). Passed down to FileTree;
  // the EditorSplit's onSaved callback increments it. (No live watcher — the refresh
  // is on tree-load + on-save only, per the M2 scope; the Phase-2 notify watcher is
  // the deferred real-time path.)
  const [gitStatusRefreshKey, setGitStatusRefreshKey] = useState(0);

  // QoL-WP0 — bumped on every `fs-change` event for THIS workspace that touched a
  // tree-visible path (an external on-disk create/remove/rename/modify caught by the
  // backend notify watcher). Passed to FileTree, which re-walks `fs_tree` on the bump so
  // the rail reflects on-disk reality without a manual collapse/expand.
  const [fsTreeRefreshKey, setFsTreeRefreshKey] = useState(0);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    // The `cancelled`-flag guard is the StrictMode async-listen lesson: the effect's
    // cleanup can run before the `listen()` promise resolves; without the flag the
    // first subscription's unlisten is never captured → a double listener.
    void listen<FsChange>(FS_CHANGE_EVENT, (event) => {
      // Only act on changes for THIS workspace (the watcher tags each event with its
      // workspace_id). Other workspaces' events are ignored here.
      if (!appliesToWorkspace(event.payload, workspaceId)) return;
      const { paths, git_meta } = event.payload;
      // WP9 — two independent signals from one event:
      //  - a tree-visible path changed → re-walk the tree AND re-fetch git status.
      //  - git_meta (a `.git/` index/HEAD/refs write: `git add`/commit/stash/checkout
      //    that flips status with no worktree edit) → re-fetch git status ONLY, never a
      //    tree re-walk (the `.git/` exclusion that guards against a re-walk storm stays;
      //    we route the meta signal past it instead of suppressing it). This fixes the
      //    stale-badge-until-remount bug: a pure `git add` now refreshes the indicator.
      if (paths.length > 0) setFsTreeRefreshKey((k) => k + 1);
      if (paths.length > 0 || git_meta) setGitStatusRefreshKey((k) => k + 1);
      // QoL-WP0 Phase 3 — also live-reload any OPEN editor doc whose file changed on
      // disk (reuse via the same single per-workspace listener instead of a second one
      // in EditorSplit). `checkDiskForPaths` re-stats only the changed paths that are
      // open, then reload-when-clean / conflict-when-dirty via the existing seam. Only
      // real `paths` are relevant here — a git-meta-only event has none.
      if (paths.length > 0) editorSplitRef.current?.checkDiskForPaths(paths);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [workspaceId]);

  // WP11 Part C — the user-adjustable file-tree rail width (drag handle below).
  // Seeded from localStorage (default 299, the Part-A CSS value); applied as an
  // inline style overriding the CSS default. State lives here so it persists across
  // center-stage switches (panels-stay-mounted). The drag's start x + start width are
  // held in a ref so the document mousemove handler reads them without re-binding.
  const [railWidth, setRailWidth] = useState<number>(loadRailWidth);
  const railDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  // M6 WP3 (back-loop fix) — track the live right-panel width so the APPLIED rail
  // width can be capped to a fraction of it. At the 3:1 split the right panel is
  // ~¼ of the workspace (~320px); the stored ~299px rail would otherwise crowd the
  // editor into an unusable sliver. We cap the applied width (via effectiveRailWidth)
  // WITHOUT mutating the stored/dragged `railWidth`, so widening the panel (2:2/1:3
  // or a window resize) restores exactly the user's chosen width. A ResizeObserver
  // on `.workspace-right` keeps `panelWidth` current across split-ratio changes,
  // window resizes, and center-stage switches.
  const rightHostRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number>(0);
  useEffect(() => {
    const host = rightHostRef.current;
    if (!host) return;
    setPanelWidth(host.getBoundingClientRect().width);
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setPanelWidth(e.contentRect.width);
    });
    obs.observe(host);
    return () => obs.disconnect();
  }, []);
  const appliedRailWidth = effectiveRailWidth(railWidth, panelWidth);

  // Begin a rail-resize drag: record the start point + width, then track the pointer
  // on the document (so the drag continues even if the cursor leaves the thin handle)
  // until mouseup, which persists the final width. Clamped live so the rail can't be
  // dragged past its bounds.
  const onRailResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    railDragRef.current = { startX: e.clientX, startWidth: railWidth };
    const onMove = (ev: MouseEvent) => {
      const drag = railDragRef.current;
      if (!drag) return;
      setRailWidth(
        clampRailWidth(drag.startWidth + (ev.clientX - drag.startX)),
      );
    };
    const onUp = () => {
      railDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Persist the final width (read from state via the functional updater so we
      // store the latest clamped value, not a stale closure capture).
      setRailWidth((w) => {
        saveRailWidth(w);
        return w;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Which right-half panel is front. Direct-select via tabs + ⌘⇧ chords. Both panels
  // stay mounted (display:none toggle) so each keeps its state across switches.
  const [panel, setPanel] = useState<RightPanel>("editor");

  // M6 WP11 — the right-panel TERMINAL LIST (N terminals per workspace). Seeded with one
  // terminal (`-term-0`); open/switch/close drive the pure terminalList reducer ops. All
  // entries stay MOUNTED (display:none for the non-active one) so each shell + scrollback
  // survives switching terminals AND switching the right panel away. Closing a terminal
  // removes its entry → its TerminalPane unmounts → XtermPane reaps the PTY (cc_kill).
  // Ephemeral (plan decision 3): a fresh workspace always seeds one terminal; nothing is
  // persisted across restart. `workspaceId` is identity-stable, so this seeds once.
  const [terminals, setTerminals] = useState(() =>
    initialTerminalList(workspaceId),
  );
  // M6 WP11 — mirror the terminal list into a ref so the capture-phase keydown listener
  // (registered once on [visible]) can read the CURRENT list (for the scoped-⌘W can-close
  // decision) without re-registering on every list change. Same pattern as overlayOpenRef.
  const terminalsRef = useRef(terminals);
  useEffect(() => {
    terminalsRef.current = terminals;
  }, [terminals]);
  // Open a new terminal (＋ / ⌘T). No-op at MAX_TERMINALS (the reducer guards; the ＋ is
  // also disabled). Flips the panel to terminal so the new one is visible + focusable.
  // `useCallback`-stable (deps: only `workspaceId`, itself identity-stable) so BOTH the ＋
  // button AND the ⌘T keydown branch share this ONE impl — the keydown listener can list it
  // as a dep without re-registering on every render (resolves the WP11 HANDLER-BRANCH-
  // DUPLICATION finding: the open/close bodies were previously re-inlined in the keydown
  // branches to dodge non-stable deps, which duplicated the logic across the file).
  const addTerminal = useCallback(() => {
    setPanel((cur) => selectPanel(cur, "terminal"));
    setTerminals((s) => openTerminal(s, workspaceId));
  }, [workspaceId]);
  // Close a terminal (its ✕ / scoped ⌘W). Disallowed for the last one (the reducer + the UI
  // both guard). Unmounting its pane reaps the shell; the reducer reactivates a sibling.
  // `useCallback`-stable (no deps) — shared by the ✕ button and the scoped-⌘W keydown branch.
  const closeTerminalById = useCallback(
    (id: string) => setTerminals((s) => closeTerminal(s, id)),
    [],
  );
  // Switch the active/front terminal (a tab click).
  const switchTerminalTo = (id: string) =>
    setTerminals((s) => switchTerminal(s, id));

  // Open a file into the editor: add-or-activate its TAB (WP12) + flip the editor
  // panel to the front. Shared by the Cmd+P finder, the file tree, the diff panel's
  // "Open", and (WP7) a project-search result.
  //
  // WP7 — the optional `target` carries a search match's line + char range; when
  // present the active tab's EditorPanel scrolls to + selects it after the file loads.
  // The finder/tree/diff callers pass no target (backward-compatible — a plain open
  // clears any prior highlight so a subsequent plain open doesn't re-scroll). Per-tab
  // panes (WP3c reused per tab) live inside each EditorPanel; opening an already-open
  // file activates its existing tab (no duplicate) — this also realizes the deferred
  // SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT (each tab is its own file).
  const openFile = (path: string, target: HighlightTarget | null = null) => {
    setHighlightTarget(target);
    setPanel((cur) => selectPanel(cur, "editor"));
    editorSplitRef.current?.openFile(path);
  };

  // QoL-WP5 — create a new file (called by the FileTree inline input). Validate the
  // name (proposeNewFilePath: single segment, no separator/escape), reject a collision
  // (don't clobber an existing file), then write_file an EMPTY buffer, open it into the
  // focused pane, and bump fsTreeRefreshKey for an immediate tree refresh (the WP0
  // watcher would also catch it, but the explicit bump avoids debounce lag). Returns an
  // error string for the input to show inline, or null on success. IPC errors surface
  // (never swallowed — the WP6 lesson). QoL-WP5b: `dir` is the project-relative dir to
  // create in (null = the workspace root, the WP5 behavior); the backend's existing-parent
  // `resolve_within` guard already accepts any subpath under an existing dir — no nested
  // (`mkdir -p`) create, matching the no-separator name rule.
  // QoL-WP5b P3: `allowNested` — a `/`-bearing name (`sub/x.txt`) creates the intermediate
  // dirs via `create_dir` (mkdir -p) before the write, so the user can create a file in a
  // not-yet-existing folder. A single-segment name keeps the Phase-1 behavior.
  const createFile = (
    name: string,
    existingPaths: string[],
    dir: string | null,
  ): Promise<string | null> => {
    const proposed = proposeNewFilePath(dir, name, /* allowNested */ true);
    if (!proposed.ok) return Promise.resolve(proposed.reason);
    if (collides(proposed.path, existingPaths)) {
      return Promise.resolve(`${proposed.path} already exists.`);
    }
    // mkdir -p the file's parent if the name was nested (a no-op for a root/existing-dir
    // file — create_dir is idempotent). Then write the empty file + open it.
    const slash = proposed.path.lastIndexOf("/");
    const parent = slash === -1 ? null : proposed.path.slice(0, slash);
    const ensureParent = parent
      ? invoke<void>("create_dir", { root: projectPath, path: parent })
      : Promise.resolve();
    return ensureParent
      .then(() =>
        invoke<void>("write_file", {
          root: projectPath,
          path: proposed.path,
          contents: "",
        }),
      )
      .then(() => {
        openFile(proposed.path);
        setFsTreeRefreshKey((k) => k + 1);
        return null;
      })
      .catch((e: unknown) => String(e));
  };

  // QoL-WP5b P3 — create a new FOLDER (called by the FileTree inline input in folder mode).
  // Validate the path (proposeNewDirPath), then create_dir (mkdir -p, idempotent) and bump
  // the tree refresh so the folder appears. Returns an inline error string or null. No
  // openFile (a folder isn't an editor doc); no collision guard (create_dir is idempotent).
  const createDir = (
    name: string,
    dir: string | null,
  ): Promise<string | null> => {
    const proposed = proposeNewDirPath(dir, name);
    if (!proposed.ok) return Promise.resolve(proposed.reason);
    return invoke<void>("create_dir", {
      root: projectPath,
      path: proposed.path,
    })
      .then(() => {
        setFsTreeRefreshKey((k) => k + 1);
        return null;
      })
      .catch((e: unknown) => String(e));
  };

  // QoL-WP5 — a delete ✕ was clicked in the FileTree: open the confirm (the actual
  // delete happens on confirm in onDeleteConfirm). Held as the pending path.
  const requestDeleteFile = (path: string) => setPendingDelete(path);

  // The delete-confirm resolved. On "delete": delete_file, then close any open tab(s)
  // for it across all panes (the file is gone) and bump the tree refresh. On "cancel":
  // change nothing. A failed delete surfaces — re-open the tree's error path is overkill
  // for a single op, so we just log via the rejected invoke (no silent swallow; a future
  // toast could show it). The confirm covered the dirty-tab data-loss case.
  const onDeleteConfirm = (choice: DeleteFileChoice) => {
    const path = pendingDelete;
    setPendingDelete(null);
    if (choice !== "delete" || !path) return;
    void invoke<void>("delete_file", { root: projectPath, path })
      .then(() => {
        editorSplitRef.current?.closeTabsForPath(path);
        setFsTreeRefreshKey((k) => k + 1);
      })
      .catch((e: unknown) => {
        // Surface the failure rather than swallow it; the tree stays as-is.
        console.error(`delete_file failed for ${path}:`, e);
      });
  };

  // QoL-WP5b — a folder delete ✕ was clicked: open the stronger confirm (the actual
  // recursive trash happens on confirm). FileTree resolves the descendant count.
  const requestDeleteFolder = (path: string, count: number) =>
    setPendingDeleteFolder({ path, count });

  // The folder-delete confirm resolved. On "delete": trash_path (recoverable — moves the
  // whole subtree to the macOS Trash, NOT a hard remove_dir_all), then close every open
  // tab UNDER the deleted dir across all panes (prefix match) and bump the tree refresh.
  // On "cancel": change nothing. A failed trash surfaces (console, like the single-file
  // delete — a future toast could show it); the tree stays as-is.
  const onDeleteFolderConfirm = (choice: DeleteFileChoice) => {
    const target = pendingDeleteFolder;
    setPendingDeleteFolder(null);
    if (choice !== "delete" || !target) return;
    void invoke<void>("trash_path", { root: projectPath, path: target.path })
      .then(() => {
        editorSplitRef.current?.closeTabsUnderPath(target.path);
        setFsTreeRefreshKey((k) => k + 1);
      })
      .catch((e: unknown) => {
        console.error(`trash_path failed for ${target.path}:`, e);
      });
  };

  // WP7 — a search returned results: render them into the "Find Results" synthetic tab
  // (the WP12 seam). The buffer text + the click-line→match map come from the pure
  // `formatFindResults`. On the FIRST search we create the tab and register a click
  // callback that resolves the clicked buffer line against `findResultsLineMap.current`
  // (the ref so later searches don't need to re-register); subsequent searches just
  // replace the tab's content + the map. Opening a match drives the same open-at-match
  // highlight path as the finder/tree (`openFile(path, target)`). The query overlay
  // STAYS open after a search (WP7 Phase 3) so Replace All is reachable; Esc closes it.
  const handleSearchResults = (results: FileMatches[], query: SearchQuery) => {
    const { text, lineMap, highlights } = formatFindResults(results, query);
    findResultsLineMap.current = lineMap;
    setPanel((cur) => selectPanel(cur, "editor"));
    if (!findResultsAdded.current) {
      editorSplitRef.current?.addSynthetic(
        "find-results",
        "Find Results",
        (bufferLine) => {
          const hit = findResultsLineMap.current[bufferLine - 1];
          if (hit) openFile(hit.file, matchTargetFor(hit.match));
        },
      );
      findResultsAdded.current = true;
    }
    // Content + the matched-text highlights together — the tab marks each hit like
    // Sublime's Find Results (WP7 verify-human fix).
    editorSplitRef.current?.setSyntheticContent(
      "find-results",
      text,
      highlights,
    );
    // Record the counts so Replace All can gate on "a search found matches" and the
    // confirm can show the blast radius. (WP7 Phase 3.)
    setLastCounts({ matches: totalMatchCount(results), files: results.length });
    // KEEP the overlay open (WP7 Phase 3): the operator may now Replace All on these
    // results, which lives in the overlay. The results are in the tab behind it; Esc /
    // backdrop closes the overlay to read them full-screen. (Supersedes the Phase-2
    // close-on-search detail, which predated the in-overlay Replace control.)
  };

  // WP7 Phase 3 — "Replace All" pressed: open the confirm (blast-radius counts). The
  // confirm + the project_replace call live here so the overlay stays a thin input.
  const onReplaceAll = () => {
    if (!lastCounts || lastCounts.matches === 0) return; // nothing to replace
    setReplaceConfirmOpen(true);
  };

  // The confirm resolved: on "replace", run the backend project_replace, then re-run the
  // search to refresh the Find Results tab (replaced matches drop out). On "cancel",
  // close the dialog and change nothing. A write/IPC failure surfaces in the overlay's
  // inline error row (never silently swallowed — the WP6 IPC-error lesson).
  //
  // TWO WALKS BY DESIGN: project_replace returns a {files_changed, matches_replaced}
  // summary, but we deliberately DON'T use it to mutate the tab — we re-run the SEARCH,
  // because the tab shows the post-replace *result set* (which rows remain), not just a
  // count. The re-search is the refresh mechanism, and it is best-effort: for this
  // single-user local app a file changing on disk between the replace walk and the
  // re-search walk is not guarded against (acceptable; a live watcher is a deferred
  // backlog item). Surfacing the summary count as a toast would be new UX — intentionally
  // out of scope for v1 (see SURFACE-2026-06-21-QUALITY-WP7-REPLACE-THEN-RESEARCH-TWO-WALKS).
  const onReplaceConfirm = (choice: ReplaceAllChoice) => {
    setReplaceConfirmOpen(false);
    if (choice !== "replace") return;
    setSearchError(null);
    invoke<{ files_changed: number; matches_replaced: number }>(
      "project_replace",
      {
        root: projectPath,
        query: {
          pattern: searchQuery.pattern,
          regex: searchQuery.regex,
          case_sensitive: searchQuery.caseSensitive,
          whole_word: searchQuery.wholeWord,
        },
        replacement,
      },
    )
      .then(() =>
        // Re-run the search so the tab reflects the post-replace state (the just-replaced
        // matches are gone; any remaining ones stay). Reuses the same result→tab path.
        invoke<FileMatches[]>("project_search", {
          root: projectPath,
          query: {
            pattern: searchQuery.pattern,
            regex: searchQuery.regex,
            case_sensitive: searchQuery.caseSensitive,
            whole_word: searchQuery.wholeWord,
          },
        }),
      )
      .then((r) => handleSearchResults(r, searchQuery))
      .catch((e: unknown) => setSearchError(String(e)));
  };

  // P3 — panel-select hotkeys (⌘⇧E/⌘⇧D/⌘⇧T) AND the ⌘P file-finder, registered as a
  // CAPTURE-phase document listener (WP1 finding: fires before CM6's contentEditable
  // handler, so it works while focus is inside the editor — no per-editor keymap
  // wiring). Gated on `visible` so only the focused workspace's host reacts. ⌘P
  // (bare, no Shift) is distinct from ⌘⇧E/D/T (panelForChord requires Shift), so the
  // two predicates never both fire — see finder/finderChord.ts.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFinderChord(e)) {
        e.preventDefault();
        setFinderOpen((open) => !open); // toggle: re-press closes
        return;
      }
      if (isSearchChord(e)) {
        e.preventDefault();
        setSearchOpen((open) => !open); // WP7 — toggle the Find-in-Files overlay
        return;
      }
      // QoL-WP5 — ⌘N opens the FileTree's inline new-file input (bare ⌘N, disjoint
      // from WP6's ⌘⇧N new-workspace + the ⌘P finder). preventDefault pre-empts any
      // OS "new" binding. Flips to the editor panel so the rail (+ its input) is visible.
      if (isNewFileChord(e)) {
        e.preventDefault();
        setPanel((cur) => selectPanel(cur, "editor"));
        fileTreeRef.current?.beginNewFile();
        return;
      }
      // M6 WP11 — ⌘T opens a NEW terminal (keyboard parity for the ＋ button). Bare ⌘T,
      // disjoint from ⌘⇧T (panel-select, requires Shift). addTerminal flips to the terminal
      // panel + makes the new one active; it's a no-op at the cap (openTerminal guards).
      // preventDefault pre-empts any OS "new tab" ⌘T.
      if (newTerminalChord(e)) {
        e.preventDefault();
        // Shared with the ＋ button (one impl). `addTerminal` is useCallback-stable, so
        // listing it in this listener's deps causes no re-registration churn.
        addTerminal();
        return;
      }
      // WP12 — ⌘1..⌘9 activates the Nth open-file tab (n past the end → last tab).
      // Bare ⌘+digit, disjoint from every ⌘⇧ chord and the bare-⌘P finder.
      const tabN = tabSwitchIndex(e);
      if (tabN !== null) {
        e.preventDefault();
        editorSplitRef.current?.activateIndex(tabN);
        return;
      }
      // M6 WP11 — SCOPED ⌘W: when a RIGHT-PANEL TERMINAL holds focus, ⌘W closes THAT
      // terminal instead of an editor tab. The term-pane's elements are focusable only
      // when the terminal panel is front (the editor/diff slots are display:none), so
      // "focus inside a term-pane" == "the terminal is the focused surface". Gated on
      // NOT-the-last-terminal (disallow-last → ⌘W is inert on the sole terminal). This
      // branch is BEFORE the editor close-tab branch so a focused terminal's ⌘W never
      // also closes an editor tab; when it routes, we swallow the event. Closing the
      // ACTIVE terminal is correct: only the active terminal is visible/focusable, so the
      // focused terminal IS terminals.activeId.
      if (
        shouldCloseTerminalOnChord({
          isCloseChord: isCloseTabChord(e),
          terminalFocused:
            deriveRightSurface(document.activeElement) === "terminal",
          // Read the CURRENT list via the ref (the listener is registered on [visible],
          // so a captured `terminals` would be stale).
          canClose: !isLastTerminal(terminalsRef.current),
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
        // Shared with the ✕ button (one impl). Close the ACTIVE terminal (the only
        // visible/focusable one, read via the ref above). `closeTerminalById` is
        // useCallback-stable. closeTerminal no-ops on the last.
        closeTerminalById(terminalsRef.current.activeId);
        return;
      }
      // WP13 — ⌘W closes the focused pane's active tab (via its dirty-guard; inert when
      // no tab is open — Sublime parity). Suppressed while the finder/search overlay is
      // open so ⌘W doesn't silently close a tab hidden behind it (cf. the wp6 overlay
      // shadowing MINOR). preventDefault pre-empts the OS "close window" ⌘W.
      if (isCloseTabChord(e)) {
        if (overlayOpenRef.current) return;
        e.preventDefault();
        editorSplitRef.current?.closeActiveTab();
        return;
      }
      const target = panelForChord(e);
      if (target === null) return;
      e.preventDefault();
      setPanel((cur) => selectPanel(cur, target));
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // All deps are identity-stable, so listing them never causes real re-registration
    // churn — included to satisfy exhaustive-deps honestly rather than suppress.
    // `workspaceId` keys the workspace (stable for a mounted host); `addTerminal` /
    // `closeTerminalById` are useCallback-memoized (the shared open/close impls). Everything
    // else read inside is a stable setter/ref.
  }, [visible, workspaceId, addTerminal, closeTerminalById]);

  // WP11 Phase 5 — the FileTree rail. Lives INSIDE the editor slot (operator request
  // at review-quality 2026-06-21) so the Editor/Diff/Terminal tab row is the OUTER
  // full-width layer and the tree belongs to the editor panel, not the whole column.
  // The rail is the editor's nav affordance — it is only rendered in the editor slot,
  // so Diff + Terminal get full width structurally (superseding Phase 1's CSS-hide).
  // Kept MOUNTED with the always-mounted editor slot, so the expanded-dir Set + the
  // fs_tree walk survive an Editor→Diff→Editor round-trip.
  const fileTreeRail = (
    <div
      className={`file-tree-rail${treeCollapsed ? " is-collapsed" : ""}`}
      data-testid="file-tree-rail"
      // WP11 Part C — the dragged width overrides the CSS default. Not applied when
      // collapsed (the .is-collapsed rule pins width:auto for the strip).
      // M6 WP3 — apply the panel-fraction-capped width (effectiveRailWidth), not the
      // raw stored width, so the editor stays usable at the narrow 3:1 right panel.
      style={treeCollapsed ? undefined : { width: `${appliedRailWidth}px` }}
    >
      {/* QoL-WP5 — rail header: the collapse toggle + a "+ new file" action. The
          header is a flex row so the + sits at the trailing edge; the + is hidden
          when collapsed (the strip has no room + create needs the visible tree). */}
      <div className="file-tree-header" data-testid="file-tree-header">
        <button
          type="button"
          className="file-tree-collapse"
          data-testid="file-tree-collapse"
          aria-label={treeCollapsed ? "Show file tree" : "Hide file tree"}
          aria-expanded={!treeCollapsed}
          title={treeCollapsed ? "Show file tree" : "Hide file tree"}
          onClick={() => setTreeCollapsed((c) => !c)}
        >
          {treeCollapsed ? "›" : "‹ Files"}
        </button>
        {!treeCollapsed && (
          <button
            type="button"
            className="file-tree-newfile-btn"
            data-testid="file-tree-newfile-btn"
            aria-label="New file (⌘N)"
            title="New file (⌘N)"
            onClick={() => fileTreeRef.current?.beginNewFile()}
          >
            ＋
          </button>
        )}
        {/* QoL-WP5b P3 — header "new folder" (⊞), creates at the workspace root. */}
        {!treeCollapsed && (
          <button
            type="button"
            className="file-tree-newfile-btn"
            data-testid="file-tree-newfolder-btn"
            aria-label="New folder"
            title="New folder"
            onClick={() => fileTreeRef.current?.beginNewFolder()}
          >
            ⊞
          </button>
        )}
      </div>
      {/* The tree stays MOUNTED even when collapsed — CSS (.is-collapsed
          .file-tree-body { display:none }) hides the body in the strip. Keeping it
          mounted preserves the expanded-dir Set AND avoids re-issuing the fs_tree
          walk on every collapse→expand cycle. */}
      <FileTree
        ref={fileTreeRef}
        projectPath={projectPath}
        openPath={activePath}
        onOpen={openFile}
        onCreateFile={createFile}
        onCreateDir={createDir}
        onDeleteFile={requestDeleteFile}
        onDeleteFolder={requestDeleteFolder}
        gitStatusRefreshKey={gitStatusRefreshKey}
        fsTreeRefreshKey={fsTreeRefreshKey}
      />
      {/* WP11 Part C — drag handle on the rail's right edge. mousedown begins a
          document-tracked drag (onRailResizeStart); CSS hides it when the rail is
          collapsed so it can't be grabbed in that state. */}
      <div
        className="file-tree-resize"
        data-testid="file-tree-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree"
        onMouseDown={onRailResizeStart}
      />
    </div>
  );

  return (
    <div
      className="workspace-right"
      ref={rightHostRef}
      // M6 WP3 — the ED▶ collapse hides the right half (display:none). The panel +
      // all its state stay mounted (a layout hide, not a teardown), consistent with
      // the all-workspaces-stay-mounted invariant.
      style={collapsed ? { display: "none" } : undefined}
    >
      {/* WP11 Phase 5 — the right half is a single vertical column: the
          Editor/Diff/Terminal tab row on top (full width), then the panel slots. The
          FileTree rail is no longer a peer here — it lives INSIDE the editor slot
          below, so the tab row spans full width and the tree is editor-scoped. */}
      <div className="right-panel-main">
        {/* Clickable panel tabs — direct-select, coexisting with the ⌘⇧ chords. */}
        <div
          className="right-panel-toggle"
          role="tablist"
          aria-label="right panel"
        >
          <button
            type="button"
            role="tab"
            id={`paneltab-editor-${workspaceId}`}
            aria-selected={panel === "editor"}
            aria-controls={`panel-editor-${workspaceId}`}
            className={`panel-tab${panel === "editor" ? " is-active" : ""}`}
            data-testid="panel-tab-editor"
            onClick={() => setPanel((cur) => selectPanel(cur, "editor"))}
            title="Editor (⌘⇧E)"
          >
            Editor
          </button>
          <button
            type="button"
            role="tab"
            id={`paneltab-diff-${workspaceId}`}
            aria-selected={panel === "diff"}
            aria-controls={`panel-diff-${workspaceId}`}
            className={`panel-tab${panel === "diff" ? " is-active" : ""}`}
            data-testid="panel-tab-diff"
            onClick={() => setPanel((cur) => selectPanel(cur, "diff"))}
            title="Diff (⌘⇧D)"
          >
            Diff
          </button>
          <button
            type="button"
            role="tab"
            id={`paneltab-terminal-${workspaceId}`}
            aria-selected={panel === "terminal"}
            aria-controls={`panel-terminal-${workspaceId}`}
            className={`panel-tab${panel === "terminal" ? " is-active" : ""}`}
            data-testid="panel-tab-terminal"
            onClick={() => setPanel((cur) => selectPanel(cur, "terminal"))}
            title="Terminal (⌘⇧T)"
          >
            Terminal
          </button>

          {/* WP8 — external-app launchers, right-aligned past a divider so they
                read as ACTIONS distinct from the selectable Editor/Diff tabs.
                Both KEPT permanently (the Sublime Text pop is no longer removed);
                only the old ⌘⇧O Text hotkey was dropped — these buttons are the
                sole affordance. Each calls its backend command with this host's
                projectPath (always the focused tab — a backgrounded host is
                display:none and unclickable). */}
          <span className="panel-launch-group" aria-hidden="true" />
          <button
            type="button"
            className="panel-launch"
            data-testid="sublime-open"
            onClick={() => void openSublime(projectPath)}
            aria-label="Open in Sublime Text"
            title="Open in Sublime Text"
          >
            <SublimeTextIcon />
          </button>
          <button
            type="button"
            className="panel-launch"
            data-testid="smerge-open"
            onClick={() => void openSublimeMerge(projectPath)}
            aria-label="Open in Sublime Merge"
            title="Open in Sublime Merge"
          >
            <SublimeMergeIcon />
          </button>
          <button
            type="button"
            className="panel-launch"
            data-testid="finder-open"
            onClick={() => void openFinder(projectPath)}
            aria-label="Reveal in Finder"
            title="Reveal in Finder"
          >
            <FinderIcon />
          </button>
          {/* M5 WP5 (rework) — the tri-state PiP MODE control. Cycles Off→On→Auto→Off; the
                label shows the current mode so the state is legible (the dead-end fix: the
                regime is explicit, not inferred). Off = hidden; On = shown + pinned; Auto =
                summon-when-away. The View-menu radio is the other affordance. Display-only:
                the PiP mirrors status, it never controls workspaces. */}
          <button
            type="button"
            className="panel-launch"
            data-testid="pip-toggle"
            data-pip-mode={pipMode}
            onClick={() => {
              const next =
                pipMode === "off" ? "on" : pipMode === "on" ? "auto" : "off";
              setPipMode(next); // optimistic; the `pip-mode` broadcast confirms
              void invoke("pip_set_mode", { mode: next }).catch((e) => {
                console.error("[claudesk] pip_set_mode failed:", e);
              });
            }}
            aria-label={`Picture-in-Picture: ${pipMode} (click to change)`}
            title={`PiP: ${pipMode === "off" ? "Off" : pipMode === "on" ? "On (pinned)" : "Auto (summon when away)"} — click to cycle`}
          >
            <PipIcon />
            <span className="pip-mode-tag" aria-hidden="true">
              {pipMode === "off" ? "○" : pipMode === "on" ? "●" : "◐"}
            </span>
          </button>
        </div>

        {/* Editor split (WP12) — kept mounted; hidden (not unmounted) when Diff is
              front so every pane's tabs + buffers + scroll survive the switch.
              EditorSplit owns the pane model; each pane has its own tab strip +
              open-file set (PaneTabs). Files open via the Cmd+P finder (WP6), the
              WP10 file tree, the diff "Open", or (WP7) a search result — all through
              `openFile` → the focused pane. */}
        {/* WP11 Phase 5 — the editor slot is a horizontal flex: the FileTree rail
              (left) + the EditorSplit. The rail lives HERE (not as a panel-column
              peer) so it is structurally editor-only — Diff + Terminal slots below
              have no rail and get full width. */}
        <div
          className="right-panel-slot right-panel-slot--editor"
          id={`panel-editor-${workspaceId}`}
          role="tabpanel"
          aria-labelledby={`paneltab-editor-${workspaceId}`}
          style={{ display: panel === "editor" ? "flex" : "none" }}
        >
          {fileTreeRail}
          <EditorSplit
            ref={editorSplitRef}
            projectPath={projectPath}
            active={visible && panel === "editor"}
            highlightTarget={highlightTarget}
            onActivePathChange={setActivePath}
            // WP11 — a save changes the file's git status; bump the key so the
            // FileTree re-fetches its status map and refreshes the row indicators.
            onSaved={() => setGitStatusRefreshKey((k) => k + 1)}
          />
        </div>

        {/* Diff panel — kept mounted; the selected-file diff survives the switch.
              `active` is gated on BOTH workspace visibility AND the diff panel being
              front so a backgrounded panel doesn't auto-refresh its file list. */}
        <div
          className="right-panel-slot"
          id={`panel-diff-${workspaceId}`}
          role="tabpanel"
          aria-labelledby={`paneltab-diff-${workspaceId}`}
          style={{ display: panel === "diff" ? "flex" : "none" }}
        >
          <DiffPanel
            projectPath={projectPath}
            active={visible && panel === "diff"}
            // "Open" always opens the live working-tree file (by design — see
            // DiffPanel onOpenInEditor doc). Same seam as the finder + tree.
            onOpenInEditor={openFile}
          />
        </div>

        {/* WP9/M6-WP11 — the TERMINAL panel: now a LIST of login shells. A sub-tab row
              (●1 │ ●2 │ ＋) on top; one terminal visible at a time, the rest kept MOUNTED
              (display:none) so every shell session + scrollback survives switching
              terminals, panels, and center-stage. Closing a tab unmounts its pane →
              XtermPane reaps the PTY. The slot is always mounted (the SURFACE-2026-06-20
              guard: selectPanel can return "terminal", so the slot must never be blank). */}
        <div
          className="right-panel-slot right-panel-slot--terminal"
          id={`panel-terminal-${workspaceId}`}
          role="tabpanel"
          aria-labelledby={`paneltab-terminal-${workspaceId}`}
          style={{ display: panel === "terminal" ? "flex" : "none" }}
        >
          {/* Sub-tab row — always shown (plan decision 3): even one terminal gets a
                one-tab row so the ＋ has a stable home. Mirrors the panel-tab idiom. */}
          <div
            className="term-tab-row"
            role="tablist"
            aria-label="terminals"
            data-testid="term-tab-row"
          >
            {terminals.entries.map((t, i) => (
              <div
                key={t.id}
                role="tab"
                id={`termtab-${t.id}`}
                aria-selected={t.id === terminals.activeId}
                aria-controls={`termpane-${t.id}`}
                className={`term-tab${t.id === terminals.activeId ? " is-active" : ""}`}
                data-testid={`term-tab-${t.id}`}
                onClick={() => switchTerminalTo(t.id)}
                title={`Terminal ${i + 1}`}
              >
                <span className="term-tab-label">{`●${i + 1}`}</span>
                {/* No ✕ on the sole tab — closing the last terminal is disallowed
                      (the panel always keeps ≥1 shell). */}
                {!isLastTerminal(terminals) && (
                  <button
                    type="button"
                    className="term-tab-close"
                    data-testid={`term-tab-close-${t.id}`}
                    aria-label={`Close terminal ${i + 1}`}
                    title={`Close terminal ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation(); // don't also switch to the tab we're closing
                      closeTerminalById(t.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="term-tab-add"
              data-testid="term-tab-add"
              aria-label="New terminal (⌘T)"
              title={
                canOpenTerminal(terminals)
                  ? "New terminal (⌘T)"
                  : `Maximum ${MAX_TERMINALS} terminals`
              }
              disabled={!canOpenTerminal(terminals)}
              onClick={addTerminal}
            >
              ＋
            </button>
          </div>
          {/* The terminal panes — one per entry, all MOUNTED, only the active one shown.
                M6 WP11 Phase 3 — the forwarded terminalPaneRef binds to the ACTIVE
                terminal's pane (the others get `undefined`). This IS the zoom-follows-
                focused mechanism: only the active terminal is visible + focusable (the
                rest are display:none), so the focused terminal is ALWAYS the active one,
                and the WP10 zoom router (Workspace.applyTerminalZoom → termPaneRef.current)
                therefore always zooms the focused terminal. Switching the active tab
                re-binds this object ref to the new active pane during commit, so a later
                zoom chord lands on it. (A separate per-terminal handle registry — the
                Phase-3 plan's decision 5 — would be redundant: the active-ref already
                resolves "which of N is focused" for free. Simpler, less bug surface.) */}
          <div className="term-panes">
            {terminals.entries.map((t) => (
              <div
                key={t.id}
                className="term-pane-slot"
                id={`termpane-${t.id}`}
                role="tabpanel"
                aria-labelledby={`termtab-${t.id}`}
                style={{
                  display: t.id === terminals.activeId ? "flex" : "none",
                }}
              >
                <TerminalPane
                  ref={
                    t.id === terminals.activeId ? terminalPaneRef : undefined
                  }
                  sessionId={t.sessionId}
                  projectPath={projectPath}
                  active={
                    visible &&
                    panel === "terminal" &&
                    t.id === terminals.activeId
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WP6 — Cmd+P fuzzy file finder overlay. Only the focused workspace mounts
          it (gated on `visible` via the chord listener + this render guard).
          Selecting a file opens it into the editor (active-pane via openFile). */}
      {visible && finderOpen && (
        <FileFinder
          projectPath={projectPath}
          onOpen={openFile}
          onClose={() => setFinderOpen(false)}
        />
      )}

      {/* WP7 — project-wide search ("Find in Files") QUERY overlay. Like the finder,
          only the focused workspace mounts it. The query is LIFTED here so re-opening
          ⌘⇧F restores it; the RESULTS render into the persistent "Find Results" editor
          tab (handleSearchResults), NOT this overlay — so the operator clicks through
          matches in the tab and the overlay stays a thin query box. */}
      {visible && searchOpen && (
        <ProjectSearch
          projectPath={projectPath}
          query={searchQuery}
          onQueryChange={(q) => {
            setSearchQuery(q);
            // Editing the query invalidates the last search's counts — Replace All
            // re-gates until a fresh search runs (so we never replace against a query
            // the displayed count no longer matches).
            setLastCounts(null);
          }}
          replacement={replacement}
          onReplacementChange={setReplacement}
          error={searchError}
          onError={setSearchError}
          onResults={handleSearchResults}
          canReplace={lastCounts !== null && lastCounts.matches > 0}
          onReplaceAll={onReplaceAll}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* WP7 Phase 3 — Replace-All confirm (blast-radius counts). Reuses the shared
          ConfirmModal; only mounts while the query overlay is open + a search has run. */}
      {visible && searchOpen && replaceConfirmOpen && lastCounts && (
        <ConfirmModal
          spec={replaceAllSpec(
            lastCounts.matches,
            lastCounts.files,
            replacement,
          )}
          onChoose={onReplaceConfirm}
        />
      )}

      {/* QoL-WP5 — delete-file confirm (danger). Only the focused workspace mounts it;
          resolving (delete/cancel) clears pendingDelete. The basename is shown so the
          operator knows exactly which file. */}
      {visible && pendingDelete && (
        <ConfirmModal
          spec={deleteFileSpec(labelForPath(pendingDelete))}
          onChoose={onDeleteConfirm}
        />
      )}

      {/* QoL-WP5b — delete-FOLDER confirm (danger, stronger than single-file). Shows the
          folder basename + descendant count + "moved to Trash (recoverable)". Only the
          focused workspace mounts it; resolving (delete/cancel) clears pendingDeleteFolder. */}
      {visible && pendingDeleteFolder && (
        <ConfirmModal
          spec={deleteFolderSpec(
            labelForPath(pendingDeleteFolder.path),
            pendingDeleteFolder.count,
          )}
          onChoose={onDeleteFolderConfirm}
        />
      )}
    </div>
  );
}
