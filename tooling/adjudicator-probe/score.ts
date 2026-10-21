// M16.5 WP2 Phase 3 — score the pinned adjudicator against the frozen labels (WIP P3.1–P3.2).
//
// ⚠️ THE TRUTH IS THE OPERATOR'S, NEVER THE POLICY TABLE'S. Every scored item's label comes from
// `labels.frozen.json` (operator, operator ruling, readers-agree on AWAITING/SKIP) or from a
// mechanical BREAK (a content-free prod that the hidden controls validated at 15/16). Nothing
// here consults `resolvePolicy`, so the score cannot be 1.000 by identity
// (`[[detector-scored-against-its-own-table-is-circular]]`).
//
// The two axes are M15's, so the numbers compare:
// - wrong-fire recall: of the turns that were AWAITING, how many the adjudicator held (AWAITING);
// - real breaks preserved: of the turns that were BREAK, how many it let fire (PROCEED).
// ⚠️ A failed call (error, timeout, unparseable) WITHHOLDS in production, so it scores as
// AWAITING: it helps the first axis and costs the second, exactly as it would live.

import type { Adjudication } from "../../src/state/supervisor/adjudicator";

export interface ScoreItem {
  readonly key: string;
  readonly truth: "AWAITING" | "BREAK";
  readonly tail: string;
  /** M15's truth for this turn, when it was in M15's set. */
  readonly m15Truth?: string;
}

export interface Answer {
  readonly key: string;
  readonly run: number;
  /** The parsed answer, or null when the call failed or was unparseable. */
  readonly answer: Adjudication | null;
  readonly basis: "model" | "error" | "timeout" | "unparseable";
  readonly models: readonly string[];
  readonly raw: string;
}

/** What production does with an answer: anything but an explicit PROCEED withholds. */
export function effective(a: Answer): Adjudication {
  return a.answer === "PROCEED" ? "PROCEED" : "AWAITING";
}

/** 95% Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface Axis {
  readonly n: number;
  readonly hits: number;
  readonly rate: number;
  readonly ci95: [number, number];
}

const axis = (hits: number, n: number): Axis => ({
  n,
  hits,
  rate: n === 0 ? 0 : hits / n,
  ci95: wilson(hits, n),
});

export interface Score {
  readonly run: number;
  readonly scored: number;
  /** Items with no answer for this run, which are excluded and listed. */
  readonly missing: string[];
  readonly wrongFireRecall: Axis;
  readonly realBreaksPreserved: Axis;
  /** PASS iff both axes' point estimates clear the bar (WIP Phase 4's assumed rule). */
  readonly bars: Record<string, { pass: boolean; lowerBoundsClear: boolean }>;
  readonly failedCalls: Record<Answer["basis"], number>;
}

export const BARS = [0.75, 0.8, 0.85] as const;

export function score(
  items: readonly ScoreItem[],
  answers: readonly Answer[],
  run: number,
): Score {
  const byKey = new Map(
    answers.filter((a) => a.run === run).map((a) => [a.key, a]),
  );
  const missing: string[] = [];
  let aN = 0;
  let aHit = 0;
  let bN = 0;
  let bHit = 0;
  const failedCalls: Score["failedCalls"] = {
    model: 0,
    error: 0,
    timeout: 0,
    unparseable: 0,
  };
  for (const item of items) {
    const a = byKey.get(item.key);
    if (!a) {
      missing.push(item.key);
      continue;
    }
    if (a.basis !== "model") failedCalls[a.basis]++;
    const said = effective(a);
    if (item.truth === "AWAITING") {
      aN++;
      if (said === "AWAITING") aHit++;
    } else {
      bN++;
      if (said === "PROCEED") bHit++;
    }
  }
  const wrongFireRecall = axis(aHit, aN);
  const realBreaksPreserved = axis(bHit, bN);
  const bars: Score["bars"] = {};
  for (const bar of BARS)
    bars[bar.toFixed(2)] = {
      pass: wrongFireRecall.rate >= bar && realBreaksPreserved.rate >= bar,
      lowerBoundsClear:
        wrongFireRecall.ci95[0] >= bar && realBreaksPreserved.ci95[0] >= bar,
    };
  return {
    run,
    scored: aN + bN,
    missing,
    wrongFireRecall,
    realBreaksPreserved,
    bars,
    failedCalls,
  };
}

/**
 * Of the items answered in EVERY given run, the share whose effective answer differs across runs.
 * This is the noise floor on a single production call.
 */
export function flipRate(
  answers: readonly Answer[],
  runs: readonly number[],
): { items: number; flipped: number; rate: number } {
  const per = new Map<string, Map<number, Adjudication>>();
  for (const a of answers) {
    if (!runs.includes(a.run)) continue;
    if (!per.has(a.key)) per.set(a.key, new Map());
    per.get(a.key)!.set(a.run, effective(a));
  }
  let items = 0;
  let flipped = 0;
  for (const m of per.values()) {
    if (m.size !== runs.length) continue;
    items++;
    if (new Set(m.values()).size > 1) flipped++;
  }
  return { items, flipped, rate: items === 0 ? 0 : flipped / items };
}
