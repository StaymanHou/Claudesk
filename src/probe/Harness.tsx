// WP4 probe harness — the measurement subject (Phase 2).
//
// Reproduces Phase 2's worst-case filmstrip render load:
//   1 ACTIVE center xterm (replaying a separate stream at full speed) +
//   8 BACKGROUND xterms (replaying the canned stream) mirrored into a filmstrip
//   of 8 thumbnail tiles at scale(0.15), mirror updates throttled to ~1 fps.
//
// Two arms, runtime-toggleable (research-grounded — WIP §Research Thread 1):
//   Arm A "clone"     — tile = cloneNode(true) of the live terminal DOM each tick.
//                       Backgrounds kept ON-viewport but opacity:0, so xterm's
//                       IntersectionObserver does NOT pause their renderer
//                       (off-viewport would pause → stale DOM to clone).
//   Arm B "serialize" — tile = serializeAsHTML() from the buffer each tick.
//                       Backgrounds pushed OFF-viewport (renderer paused, ~5ms/frame
//                       saved each) — the buffer still updates via write(), so the
//                       serialized snapshot stays current. Expected to win.
//
// THROWAWAY probe code. Mounted via ?probe&mode=harness.

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { SerializeAddon } from "@xterm/addon-serialize";
import "@xterm/xterm/css/xterm.css";
import {
  parseCast,
  startReplay,
  type CastData,
  type ReplayHandle,
} from "./replay";

const N_BG = 8;
const SCALE = 0.15;
const MIRROR_FPS = 1;

type Arm = "clone" | "serialize";

interface BgInstance {
  term: Terminal;
  serializer: SerializeAddon;
  host: HTMLDivElement; // the full-size (hidden) terminal host
  replay: ReplayHandle | null;
}

async function fetchCast(url: string): Promise<CastData> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return parseCast(await r.text());
}

