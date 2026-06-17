// WP4 probe — in-page frame-time collector (rAF-delta technique).
//
// Research-validated (WIP §Research, Thread 2):
//  - Use the rAF timestamp arg (monotonic — no negative-delta guard needed).
//  - Drop >1000ms deltas (page was backgrounded) so they don't skew p95.
//  - "frame <16ms" really means "is rAF keeping up with the display refresh" — rAF is
//    capped at refresh rate. Infer the budget from the MEDIAN, not a hardcoded 60Hz
//    (ProMotion = 8.3ms). Report dropped-frame count against the inferred budget.
//  - This is the self-contained cross-check for Safari Timelines' frame-rate timeline.

export interface FrameStats {
  frames: number;
  median: number;
  p95: number;
  max: number;
  /** inferred per-frame budget (≈ display refresh interval), from the median delta. */
  budgetMs: number;
  /** frames whose delta exceeded 1.5× the inferred budget (≈ dropped/janky frames). */
  dropped: number;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function computeStats(deltas: number[]): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = pct(sorted, 50);
  const budgetMs = median || 1000 / 60;
  return {
    frames: deltas.length,
    median,
    p95: pct(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    budgetMs,
    dropped: deltas.filter((d) => d > budgetMs * 1.5).length,
  };
}

export interface FrameCollector {
  stop: () => void;
  stats: () => FrameStats;
  reset: () => void;
}

declare global {
  interface Window {
    __probeStats?: () => FrameStats;
    __probeReset?: () => void;
  }
}

/** Start collecting frame deltas; also exposes window.__probeStats()/__probeReset() for the run sheet. */
export function startFrameCollector(): FrameCollector {
  let deltas: number[] = [];
  let last = performance.now();
  let rafId = 0;
  let stopped = false;

  const tick = (ts: number) => {
    if (stopped) return;
    const d = ts - last;
    last = ts;
    if (d < 1000) deltas.push(d); // drop backgrounding outliers
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const collector: FrameCollector = {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    },
    stats: () => computeStats(deltas),
    reset: () => {
      deltas = [];
      last = performance.now();
    },
  };

  window.__probeStats = () => collector.stats();
  window.__probeReset = () => collector.reset();
  return collector;
}
