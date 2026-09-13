// M15 WP3 Phase 3 verify-codify — THE REPLAY, CODIFIED.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS FILE EXISTS SEPARATELY FROM `m15SupervisorFixture.test.ts`.
//
// That file is WP1's, and it is explicitly *"the SPEC WP3's reader must satisfy, expressed
// against the frozen evidence"*. But it imports NO implementation — every assertion in it is
// a property of the FIXTURE. So nothing anywhere executed the spec against the reader, and
// the 34/36 replay the operator approved at verify-human lived only in a throwaway script.
// A regression that broke it would have been silent.
//
// This file drives the REAL `decideVerdict` over the REAL frozen fixture. It is the
// `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` move: a behavioral
// property gets a test that runs the actual code, not a better description of it.
//
// ⚠️ THE SCORING METHOD IS THE LOAD-BEARING PART, NOT THE NUMBER.
//
// Every one of the fixture's 2,284 records carries a `label_basis` of `policy-row:…` or
// `non-dispatchable-target:…` — the labels were produced by the SAME policy table this
// detector now uses. Scoring against the full set is an **arithmetic identity**, not
// evidence (`[[detector-scored-against-its-own-table-is-circular]]`, and the probe report
// says so itself). A 1.000 there would mean nothing.
//
// The fixture's one non-circular surface is the **36 `GROUND_TRUTH_BREAK` records**, each
// also `prodded_by_user: true` with the operator's own content-free nudge ("so?", "next").
// Those labels come from OPERATOR BEHAVIOR — a signal the detector does not produce. That is
// the set scored below, and the separation is asserted rather than assumed.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decideVerdict } from "../verdict";
import type { TranscriptLine } from "../transcript";

const FIXTURE_PATH = resolve(
  __dirname,
  "../../../../workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-break-fixture.json",
);

interface FixtureRecord {
  edge_id: string;
  next_skill_called: string | null;
  expected_verdict: "FIRE" | "NO_FIRE" | "UNDECIDED";
  label_basis: string;
  confidence: "GROUND_TRUTH_BREAK" | "RULE_ONLY" | "n/a";
  prodded_by_user?: boolean;
}

const fixture: {
  fire: FixtureRecord[];
  undecided: FixtureRecord[];
  no_fire: FixtureRecord[];
} = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

/**
 * Rebuild the minimal transcript a record describes: a turn that emitted `edge_id`, and
 * either did or did not invoke the next skill.
 *
 * ⚠️ Reconstructed rather than replayed from the original session files, because the corpus
 * is LIVE — those files keep growing, so a test reading them would drift. The fixture is the
 * frozen evidence; this rebuilds exactly the two facts the verdict consumes from it.
 */
function turnFor(r: FixtureRecord): TranscriptLine[] {
  const lines: TranscriptLine[] = [
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: `TRANSITION: ${r.edge_id}` }],
      },
    },
  ];
  if (r.next_skill_called) {
    lines.push({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Skill",
            input: { skill: r.next_skill_called },
          },
        ],
      },
    });
  }
  return lines;
}

const groundTruth = (): FixtureRecord[] =>
  fixture.fire.filter((r) => r.confidence === "GROUND_TRUTH_BREAK");

describe("⚠️ the scoring set is the NON-CIRCULAR one", () => {
  it("confirms the bulk of the fixture is label-circular, so it is not scored", () => {
    // ⚠️ Asserted, not assumed. If a future fixture rebuild introduced records labelled by
    // something OTHER than the policy table, the scoring choice below would need revisiting
    // — and this test is what would say so.
    const all = [...fixture.fire, ...fixture.undecided, ...fixture.no_fire];
    const circular = all.filter(
      (r) =>
        r.label_basis.startsWith("policy-row:") ||
        r.label_basis.startsWith("non-dispatchable-target:"),
    );
    expect(circular.length).toBe(all.length);
  });

  it("confirms the ground-truth set is labelled by OPERATOR BEHAVIOR instead", () => {
    const gt = groundTruth();
    expect(gt.length).toBeGreaterThan(0);
    // Every ground-truth record carries the independent signal — a real operator nudge.
    for (const r of gt) expect(r.prodded_by_user).toBe(true);
  });
});

describe("M15 WP3 — the verdict replayed over the frozen fixture", () => {
  it("⚠️ fires on 34 of the 36 operator-corroborated breaks", () => {
    // The number the operator approved at verify-human (2026-09-13). Pinned EXACTLY rather
    // than as a floor: a change in either direction is a behavior change worth reading. A
    // higher number is not automatically better — it could mean the detector started firing
    // on an edge the policy says to pause on.
    const gt = groundTruth();
    const fired = gt.filter(
      (r) =>
        decideVerdict({ lines: turnFor(r), storedMode: "autopilot" }).kind ===
        "fire",
    );
    expect(gt.length).toBe(36);
    expect(fired.length).toBe(34);
  });

  it("⚠️ pins the TWO misses and WHY each is correct behavior, not a defect", () => {
    // Both were verified edge-by-edge at verify-self and accepted by the operator. Pinning
    // the REASONS is what keeps a future regression from silently changing one of them into
    // a fire while the 34/36 count stays put.
    const misses = groundTruth()
      .map((r) => ({
        edge: r.edge_id,
        v: decideVerdict({ lines: turnFor(r), storedMode: "autopilot" }),
      }))
      .filter((x) => x.v.kind !== "fire")
      .map((x) => ({
        edge: x.edge,
        reason: x.v.kind === "withhold" ? x.v.reason : "fire",
      }))
      .sort((a, b) => a.edge.localeCompare(b.edge));

    expect(misses).toEqual([
      // The known upstream gap — no policy row governs it. Firing would require exactly the
      // `?? "auto"` fallback the inherited contract forbids.
      { edge: "I2", reason: "unmapped" },
      // investigate -> mitigate. Row "before mitigate (I6)", cell PAUSE at the incident-forced
      // Mode 2. The operator nudged past a pause upstream deliberately places before
      // mitigating — the policy being right and the operator overriding it.
      { edge: "I6", reason: "policy-not-auto" },
    ]);
  });

  it("never fires on a record the fixture labels NO_FIRE", () => {
    // ⚠️ The negative arm over real data. These are circular-labelled, so this is NOT scored
    // as accuracy — but a FIRE here would mean the detector contradicts the very table it
    // reads, which is a real defect regardless of how the labels were made.
    const contradictions = fixture.no_fire.filter(
      (r) =>
        decideVerdict({ lines: turnFor(r), storedMode: "autopilot" }).kind ===
        "fire",
    );
    expect(contradictions).toHaveLength(0);
  });

  it("⚠️ is not vacuous — the replay decides a substantial number of real records", () => {
    // Guards the shape of every assertion above: if `turnFor` ever stopped producing a
    // readable turn, every `filter(...)` would be empty and the counts would still "pass"
    // in three of the four tests. This asserts the sweep is actually deciding.
    const all = [...fixture.fire, ...fixture.undecided, ...fixture.no_fire];
    const decided = all.filter(
      (r) =>
        decideVerdict({ lines: turnFor(r), storedMode: "autopilot" }).kind ===
        "fire",
    );
    expect(all.length).toBeGreaterThan(2000);
    expect(decided.length).toBeGreaterThan(50);
  });
});
