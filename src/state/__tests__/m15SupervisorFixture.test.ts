import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// M15 WP1 Phase 1 — the break-detection fixture's contract.
//
// ⚠️ WHAT THIS FILE IS, AND DELIBERATELY IS NOT.
//
// The probe's SCRIPTS are throwaway Python under the gitignored `tmp/scratch/m15-probe/`;
// WP3 owns the real, shippable transcript reader and will delete them. Pinning those
// scripts would create a test WP3 is obliged to delete — coverage with a built-in expiry.
//
// The FIXTURE is the durable asset (ruling R-3: "only a standing test is coverage"), and
// the three properties asserted below are properties of the TRANSCRIPT FORMAT and the
// POLICY TABLE — not of any one implementation. They hold whether the reader is written in
// Python, TypeScript or Rust. So this file is the SPEC WP3's reader must satisfy, expressed
// against the frozen evidence that produced it.
//
// Each property below encodes a real defect found and fixed during Phase 1. Every one was a
// false-positive generator that a plausible implementation gets wrong, and each is recorded
// with the measured effect it had on the break count:
//
//   223 breaks  (naive: policy cell alone)
//   -> 127      after property 2 (an AUTO cell does not imply a dispatchable target)
//   ->  96      after property 3 (the chain-detection window must not close early)
//
// Evidence for every number: `workflow-system/state/wip/m15-wp1-supervisor-probe.md`
// (Discoveries) and the three 2026-09-07 entries in `workflow-system/state/backlog.md`.

const FIXTURE_PATH = resolve(
  __dirname,
  "../../../workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-break-fixture.json",
);

type Record_ = {
  turn_index: number;
  edge_id: string;
  next_skill_called: string | null;
  expected_verdict: "FIRE" | "NO_FIRE" | "UNDECIDED";
  label_basis: string;
  confidence: "GROUND_TRUTH_BREAK" | "RULE_ONLY" | "n/a";
  sf: number;
  tail_120?: string;
  prodded_by_user?: boolean;
  prod_text?: string;
};

