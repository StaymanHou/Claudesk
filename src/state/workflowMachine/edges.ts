// M15 WP2 Phase 1 — the absorbed edge graph.
//
// ⚠️ TRANSCRIBED FROM `transitions.md` ONLY. See the header of `types.ts` for why the
// four `AGENTS.md` copies are NOT a source: they disagree (F10's target) and are
// incomplete (F9b/F10b/F30 absent).
//
// ⚠️ THE TWO `behavior-within-state` ROWS ARE DELIBERATELY ABSENT. `transitions.md:453`
// (reflect's candidate filter) and `:454` (session-capture's drive-mode-conditional
// confirm gate) describe what happens INSIDE a state, which is mccc's half of the
// ownership boundary settled 2026-08-14 (Claudesk owns the VALUE + TURN-BOUNDARY
// enforcement; mccc owns the MEANING + INTRA-TURN semantics). Absorbing them would cross
// that boundary. `edges.test.ts` pins their absence so a later transcription pass cannot
// quietly import them.
//
// ⚠️ COUNTS ARE NOT HARDCODED FROM `wbs.md`. Its M-7 says 113 transition rows; the live
// source has 111 (measured 2026-09-12). A test asserting a stale constant would FAIL on a
// correct absorption and PASS on an incomplete one. `EDGES.length` is the absorbed truth;
// the drift test (P4.5) compares it to upstream when `_ref/` is present.

import type { DispatchTarget, Edge } from "./types";

/** A dispatchable next skill. `skill` is the slash-command name, never a path. */
const skill = (name: string): DispatchTarget => ({
  kind: "skill",
  skill: name,
});
/** The workflow ends here. */
const terminal = (note: string): DispatchTarget => ({ kind: "terminal", note });
/** A discovery logged at a higher level; the current workflow keeps control. */
const surface = (to: string): DispatchTarget => ({ kind: "surface", to });
/** A meta-op with no dispatchable skill of its own. */
const metaOp = (note: string): DispatchTarget => ({ kind: "meta-op", note });
/** Hands control to a DIFFERENT workflow. Never auto-fired — see `types.ts`. */
const crossWorkflow = (to: string): DispatchTarget => ({
  kind: "cross-workflow",
  to,
});

/**
 * Every transition in the machine, verbatim from `transitions.md`.
 *
 * ⚠️ `from`/`to` keep the upstream sentinels (`ENTRY`, `ANY`, `SURFACE-IN`, `EXIT→reflect`)
 * rather than being normalized — the boundary-vs-state distinction is what `dispatchTarget`
 * classifies.
 */
