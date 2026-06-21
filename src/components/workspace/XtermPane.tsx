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
  /** Absolute path the session is `cd`'d into. */
  projectPath: string;
  /** Called once the backend issues a session id, so WorkspaceList can store it. */
  onSessionId?: (sessionId: string) => void;
  /**
   * The Tauri spawn command to call. Defaults to `cc_spawn` (the left-half Claude Code
   * pane); the WP9 second-terminal panel passes `term_spawn` (login shell). Both return
   * a session id and stream on `cc-output-<sid>`/`cc-exit-<sid>` — the input/resize/kill
   * commands + events are session-id-keyed and command-agnostic, so only the spawn call
   * + the overlay copy differ.
   */
  spawnCommand?: "cc_spawn" | "term_spawn";
  /** Overlay copy shown when the spawn fails (defaults to the Claude Code wording). */
  errorTitle?: string;
  /** data-testid on the pane host (defaults to `xterm-pane`). */
  testId?: string;
  /**
   * Whether the pane is currently visible/front. Defaults to `true` (the always-visible
   * left-half CC pane). The WP9 terminal panel (display:none until its tab is front)
   * passes `visible && panel === "terminal"`: the spawn is DEFERRED until first active
   * (no shell into a zero-size hidden xterm; no shell for an unopened panel), and a
   * refit+repaint fires on each transition to active so a hidden-then-revealed terminal
   * redraws (SIGWINCH → the shell repaints its prompt).
   */
  active?: boolean;
}

