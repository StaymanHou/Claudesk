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
import { TerminalPane } from "./TerminalPane";
import { panelForChord, selectPanel, type RightPanel } from "./panelHost";
import { FileFinder } from "./finder/FileFinder";
import { isFinderChord } from "./finder/finderChord";
import { FileTree } from "./filetree/FileTree";
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
import { invoke } from "@tauri-apps/api/core";
import { openSublime, openSublimeMerge } from "../../sublime/sublimeLaunch";
import { SublimeTextIcon } from "../../sublime/icons/SublimeTextIcon";
import { SublimeMergeIcon } from "../../sublime/icons/SublimeMergeIcon";

interface RightPanelHostProps {
  /** The workspace id — keys the WP9 second-terminal session (one shell per workspace). */
  workspaceId: string;
  /** The workspace's project directory — passed to every panel + the Sublime launch buttons. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab (display:block vs none). */
  visible: boolean;
}

export function RightPanelHost({
  workspaceId,
  projectPath,
  visible,
}: RightPanelHostProps) {
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

  // WP7 — project-search QUERY overlay state. `searchOpen` toggles the overlay; the
  // last query lives HERE (lifted) so re-opening ⌘⇧F restores it. RESULTS do NOT live
  // here — they render into the "Find Results" editor tab (the WP12 synthetic-tab seam),
  // which is persistent across re-opens so the operator can click through many matches.
  const [searchOpen, setSearchOpen] = useState(false);
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
            <button
              type="button"
              role="tab"
              aria-selected={panel === "terminal"}
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

          {/* WP9 — second-terminal panel: a login shell `cd`'d into the project.
              Kept MOUNTED (display:none when not front) so the shell session +
              scrollback survive panel + center-stage switches. Mounting the slot
              in the SAME change that added "terminal" to AVAILABLE_PANELS is the
              SURFACE-2026-06-20 guard: selectPanel can now return "terminal", and
              this slot guarantees that never leaves the right half blank. */}
          <div
            className="right-panel-slot"
            style={{ display: panel === "terminal" ? "flex" : "none" }}
          >
            <TerminalPane
              workspaceId={workspaceId}
              projectPath={projectPath}
              active={visible && panel === "terminal"}
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
    </div>
  );
}
