// M3 WP6 — the honest CC-status indicator on a workspace's chrome.
//
// A dot + label derived SOLELY from the `workspace-status` hook channel (never
// PTY output). The wire state → presentation map is the pure `statusPresentation`
// (unit-tested); this component is just the render. `unknown` is the honest
// default a workspace shows before any hook event arrives.
//
// Dark-only (project convention): dot colors live in App.css, no light tokens.

import {
  linkOverlayTitle,
  statusPresentation,
  type WireLinkOverlay,
  type WireWorkspaceState,
} from "../../state/workspaceStatus";

interface WorkspaceStatusIndicatorProps {
  state: WireWorkspaceState;
  /** Optional last prompt/message snippet — surfaced as the element title (tooltip). */
  snippet?: string;
  /**
   * M17 WP4 (AC-6.2) — a remote workspace whose terminal is not attached: the dot keeps its
   * LAST hue, dimmed, with a broken-link glyph, and the tooltip says so in plain words.
   */
  link?: WireLinkOverlay;
}

/** A broken chain link (M17 WP4): two link halves pulled apart, drawn in `currentColor`. */
function BrokenLinkGlyph() {
  return (
    <svg
      className="status-link-glyph"
      data-testid="status-link-glyph"
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
    >
      <path
        d="M6.5 9.5 4.6 11.4a2 2 0 0 1-2.8-2.8L3.7 6.7M9.5 6.5l1.9-1.9a2 2 0 0 1 2.8 2.8l-1.9 1.9M5 2v2M2 5h2M11 14v-2M14 11h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WorkspaceStatusIndicator({
  state,
  snippet,
  link,
}: WorkspaceStatusIndicatorProps) {
  const { label, dotClass } = statusPresentation(state);
  return (
    <span
      className={`workspace-status-indicator${link ? " status-link-lost" : ""}`}
      data-testid="workspace-status-indicator"
      data-state={state}
      data-link={link?.status}
      title={link ? linkOverlayTitle(link) : (snippet ?? label)}
    >
      <span className={`status-dot ${dotClass}`} aria-hidden="true" />
      {link && <BrokenLinkGlyph />}
      <span className="workspace-status-label">{label}</span>
    </span>
  );
}
