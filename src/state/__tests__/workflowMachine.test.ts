// M15 WP2 Phase 1 — structural tests over the absorbed edge graph.
//
// ⚠️ WHAT THESE TESTS ARE FOR, AND WHAT THEY CANNOT DO
//
// These pin the SHAPE of the absorbed graph: ids unique, endpoints resolvable, the six
// probe-named non-dispatchable edges classified, the two `behavior-within-state` rows
// absent. They are deliberately NOT a correctness proof of the transcription against
// upstream — that is the drift test's job (Phase 4 P4.5), which reads `_ref/` when
// present. The standing local hazard applies: *a mechanism correct in itself behind a
// caller that does not honor it.* Enumerating the set proves the SET, not its callers.
//
// ⚠️ COUNTS ARE ASSERTED AS SELF-CONSISTENT, NOT AGAINST `wbs.md`'s CONSTANTS. M-7 says
// 113 transition rows; the live source had 111 on 2026-09-12. A test hardcoding 113
// would FAIL on a correct absorption and PASS on an incomplete one — the exact inversion
// `[[backlog-finding-carries-an-implicit-as-of-date]]` warns about. Where a literal does
// appear below it is a MEASURED value with its measurement date stated.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allEdges, edgeById, EDGES } from "../workflowMachine/edges";
import { isDispatchable } from "../workflowMachine/types";
import type { DispatchTarget, WorkflowId } from "../workflowMachine/types";

/** Upstream sentinels that are boundaries rather than states. */
const SENTINELS = new Set(["ENTRY", "ANY", "SURFACE-IN"]);

/** A `to` cell that leaves the machine rather than naming a state within it. */
function isBoundaryTarget(to: string): boolean {
  return (
    to.startsWith("EXIT") ||
    to.startsWith("SURFACE→") ||
    to.startsWith("ESCALATE→") ||
    to.startsWith("REDIRECT→") ||
    to.includes(":") || // cross-workflow, e.g. `incident:report`
    to.startsWith("(") // a meta-op pseudo-target, e.g. `(auto-chain)`
  );
}

describe("M15 WP2 — the absorbed graph is structurally sound", () => {
  it("holds a nonzero number of edges", () => {
    // ⚠️ Guards the degenerate pass: every `every()`/`for` assertion below is vacuously
    // true over an empty array, so an emptied EDGES would turn this whole file green.
    // Same shape as the `ok. 0 passed` trap in docs/lessons/source-text-guards.md.
    expect(EDGES.length).toBeGreaterThan(0);
    expect(allEdges()).toBe(EDGES);
  });

  it("gives every edge a unique id", () => {
    const ids = EDGES.map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
    expect(new Set(ids).size).toBe(EDGES.length);
  });

  it("resolves every id through the lookup index", () => {
    for (const e of EDGES) {
      expect(edgeById(e.id)).toBe(e);
    }
    expect(edgeById("F-does-not-exist")).toBeUndefined();
  });

  it("prefixes every edge id with its workflow's letter", () => {
    const prefix: Record<WorkflowId, string> = {
      product: "P",
      feature: "F",
      task: "T",
      incident: "I",
      "session-ops": "S",
    };
    for (const e of EDGES) {
      // Compared as a labelled string so a failure names the offending edge rather than
      // reporting a bare `false`.
      expect(`${e.id} in ${e.workflow}`).toBe(
        `${prefix[e.workflow]}${e.id.slice(1)} in ${e.workflow}`,
      );
    }
  });

  it("admits the suffixed edge ids that a naive /F[0-9]+/ would drop", () => {
    // ⚠️ F9b, F10b, F17b, F37b, T5a/b/c are real. A regex without a trailing-letter arm
    // silently loses six edges — and F10b/F9b are exactly the two the stale AGENTS.md
    // copy omits, so the failure would look like agreement with the wrong source.
    const suffixed = EDGES.filter((e) => /[a-z]$/.test(e.id)).map((e) => e.id);
    expect(suffixed).toEqual(
      expect.arrayContaining([
        "F9b",
        "F10b",
        "F17b",
        "F37b",
        "T5a",
        "T5b",
        "T5c",
      ]),
    );
  });

  it("points every from/to at a declared state or a named boundary", () => {
    const statesByWorkflow = new Map<WorkflowId, Set<string>>();
    for (const e of EDGES) {
      const set = statesByWorkflow.get(e.workflow) ?? new Set<string>();
      if (!SENTINELS.has(e.from)) set.add(e.from);
      if (!isBoundaryTarget(e.to)) set.add(e.to);
      statesByWorkflow.set(e.workflow, set);
    }
    for (const e of EDGES) {
      const known = statesByWorkflow.get(e.workflow)!;
      const fromOk = SENTINELS.has(e.from) || known.has(e.from);
      const toOk = isBoundaryTarget(e.to) || known.has(e.to);
      expect(`${e.id}.from=${e.from} ok=${fromOk}`).toBe(
        `${e.id}.from=${e.from} ok=true`,
      );
      expect(`${e.id}.to=${e.to} ok=${toOk}`).toBe(
        `${e.id}.to=${e.to} ok=true`,
      );
    }
  });

  it("gives every edge a non-empty condition", () => {
    for (const e of EDGES) {
      expect(`${e.id}:${e.condition.length > 0}`).toBe(`${e.id}:true`);
    }
  });

  it("covers all five workflows", () => {
    const seen = new Set(EDGES.map((e) => e.workflow));
    expect([...seen].sort()).toEqual([
      "feature",
      "incident",
      "product",
      "session-ops",
      "task",
    ]);
  });
});

