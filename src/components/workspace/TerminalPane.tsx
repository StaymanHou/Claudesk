// WP9 — TerminalPane: a terminal in the right half of a workspace.
//
// A thin wrapper over XtermPane that spawns the user's interactive login SHELL (via
// the `term_spawn` backend command) instead of Claude Code. Everything else — the
// PTY bridge, input/resize/kill commands, the `cc-output-<sid>`/`cc-exit-<sid>` event
// stream, the DOM renderer, focus-on-click, the ended/error overlays — is shared with
// XtermPane unchanged (the spawn target is the only difference; see XtermPane header).
//
// M6 WP11 — the right panel now holds a LIST of terminals (open/switch/close N), so the
// session id is passed IN by the owner (RightPanelHost, from the terminalList model)
// rather than derived as the single hardcoded `${workspaceId}-term`. Each TerminalPane
// is keyed by its entry id and stays MOUNTED while the right panel switches away
// (display:none in RightPanelHost), so every shell session + scrollback survives panel,
// terminal-tab, and center-stage switches. Closing a terminal UNMOUNTS its pane →
// XtermPane's unmount cleanup reaps that session's PTY (cc_kill) for free.
//
// M6 WP10/WP11 — forwards an XtermPaneHandle ref so the owner can drive THIS terminal's
// focus-scoped font zoom (setFontSize). The pane also carries `data-session-id` (via
// XtermPane → its host) so the zoom router can resolve which terminal among N is focused.

import { forwardRef } from "react";
import { XtermPane, type XtermPaneHandle } from "./XtermPane";

interface TerminalPaneProps {
  /**
   * The backend PTY session id for THIS terminal (`${workspaceId}-term-<n>`, from the
   * terminalList model). Used as XtermPane's session key AND rendered as the host's
   * `data-session-id` for zoom routing.
   */
  sessionId: string;
  /** Absolute project dir the shell is `cd`'d into. */
  projectPath: string;
  /**
   * True when this workspace is focused AND the terminal panel is front AND THIS terminal
   * is the active one in the list. The shell spawn is DEFERRED until this is first true
   * (no shell into a hidden zero-size xterm; no shell for an unopened terminal), and a
   * refit/repaint fires whenever it flips back to true.
   */
  active: boolean;
}

export const TerminalPane = forwardRef<XtermPaneHandle, TerminalPaneProps>(
  function TerminalPane({ sessionId, projectPath, active }, ref) {
    return (
      <XtermPane
        ref={ref}
        workspaceId={sessionId}
        dataSessionId={sessionId}
        projectPath={projectPath}
        spawnCommand="term_spawn"
        errorTitle="Could not start terminal"
        testId="term-pane"
        active={active}
      />
    );
  },
);