export function XtermPane({
  workspaceId,
  projectPath,
  onSessionId,
  spawnCommand = "cc_spawn",
  errorTitle = "Could not start Claude Code",
  testId = "xterm-pane",
  active = true,
}: XtermPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Live session id for the input/resize callbacks (a ref so the handlers wired at
  // mount always see the current id without re-subscribing).
  const sessionIdRef = useRef<string | null>(null);
  const [bridge, dispatch] = useReducer(bridgeReducer, initialBridgeState);

  // The spawn effect must fire ONLY when the spawn conditions change (phase / path /
  // command / active) — NOT when a parent re-render hands us a new `onSessionId` arrow
  // identity. Re-running the spawn on callback-identity churn was firing multiple
  // `invoke(spawnCommand)` calls before the first resolved, leaking duplicate sessions
  // (telemetry: 3 CC sessions for one pane — the real root cause, latent since WP7 since
  // Workspace passes an inline `onSessionId` arrow). Hold it in a ref so the spawn body
  // reads the latest without the spawn effect depending on its identity.
  const onSessionIdRef = useRef(onSessionId);
  useEffect(() => {
    onSessionIdRef.current = onSessionId;
  }, [onSessionId]);

  // Session-listener disposers, held in a ref so they live until TRUE unmount or
  // relaunch — NOT torn down on the spawn effect's re-runs. The spawn effect re-runs
  // when `bridge.phase` flips spawning→live (it dispatches that itself); coupling the
  // unlisten to the effect cleanup tore the listener down one tick after spawning, so a
  // shell's prompt (which arrives ~100ms later, after the cleanup) was emitted to no
  // listener and lost — while CC survived only because its output flushed synchronously
  // before that cleanup. This decouples listener lifetime from effect re-runs.
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const disposeListeners = () => {
    for (const un of unlistenersRef.current) un();
    unlistenersRef.current = [];
  };
  // In-flight unmount guard: a spawn whose awaits resolve after a true unmount must not
  // attach to a dead pane. Reset at the top of the mount effect (handles StrictMode + a
  // future remount); set in the mount-effect cleanup.
  const unmountedRef = useRef(false);

  // Re-launch / Retry: tear the old (ended/failed) session down — dispose its listeners,
  // kill any lingering backend session — then flip the bridge to "spawning" so the spawn
  // effect fires a fresh single spawn. (Listeners aren't disposed by the spawn effect's
  // re-runs, so relaunch must do it explicitly here.)
  const handleRelaunch = () => {
    disposeListeners();
    const sid = sessionIdRef.current;
    if (sid) void invoke("cc_kill", { sessionId: sid }).catch(() => {});
    sessionIdRef.current = null;
    dispatch({ type: "relaunch" });
  };

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

    // Fresh terminal → reset the in-flight unmount guard (handles a remount, incl.
    // StrictMode's dev mount→cleanup→remount). The session is born with this terminal.
    unmountedRef.current = false;

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
      // True unmount: tear the session down (listeners + backend process) so we don't
      // leak an orphan. The spawn effect deliberately does NOT do this on its re-runs —
      // only real unmount ends the session. (Window-close is also covered by the backend
      // kill_all; this covers a single pane unmounting.)
      unmountedRef.current = true;
      disposeListeners();
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sid) void invoke("cc_kill", { sessionId: sid }).catch(() => {});
    };
  }, [workspaceId, fitAndResize]);

  // Spawn (and re-spawn on relaunch) the session. Keyed on the bridge phase flipping to
  // "spawning" — the initial mount and every "relaunch" both land here. Gated on
  // `active`: the WP9 terminal panel mounts hidden (display:none until its tab is front)
  // and passes active=false, DEFERRING its spawn until first revealed — so the shell
  // never starts into a zero-size xterm and an unopened terminal panel costs no shell.
  // The CC pane is always active=true → spawns at mount, as before.
  //
  // The closure `cancelled` flag (NOT a ref) is load-bearing for de-duping: each effect
  // re-run (incl. React StrictMode's dev mount→cleanup→remount, and any `active`/dep
  // churn) gets its own `cancelled`; the prior run's cleanup sets ITS cancelled=true, so
  // a spawn whose `await` resolves after that cleanup kills its orphan and attaches
  // nothing. Net: exactly one live session survives. (Reverting a WP9 ref-based rewrite
  // that broke this and spawned duplicates — see WIP F12 re-entry #2 telemetry.)
  useEffect(() => {
    if (bridge.phase !== "spawning" || !active) return;

    async function spawn() {
      try {
        const sessionId = await invoke<string>(spawnCommand, { projectPath });
        if (unmountedRef.current) {
          // Unmounted while spawning — kill the orphan, attach nothing.
          void invoke("cc_kill", { sessionId }).catch(() => {});
          return;
        }
        sessionIdRef.current = sessionId;
        onSessionIdRef.current?.(sessionId);

        // Listeners live in unlistenersRef → disposed only on true unmount / relaunch,
        // NOT on this effect's phase-flip re-run (that was the prompt-loss bug).
        unlistenersRef.current.push(
          await listen<string>(`cc-output-${sessionId}`, (event) => {
            termRef.current?.write(decodeBase64(event.payload));
          }),
        );
        unlistenersRef.current.push(
          await listen(`cc-exit-${sessionId}`, () => {
            dispatch({ type: "exited" });
          }),
        );

        if (unmountedRef.current) {
          disposeListeners();
          void invoke("cc_kill", { sessionId }).catch(() => {});
          return;
        }

        // Listeners attached — flush the backend's pre-subscription backlog + go live.
        void invoke("cc_ready", { sessionId }).catch(() => {});

        dispatch({ type: "spawned", sessionId });

        // The PTY was opened at a default 80x24; sync it to the real fitted size now
        // that we have a session id. rAF ensures layout has settled so fit() reads the
        // true pane width. Refocus so the freshly live terminal takes keystrokes.
        requestAnimationFrame(() => {
          fitAndResize();
          termRef.current?.focus();
        });
      } catch (err) {
        if (unmountedRef.current) return;
        dispatch({ type: "spawn-failed", errorMsg: String(err) });
      }
    }
    void spawn();

    // NOTE: no listener teardown here on purpose — see unlistenersRef. This effect's
    // re-run (e.g. on the spawning→live phase flip) must NOT dispose the live listener.
  }, [bridge.phase, projectPath, fitAndResize, spawnCommand, active]);

  // Repaint on becoming active. A pane hidden with display:none has zero size, so xterm
  // output written/laid-out while hidden is degenerate; on reveal we refit (recompute
  // cols/rows for the now-real width) + push the size to the PTY (SIGWINCH → the shell
  // repaints its prompt) and refocus. No-op for the always-active CC pane (active never
  // flips, so this fires once at mount — harmless, same as the post-spawn rAF).
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      fitAndResize();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active, fitAndResize]);

  return (
    <div className="xterm-pane-wrap">
      <div
        className="xterm-pane"
        ref={hostRef}
        data-testid={testId}
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
            onClick={handleRelaunch}
          >
            Re-launch
          </button>
        </div>
      )}
      {bridge.phase === "error" && (
        <div className="cc-overlay" data-testid="cc-error-overlay">
          <p className="cc-overlay-title">{errorTitle}</p>
          <p className="cc-overlay-detail cc-overlay-error">
            {bridge.errorMsg ?? "Unknown error."}
          </p>
          <button
            type="button"
            className="cc-overlay-button"
            data-testid="cc-retry"
            onClick={handleRelaunch}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
