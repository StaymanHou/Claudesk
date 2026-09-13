// M15 WP3 Phase 3 — THE VERDICT. Does this turn-end warrant firing the next command?
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS MODULE ANSWERS THREE INDEPENDENT QUESTIONS AND FIRES ONLY IF ALL THREE SAY YES.
// Collapsing any two of them is the defect this whole milestone exists to prevent:
//
//   1. **What edge was emitted?**      → the transcript reader (Phase 2)
//   2. **May I chain without pausing?** → `resolvePolicy` — THE SINGLE FUNNEL
//   3. **Is there anything to chain TO?** → `isDispatchable(edge.dispatchTarget)`
//   4. **Did it already chain?**        → the reader's window (Phase 2)
//
// ⚠️ (2) AND (3) ARE DIFFERENT QUESTIONS AND THE MODEL DOES NOT ENFORCE THE PAIRING.
// A policy cell that reads AUTO does NOT imply a next skill exists. Labelling the WP1 corpus
// on the mode cell alone marked **223** breaks; the excess were terminal / SURFACE / meta-op
// edges (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`) whose from-state row says AUTO but whose
// target is not a dispatchable skill. `resolvePolicy` happily returns a verdict for those —
// nothing stops a caller firing on `cell.kind === "auto"` alone. ⚠️ That call-site risk is
// exactly what `AUTO-CELL-DOES-NOT-IMPLY-A-DISPATCHABLE-TARGET` names as WP3's remaining
// half, and it is a code-review item. Both reads live in ONE function here so there is one
// place to get it right and one place to review.
//
// ⚠️ `unmapped` IS A RESULT, NEVER A DEFAULT. 31 of 111 edges have no governing policy row,
// and the union arm structurally has no `cell` field. **Do NOT add an `?? "auto"` fallback
// anywhere near this** — it would fire on 31 ungoverned edges including `I2` (report →
// triage), which IS dispatchable.
//
// ⚠️ THE STORED DRIVE MODE IS THE AUTHORITY (ruling R-1). Mode 0 / "was this turn entered
// directly?" is NOT honored as a suppressor: only 3 of 206 skill-using sessions carry a
// `/session-start` marker while 139 chained ≥2 skills, so honoring it literally would
// suppress firing on ~every real session and ship the milestone dead. Accepted cost: a
// deliberate one-step run may get chained; the recovery is CC's own **Esc**.
//
// ⚠️ EVERY REFUSAL IS NAMED, NOT A BARE `false`. The binding failure direction is WITHHOLDING
// (R-6 condition 2), and a supervisor that silently declines is indistinguishable from one
// that is broken. A named reason is what makes "it didn't fire" diagnosable.

import { isDispatchable } from "../workflowMachine/types";
import { resolvePolicy } from "../workflowMachine/lookup";
import type { DriveMode, PolicyContext } from "../workflowMachine/policy";
import {
  parseTranscript,
  readTurn,
  type TranscriptLine,
  type TurnReading,
} from "./transcript";
import {
  adjudicate,
  type AdjudicationResult,
  type AdjudicatorDeps,
} from "./adjudicator";

/** Why the supervisor declined to fire. Every arm is a real, observed case. */
export type WithholdReason =
  /** The turn emitted no `TRANSITION:` token at all — the common case, and not a break. */
  | "no-verdict"
  /** A token was emitted but names an edge the graph does not contain (typo / unknown). */
  | "unknown-edge"
  /** No policy row governs this edge. ⚠️ A RESULT — never coerced to auto. */
  | "unmapped"
  /** The policy says pause (or skip) in this mode. A legitimate stop, not a break. */
  | "policy-not-auto"
  /** Policy says AUTO but the edge's target is not a dispatchable skill. */
  | "not-dispatchable"
  /** The turn already invoked the next skill — nothing to do. */
  | "already-chained";

/** The supervisor's decision for one turn. */
export type Verdict =
  | {
      readonly kind: "fire";
      /** The edge that was emitted. */
      readonly edgeId: string;
      /** The slash command to inject, WITHOUT the leading slash. */
      readonly skill: string;
      /** The mode actually applied (incidents force Mode 2 inside the funnel). */
      readonly mode: DriveMode;
    }
  | {
      readonly kind: "withhold";
      readonly reason: WithholdReason;
      /** The edge, when one was read. `null` for `no-verdict`. */
      readonly edgeId: string | null;
      /** Human-readable detail for the diagnostic. */
      readonly detail: string;
    };

/** Everything the verdict needs. Pure in, pure out — no IO, no React, no Tauri. */
export interface VerdictInput {
  /** Parsed transcript lines, oldest first (from `parseTranscript`). */
  readonly lines: readonly TranscriptLine[];
  /**
   * The project's STORED drive mode (`projects.json` → `default_drive_mode`).
   *
   * ⚠️ This is the authority per R-1. A project with no stored mode is NOT supervised —
   * see {@link decideVerdict}; that is a deliberate opt-in, not a default-on.
   */
  readonly storedMode: DriveMode | null;
  /** Evidence for the one conditional cell (feature/verify-human in autopilot). */
  readonly context?: PolicyContext;
}

