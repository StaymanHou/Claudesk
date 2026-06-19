// WP7 — XtermPane: the left half of a workspace, now backed by a real CC PTY.
//
// Replaces the WP5 mock banner with a live `claude --dangerously-skip-permissions`
// session: on mount it calls `cc_spawn`, streams `cc-output-<sid>` into the
// terminal, pipes xterm `onData` keystrokes to `cc_input`, and propagates fit
// resizes to `cc_resize`. The session lifecycle (spawning / live / ended / error)
// is the pure `bridge` state machine; this component only wires it to React + IPC.
//
// DOM renderer ONLY — @xterm/addon-webgl is deliberately never imported (research:
// ~16 WebGL contexts/page cap; the tab shell would hit it).
//
// Error surfacing: a `cc_spawn` rejection is a silent dead-click unless surfaced
// (the WP6 picker MAJOR lesson — Tauri `invoke` rejections vanish without a catch).
// Here the bridge `error` phase renders the message with a Retry button.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import {
  bridgeReducer,
  decodeBase64,
  encodeBase64,
  initialBridgeState,
} from "../../cc/bridge";

interface XtermPaneProps {
  workspaceId: string;
  /** Absolute path the CC session is `cd`'d into. */
  projectPath: string;
  /** Called once the backend issues a session id, so WorkspaceList can store it. */
  onSessionId?: (sessionId: string) => void;
}

export function XtermPane({
  workspaceId,
  projectPath,
  onSessionId,
}: XtermPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Live session id for the input/resize callbacks (a ref so the handlers wired at
  // mount always see the current id without re-subscribing).
  const sessionIdRef = useRef<string | null>(null);
  const [bridge, dispatch] = useReducer(bridgeReducer, initialBridgeState);

  // Fit the terminal to its container and push the resulting cols/rows to the PTY.
  // The single chokepoint for size sync — used by mount, ResizeObserver, and the
  // post-spawn sync, so CC always gets the *real* fitted size (not the 80x24 the
  // PTY was opened at). Guards against the display:none (zero-size) case.
  const fitAndResize = useCallback(() => {
    const host = hostRef.current;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!host || !term || !fit || host.offsetParent === null) return;
    fit.fit();
    const sid = sessionIdRef.current;
    if (!sid) return;
    void invoke("cc_resize", {
      sessionId: sid,
      cols: term.cols,
      rows: term.rows,
    }).catch(() => {});
  }, []);

  // Mount the xterm terminal once per workspace; wire keystrokes + resize. This
  // effect does NOT depend on the session — it owns the terminal for the pane's
  // lifetime (the "all workspaces stay mounted" rule).
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
    termRef.current = term;
    fitRef.current = fit;

    // Fit AFTER layout settles. On first mount the flex/grid cell may not have its
    // final width during the synchronous effect, so a synchronous fit() computes a
    // too-narrow size (the 80-col bug). rAF defers until the browser has laid out.
    const raf = requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    // Keystrokes → cc_input (base64). The session id is read from the ref so this
    // handler, wired once, always targets the current session.
    const onDataDisposable = term.onData((data) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      void invoke("cc_input", {
        sessionId: sid,
        data: encodeBase64(data),
      }).catch(() => {
        // Input after the session died is benign — the exit event drives the UI.
      });
    });

    const observer = new ResizeObserver(() => {
      fitAndResize();
    });
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      onDataDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [workspaceId, fitAndResize]);

  // Spawn (and re-spawn on relaunch) the CC session. Keyed on the bridge phase
  // flipping to "spawning" — the initial mount and every "relaunch" both land here.
  useEffect(() => {
    if (bridge.phase !== "spawning") return;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    let cancelled = false;

    async function spawn() {
      try {
        const sessionId = await invoke<string>("cc_spawn", { projectPath });
        if (cancelled) {
          // Component unmounted mid-spawn — kill the orphan we just created.
          void invoke("cc_kill", { sessionId }).catch(() => {});
          return;
        }
        sessionIdRef.current = sessionId;
        onSessionId?.(sessionId);

        unlistenOutput = await listen<string>(
          `cc-output-${sessionId}`,
          (event) => {
            termRef.current?.write(decodeBase64(event.payload));
          },
        );
        unlistenExit = await listen(`cc-exit-${sessionId}`, () => {
          dispatch({ type: "exited" });
        });

        dispatch({ type: "spawned", sessionId });

        // The PTY was opened at a default 80x24; sync it to the real fitted size
        // now that we have a session id. rAF ensures layout has settled so fit()
        // reads the true pane width (the 80-col / no-reflow bug). Refocus so the
        // freshly live terminal takes keystrokes without a click.
        requestAnimationFrame(() => {
          fitAndResize();
          termRef.current?.focus();
        });
      } catch (err) {
        if (cancelled) return;
        dispatch({ type: "spawn-failed", errorMsg: String(err) });
      }
    }
    void spawn();

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenExit?.();
    };
  }, [bridge.phase, projectPath, onSessionId, fitAndResize]);

  return (
    <div className="xterm-pane-wrap">
      <div
        className="xterm-pane"
        ref={hostRef}
        data-testid="xterm-pane"
        // Clicking the pane focuses the xterm textarea so keystrokes register
        // (a fresh PTY pane in a WKWebview does not reliably auto-focus xterm).
        onMouseDown={() => termRef.current?.focus()}
      />
      {bridge.phase === "ended" && (
        <div className="cc-overlay" data-testid="cc-ended-overlay">
          <p className="cc-overlay-title">Session ended</p>
          <p className="cc-overlay-detail">
            The Claude Code session for this workspace has exited
            {bridge.exitCode !== null ? ` (code ${bridge.exitCode})` : ""}.
          </p>
          <button
            type="button"
            className="cc-overlay-button"
            data-testid="cc-relaunch"
            onClick={() => dispatch({ type: "relaunch" })}
          >
            Re-launch
          </button>
        </div>
      )}
      {bridge.phase === "error" && (
        <div className="cc-overlay" data-testid="cc-error-overlay">
          <p className="cc-overlay-title">Could not start Claude Code</p>
          <p className="cc-overlay-detail cc-overlay-error">
            {bridge.errorMsg ?? "Unknown error."}
          </p>
          <button
            type="button"
            className="cc-overlay-button"
            data-testid="cc-retry"
            onClick={() => dispatch({ type: "relaunch" })}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
