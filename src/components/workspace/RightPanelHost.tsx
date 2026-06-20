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

interface RightPanelHostProps {
  /** The workspace's project directory — passed to every panel + the toolbars. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab (display:block vs none). */
  visible: boolean;
}

export function RightPanelHost({ projectPath, visible }: RightPanelHostProps) {
  // WP2 temporary open-file affordance: a path box that opens a file relative to
  // the project dir into the EditorPanel. The real Cmd+P fuzzy finder is WP6; this
  // is the minimal way to exercise the open path until then.
  const [pathInput, setPathInput] = useState("README.md");
  const [openPath, setOpenPath] = useState<string | null>(null);

  // Which right-half panel is front. Direct-select via tabs + ⌘⇧ chords. Both panels
  // stay mounted (display:none toggle) so each keeps its state across switches.
  const [panel, setPanel] = useState<RightPanel>("editor");

  // P3 — panel-select hotkeys: ⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal. Registered as a
  // CAPTURE-phase document listener (WP1 finding: fires before CM6's contentEditable
  // handler, so it works while focus is inside the editor — no per-editor keymap
  // wiring). Gated on `visible` so only the focused workspace's host reacts.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
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

      {/* Editor panel — kept mounted; hidden (not unmounted) when Diff is front so
          the open file + scroll survive the switch. */}
      <div
        className="right-panel-slot"
        style={{ display: panel === "editor" ? "flex" : "none" }}
      >
        <form
          className="editor-open-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setOpenPath(pathInput.trim() || null);
          }}
        >
          <input
            type="text"
            className="editor-open-input"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="path/in/project.ts"
            aria-label="file to open"
            spellCheck={false}
          />
          <button type="submit">Open</button>
        </form>
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
          onOpenInEditor={(path) => {
            // "Open" always opens the live working-tree file (by design — see
            // DiffPanel onOpenInEditor doc). Flip to the editor + load it.
            setOpenPath(path);
            setPanel((cur) => selectPanel(cur, "editor"));
          }}
        />
      </div>
    </div>
  );
}