type Fixture = {
  _meta: {
    total_verdicts_scanned: number;
    scope: string;
    composition: Record<string, number>;
    confidence: Record<string, number>;
    session_files: string[];
    frozen_at: string;
    live_corpus_caveat: string;
  };
  fire: Record_[];
  undecided: Record_[];
  no_fire: Record_[];
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
const allRecords = [...fixture.fire, ...fixture.undecided, ...fixture.no_fire];

describe("M15 WP1 break fixture — integrity", () => {
  it("is internally consistent: the three arms sum to the scanned total", () => {
    // Guards the slimming step that shrank the fixture from 1.3M to 548K. A dropped
    // record would silently shrink the denominator every downstream rate is computed
    // against, and nothing else in the pipeline would notice.
    expect(allRecords.length).toBe(fixture._meta.total_verdicts_scanned);
  });

  it("labels every record — an unlabelled record is not evidence", () => {
    expect(allRecords.filter((r) => !r.expected_verdict)).toHaveLength(0);
  });

  it("records that the corpus is LIVE, so counts drift across time but not within a run", () => {
    // ⚠️ The corpus contains the probe session's OWN transcript, still being appended as
    // the probe runs: the scanned total was observed going 2282 -> 2284 -> 2286 inside one
    // session. Without this caveat the numbers read as irreproducible. WP3 inherits the
    // property — a supervisor reading the transcript of the session it supervises sees its
    // own writes, so "have I already fired for this turn?" must key on the TURN, never on
    // a corpus-wide count.
    expect(fixture._meta.frozen_at).toBeTruthy();
    expect(fixture._meta.live_corpus_caveat).toMatch(/live/i);
  });
});

describe("M15 WP1 property 1 — the parse is assistant-scoped (the A-2 hazard)", () => {
  it("declares assistant scoping, because a file-level grep reads docs as verdicts", () => {
    // ~Half of all `TRANSITION:` occurrences in a transcript sit on USER lines: skill
    // bodies carry the full transitions table and are injected as context, and tool
    // results echo docs back. Measured: a naive file-scoped grep yields 13,278 hits vs
    // the correct 2,286 — a 5.81x inflation admitting 10,885 role=user lines. A reader
    // that greps the file would be wrong about ~82% of its "verdicts".
    expect(fixture._meta.scope).toMatch(/assistant/);
  });

  it("holds no record whose label came from reading prose (ruling R-3)", () => {
    // R-3: label from the POLICY ROW, never from how the turn reads. This is the
    // milestone's load-bearing finding — wrongful stops and legitimate pauses are
    // TEXTUALLY INDISTINGUISHABLE, so a prose-derived label would be circular.
    const families = new Set(
      allRecords.map((r) => r.label_basis.split(":")[0]),
    );
    expect([...families].sort()).toEqual([
      "non-dispatchable-target",
      "policy-row",
    ]);
  });
});

describe("M15 WP1 property 2 — an AUTO policy cell does NOT imply a dispatchable target", () => {
  // ⚠️ The defect: labelling on the mode cell alone marked 223 breaks. Most were
  // terminal / SURFACE / meta-op edges whose FROM-state's row says AUTO but whose TARGET
  // is not a dispatchable skill. The policy cell answers "may the orchestrator chain
  // without pausing?" — it does NOT answer "is there anything to chain to?". Those are
  // different questions and the table only encodes the first.
  //
  // Consequence for WP2: the typed graph needs a per-edge `dispatchable_target` property
  // held SEPARATELY from the 5-value policy cell. Without it WP3 fires into terminal
  // states — injecting a command after a workflow has already ended.
  const TERMINAL_EDGES = ["S20", "S17", "S6", "F19", "F30", "P13"];

  it.each(TERMINAL_EDGES)(
    "never labels terminal edge %s as a break",
    (edge) => {
      // Asserted per-edge rather than as one composite: a composite passes as long as ONE
      // edge is excluded and hides the rest (`docs/lessons/source-text-guards.md` — probe
      // each arm INDIVIDUALLY).
      expect(fixture.fire.filter((r) => r.edge_id === edge)).toHaveLength(0);
    },
  );

  it("classifies terminal edges by target, not by their from-state's policy cell", () => {
    const terminal = allRecords.filter((r) =>
      TERMINAL_EDGES.includes(r.edge_id),
    );
    expect(terminal.length).toBeGreaterThan(0); // positive control: the edges ARE present
    for (const r of terminal) {
      expect(r.label_basis).toMatch(/^non-dispatchable-target:/);
    }
  });
});

describe("M15 WP1 property 3 — the chain-detection window must not close early", () => {
  // ⚠️ The defect: the "did a `Skill` call follow this verdict?" scan aborted on an
  // intervening tool call or a re-quoted `TRANSITION:` token. Between emitting a verdict
  // and invoking the next skill, the agent routinely runs Bash/Read calls and narrates —
  // and that narration frequently re-quotes the token. Only a real USER PROSE turn ends
  // the window; tool results arrive with role=user and must be skipped.
  it("labels the proven false-positive case NO_FIRE — it chained two Bash calls later", () => {
    // Session 06eb0e92 turn 504 emitted `TRANSITION: F10` and DID chain correctly: the
    // Skill call landed at line 511, after two Bash calls and two narration lines. An
    // early-closing window labelled it a break. This is the single case that took the
    // count 127 -> 96, so it is asserted by identity, not by aggregate.
    const sfIndex = fixture._meta.session_files.findIndex((f) =>
      f.startsWith("06eb0e92"),
    );
    expect(sfIndex).toBeGreaterThanOrEqual(0); // positive control: the session is present

    const record = allRecords.find(
      (r) => r.sf === sfIndex && r.turn_index === 504,
    );
    expect(record).toBeDefined();
    expect(record!.edge_id).toBe("F10");
    expect(record!.expected_verdict).toBe("NO_FIRE");
    expect(record!.next_skill_called).toBe("feature-verify-self");
    expect(record!.label_basis).toMatch(/already-chained$/);
  });

  it("treats an already-chained AUTO edge as owing no fire (Q5 idempotency)", () => {
    const chained = fixture.no_fire.filter((r) =>
      r.label_basis.endsWith(":already-chained"),
    );
    expect(chained.length).toBeGreaterThan(0);
    // Every already-chained record must actually name the skill it chained to — the
    // label and the evidence cannot disagree.
    for (const r of chained) {
      expect(r.next_skill_called).toBeTruthy();
    }
  });
});

describe("M15 WP1 — the ground-truth break signal", () => {
  it("corroborates a subset of breaks with an operator nudge, and keeps the tiers separate", () => {
    // ⚠️ Found by hand-audit, not anticipated by the WBS. When the agent wrongly stops on
    // an AUTO edge, the operator types a short CONTENT-FREE nudge ("so?", "next",
    // "continue. stop returning control to me when you should just auto chain!"). That is
    // STRUCTURAL evidence of a wrongful stop — independent of reading the turn's prose,
    // which the milestone's load-bearing finding says cannot discriminate.
    //
    // The tiers stay separate on purpose: collapsing them would give Q1 a precision
    // denominator derived from its own predicate. Operator-approved 2026-09-11.
    const groundTruth = fixture.fire.filter(
      (r) => r.confidence === "GROUND_TRUTH_BREAK",
    );
    const ruleOnly = fixture.fire.filter((r) => r.confidence === "RULE_ONLY");

    expect(groundTruth.length).toBeGreaterThan(0);
    expect(ruleOnly.length).toBeGreaterThan(0);
    expect(groundTruth.length + ruleOnly.length).toBe(fixture.fire.length);
  });

  it("never marks a non-FIRE record with a break confidence tier", () => {
    for (const r of [...fixture.no_fire, ...fixture.undecided]) {
      expect(r.confidence).toBe("n/a");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M15 WP1 Phase 2 — the measurements that bind WP3.
//
// Phase 2's detector (`tmp/scratch/m15-probe/detect.py`) is throwaway like the
// reader before it, so it is NOT pinned here. What IS durable is the set of
// MEASUREMENTS it produced, every one of which is re-derivable from the frozen
// fixture alone — which is why they can be asserted without the script existing.
//
// ⚠️ Operator ruling R-5 (2026-09-11) governs how these are used: Q2's mechanism
// is the HYBRID (mechanical rule first, headless `claude -p` on the residual and
// on the verify-human-adjacent fires), NOT a regex over natural-language tails.
// The numbers below size that routing; they do not re-open the mechanism.
// ─────────────────────────────────────────────────────────────────────────────

describe("M15 WP1 Phase 2 — naive-vs-discriminating attribution", () => {
  // The naive predicate is "a verdict token with no following Skill call is a
  // break", applied ONLY to the records the policy table decided (`fire` +
  // `no_fire`). ⚠️ That population is itself a policy-table output: the 472
  // `undecided` records are excluded, and 115 of them also have no following
  // Skill call, so a genuinely policy-free predicate flags 234, not 119. The
  // 119/23 is "naive within the decided population" — do not size the
  // discriminating predicate's gain against a baseline it never faced.
  // Re-derived here from the fixture rather than trusting the script's printout.
  const naiveFlagged = [...fixture.fire, ...fixture.no_fire].filter(
    (r) => !r.next_skill_called,
  );
  const naiveFalsePositives = naiveFlagged.filter(
    (r) => r.expected_verdict !== "FIRE",
  );

  it("reproduces the naive baseline: 119 flagged, 23 of them wrong", () => {
    expect(naiveFlagged).toHaveLength(119);
    expect(naiveFalsePositives).toHaveLength(23);
  });

  it("shows the discriminating predicate eliminating all 23", () => {
    // The improvement has to be ATTRIBUTABLE, not asserted: both arms are
    // derived from the same fixture in the same test, so the delta is real.
    expect(fixture.fire).toHaveLength(96);
    expect(119 - fixture.fire.length).toBe(23);
  });

  it("locates every naive false positive on a spec exit (F3/F4), not F10/F13/F19", () => {
    // ⚠️ THE CORRECTION THIS PINS. The plan assumed F10/F13/F19 were the
    // over-flag source; they contribute ZERO false positives on either arm.
    // All 23 are `feature/spec` exits, which PAUSE in Mode 3 because spec is a
    // human review point -- so the naive predicate's entire error is "it does
    // not know that spec pauses."
    //
    // Consequence for WP3: F3/F4 are the cheap regression sentinel for a
    // policy-lookup bug. A detector that starts flagging them has lost the
    // spec row.
    const edges = new Set(naiveFalsePositives.map((r) => r.edge_id));
    expect([...edges].sort()).toEqual(["F3", "F4"]);
    for (const r of naiveFalsePositives) {
      expect(r.label_basis).toBe("policy-row:step-keyed:feature/spec:mode3");
    }
  });

  it.each(["F10", "F13", "F19"])(
    "confirms %s contributes no FALSE positive",
    (edge) => {
      // ⚠️ Asserts the FALSE-positive arm only, deliberately. An earlier version
      // of this test also asserted `fixture.fire` held no record for these
      // edges, and failed: F10 has 3 GENUINE breaks in `fire[]`, one of them
      // operator-corroborated (GROUND_TRUTH_BREAK). "Appears in fire" and "is a
      // false positive" are different properties, and only the second is what
      // the over-flag guard actually verified. Asserting the first would have
      // pinned a claim that a real break does not exist.
      expect(
        naiveFalsePositives.filter((r) => r.edge_id === edge),
      ).toHaveLength(0);
    },
  );
});

describe("M15 WP1 Phase 2 — Q5 idempotency, pinned to its measured value", () => {
  it("counts 1675 AUTO verdicts that had already chained", () => {
    // The earlier Q5 test asserts only that the population is non-empty. This
    // pins the number, because a drop means the chain-detection window closed
    // early again (the 127 -> 96 defect) and the supervisor would fire
    // duplicates into turns that already chained correctly.
    const chained = fixture.no_fire.filter((r) =>
      r.label_basis.endsWith(":already-chained"),
    );
    expect(chained).toHaveLength(1675);
  });
});

describe("M15 WP1 Phase 2 — the residual that sizes the R-5 adjudicator", () => {
  const conditional = fixture.undecided.filter((r) =>
    r.label_basis.endsWith("conditional-cell"),
  );
  const nonDispatchable = fixture.undecided.filter((r) =>
    r.label_basis.startsWith("non-dispatchable-target"),
  );

  it("splits 472 undecided into 288 conditional-cell + 184 non-dispatchable", () => {
    expect(fixture.undecided).toHaveLength(472);
    expect(conditional).toHaveLength(288);
    expect(nonDispatchable).toHaveLength(184);
    expect(conditional.length + nonDispatchable.length).toBe(
      fixture.undecided.length,
    );
  });

  it("keeps the adjudicator's scope to ONE homogeneous population", () => {
    // ⚠️ This is what makes R-5 affordable. The 184 non-dispatchable records
    // need no adjudication at all (terminal/SURFACE/meta-op -- nothing to fire
    // into), so `claude -p` only ever sees the conditional-cell class: a single
    // policy row, `feature/verify-human`'s AUTO-SKIP, whose condition needs
    // verify-self state the transcript does not carry.
    //
    // A general prose reader would be the drift-prone component the milestone
    // exists to remove; one narrow, well-scoped question is not.
    const bases = new Set(conditional.map((r) => r.label_basis));
    expect(bases.size).toBe(1);
    expect([...bases][0]).toContain("feature/verify-human");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M15 WP1 Phase 3 — the Q2 gate (the milestone's one live gate).
//
// Operator ruling R-5 set the MECHANISM (mechanical rule first, headless
// `claude -p` on the routed population -- not a regex over natural-language
// tails). Operator ruling R-6 then took the VERDICT: GO-WITH-CONDITIONS.
//
// The adjudication scripts are throwaway like everything else in this probe, so
// what is pinned here is the RESULT: `wp1-q2-adjudication.json`, the per-record
// verdicts from 192 real `claude -p` calls (96 per arm, zero errors).
//
// ⚠️ The margin is the point. Sonnet clears the recall bar by EXACTLY ONE RECORD,
// and that thinness is precisely what R-6's three conditions exist to manage. A
// test that pinned only "SEPARABLE" would let the margin silently widen or vanish
// and lose the very caveat the ruling was taken on.
// ─────────────────────────────────────────────────────────────────────────────

type Q2Record = {
  sf: string;
  turn_index: number;
  edge_id: string;
  adjudicator: "AWAITING" | "PROCEED" | string;
  truth: "BREAK" | "AWAITING" | "UNKNOWN";
  confidence: string | null;
  prod_text: string | null;
};

type Q2Arms = {
  _meta: {
    threshold: string;
    ruling: string;
    routing: string;
    truth_note: string;
  };
  arms: Record<string, { model: string; records: Q2Record[] }>;
};

const q2 = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-q2-adjudication.json",
    ),
    "utf8",
  ),
) as Q2Arms;

/** Score one arm exactly as the probe did. AWAITING is the positive class: the
 *  adjudicator's job is to WITHHOLD a fire on a turn that awaits the operator. */
function scoreArm(records: Q2Record[]) {
  const scorable = records.filter(
    (r) => r.truth !== "UNKNOWN" && !r.adjudicator.startsWith("ERROR"),
  );
  const tp = scorable.filter(
    (r) => r.truth === "AWAITING" && r.adjudicator === "AWAITING",
  ).length;
  const fp = scorable.filter(
    (r) => r.truth === "BREAK" && r.adjudicator === "AWAITING",
  ).length;
  const fn = scorable.filter(
    (r) => r.truth === "AWAITING" && r.adjudicator === "PROCEED",
  ).length;
  const tn = scorable.filter(
    (r) => r.truth === "BREAK" && r.adjudicator === "PROCEED",
  ).length;
  return {
    scorable: scorable.length,
    tp,
    fp,
    fn,
    tn,
    recall: tp / (tp + fn),
    breaksKept: tn / (tn + fp),
    verdict:
      tp / (tp + fn) >= 0.8 && tn / (tn + fp) >= 0.8
        ? "SEPARABLE"
        : "NOT_SEPARABLE",
  };
}

describe("M15 WP1 Phase 3 — the Q2 adjudication is model-attributable", () => {
  it("scores both arms over the same 96 records with zero adjudicator errors", () => {
    for (const arm of Object.values(q2.arms)) {
      expect(arm.records).toHaveLength(96);
      expect(
        arm.records.filter((r) => r.adjudicator.startsWith("ERROR")),
      ).toHaveLength(0);
    }
  });

  it("gives both arms an identical truth distribution, isolating the model as the only variable", () => {
    // ⚠️ This is what makes "the verdict is model-conditional" a real claim
    // rather than an artifact of two differently-labelled populations. If the
    // distributions diverge, the arms are no longer comparable and the whole
    // haiku-vs-sonnet conclusion collapses.
    const dist = (recs: Q2Record[]) => {
      const d: Record<string, number> = {};
      for (const r of recs) d[r.truth] = (d[r.truth] ?? 0) + 1;
      return d;
    };
    const [a, b] = Object.values(q2.arms);
    expect(dist(a.records)).toEqual(dist(b.records));
  });

  it("scores identical record identities across arms, not merely equal counts", () => {
    const ids = (recs: Q2Record[]) =>
      recs.map((r) => `${r.sf}:${r.turn_index}`).sort();
    const [a, b] = Object.values(q2.arms);
    expect(ids(a.records)).toEqual(ids(b.records));
  });
});

describe("M15 WP1 Phase 3 — the verdict, and the margin R-6 was ruled on", () => {
  const sonnet = scoreArm(q2.arms.sonnet.records);
  const haiku = scoreArm(q2.arms.haiku.records);

  it("puts sonnet at 25/29 recall and 35/41 breaks-preserved → SEPARABLE", () => {
    expect([sonnet.tp, sonnet.fn]).toEqual([25, 4]); // 25/29
    expect([sonnet.tn, sonnet.fp]).toEqual([35, 6]); // 35/41
    expect(sonnet.verdict).toBe("SEPARABLE");
  });

  it("puts haiku at 23/29 recall and 36/41 breaks-preserved → NOT_SEPARABLE", () => {
    // The same data, a weaker model, the opposite verdict. This is the pinned
    // evidence for R-6's condition 1: the adjudicator model is load-bearing, so
    // a silent downgrade regresses the supervisor with no code change.
    expect([haiku.tp, haiku.fn]).toEqual([23, 6]); // 23/29
    expect([haiku.tn, haiku.fp]).toEqual([36, 5]); // 36/41
    expect(haiku.verdict).toBe("NOT_SEPARABLE");
  });

  it("⚠️ records that sonnet clears the recall bar by EXACTLY ONE record", () => {
    // ⚠️ THE CAVEAT R-6 WAS TAKEN ON. At the 0.80 bar over 29 positives, 24 TP
    // is the minimum. Sonnet has 25 — a margin of +1. Haiku has 23 — a margin
    // of −1. The entire SEPARABLE/NOT_SEPARABLE split between the two models is
    // a 2-record difference on a 29-record denominator.
    //
    // Pinning the margin (not just the verdict) is deliberate: R-6's condition 3
    // is "re-measure on a larger labelled set before relying on the margin", and
    // that condition is only meaningful while the margin is visible. If this
    // test starts failing because the margin GREW, that is good news worth
    // reading, not a nuisance to silence.
    const positives = sonnet.tp + sonnet.fn;
    const minTpForBar = Math.ceil(0.8 * positives);
    expect(positives).toBe(29);
    expect(minTpForBar).toBe(24);
    expect(sonnet.tp - minTpForBar).toBe(1); // +1 record
    expect(haiku.tp - minTpForBar).toBe(-1); // −1 record
  });

  it("keeps the scorable denominator honest: 70 of 96, the rest unlabelled", () => {
    // 26 records have no recorded operator response, so they cannot be scored
    // either way. Folding them into either arm would flatter one of the rates.
    expect(sonnet.scorable).toBe(70);
    expect(haiku.scorable).toBe(70);
  });

  it("records the threshold as a CHOSEN bar and the ruling that accepted it", () => {
    // The 0.80/0.80 bar is not an empirical constant — a 0.85 bar fails both
    // arms and a 0.75 bar passes both. Kept in the artifact so a later reader
    // does not mistake the verdict for a measurement.
    expect(q2._meta.threshold).toContain("CHOSEN");
    expect(q2._meta.ruling).toContain("GO-WITH-CONDITIONS");
    expect(q2._meta.routing).toContain("Q2_ROUTE_ALL");
  });
});
