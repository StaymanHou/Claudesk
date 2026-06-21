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

import { useEffect, useState } from "react";
import { SublimeToolbar } from "./SublimeToolbar";
import { EditorPanel } from "./editor/EditorPanel";
import { DiffPanel } from "./diff/DiffPanel";
import { panelForChord, selectPanel, type RightPanel } from "./panelHost";
import { FileFinder } from "./finder/FileFinder";
import { isFinderChord } from "./finder/finderChord";
import { FileTree } from "./filetree/FileTree";

interface RightPanelHostProps {
  /** The workspace's project directory — passed to every panel + the toolbars. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab (display:block vs none). */
  visible: boolean;
}

export function RightPanelHost({ projectPath, visible }: RightPanelHostProps) {
  // The file currently open in the editor. Set by the Cmd+P finder (WP6) and by
  // the diff panel's "Open" action; null = no file (the editor shows its empty state).
  const [openPath, setOpenPath] = useState<string | null>(null);

  // WP6 — whether the Cmd+P fuzzy file-finder overlay is open.
  const [finderOpen, setFinderOpen] = useState(false);

  // WP10 — whether the FileTree left rail is collapsed (to a strip) to reclaim the
  // editor's horizontal width in the 50/50 split. State lives here so it persists
  // across center-stage switches (the panels-stay-mounted rule). Default expanded.
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // Which right-half panel is front. Direct-select via tabs + ⌘⇧ chords. Both panels
  // stay mounted (display:none toggle) so each keeps its state across switches.
  const [panel, setPanel] = useState<RightPanel>("editor");

  // Open a file into the editor: load it + flip the editor panel to the front so
  // the focused pane becomes the viewport on it (active-pane semantics within the
  // WP3c shared-document model — see EditorPanel). Shared by the Cmd+P finder and
  // the diff panel's "Open". Does NOT change the pane model (independent-per-pane
  // files remain a deferred follow-up: SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT).
  const openFile = (path: string) => {
    setOpenPath(path);
    setPanel((cur) => selectPanel(cur, "editor"));
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
      <SublimeToolbar projectPath={projectPath} active={visible} />

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
            openPath={openPath}
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
          </div>

          {/* Editor panel — kept mounted; hidden (not unmounted) when Diff is front
              so the open file + scroll survive the switch. Files are opened via the
              Cmd+P finder (WP6) or the WP10 file tree. */}
          <div
            className="right-panel-slot"
            style={{ display: panel === "editor" ? "flex" : "none" }}
          >
            <EditorPanel
              projectPath={projectPath}
              openPath={openPath}
              active={visible && panel === "editor"}
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
    </div>
  );
}
