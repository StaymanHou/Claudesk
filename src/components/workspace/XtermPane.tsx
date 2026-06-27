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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import {
  bridgeReducer,
  decodeBase64,
  encodeBase64,
  initialBridgeState,
} from "../../cc/bridge";
import { spawnTriggerDeps } from "../../cc/spawnTrigger";
import { shouldSpawnOnActive } from "../../cc/respawnGuard";
import {
  registerTerminalSerializer,
  unregisterTerminalSerializer,
} from "./terminalMirror";
import { loadTerminalFontSize } from "./terminalFontZoom";

/**
 * Imperative handle exposed via `ref` (QoL-WP3). The parent `Workspace` calls
 * `focus()` on the false→true `visible` edge so promoting a workspace to center stage
 * lands keyboard focus in its left CC terminal with zero clicks. Focus-only — it calls
 * `term.focus()` and NEVER writes a byte to the PTY (no cc_input, no \r/\n, no forced
 * resize), so a switch can't inject a spurious prompt line (the WP4 bug class).
 */
export interface XtermPaneHandle {
  focus(): void;
  /**
   * M6 WP3 — re-fit the terminal to its container and push cols/rows to the PTY.
   * Called by the parent on the un-collapse edge (display:none → shown): the
   * ResizeObserver may not reliably fire on a display flip under WKWebView, so the
   * parent nudges a fit. No-op while the host is still hidden (offsetParent guard).
   */
  refit(): void;
  /**
   * M6 WP4 — set the xterm font size live (focus-scoped ⌘+/⌘−/⌘0 zoom). Applies
   * `term.options.fontSize = px` then re-fits: a font change alters the cell size,
   * so the column/row count must be recomputed and pushed to the PTY (fitAndResize
   * does both). No-op before the terminal mounts. The PERSISTENCE + the next-size
   * math live in the parent (Workspace) via terminalFontZoom.ts; this handle is the
   * thin apply seam, so XtermPane stays unaware of the routing/storage.
   */
  setFontSize(px: number): void;
}

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

