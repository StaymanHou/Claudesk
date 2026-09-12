// M15 WP2 Phase 2 — the pause policy: the 5-value cell, the four drive modes, and Mode 0.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE CELL IS NOT A BOOLEAN
//
// The single most common wrong model of this table is `AUTO | PAUSE`. Measured upstream
// (M-7): FIVE distinct cell values across ~356 cells, and the two beyond AUTO/PAUSE are
// not decoration —
//
//   • `AUTO-SKIP` is CONDITIONAL. verify-human in Mode 3 reads
//     "**PAUSE** (or **AUTO-SKIP** when no integration boundary + verify-self all-PASS)".
//     Collapsing it to AUTO skips a human gate that should have fired; collapsing it to
//     PAUSE stops autopilot dead at every phase. Its condition is modeled as DATA below,
//     not as a comment, so a caller can evaluate it instead of reading about it.
//
//   • `SKIP (entire skill)` REMOVES A STATE. In Mode 4 review-quality does not execute at
//     all — which is why `F17b` exists to route ship AROUND it. A model that treats SKIP
//     as "AUTO through the state" would send Mode 4 into a skill that upstream says never
//     runs.
//
//   • `n/a` means the row cannot arise in that mode (e.g. F41 is a Mode-2-only pause;
//     Mode 3 auto-backlogs via F39 instead). Distinct from PAUSE and from SKIP: it is not
//     a decision, it is the absence of the situation.
//
// ⚠️ The MODELED union has SIX arms, not five: upstream's five vocabulary values plus
// `confirm`, which appears in exactly one cell (mid-workflow ambiguity) and which
// `transitions.md:147` explicitly calls "the ABSENCE of the auto-chain … NOT a modeled
// transition". It is kept distinct from `pause` for fidelity — see the arm's own comment.
// So: FIVE upstream values, SIX modeled arms. Do not "simplify" the count in either
// direction without reading both comments.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ MODE 0 IS NOT ONE OF THE FOUR MODES, AND IS NOT HONORED AS A SUPPRESSOR (R-1)
//
// Upstream defines Mode 0 ("Direct") as a fifth row of its mode table: a bare slash
// command, no chaining, the skill's own Hand Off prose authoritative. Claudesk models it
// as a distinct INPUT — see `DriveModeInput` — but deliberately does NOT honor it as a
// suppressor. Operator ruling R-1: the STORED drive mode is the authority.
//
// Why, in one measurement: only **3 of 206** skill-using sessions carry a `/session-start`
// marker while **139** chained 2+ skills. Honoring Mode 0 literally would suppress firing
// on essentially every real session and ship the milestone dead. The accepted cost is that
// a deliberate one-step run may get chained; the recovery is CC's Esc.
//
// ⚠️ The type still EXPRESSES Mode 0 so that R-1 is a visible decision in code rather than
// an implicit absence. `resolveEffectiveMode` is where the ruling lives, and
// `policy.test.ts` pins it so nobody reinstates suppression by accident.

import type { WorkflowId } from "./types";

/** The four selectable drive modes, as stored in `projects.json` / WIP frontmatter. */
export type DriveMode = "stepping" | "orchestrated" | "autopilot" | "fsd";

/**
 * What the supervisor is handed before resolution.
 *
 * ⚠️ `"direct"` is upstream's Mode 0. It is representable but never decisive — see the
 * header and `resolveEffectiveMode`.
 */
export type DriveModeInput = DriveMode | "direct";

/** The four modes in upstream's column order, for exhaustiveness iteration. */
export const DRIVE_MODES: readonly DriveMode[] = [
  "stepping",
  "orchestrated",
  "autopilot",
  "fsd",
];

/**
 * Conditions an `AUTO-SKIP` cell depends on.
 *
 * ⚠️ Modeled as data, not prose. Upstream states verify-human's Mode-3 condition as
 * "no integration boundary + verify-self all-PASS"; both must hold. A caller evaluates
 * these against its own observations rather than re-deriving the rule from a comment.
 */
