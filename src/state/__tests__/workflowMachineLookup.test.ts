// M15 WP2 Phase 3 — tests over the edge→policy-row derivation.
//
// ⚠️ This is the function the WP3 detector's verdict IS. A wrong mapping here fires a
// slash command into a session that should have stopped, or stays silent when it should
// have chained. These tests are the closest thing WP2 has to a correctness proof.

import { describe, expect, it } from "vitest";
import {
  ambiguityReport,
  resolvePolicy,
  unmappedReport,
} from "../workflowMachine/lookup";
import { EDGES, edgeById } from "../workflowMachine/edges";
import { DRIVE_MODES } from "../workflowMachine/policy";
import { isDispatchable } from "../workflowMachine/types";

describe("M15 WP2 Phase 3 — the F3/F4 regression sentinel", () => {
  // ⚠️ INHERITED CONSTRAINT 2, and the cheapest possible detector of a policy-lookup
  // bug. All 23 of the naive predicate's false positives were spec exits (F4 x20,
  // F3 x3) — they PAUSE in Mode 3 because spec is a human review point. If either ever
  // resolves to AUTO in autopilot, the detector has regressed to the naive baseline.
  //
  // ⚠️ Do NOT substitute F10/F13/F19 as the sentinel: measured to contribute ZERO false
  // positives on either arm, so they would pass while the real regression shipped.

  it("resolves F4 to PAUSE in autopilot — via the spec step row", () => {
    const r = resolvePolicy("F4", "autopilot");
    expect(r.outcome).toBe("resolved");
    if (r.outcome !== "resolved") throw new Error("unreachable");
    expect(r.cell.kind).toBe("pause");
    expect(r.row.key).toBe("spec");
    expect(r.provenance).toBe("from-state");
  });

  it("resolves F3 to PAUSE in autopilot — the same row, the same way", () => {
    const r = resolvePolicy("F3", "autopilot");
    expect(r.outcome).toBe("resolved");
    if (r.outcome !== "resolved") throw new Error("unreachable");
    expect(r.cell.kind).toBe("pause");
    expect(r.row.key).toBe("spec");
  });

  it("still AUTOs F3/F4 in fsd — the sentinel is mode-specific, not blanket", () => {
    // ⚠️ Positive control. A resolver hardcoding "spec always pauses" would pass both
    // tests above while being wrong. Upstream genuinely AUTOs spec in Mode 4.
    for (const id of ["F3", "F4"]) {
      const r = resolvePolicy(id, "fsd");
      if (r.outcome !== "resolved") throw new Error("unreachable");
      expect(`${id}/fsd=${r.cell.kind}`).toBe(`${id}/fsd=auto`);
    }
  });

  it("AUTOs F10 in autopilot — the edge the naive predicate got RIGHT", () => {
    // Contrast case: F10/F13/F19 contribute zero false positives, so they must NOT be
    // treated as sentinels. Pinned here to document the distinction, not to guard it.
    const r = resolvePolicy("F10", "autopilot");
    if (r.outcome !== "resolved") throw new Error("unreachable");
    expect(r.cell.kind).toBe("auto");
    expect(r.edge.to).toBe("verify-self");
  });
});

describe("M15 WP2 Phase 3 — provenance is explicit, never guessed", () => {
  it("prefers a row that NAMES the edge over the from-state row", () => {
    // F22 (build → research REDIRECT) is named by `REDIRECT (F22)` AND its from-state
    // `build` has its own row. The specific row must win: build is AUTO in Mode 2 while
    // the REDIRECT row is PAUSE — picking the wrong one inverts the verdict.
    const r = resolvePolicy("F22", "orchestrated");
    if (r.outcome !== "resolved") throw new Error("unreachable");
    expect(r.provenance).toBe("named-edge");
    expect(r.row.key).toBe("REDIRECT (F22)");
    expect(r.cell.kind).toBe("pause");
    // …and the from-state row genuinely says something different, which is what makes
    // this test meaningful rather than tautological.
    const build = resolvePolicy("F8", "orchestrated");
    if (build.outcome !== "resolved") throw new Error("unreachable");
    expect(build.row.key).toBe("build");
    expect(build.cell.kind).toBe("auto");
  });

  it("reports an unknown edge id as `unknown-edge`, not as unmapped", () => {
    // ⚠️ A typo'd token and a real-but-ungoverned edge are different diagnoses. Merging
    // them would let a parser bug read as an upstream gap.
    const r = resolvePolicy("F999", "autopilot");
    expect(r.outcome).toBe("unknown-edge");
  });

  it("gives every resolved edge a provenance of named-edge or from-state", () => {
    let resolved = 0;
    for (const e of EDGES) {
      const r = resolvePolicy(e.id, "orchestrated");
      if (r.outcome !== "resolved") continue;
      resolved++;
      expect(`${e.id}:${r.provenance}`).toBe(
        `${e.id}:${r.provenance === "named-edge" ? "named-edge" : "from-state"}`,
      );
    }
    // Degenerate-pass guard + the measured split (49 named + 31 from-state).
    expect(resolved).toBe(80);
  });
});

