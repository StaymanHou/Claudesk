// WP12 (per-pane tab strips, 2026-06-21) — ONE pane's tab strip + its editors.
//
// A pane in the VS Code split-editor-group sense: it owns an ordered set of open
// files (its own `openFiles` reducer instance) shown as a tab strip, and mounts one
// EditorPanel per file tab (display-toggled so each keeps its buffer/cursor/scroll).
// EditorSplit renders N of these side by side; each is independent — the SAME file
// can be open in two panes with separate buffers.
//
// The parent (EditorSplit) drives a pane through the imperative handle: openFile,
// activateIndex (⌘1..9 → focused pane), and reads its active path + whether it has
// any tabs (so EditorSplit can collapse an emptied pane). A focus/click anywhere in
// this pane marks it the focused pane (onFocusPane) so chords + opens target it.
//
// Synthetic read-only tabs (kind: "synthetic") are the WP7 "Find Results" seam; they
// land in Phase 4 (a placeholder renders for now so the model round-trips).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import { EditorPanel } from "./EditorPanel";
import { SyntheticView } from "./SyntheticView";
import { ConfirmModal } from "./ConfirmModal";
import { closeDirtySpec, type CloseChoice } from "./confirmDialog";
import {
  initialOpenFilesState,
  openFilesReducer,
  type OpenFile,
} from "./openFiles";
import { isDirty, type DocsState } from "./editorDocs";
import type { HighlightTarget } from "../search/searchModel";

/** Basename of a project-relative (POSIX) or absolute path — the tab label. */
export function labelForPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base || path;
}

/** Imperative surface EditorSplit drives ONE pane through. */
export interface PaneTabsHandle {
  /** Open a file: activate its tab if already open in THIS pane, else add + activate. */
  openFile: (path: string) => void;
  /** Activate the Nth tab (1-based; ⌘1..⌘9, n past the end clamps to the last). */
  activateIndex: (n: number) => void;
  /** Phase 4 — add (or re-activate) a synthetic read-only tab by id (the WP7 seam). */
  addSynthetic: (id: string, label: string) => void;
}

interface PaneTabsProps {
  /**
   * True when the whole workspace+editor panel is front AND this pane is the focused
   * pane — gates the active EditorPanel's palette chord so only the one live editor
   * responds.
   */
  active: boolean;
  /**
   * WP7 — the highlight target for the most recent search-result open. Applies to this
   * pane's active tab only when this is the pane the open targeted (EditorSplit passes
   * it to the focused pane). Null for a plain finder/tree open.
   */
  highlightTarget: HighlightTarget | null;
  /** Mark this pane the focused pane (a click/focus landed inside it). */
  onFocusPane: () => void;
  /** Reports this pane's active file path (null = synthetic / no tabs) for FileTree highlight. */
  onActivePathChange?: (path: string | null) => void;
  /** Reports whether this pane has zero tabs (EditorSplit collapses an emptied pane). */
  onEmptyChange?: (empty: boolean) => void;
  // Phase 2S — the SHARED document store (owned by EditorSplit) + its write callbacks.
  // A view reads its buffer/dirty/save-state from `docs.byPath[path]` and writes via
  // these. onTabOpen/onTabClose ref-count the store as this pane's tabs add/remove.
  /** The shared document store. */
  docs: DocsState;
  /** A tab for `path` was added in this pane → ref-count the store up. */
  onTabOpen: (path: string) => void;
  /** A tab for `path` was removed from this pane → ref-count the store down. */
  onTabClose: (path: string) => void;
  /** An edit in this pane's active view → update the shared buffer. */
  onDocChange: (path: string, doc: string) => void;
  /** Save the document (⌘S or the close-guard's Save). */
  onSave: (path: string) => void;
  /** Palette syntax override for the document. */
  onSetOverride: (path: string, id: string | null) => void;
  /** Phase 3 — a view became front (active + loaded) → run the disk-change check. */
  onActivated: (path: string) => void;
  // Phase 4 — synthetic read-only tabs (the WP7 seam). Content + line-click callback are
  // keyed by the synthetic tab's id, supplied by the owner (EditorSplit).
  /** In-memory content per synthetic tab id (read-only). */
  syntheticContent: Record<string, string>;
  /** Line-click callbacks per synthetic tab id (1-based line number). */
  syntheticLineClick: Record<string, (line: number) => void>;
}