export type AutoSkipCondition =
  | "no-integration-boundary"
  | "verify-self-all-pass";

/** The evidence a caller supplies when a conditional cell needs resolving. */
export interface PolicyContext {
  /** True when the phase modifies an existing consuming surface. */
  readonly integrationBoundary?: boolean;
  /** True when every verify-self leaf passed (no FAILED / UNVERIFIED / cosmetic). */
  readonly verifySelfAllPass?: boolean;
}

/**
 * One cell of the pause-policy matrix.
 *
 * ⚠️ SIX arms modeling FIVE upstream vocabulary values — the sixth (`confirm`) is the
 * one cell upstream describes as a guard rather than a policy decision. See the header
 * and the `confirm` arm. None of the six collapses into another.
 */
export type PolicyCell =
  /** Chain without pausing. */
  | { readonly kind: "auto" }
  /** Stop and wait for the operator. */
  | { readonly kind: "pause" }
  /**
   * Conditionally skip the state without prompting. `requires` lists conditions that must
   * ALL hold; when any fails the cell behaves as `fallback` (upstream's "or" phrasing:
   * PAUSE *or* AUTO-SKIP-when-clean).
   */
  | {
      readonly kind: "auto-skip";
      readonly requires: readonly AutoSkipCondition[];
      readonly fallback: "pause" | "auto";
    }
  /**
   * The state does not execute in this mode at all.
   *
   * ⚠️ `aroundEdge` names the transition that routes past the removed state — for
   * review-quality in Mode 4 that is `F17b` (ship → finalize direct). Held as data so a
   * caller can follow the detour instead of guessing.
   */
  | { readonly kind: "skip-skill"; readonly aroundEdge?: string }
  /** The row cannot arise in this mode. Not a decision — the absence of the situation. */
  | { readonly kind: "n/a"; readonly why: string }
  /**
   * Upstream's `CONFIRM` — an agent-side guard that asks one disambiguating question
   * before acting ("turn-level hold, or write a session handoff?").
   *
   * ⚠️ MODELED DISTINCTLY FROM `pause` ON PURPOSE, and it was nearly not. Flattening it
   * to `pause` reads fine — both stop — but upstream is explicit that CONFIRM is *"the
   * ABSENCE of the auto-chain, gated on ambiguity — NOT a modeled transition"*
   * (`transitions.md:147`). A `pause` is a policy decision about an edge the supervisor
   * evaluated; a CONFIRM is a guard that fires before any edge is evaluated at all. Since
   * this table is meant to be the authority, collapsing the two would make the model
   * assert something upstream explicitly denies.
   *
   * ⚠️ For the supervisor's own purposes the OUTCOME matches `pause` (do not fire) —
   * `isStop()` treats them alike. The distinction is preserved for FIDELITY, not because
   * WP3 branches on it.
   */
  | { readonly kind: "confirm"; readonly question: string };

/** Convenience constructors, so the table below reads as data rather than as punctuation. */
const auto: PolicyCell = { kind: "auto" };
const pause: PolicyCell = { kind: "pause" };
const skipSkill = (aroundEdge?: string): PolicyCell => ({
  kind: "skip-skill",
  aroundEdge,
});
const na = (why: string): PolicyCell => ({ kind: "n/a", why });
const confirm = (question: string): PolicyCell => ({
  kind: "confirm",
  question,
});
const autoSkip = (
  requires: readonly AutoSkipCondition[],
  fallback: "pause" | "auto",
): PolicyCell => ({ kind: "auto-skip", requires, fallback });

/**
 * A row of the upstream pause-policy table: one subject, four mode columns.
 *
 * ⚠️ `key` is the row's subject VERBATIM from upstream, which may be a step name
 * (`build`), an edge id (`F22`), or a category (`Back-loops`). That heterogeneity is
 * M-8's hazard and is preserved here rather than normalized away — `lookup.ts` (Phase 3)
 * owns the edge→row derivation, and flattening the key here would hide which rows are
 * which kind.
 */