describe("M15 WP2 Phase 3 — ambiguity is enumerable, not silently resolved", () => {
  it("reports ZERO ambiguous edges today", () => {
    // ⚠️ Measured 2026-09-12. The WBS anticipated ambiguity as the main hazard; the real
    // hazard turned out to be the opposite (edges with NO row). This test is what makes
    // a future upstream edit that introduces a real ambiguity fail LOUDLY instead of
    // picking a row by array order.
    expect(ambiguityReport()).toEqual([]);
  });
});

describe("M15 WP2 Phase 3 — unmapped is a RESULT, never a default", () => {
  // ⚠️ The measured danger. 31 of 111 edges have no governing row; if `unmapped` silently
  // read as AUTO, the supervisor would fire on all of them.

  it("classifies every unmapped edge by reason, with the measured counts", () => {
    const report = unmappedReport();
    expect(report.length).toBe(31);
    const byReason: Record<string, number> = {};
    for (const u of report) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1;
    expect(byReason).toEqual({
      "entry-or-sentinel": 10,
      "meta-op": 19,
      "no-row-upstream": 2,
    });
  });

  it("leaves exactly TWO genuine upstream gaps — P13 and I2", () => {
    // ⚠️ `no-row-upstream` is the only reason that represents a real gap, and BOTH were
    // found by this test rather than by the pre-implementation survey — the survey only
    // eyeballed the dispatchable ones and missed P13.
    //
    //   • I2 (report → triage): upstream's incident row `triage (I2→I3 / I2→I13)`
    //     governs the exits FROM triage, not the entry INTO it. ⚠️ DISPATCHABLE, so a
    //     supervisor that defaulted unmapped→AUTO would fire here.
    //   • P13 (product-finalize → EXIT): upstream's product table has a row for P14 (the
    //     back-loop) but none for P13 (the cycle exit). Non-dispatchable and terminal, so
    //     nothing would fire either way — but the gap is real.
    //
    // ⚠️ Surfaced to the backlog rather than patched: inventing a row here would be
    // Claudesk deciding mccc's policy, which crosses the ownership boundary settled
    // 2026-08-14. The model records what upstream SAYS, including where it says nothing.
    const gaps = unmappedReport().filter((u) => u.reason === "no-row-upstream");
    expect(gaps.map((g) => g.edgeId).sort()).toEqual(["I2", "P13"]);
    // Only one of the two could ever cause a wrong fire.
    expect(gaps.filter((g) => g.dispatchable).map((g) => g.edgeId)).toEqual([
      "I2",
    ]);
  });

  it("leaves every remaining dispatchable-unmapped edge an ENTRY edge", () => {
    // The 6 ENTRY edges have no preceding turn to chain FROM, so no policy row should
    // exist. This asserts nothing ELSE has quietly joined them.
    const dispatchableUnmapped = unmappedReport().filter((u) => u.dispatchable);
    const ids = dispatchableUnmapped.map((u) => u.edgeId).sort();
    expect(ids).toEqual(["F1", "F2", "F31", "I1", "I2", "P1", "T1"]);
    for (const id of ids) {
      if (id === "I2") continue; // the known upstream gap, asserted above
      expect(`${id}.from=${edgeById(id)!.from}`).toBe(`${id}.from=ENTRY`);
    }
  });

  it("never returns a cell on an unmapped edge", () => {
    // ⚠️ The structural guarantee that `unmapped` cannot be mistaken for a verdict: the
    // union simply has no `cell` on that arm. A caller must branch on `outcome`.
    for (const e of EDGES) {
      const r = resolvePolicy(e.id, "autopilot");
      if (r.outcome !== "unmapped") continue;
      // ⚠️ `Object.hasOwn` would be the natural spelling but needs ES2022; this
      // project targets earlier, and `tsc` rejects it even though vitest runs it fine
      // — the gate caught what the test run alone did not.
      expect(Object.prototype.hasOwnProperty.call(r, "cell")).toBe(false);
    }
  });
});

