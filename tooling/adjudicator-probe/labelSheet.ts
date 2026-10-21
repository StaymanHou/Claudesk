// M16.5 WP2 Phase 2 — the operator labelling pass: which rows are labelled.
//
// (The first form, a 6,000-line markdown sheet, was rejected at verify-human 2026-10-21; the rows
// now go to two independent readers and a keyboard card reviewer, `triage.ts` + `reviewer.ts`.)
//
// ⚠️ NO ROW CARRIES ADJUDICATOR OUTPUT. Scoring runs only after the labels are frozen, so
// neither the agent's proposals nor the operator's edits can anchor on the thing being measured.
//
// ⚠️ THE CONTROL ROWS ARE UNMARKED. A random 10% of the mechanical BREAK labels is mixed in and
// gets a proposal like any other row, made blind to the mechanical label. Agreement between the
// operator's final label and the mechanical one is what tells us whether the mechanical rule can
// be trusted; marking them would turn the control into a rubber stamp.

import type { Candidate } from "./corpus";

export type Label = "AWAITING" | "BREAK" | "SKIP";
export const LABELS: readonly Label[] = ["AWAITING", "BREAK", "SKIP"];

/** One row on the sheet. Nothing here says whether it is a control. */
export interface SheetRow {
  readonly id: string;
  readonly projectClass: Candidate["projectClass"];
  readonly edgeId: string;
  readonly skill: string;
  readonly date: string | null;
  readonly tail: string;
  readonly nextText: string | null;
}

/** What the sheet hides: which candidate a row is, and whether it is a control. */
export interface RowKey {
  readonly key: string;
  readonly control: boolean;
}

export interface Proposal {
  readonly label: Label;
  readonly reason: string;
}

/** A deterministic PRNG, so a rebuilt sheet has the same rows in the same order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How much of a long reply to show. The reply is evidence about the turn, not the turn. */
export const NEXT_TEXT_CHARS = 600;

/**
 * Every residual candidate, plus a random `controlRate` share of the mechanical BREAKs, shuffled
 * together. `keyOf` is passed in so the sheet and the committed set agree on identity.
 */
export function buildRows(
  candidates: readonly Candidate[],
  keyOf: (c: Candidate) => string,
  seed: number,
  controlRate = 0.1,
): { rows: SheetRow[]; keys: Record<string, RowKey> } {
  const rand = mulberry32(seed);
  const residual = candidates.filter((c) => c.truth === null);
  const mechanical = candidates.filter((c) => c.truth === "BREAK");
  const control = shuffle(mechanical, rand).slice(
    0,
    Math.ceil(mechanical.length * controlRate),
  );
  const picked = shuffle(
    [
      ...residual.map((c) => ({ c, control: false })),
      ...control.map((c) => ({ c, control: true })),
    ],
    rand,
  );
  const width = String(picked.length).length;
  const rows: SheetRow[] = [];
  const keys: Record<string, RowKey> = {};
  picked.forEach(({ c, control: isControl }, i) => {
    const id = `R${String(i + 1).padStart(width, "0")}`;
    const next = c.nextText;
    rows.push({
      id,
      projectClass: c.projectClass,
      edgeId: c.edgeId,
      skill: c.skill,
      date: c.ts ? c.ts.slice(0, 10) : null,
      tail: c.tail,
      nextText:
        next !== null && next.length > NEXT_TEXT_CHARS
          ? `${next.slice(0, NEXT_TEXT_CHARS)} […]`
          : next,
    });
    keys[id] = { key: keyOf(c), control: isControl };
  });
  return { rows, keys };
}