/**
 * Decide whether to fire, and what.
 *
 * ⚠️ **A project with no stored drive mode NEVER fires.** Supervision is opt-in: the picker
 * shows "Drive Mode: None" for such a project, and firing into one would enforce a policy the
 * operator never selected. Defaulting to `orchestrated` here would silently supervise every
 * project on the machine.
 */
export function decideVerdict(input: VerdictInput): Verdict {
  const withhold = (
    reason: WithholdReason,
    edgeId: string | null,
    detail: string,
  ): Verdict => ({ kind: "withhold", reason, edgeId, detail });

  if (input.storedMode === null) {
    return withhold(
      "policy-not-auto",
      null,
      "project has no stored drive mode — supervision is opt-in",
    );
  }

  const reading: TurnReading = readTurn(input.lines);
  if (reading.edgeId === null) {
    return withhold("no-verdict", null, "the turn emitted no TRANSITION token");
  }

  // ⚠️ Checked BEFORE the policy lookup: a turn that already chained needs no verdict at
  // all, and asking the policy first would invite reading its answer as permission to
  // re-fire. ⚠️ Keyed on the TURN (the reader's window), never on a corpus-wide count — the
  // corpus is live and includes the supervising session's own transcript, observed drifting
  // 2282 → 2284 → 2286 within one session.
  if (reading.alreadyChained) {
    return withhold(
      "already-chained",
      reading.edgeId,
      `already invoked ${reading.chainedTo || "the next skill"}`,
    );
  }

  // ⚠️ THE SINGLE FUNNEL. Never read POLICY_ROWS columns directly: the funnel already applies
  // `resolveCell` and the incident Mode-2 override, and re-applying either is a bug.
  const resolved = resolvePolicy(
    reading.edgeId,
    input.storedMode,
    input.context ?? {},
  );

  if (resolved.outcome === "unknown-edge") {
    return withhold(
      "unknown-edge",
      reading.edgeId,
      `"${reading.edgeId}" is not an edge in the graph`,
    );
  }
  if (resolved.outcome === "unmapped") {
    // ⚠️ NOT coerced to auto. See the header — an `?? "auto"` here fires on 31 ungoverned
    // edges, `I2` among them.
    return withhold(
      "unmapped",
      reading.edgeId,
      `no policy row governs this edge (${resolved.reason})`,
    );
  }

  // ⚠️ QUESTION 2: may I chain? The cell is already `resolveCell`-ed, so it is never
  // conditional here.
  if (resolved.cell.kind !== "auto") {
    return withhold(
      "policy-not-auto",
      reading.edgeId,
      `policy is "${resolved.cell.kind}" in ${resolved.mode}`,
    );
  }

  // ⚠️ QUESTION 3: is there anything to chain TO? READ INDEPENDENTLY of the cell. This is the
  // check whose absence marked 223 breaks instead of 127.
  const target = resolved.edge.dispatchTarget;
  if (!isDispatchable(target)) {
    return withhold(
      "not-dispatchable",
      reading.edgeId,
      `policy says auto but the target is "${target.kind}", not a skill`,
    );
  }

  return {
    kind: "fire",
    edgeId: reading.edgeId,
    skill: target.skill,
    mode: resolved.mode,
  };
}

/**
 * Convenience: decide straight from raw JSONL lines.
 *
 * Kept separate from {@link decideVerdict} so the decision stays testable over parsed lines
 * without re-parsing, and so the parse failure mode (skipped bad lines) has one home.
 */