describe("M15 WP2 Phase 3 — dispatchability and policy are read INDEPENDENTLY", () => {
  // ⚠️ INHERITED CONSTRAINT 1. An AUTO cell does not imply there is anything to fire
  // into. Cell-only labelling marked 223 breaks vs the true 96.

  it("resolves the six probe-named edges to a policy WITHOUT making them firable", () => {
    // Each of these has a from-state row that may well read AUTO — the point is that the
    // policy answer and the dispatch answer are separate reads.
    for (const id of ["S20", "S17", "F19", "F30", "P13", "S6"]) {
      const edge = edgeById(id)!;
      expect(`${id} dispatchable=${isDispatchable(edge.dispatchTarget)}`).toBe(
        `${id} dispatchable=false`,
      );
    }
  });

  it("finds AUTO cells on NON-dispatchable edges — the exact 223-vs-96 trap", () => {
    // ⚠️ This is the measurement made standing. If this set were ever empty, the two
    // properties would have collapsed into one and constraint 1 would be unguarded.
    const autoButNotFirable = EDGES.filter((e) => {
      const r = resolvePolicy(e.id, "autopilot");
      return (
        r.outcome === "resolved" &&
        r.cell.kind === "auto" &&
        !isDispatchable(e.dispatchTarget)
      );
    });
    expect(autoButNotFirable.length).toBeGreaterThan(0);
    // F19 (finalize → EXIT→reflect) is the canonical instance: its row says AUTO, its
    // target is terminal.
    expect(autoButNotFirable.map((e) => e.id)).toContain("F19");
  });
});

describe("M15 WP2 Phase 3 — the incident override is applied in the funnel", () => {
  it("forces orchestrated for incident edges whatever mode is requested", () => {
    for (const m of DRIVE_MODES) {
      const r = resolvePolicy("I6", m);
      if (r.outcome !== "resolved") throw new Error("unreachable");
      expect(`I6 requested=${m} effective=${r.mode}`).toBe(
        `I6 requested=${m} effective=orchestrated`,
      );
    }
  });

  it("leaves a feature edge's requested mode intact", () => {
    for (const m of DRIVE_MODES) {
      const r = resolvePolicy("F7", m);
      if (r.outcome !== "resolved") throw new Error("unreachable");
      expect(`F7 ${m}→${r.mode}`).toBe(`F7 ${m}→${m}`);
    }
  });
});

