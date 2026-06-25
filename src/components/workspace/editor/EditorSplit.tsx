// WP12 (per-pane tab strips, 2026-06-21) — the top-level editor split host.
//
// Owns the PANE model (the reused editorPanes.ts reducer: an ordered pane list + the
// focused pane id) and renders one PaneTabs per pane. Each PaneTabs owns its OWN tab
// strip + open-file set (its own openFiles reducer instance), so panes are VS Code
// split-editor groups — independent tabs, focus, layout.
//
// But the BUFFERS are SHARED via the per-workspace document
// store (editorDocs.ts) owned HERE. The same file open in two panes is ONE DocEntry
// (ref-counted by view), so an edit in pane 1 mirrors live in pane 2 and dirty + save
// are document-level (operator P2.vh.9). EditorSplit runs the read_file/write_file IPC
// against the store and passes each EditorPanel view its DocEntry + write callbacks;
// cursor/scroll stay per-view (in each CM6 instance). This realizes the proper
// shared-doc model (folds SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT — distinct
// files per pane work; SAME file shares).
//
// RightPanelHost drives the editor through this component's imperative handle: an
// openFile / activateIndex targets the FOCUSED pane. Split adds a pane; closing a
// pane's last tab collapses that pane (unless it's the only one). The focused pane's
// active file path bubbles up for the FileTree highlight.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { PaneTabs, type PaneTabsHandle } from "./PaneTabs";
import type { SyntheticHighlight } from "./SyntheticView";
import { initialPanesState, panesReducer } from "./editorPanes";
import {
  dirtyDocCount as dirtyDocCountOf,
  docsReducer,
  initialDocsState,
  isDirty,
} from "./editorDocs";
import { diskDecision, type FileMarker } from "./diskConflict";
import { ConfirmModal } from "./ConfirmModal";
import { conflictSpec, type ConflictChoice } from "./confirmDialog";
import { labelForPath } from "./PaneTabs";
import type { HighlightTarget } from "../search/searchModel";

/** Imperative surface RightPanelHost drives the editor through (the open seams). */
export interface EditorSplitHandle {
  /** Open a file in the FOCUSED pane (activate if already open there, else add). */
  openFile: (path: string) => void;
  /** Activate the Nth tab in the FOCUSED pane (⌘1..⌘9). */
  activateIndex: (n: number) => void;
  /** Close the active tab of the FOCUSED pane (⌘W), via its dirty-guard; no-op if none. */
  closeActiveTab: () => void;
  /**
   * Open (or re-activate) a synthetic READ-ONLY tab in the focused pane (the
   * WP7 "Find Results" seam). `id` keys its content + line-click callback; generic — WP7
   * is the first consumer. Seed/replace its content with `setSyntheticContent`, and a
   * click on a line invokes the callback passed in `onLineClick`.
   */
  addSynthetic: (
    id: string,
    label: string,
    onLineClick?: (line: number) => void,
  ) => void;
  /**
   * (Re)set a synthetic tab's in-memory content + optional hit highlights (0-based
   * char-offset spans into `content` — the WP7 matched-text marks).
   */
  setSyntheticContent: (
    id: string,
    content: string,
    highlights?: SyntheticHighlight[],
  ) => void;
  /**
   * QoL-WP0 — the filesystem watcher reported these (project-relative) paths changed
   * on disk. For each one that is currently OPEN here, re-run the existing disk-change
   * check (`checkDisk` → stat + `diskDecision` → reload-when-clean / conflict-when-dirty),
   * WITHOUT requiring a tab activation. Paths not open here are ignored. Reuses the
   * WP12 synchronous-check machinery verbatim — the only new thing is the event source.
   */
  checkDiskForPaths: (paths: string[]) => void;
  /**
   * QoL-WP1 — how many open docs in THIS workspace's editor have unsaved edits. The
   * workspace-close dirty guard reads this (via App's per-workspace dirty-probe registry)
   * to decide whether to confirm before tearing the workspace down. 0 → close silently.
   */
  dirtyDocCount: () => number;
  /**
   * QoL-WP5 — a file was deleted on disk: close its tab in EVERY pane (the same file
   * can be open in more than one split pane). Routed to each pane's PaneTabs handle,
   * which dispatches `close-path` (no dirty guard — the delete-confirm covered loss).
   */
  closeTabsForPath: (path: string) => void;
}