export interface PolicyRow {
  readonly workflow: WorkflowId;
  /** The subject as upstream spells it. */
  readonly key: string;
  /** How the key addresses the graph — the input `lookup.ts` derives against. */
  readonly keyKind: "step" | "edge-ids" | "category";
  /** Edge ids this row governs, when the row names them explicitly. */
  readonly edgeIds?: readonly string[];
  readonly stepping: PolicyCell;
  readonly orchestrated: PolicyCell;
  readonly autopilot: PolicyCell;
  readonly fsd: PolicyCell;
}

/** Read one mode's column off a row. The only place a mode indexes into a row. */
export function cellForMode(row: PolicyRow, mode: DriveMode): PolicyCell {
  switch (mode) {
    case "stepping":
      return row.stepping;
    case "orchestrated":
      return row.orchestrated;
    case "autopilot":
      return row.autopilot;
    case "fsd":
      return row.fsd;
  }
}

/**
 * Resolve the mode the supervisor actually enforces.
 *
 * ⚠️ THIS IS WHERE RULING R-1 LIVES. `"direct"` (Mode 0) resolves to the STORED mode —
 * it never suppresses. Measured basis in the header. Changing this to return a
 * "do nothing" value would silently disable the supervisor on ~every real session, with
 * no test elsewhere catching it — which is why `policy.test.ts` pins it directly.
 */
export function resolveEffectiveMode(
  input: DriveModeInput,
  storedMode: DriveMode,
): DriveMode {
  return input === "direct" ? storedMode : input;
}

/**
 * Resolve a conditional cell against a caller's observations.
 *
 * ⚠️ Returns a NON-conditional cell, so callers cannot forget to evaluate the condition
 * and accidentally treat an `auto-skip` as an `auto`. Same reasoning as
 * `recycleMachine`'s temp-path exclusion living inside the machine: an exclusion a caller
 * must remember is an exclusion a caller will forget.
 */
export function resolveCell(
  cell: PolicyCell,
  context: PolicyContext = {},
): PolicyCell {
  if (cell.kind !== "auto-skip") return cell;
  const satisfied = cell.requires.every((r) =>
    r === "no-integration-boundary"
      ? context.integrationBoundary === false
      : context.verifySelfAllPass === true,
  );
  if (satisfied) return { kind: "skip-skill" };
  return cell.fallback === "pause" ? pause : auto;
}

/**
 * The one CONFIRM cell in the matrix — the WP5 bidirectional guard's question, verbatim
 * in substance from `transitions.md:147`.
 */
const CONFIRM_QUESTION: PolicyCell = confirm(
  "Turn-level hold, or write a session handoff for next time?",
);

/**
 * The absorbed pause-policy matrix, transcribed from `transitions.md` ONLY.
 *
 * ⚠️ The four `AGENTS.md` copies are NOT a source — they disagree with `transitions.md`
 * (see `types.ts` header, the A-2 finding). Their duplication is what mccc's
 * `check-structure.sh` Phase 9 polices, and what WBS 2.9 hands back for deletion.
 */
