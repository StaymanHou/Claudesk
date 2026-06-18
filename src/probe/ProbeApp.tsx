// WP4 probe harness — standalone, isolated from the real app shell (App.tsx).
// Mounted only when the URL contains ?probe (see main.tsx). THROWAWAY probe code.
//
// Phase 1 ships the `single` mode: one xterm.js instance replaying a .cast at the
// recorded cadence, proving the parse+replay loop works. Phase 2 adds the two-arm
// 8-background + 1-active mirror harness.

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { parseCast, startReplay, type CastData } from "./replay";
import { startFrameCollector } from "./frameStats";
import Harness from "./Harness";

// Fixture name maps DIRECTLY to /probe-fixtures/<name>.cast — NO silent fallback.
// (A silent fallback to synthetic would corrupt a measurement run by serving the
// wrong stream under the requested fixture label. Fail loudly instead.)
function fixtureUrl(which: string): string {
  return `/probe-fixtures/${which}.cast`;
}

function useCast(which: string): {
  cast: CastData | null;
  error: string | null;
} {
  const [cast, setCast] = useState<CastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const url = fixtureUrl(which);
    fetch(url)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            `fetch ${url} → ${r.status} (fixture "${which}" not found)`,
          );
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        setCast(parseCast(text));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [which]);
  return { cast, error };
}

/** Single-xterm replay — Phase 1 deliverable. */
function SingleReplay({ which }: { which: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { cast, error } = useCast(which);

  useEffect(() => {
    if (!cast || !hostRef.current) return;
    const term = new Terminal({
      cols: cast.width,
      rows: cast.height,
      convertEol: false,
      scrollback: 1000,
      fontSize: 13,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try {
      fit.fit();
    } catch {
      // container may not be laid out yet; ignore — research notes fit() throws on zero dims
    }
    const handle = startReplay(term, cast, { loop: true });
    return () => {
      handle.stop();
      term.dispose();
    };
  }, [cast]);

  if (error)
    return (
      <pre style={{ color: "salmon", padding: 16 }}>
        cast load error: {error}
      </pre>
    );
  if (!cast) return <p style={{ padding: 16 }}>loading {which} cast…</p>;
  return (
    <div>
      <div
        style={{ font: "12px monospace", color: "#9cf", padding: "4px 8px" }}
      >
        single-replay · fixture={which} · {cast.events.length} events ·{" "}
        {cast.duration.toFixed(1)}s loop
      </div>
      <div ref={hostRef} style={{ height: "80vh" }} />
    </div>
  );
}

export default function ProbeApp() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") ?? "single";
  const fixture = params.get("fixture") ?? "cc-replay";

  useEffect(() => {
    const collector = startFrameCollector();
    return () => collector.stop();
  }, []);

  return (
    <div style={{ background: "#111", color: "#eee", minHeight: "100vh" }}>
      <h3
        style={{ margin: 0, padding: "8px 12px", font: "600 14px system-ui" }}
      >
        WP4 thumbnail probe — mode={mode}
      </h3>
      {mode === "single" ? (
        <SingleReplay which={fixture} />
      ) : mode === "harness" ? (
        <Harness fixture={fixture} />
      ) : (
        <p style={{ padding: 16 }}>
          unknown mode &quot;{mode}&quot; — use mode=single or mode=harness
        </p>
      )}
    </div>
  );
}