export function decideFromRaw(
  rawLines: readonly string[],
  storedMode: DriveMode | null,
  context?: PolicyContext,
): Verdict {
  // ⚠️ Delegates to the Phase-2 parser rather than re-implementing — one parser, one place
  // where a malformed line is skipped.
  return decideVerdict({
    lines: parseTranscript(rawLines),
    storedMode,
    context,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ IDEMPOTENCY — "HAVE I ALREADY FIRED FOR THIS TURN?"
//
// ⚠️ THIS IS A DIFFERENT QUESTION FROM `already-chained`, AND CONFLATING THEM DOUBLE-FIRES.
// `already-chained` asks whether *CC* invoked the next skill. This asks whether *the
// supervisor* already injected a command for this same turn and is simply seeing the turn
// again before CC has responded — which is the normal case, because a fire is asynchronous:
// `injectCommand` returns as soon as the bytes are written, and the transcript will not show
// a `Skill` call until CC actually runs one. Between those two moments the verdict still
// reads "AUTO, dispatchable, not chained" and would fire again.
//
// ⚠️ THE KEY IS THE TURN, NEVER A CORPUS-WIDE COUNT. The corpus is LIVE and includes the
// supervising session's own transcript — the WP1 probe watched a scanned total drift
// 2282 -> 2284 -> 2286 within a single session. Anything keyed on "how many verdicts have I
// seen" is therefore wrong by construction.
//
// A turn is identified by (workspace, transcript file, edge, verdict line index). The line
// index is what makes a REPEATED edge distinguishable: a feature that runs `F8` once per
// phase emits the same edge id many times, and keying on the edge alone would fire for the
// first phase and silently never again.

/** Identifies one emitted verdict, for the fire ledger. */
export interface TurnKey {
  readonly workspaceId: string;
  /** The transcript file the verdict was read from. */
  readonly transcriptPath: string;
  readonly edgeId: string;
  /** Index of the verdict line within the read window. */
  readonly verdictIndex: number;
}

/**
 * Render a {@link TurnKey} as a stable string.
 *
 * ⚠️ Joined with a NUL, which cannot occur in a workspace id, a path, or an edge id — so no
 * combination of fields can collide with a different combination (a `-` separator would let
 * `a-b` + `c` collide with `a` + `b-c`).
 */
export function turnKeyOf(k: TurnKey): string {
  const SEP = "\u0000";
  return [
    k.workspaceId,
    k.transcriptPath,
    k.edgeId,
    String(k.verdictIndex),
  ].join(SEP);
}

/**
 * Remembers which turns have already been fired on.
 *
 * ⚠️ Deliberately a plain in-memory set, NOT persisted. A restart means the supervisor has no
 * PTY connections either, so there is no turn in flight to double-fire into; persisting would
 * add a staleness problem (a key valid across restarts could suppress a legitimate fire) to
 * solve a case that cannot occur.
 *
 * ⚠️ Bounded, because the process is long-lived and a workspace open for days would otherwise
 * grow this without limit. Eviction is oldest-first and the cap is far above the number of
 * turns any plausible in-flight window holds.
 */
export class FireLedger {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly cap = 500) {}

  /** Has a fire already been recorded for this turn? */
  has(key: TurnKey): boolean {
    return this.seen.has(turnKeyOf(key));
  }

  /**
   * Record a fire. Returns `false` if this turn was ALREADY recorded — so a caller can use
   * the return value as the claim itself and avoid a check-then-act race.
   */
  claim(key: TurnKey): boolean {
    const s = turnKeyOf(key);
    if (this.seen.has(s)) return false;
    this.seen.add(s);
    this.order.push(s);
    while (this.order.length > this.cap) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }

  /** Number of turns currently remembered. Test/diagnostic surface. */
  get size(): number {
    return this.seen.size;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// M15 WP3 Phase 4 — THE HYBRID: the mechanical rule first, the adjudicator on what it
// cleared.
//
// ⚠️ THE ADJUDICATOR RUNS ON **EVERY** FIRE CANDIDATE, NOT A SELECTED CLASS.
// The narrow edge-class router (verify-human-adjacent only) sends 40 of 96 and **misses 10 of
// 32 awaiting-turns** — which would then fire silently with no adjudication at all. The
// 70%-concentration finding is a DENSITY fact, not a COVERAGE fact, and building the router
// on it is the measured mistake this ordering avoids.
//
// ⚠️ IT RUNS **AFTER** THE MECHANICAL RULE, NEVER INSTEAD OF IT. The rule decides ~1,900 of
// ~2,284 turns on its own; the adjudicator is a veto on what the rule already cleared, never
// a promoter of what it withheld. An LLM that could turn a withhold into a fire would be the
// drift-prone judgment component M15 exists to remove.

/** A verdict that has also passed (or failed) adjudication. */
export type SupervisedVerdict =
  | {
      readonly kind: "fire";
      readonly edgeId: string;
      readonly skill: string;
      readonly mode: DriveMode;
    }
  | {
      readonly kind: "withhold";
      readonly reason: WithholdReason | "adjudicator-says-awaiting";
      readonly edgeId: string | null;
      readonly detail: string;
    };

/**
 * The full hybrid decision: mechanical verdict, then adjudication of a would-be fire.
 *
 * `tail` is the end of the turn's last assistant text block — the natural-language surface the
 * rule cannot read. The caller supplies it because only the caller has the transcript.
 *
 * ⚠️ A withhold from the mechanical rule is returned UNCHANGED and the adjudicator is never
 * consulted: it has no power to promote. That also keeps the ~3s cost off every non-firing
 * turn, which is the vast majority.
 */
export async function decideSupervised(
  input: VerdictInput & { readonly tail: string },
  deps: AdjudicatorDeps,
): Promise<SupervisedVerdict> {
  const mechanical = decideVerdict(input);
  if (mechanical.kind !== "fire") return mechanical;

  const ruling: AdjudicationResult = await adjudicate(input.tail, deps);
  if (ruling.answer === "AWAITING") {
    return {
      kind: "withhold",
      reason: "adjudicator-says-awaiting",
      edgeId: mechanical.edgeId,
      detail: `adjudicator (${ruling.basis}): ${ruling.detail}`,
    };
  }
  return mechanical;
}