export const EDGES: readonly Edge[] = [
  // ─── Product workflow ────────────────────────────────────────────────────────
  {
    id: "P1",
    workflow: "product",
    from: "ENTRY",
    to: "vision",
    condition: "New product initiative",
    dispatchTarget: skill("product-vision"),
  },
  {
    id: "P2",
    workflow: "product",
    from: "vision",
    to: "roadmap",
    condition: "Vision approved",
    dispatchTarget: skill("product-roadmap"),
  },
  {
    id: "P3",
    workflow: "product",
    from: "roadmap",
    to: "research",
    condition: "Roadmap approved, next milestone needs technical scouting",
    dispatchTarget: skill("product-research"),
  },
  {
    id: "P4",
    workflow: "product",
    from: "research",
    to: "roadmap",
    condition: "Back-loop: research invalidates roadmap sequencing",
    dispatchTarget: skill("product-roadmap"),
  },
  {
    id: "P5",
    workflow: "product",
    from: "research",
    to: "arch",
    condition: "Research complete",
    dispatchTarget: skill("product-arch"),
  },
  {
    id: "P6",
    workflow: "product",
    from: "arch",
    to: "research",
    condition: "Back-loop: architecture needs more research",
    dispatchTarget: skill("product-research"),
  },
  {
    id: "P7",
    workflow: "product",
    from: "arch",
    to: "wbs",
    condition: "Architecture defined",
    dispatchTarget: skill("product-wbs"),
  },
  {
    id: "P8",
    workflow: "product",
    from: "wbs",
    to: "arch",
    condition: "Back-loop: decomposition reveals architectural gap",
    dispatchTarget: skill("product-arch"),
  },
  {
    id: "P9",
    workflow: "product",
    from: "wbs",
    to: "context",
    condition: "WBS complete",
    dispatchTarget: skill("product-context"),
  },
  {
    id: "P10",
    workflow: "product",
    from: "context",
    to: "EXIT→feature:plan",
    condition: "Context generated — hand off to the feature workflow",
    // ⚠️ cross-workflow, not `skill`: it leaves the product machine entirely.
    dispatchTarget: crossWorkflow("feature:plan"),
  },
  {
    id: "P11",
    workflow: "product",
    from: "SURFACE-IN",
    to: "wbs",
    condition: "Work item surfaced from a lower level",
    dispatchTarget: surface("product:wbs"),
  },
  {
    id: "P12",
    workflow: "product",
    from: "SURFACE-IN",
    to: "arch",
    condition: "Architectural change surfaced from a lower level",
    dispatchTarget: surface("product:arch"),
  },
  {
    id: "P13",
    workflow: "product",
    from: "product-finalize",
    to: "EXIT",
    condition: "Cycle closed — durable docs resynced, cycle docs archived",
    // ⚠️ One of the six probe-named non-dispatchable edges (223 → 127).
    dispatchTarget: terminal("product cycle EXIT"),
  },
  {
    id: "P14",
    workflow: "product",
    from: "product-finalize",
    to: "arch",
    condition: "Back-loop: finalize finds arch resync is not mechanical",
    dispatchTarget: skill("product-arch"),
  },

  // ─── Feature workflow ────────────────────────────────────────────────────────
  {
    id: "F1",
    workflow: "feature",
    from: "ENTRY",
    to: "spec",
    condition: "Feature is complex (fails small/simple criteria)",
    dispatchTarget: skill("feature-spec"),
  },
  {
    id: "F2",
    workflow: "feature",
    from: "ENTRY",
    to: "plan",
    condition: "Feature is small/simple (all criteria met)",
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F3",
    workflow: "feature",
    from: "spec",
    to: "research",
    condition: "Unknowns exist",
    // ⚠️ REGRESSION SENTINEL (with F4). A spec exit — PAUSE in Mode 3. All 23 of the
    // naive predicate's false positives were spec exits (F4 ×20, F3 ×3).
    dispatchTarget: skill("feature-research"),
  },
  {
    id: "F4",
    workflow: "feature",
    from: "spec",
    to: "plan",
    condition: "No unknowns, spec is clear",
    // ⚠️ REGRESSION SENTINEL (with F3) — see F3.
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F5",
    workflow: "feature",
    from: "research",
    to: "plan",
    condition: "Research complete",
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F6",
    workflow: "feature",
    from: "research",
    to: "spec",
    condition: "Back-loop: research reveals spec is wrong",
    dispatchTarget: skill("feature-spec"),
  },
  {
    id: "F7",
    workflow: "feature",
    from: "plan",
    to: "build",
    condition: "Plan created with phases (starts phase 1)",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F8",
    workflow: "feature",
    from: "build",
    to: "verify-auto",
    condition: "Phase implementation complete",
    dispatchTarget: skill("feature-verify-auto"),
  },
  {
    id: "F9",
    workflow: "feature",
    from: "verify-auto",
    to: "build",
    condition: "Back-loop: tests fail",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F10",
    workflow: "feature",
    from: "verify-auto",
    to: "verify-self",
    // ⚠️ `verify-self`, NOT `verify-human`. The `AGENTS.md` copy says verify-human and is
    // stale — it predates verify-self existing. See `types.ts` header.
    condition: "Tests pass",
    dispatchTarget: skill("feature-verify-self"),
  },
  {
    id: "F10b",
    workflow: "feature",
    from: "verify-self",
    to: "verify-human",
    condition: "All blocking outcomes pass (cosmetic issues noted)",
    // ⚠️ Absent from the `AGENTS.md` copy entirely.
    dispatchTarget: skill("feature-verify-human"),
  },
  {
    id: "F9b",
    workflow: "feature",
    from: "verify-self",
    to: "build",
    condition: "Back-loop: blocking observable outcome failed",
    // ⚠️ Absent from the `AGENTS.md` copy entirely.
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F11",
    workflow: "feature",
    from: "verify-human",
    to: "verify-codify",
    condition:
      "Phase has no integration boundary (agent affirms) — Mode 3 auto-skips when verify-self all-PASS",
    dispatchTarget: skill("feature-verify-codify"),
  },
  {
    id: "F12",
    workflow: "feature",
    from: "verify-human",
    to: "build",
    condition: "Back-loop: human rejects",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F13",
    workflow: "feature",
    from: "verify-human",
    to: "verify-codify",
    condition: "Human approves happy path",
    dispatchTarget: skill("feature-verify-codify"),
  },
  {
    id: "F14",
    workflow: "feature",
    from: "verify-codify",
    to: "verify-human",
    condition: "Back-loop: new tests reveal issues human missed",
    dispatchTarget: skill("feature-verify-human"),
  },
  {
    id: "F15",
    workflow: "feature",
    from: "verify-codify",
    to: "build",
    condition: "Tests written, more phases remain (advance to next phase)",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F16",
    workflow: "feature",
    from: "verify-codify",
    to: "ship",
    condition: "Tests written, all phases complete",
    dispatchTarget: skill("feature-ship"),
  },
  {
    id: "F17b",
    workflow: "feature",
    from: "ship",
    to: "finalize",
    // ⚠️ The Mode-4 route AROUND the skipped review-quality state. Modeled as its own
    // edge rather than as a property of F38, because in Mode 4 review-quality is
    // `SKIP (entire skill)` — the state does not execute at all.
    condition:
      "Shipped, Mode 4 (fsd) SKIPs review-quality — direct ship → finalize",
    dispatchTarget: skill("feature-finalize"),
  },
  {
    id: "F18",
    workflow: "feature",
    from: "finalize",
    to: "refactor",
    condition: "Tech debt identified",
    dispatchTarget: skill("feature-refactor"),
  },
  {
    id: "F19",
    workflow: "feature",
    from: "finalize",
    to: "EXIT→reflect",
    condition: "No tech debt, feature done",
    // ⚠️ One of the six probe-named non-dispatchable edges. The workflow ENDS; the
    // boundary exit chain that follows is modeled by S22/S23, so treating this as
    // dispatchable would double-fire.
    dispatchTarget: terminal("feature workflow EXIT → reflect"),
  },
  {
    id: "F20",
    workflow: "feature",
    from: "refactor",
    to: "plan",
    condition:
      "Refactor needs a plan — CONSTRAINT: cleanup only, no new features",
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F21",
    workflow: "feature",
    from: "refactor",
    to: "EXIT→reflect",
    condition: "Refactor complete",
    dispatchTarget: terminal("feature workflow EXIT → reflect"),
  },
  {
    id: "F22",
    workflow: "feature",
    from: "build",
    to: "research",
    condition:
      "REDIRECT: hit unknown during implementation — pause, research, return",
    // ⚠️ REDIRECT. PAUSE in Modes 1–3 upstream; never auto-fired.
    dispatchTarget: crossWorkflow("feature:research (REDIRECT)"),
  },
  {
    id: "F23",
    workflow: "feature",
    from: "build",
    to: "plan",
    condition: "Back-loop: plan is wrong/incomplete",
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F24",
    workflow: "feature",
    from: "verify-auto",
    to: "spec",
    condition: "Back-loop: tests reveal spec was wrong",
    dispatchTarget: skill("feature-spec"),
  },
  {
    id: "F25",
    workflow: "feature",
    from: "build",
    to: "SURFACE→product:wbs",
    condition: "Discovered module/component not in WBS (note-and-continue)",
    dispatchTarget: surface("product:wbs"),
  },
  {
    id: "F26",
    workflow: "feature",
    from: "build",
    to: "SURFACE→product:arch",
    condition: "Architectural change needed (pause-and-escalate)",
    dispatchTarget: surface("product:arch"),
  },
  {
    id: "F27",
    workflow: "feature",
    from: "ANY",
    to: "incident:report",
    condition: "Something breaks",
    dispatchTarget: crossWorkflow("incident:report"),
  },
  {
    id: "F28",
    workflow: "feature",
    from: "SURFACE-IN",
    to: "spec",
    condition: "Task/incident escalated to feature",
    dispatchTarget: crossWorkflow("feature:spec (SURFACE-IN)"),
  },
  {
    id: "F30",
    workflow: "feature",
    from: "finalize",
    to: "product-finalize",
    condition:
      "WBS fully complete — all WPs [x]; surface product-finalize to user",
    // ⚠️ One of the six probe-named non-dispatchable edges. "Surface to user", not
    // "invoke" — the policy row reads AUTO but there is nothing to fire.
    dispatchTarget: surface("product:finalize"),
  },
  {
    id: "F31",
    workflow: "feature",
    from: "ENTRY",
    to: "reproduce",
    condition: "Bug-shape entry: user describes undesirable behavior",
    dispatchTarget: skill("feature-reproduce"),
  },
  {
    id: "F32",
    workflow: "feature",
    from: "reproduce",
    to: "spec",
    condition: "Reproduced cleanly, feature is complex",
    dispatchTarget: skill("feature-spec"),
  },
  {
    id: "F33",
    workflow: "feature",
    from: "reproduce",
    to: "plan",
    condition: "Reproduced cleanly, feature is small/simple",
    dispatchTarget: skill("feature-plan"),
  },
  {
    id: "F34",
    workflow: "feature",
    from: "reproduce",
    to: "spec",
    condition:
      "Could-not-reproduce, user elects preventive hardening — spec framing reset",
    dispatchTarget: skill("feature-spec"),
  },
  {
    id: "F35",
    workflow: "feature",
    from: "reproduce",
    to: "EXIT (terminate)",
    condition:
      "Could-not-reproduce, no preventive fix — close with attempt as record",
    dispatchTarget: terminal("feature workflow terminated at reproduce"),
  },
  {
    id: "F36",
    workflow: "feature",
    from: "build",
    to: "reproduce",
    condition:
      "REDIRECT: fix cannot be confirmed without first reproducing the bug",
    dispatchTarget: crossWorkflow("feature:reproduce (REDIRECT)"),
  },
  {
    id: "F37",
    workflow: "feature",
    from: "reproduce",
    to: "build",
    condition: "Return-from-F36: reproduced cleanly mid-build",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F37b",
    workflow: "feature",
    from: "reproduce",
    to: "build",
    condition:
      "Return-from-F36: could-not-reproduce mid-build, documented as Discovery",
    dispatchTarget: skill("feature-build"),
  },
  {
    id: "F38",
    workflow: "feature",
    from: "ship",
    to: "review-quality",
    condition:
      "Shipped — invoke per-feature code-quality review (default path)",
    dispatchTarget: skill("feature-review-quality"),
  },
  {
    id: "F39",
    workflow: "feature",
    from: "review-quality",
    to: "finalize",
    condition: "Review clean (or MINOR / Mode-3 MAJOR auto-backlogged)",
    dispatchTarget: skill("feature-finalize"),
  },
  {
    id: "F40",
    workflow: "feature",
    from: "review-quality",
    to: "refactor",
    condition: "Review surfaced CRITICAL → auto-invoke refactor (Modes 2–3)",
    dispatchTarget: skill("feature-refactor"),
  },
  {
    id: "F41",
    workflow: "feature",
    from: "review-quality",
    to: "finalize",
    condition: "Mode-2 MAJOR after operator pause-and-ask completed",
    dispatchTarget: skill("feature-finalize"),
  },

  // ─── Task workflow ───────────────────────────────────────────────────────────
  {
    id: "T1",
    workflow: "task",
    from: "ENTRY",
    to: "plan",
    condition: "Always",
    dispatchTarget: skill("task-plan"),
  },
  {
    id: "T2",
    workflow: "task",
    from: "plan",
    to: "act",
    condition: "Plan is clear, ready to implement",
    dispatchTarget: skill("task-act"),
  },
  {
    id: "T3",
    workflow: "task",
    from: "plan",
    to: "ESCALATE→feature:spec",
    condition: "'This is bigger than a task' — close task, open feature",
    dispatchTarget: crossWorkflow("feature:spec (ESCALATE)"),
  },
  {
    id: "T4",
    workflow: "task",
    from: "plan",
    to: "REDIRECT→feature:research",
    condition: "Research needed — pause task, research, return",
    dispatchTarget: crossWorkflow("feature:research (REDIRECT)"),
  },
  {
    id: "T5a",
    workflow: "task",
    from: "act",
    to: "verify",
    condition: "Implementation complete — every act exits to verify",
    dispatchTarget: skill("task-verify"),
  },
  {
    id: "T5b",
    workflow: "task",
    from: "verify",
    to: "close",
    condition: "Verification PASSed (or docs-only auto-skip)",
    dispatchTarget: skill("task-close"),
  },
  {
    id: "T5c",
    workflow: "task",
    from: "verify",
    to: "act",
    condition:
      "Verification FAILed — back-loop with failed observable as scope marker",
    dispatchTarget: skill("task-act"),
  },
  {
    id: "T6",
    workflow: "task",
    from: "act",
    to: "plan",
    condition: "Back-loop: need to re-plan",
    dispatchTarget: skill("task-plan"),
  },
  {
    id: "T7",
    workflow: "task",
    from: "act",
    to: "SURFACE→feature:spec",
    condition:
      "Discovered something bigger (note-and-continue or pause-and-escalate)",
    dispatchTarget: surface("feature:spec"),
  },
  {
    id: "T8",
    workflow: "task",
    from: "act",
    to: "SURFACE→product:wbs",
    condition: "New work item discovered (note-and-continue)",
    dispatchTarget: surface("product:wbs"),
  },
  {
    id: "T9",
    workflow: "task",
    from: "act",
    to: "ESCALATE→feature:spec",
    condition: "Task grew beyond task scope — close task, open feature",
    dispatchTarget: crossWorkflow("feature:spec (ESCALATE)"),
  },
  {
    id: "T10",
    workflow: "task",
    from: "close",
    to: "EXIT",
    condition: "Always",
    dispatchTarget: terminal("task workflow EXIT"),
  },
  {
    id: "T11",
    workflow: "task",
    from: "close",
    to: "EXIT→reflect",
    condition: "Significant learning occurred (optional auto-trigger)",
    dispatchTarget: terminal("task workflow EXIT → reflect"),
  },

  // ─── Incident workflow ───────────────────────────────────────────────────────
  // ⚠️ Incidents are ALWAYS treated as Mode 2 regardless of the selected drive mode.
  // That rule lives in `policy.ts` (Phase 2), not here — it is a policy property, not a
  // graph property.
  {
    id: "I1",
    workflow: "incident",
    from: "ENTRY",
    to: "report",
    condition: "Production incident reported",
    dispatchTarget: skill("incident-report"),
  },
  {
    id: "I2",
    workflow: "incident",
    from: "report",
    to: "triage",
    condition: "Report filed",
    dispatchTarget: skill("incident-triage"),
  },
  {
    id: "I3",
    workflow: "incident",
    from: "triage",
    to: "investigate",
    condition: "Severity warrants investigation",
    dispatchTarget: skill("incident-investigate"),
  },
  {
    id: "I4",
    workflow: "incident",
    from: "triage",
    to: "resolve",
    condition: "Fast-close: trivial or already-resolved",
    dispatchTarget: skill("incident-resolve"),
  },
  {
    id: "I5",
    workflow: "incident",
    from: "investigate",
    to: "investigate",
    condition: "Self-loop: continue gathering evidence",
    dispatchTarget: skill("incident-investigate"),
  },
  {
    id: "I6",
    workflow: "incident",
    from: "investigate",
    to: "mitigate",
    condition: "Cause identified, fix ready",
    dispatchTarget: skill("incident-mitigate"),
  },
  {
    id: "I7",
    workflow: "incident",
    from: "investigate",
    to: "resolve",
    condition: "Fast-close: investigation shows no action needed",
    dispatchTarget: skill("incident-resolve"),
  },
  {
    id: "I8",
    workflow: "incident",
    from: "mitigate",
    to: "investigate",
    condition: "Back-loop: mitigation reveals the cause was wrong",
    dispatchTarget: skill("incident-investigate"),
  },
  {
    id: "I9",
    workflow: "incident",
    from: "mitigate",
    to: "resolve",
    condition: "Defer path: codify deferred with a SURFACE entry",
    dispatchTarget: skill("incident-resolve"),
  },
  {
    id: "I10",
    workflow: "incident",
    from: "resolve",
    to: "EXIT→reflect",
    condition: "Incident resolved",
    dispatchTarget: terminal("incident workflow EXIT → reflect"),
  },
  {
    id: "I11",
    workflow: "incident",
    from: "resolve",
    to: "SURFACE→task:plan",
    condition: "Follow-up work surfaced as a task",
    dispatchTarget: surface("task:plan"),
  },
  {
    id: "I12",
    workflow: "incident",
    from: "resolve",
    to: "SURFACE→feature:spec",
    condition: "Follow-up work surfaced as a feature",
    dispatchTarget: surface("feature:spec"),
  },
  {
    id: "I13",
    workflow: "incident",
    from: "triage",
    to: "reproduce",
    condition: "Reproduction needed before investigating",
    dispatchTarget: skill("incident-reproduce"),
  },
  {
    id: "I14",
    workflow: "incident",
    from: "reproduce",
    to: "investigate",
    condition: "Reproduced — proceed to investigate",
    dispatchTarget: skill("incident-investigate"),
  },
  {
    id: "I15",
    workflow: "incident",
    from: "reproduce",
    to: "investigate",
    condition: "Could-not-reproduce — investigate with telemetry constraint",
    dispatchTarget: skill("incident-investigate"),
  },
  {
    id: "I16",
    workflow: "incident",
    from: "reproduce",
    to: "EXIT (pause-as-record)",
    condition: "Could-not-reproduce — pause as record",
    dispatchTarget: terminal("incident paused as record"),
  },
  {
    id: "I17",
    workflow: "incident",
    from: "mitigate",
    to: "codify",
    condition: "Mitigated — codify regression coverage",
    dispatchTarget: skill("incident-codify"),
  },
  {
    id: "I18",
    workflow: "incident",
    from: "codify",
    to: "resolve",
    condition: "Regression coverage written",
    dispatchTarget: skill("incident-resolve"),
  },
  {
    id: "I19",
    workflow: "incident",
    from: "codify",
    to: "mitigate",
    condition: "Back-loop: codify reveals the mitigation is incomplete",
    dispatchTarget: skill("incident-mitigate"),
  },
  {
    id: "I20",
    workflow: "incident",
    from: "codify",
    to: "investigate",
    condition: "Back-loop: codify reveals the cause was wrong",
    dispatchTarget: skill("incident-investigate"),
  },

  // ─── Session operations (cross-cutting) ──────────────────────────────────────
  // ⚠️ S1–S5 and S18 are session-start's CLASSIFICATION outputs: they hand control to a
  // different workflow's entry skill, so they are cross-workflow, not `skill`.
  // ⚠️ S7–S14 are not transitions between states at all — they are session-start's
  // documented ORCHESTRATION behaviors (auto-chain / pause / menu). They are absorbed so
  // the graph matches upstream 1:1, and classified meta-op so nothing can fire them.
  {
    id: "S1",
    workflow: "session-ops",
    from: "session-start",
    to: "task:plan",
    condition: "Classified as task (atomic change, bug fix)",
    dispatchTarget: crossWorkflow("task:plan"),
  },
  {
    id: "S2",
    workflow: "session-ops",
    from: "session-start",
    to: "feature:spec",
    condition: "Classified as complex feature",
    dispatchTarget: crossWorkflow("feature:spec"),
  },
  {
    id: "S3",
    workflow: "session-ops",
    from: "session-start",
    to: "feature:plan",
    condition: "Classified as small/simple feature",
    dispatchTarget: crossWorkflow("feature:plan"),
  },
  {
    id: "S4",
    workflow: "session-ops",
    from: "session-start",
    to: "incident:report",
    condition: "Classified as production incident",
    dispatchTarget: crossWorkflow("incident:report"),
  },
  {
    id: "S5",
    workflow: "session-ops",
    from: "session-start",
    to: "product:vision",
    condition: "Classified as new product initiative",
    dispatchTarget: crossWorkflow("product:vision"),
  },
  {
    id: "S6",
    workflow: "session-ops",
    from: "session-restore",
    to: "(resume_skill)",
    condition: "Context restored; `.session.md` deleted after handoff",
    // ⚠️ One of the six probe-named non-dispatchable edges. The target is whatever
    // `resume_skill` names — a VARIABLE, not a fixed skill. WP3 must not fire it.
    dispatchTarget: metaOp("hands off to the pointer's resume_skill"),
  },
  {
    id: "S7",
    workflow: "session-ops",
    from: "session-start",
    to: "(auto-chain)",
    condition: "Orchestrator auto-chains build → verify-auto without asking",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S8",
    workflow: "session-ops",
    from: "session-start",
    to: "(pause)",
    condition: "Orchestrator pauses at verify-human",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S9",
    workflow: "session-ops",
    from: "session-start",
    to: "(pause)",
    condition: "Orchestrator pauses at feature-finalize",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S10",
    workflow: "session-ops",
    from: "session-start",
    to: "(drive-mode menu)",
    condition: "User wants end-to-end drive — present mode menu",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S11",
    workflow: "session-ops",
    from: "session-start",
    to: "(auto-chain)",
    condition: "Mode 4 (FSD): chain past plan into build without pausing",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S12",
    workflow: "session-ops",
    from: "session-start",
    to: "(pause)",
    condition: "Mode 3 (Autopilot): pause only at verify-human",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S13",
    workflow: "session-ops",
    from: "session-start",
    to: "(pause-after-each)",
    condition: "Mode 1 (Stepping): pause after every skill",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S14",
    workflow: "session-ops",
    from: "session-start",
    to: "(skip+chain)",
    condition: "Mode 4 (FSD): skip verify-human, chain to verify-codify",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S15",
    workflow: "session-ops",
    from: "session-restore",
    to: "(mode menu)",
    condition:
      "Surface `drive_mode` from `.session.md` and present change-mode menu",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S16",
    workflow: "session-ops",
    from: "session-restore",
    to: "(mode change)",
    condition: "User selects a different drive mode on restore",
    dispatchTarget: metaOp("orchestration behavior, not a state transition"),
  },
  {
    id: "S17",
    workflow: "session-ops",
    from: "session-handoff",
    to: "(.session.md)",
    condition: "Write `drive_mode` from WIP frontmatter into `.session.md`",
    // ⚠️ One of the six probe-named non-dispatchable edges. Its "target" is a FILE WRITE.
    dispatchTarget: metaOp(
      "writes .session.md; the target is a file, not a skill",
    ),
  },
  {
    id: "S18",
    workflow: "session-ops",
    from: "session-start",
    to: "feature:reproduce",
    condition: "Classified as bug-shape feature",
    dispatchTarget: crossWorkflow("feature:reproduce"),
  },
  // ⚠️ S19 and S21 DO NOT EXIST upstream — gaps in the numbering, not transcription
  // misses. Pinned by a test so a later pass does not "restore" an edge that was never
  // there. (F29 is the same kind of gap in the feature table.)
  {
    id: "S20",
    workflow: "session-ops",
    from: "session-capture",
    to: "(terminal)",
    condition:
      "Learning persisted (project-scope written, or global-scope drafted)",
    // ⚠️ One of the six probe-named non-dispatchable edges.
    dispatchTarget: terminal("session-capture terminal"),
  },
  // ⚠️ S22/S23 are the TWO rows where this transcription deliberately diverges from the
  // upstream cell layout — the only two of 111. Upstream crams the whole edge into the
  // `From` cell (`reflect → session-handoff`) and puts the edge's TYPE (`(auto-chain)`)
  // in `To`. Transcribed verbatim, `to` would read "(auto-chain)" and the real target
  // would be buried in a string needing a second parse. Both rows' prose confirms the
  // reading used here ("auto-chain straight to `session-handoff`"), and both state
  // "AUTO in all four drive modes". `edges.test.ts` pins this divergence explicitly so
  // the drift test (P4.5) does not read it as a transcription error.
  {
    id: "S22",
    workflow: "session-ops",
    from: "reflect",
    to: "session-handoff",
    condition:
      "Session-boundary exit chain, no-learning arm — reflect yielded nothing to persist",
    // ⚠️ AUTO in Modes 2-4 at a clean boundary; PAUSE in Mode 1. Upstream's prose says
    // "AUTO in all four drive modes", but Mode 1 (stepping) pauses after EVERY skill by
    // definition — that is what stepping IS — so the modeled cell is
    // `stepping ? pause : auto`. The divergence is deliberate and pinned by the Phase 18
    // port (P5.2). Found at verify-self when this comment still said "all four".
    dispatchTarget: skill("session-handoff"),
  },
  {
    id: "S23",
    workflow: "session-ops",
    from: "session-capture",
    to: "session-handoff",
    condition:
      "Session-boundary exit chain, learning-found arm — after the save lands",
    // ⚠️ AUTO in Modes 2-4 at a clean boundary; PAUSE in Mode 1. Upstream's prose says
    // "AUTO in all four drive modes", but Mode 1 (stepping) pauses after EVERY skill by
    // definition — that is what stepping IS — so the modeled cell is
    // `stepping ? pause : auto`. The divergence is deliberate and pinned by the Phase 18
    // port (P5.2). Found at verify-self when this comment still said "all four".
    dispatchTarget: skill("session-handoff"),
  },
];

/** Every edge, in upstream order. */
export function allEdges(): readonly Edge[] {
  return EDGES;
}

/** Index for O(1) lookup by id. Built once; `EDGES` is frozen-by-convention. */
const BY_ID: ReadonlyMap<string, Edge> = new Map(EDGES.map((e) => [e.id, e]));

/** Look up one edge. Returns `undefined` for an unknown id — callers must handle it. */
export function edgeById(id: string): Edge | undefined {
  return BY_ID.get(id);
}
