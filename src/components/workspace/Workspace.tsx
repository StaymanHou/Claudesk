// WP5 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: the RightPanelHost (WP5) — owns the Editor↔Diff(↔terminal) panels,
// the panel-select hotkeys (⌘⇧E/D/T), and the external-Sublime launch icon buttons
// (in the panel tab row, WP8).
// (Before WP5 the right half was an inline segmented toggle living in this file.)
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it is hidden
// with `display:none` so its xterm + PTY connection persist. The `visible` prop
// drives that toggle, and is forwarded to RightPanelHost to gate panel liveness +
// the capture-phase hotkey (only the focused workspace's host reacts).

import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "./XtermPane";
import { RightPanelHost } from "./RightPanelHost";

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
      <RightPanelHost
        workspaceId={workspace.id}
        projectPath={workspace.project_path}
        visible={visible}
      />
    </div>
  );
}
