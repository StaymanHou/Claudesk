// M3 WP6 — the honest CC-status indicator on a workspace's chrome.
//
// A dot + label derived SOLELY from the `workspace-status` hook channel (never
// PTY output). The wire state → presentation map is the pure `statusPresentation`
// (unit-tested); this component is just the render. `unknown` is the honest
// default a workspace shows before any hook event arrives.
//
// Dark-only (project convention): dot colors live in App.css, no light tokens.

import {
  statusPresentation,
  type WireWorkspaceState,
} from "../../state/workspaceStatus";

interface WorkspaceStatusIndicatorProps {
  state: WireWorkspaceState;
  /** Optional last prompt/message snippet — surfaced as the element title (tooltip). */
  snippet?: string;
}

export function WorkspaceStatusIndicator({
  state,
  snippet,
}: WorkspaceStatusIndicatorProps) {
  const { label, dotClass } = statusPresentation(state);
  return (
    <span
      className="workspace-status-indicator"
      data-testid="workspace-status-indicator"
      data-state={state}
      title={snippet ?? label}
    >
      <span className={`status-dot ${dotClass}`} aria-hidden="true" />
      <span className="workspace-status-label">{label}</span>
    </span>
  );
}
