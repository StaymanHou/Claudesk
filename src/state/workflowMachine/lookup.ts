// M15 WP2 Phase 3 — the edge→policy-row derivation. THE HARD HALF.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS IS DERIVATION, NOT A LOOKUP (M-8)
//
// The detector parses an EDGE (`TRANSITION: F10`). The pause policy is recorded per
// STATE. Those are different addressing schemes, and bridging them is real work — the
// WBS names it as "a likely source of wrong verdicts if assumed."
//
// ⚠️ AND THE WP3 DETECTOR'S VERDICT *IS* THIS FUNCTION. A wrong mapping here is not a
// tidiness problem: it is the supervisor firing a slash command into a session that
// should have stopped, or staying silent when it should have chained.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE COVERAGE SURVEY — measured 2026-09-12, not assumed
//
// Every one of the 111 edges was classified against the 58 policy rows before this
// resolver was written. The result changed the design:
//
//   direct (an edge-ids row names it)   49
//   via the FROM-state's step row       31
//   unmapped                            31  ← of which only 7 are dispatchable
//   AMBIGUOUS (>1 candidate row)         0  ← better than feared; see below
//
// ⚠️ ZERO ambiguous cases. The WBS anticipated "ambiguous cases" as the main hazard;
// measurement says the real hazard is the opposite — edges with NO row, silently
// falling through to whatever a default happens to be. So `unmapped` is a FIRST-CLASS
// RESULT here, never a default.
//
// ⚠️ THE SURVEY ALSO FOUND FOUR MIS-CLASSIFIED ROWS, now fixed in `policy.ts`:
//   • task `verify (T5b/T5c gate)` — names its edges in the key text but was typed
//     `step`. It would have matched by from-state anyway, i.e. CORRECT BY ACCIDENT.
//   • product `vision scoping questions` / `roadmap review` — read as step names but
//     each governs one specific exit edge (P2 / P3).
//   • product `research / arch / wbs happy path` — a CATEGORY row spanning THREE states'
//     forward exits; one key string cannot match three from-states, so P5/P7/P9 are now
//     enumerated. (P4/P6/P8 are the back-loops out of those same states and belong to
//     the `back-loops` row — a genuinely easy thing to get wrong.)
//
// ⚠️ THE 7 DISPATCHABLE-BUT-UNMAPPED EDGES ARE EXPLAINED, NOT SWEPT:
//   • 6 ENTRY edges (P1, F1, F2, F31, T1, I1) — a workflow's first step. There is no
//     preceding agent turn for the supervisor to chain FROM, so no pause-policy row
//     should exist. Correctly unmapped.
//   • I2 (report → triage) — a GENUINE UPSTREAM GAP. The incident table's `triage
//     (I2→I3 / I2→I13)` row governs the exits FROM triage, not the entry INTO it.
//     Surfaced to the backlog rather than patched here: inventing a row would be
//     Claudesk deciding mccc's policy, which crosses the ownership boundary.

import { edgeById, EDGES } from "./edges";
import type { Edge } from "./types";
import {
  cellForMode,
  effectiveModeForWorkflow,
  POLICY_ROWS,
  resolveCell,
} from "./policy";
import type { DriveMode, PolicyCell, PolicyContext, PolicyRow } from "./policy";

/**
 * How an edge reached its policy row. Carried on every result so a caller — and a test —
 * can tell a confident answer from a derived one.
 */
export type Provenance =
  /** An `edge-ids` row named this edge explicitly. The strongest binding. */
  | "named-edge"
  /** Matched the row whose key equals the edge's FROM state. */
  | "from-state"
  /** No row governs this edge. ⚠️ A RESULT, not a failure and not a default. */
  | "unmapped";

/** Why an edge is unmapped. Distinguishes "correctly has no row" from "gap upstream". */
export type UnmappedReason =
  /**
   * The edge starts a workflow (`ENTRY`) or arrives from outside it (`ANY`,
   * `SURFACE-IN`). There is no preceding turn to chain from, so no policy row should
   * exist. ⚠️ NOT a gap.
   */
  | "entry-or-sentinel"
  /**
   * A meta-op with no dispatchable target — the supervisor never fires it, so no policy
   * row is owed. ⚠️ Keyed on the edge's own `dispatchTarget`, NOT on its workflow.
   */
  | "meta-op"
  /**
   * The edge ENDS a workflow (`terminal`). Nothing follows it to chain into, so no
   * pause-policy row is owed. ⚠️ Distinct from `no-row-upstream`: this is "correctly has
   * no row", not "upstream forgot one".
   */
  | "terminal"
  /**
   * The edge hands control to a DIFFERENT workflow (ESCALATE / REDIRECT / a
   * session-start classification output). The receiving workflow's own entry governs
   * what happens next, so no row is owed here.
   */
  | "cross-workflow"
  /**
   * ⚠️ A real state's edge with no governing row upstream. THIS IS A GAP and the only
   * reason that should ever prompt an upstream question. Currently exactly one: `I2`.
   */
  | "no-row-upstream";

