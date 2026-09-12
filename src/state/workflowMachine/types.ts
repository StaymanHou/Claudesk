// M15 WP2 Phase 1 — the workflow state machine's types.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THE GRAPH IS TYPED DATA IN CLAUDESK AND NOT A PARSED MARKDOWN TABLE
//
// The machine lives upstream as markdown in the companion mccc repo
// (`workflow-system/product/transitions.md`). Claudesk absorbs it as a typed literal
// rather than parsing that file at runtime, for two reasons:
//
//   • ⚠️ `transitions.md` reaches this repo only through `_ref/claude-customization/`,
//     a GITIGNORED SYMLINK. It is absent from a shipped `.app` and from a fresh
//     checkout. A runtime parser would make the supervisor depend on a companion
//     checkout being present — i.e. work on the developer's machine and nowhere else.
//
//   • A typed literal is checkable at COMPILE time. The whole point of WP2 is that a
//     prose table has no exhaustiveness check, so cells drift silently (and demonstrably
//     have — see the A-2 note below).
//
// ⚠️ ACCEPTED COST: the model can drift from upstream. Mitigated by the drift test
// (Phase 4 P4.5), which reads `_ref/` when present and skips cleanly when absent.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ `transitions.md` IS THE SOLE AUTHORITY — THE `AGENTS.md` TABLES ARE NOT ABSORBED
//
// The graph is duplicated upstream across `transitions.md` and four
// `agents/<workflow>-workflow/AGENTS.md` files. THE COPIES DISAGREE. Measured
// 2026-09-12 against the live source:
//
//   • `transitions.md`: F10 = verify-auto → **verify-self**, plus F9b, F10b, F30.
//   • `AGENTS.md`:      F10 = verify-auto → **verify-human**, and F9b/F10b/F30 are
//     ABSENT ENTIRELY. Its state table has 12 rows and does not list `verify-self`
//     at all — it predates verify-self being a state.
//
// Transcribing from `AGENTS.md`, or merging the two, would import a wrong F10 target
// straight into the lookup that the WP3 detector's verdict IS. A wrong edge target is a
// wrong policy row is a wrong fire.
//
// This is also why mccc's `check-structure.sh` Phase 9 is handed back for DELETION
// rather than transfer (WBS 2.9): Phase 9 exists to keep those four copies in sync, and
// it is demonstrably not keeping them in sync with `transitions.md`.

/**
 * The five workflows the machine spans.
 *
 * `session-ops` is the cross-cutting one (reflect, capture, handoff, restore) — it has
 * `S<n>` edge ids like the others but no linear happy path of its own.
 */
export type WorkflowId =
  | "product"
  | "feature"
  | "task"
  | "incident"
  | "session-ops";

/**
 * A state within a workflow, as spelled upstream (`spec`, `verify-auto`, `triage`, …).
 *
 * Deliberately a bare string rather than a union of literals: the states are declared as
 * data in `edges.ts` and validated there, so a union here would be a second place to
 * update and a second place to drift. `StateId` exists for READABILITY of the signatures.
 */
export type StateId = string;

/**
 * A transition id — `F7`, `F10b`, `T5a`, `S22`, `P13`, …
 *
 * ⚠️ The suffixed forms are real and load-bearing (`F9b`, `F10b`, `F17b`, `T5a/b/c`,
 * `F37b`). Any regex over these must admit a trailing letter; `F[0-9]+` alone silently
 * drops six edges.
 */
export type EdgeId = string;

/**
 * Where an edge's `to` side points, for the purpose of "is there something to fire into?"
 *
 * ⚠️ THIS IS THE PROBE'S FIRST MANDATORY STRUCTURAL CORRECTION, and it is the reason
 * this is a SEPARATE field rather than something derived from the policy cell.
 *
 * A policy cell answers *"may the orchestrator chain without pausing?"*. It does NOT
 * answer *"is there anything to chain TO?"*. Those are different questions and the
 * upstream table only encodes the first. Labelling the WP1 corpus on the mode cell alone
 * marked **223** breaks; adding this classification took it to **127** (and the chain-window
 * fix then took it to the true **96**). The 96 excess were terminal / SURFACE / meta-op
 * edges — `S20`, `S17`, `F19`, `F30`, `P13`, `S6` — whose FROM-state policy row reads AUTO
 * but whose target is not a dispatchable skill.
 *
 * ⚠️ Without this, WP3 injects commands into workflows that have already ended.
 */
