// WP9 — TerminalPane: the second-terminal panel in the right half of a workspace.
//
// A thin wrapper over XtermPane that spawns the user's interactive login SHELL (via
// the `term_spawn` backend command) instead of Claude Code. Everything else — the
// PTY bridge, input/resize/kill commands, the `cc-output-<sid>`/`cc-exit-<sid>` event
// stream, the DOM renderer, focus-on-click, the ended/error overlays — is shared with
// XtermPane unchanged (the spawn target is the only difference; see XtermPane header).
//
// One terminal session per workspace (v1 — no tabbed terminals). The pane stays
// MOUNTED when the right panel switches away (display:none in RightPanelHost), so the
// shell session + scrollback survive panel + center-stage switches.

import { XtermPane } from "./XtermPane";

interface TerminalPaneProps {
  /** The workspace id (terminal session is keyed per workspace). */
  workspaceId: string;
  /** Absolute project dir the shell is `cd`'d into. */
  projectPath: string;
  /**
   * True when this workspace is focused AND the terminal panel is front
   * (`visible && panel === "terminal"`). The shell spawn is DEFERRED until this is
   * first true (no shell into a hidden zero-size xterm; no shell for an unopened panel),
   * and a refit/repaint fires whenever it flips back to true.
   */
  active: boolean;
}

export function TerminalPane({
  workspaceId,
  projectPath,
  active,
}: TerminalPaneProps) {
  return (
    <XtermPane
      workspaceId={`${workspaceId}-term`}
      projectPath={projectPath}
      spawnCommand="term_spawn"
      errorTitle="Could not start terminal"
      testId="term-pane"
      active={active}
    />
  );
}
