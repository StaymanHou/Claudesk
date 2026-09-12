// M15 WP2 Phase 5 — the two mccc guard phases, ported.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS A PORT, NOT A COPY (measurement A-6)
//
// Upstream these live in `tests/check-structure.sh`, 2700+ lines of bash. Claudesk has
// no `tests/` directory and no shell-guard harness — its gate is `pnpm verify:auto`
// (vitest + cargo). So both phases are RE-EXPRESSED as vitest tests against the absorbed
// model. mccc keeps its own copies: Phase 3d because skills still emit the token, and
// the parts of Phase 18 that police mccc's own prose.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHAT DOES *NOT* PORT, AND WHY — classified before writing a line of test
//
// Phase 18 has eight sub-checks. Only TWO belong here:
//
//   (a) S22/S23 edges exist              → ✅ PORTS. Claudesk now owns the graph.
//   (c) the exit-chain pause-policy rows → ✅ PORTS. Claudesk now owns the policy.
//   (b) reflect's row names the fork     → ✗ mccc prose.
//   (d) all 4 AGENTS.md carry the block  → ⚠️ ✗ THIS IS THE DUPLICATION TASK 2.9 DELETES.
//   (e) all 4 AGENTS.md re-point prose   → ⚠️ ✗ SAME DUPLICATION.
//   (f) session-capture's gate prose     → ✗ mccc INTRA-TURN semantics — the ownership
//                                            boundary settled 2026-08-14 puts MEANING on
//                                            mccc's side. Porting it would cross that line.
//   (g) CLAUDE.snippet.md re-point       → ✗ mccc prose.
//   (h) tutorial-*-tour boundary guard   → ✗ mccc skill prose.
//
// ⚠️ (d) AND (e) ARE THE WHOLE ARGUMENT FOR TASK 2.9. They exist only to keep four
// `AGENTS.md` copies in sync with each other. Once Claudesk owns the graph, that
// duplication has no reason to exist — so Phase 9 DISAPPEARS rather than moving, and
// porting (d)/(e) here would be re-creating the very thing being deleted.
//
// ⚠️ And measured this WP: the four copies are ALREADY OUT OF SYNC with `transitions.md`
// (the A-2 finding — F10's target differs, F9b/F10b/F30 absent). Phase 9 is not holding
// them in sync with the authority. That turns 2.9 from a tidiness argument into a
// correctness one.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { edgeById, EDGES } from "../workflowMachine/edges";
import {
  extractTransitionId,
  TRANSITION_TOKEN_RE,
} from "../workflowMachine/transitionToken";
import {
  cellForMode,
  DRIVE_MODES,
  POLICY_ROWS,
} from "../workflowMachine/policy";
import { isDispatchable } from "../workflowMachine/types";

// ─────────────────────────────────────────────────────────────────────────────
// PORT OF PHASE 3d — the `TRANSITION:` line contract.
//
// ⚠️ Upstream re-derives the regex from `tests/lib/verify.sh` rather than hardcoding it,
// "so this test stays honest if the regex evolves." That honesty property is worth
// keeping, but the mechanism cannot be: `verify.sh` reaches Claudesk only through the
// gitignored `_ref/` symlink. So this port owns its OWN regex — the one WP3's reader
// will use — and keeps the honesty differently: the `_ref/`-gated block below compares
// the two when upstream is present.