export type DispatchTarget =
  /**
   * A real next skill exists and can be invoked. The ONLY value WP3 may fire on.
   *
   * `skill` is the slash-command name without the leading slash (`feature-build`), which
   * per the recorded §4c anti-brittleness decision is the only stable cross-repo coupling
   * — never a filesystem path.
   */
  | { readonly kind: "skill"; readonly skill: string }
  /**
   * The workflow ENDS here. `F19` (finalize → EXIT→reflect), `F35` (reproduce →
   * terminate), `T10` (close → EXIT), `P13` (product cycle EXIT).
   *
   * ⚠️ An `EXIT→reflect` edge is terminal for the WORKFLOW even though a meta-op follows
   * it. The boundary exit chain is modeled by its own `S<n>` edges, so treating the exit
   * itself as dispatchable would double-fire.
   */
  | { readonly kind: "terminal"; readonly note: string }
  /**
   * A SURFACE — a discovery logged at a higher level (`F25`, `F26`, `T7`, `T8`, `I11`,
   * `I12`). Note-and-continue or pause-and-escalate; either way the CURRENT workflow does
   * not hand control to a new skill, so there is nothing to inject.
   */
  | { readonly kind: "surface"; readonly to: string }
  /**
   * A meta-operation with no dispatchable skill of its own — writing `.session.md`
   * (`S17`), a terminal session op (`S20`), a restore (`S6`).
   */
  | { readonly kind: "meta-op"; readonly note: string }
  /**
   * A cross-workflow ESCALATE or REDIRECT (`T3`, `T4`, `T9`, `F22`, `F27`, `F28`, `F36`).
   *
   * ⚠️ Deliberately NOT `kind: "skill"` even though a skill name is often nameable. These
   * hand control to a DIFFERENT workflow, and every one of them is PAUSE in Modes 1–3
   * upstream. Classifying them as dispatchable would let a Mode-4 fire cross a workflow
   * boundary unattended — a blast radius nothing in M15 measured or sanctioned.
   */
  | { readonly kind: "cross-workflow"; readonly to: string };

/** Narrowing helper — the one predicate WP3 may gate a fire on. */
export function isDispatchable(
  target: DispatchTarget,
): target is Extract<DispatchTarget, { kind: "skill" }> {
  return target.kind === "skill";
}

/**
 * One transition, as recorded upstream.
 *
 * ⚠️ `from` and `to` are kept as the upstream spellings INCLUDING the sentinels (`ENTRY`,
 * `EXIT`, `ANY`, `SURFACE-IN`, `EXIT→reflect`, `SURFACE→product:wbs`). Normalizing them
 * away at transcription time would lose the distinction between "a state" and "a boundary",
 * which is exactly what `dispatchTarget` has to classify.
 */
export interface Edge {
  /** `F7`, `T5a`, `S22`, … — unique across the whole graph, not just within a workflow. */
  readonly id: EdgeId;
  /** Which workflow's table this row came from. */
  readonly workflow: WorkflowId;
  /** Upstream `From` cell, verbatim. */
  readonly from: StateId;
  /** Upstream `To` cell, verbatim. */
  readonly to: StateId;
  /** Upstream `Condition` cell, condensed to one line. Documentation, never parsed. */
  readonly condition: string;
  /**
   * ⚠️ Held SEPARATELY from the policy cell — see `DispatchTarget`. The policy cell says
   * whether chaining is allowed; this says whether there is anything to chain to.
   */
  readonly dispatchTarget: DispatchTarget;
}
