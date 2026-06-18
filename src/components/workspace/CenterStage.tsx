// WP5 — CenterStage: renders the focused workspace at full size.
//
// It renders EVERY workspace in the list (so all stay mounted, per the
// "All workspaces stay mounted" rule) and toggles visibility via the
// Workspace component's `visible` prop. Phase 1: the list holds <= 1
// workspace, so exactly one is shown. Phase 2: N workspaces, one focused.

import { Workspace } from "./Workspace";
import type { Workspace as WorkspaceModel } from "../../state/workspace";

interface CenterStageProps {
  workspaces: WorkspaceModel[];
  focusedId: string | null;
}

export function CenterStage({ workspaces, focusedId }: CenterStageProps) {
  return (
    <div className="center-stage" data-testid="center-stage">
      {workspaces.map((ws) => (
        <Workspace key={ws.id} workspace={ws} visible={ws.id === focusedId} />
      ))}
    </div>
  );
}
