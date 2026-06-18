// WP5 — XtermPane: the left half of a workspace.
//
// Mounts an @xterm/xterm Terminal with the fit addon and writes MOCK data.
// DOM renderer ONLY — @xterm/addon-webgl is deliberately never imported
// (research: ~16 WebGL contexts/page cap; the tab shell would hit it). WP7
// replaces the mock `term.write` with the real PTY byte stream from
// PtyCcSession; the mount/dispose/fit lifecycle here is the seam that keeps.

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const MOCK_BANNER = [
  "Hello, mock CC\r\n",
  "\r\n",
  "  This is a WP5 mock terminal — no real Claude Code session yet.\r\n",
  "  The real PTY-backed CC session arrives in WP7.\r\n",
  "\r\n",
  "\x1b[32m●\x1b[0m claudesk \x1b[2m(mock)\x1b[0m $ ",
];

interface XtermPaneProps {
  /** Identifies which workspace this pane belongs to (for future per-session wiring). */
  workspaceId: string;
}

export function XtermPane({ workspaceId }: XtermPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontSize: 13,
      scrollback: 1000,
      cursorBlink: true,
      // DOM renderer is the default; no WebGL addon loaded.
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    for (const chunk of MOCK_BANNER) term.write(chunk);

    // Refit when the container resizes (workspace becomes visible, window
    // resize, divider drag in a later phase).
    const observer = new ResizeObserver(() => {
      // fit() throws if the element has zero size (e.g. display:none); guard.
      if (host.offsetParent !== null) fit.fit();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [workspaceId]);

  return <div className="xterm-pane" ref={hostRef} data-testid="xterm-pane" />;
}