describe("M15 WP2 — dispatchability is held SEPARATELY from the policy cell", () => {
  // ⚠️ The probe's FIRST mandatory structural correction. Cell-only labelling marked 223
  // breaks; classifying the target took it to 127. Without this, WP3 injects commands
  // into workflows that have already ended.

  it("classifies the six probe-named edges as NON-dispatchable", () => {
    // ⚠️ These six are named in the WP1 probe report as the bulk of the 223→127 delta.
    // Each one's FROM-state policy row reads AUTO while its target is not a skill.
    const nonDispatchable = ["S20", "S17", "F19", "F30", "P13", "S6"];
    for (const id of nonDispatchable) {
      const e = edgeById(id);
      expect(`${id} present=${e !== undefined}`).toBe(`${id} present=true`);
      expect(`${id} dispatchable=${isDispatchable(e!.dispatchTarget)}`).toBe(
        `${id} dispatchable=false`,
      );
    }
  });

  it("keeps a real dispatchable set — the classification is not blanket-false", () => {
    // ⚠️ Positive control. Without this, classifying EVERY edge non-dispatchable would
    // pass the test above while making the supervisor fire on nothing at all.
    const dispatchable = EDGES.filter((e) => isDispatchable(e.dispatchTarget));
    expect(dispatchable.length).toBeGreaterThan(0);
    expect(dispatchable.length).toBeLessThan(EDGES.length);
    for (const e of dispatchable) {
      const t = e.dispatchTarget;
      // The narrowing is what makes `skill` reachable; assert the payload is usable.
      expect(`${e.id}:${t.kind === "skill" && t.skill.length > 0}`).toBe(
        `${e.id}:true`,
      );
    }
  });

  it("names skills by command name, never by a filesystem path", () => {
    // The recorded §4c anti-brittleness decision: the command name is the only stable
    // cross-repo coupling; a path is not.
    for (const e of EDGES) {
      if (e.dispatchTarget.kind !== "skill") continue;
      const name = e.dispatchTarget.skill;
      expect(`${e.id}:${name}`).toBe(`${e.id}:${name.replace(/[/\\]/g, "")}`);
      expect(`${e.id}:${name.startsWith("/")}`).toBe(`${e.id}:false`);
    }
  });

  it("classifies every terminal/EXIT edge as non-dispatchable", () => {
    for (const e of EDGES) {
      if (!e.to.startsWith("EXIT")) continue;
      expect(`${e.id} dispatchable=${isDispatchable(e.dispatchTarget)}`).toBe(
        `${e.id} dispatchable=false`,
      );
    }
  });

  it("classifies every SURFACE edge as non-dispatchable", () => {
    for (const e of EDGES) {
      if (!e.to.startsWith("SURFACE→")) continue;
      expect(`${e.id} kind=${e.dispatchTarget.kind}`).toBe(
        `${e.id} kind=surface`,
      );
    }
  });
});

