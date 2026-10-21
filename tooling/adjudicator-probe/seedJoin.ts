// M16.5 WP2 — join the M15 fire records (the R-3 seed) onto the mined candidates.
//
// ⚠️ Pure, so the accounting is testable: every seed lands in exactly one of `refound`,
// `duplicateTurns` or `notRefound`, and a disagreement with M15 is LISTED, never overwritten.

import type { Candidate } from "./corpus";

/** One M15 fire record, with the truth M15's labeller gave it. */
export interface M15Seed {
  readonly session8: string;
  /** Raw line index of the token M15 read. */
  readonly turnIndex: number;
  readonly edgeId: string;
  readonly truth: "BREAK" | "AWAITING" | "UNKNOWN";
}

export interface SeedJoin {
  readonly m15: {
    total: number;
    refound: number;
    notRefound: string[];
    refoundInTurn: string[];
    /** A seed whose turn another seed already claimed: M15 counted that turn twice. */
    duplicateTurns: string[];
    disagreements: string[];
  };
  /** M15's truth, keyed by the CANDIDATE's `<session8>:<turnIndex>`. */
  readonly m15Truth: Record<string, M15Seed["truth"]>;
}

export function joinSeeds(
  seeds: readonly M15Seed[],
  candidates: readonly Candidate[],
): SeedJoin {
  const byKey = new Map(
    candidates.map((c) => [`${c.session.slice(0, 8)}:${c.turnIndex}`, c]),
  );
  const m15: SeedJoin["m15"] = {
    total: seeds.length,
    refound: 0,
    notRefound: [],
    refoundInTurn: [],
    duplicateTurns: [],
    disagreements: [],
  };
  const m15Truth: SeedJoin["m15Truth"] = {};
  // ⚠️ Exact matches first, so an in-turn fallback can never overwrite a seed keyed on the very
  // line the shipped reader reads.
  const ordered = [
    ...seeds.filter((s) => byKey.has(`${s.session8}:${s.turnIndex}`)),
    ...seeds.filter((s) => !byKey.has(`${s.session8}:${s.turnIndex}`)),
  ];
  for (const s of ordered) {
    const key = `${s.session8}:${s.turnIndex}`;
    // ⚠️ M15 keyed some seeds on the FIRST token of a turn; the shipped reader reads the LAST. So
    // a miss falls back to the same-edge candidate whose turn CONTAINS the seed's line.
    const c =
      byKey.get(key) ??
      candidates.find(
        (x) =>
          x.session.startsWith(s.session8) &&
          x.edgeId === s.edgeId &&
          x.turnStart < s.turnIndex &&
          s.turnIndex < x.turnIndex,
      );
    if (!c) {
      m15.notRefound.push(`${key} ${s.edgeId} (m15 ${s.truth})`);
      continue;
    }
    const cKey = `${c.session.slice(0, 8)}:${c.turnIndex}`;
    if (cKey in m15Truth) {
      m15.duplicateTurns.push(
        `${key} (m15 ${s.truth}) is the same turn as ${cKey} (m15 ${m15Truth[cKey]})`,
      );
      continue;
    }
    m15.refound++;
    if (cKey !== key) m15.refoundInTurn.push(`${key} → ${cKey}`);
    m15Truth[cKey] = s.truth;
    if (s.truth === "BREAK" && c.truth !== "BREAK")
      m15.disagreements.push(
        `${key} ${s.edgeId}: m15 BREAK, now residual (${c.truthBasis})`,
      );
    if (s.truth === "AWAITING" && c.truth === "BREAK")
      m15.disagreements.push(
        `${key} ${s.edgeId}: m15 AWAITING, now BREAK (${c.truthBasis})`,
      );
  }
  return { m15, m15Truth };
}