export default function Harness({ fixture }: { fixture: string }) {
  // URL-controllable initial state so an unattended measurement driver can set
  // each scenario by navigation: &arm=serialize|clone  &scenario=active|idle
  const initParams = new URLSearchParams(window.location.search);
  const initArm: Arm =
    initParams.get("arm") === "clone" ? "clone" : "serialize";
  const initStreaming = initParams.get("scenario") !== "idle"; // default active
  const [arm, setArm] = useState<Arm>(initArm);
  const [streaming, setStreaming] = useState(initStreaming); // active vs idle scenario
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // refs that survive re-renders
  const bgPoolRef = useRef<HTMLDivElement>(null); // hidden full-size terminal hosts
  const centerHostRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bgInstancesRef = useRef<BgInstance[]>([]);
  const centerRef = useRef<{
    term: Terminal;
    replay: ReplayHandle | null;
  } | null>(null);
  const castRef = useRef<CastData | null>(null);
  const mirrorTimerRef = useRef<number | null>(null);
  const armRef = useRef<Arm>(arm);
  const streamingRef = useRef<boolean>(streaming);
  useEffect(() => {
    armRef.current = arm;
  }, [arm]);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  // ── Build all terminals once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cast = await fetchCast(`/probe-fixtures/${fixture}.cast`);
        if (cancelled) return;
        castRef.current = cast;

        // Center (active) terminal — replays at full speed in the foreground.
        // No SerializeAddon here (unlike the background pool below): the center
        // is rendered normally to the DOM and never serialized into a tile.
        if (centerHostRef.current) {
          const term = new Terminal({
            cols: cast.width,
            rows: cast.height,
            scrollback: 500,
            fontSize: 12,
          });
          term.open(centerHostRef.current);
          const replay = streamingRef.current
            ? startReplay(term, cast, { loop: true })
            : null;
          centerRef.current = { term, replay };
        }

        // 8 background terminals — full-size hosts live in the bg pool.
        const pool = bgPoolRef.current!;
        const instances: BgInstance[] = [];
        for (let i = 0; i < N_BG; i++) {
          const host = document.createElement("div");
          host.className = "wp4-bg-host";
          host.style.width = "720px";
          host.style.height = "400px";
          pool.appendChild(host);
          const term = new Terminal({
            cols: cast.width,
            rows: cast.height,
            scrollback: 200,
            fontSize: 12,
          });
          const serializer = new SerializeAddon();
          term.loadAddon(serializer);
          term.open(host);
          const replay = streamingRef.current
            ? startReplay(term, cast, { loop: true })
            : null;
          instances.push({ term, serializer, host, replay });
        }
        bgInstancesRef.current = instances;
        if (!cancelled) setReady(true);
      } catch (e: unknown) {
        if (!cancelled) setError(String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (mirrorTimerRef.current != null)
        cancelAnimationFrame(mirrorTimerRef.current);
      bgInstancesRef.current.forEach((b) => {
        b.replay?.stop();
        b.term.dispose();
        b.host.remove();
      });
      bgInstancesRef.current = [];
      centerRef.current?.replay?.stop();
      centerRef.current?.term.dispose();
      centerRef.current = null;
    };
    // build once; fixture is fixed per mount
  }, [fixture]);

  // ── Apply background positioning per arm ──────────────────────────────────
  // Arm A (clone): backgrounds ON-viewport (visible box) but opacity:0 → renderer keeps running.
  // Arm B (serialize): backgrounds OFF-viewport (left:-99999px) → renderer paused, buffer still updates.
  useEffect(() => {
    if (!ready) return;
    const pool = bgPoolRef.current;
    if (!pool) return;
    if (arm === "clone") {
      pool.style.position = "fixed";
      pool.style.left = "0";
      pool.style.top = "0";
      pool.style.opacity = "0";
      pool.style.pointerEvents = "none";
      pool.style.zIndex = "-1";
    } else {
      pool.style.position = "absolute";
      pool.style.left = "-99999px";
      pool.style.top = "0";
      pool.style.opacity = "1";
    }
  }, [arm, ready]);

  // ── Start/stop background + center streams for idle vs active scenario ─────
  useEffect(() => {
    if (!ready || !castRef.current) return;
    const cast = castRef.current;
    if (streaming) {
      bgInstancesRef.current.forEach((b) => {
        if (!b.replay) b.replay = startReplay(b.term, cast, { loop: true });
      });
      if (centerRef.current && !centerRef.current.replay) {
        centerRef.current.replay = startReplay(centerRef.current.term, cast, {
          loop: true,
        });
      }
    } else {
      bgInstancesRef.current.forEach((b) => {
        b.replay?.stop();
        b.replay = null;
      });
      // idle scenario per WBS = 8 backgrounds idle; center also quiet
      centerRef.current?.replay?.stop();
      if (centerRef.current) centerRef.current.replay = null;
    }
  }, [streaming, ready]);

  // ── The ~1 fps mirror loop (RAF-throttled, pauses when document.hidden) ────
  const mirrorTick = useCallback(() => {
    const tiles = tileRefs.current;
    const instances = bgInstancesRef.current;
    for (let i = 0; i < instances.length; i++) {
      const tile = tiles[i];
      if (!tile) continue;
      if (armRef.current === "clone") {
        const liveEl = instances[i].host.querySelector(".xterm");
        if (liveEl) {
          const clone = liveEl.cloneNode(true) as HTMLElement;
          tile.replaceChildren(clone);
        }
      } else {
        tile.innerHTML = instances[i].serializer.serializeAsHTML({
          scrollback: 0,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    let last = 0;
    const interval = 1000 / MIRROR_FPS;
    const loop = (ts: number) => {
      mirrorTimerRef.current = requestAnimationFrame(loop);
      if (document.hidden) return; // pause work when not visible
      if (ts - last >= interval) {
        last = ts;
        mirrorTick();
      }
    };
    mirrorTimerRef.current = requestAnimationFrame(loop);
    return () => {
      if (mirrorTimerRef.current != null)
        cancelAnimationFrame(mirrorTimerRef.current);
    };
  }, [ready, mirrorTick]);

  if (error)
    return (
      <pre style={{ color: "salmon", padding: 16 }}>harness error: {error}</pre>
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "6px 12px",
          font: "12px monospace",
          color: "#9cf",
        }}
      >
        <span>
          harness · {N_BG} bg + 1 active · arm=<b>{arm}</b> ·{" "}
          {streaming ? "ACTIVE (streaming)" : "IDLE (streams stopped)"}
        </span>
        <button
          onClick={() => setArm((a) => (a === "clone" ? "serialize" : "clone"))}
        >
          toggle arm → {arm === "clone" ? "serialize" : "clone"}
        </button>
        <button onClick={() => setStreaming((s) => !s)}>
          {streaming ? "go idle" : "go active"}
        </button>
        <button
          onClick={() => console.log("probeStats", window.__probeStats?.())}
        >
          log __probeStats()
        </button>
        <button onClick={() => window.__probeReset?.()}>reset stats</button>
        {!ready && <span>building terminals…</span>}
      </div>

      {/* hidden full-size background terminal pool — positioned per arm */}
      <div ref={bgPoolRef} aria-hidden />

      {/* filmstrip of 8 thumbnail tiles */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 12px",
          flexWrap: "wrap",
        }}
      >
        {Array.from({ length: N_BG }, (_, i) => (
          <div
            key={i}
            style={{
              width: 720 * SCALE,
              height: 400 * SCALE,
              overflow: "hidden",
              border: "1px solid #333",
              background: "#000",
            }}
          >
            <div
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              style={{
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                width: 720,
                height: 400,
              }}
            />
          </div>
        ))}
      </div>

      {/* active center stage */}
      <div style={{ padding: "6px 12px" }}>
        <div style={{ font: "11px monospace", color: "#6c6" }}>
          active center stage (full-speed):
        </div>
        <div ref={centerHostRef} style={{ height: "55vh" }} />
      </div>
    </div>
  );
}