export const POLICY_ROWS: readonly PolicyRow[] = [
  // ─── Feature workflow ────────────────────────────────────────────────────────
  {
    workflow: "feature",
    key: "reproduce — F32/F33 (reproduced cleanly)",
    keyKind: "edge-ids",
    edgeIds: ["F32", "F33"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "reproduce — F34 (could-not-reproduce → preventive hardening)",
    keyKind: "edge-ids",
    edgeIds: ["F34"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "reproduce — F35 (could-not-reproduce → terminate)",
    keyKind: "edge-ids",
    edgeIds: ["F35"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    // ⚠️ PAUSE in ALL FOUR modes, Mode 4 included — terminating a workflow without a
    // reproduce signal always deserves human confirmation.
    fsd: pause,
  },
  {
    workflow: "feature",
    key: "spec",
    keyKind: "step",
    // ⚠️ THE F3/F4 REGRESSION SENTINEL. Spec PAUSEs in Mode 3 because it is a human
    // review point. All 23 of the naive predicate's false positives were spec exits
    // (F4 ×20, F3 ×3) — this row is what eliminates them.
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "research",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "plan",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "build",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "verify-auto",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "verify-self",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "verify-human",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    // ⚠️ THE ONE CONDITIONAL CELL IN THE WHOLE MATRIX. Upstream: "**PAUSE** (or
    // **AUTO-SKIP** when no integration boundary + verify-self all-PASS)".
    autopilot: autoSkip(
      ["no-integration-boundary", "verify-self-all-pass"],
      "pause",
    ),
    // ⚠️ Mode 4 SKIPs the state outright — verify-self's result is the acceptance gate.
    fsd: skipSkill(),
  },
  {
    workflow: "feature",
    key: "verify-codify",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "ship",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "review-quality — F39 (clean, MINOR-backlogged, Mode-3 MAJOR-backlogged)",
    keyKind: "edge-ids",
    edgeIds: ["F39"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: skipSkill("F17b"),
  },
  {
    workflow: "feature",
    key: "review-quality — F40 (CRITICAL → auto-invoke refactor)",
    keyKind: "edge-ids",
    edgeIds: ["F40"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: skipSkill("F17b"),
  },
  {
    workflow: "feature",
    key: "review-quality — F41 (Mode-2 MAJOR — operator pause-and-ask)",
    keyKind: "edge-ids",
    edgeIds: ["F41"],
    stepping: pause,
    orchestrated: pause,
    // ⚠️ The only `n/a` in the feature table: Mode 3 auto-backlogs via F39, so the
    // pause-and-ask situation never arises.
    autopilot: na("Mode 3 auto-backlogs via F39"),
    fsd: skipSkill("F17b"),
  },
  {
    workflow: "feature",
    key: "review-quality — F17b alternate path (Mode 4 SKIP — ship direct to finalize)",
    keyKind: "edge-ids",
    edgeIds: ["F17b"],
    stepping: na("Mode 4 alternate path only"),
    orchestrated: na("Mode 4 alternate path only"),
    autopilot: na("Mode 4 alternate path only"),
    fsd: skipSkill("F17b"),
  },
  {
    workflow: "feature",
    key: "finalize",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "refactor",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "Back-loops",
    keyKind: "category",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "REDIRECT (F22)",
    keyKind: "edge-ids",
    edgeIds: ["F22"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "REDIRECT (F36)",
    keyKind: "edge-ids",
    edgeIds: ["F36"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "Return-from-REDIRECT (F37, F37b)",
    keyKind: "edge-ids",
    edgeIds: ["F37", "F37b"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "SURFACE F25",
    keyKind: "edge-ids",
    edgeIds: ["F25"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "SURFACE F26",
    keyKind: "edge-ids",
    edgeIds: ["F26"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "feature",
    key: "ESCALATE (any)",
    keyKind: "category",
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },

  // ─── Task workflow ───────────────────────────────────────────────────────────
  {
    workflow: "task",
    key: "plan",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "task",
    key: "act",
    keyKind: "step",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "task",
    key: "verify (T5b/T5c gate)",
    // ⚠️ Upstream's key NAMES its edges in the text ("T5b/T5c gate") while reading as a
    // step name. Classified `edge-ids` and given the ids explicitly: keying it on the
    // step `verify` alone would match T5b/T5c by from-state anyway, but only by accident
    // — the row is about those two exits specifically, and saying so makes the mapping
    // checkable instead of coincidental. Found by the Phase 3 coverage survey.
    keyKind: "edge-ids",
    edgeIds: ["T5b", "T5c"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "task",
    key: "close",
    keyKind: "step",
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "task",
    key: "ESCALATE / REDIRECT",
    keyKind: "category",
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },

  // ─── Product workflow ────────────────────────────────────────────────────────
  {
    workflow: "product",
    key: "vision scoping questions",
    // ⚠️ Reads as a step but governs the EXIT from `vision`. Declared as edge-ids so the
    // derivation is explicit rather than relying on a fuzzy key match.
    keyKind: "edge-ids",
    edgeIds: ["P2"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "product",
    key: "roadmap review",
    // ⚠️ Governs the exit from `roadmap`. Same reasoning as `vision scoping questions`.
    keyKind: "edge-ids",
    edgeIds: ["P3"],
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "product",
    key: "research / arch / wbs happy path",
    // ⚠️ A CATEGORY row covering THREE states' forward exits — a single key string cannot
    // match three from-states, so the edges are enumerated. P4/P6/P8 are the back-loops
    // out of the same states and belong to the `back-loops` row, NOT here; P9 (wbs →
    // context) is the wbs happy-path exit and DOES belong here.
    keyKind: "edge-ids",
    edgeIds: ["P5", "P7", "P9"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "product",
    key: "back-loops (P4, P6, P8)",
    keyKind: "edge-ids",
    edgeIds: ["P4", "P6", "P8"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },
  {
    workflow: "product",
    key: "P10 exit to feature",
    keyKind: "edge-ids",
    edgeIds: ["P10"],
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "product",
    key: "P14 product-finalize back-loop",
    keyKind: "edge-ids",
    edgeIds: ["P14"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: auto,
  },

  // ─── Incident workflow ───────────────────────────────────────────────────────
  // ⚠️ Upstream states ONE column for incidents: "Incidents are always treated as Mode 2
  // (Orchestrated) regardless of the selected drive mode. Human judgment is
  // non-negotiable in an incident." That rule is modeled by `INCIDENT_FORCES_MODE` below
  // and by writing the SAME cell into all four columns here — so a caller that reads a
  // column directly still gets the right answer even if it forgets the rule.
  {
    workflow: "incident",
    key: "triage (I2→I3 / I2→I13)",
    keyKind: "edge-ids",
    edgeIds: ["I3", "I13"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "reproduce → investigate (I14)",
    keyKind: "edge-ids",
    edgeIds: ["I14"],
    stepping: auto,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "incident",
    key: "reproduce → investigate-with-telemetry-constraint (I15)",
    keyKind: "edge-ids",
    edgeIds: ["I15"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "reproduce → pause-as-record (I16)",
    keyKind: "edge-ids",
    edgeIds: ["I16"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "before mitigate (I6)",
    keyKind: "edge-ids",
    edgeIds: ["I6"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "back-loop (I8)",
    keyKind: "edge-ids",
    edgeIds: ["I8"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "mitigate → codify (I17)",
    keyKind: "edge-ids",
    edgeIds: ["I17"],
    stepping: auto,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "incident",
    key: "codify → resolve, Path A (reproduce-artifact passes)",
    keyKind: "edge-ids",
    edgeIds: ["I18"],
    stepping: auto,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "incident",
    key: "codify → resolve, Path B (new test written from scratch)",
    keyKind: "category",
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "codify → resolve, defer path (I9 with SURFACE entry)",
    keyKind: "edge-ids",
    edgeIds: ["I9"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "codify → mitigate (I19 back-loop)",
    keyKind: "edge-ids",
    edgeIds: ["I19"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "codify → investigate (I20 back-loop)",
    keyKind: "edge-ids",
    edgeIds: ["I20"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "before resolve (no codify — fast-close paths I4, I7)",
    keyKind: "edge-ids",
    edgeIds: ["I4", "I7"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "surface (I11, I12)",
    keyKind: "edge-ids",
    edgeIds: ["I11", "I12"],
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "incident",
    key: "investigate self-loop (I5)",
    keyKind: "edge-ids",
    edgeIds: ["I5"],
    stepping: auto,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },

  // ─── Session-boundary exit chain ─────────────────────────────────────────────
  // ⚠️ The chain that Phase 18 (ported at P5.2) pins. Every hop is AUTO in Modes 2–4;
  // the norm at a clean boundary is auto-chain, and the CONFIRM is the narrow exception.
  {
    workflow: "session-ops",
    key: "finalize/refactor/close/resolve → reflect (F19/F21/T11/I10, declared-auto)",
    keyKind: "edge-ids",
    edgeIds: ["F19", "F21", "T11", "I10"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "session-ops",
    key: "reflect → session-handoff — S22, no-learning arm",
    keyKind: "edge-ids",
    edgeIds: ["S22"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "session-ops",
    key: "reflect → session-capture — learning-found arm",
    keyKind: "category",
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "session-ops",
    key: "session-capture write — [PROJECT] scope",
    keyKind: "category",
    // ⚠️ The drive-mode-conditional capture gate. AUTO-WRITE in autopilot/FSD, surfaced
    // in chat as a read-time veto.
    stepping: pause,
    orchestrated: pause,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "session-ops",
    key: "session-capture write — [GLOBAL] scope",
    keyKind: "category",
    // ⚠️ Still CONFIRMS even in autopilot/FSD — higher blast radius. Every logged reflect
    // scope-correction was [GLOBAL]→[PROJECT].
    stepping: pause,
    orchestrated: pause,
    autopilot: pause,
    fsd: pause,
  },
  {
    workflow: "session-ops",
    key: "session-capture → session-handoff — S23, after save lands",
    keyKind: "edge-ids",
    edgeIds: ["S23"],
    stepping: pause,
    orchestrated: auto,
    autopilot: auto,
    fsd: auto,
  },
  {
    workflow: "session-ops",
    key: "Mid-workflow ambiguity (pause/defer/wrap up/hold INSIDE a phase)",
    keyKind: "category",
    // ⚠️ Upstream's CONFIRM, modeled as itself rather than flattened to `pause` — see
    // the `confirm` arm of PolicyCell for why the distinction is load-bearing for
    // fidelity even though the supervisor's behavior is identical.
    stepping: pause,
    orchestrated: CONFIRM_QUESTION,
    autopilot: CONFIRM_QUESTION,
    fsd: auto,
  },
];

/**
 * ⚠️ Incidents are ALWAYS Mode 2, whatever mode is selected.
 *
 * Upstream: "Incidents are always treated as Mode 2 (Orchestrated) regardless of the
 * selected drive mode. Human judgment is non-negotiable in an incident." Modeled as a
 * rule rather than as four duplicated columns so it cannot be lost in a later edit —
 * though the incident rows above ALSO carry the same cell in every column, so a caller
 * that reads a column directly is right anyway (belt and braces, deliberately).
 */
export const INCIDENT_FORCES_MODE: DriveMode = "orchestrated";

/** Apply the incident override. The single place that rule is expressed as behavior. */
export function effectiveModeForWorkflow(
  workflow: WorkflowId,
  mode: DriveMode,
): DriveMode {
  return workflow === "incident" ? INCIDENT_FORCES_MODE : mode;
}

/**
 * Does this cell stop the supervisor?
 *
 * ⚠️ The ONE predicate WP3 should branch on. `pause`, `confirm` and `n/a` all mean "do
 * not fire"; `skip-skill` means the state does not run, which is also not a fire.
 * Only `auto` fires. ⚠️ An unresolved `auto-skip` is deliberately treated as a STOP —
 * a caller that forgot to call `resolveCell` must fail safe, per the WP3 condition
 * "bias the failure direction toward WITHHOLDING".
 */
export function isStop(cell: PolicyCell): boolean {
  return cell.kind !== "auto";
}

/** Every policy row, in upstream order. */
export function allPolicyRows(): readonly PolicyRow[] {
  return POLICY_ROWS;
}