describe("M15 WP2 — the ownership boundary with mccc is respected", () => {
  // ⚠️ M-9 / inherited constraint 5. `transitions.md` interleaves mccc's INTRA-TURN
  // semantics with the graph. Claudesk owns the drive mode's VALUE + TURN-BOUNDARY
  // enforcement; mccc owns its MEANING + INTRA-TURN semantics. Absorbing a
  // `behavior-within-state` row would cross that boundary.

  const source = readFileSync(
    resolve(__dirname, "../workflowMachine/edges.ts"),
    "utf8",
  );

  it("absorbs NO `behavior-within-state` row", () => {
    // Both live in the upstream Session Operations table (transitions.md:453 = reflect's
    // candidate filter, :454 = session-capture's drive-mode-conditional confirm gate).
    // ⚠️ Asserted against the source text stripped of comments — the phrase appears in
    // this file's own prose and in edges.ts's header, and a guard satisfied by its own
    // comments passes exactly when the code it names was deleted
    // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("behavior-within-state");
    // The two rows' distinguishing content, likewise absent from executable code.
    expect(code).not.toContain("candidate learnings");
    expect(code).not.toContain("read-time veto");
  });

  it("still carries the two S-edges that ARE Claudesk's (S22/S23)", () => {
    // ⚠️ Positive control for the test above: the boundary excludes intra-turn BEHAVIOR,
    // not the session-ops EDGES. A transcription that dropped S22/S23 to "stay clear of
    // mccc" would pass the absence test and silently delete the boundary auto-chain.
    for (const id of ["S22", "S23"]) {
      const e = edgeById(id);
      expect(`${id} present=${e !== undefined}`).toBe(`${id} present=true`);
      expect(`${id} to=${e!.to}`).toBe(`${id} to=session-handoff`);
    }
  });
});

