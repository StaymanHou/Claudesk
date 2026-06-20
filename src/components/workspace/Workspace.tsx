// WP5/WP7 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: a Sublime toolbar (WP8) above an Editor↔Diff segmented toggle and
// the active panel — EditorPanel (WP2/3) or the git DiffPanel (WP4). The full
// Editor/Diff/2nd-terminal panel host with a panel-switch hotkey is WP5
// (RightPanelHost); this segmented toggle is the WP4 stopgap (the WP2 precedent
// where EditorPanel shipped with a stopgap open-bar before WP6's finder).
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it is hidden
// with `display:none` so its xterm + PTY connection persist. The `visible` prop
// drives that toggle.

import { useState } from "react";
import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "./XtermPane";
import { SublimeToolbar } from "./SublimeToolbar";
import { EditorPanel } from "./editor/EditorPanel";
import { DiffPanel } from "./diff/DiffPanel";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** Store the backend CC session id once cc_spawn resolves (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
}

export function Workspace({ workspace, visible, onSessionId }: WorkspaceProps) {
  // WP2 temporary open-file affordance: a path box that opens a file relative to
  // the project dir into the EditorPanel. The real Cmd+P fuzzy finder is WP6;
  // this is the minimal way to exercise the open path until then.
  const [pathInput, setPathInput] = useState("README.md");
  const [openPath, setOpenPath] = useState<string | null>(null);
  // WP4 stopgap — which right-half panel is showing. WP5's RightPanelHost replaces
  // this segmented toggle with the panel-switch hotkey + a real panel host. Both
  // panels stay MOUNTED (display:none toggle) so each keeps its state — the open
  // file + scroll on the editor, the selected diff on the diff panel — across
  // switches, mirroring the workspace-stays-mounted rule.
  const [rightPanel, setRightPanel] = useState<"editor" | "diff">("editor");

  return (
    <div
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      // display:none keeps the subtree mounted (xterm + PTY persist).
      style={{ display: visible ? "grid" : "none" }}
    >
      <div className="workspace-left">
        <XtermPane
          workspaceId={workspace.id}
          projectPath={workspace.project_path}
          onSessionId={(sid) => onSessionId?.(workspace.id, sid)}
        />
      </div>
      <div className="workspace-right">
        <SublimeToolbar projectPath={workspace.project_path} active={visible} />
        {/* WP4 stopgap — Editor↔Diff segmented toggle (WP5 RightPanelHost owns the
            real panel-switch hotkey). */}
        <div
          className="right-panel-toggle"
          role="tablist"
          aria-label="right panel"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightPanel === "editor"}
            className={`panel-tab${rightPanel === "editor" ? " is-active" : ""}`}
            data-testid="panel-tab-editor"
            onClick={() => setRightPanel("editor")}
          >
            Editor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanel === "diff"}
            className={`panel-tab${rightPanel === "diff" ? " is-active" : ""}`}
            data-testid="panel-tab-diff"
            onClick={() => setRightPanel("diff")}
          >
            Diff
          </button>
        </div>
        {/* Editor panel — kept mounted; hidden (not unmounted) when Diff is active
            so the open file + scroll survive the toggle. */}
        <div
          className="right-panel-slot"
          style={{ display: rightPanel === "editor" ? "flex" : "none" }}
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
            projectPath={workspace.project_path}
            openPath={openPath}
            active={visible && rightPanel === "editor"}
          />
        </div>
        {/* Diff panel — kept mounted; the selected-file diff survives the toggle.
            `active` is gated on BOTH workspace visibility AND the diff tab being
            front so a backgrounded panel doesn't auto-refresh its file list. */}
        <div
          className="right-panel-slot"
          style={{ display: rightPanel === "diff" ? "flex" : "none" }}
        >
          <DiffPanel
            projectPath={workspace.project_path}
            active={visible && rightPanel === "diff"}
            onOpenInEditor={(path) => {
              setOpenPath(path);
              setRightPanel("editor");
            }}
          />
        </div>
      </div>
    </div>
  );
}
