// WP5/WP7 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: a Sublime toolbar (WP8) above the lite editor. WP2 lands the
// editor (EditorPanel); the full Editor/Diff/2nd-terminal swap is WP5
// (RightPanelHost), and the git diff viewer is WP4.
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
        <EditorPanel projectPath={workspace.project_path} openPath={openPath} />
      </div>
    </div>
  );
}