describe("M15 WP2 — transcription decisions that must not be silently reverted", () => {
  it("records S22/S23 as reflect→handoff and capture→handoff, not `(auto-chain)`", () => {
    // ⚠️ The only 2 of 111 rows where this transcription diverges from the upstream CELL
    // LAYOUT. Upstream puts the whole edge in `From` and the edge's TYPE in `To`. Both
    // rows' prose confirms the reading used here. Pinned so the drift test does not read
    // the divergence as a transcription error, and so nobody "fixes" it back.
    expect(edgeById("S22")!.from).toBe("reflect");
    expect(edgeById("S23")!.from).toBe("session-capture");
    for (const id of ["S22", "S23"]) {
      expect(`${id} to=${edgeById(id)!.to}`).not.toBe(`${id} to=(auto-chain)`);
    }
  });

  it("does NOT invent S19, S21 or F29 — they are upstream numbering gaps", () => {
    // Verified absent from transitions.md on 2026-09-12. Pinned so a later pass does not
    // "restore" an edge that never existed.
    for (const id of ["S19", "S21", "F29"]) {
      expect(`${id}=${edgeById(id) === undefined}`).toBe(`${id}=true`);
    }
  });

  it("records F10 as verify-auto → verify-self (NOT the stale AGENTS.md target)", () => {
    // ⚠️ THE A-2 FINDING, pinned. `agents/feature-workflow/AGENTS.md` records
    // `F10 = verify-auto → verify-human` and omits verify-self from its state table
    // entirely — it predates verify-self being a state. Transcribing from that copy, or
    // merging it, would put a wrong target into the lookup the WP3 detector's verdict IS.
    const f10 = edgeById("F10")!;
    expect(f10.from).toBe("verify-auto");
    expect(f10.to).toBe("verify-self");
    // And the two edges that copy omits entirely:
    expect(edgeById("F10b")!.to).toBe("verify-human");
    expect(edgeById("F9b")!.to).toBe("build");
  });

  it("routes F17b around review-quality, per the Mode-4 SKIP", () => {
    // In Mode 4 review-quality is `SKIP (entire skill)` — the state does not execute, so
    // ship must reach finalize by its own edge rather than through F38.
    const f17b = edgeById("F17b")!;
    expect(`${f17b.from}->${f17b.to}`).toBe("ship->finalize");
    const f38 = edgeById("F38")!;
    expect(`${f38.from}->${f38.to}`).toBe("ship->review-quality");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// verify-codify (Phase 1) — behaviors confirmed during build/verify-self by
// THROWAWAY scripts, now codified as standing coverage.
//
// ⚠️ WHY THESE ARE NOT DUPLICATES of the structural block above. The tests above assert
// SHAPE (ids unique, endpoints resolvable, the six non-dispatchables classified) and
// deliberately avoid exact counts, because `wbs.md`'s M-7 constant (113) was measured
// stale and hardcoding it would fail on a correct absorption. The tests below assert the
// ABSORBED TOTALS — which are a different property, and the one a silent partial
// transcription would break while every shape assertion still passed.
//
// The WP1 ruling that forced this: *"only a standing test is coverage."* The 111/14-43-13-
// 20-21 figures were verified twice during this phase (a diff script at build, a node
// process at verify-self) and BOTH were throwaway. Until now nothing would catch their
// regression.
//
// ⚠️ These numbers are the ABSORBED truth as of 2026-09-12, not a target copied from an
// upstream doc. When upstream legitimately grows an edge, the P4.5 drift test is what
// says so; THIS test then gets updated deliberately, with the new count re-measured.

describe("M15 WP2 Phase 1 — the absorbed totals (codified 2026-09-12)", () => {
  it("holds exactly 111 edges — the count measured from transitions.md", () => {
    // ⚠️ A silent partial transcription (say, one workflow's table dropped) passes every
    // shape assertion in this file. Only an exact count catches it.
    expect(EDGES.length).toBe(111);
  });

  it("splits 14/43/13/20/21 across the five workflows", () => {
    // ⚠️ The per-workflow split is the finer-grained version of the count: it catches a
    // drop that a compensating addition elsewhere would hide from the total alone.
    const split: Record<string, number> = {};
    for (const e of EDGES) split[e.workflow] = (split[e.workflow] ?? 0) + 1;
    expect(split).toEqual({
      product: 14,
      feature: 43,
      task: 13,
      incident: 20,
      "session-ops": 21,
    });
  });

  it("classifies 67 edges dispatchable (the other 111 − 67 = 44 are not)", () => {
    // The dispatchable/non-dispatchable balance is the probe's 223→127 correction made
    // standing. A regression here is WP3 firing into terminal states. The non-dispatchable
    // count is arithmetic of this pin and the 111 above, so it is not asserted a second time.
    const yes = EDGES.filter((e) => isDispatchable(e.dispatchTarget));
    expect(yes.length).toBe(67);
  });
});

describe("M15 WP2 Phase 1 — isDispatchable narrows correctly on every kind", () => {
  // ⚠️ The tests above only ever call `isDispatchable` on real edges, so the four
  // non-skill arms are exercised incidentally at best. This drives the predicate
  // DIRECTLY over one value of each kind — the guard WP3 gates every fire on.

  it("returns true for `skill` and false for the other four kinds", () => {
    const cases: ReadonlyArray<readonly [DispatchTarget, boolean]> = [
      [{ kind: "skill", skill: "feature-build" }, true],
      [{ kind: "terminal", note: "x" }, false],
      [{ kind: "surface", to: "product:wbs" }, false],
      [{ kind: "meta-op", note: "x" }, false],
      [{ kind: "cross-workflow", to: "incident:report" }, false],
    ];
    // ⚠️ Assert the case list covers every arm of the union. Adding a 6th kind without a
    // case here would otherwise leave it silently unexercised — and an unexercised arm
    // defaulting to `true` is a fire into an unknown target.
    const kinds = cases.map(([t]) => t.kind).sort();
    expect(kinds).toEqual([
      "cross-workflow",
      "meta-op",
      "skill",
      "surface",
      "terminal",
    ]);
    for (const [target, expected] of cases) {
      expect(`${target.kind}=${isDispatchable(target)}`).toBe(
        `${target.kind}=${expected}`,
      );
    }
  });
});