export const XtermPane = forwardRef<XtermPaneHandle, XtermPaneProps>(
  function XtermPane(
    {
      workspaceId,
      projectPath,
      onSessionId,
      spawnCommand = "cc_spawn",
      errorTitle = "Could not start Claude Code",
      testId = "xterm-pane",
      active = true,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    // Live session id for the input/resize callbacks (a ref so the handlers wired at
    // mount always see the current id without re-subscribing).
    const sessionIdRef = useRef<string | null>(null);
    // QoL-WP4 — true once a session has been spawned for this pane. The deferred-spawn
    // trigger effect consults this (via shouldSpawnOnActive) so the shell spawns on the
    // FIRST activation only — a re-activation (panel/center-stage switch-back) is inert.
    // Reset to false on a real teardown/relaunch so a fresh spawn is allowed again.
    const hasSpawnedRef = useRef(false);
    const [bridge, dispatch] = useReducer(bridgeReducer, initialBridgeState);

    // QoL-WP3 — imperative focus handle for the parent Workspace's visible-edge effect.
    // Null-safe: a no-op before the terminal mounts. Focus-ONLY (never writes to the PTY)
    // so a center-stage switch can't inject a spurious prompt line.
    // M6 WP3 — holds the latest fitAndResize so the imperative handle (defined here,
    // before fitAndResize) can call it without a reorder or a stale closure.
    const fitAndResizeRef = useRef<() => void>(() => {});
    useImperativeHandle(
      ref,
      () => ({
        focus: () => termRef.current?.focus(),
        refit: () => fitAndResizeRef.current(),
        setFontSize: (px: number) => {
          const term = termRef.current;
          if (!term) return;
          term.options.fontSize = px;
          // Re-fit after the cell size changes so cols/rows + the PTY stay correct.
          fitAndResizeRef.current();
        },
      }),
      [],
    );
    // Spawn trigger. The spawn effect keys on THIS (not `bridge.phase`) so the
    // spawning→live dispatch does NOT re-run the effect — which previously fired the
    // effect's cleanup and tore down the `cc-output` listener mid-spawn. For a
    // continuously-emitting process (CC) the lost listener was masked by later output;
    // for a one-shot emitter (the WP9 shell, whose prompt flushes exactly once via
    // `cc_ready`) the flushed prompt landed after the listener was gone → permanently
    // blank pane (incident-terminal-blank-cursor). Bumping this nonce is the sole
    // re-spawn signal; the listener now lives for the session's lifetime, torn down
    // only on a real teardown (unmount, active→false, projectPath/command change, relaunch).
    const [spawnNonce, setSpawnNonce] = useState(0);

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
    // "spawning". The ended/failed run's listeners were already disposed by that run's
    // effect cleanup, so we only kill the backend here. We do NOT bump the nonce directly —
    // clearing the spawn-once latch + resetting the phase to "spawning" lets the single
    // deferred-spawn trigger effect (QoL-WP4) fire the nonce bump on the phase transition,
    // so relaunch and first-spawn share ONE nonce-bump path (no risk of a double bump →
    // double spawn). Relaunch is always clicked on an on-screen pane, so `active` is true
    // and the trigger fires immediately.
    const handleRelaunch = () => {
      const sid = sessionIdRef.current;
      if (sid) void invoke("cc_kill", { sessionId: sid }).catch(() => {});
      sessionIdRef.current = null;
      // Clear the spawn-once latch so the trigger effect treats this as a fresh first-spawn.
      hasSpawnedRef.current = false;
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
    // Keep the imperative-handle ref pointing at the live fitAndResize (stable here
    // since the callback deps are []; assignment-on-render is fine for a ref).
    fitAndResizeRef.current = fitAndResize;

    // Mount the xterm terminal once per workspace; wire keystrokes + resize. This
    // effect does NOT depend on the session — it owns the terminal for the pane's
    // lifetime (the "all workspaces stay mounted" rule).
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const term = new Terminal({
        // M6 WP4 — seed from the persisted terminal zoom (default 11, matching the
        // historical hardcode) so the terminal mounts at the last-chosen size with
        // no flash-then-jump. Live changes go through the setFontSize handle.
        fontSize: loadTerminalFontSize(),
        scrollback: 1000,
        cursorBlink: true,
        // Explicit DARK theme (dark-mode-only project): light fg on a near-black bg. This
        // also drives the filmstrip mirror's colors — serializeAsHTML() emits each cell
        // with these fg/bg values, so the mirror reads as dark too (P3 verify-human: the
        // default theme rendered dark-on-white in the mirror tile). #1e1e1e matches the
        // editor/diff surfaces.
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
        },
        // DOM renderer is the default; no WebGL addon loaded.
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      // M4 WP3 P3 — SerializeAddon feeds the filmstrip's live ~1 fps background mirror.
      // Only the primary CC pane (cc_spawn, the workspace's left half) registers; the
      // WP9 second-terminal sub-panel (term_spawn) is not the workspace's mirror source.
      const serialize = new SerializeAddon();
      term.loadAddon(serialize);
      term.open(host);
      termRef.current = term;
      fitRef.current = fit;
      if (spawnCommand === "cc_spawn") {
        // The mirror must TAIL the latest output. serializeAsHTML anchors at the BOTTOM of
        // the buffer (active screen + `scrollback` rows of history), so a small positive
        // scrollback always captures the newest rows — even for a backgrounded terminal
        // whose on-screen viewport (ydisp) is parked and does NOT auto-advance while its
        // renderer is paused off-viewport. scrollback:0 froze the mirror once output scrolled
        // past the initial screen (P3 verify-human: "doesn't tail the bottom"); a ~40-row
        // tail keeps it current and the tile clips to show the bottom (App.css).
        // includeGlobalBackground:true → the block carries the dark bg (#1e1e1e) so the tile
        // is dark, not white (P3 verify-human dark-theme fix).
        registerTerminalSerializer(workspaceId, () =>
          serialize.serializeAsHTML({
            scrollback: 40,
            includeGlobalBackground: true,
          }),
        );
      }

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
        if (spawnCommand === "cc_spawn") {
          unregisterTerminalSerializer(workspaceId);
        }
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        // QoL-WP1 — PER-PANE KILL ON UNMOUNT. Closing a workspace genuinely REMOVES it
        // from the WorkspaceList array, so its <Workspace> truly unmounts (the explicit
        // EXCEPTION to "all workspaces stay mounted" — a center-stage switch only flips
        // display, never unmounts). Reaping the backend PTY here makes that one change
        // reap BOTH this workspace's left CC pane (cc_spawn) AND its WP9 second-terminal
        // pane (term_spawn) generically — both are XtermPane instances — without lifting
        // the second-terminal's session id up to App (it's owned here). Best-effort: a
        // kill failure must not block the unmount (mirrors kill_all's best-effort posture).
        //
        // STRICTMODE-SAFE: under React 19 StrictMode (dev) this mount effect runs
        // mount→cleanup→remount. The throwaway first mount sets sessionIdRef to the session
        // IT spawned (via the spawn effect), so this cleanup kills THAT session, and the
        // real remount spawns a fresh one — no surviving session is killed. (The spawn
        // effect's per-run `cancelled` self-kill already covers the spawn-resolves-after-
        // cleanup race.) This also closes the latent WP7 gap: before, a session outlived
        // its pane until window-close kill_all; now an unmount reaps it immediately.
        const sid = sessionIdRef.current;
        if (sid) {
          void invoke("cc_kill", { sessionId: sid }).catch((err) => {
            // Surfaced, never silently swallowed (the WP6 IPC-error lesson); does not block.
            console.error(`cc_kill on unmount failed for ${sid}:`, err);
          });
          sessionIdRef.current = null;
        }
      };
    }, [workspaceId, fitAndResize, spawnCommand]);

    // Spawn (and re-spawn on relaunch) the session. Keyed ONLY on `spawnNonce` (+ path /
    // command). The nonce is bumped by exactly two callers: the deferred-first-spawn trigger
    // effect below (once, on the first activation) and `handleRelaunch`. The initial mount
    // value `spawnNonce === 0` is the "not yet triggered" sentinel and spawns nothing — so
    // a hidden terminal panel costs no shell, and the always-active CC pane spawns via the
    // trigger effect's first bump (not an implicit mount spawn). This removes `active` from
    // this effect's deps entirely (QoL-WP4): a re-activation can no longer re-run it (which
    // re-spawned a fresh shell + tore the listeners down → lost history + stacked prompts).
    //
    // LIFECYCLE (this file's back-loops were all about this — read before editing):
    //  - The per-run closure `cancelled` flag is the de-dup primitive and MUST stay a
    //    closure var, not a ref: each effect run captures its own `cancelled`; its cleanup
    //    sets THAT run's flag, so a spawn whose `await` resolves after its run was torn
    //    down (StrictMode mount→cleanup→remount, a nonce re-run, or a real unmount)
    //    self-kills its orphan and attaches nothing — exactly one session survives. A
    //    ref-based latch was tried and leaked 2 live sessions per pane (a later run reset
    //    the ref before the first spawn resolved). Do not "simplify" to a ref.
    //  - The shell's one-shot prompt is not lost: the backend BUFFERS output until
    //    `cc_ready`, AND this effect no longer re-runs on the spawning→live dispatch
    //    (it keys on `spawnNonce`, not `bridge.phase`), so the cleanup does NOT tear the
    //    `cc-output` listener down mid-spawn. The listener stays attached when `cc_ready`
    //    flushes the buffered prompt, so a one-shot emitter (the WP9 shell) paints. Keying
    //    on `bridge.phase` previously re-ran the effect at "spawned", whose cleanup
    //    unlistened before the fire-and-forget flush arrived → blank pane
    //    (incident-terminal-blank-cursor). Backend buffer-and-flush is necessary but not
    //    sufficient; the listener must also survive the phase transition.
    useEffect(() => {
      // spawnNonce === 0 is the pre-trigger sentinel: nothing spawns until the deferred
      // trigger effect (or relaunch) bumps it. This is what defers the terminal panel and
      // serializes the CC pane's first spawn through the same single path.
      if (spawnNonce === 0) return;
      let unlistenOutput: UnlistenFn | undefined;
      let unlistenExit: UnlistenFn | undefined;
      let cancelled = false;

      async function spawn() {
        try {
          const sessionId = await invoke<string>(spawnCommand, { projectPath });
          if (cancelled) {
            // This effect run was torn down (unmount, or a nonce/path/command re-run) before
            // the spawn resolved — kill the orphan we just created and attach nothing. This
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

          // QoL-WP4 — the spawn has fully committed (session id minted, listeners attached,
          // not cancelled). Latch spawned NOW so the deferred-spawn trigger effect never
          // fires a second spawn on a later active false→true edge (the switch-back that
          // lost history). A cancelled/self-killed run never reaches here, so the latch is
          // only set for a session that actually survives.
          hasSpawnedRef.current = true;

          // Listeners attached — flush the backend's pre-subscription backlog (the shell's
          // one-shot prompt was buffered since spawn) + switch to live. The `spawned`
          // dispatch below no longer re-runs this effect (deps key on `spawnNonce`, not
          // `bridge.phase`), so this listener stays attached to receive the flush.
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
      // The re-spawn trigger set comes from `spawnTriggerDeps` (single source of truth,
      // unit-tested in spawnTrigger.test.ts): `spawnNonce`, `projectPath`, `spawnCommand`.
      // `bridge.phase` is deliberately EXCLUDED — re-adding it re-runs the effect on
      // spawning→live and tears down the listener (the blank-pane incident). `active` is
      // ALSO EXCLUDED (QoL-WP4): a re-activation (panel/center-stage switch-back) must NOT
      // re-run this effect — that re-spawned a fresh shell + tore the listeners down (lost
      // history + stacked prompts). Deferred FIRST-spawn is driven instead by the
      // `[active]`-keyed trigger effect below, which bumps `spawnNonce` once via
      // `shouldSpawnOnActive`. `fitAndResize` is a stable useCallback appended only to
      // satisfy exhaustive-deps; it is not a re-spawn trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- deps come from spawnTriggerDeps (the unit-tested contract) + the stable fitAndResize callback
    }, [
      ...spawnTriggerDeps({ spawnNonce, projectPath, spawnCommand }),
      fitAndResize,
    ]);

    // QoL-WP4 — DEFERRED FIRST-SPAWN trigger. The spawn effect above no longer depends on
    // `active` (so a re-activation can't re-run it). This tiny effect carries the deferral:
    // on the first edge where the pane is active AND no session exists yet
    // (`shouldSpawnOnActive`), it bumps `spawnNonce` to fire exactly one spawn. Subsequent
    // active false→true edges are inert because `hasSpawnedRef` is now true. The
    // always-active CC pane spawns at mount (active=true, hasSpawned=false → one bump);
    // the deferred terminal pane spawns on its first reveal. A relaunch clears the latch +
    // bumps the nonce itself, so it does not rely on this effect.
    useEffect(() => {
      if (
        shouldSpawnOnActive({ active, hasSpawned: hasSpawnedRef.current }) &&
        bridge.phase === "spawning"
      ) {
        setSpawnNonce((n) => n + 1);
      }
    }, [active, bridge.phase]);

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
  },
);
