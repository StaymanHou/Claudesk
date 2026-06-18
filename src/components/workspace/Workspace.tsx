// WP5 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal (WP5 mock; WP7 real CC PTY).
// Right half: a placeholder card. The built-in lite editor + git diff viewer
// arrive in Phase 3 (WP26/WP27).
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it is hidden
// with `display:none` so its xterm + (Phase 2) PTY connection persist. The
// `visible` prop drives that toggle.

import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "./XtermPane";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
}

export function Workspace({ workspace, visible }: WorkspaceProps) {
  return (
    <div
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      // display:none keeps the subtree mounted (xterm + future PTY persist).
      style={{ display: visible ? "grid" : "none" }}
    >
      <div className="workspace-left">
        <XtermPane workspaceId={workspace.id} />
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
