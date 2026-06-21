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

  // Re-launch / Retry: kill any lingering backend session, then flip the bridge to
  // "spawning" so the spawn effect fires a fresh spawn. The ended/failed run's listeners
  // were already disposed by that run's effect cleanup, so we only kill the backend here.
  const handleRelaunch = () => {
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
      // Note: the backend session is reaped on window close via SessionRegistry::kill_all
      // (robust against a frozen webview). A single pane unmounting mid-run is handled by
      // the spawn effect's `cancelled` self-kill; a live session outliving its pane only
      // happens at app shutdown, which kill_all covers. (No per-pane kill here, matching
      // the proven WP7 lifecycle — multi-workspace pane-close will revisit this.)
    };
  }, [workspaceId, fitAndResize]);

  // Spawn (and re-spawn on relaunch) the session. Keyed on the bridge phase being
  // "spawning" — the initial mount and every "relaunch" land here. Gated on `active`:
  // the WP9 terminal panel mounts hidden (display:none until its tab is front) and
  // passes active=false, DEFERRING its spawn until first revealed — so the shell never
  // starts into a zero-size xterm and an unopened terminal panel costs no shell. The CC
  // pane is always active=true → spawns at mount, as before.
  //
  // LIFECYCLE (this file's back-loops were all about this — read before editing):
  //  - The per-run closure `cancelled` flag is the de-dup primitive and MUST stay a
  //    closure var, not a ref: each effect run captures its own `cancelled`; its cleanup
  //    sets THAT run's flag, so a spawn whose `await` resolves after its run was torn
  //    down (StrictMode mount→cleanup→remount, an `active`-churn re-run, or a real
  //    unmount) self-kills its orphan and attaches nothing — exactly one session
  //    survives. A ref-based latch was tried and leaked 2 live sessions per pane (a later
  //    run reset the ref before the first spawn resolved). Do not "simplify" to a ref.
  //  - The shell's one-shot prompt is not lost despite the cleanup unlisten-on-re-run:
  //    the backend BUFFERS output until `cc_ready`, and we call `cc_ready` here while
  //    this run's listener is still attached, so the buffered prompt flushes to a live
  //    listener before the spawning→live re-run's cleanup tears it down. (Backend buffer-
  //    and-flush is the real prompt-race fix; see cc_session::mark_ready + WIP telemetry.)
  useEffect(() => {
    if (bridge.phase !== "spawning" || !active) return;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    let cancelled = false;

    async function spawn() {
      try {
        const sessionId = await invoke<string>(spawnCommand, { projectPath });
        if (cancelled) {
          // This effect run was torn down (unmount, or a dep/`active` re-run) before the
          // spawn resolved — kill the orphan we just created and attach nothing. This
          // per-run closure flag is the StrictMode-correct de-dup primitive (WP7): run 1
          // spawns S1, its cleanup sets cancelled1=true, so when S1 resolves it self-kills
          // and only the surviving run's session lives. A ref cannot do this (run 2 would
          // reset it before S1 resolves) — that mistake leaked 2 live sessions per pane.
          void invoke("cc_kill", { sessionId }).catch(() => {});
          return;
        }
        sessionIdRef.current = sessionId;
        onSessionIdRef.current?.(sessionId);

        unlistenOutput = await listen<string>(
          `cc-output-${sessionId}`,
          (event) => {
            termRef.current?.write(decodeBase64(event.payload));
          },
        );
        unlistenExit = await listen(`cc-exit-${sessionId}`, () => {
          dispatch({ type: "exited" });
        });

        if (cancelled) {
          // Torn down between the awaits — dispose what we attached + kill.
          unlistenOutput?.();
          unlistenExit?.();
          void invoke("cc_kill", { sessionId }).catch(() => {});
          return;
        }

        // Listeners attached — flush the backend's pre-subscription backlog (the shell's
        // one-shot prompt was buffered since spawn) + switch to live. The flush happens
        // NOW, while this run's listener is attached, so the prompt lands even though the
        // cleanup below will unlisten on the imminent spawning→live re-run.
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