export const PaneTabs = forwardRef<PaneTabsHandle, PaneTabsProps>(
  function PaneTabs(
    {
      active,
      highlightTarget,
      onFocusPane,
      onActivePathChange,
      onEmptyChange,
      docs,
      onTabOpen,
      onTabClose,
      onDocChange,
      onSave,
      onSetOverride,
      onActivated,
      syntheticContent,
      syntheticLineClick,
    },
    ref,
  ) {
    const [state, dispatch] = useReducer(
      openFilesReducer,
      undefined,
      initialOpenFilesState,
    );

    // Monotonic id source for new tabs in THIS pane (stable, no Date/random).
    const tabSeq = useRef(0);
    const nextTabId = useCallback(() => `tab-${++tabSeq.current}`, []);

    // Dirty-close confirm: the tab id pending a close decision (null = no dialog).
    const [closing, setClosing] = useState<string | null>(null);

    const openFile = useCallback(
      (path: string) => {
        dispatch({
          type: "open-or-activate",
          id: nextTabId(),
          path,
          label: labelForPath(path),
        });
      },
      [nextTabId],
    );

    const activateIndex = useCallback(
      (n: number) => dispatch({ type: "activate-index", n }),
      [],
    );

    const addSynthetic = useCallback(
      (id: string, label: string) =>
        dispatch({ type: "add-synthetic", id, label }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({ openFile, activateIndex, addSynthetic }),
      [openFile, activateIndex, addSynthetic],
    );

    const activate = (id: string) => dispatch({ type: "activate", id });

    const { tabs, activeTabId } = state;

    // Phase 2S — ref-count the SHARED store as this pane's FILE tabs add/remove. We diff
    // the set of open file-paths against the previous render and fire onTabOpen/onTabClose
    // for the delta — robust against the reducer's add-or-activate nuance (a re-open of an
    // already-open path doesn't add a tab, so it must not double-count). Synthetic tabs
    // (no path) don't touch the store.
    const prevPaths = useRef<Set<string>>(new Set());
    useEffect(() => {
      const cur = new Set(
        tabs.filter((t) => t.kind === "file" && t.path).map((t) => t.path!),
      );
      for (const p of cur) if (!prevPaths.current.has(p)) onTabOpen(p);
      for (const p of prevPaths.current) if (!cur.has(p)) onTabClose(p);
      prevPaths.current = cur;
    }, [tabs, onTabOpen, onTabClose]);

    // Whether a file tab is dirty — read from the SHARED store entry (so the ● dot shows
    // in EVERY pane's tab for that path, and a save in one pane clears it everywhere).
    const tabIsDirty = (tab: OpenFile): boolean =>
      tab.kind === "file" && tab.path != null && isDirty(docs.byPath[tab.path]);

    const requestClose = (id: string) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return;
      if (tabIsDirty(tab)) {
        setClosing(id);
        return;
      }
      doClose(id);
    };

    const doClose = (id: string) => dispatch({ type: "close", id });

    const onCloseChoice = (choice: CloseChoice) => {
      const id = closing;
      setClosing(null);
      if (id == null) return;
      if (choice === "cancel") return; // keep the tab
      const tab = state.tabs.find((t) => t.id === id);
      if (choice === "save" && tab?.path) onSave(tab.path); // persist then close
      doClose(id);
    };

    // Report the active tab's path up (FileTree highlight) + emptiness (pane collapse)
    // ONLY on an actual VALUE transition. EditorSplit passes fresh inline callbacks
    // each render, so keying these effects on the callback identity would re-fire them
    // on every unrelated re-render — and a spurious onEmptyChange re-fire mid-split was
    // collapsing a just-created pane (the "Split flashes then closes" bug). We track the
    // last-reported value in a ref and call up only when it genuinely changes; the
    // callbacks are read live (refs) so a stale closure can't fire an old value.
    const activePath = tabs.find((t) => t.id === activeTabId)?.path ?? null;
    const isEmpty = tabs.length === 0;

    const onActivePathChangeRef = useRef(onActivePathChange);
    onActivePathChangeRef.current = onActivePathChange;
    const onEmptyChangeRef = useRef(onEmptyChange);
    onEmptyChangeRef.current = onEmptyChange;

    const lastReportedPath = useRef<string | null | undefined>(undefined);
    useEffect(() => {
      if (lastReportedPath.current === activePath) return;
      lastReportedPath.current = activePath;
      onActivePathChangeRef.current?.(activePath);
    }, [activePath]);

    const lastReportedEmpty = useRef<boolean | undefined>(undefined);
    useEffect(() => {
      if (lastReportedEmpty.current === isEmpty) return;
      lastReportedEmpty.current = isEmpty;
      onEmptyChangeRef.current?.(isEmpty);
    }, [isEmpty]);

    const closingTab: OpenFile | undefined = closing
      ? tabs.find((t) => t.id === closing)
      : undefined;

    return (
      <div
        className={`pane-tabs${active ? " is-focused-pane" : ""}`}
        data-testid="pane-tabs"
        // Any focus landing inside this pane makes it the focused pane (capture so it
        // beats CM6's own handlers). Drives where ⌘N + opens target.
        onFocusCapture={onFocusPane}
        onMouseDownCapture={onFocusPane}
      >
        {isEmpty ? (
          // Empty pane → the editor's "No file open" placeholder. EditorSplit collapses
          // an emptied pane when >1 pane exists; the SOLE pane stays and shows this.
          <EditorPanel openPath={null} active={false} />
        ) : (
          <>
            <div
              className="editor-tab-strip"
              role="tablist"
              aria-label="open files"
            >
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={tab.id === activeTabId}
                  className={`editor-tab${tab.id === activeTabId ? " is-active" : ""}`}
                  data-testid="editor-tab"
                  data-tab-id={tab.id}
                  title={tab.path ?? tab.label}
                  onMouseDown={() => activate(tab.id)}
                >
                  {tabIsDirty(tab) && (
                    <span
                      className="editor-tab-dirty"
                      aria-label="unsaved"
                      title="unsaved"
                    >
                      ●
                    </span>
                  )}
                  <span className="editor-tab-label">{tab.label}</span>
                  <button
                    type="button"
                    className="editor-tab-close"
                    data-testid="editor-tab-close"
                    aria-label={`Close ${tab.label}`}
                    title="Close tab"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requestClose(tab.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="editor-tab-bodies">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className="editor-tab-body"
                    style={{ display: isActive ? "flex" : "none" }}
                  >
                    {tab.kind === "file" && tab.path ? (
                      <EditorPanel
                        openPath={tab.path}
                        active={active && isActive}
                        highlightTarget={isActive ? highlightTarget : null}
                        entry={docs.byPath[tab.path]}
                        onDocChange={onDocChange}
                        onSave={onSave}
                        onSetOverride={onSetOverride}
                        onActivated={onActivated}
                      />
                    ) : (
                      <SyntheticView
                        content={syntheticContent[tab.id] ?? ""}
                        onLineClick={syntheticLineClick[tab.id]}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {closingTab && (
          <ConfirmModal
            spec={closeDirtySpec(closingTab.label)}
            onChoose={onCloseChoice}
          />
        )}
      </div>
    );
  },
);
