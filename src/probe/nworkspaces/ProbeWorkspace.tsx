// M4 WP1 probe — a single workspace pane for the N-workspace cost probe.
// THROWAWAY probe code. DEV-only.
//
// Reuses the REAL shipped halves — XtermPane (left) + RightPanelHost (right) — so
// the per-workspace mount cost is IDENTICAL to production's `Workspace` component.
// The ONLY reason this isn't the shipped `Workspace` directly: the `term=shell`
// fallback (P1.2) needs to pass spawnCommand="term_spawn" to the left XtermPane,
// which `Workspace` doesn't expose (it hard-wires cc_spawn). Everything else —
// the grid layout, the display:none-keeps-mounted toggle, the header — mirrors
// `src/components/workspace/Workspace.tsx` exactly.

import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "../../components/workspace/XtermPane";
import { RightPanelHost } from "../../components/workspace/RightPanelHost";

interface ProbeWorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** cc → real Claude Code (cc_spawn); shell → plain login shell (term_spawn). */
  termBacking: "cc" | "shell";
}

export function ProbeWorkspace({
  workspace,
  visible,
  termBacking,
}: ProbeWorkspaceProps) {
  return (
    <div
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      // display:none keeps the subtree mounted (xterm + PTY persist) — the
      // production "all workspaces stay mounted" rule, exercised at N here.
      style={{ display: visible ? "grid" : "none" }}
    >
      <div className="workspace-header" data-testid="workspace-header">
        <span className="workspace-header-name">{workspace.display_name}</span>
      </div>
      <div className="workspace-left">
        <XtermPane
          workspaceId={workspace.id}
          projectPath={workspace.project_path}
          spawnCommand={termBacking === "shell" ? "term_spawn" : "cc_spawn"}
          errorTitle={
            termBacking === "shell"
              ? "Could not start shell"
              : "Could not start Claude Code"
          }
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