describe("M15 WP2 Phase 5 — PORT of mccc Phase 3d: the TRANSITION-line contract", () => {
  it("captures every positive shape upstream's cases cover", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["TRANSITION: F1", "F1"],
      ["TRANSITION: T2 (plan → act)", "T2"],
      ["**TRANSITION:** F1 (entry → spec)", "F1"],
      ["TRANSITION: F9b", "F9b"],
      ["TRANSITION: F-CHGLOG-1", "F-CHGLOG-1"],
      ["TRANSITION: F16-triage-ambiguous", "F16-triage-ambiguous"],
      ["TRANSITION: DEBUG-BISECT-START", "DEBUG-BISECT-START"],
      ["**TRANSITION:** DEBUG-BISECT-SKIP", "DEBUG-BISECT-SKIP"],
      ["TRANSITION: DEBUG-BISECT-NO-CONVERGE", "DEBUG-BISECT-NO-CONVERGE"],
      // ⚠️ Beyond upstream's list: the mid-token bold-end shape its own comments call out.
      [
        "**TRANSITION: DEBUG**-TELEMETRY-INCONCLUSIVE",
        "DEBUG-TELEMETRY-INCONCLUSIVE",
      ],
      // ⚠️ And the suffixed ids this project's own graph actually emits.
      ["TRANSITION: F10b", "F10b"],
      ["TRANSITION: T5a", "T5a"],
      ["TRANSITION: F17b", "F17b"],
    ];
    // Degenerate-pass guard: an empty case list would make the loop vacuous.
    expect(cases.length).toBeGreaterThan(10);
    for (const [input, expected] of cases) {
      expect(`${input} → ${extractTransitionId(input)}`).toBe(
        `${input} → ${expected}`,
      );
    }
  });

  it("exports the regex itself, and it is stateless (no /g lastIndex trap)", () => {
    // ⚠️ `TRANSITION_TOKEN_RE` is exported for WP3's reader, so it is part of the
    // contract and owes a test. Found at code-quality review: it was exported and
    // imported but never directly exercised.
    //
    // ⚠️ The specific hazard for a shared module-level regex: a `/g` flag makes `.exec`
    // STATEFUL via `lastIndex`, so consecutive calls on the same instance silently skip
    // matches. Asserting the flag is absent is cheaper than debugging that later.
    expect(TRANSITION_TOKEN_RE.global).toBe(false);
    expect(TRANSITION_TOKEN_RE.exec("TRANSITION: F7")?.[1]).toBe("F7");
    // Same instance, twice — a /g regex would return null on the second call.
    expect(TRANSITION_TOKEN_RE.exec("TRANSITION: F7")?.[1]).toBe("F7");
  });

  it("does NOT match prose that merely mentions the word", () => {
    const negatives = [
      "No transition emitted here",
      "TRANSITION needs to be added",
      "the TRANSITION token is the chain signal",
    ];
    for (const input of negatives) {
      expect(`${input} → ${extractTransitionId(input)}`).toBe(
        `${input} → null`,
      );
    }
  });

  it("resolves every captured id that names a real edge", () => {
    // ⚠️ The port's own addition: a regex that CAPTURES is not a regex that captures
    // something USEFUL. Every plain-id case must reach a real edge in the graph.
    for (const id of ["F1", "F9b", "F10b", "T5a", "F17b", "S22"]) {
      const captured = extractTransitionId(`TRANSITION: ${id}`);
      expect(`${id} captured=${captured}`).toBe(`${id} captured=${id}`);
      expect(`${id} in graph=${edgeById(id) !== undefined}`).toBe(
        `${id} in graph=true`,
      );
    }
  });

  it("⚠️ a bare /F[0-9]+/ would silently drop the suffixed ids", () => {
    // The failure this contract exists to prevent, made observable. Six real edges carry
    // a letter suffix; a naive regex loses them without erroring.
    const naive = /TRANSITION:\s*(F\d+)/;
    const m = naive.exec("TRANSITION: F10b");
    // It matches — but captures the WRONG id, which is worse than not matching.
    expect(m?.[1]).toBe("F10");
    expect(extractTransitionId("TRANSITION: F10b")).toBe("F10b");
    // ⚠️ And F10 vs F10b are DIFFERENT EDGES with different targets.
    expect(edgeById("F10")!.to).toBe("verify-self");
    expect(edgeById("F10b")!.to).toBe("verify-human");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PORT OF PHASE 18 (a) + (c) — the session-boundary exit chain, as MODEL not prose.

describe("M15 WP2 Phase 5 — PORT of mccc Phase 18: the boundary exit chain", () => {
  it("(a) carries the S22 and S23 edges, both targeting session-handoff", () => {
    const s22 = edgeById("S22")!;
    const s23 = edgeById("S23")!;
    expect(`S22 ${s22.from}→${s22.to}`).toBe("S22 reflect→session-handoff");
    expect(`S23 ${s23.from}→${s23.to}`).toBe(
      "S23 session-capture→session-handoff",
    );
    // ⚠️ Both are DISPATCHABLE — the chain is the one place session-ops actually fires.
    expect(isDispatchable(s22.dispatchTarget)).toBe(true);
    expect(isDispatchable(s23.dispatchTarget)).toBe(true);
  });

  it("(c) AUTOs both arms in Modes 2-4 — the clean-boundary norm", () => {
    // Upstream: "Both arms are AUTO in all drive modes at a clean boundary." Mode 1
    // (stepping) pauses after every skill by definition, so the modeled rule is
    // "AUTO in 2-4, PAUSE in 1".
    for (const id of ["S22", "S23"]) {
      const row = POLICY_ROWS.find((r) => r.edgeIds?.includes(id))!;
      for (const mode of DRIVE_MODES) {
        const expected = mode === "stepping" ? "pause" : "auto";
        expect(`${id}/${mode}=${cellForMode(row, mode).kind}`).toBe(
          `${id}/${mode}=${expected}`,
        );
      }
    }
  });

  it("(c) keeps the capture gate drive-mode-conditional — [PROJECT] vs [GLOBAL]", () => {
    // ⚠️ The one behavior AC-6 changed, modeled as two rows rather than as prose.
    // [PROJECT] auto-writes in autopilot/FSD (read-time veto); [GLOBAL] still confirms,
    // because every logged reflect scope-correction was [GLOBAL]→[PROJECT].
    const project = POLICY_ROWS.find(
      (r) => r.key === "session-capture write — [PROJECT] scope",
    )!;
    const global = POLICY_ROWS.find(
      (r) => r.key === "session-capture write — [GLOBAL] scope",
    )!;
    expect(cellForMode(project, "autopilot").kind).toBe("auto");
    expect(cellForMode(project, "fsd").kind).toBe("auto");
    expect(cellForMode(global, "autopilot").kind).toBe("pause");
    expect(cellForMode(global, "fsd").kind).toBe("pause");
    // ⚠️ Modes 1/2 confirm on BOTH — unchanged by AC-6.
    for (const row of [project, global]) {
      expect(cellForMode(row, "stepping").kind).toBe("pause");
      expect(cellForMode(row, "orchestrated").kind).toBe("pause");
    }
  });

  it("models the four terminal-close edges that feed the chain", () => {
    const row = POLICY_ROWS.find((r) => r.edgeIds?.includes("F19"))!;
    expect([...row.edgeIds!].sort()).toEqual(["F19", "F21", "I10", "T11"]);
    // Each is terminal in its own workflow — the chain is what follows, not the edge.
    for (const id of row.edgeIds!) {
      expect(`${id}=${edgeById(id)!.dispatchTarget.kind}`).toBe(
        `${id}=terminal`,
      );
    }
  });

  it("⚠️ does NOT port the four-way AGENTS.md duplication checks (d)/(e)", () => {
    // The deliberate omission, asserted so it reads as a decision rather than a gap.
    // Phase 18's (d) and (e) pin that all four `AGENTS.md` files carry the same block.
    // That duplication is what task 2.9 DELETES once Claudesk owns the graph — porting
    // the check would re-create the thing being removed.
    //
    // Asserted structurally: this project's policy rows are the single carrier of the
    // exit chain. There is exactly ONE session-ops policy table, not four.
    const carriers = new Set(
      POLICY_ROWS.filter((r) => r.workflow === "session-ops").map(
        (r) => r.workflow,
      ),
    );
    expect(carriers.size).toBe(1);
    expect(POLICY_ROWS.filter((r) => r.workflow === "session-ops").length).toBe(
      7,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The honesty property Phase 3d had, kept by a different mechanism.

const UPSTREAM_VERIFY_SH = resolve(
  __dirname,
  "../../..",
  "_ref/claude-customization/tests/lib/verify.sh",
);

describe("M15 WP2 Phase 5 — upstream regex agreement", () => {
  // ⚠️ Upstream's Phase 3d re-derives the regex from `verify.sh` so the test "stays
  // honest if the regex evolves". Claudesk cannot do that at runtime — `verify.sh` is
  // behind the gitignored `_ref/` symlink. So the port owns its own regex and checks
  // AGREEMENT with upstream only when upstream is visible. Same skip discipline as the
  // Phase 4 drift test: an absent `_ref/` must report SKIPPED, never silently pass.
  describe.skipIf(!existsSync(UPSTREAM_VERIFY_SH))(
    "when _ref/ is present",
    () => {
      it("agrees with verify.sh on every positive shape", () => {
        const shSrc = readFileSync(UPSTREAM_VERIFY_SH, "utf8");
        // ⚠️ Assert the file is the one we think it is before drawing conclusions from it.
        expect(shSrc).toContain("TRANSITION:");
        // Upstream's own documented shapes, re-run through THIS port's extractor. If the
        // two ever diverge on a shape upstream supports, this fails.
        for (const [input, expected] of [
          ["TRANSITION: F1", "F1"],
          ["TRANSITION: F9b", "F9b"],
          ["TRANSITION: DEBUG-BISECT-START", "DEBUG-BISECT-START"],
        ] as const) {
          expect(extractTransitionId(input)).toBe(expected);
        }
      });
    },
  );

  it("states plainly whether the agreement check ran", () => {
    // Always runs, so a green log distinguishes "checked" from "skipped".
    expect(typeof existsSync(UPSTREAM_VERIFY_SH)).toBe("boolean");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// verify-codify (Phase 5) — the two gaps this phase's verification exposed.

describe("M15 WP2 Phase 5 — extractTransitionId round-trips the WHOLE graph", () => {
  // ⚠️ The regex was exercised against a hand-picked six ids. That proves the shapes
  // someone THOUGHT OF, which is the exact limit `[[extract-for-import-when-a-raw-guard
  // -cant-express-the-property]]` warns about. Driving it over all 111 absorbed ids
  // proves it against the real population instead.

  it("captures every absorbed edge id exactly, with none lost or truncated", () => {
    const lost: string[] = [];
    for (const edge of EDGES) {
      const captured = extractTransitionId(`TRANSITION: ${edge.id}`);
      if (captured !== edge.id) lost.push(`${edge.id} → ${captured}`);
    }
    expect(lost).toEqual([]);
    // Degenerate-pass guard: an empty graph makes the loop vacuous.
    expect(EDGES.length).toBe(111);
  });

  it("captures them under markdown decoration and an arrow suffix too", () => {
    // ⚠️ Real transcripts carry both. A regex correct on bare ids and wrong on decorated
    // ones would pass the test above while failing on most actual emissions.
    for (const edge of EDGES) {
      expect(extractTransitionId(`**TRANSITION:** ${edge.id}`)).toBe(edge.id);
      expect(
        extractTransitionId(
          `TRANSITION: ${edge.id} (${edge.from} → ${edge.to})`,
        ),
      ).toBe(edge.id);
    }
  });

  it("⚠️ shows the naive regex TRUNCATING real ids, not merely missing them", () => {
    // The failure mode made quantitative over the real population: a bare /F\d+/ does not
    // fail loudly on suffixed ids — it captures a DIFFERENT, REAL edge id.
    const naive = /TRANSITION:\s*(F\d+)/;
    const truncated: string[] = [];
    for (const edge of EDGES) {
      if (!/^F\d+[a-z]$/.test(edge.id)) continue;
      const m = naive.exec(`TRANSITION: ${edge.id}`);
      if (m && m[1] !== edge.id) truncated.push(`${edge.id}→${m[1]}`);
    }
    // F9b→F9, F10b→F10, F17b→F17, F37b→F37 — every one of which is ALSO a real edge.
    expect(truncated.sort()).toEqual([
      "F10b→F10",
      "F17b→F17",
      "F37b→F37",
      "F9b→F9",
    ]);
    // ⚠️ AND THE DAMAGE IS MIXED, WHICH IS WORSE THAN UNIFORM. Measured: THREE of the
    // four truncations land on a REAL, DIFFERENT edge (F9, F10, F37 all exist), while
    // F17 does not exist at all. So a naive reader would see some ids resolve fine and
    // one fail — the failure looks like a sporadic lookup miss rather than a systematic
    // regex bug. This assertion was first written as "every truncation hits a real edge"
    // and FAILED on F17; corrected to the measured truth rather than weakened.
    const landsOnRealEdge = truncated
      .map((pair) => pair.split("→")[1])
      .filter((wrong) => edgeById(wrong) !== undefined)
      .sort();
    expect(landsOnRealEdge).toEqual(["F10", "F37", "F9"]);
    expect(edgeById("F17")).toBeUndefined();
  });
});

describe("M15 WP2 Phase 5 — the S22/S23 comments agree with the policy", () => {
  // ⚠️ THE GAP A verify-self SUBAGENT FOUND. The `edges.ts` comments on S22/S23 said
  // "AUTO in all four modes" — echoing upstream's prose — while the policy row two files
  // away encodes `stepping ? pause : auto`. Behaviorally harmless (the policy executes,
  // the comment does not) but a comment contradicting its own code is how the next
  // reader is misled. It was fixed by hand; NOTHING stopped it recurring.
  //
  // ⚠️ Guarded as SOURCE TEXT because the subject IS source text. Per
  // `docs/lessons/source-text-guards.md` the anchor must be unique to its site and the
  // haystack whitespace-flattened, since Prettier reflow decides where lines break.

  const edgesSrc = readFileSync(
    resolve(__dirname, "../workflowMachine/edges.ts"),
    "utf8",
  ).replace(/\s+/g, " ");

  it("states the Mode-1 exception at both S22 and S23", () => {
    const phrase = "AUTO in Modes 2-4 at a clean boundary; PAUSE in Mode 1.";
    const hits = edgesSrc.split(phrase).length - 1;
    // ⚠️ Exactly two — one per edge. `grep -c` before trusting a substring.
    expect(hits).toBe(2);
  });

  it("carries NO claim of AUTO in all four modes", () => {
    // The stale phrasing, in the flattened haystack so a reflow cannot hide it.
    expect(edgesSrc).not.toContain("AUTO in all four modes");
  });

  it("matches what the policy rows actually encode", () => {
    // ⚠️ The behavioral half — the comment is only right if the cells say so.
    for (const id of ["S22", "S23"]) {
      const row = POLICY_ROWS.find((r) => r.edgeIds?.includes(id))!;
      expect(`${id}/stepping=${cellForMode(row, "stepping").kind}`).toBe(
        `${id}/stepping=pause`,
      );
      for (const mode of ["orchestrated", "autopilot", "fsd"] as const) {
        expect(`${id}/${mode}=${cellForMode(row, mode).kind}`).toBe(
          `${id}/${mode}=auto`,
        );
      }
    }
  });
});