/** The outcome of resolving one edge in one drive mode. */
export type PolicyResolution =
  | {
      readonly outcome: "resolved";
      readonly edge: Edge;
      /** The mode actually applied — may differ from the request (incidents force Mode 2). */
      readonly mode: DriveMode;
      readonly row: PolicyRow;
      readonly provenance: Exclude<Provenance, "unmapped">;
      /** The cell, already `resolveCell`-ed against `context`. Never conditional. */
      readonly cell: PolicyCell;
    }
  | {
      readonly outcome: "unmapped";
      readonly edge: Edge;
      readonly mode: DriveMode;
      readonly reason: UnmappedReason;
    }
  | {
      /** The edge id is not in the graph at all — a typo, or an unknown token. */
      readonly outcome: "unknown-edge";
      readonly edgeId: string;
    };

const SENTINEL_FROM = new Set(["ENTRY", "ANY", "SURFACE-IN"]);

/** Rows that name this edge explicitly. */
function namedRows(edgeId: string): readonly PolicyRow[] {
  return POLICY_ROWS.filter((r) => r.edgeIds?.includes(edgeId));
}

/** Rows whose key equals the edge's FROM state, within the edge's own workflow. */
function fromStateRows(edge: Edge): readonly PolicyRow[] {
  return POLICY_ROWS.filter(
    (r) =>
      r.workflow === edge.workflow &&
      r.keyKind === "step" &&
      r.key === edge.from,
  );
}

/**
 * Classify why an edge has no governing row.
 *
 * ⚠️ GATES `meta-op` ON THE EDGE'S OWN `dispatchTarget`, NOT ON ITS WORKFLOW. An earlier
 * revision returned `"meta-op"` for every `session-ops` edge — harmless in the absorbed
 * graph (measured: no session-ops edge is both dispatchable and unmapped, so the
 * `no-row-upstream` bucket was still exactly `{I2, P13}`) but WRONG IN SHAPE. Of the 21
 * session-ops edges, only 12 are meta-ops: 6 are `cross-workflow` (S1-S5, S18), 1 is
 * `terminal` (S20), and 2 are dispatchable skills (S22, S23).
 *
 * ⚠️ The failure that fix prevents: if upstream ever adds a session-ops edge with a real
 * skill target and no policy row, the workflow-keyed version would label it "no policy
 * row is owed" — silently hiding a genuine upstream gap from `unmappedReport()`, the ONE
 * report whose job is to surface them. Found at code-quality review.
 *
 * ⚠️ `terminal` and `cross-workflow` are their own reasons rather than being folded into
 * `meta-op`, because `no-row-upstream` must mean what its NAME says. Keying on
 * dispatchTarget alone would have dumped 7 correctly-rowless edges (S1-S5, S18, S20)
 * into the gap bucket and buried the one real gap (`I2`) among nine entries.
 */
function unmappedReason(edge: Edge): UnmappedReason {
  if (SENTINEL_FROM.has(edge.from)) return "entry-or-sentinel";
  switch (edge.dispatchTarget.kind) {
    case "meta-op":
      return "meta-op";
    case "terminal":
      return "terminal";
    case "cross-workflow":
      return "cross-workflow";
    // ⚠️ `skill` and `surface` fall through DELIBERATELY. A dispatchable edge with no
    // policy row IS the gap this report exists to surface — today exactly `I2`.
    case "skill":
    case "surface":
      return "no-row-upstream";
  }
}

