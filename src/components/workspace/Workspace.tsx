// WP5 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: the RightPanelHost (WP5) — owns the Editor↔Diff(↔terminal) panels,
// the panel-select hotkeys (⌘⇧E/D/T), and the external-Sublime launch icon buttons
// (in the panel tab row, WP8).
// (Before WP5 the right half was an inline segmented toggle living in this file.)
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it stays mounted
// (xterm + PTY connection persist) but is pushed OFF-VIEWPORT (`left:-99999px`),
// NOT hidden with `display:none`. Two reasons, both load-bearing for M4 WP3's live
// filmstrip mirror (WP4 thumbnail-probe findings):
//   1. Off-viewport keeps the element laid out with real dimensions, so xterm's
//      FitAddon `fit()` still works (`display:none` → zero dims → `fit()` throws).
//   2. Off-viewport lets xterm's IntersectionObserver PAUSE the background
//      renderer for free (~5ms/frame saved) while the buffer still updates via
//      `write()` — so the filmstrip can read a current `serializeAsHTML()` snapshot
//      from the paused-renderer buffer (WP3 P3). `display:none` would also pause
//      rendering but breaks fit + can't be serialized into a sized tile.
// The `visible` prop drives that toggle, and is forwarded to RightPanelHost to gate
// panel liveness + the capture-phase hotkey (only the focused workspace's host reacts).

import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane } from "./XtermPane";
import { RightPanelHost } from "./RightPanelHost";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";
import type { WireWorkspaceState } from "../../state/workspaceStatus";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** Store the backend CC session id once cc_spawn resolves (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
  /**
   * Live CC state from the `workspace-status` hook channel (M3 WP6). Defaults to
   * `"unknown"` — the honest no-data state before any hook event arrives. Phase 2
   * feeds the live value from the app-level subscription.
   */
  statusState?: WireWorkspaceState;
  /** Last prompt/message snippet for the indicator tooltip (M3 WP6). */
  statusSnippet?: string;
}

export function Workspace({
  workspace,
  visible,
  onSessionId,
  statusState = "unknown",
  statusSnippet,
}: WorkspaceProps) {
  return (
    <div
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      data-visible={visible ? "true" : "false"}
      // Always display:grid (real dimensions → FitAddon works); hidden workspaces
      // are pushed off-viewport instead of `display:none`. See the header comment:
      // this is what keeps background xterm buffers serializable for the WP3
      // filmstrip mirror while xterm pauses their off-screen renderer.
      style={
        visible
          ? { display: "grid" }
          : {
              display: "grid",
              position: "absolute",
              left: "-99999px",
              top: 0,
              // Match the on-stage footprint so FitAddon sizes the background
              // terminal the same as it will appear once promoted.
              width: "100%",
              height: "100%",
            }
      }
    >
      <div className="workspace-header" data-testid="workspace-header">
        <span className="workspace-header-name">{workspace.display_name}</span>
        <WorkspaceStatusIndicator state={statusState} snippet={statusSnippet} />
      </div>
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
