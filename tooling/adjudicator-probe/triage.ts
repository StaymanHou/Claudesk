// M16.5 WP2 Phase 2 — which rows the operator must see (WIP P2.4–P2.6, operator ruling 2026-10-21).
//
// Two independent readers label every row. The operator reviews a random SAMPLE of the rows they
// agree on; if the operator agrees with ≥ 90% of it, the agreed labels stand and the operator
// reviews only the rows the readers dispute. ⚠️ Every final label carries its SOURCE, so the
// verdict can say exactly how many labels the operator saw.
//
// Revised after the sample (operator, 2026-10-21): all four sample flips were readers' BREAK →
// operator's AWAITING, so an uncontested BREAK is reviewed too, not trusted. Two of the four were
// policy rulings ("product / incident workflow shouldn't auto chain"); those workflows leave the
// adjudicator set, because a fire there is wrong whatever the turn's text says.

import type { Label, Proposal, SheetRow } from "./labelSheet";

/** The bar the uncontested sample must clear (operator ruling, WIP P2.6). */
export const SAMPLE_AGREEMENT_BAR = 0.9;

/**
 * A row whose reply carries no evidence about the turn: the session ended, or the "reply" is a
 * task notification. Auto-SKIPped, never shown.
 */
export function hasNoEvidence(row: Pick<SheetRow, "nextText">): boolean {
  const t = row.nextText;
  if (t === null) return true;
  const s = t.trimStart();
  return (
    s.startsWith("<task-notification") ||
    /<command-name>\/(exit|clear)<\/command-name>/.test(s)
  );
}

/**
 * Workflows the supervisor must not chain at all (design prior
 * `supervisor-chains-execution-workflows-only`). Their rows measure the policy, not the
 * adjudicator, so they are excluded from its score.
 */
export function isPolicyExcluded(edgeId: string): boolean {
  return edgeId.startsWith("P") || edgeId.startsWith("I");
}

export interface Triage {
  readonly noEvidence: string[];
  /** A product or incident edge: see {@link isPolicyExcluded}. */
  readonly policyExcluded: string[];
  /** Both readers gave the same label. */
  readonly uncontested: string[];
  readonly contested: string[];
}

export function triage(
  rows: readonly SheetRow[],
  first: Readonly<Record<string, Proposal>>,
  second: Readonly<Record<string, Proposal>>,
): Triage {
  const out: Triage = {
    noEvidence: [],
    policyExcluded: [],
    uncontested: [],
    contested: [],
  };
  for (const r of rows) {
    if (!first[r.id] || !second[r.id])
      throw new Error(`${r.id}: a reader has no label`);
    if (hasNoEvidence(r)) out.noEvidence.push(r.id);
    else if (isPolicyExcluded(r.edgeId)) out.policyExcluded.push(r.id);
    else if (first[r.id].label === second[r.id].label)
      out.uncontested.push(r.id);
    else out.contested.push(r.id);
  }
  return out;
}

export interface SampleGate {
  readonly n: number;
  readonly agree: number;
  /** Sample rows left out of the gate, listed rather than silently dropped. */
  readonly policyExcluded: string[];
  readonly rate: number;
  readonly bar: number;
  readonly pass: boolean;
  readonly disagreements: string[];
}

/**
 * The operator's gate on the uncontested sample (WIP P2.6): does the operator agree with the
 * readers' shared label often enough to trust the rows they did not see?
 *
 * ⚠️ Policy-excluded rows leave the gate: a product / incident flip is a policy ruling, not a
 * verdict on the readers.
 */
export function sampleGate(
  ids: readonly string[],
  operator: Readonly<Record<string, Label>>,
  first: Readonly<Record<string, Proposal>>,
  edgeOf: (id: string) => string,
): SampleGate {
  const scored = ids.filter((id) => !isPolicyExcluded(edgeOf(id)));
  const disagree = scored.filter((id) => operator[id] !== first[id].label);
  const rate =
    scored.length === 0 ? 0 : (scored.length - disagree.length) / scored.length;
  return {
    n: scored.length,
    agree: scored.length - disagree.length,
    policyExcluded: ids.filter((id) => isPolicyExcluded(edgeOf(id))),
    rate,
    bar: SAMPLE_AGREEMENT_BAR,
    pass: rate >= SAMPLE_AGREEMENT_BAR,
    disagreements: disagree.map(
      (id) => `${id}: readers ${first[id].label}, operator ${operator[id]}`,
    ),
  };
}

/** A seeded sample, so the deck can be rebuilt identically. */
export function sampleIds(
  ids: readonly string[],
  n: number,
  seed: number,
): string[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length)).sort();
}

export type LabelSource =
  | "operator"
  /** An operator ruling applied to a row the operator did not review card by card. */
  | "operator-ruling"
  | "readers-agree"
  | "no-evidence"
  | "policy-excluded";

/** Must the operator see this row? Contested rows, and uncontested BREAKs (see the header). */
export function mustReview(
  t: Triage,
  first: Readonly<Record<string, Proposal>>,
): string[] {
  return [
    ...t.contested,
    ...t.uncontested.filter((id) => first[id].label === "BREAK"),
  ].sort();
}

export interface FinalLabel {
  readonly label: Label;
  readonly source: LabelSource;
}

/**
 * Every row's final label. The operator's label wins wherever one exists; an unreviewed
 * uncontested AWAITING or SKIP row takes the readers' shared label; a no-evidence row is SKIP;
 * a policy-excluded row is SKIP whatever anyone labelled it.
 *
 * ⚠️ A {@link mustReview} row with no operator label is an ERROR: nobody has decided it.
 */
export function assemble(
  t: Triage,
  first: Readonly<Record<string, Proposal>>,
  reviewed: Readonly<Record<string, Label>>,
  rulings: Readonly<Record<string, Label>> = {},
): { labels: Record<string, FinalLabel>; errors: string[] } {
  const labels: Record<string, FinalLabel> = {};
  const errors: string[] = [];
  const required = new Set(mustReview(t, first));
  for (const id of t.noEvidence)
    labels[id] = { label: "SKIP", source: "no-evidence" };
  for (const id of t.policyExcluded)
    labels[id] = { label: "SKIP", source: "policy-excluded" };
  for (const id of [...t.uncontested, ...t.contested]) {
    if (id in reviewed)
      labels[id] = { label: reviewed[id], source: "operator" };
    else if (id in rulings)
      labels[id] = { label: rulings[id], source: "operator-ruling" };
    else if (required.has(id))
      errors.push(`${id}: must be reviewed and is not`);
    else labels[id] = { label: first[id].label, source: "readers-agree" };
  }
  return { labels, errors };
}