describe("M15 WP2 Phase 3 — the conditional cell resolves through the funnel", () => {
  it("never hands back an unresolved auto-skip", () => {
    // ⚠️ A caller must not have to remember `resolveCell`. The funnel applies it, so a
    // conditional cell can never escape as a verdict.
    for (const e of EDGES) {
      for (const m of DRIVE_MODES) {
        const r = resolvePolicy(e.id, m);
        if (r.outcome !== "resolved") continue;
        expect(`${e.id}/${m}:${r.cell.kind}`).not.toBe(
          `${e.id}/${m}:auto-skip`,
        );
      }
    }
  });

  it("resolves verify-human's exits by the caller's evidence", () => {
    // F13 (human approves) leaves verify-human; in autopilot its row is the conditional
    // one. With a clean gate the state is skipped; with a boundary it pauses.
    const clean = resolvePolicy("F13", "autopilot", {
      integrationBoundary: false,
      verifySelfAllPass: true,
    });
    if (clean.outcome !== "resolved") throw new Error("unreachable");
    expect(clean.cell.kind).toBe("skip-skill");

    const boundary = resolvePolicy("F13", "autopilot", {
      integrationBoundary: true,
      verifySelfAllPass: true,
    });
    if (boundary.outcome !== "resolved") throw new Error("unreachable");
    expect(boundary.cell.kind).toBe("pause");

    // ⚠️ No evidence → PAUSE. Failing safe is the WP3-binding direction.
    const blind = resolvePolicy("F13", "autopilot");
    if (blind.outcome !== "resolved") throw new Error("unreachable");
    expect(blind.cell.kind).toBe("pause");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// verify-codify (Phase 3) — properties proven at verify-self by a THROWAWAY
// enumeration, now standing.

describe("M15 WP2 Phase 3 — resolvePolicy is TOTAL over the whole matrix", () => {
  // ⚠️ Verify-self enumerated all 111 edges x 4 modes and found zero malformed results.
  // That enumeration was throwaway. The property it proved is the one WP3 depends on
  // most: the funnel ALWAYS returns a well-formed discriminated result — never
  // undefined, never a thrown error, never a conditional cell escaping unresolved.
  // A partial function here means the detector crashes or reads `undefined.kind` on some
  // edge nobody tested by hand.

  it("returns a well-formed result for every edge × mode pair", () => {
    let resolved = 0;
    let unmapped = 0;
    let malformed = 0;
    let escapedConditional = 0;
    for (const edge of EDGES) {
      for (const mode of DRIVE_MODES) {
        const r = resolvePolicy(edge.id, mode);
        if (r.outcome === "resolved") {
          resolved++;
          if (r.cell.kind === "auto-skip") escapedConditional++;
          if (!r.row || !r.provenance || !r.mode) malformed++;
        } else if (r.outcome === "unmapped") {
          unmapped++;
          if (!r.reason) malformed++;
        } else {
          // A real edge must never resolve as `unknown-edge`.
          malformed++;
        }
      }
    }
    // The measured totals (2026-09-12). 111 × 4 = 444.
    expect(resolved + unmapped + malformed).toBe(444);
    expect(resolved).toBe(320);
    expect(unmapped).toBe(124);
    expect(malformed).toBe(0);
    // ⚠️ The funnel applies `resolveCell`, so a conditional cell can never escape as a
    // verdict. A caller must never have to remember to resolve it.
    expect(escapedConditional).toBe(0);
  });

  it("composes the cells as measured — 156 pause / 153 auto / 7 skip / 4 n/a", () => {
    // ⚠️ The histogram is the finer-grained version of the totals: it catches a row whose
    // CELLS changed while the resolved/unmapped split stayed identical.
    const kinds: Record<string, number> = {};
    for (const edge of EDGES) {
      for (const mode of DRIVE_MODES) {
        const r = resolvePolicy(edge.id, mode);
        if (r.outcome !== "resolved") continue;
        kinds[r.cell.kind] = (kinds[r.cell.kind] ?? 0) + 1;
      }
    }
    expect(kinds).toEqual({
      pause: 156,
      auto: 153,
      "skip-skill": 7,
      "n/a": 4,
    });
  });

  it("groups the unmapped reasons as measured — 76 meta-op / 40 entry / 8 upstream", () => {
    const reasons: Record<string, number> = {};
    for (const edge of EDGES) {
      for (const mode of DRIVE_MODES) {
        const r = resolvePolicy(edge.id, mode);
        if (r.outcome !== "unmapped") continue;
        reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      }
    }
    // 8 = the two upstream gaps (I2, P13) × 4 modes.
    expect(reasons).toEqual({
      "meta-op": 76,
      "entry-or-sentinel": 40,
      "no-row-upstream": 8,
    });
  });
});

describe("M15 WP2 Phase 3 — the four re-classified rows stay resolvable", () => {
  // ⚠️ The Phase 3 coverage survey found four policy rows whose keys READ as step names
  // while actually governing specific edges, and re-typed them to `edge-ids`. Reverting
  // any one would silently return its edges to `unmapped` — the supervisor would stop
  // chaining a whole workflow branch with no test failing anywhere else.
  //
  // ⚠️ Each is asserted by the ROW IT RESOLVES THROUGH, not merely by "it resolves".
  // A different row producing the same cell would pass a weaker assertion while meaning
  // the derivation found the wrong authority.

  const via = (edgeId: string): string => {
    const r = resolvePolicy(edgeId, "orchestrated");
    if (r.outcome !== "resolved") return `UNMAPPED(${edgeId})`;
    return r.row.key;
  };

  it("resolves the task verify gate (T5b/T5c) through its own row", () => {
    // ⚠️ This one was CORRECT BY ACCIDENT before the fix: the from-state `verify` would
    // have matched anyway. Now it is correct by construction.
    expect(via("T5b")).toBe("verify (T5b/T5c gate)");
    expect(via("T5c")).toBe("verify (T5b/T5c gate)");
  });

  it("resolves the product vision and roadmap exits through their own rows", () => {
    expect(via("P2")).toBe("vision scoping questions");
    expect(via("P3")).toBe("roadmap review");
  });

  it("resolves all THREE states of the product happy-path category row", () => {
    // ⚠️ One key string cannot match three from-states — this is why the row had to be
    // enumerated rather than left as a category.
    for (const id of ["P5", "P7", "P9"]) {
      expect(`${id} via ${via(id)}`).toBe(
        `${id} via research / arch / wbs happy path`,
      );
    }
  });

  it("keeps P4/P6/P8 on the back-loops row, NOT the happy-path row", () => {
    // ⚠️ The easy and consequential mistake: P4/P6/P8 leave the SAME three states as
    // P5/P7/P9 but are back-loops, and the two rows disagree in Mode 3 (back-loops PAUSE,
    // happy path AUTOs). Assigning them to the wrong row inverts the verdict.
    for (const id of ["P4", "P6", "P8"]) {
      expect(`${id} via ${via(id)}`).toBe(`${id} via back-loops (P4, P6, P8)`);
    }
    // …and the two rows genuinely differ, which is what makes this non-tautological.
    const happy = resolvePolicy("P5", "autopilot");
    const backLoop = resolvePolicy("P4", "autopilot");
    if (happy.outcome !== "resolved" || backLoop.outcome !== "resolved") {
      throw new Error("unreachable");
    }
    expect(happy.cell.kind).toBe("auto");
    expect(backLoop.cell.kind).toBe("pause");
  });
});
