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

import { useEffect, useRef, useState } from "react";
import { EditorSplit, type EditorSplitHandle } from "./editor/EditorSplit";
import { tabSwitchIndex } from "./editor/tabSwitchChord";
import { DiffPanel } from "./diff/DiffPanel";
import { panelForChord, selectPanel, type RightPanel } from "./panelHost";
import { FileFinder } from "./finder/FileFinder";
import { isFinderChord } from "./finder/finderChord";
import { FileTree } from "./filetree/FileTree";
import { ProjectSearch } from "./search/ProjectSearch";
import { isSearchChord } from "./search/searchChord";
import type {
  FileMatches,
  HighlightTarget,
  SearchQuery,
} from "./search/searchModel";
import { openSublime, openSublimeMerge } from "../../sublime/sublimeLaunch";
import { SublimeTextIcon } from "../../sublime/icons/SublimeTextIcon";
import { SublimeMergeIcon } from "../../sublime/icons/SublimeMergeIcon";

interface RightPanelHostProps {
  /** The workspace's project directory — passed to every panel + the Sublime launch buttons. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab (display:block vs none). */
  visible: boolean;
}

export function RightPanelHost({ projectPath, visible }: RightPanelHostProps) {
  // WP12 — open files live in PER-PANE TAB STRIPS (EditorSplit owns the pane model;
  // each pane has its own tab strip + open-file set). The open seams (finder, tree,
  // diff "Open", WP7 search) call `openFile`, which drives EditorSplit via this
  // imperative handle → the FOCUSED pane's open-or-activate. `activePath` mirrors the
  // focused pane's active file here only so the FileTree can highlight the open file.
  const editorSplitRef = useRef<EditorSplitHandle>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

  // WP6 — whether the Cmd+P fuzzy file-finder overlay is open.
  const [finderOpen, setFinderOpen] = useState(false);

  // WP7 — the match to scroll-to + highlight in the editor after a search-result
  // open (null for a plain open via the finder/tree/diff). Threaded to EditorPanel.
  const [highlightTarget, setHighlightTarget] =
    useState<HighlightTarget | null>(null);

  // WP7 — project-search overlay state. `searchOpen` toggles the overlay; the last
  // query + results live HERE (not inside the overlay) so re-opening ⌘⇧F restores
  // them — the overlay stays usable for click-through-many-matches (opening a result
  // doesn't lose the result set). null results = "never searched yet" this session.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({
    pattern: "",
    regex: false,
    caseSensitive: false,
    wholeWord: false,
  });
  const [searchResults, setSearchResults] = useState<FileMatches[] | null>(
    null,
  );
  const [searchError, setSearchError] = useState<string | null>(null);

  // WP10 — whether the FileTree left rail is collapsed (to a strip) to reclaim the
  // editor's horizontal width in the 50/50 split. State lives here so it persists
  // across center-stage switches (the panels-stay-mounted rule). Default expanded.
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // Which right-half panel is front. Direct-select via tabs + ⌘⇧ chords. Both panels
  // stay mounted (display:none toggle) so each keeps its state across switches.
  const [panel, setPanel] = useState<RightPanel>("editor");

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
      // WP12 — ⌘1..⌘9 activates the Nth open-file tab (n past the end → last tab).
      // Bare ⌘+digit, disjoint from every ⌘⇧ chord and the bare-⌘P finder.
      const tabN = tabSwitchIndex(e);
      if (tabN !== null) {
        e.preventDefault();
        editorSplitRef.current?.activateIndex(tabN);
        return;
      }
      const target = panelForChord(e);
      if (target === null) return;
      e.preventDefault();
      setPanel((cur) => selectPanel(cur, target));
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [visible]);

  return (
    <div className="workspace-right">
      {/* WP10 — the right-half body is a horizontal row: the FileTree rail (left) +
          the panel column (right). The rail collapses to a strip to reclaim width
          for the editor in the 50/50 split; collapse state persists (mounted). */}
      <div className="right-panel-body">
        <div
          className={`file-tree-rail${treeCollapsed ? " is-collapsed" : ""}`}
        >
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
          {/* The tree stays MOUNTED even when collapsed — CSS (.is-collapsed
              .file-tree-body { display:none }) hides the body in the strip. Keeping
              it mounted preserves the expanded-dir Set AND avoids re-issuing the
              fs_tree walk on every collapse→expand cycle. */}
          <FileTree
            projectPath={projectPath}
            openPath={activePath}
            onOpen={openFile}
          />
        </div>

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
              aria-selected={panel === "editor"}
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
              aria-selected={panel === "diff"}
              className={`panel-tab${panel === "diff" ? " is-active" : ""}`}
              data-testid="panel-tab-diff"
              onClick={() => setPanel((cur) => selectPanel(cur, "diff"))}
              title="Diff (⌘⇧D)"
            >
              Diff
            </button>
            {/* Terminal tab (⌘⇧T) arrives with WP9; omitted until the panel exists. */}

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
          </div>

          {/* Editor split (WP12) — kept mounted; hidden (not unmounted) when Diff is
              front so every pane's tabs + buffers + scroll survive the switch.
              EditorSplit owns the pane model; each pane has its own tab strip +
              open-file set (PaneTabs). Files open via the Cmd+P finder (WP6), the
              WP10 file tree, the diff "Open", or (WP7) a search result — all through
              `openFile` → the focused pane. */}
          <div
            className="right-panel-slot"
            style={{ display: panel === "editor" ? "flex" : "none" }}
          >
            <EditorSplit
              ref={editorSplitRef}
              projectPath={projectPath}
              active={visible && panel === "editor"}
              highlightTarget={highlightTarget}
              onActivePathChange={setActivePath}
            />
          </div>

          {/* Diff panel — kept mounted; the selected-file diff survives the switch.
              `active` is gated on BOTH workspace visibility AND the diff panel being
              front so a backgrounded panel doesn't auto-refresh its file list. */}
          <div
            className="right-panel-slot"
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

      {/* WP7 — project-wide search ("Find in Files") overlay. Like the finder, only
          the focused workspace mounts it. The query + results are LIFTED here (not
          overlay-local) so closing then re-opening ⌘⇧F restores the last search —
          opening a result doesn't clear the list, so the operator can click through
          many matches. Selecting a result opens the file at the match (openFile with
          a highlight target). */}
      {visible && searchOpen && (
        <ProjectSearch
          projectPath={projectPath}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          error={searchError}
          onResults={setSearchResults}
          onError={setSearchError}
          onOpen={openFile}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
