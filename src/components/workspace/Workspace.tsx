// WP5/WP7 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: a placeholder card. The built-in lite editor + git diff viewer
// arrive in Phase 3 (WP26/WP27).
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it is hidden
// with `display:none` so its xterm + PTY connection persist. The `visible` prop
// drives that toggle.

import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "./XtermPane";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** Store the backend CC session id once cc_spawn resolves (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
}

export function Workspace({ workspace, visible, onSessionId }: WorkspaceProps) {
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
        <div className="placeholder-card">
          <h2>{workspace.display_name}</h2>
          <p className="placeholder-coming">Coming in Phase 3</p>
          <p className="placeholder-detail">
            Built-in lite editor + git diff viewer.
          </p>
        </div>
      </div>
    </div>
  );
}
