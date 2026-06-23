// WP5 — CenterStage: renders the focused workspace at full size.
//
// It renders EVERY workspace in the list (so all stay mounted, per the
// "All workspaces stay mounted" rule) and toggles visibility via the
// Workspace component's `visible` prop. As of M4 WP2 the list holds N
// workspaces (one focused, the rest `display:none` but mounted); before WP2
// the list was clamped to <= 1. This component needed NO change for N>1 —
// the map-over-all + `visible` toggle was N-ready from the start.

import { Workspace } from "./Workspace";
import type { Workspace as WorkspaceModel } from "../../state/workspace";
import type { WireWorkspaceState } from "../../state/workspaceStatus";

interface CenterStageProps {
  workspaces: WorkspaceModel[];
  focusedId: string | null;
  /** Forwarded to each Workspace so cc_spawn's session id reaches WorkspaceList (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
  /** Live CC state lookup by workspace id (M3 WP6 — the `workspace-status` channel). */
  statusFor?: (workspaceId: string) => WireWorkspaceState;
}

export function CenterStage({
  workspaces,
  focusedId,
  onSessionId,
  statusFor,
}: CenterStageProps) {
  return (
    <div className="center-stage" data-testid="center-stage">
      {workspaces.map((ws) => (
        <Workspace
          key={ws.id}
          workspace={ws}
          visible={ws.id === focusedId}
          onSessionId={onSessionId}
          statusState={statusFor?.(ws.id) ?? "unknown"}
        />
      ))}
    </div>
  );
}