/**
 * THE SINGLE FUNNEL. Every policy read in Claudesk goes through this function.
 *
 * ⚠️ Phase 4 adds the caller-side guard that enforces the funnel. The standing local
 * defect shape — *a mechanism correct in itself behind a caller that does not honor it*
 * — has bitten this repo four times, twice in M11 WP4 with one shipped CRITICAL.
 * Enumerating the cells as data makes the SET testable; it does NOT prove each cell has
 * a caller. One funnel, guarded, is what makes that provable.
 *
 * ⚠️ `context` is required for a correct verdict on the ONE conditional cell
 * (feature/verify-human in autopilot). Omitting it does not silently auto-skip: the
 * returned cell is `resolveCell`-ed with whatever evidence was supplied, and with none
 * it resolves to PAUSE — failing safe, per WP3's binding "bias toward WITHHOLDING".
 */
export function resolvePolicy(
  edgeId: string,
  mode: DriveMode,
  context: PolicyContext = {},
): PolicyResolution {
  const edge = edgeById(edgeId);
  if (!edge) return { outcome: "unknown-edge", edgeId };

  // ⚠️ Incidents are always Mode 2, whatever was requested. Applied HERE, once, so no
  // caller can read a column directly and miss it.
  const effective = effectiveModeForWorkflow(edge.workflow, mode);

  // Precedence: an explicitly-named edge beats a from-state match. A row that names the
  // edge is talking about that edge; a from-state row is talking about the state it
  // leaves. The specific wins.
  const named = namedRows(edgeId);
  if (named.length > 0) {
    // ⚠️ Multiple naming rows would be a genuine ambiguity. Measured: zero today. If it
    // ever happens, the FIRST in upstream order wins and `ambiguityReport()` lists it —
    // silent resolution of a real ambiguity is the failure M-8 warns about.
    const row = named[0];
    return {
      outcome: "resolved",
      edge,
      mode: effective,
      row,
      provenance: "named-edge",
      cell: resolveCell(cellForMode(row, effective), context),
    };
  }

  const byState = fromStateRows(edge);
  if (byState.length === 1) {
    const row = byState[0];
    return {
      outcome: "resolved",
      edge,
      mode: effective,
      row,
      provenance: "from-state",
      cell: resolveCell(cellForMode(row, effective), context),
    };
  }

  // ⚠️ Zero rows, or more than one step row for the same from-state (measured: never).
  // Either way this is `unmapped` — an explicit result a caller must handle, NOT a
  // default that quietly reads as AUTO.
  return {
    outcome: "unmapped",
    edge,
    mode: effective,
    reason: unmappedReason(edge),
  };
}

/**
 * Every edge whose mapping is ambiguous — more than one candidate row.
 *
 * ⚠️ Exists so ambiguity is ENUMERABLE rather than silently resolved. Measured empty on
 * 2026-09-12; the test asserts it stays empty, so a future upstream edit that introduces
 * a genuine ambiguity fails loudly instead of picking a row by array order.
 */
export function ambiguityReport(): ReadonlyArray<{
  readonly edgeId: string;
  readonly candidates: readonly string[];
}> {
  const out: { edgeId: string; candidates: string[] }[] = [];
  for (const edge of EDGES) {
    const named = namedRows(edge.id);
    if (named.length > 1) {
      out.push({ edgeId: edge.id, candidates: named.map((r) => r.key) });
      continue;
    }
    if (named.length === 0) {
      const byState = fromStateRows(edge);
      if (byState.length > 1) {
        out.push({ edgeId: edge.id, candidates: byState.map((r) => r.key) });
      }
    }
  }
  return out;
}

/**
 * Every edge with no governing policy row, grouped by reason.
 *
 * ⚠️ The `no-row-upstream` bucket is the only one that represents a real gap — and it is
 * a question for mccc, not something Claudesk should patch by inventing a row (that
 * would cross the ownership boundary settled 2026-08-14).
 */
export function unmappedReport(): ReadonlyArray<{
  readonly edgeId: string;
  readonly reason: UnmappedReason;
  readonly dispatchable: boolean;
}> {
  const out: {
    edgeId: string;
    reason: UnmappedReason;
    dispatchable: boolean;
  }[] = [];
  for (const edge of EDGES) {
    // Any mode works — mapping does not depend on it, and the incident override cannot
    // change whether a row EXISTS.
    const r = resolvePolicy(edge.id, "orchestrated");
    if (r.outcome === "unmapped") {
      out.push({
        edgeId: edge.id,
        reason: r.reason,
        dispatchable: edge.dispatchTarget.kind === "skill",
      });
    }
  }
  return out;
}