interface EditorSplitProps {
  projectPath: string;
  /** True when this workspace + the editor panel are both front (gates chords). */
  active: boolean;
  /** WP7 — highlight target for the most recent search-result open (focused pane). */
  highlightTarget: HighlightTarget | null;
  /** Reports the focused pane's active file path up for the FileTree highlight. */
  onActivePathChange?: (path: string | null) => void;
  /**
   * WP11 — fires after a successful save (write_file ok) with the saved path, so the
   * parent can refresh the file tree's git-status indicators (a save changes the
   * file's git status). Not called on a save that conflicts or fails.
   */
  onSaved?: (path: string) => void;
}

export const EditorSplit = forwardRef<EditorSplitHandle, EditorSplitProps>(
  function EditorSplit(
    { projectPath, active, highlightTarget, onActivePathChange, onSaved },
    ref,
  ) {
    // The pane model (reused editorPanes reducer): pane list + focused pane id.
    const paneSeq = useRef(0);
    const nextPaneId = useCallback(() => `pane-${++paneSeq.current}`, []);
    const [panes, dispatchPanes] = useReducer(
      panesReducer,
      "pane-0",
      initialPanesState,
    );
    // Live mirror of `panes` so callbacks (onEmptyChange's collapse guard) read the
    // CURRENT pane count rather than a value captured in a stale render closure — the
    // second half of the "Split flashes then closes" bug.
    const panesRef = useRef(panes);
    panesRef.current = panes;

    // One imperative handle per pane (its PaneTabs). Opens/⌘N route to the focused one.
    const paneHandles = useRef<Map<string, PaneTabsHandle | null>>(new Map());
    // Each pane's active file path (for the FileTree highlight: we report the FOCUSED
    // pane's). Kept here so a focus switch re-reports without the pane re-rendering.
    const panePaths = useRef<Map<string, string | null>>(new Map());
    // Panes that have EVER held a tab. The split-gesture decision (operator 2026-06-21):
    // a DELIBERATELY-split empty pane PERSISTS (shows "No file open" until you fill or
    // close it); only a DRAINED pane (had tabs, last one closed) auto-collapses. A pane
    // is "drained" iff it reports empty AND it is in this set. A freshly-split pane is
    // NOT in the set until a file lands in it, so it persists empty.
    const everFilled = useRef<Set<string>>(new Set());

    // The per-workspace SHARED document store (keyed by path, ref-counted).
    const [docs, dispatchDocs] = useReducer(docsReducer, initialDocsState);
    // (A live `docsRef` mirror of `docs` already exists below — reused by the QoL-WP1
    // `dirtyDocCount` handle as well as the disk-conflict machinery.)

    // Synthetic read-only tab content (the WP7 Find-Results seam), keyed by the
    // synthetic tab's id. Content is in `state` so a setSyntheticContent re-renders the
    // view; the line-click callbacks live in a ref (no re-render needed; identity-stable
    // to PaneTabs). Generic — WP7 is the first consumer.
    const [syntheticContent, setSyntheticContentState] = useState<
      Record<string, string>
    >({});
    // Hit highlights per synthetic tab id (parallel to content; in state so a re-set
    // re-renders the marks). The WP7 Find-Results matched-text spans land here.
    const [syntheticHighlights, setSyntheticHighlightsState] = useState<
      Record<string, SyntheticHighlight[]>
    >({});
    const syntheticLineClick = useRef<Record<string, (line: number) => void>>(
      {},
    );

    // A view (a tab in some pane) opened/closed a path → ref-count the store. Same path
    // in two panes = refCount 2 = ONE shared buffer. Stable callbacks (passed to every
    // PaneTabs) so they don't churn the per-view effect deps.
    const onTabOpen = useCallback(
      (path: string) => dispatchDocs({ type: "open-doc", path }),
      [],
    );
    const onTabClose = useCallback(
      (path: string) => dispatchDocs({ type: "close-doc", path }),
      [],
    );
    const onDocChange = useCallback(
      (path: string, doc: string) =>
        dispatchDocs({ type: "set-doc", path, doc }),
      [],
    );
    const onSetOverride = useCallback(
      (path: string, id: string | null) =>
        dispatchDocs({ type: "set-override", path, id }),
      [],
    );

    // The pending disk-change conflict (a dirty doc whose file changed on
    // disk). null = no popup. The operator must choose keep-mine / load-disk.
    const [conflict, setConflict] = useState<{
      path: string;
      disk: FileMarker;
    } | null>(null);

    const docsRef = useRef(docs);
    docsRef.current = docs;

    // Re-read a file from disk into the shared buffer + record the marker (used by a
    // clean-buffer silent reload and by the conflict popup's "Load From Disk").
    const reloadFromDisk = useCallback(
      (path: string, marker: FileMarker) => {
        invoke<string>("read_file", { root: projectPath, path })
          .then((contents) => {
            dispatchDocs({ type: "load-ok", path, contents });
            dispatchDocs({ type: "set-marker", path, marker });
          })
          .catch((e: unknown) =>
            dispatchDocs({ type: "load-fail", path, message: String(e) }),
          );
      },
      [projectPath],
    );

    // Re-stat `path` and act on the disk decision: noop (adopt the marker),
    // reload (clean buffer → silent re-read), or conflict (dirty buffer → popup). Fired
    // on tab activation and before a save. A stat failure is ignored (treat as unchanged)
    // so a transiently-unreadable file doesn't nag.
    const checkDisk = useCallback(
      (path: string): Promise<void> => {
        const entry = docsRef.current.byPath[path];
        if (!entry || entry.load.kind !== "loaded") return Promise.resolve();
        return invoke<FileMarker>("stat_file", { root: projectPath, path })
          .then((disk) => {
            const decision = diskDecision(entry.marker, disk, isDirty(entry));
            if (decision === "noop") {
              if (entry.marker == null)
                dispatchDocs({ type: "set-marker", path, marker: disk });
            } else if (decision === "reload") {
              reloadFromDisk(path, disk);
            } else {
              setConflict({ path, disk });
            }
          })
          .catch(() => {});
      },
      [projectPath, reloadFromDisk],
    );

    // EditorPanel calls this when it becomes the front view (active) and is loaded.
    const onActivated = useCallback(
      (path: string) => void checkDisk(path),
      [checkDisk],
    );

    // QoL-WP0 — the filesystem watcher reported these paths changed on disk. Re-run
    // `checkDisk` for each one that is currently open here (a path not in byPath is a
    // cheap no-op — checkDisk early-returns). This is what makes a backgrounded /
    // unfocused tab reload (or raise the conflict popup) in real time, instead of only
    // on the next tab activation. No new decision logic — `checkDisk` already does
    // stat + diskDecision + reload/conflict, and ignores a stat failure (a deleted
    // file → treated as unchanged, no nag).
    const checkDiskForPaths = useCallback(
      (paths: string[]) => {
        const byPath = docsRef.current.byPath;
        for (const path of paths) {
          if (byPath[path]) void checkDisk(path);
        }
      },
      [checkDisk],
    );

    // Resolve the conflict popup. keep-mine: adopt the disk marker (keeps my dirty
    // buffer; the next check is quiet). load-disk: re-read disk over my buffer + marker.
    const onConflictChoice = (choice: ConflictChoice) => {
      const c = conflict;
      setConflict(null);
      if (c == null) return;
      if (choice === "keep-mine") {
        dispatchDocs({ type: "set-marker", path: c.path, marker: c.disk });
      } else {
        reloadFromDisk(c.path, c.disk);
      }
    };

    // Save a document: re-check disk first (a dirty doc whose file changed → conflict
    // popup instead of clobbering). Otherwise write the shared buffer once; save-ok
    // advances savedDoc → dirty clears in every view; then re-stat → store the new
    // marker so the next activation doesn't false-positive a conflict.
    const onSave = useCallback(
      async (path: string) => {
        const entry = docsRef.current.byPath[path];
        if (!entry) return;
        if (entry.doc === entry.savedDoc && entry.save.kind !== "error") return; // nothing to persist
        // Pre-save disk check: if the file changed under our dirty buffer, raise the
        // conflict popup and do NOT write (no silent overwrite).
        if (entry.marker != null) {
          try {
            const disk = await invoke<FileMarker>("stat_file", {
              root: projectPath,
              path,
            });
            if (
              diskDecision(entry.marker, disk, isDirty(entry)) === "conflict"
            ) {
              setConflict({ path, disk });
              return;
            }
          } catch {
            // stat failed (e.g. new file not yet on disk) → proceed with the write.
          }
        }
        const contents = entry.doc;
        dispatchDocs({ type: "save-start", path });
        try {
          await invoke<void>("write_file", {
            root: projectPath,
            path,
            contents,
          });
          dispatchDocs({ type: "save-ok", path, contents });
          // WP11 — the save changed the file's git status; tell the parent to refresh
          // the tree indicators. After save-ok (not on conflict/fail).
          onSaved?.(path);
          // Refresh the marker to the just-written file so the next check is quiet.
          try {
            const after = await invoke<FileMarker>("stat_file", {
              root: projectPath,
              path,
            });
            dispatchDocs({ type: "set-marker", path, marker: after });
          } catch {
            /* a stat failure here only risks a benign false-positive next time */
          }
        } catch (e: unknown) {
          dispatchDocs({ type: "save-fail", path, message: String(e) });
        }
      },
      [projectPath, onSaved],
    );

    // Load-ONCE-per-path: when a freshly-opened entry is still idle, read_file it. One
    // read per document regardless of how many views (panes) hold it — the shared buffer
    // is populated once. Subsequent views of the same path reuse the loaded entry. After
    // a successful load, stat the file to record the initial disk marker (the Phase-3
    // baseline for the on-activate/pre-save change check).
    useEffect(() => {
      for (const [path, entry] of Object.entries(docs.byPath)) {
        if (entry.load.kind !== "idle") continue;
        dispatchDocs({ type: "load-start", path });
        invoke<string>("read_file", { root: projectPath, path })
          .then((contents) => {
            dispatchDocs({ type: "load-ok", path, contents });
            // Record the initial disk marker (Phase-3 baseline). A stat failure here is
            // swallowed — the load already succeeded; a missing baseline only risks a
            // benign first-activation marker-adopt, never a load error.
            invoke<FileMarker>("stat_file", { root: projectPath, path })
              .then((marker) =>
                dispatchDocs({ type: "set-marker", path, marker }),
              )
              .catch(() => {});
          })
          .catch((e: unknown) =>
            dispatchDocs({ type: "load-fail", path, message: String(e) }),
          );
      }
    }, [docs.byPath, projectPath]);

    const focusPane = useCallback(
      (id: string) => dispatchPanes({ type: "focus", id }),
      [],
    );

    const openFile = useCallback(
      (path: string) => {
        paneHandles.current.get(panes.activePaneId)?.openFile(path);
      },
      [panes.activePaneId],
    );
    const activateIndex = useCallback(
      (n: number) => {
        paneHandles.current.get(panes.activePaneId)?.activateIndex(n);
      },
      [panes.activePaneId],
    );
    const closeActiveTab = useCallback(() => {
      paneHandles.current.get(panes.activePaneId)?.closeActiveTab();
    }, [panes.activePaneId]);

    // Set/replace a synthetic tab's in-memory content + hit highlights (re-renders the
    // view). Highlights default to none so a content-only set clears any stale marks.
    const setSyntheticContent = useCallback(
      (id: string, content: string, highlights: SyntheticHighlight[] = []) => {
        setSyntheticContentState((prev) =>
          prev[id] === content ? prev : { ...prev, [id]: content },
        );
        setSyntheticHighlightsState((prev) => ({ ...prev, [id]: highlights }));
      },
      [],
    );

    // Open a synthetic read-only tab in the focused pane + register its content
    // (seeded empty unless already set) and its line-click callback.
    const addSynthetic = useCallback(
      (id: string, label: string, onLineClick?: (line: number) => void) => {
        if (onLineClick) syntheticLineClick.current[id] = onLineClick;
        setSyntheticContentState((prev) =>
          id in prev ? prev : { ...prev, [id]: "" },
        );
        paneHandles.current.get(panes.activePaneId)?.addSynthetic(id, label);
      },
      [panes.activePaneId],
    );

    // QoL-WP1 — read the live store via the ref (stable identity; no `docs` dep so the
    // handle isn't rebuilt on every edit). Called by the close guard at click time.
    const dirtyDocCount = useCallback(
      () => dirtyDocCountOf(docsRef.current),
      [],
    );

    // QoL-WP5 — close a deleted file's tab in EVERY pane. Each PaneTabs dispatches
    // `close-path` (a no-op where the pane doesn't hold it); the shared-store ref-count
    // drops via each pane's prevPaths diff. Iterates the live handle map.
    const closeTabsForPath = useCallback((path: string) => {
      for (const handle of paneHandles.current.values()) {
        handle?.closeTabsForPath(path);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        openFile,
        activateIndex,
        closeActiveTab,
        addSynthetic,
        setSyntheticContent,
        checkDiskForPaths,
        dirtyDocCount,
        closeTabsForPath,
      }),
      [
        openFile,
        activateIndex,
        closeActiveTab,
        addSynthetic,
        setSyntheticContent,
        checkDiskForPaths,
        dirtyDocCount,
        closeTabsForPath,
      ],
    );

    // DEV-ONLY synthetic-tab seam. Gated on `import.meta.env.DEV` (like
    // `window.__seedWorkspace`), so verify-self / console harnesses can drive a synthetic
    // read-only tab without a real WP7 consumer. `add` opens the tab with a line-click
    // callback that records clicked lines into `clickedLines` (assertable from a stub).
    // Dead-code-eliminated in production; never registered there.
    useEffect(() => {
      if (!import.meta.env.DEV) return;
      window.__editorSynthetic = {
        clickedLines: [],
        add: (id: string, label: string) =>
          addSynthetic(id, label, (line) =>
            window.__editorSynthetic?.clickedLines.push(line),
          ),
        setContent: (id: string, content: string) =>
          setSyntheticContent(id, content),
      };
      return () => {
        delete window.__editorSynthetic;
      };
    }, [addSynthetic, setSyntheticContent]);

    const splitPane = () => dispatchPanes({ type: "split", id: nextPaneId() });

    const closePane = (id: string) => {
      paneHandles.current.delete(id);
      panePaths.current.delete(id);
      everFilled.current.delete(id);
      dispatchPanes({ type: "close", id });
    };

    // Report the FOCUSED pane's active path up for the FileTree highlight.
    const reportActivePath = useCallback(() => {
      onActivePathChange?.(panePaths.current.get(panes.activePaneId) ?? null);
    }, [onActivePathChange, panes.activePaneId]);

    const splitable = panes.panes.length > 1;

    return (
      <div className="editor-split" data-testid="editor-split">
        {/* WP11 Phase 5 — the dedicated `.editor-split-bar` row was removed; the Split
            control now lives in the active pane's tab strip (PaneTabs onSplit) to
            reclaim its full-width row of vertical space. */}
        <div className="editor-split-panes">
          {panes.panes.map((pane) => (
            <div
              key={pane.id}
              className={`editor-split-pane${pane.id === panes.activePaneId ? " is-active" : ""}`}
              data-testid="editor-split-pane"
              data-pane-id={pane.id}
              data-active-pane={pane.id === panes.activePaneId}
            >
              <PaneTabs
                ref={(h) => {
                  paneHandles.current.set(pane.id, h);
                }}
                active={active && pane.id === panes.activePaneId}
                highlightTarget={
                  pane.id === panes.activePaneId ? highlightTarget : null
                }
                // WP11 Phase 5 — EVERY pane shows its own Split control in its tab
                // strip (splitPane inserts a new pane after the active one). Passing it
                // to every pane (not just the active one) fixes the "Split gone with 2
                // panes" bug: after a split the new pane becomes active + empty, so an
                // active-only gate left NO pane showing the control.
                onSplit={splitPane}
                // WP11 Phase 5 — close-pane control, now a strip icon beside Split
                // (was an absolute ✕ overlapping it). Only when >1 pane (the sole
                // pane can't be closed). closePane(pane.id) targets THIS pane.
                onClosePane={splitable ? () => closePane(pane.id) : undefined}
                docs={docs}
                onTabOpen={onTabOpen}
                onTabClose={onTabClose}
                onDocChange={onDocChange}
                onSave={onSave}
                onSetOverride={onSetOverride}
                onActivated={onActivated}
                syntheticContent={syntheticContent}
                syntheticHighlights={syntheticHighlights}
                syntheticLineClick={syntheticLineClick.current}
                onFocusPane={() => focusPane(pane.id)}
                onActivePathChange={(p) => {
                  panePaths.current.set(pane.id, p);
                  reportActivePath();
                }}
                onEmptyChange={(empty) => {
                  if (!empty) {
                    // The pane now holds a tab → mark it as having-been-filled, so a
                    // later drain (closing its last tab) auto-collapses it.
                    everFilled.current.add(pane.id);
                    return;
                  }
                  // Empty: collapse ONLY a DRAINED pane (one that previously held tabs)
                  // when another pane survives. A DELIBERATELY-split empty pane (never
                  // filled) PERSISTS, showing "No file open" until filled or closed
                  // (operator 2026-06-21). The SOLE pane always stays. Read the LIVE
                  // pane count via panesRef — never a stale closure value.
                  if (
                    panesRef.current.panes.length > 1 &&
                    everFilled.current.has(pane.id)
                  ) {
                    closePane(pane.id);
                  }
                }}
              />
            </div>
          ))}
        </div>

        {/* Disk-change conflict popup: a dirty doc whose file changed on disk.
            keep-mine adopts the disk marker (keeps my edits, quiets the next check);
            load-disk re-reads disk over my buffer. No silent overwrite either way. */}
        {conflict && (
          <ConfirmModal
            spec={conflictSpec(labelForPath(conflict.path))}
            onChoose={onConflictChoice}
          />
        )}
      </div>
    );
  },
);
