// M9 WP6c-2 — pure delta/share/ratio helpers for the Compare (A/B) view.
//
// Repo posture (pure logic → vitest, live DOM → the MCP bridge): every delta the
// CompareView shows is recomputed FRONT-END-side from the two `MetricsPayload` trees (the
// Rust `build_comparison_data` deliberately does NOT emit a `deltas` map — WP6c-research).
// These functions are that recompute, pinned in isolation so CompareView.tsx stays a thin
// presentational layer. Ported from claude-time's dashboard.jsx (`_fmtSignedDurMs` L868,
// `_fmtRelPct` L883, `_fmtSignedPp` L893, `_fmtSignedMult` L900, `buildShares` L1122).
//
// Sign convention: `+` for a positive B−A delta, `−` (U+2212 minus, not hyphen) for
// negative — matching the source. All ms inputs are RAW (never minute-quantized upstream).

import type { MetricsPayload } from "../../../state/timeAnalytics";
import { fmtMsDur } from "./metricsMath";

const MINUS = "−"; // U+2212 MINUS SIGN (not a hyphen) — matches the source
const TIMES = "×"; // U+00D7 MULTIPLICATION SIGN

/** Signed duration delta `absMs` (B−A, in ms) → `"+Xh Ym"` / `"−Ym"` / `"0m"`. Uses
 *  `fmtMsDur` for the magnitude, so a sub-minute delta shows seconds rather than flooring
 *  to `"0m"` (a fidelity gain over the source's `fmtDur(ms/60000)`). A magnitude under 1s
 *  reads `"0m"`. */
export function fmtSignedDurMs(absMs: number): string {
  if (!Number.isFinite(absMs) || Math.round(Math.abs(absMs) / 1000) === 0) return "0m";
  const sign = absMs > 0 ? "+" : MINUS;
  return `${sign}${fmtMsDur(Math.abs(absMs))}`;
}

/** Relative-percent delta → `"(+N%)"` / `"(−N%)"` / `"(±0%)"` / `"(N/A)"`. `null` (A was
 *  zero → no baseline) renders `(N/A)`; a sub-1% magnitude reads `(±0%)`. */
export function fmtRelPct(relPct: number | null): string {
  if (relPct == null || !Number.isFinite(relPct)) return "(N/A)";
  if (Math.abs(relPct) < 1) return "(±0%)";
  const sign = relPct > 0 ? "+" : MINUS;
  return `(${sign}${Math.round(Math.abs(relPct))}%)`;
}

/** Signed percentage-POINT delta (for share shifts) → `"(+Npp)"` / `"(−Npp)"` / `"(±0pp)"`.
 *  A sub-0.5pp magnitude reads `(±0pp)`. */
export function fmtSignedPp(absPp: number): string {
  if (!Number.isFinite(absPp) || Math.abs(absPp) < 0.5) return "(±0pp)";
  const sign = absPp > 0 ? "+" : MINUS;
  return `(${sign}${Math.round(Math.abs(absPp))}pp)`;
}

/** Signed multiplier delta → `"+N.NN×"` / `"−N.NN×"` / `"0.00×"`. A sub-0.01 magnitude
 *  reads `0.00×`. */
export function fmtSignedMult(absMult: number): string {
  if (!Number.isFinite(absMult) || Math.abs(absMult) < 0.01) return `0.00${TIMES}`;
  const sign = absMult > 0 ? "+" : MINUS;
  return `${sign}${Math.abs(absMult).toFixed(2)}${TIMES}`;
}

/** Relative-percent of a B−A delta against the A baseline (`null` when `a === 0` — no
 *  baseline to normalize against; the consumer renders that as N/A). */
export function relPctOf(a: number, b: number): number | null {
  return a === 0 ? null : ((b - a) / a) * 100;
}

/** AI-effort ÷ human-wallclock as a percentage (the "AI leverage" ratio). `0` when there
 *  is no human wall-clock (the consumer renders that side as `—`). */
export function aiEffortPerHumanPct(m: MetricsPayload): number {
  const hu = m.human.wallclock_ms || 0;
  return hu === 0 ? 0 : ((m.ai_agent.effort_ms || 0) / hu) * 100;
}

/** The two blocking components as a normalized SPLIT (each a % of their SUM, so the pair
 *  sums to 100% — a true stacked-split bar). `agentToHuman` = the human waited on the agent
 *  (AI wall-clock); `humanToAgent` = the human made the agent wait (reviewing). Both `0`
 *  when there's no blocking time at all.
 *
 *  NOTE: dividing by the pair's SUM, not by engaged wall-clock. The two components
 *  (`agent_blocking_human_ms` = AI-family wall-clock; `human_blocking_agent_ms` =
 *  reviewing) each OVERLAP the engaged wall-clock and can individually exceed it (AI work
 *  sums across parallel sessions; reviewing overlaps AI bursts), so shares-of-wallclock sum
 *  well past 100% and overflow the stacked bar. A "split" bar means the RELATIVE mix of the
 *  two — fractions of their sum. (The underlying `MetricsPayload.blocking` ms are unchanged;
 *  this is a display normalization local to the bar.) */
export function blockingShares(m: MetricsPayload): {
  agentToHuman: number;
  humanToAgent: number;
} {
  const ah = m.blocking.agent_blocking_human_ms || 0;
  const ha = m.blocking.human_blocking_agent_ms || 0;
  const sum = ah + ha;
  if (sum === 0) return { agentToHuman: 0, humanToAgent: 0 };
  return {
    agentToHuman: (ah / sum) * 100,
    humanToAgent: (ha / sum) * 100,
  };
}

/** The concurrency-stratum shares (as % of engaged wall-clock) for k=1/2/3/4+. All `0`
 *  when there's no engaged wall-clock. Ported from the source `buildShares` (L1122). */
export function concurrencyShares(m: MetricsPayload): {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
} {
  const wall = m.engaged_session.wallclock_ms || 0;
  if (wall === 0) return { k1: 0, k2: 0, k3: 0, k4: 0 };
  const find = (k: number) =>
    ((m.concurrency.find((c) => c.k === k)?.wallclock_ms || 0) / wall) * 100;
  return { k1: find(1), k2: find(2), k3: find(3), k4: find(4) };
}

/** The largest-magnitude concurrency-stratum shift B−A (in pp) + its label, for the Δ
 *  column. Ties break toward the lower k (deterministic). */
export function topConcurrencyShift(
  a: MetricsPayload,
  b: MetricsPayload,
): { label: string; delta: number } {
  const as = concurrencyShares(a);
  const bs = concurrencyShares(b);
  const shifts = [
    { label: "k=1", delta: bs.k1 - as.k1 },
    { label: "k=2", delta: bs.k2 - as.k2 },
    { label: "k=3", delta: bs.k3 - as.k3 },
    { label: "k=4+", delta: bs.k4 - as.k4 },
  ];
  // Largest magnitude first; a stable sort keeps the lower-k on ties.
  shifts.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return shifts[0];
}

/** The larger-magnitude blocking-split shift B−A (in pp) + which component moved, for the
 *  Δ column. `agent→human` vs `human→agent`; ties break toward `agent→human`. */
export function topBlockingShift(
  a: MetricsPayload,
  b: MetricsPayload,
): { label: string; delta: number } {
  const as = blockingShares(a);
  const bs = blockingShares(b);
  const ahShift = bs.agentToHuman - as.agentToHuman;
  const haShift = bs.humanToAgent - as.humanToAgent;
  return Math.abs(ahShift) >= Math.abs(haShift)
    ? { label: "agent→human", delta: ahShift }
    : { label: "human→agent", delta: haShift };
}
