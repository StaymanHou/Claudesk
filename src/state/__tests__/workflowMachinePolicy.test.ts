// M15 WP2 Phase 2 — tests over the pause-policy matrix.
//
// ⚠️ Kept in its own file rather than appended to `workflowMachine.test.ts`: that file
// guards the EDGE GRAPH, this one guards the POLICY. Phase 3 adds a third for the
// edge→row derivation. Splitting by subject keeps a failure's blast radius legible —
// "the graph broke" and "the policy broke" are different diagnoses.

import { describe, expect, it } from "vitest";
import {
  allPolicyRows,
  cellForMode,
  DRIVE_MODES,
  effectiveModeForWorkflow,
  INCIDENT_FORCES_MODE,
  isStop,
  POLICY_ROWS,
  resolveCell,
  resolveEffectiveMode,
} from "../workflowMachine/policy";
import type {
  DriveMode,
  DriveModeInput,
  PolicyCell,
} from "../workflowMachine/policy";
import { edgeById } from "../workflowMachine/edges";

describe("M15 WP2 Phase 2 — the matrix is structurally sound", () => {
  it("holds a nonzero number of rows", () => {
    // ⚠️ Degenerate-pass guard, same role as the edge-graph one: every `for` below is
    // vacuously true over an empty array.
    expect(POLICY_ROWS.length).toBeGreaterThan(0);
    expect(allPolicyRows()).toBe(POLICY_ROWS);
  });

  it("holds exactly 58 rows, split 25/5/6/15/7 — the counts absorbed 2026-09-12", () => {
    // ⚠️ Verified against upstream by script at build time: feature 25, task 5,
    // product 6, incident 15, session-boundary 7. A silently dropped table passes every
    // shape assertion below; only the exact split catches it.
    expect(POLICY_ROWS.length).toBe(58);
    const split: Record<string, number> = {};
    for (const r of POLICY_ROWS)
      split[r.workflow] = (split[r.workflow] ?? 0) + 1;
    expect(split).toEqual({
      feature: 25,
      task: 5,
      product: 6,
      incident: 15,
      "session-ops": 7,
    });
  });

  it("gives every row a non-empty key and a declared keyKind", () => {
    for (const r of POLICY_ROWS) {
      expect(`${r.workflow}/${r.key}: ${r.key.length > 0}`).toBe(
        `${r.workflow}/${r.key}: true`,
      );
      expect(["step", "edge-ids", "category"]).toContain(r.keyKind);
    }
  });

  it("gives every `edge-ids` row a non-empty edgeIds list, and no other row one", () => {
    // ⚠️ M-8's hazard made checkable: a row claiming to key on edge ids while carrying
    // none is exactly the "derivation work mistaken for a lookup" trap.
    for (const r of POLICY_ROWS) {
      const has = (r.edgeIds?.length ?? 0) > 0;
      expect(`${r.key.slice(0, 40)} kind=${r.keyKind} hasIds=${has}`).toBe(
        `${r.key.slice(0, 40)} kind=${r.keyKind} hasIds=${r.keyKind === "edge-ids"}`,
      );
    }
  });

  it("fills all four mode columns on every row", () => {
    for (const r of POLICY_ROWS) {
      for (const mode of DRIVE_MODES) {
        const cell = cellForMode(r, mode);
        expect(`${r.key.slice(0, 30)}/${mode}: ${typeof cell?.kind}`).toBe(
          `${r.key.slice(0, 30)}/${mode}: string`,
        );
      }
    }
  });
});

describe("M15 WP2 Phase 2 — the cell is NOT a boolean", () => {
  it("uses all six modeled arms somewhere in the matrix", () => {
    // ⚠️ If an arm appears nowhere, either the transcription lost a cell or the arm is
    // dead weight. Both are worth failing on. Six arms model upstream's five vocabulary
    // values plus `confirm` (see policy.ts header).
    const kinds = new Set<string>();
    for (const r of POLICY_ROWS) {
      for (const mode of DRIVE_MODES) kinds.add(cellForMode(r, mode).kind);
    }
    expect([...kinds].sort()).toEqual([
      "auto",
      "auto-skip",
      "confirm",
      "n/a",
      "pause",
      "skip-skill",
    ]);
  });

  it("models AUTO-SKIP's condition as DATA, not prose", () => {
    // The one conditional cell in the matrix: feature/verify-human in autopilot.
    const row = POLICY_ROWS.find(
      (r) => r.workflow === "feature" && r.key === "verify-human",
    )!;
    const cell = row.autopilot;
    expect(cell.kind).toBe("auto-skip");
    if (cell.kind !== "auto-skip") throw new Error("unreachable");
    expect([...cell.requires].sort()).toEqual([
      "no-integration-boundary",
      "verify-self-all-pass",
    ]);
    expect(cell.fallback).toBe("pause");
  });

  it("resolves AUTO-SKIP both ways against caller-supplied evidence", () => {
    const row = POLICY_ROWS.find(
      (r) => r.workflow === "feature" && r.key === "verify-human",
    )!;
    // Both conditions met → the state is skipped.
    expect(
      resolveCell(row.autopilot, {
        integrationBoundary: false,
        verifySelfAllPass: true,
      }).kind,
    ).toBe("skip-skill");
    // A boundary exists → falls back to PAUSE.
    expect(
      resolveCell(row.autopilot, {
        integrationBoundary: true,
        verifySelfAllPass: true,
      }).kind,
    ).toBe("pause");
    // verify-self not all-PASS → falls back to PAUSE.
    expect(
      resolveCell(row.autopilot, {
        integrationBoundary: false,
        verifySelfAllPass: false,
      }).kind,
    ).toBe("pause");
    // ⚠️ NO evidence supplied → PAUSE, never skip. Absence of evidence is not evidence
    // of a clean gate; defaulting the other way would auto-skip every human gate.
    expect(resolveCell(row.autopilot, {}).kind).toBe("pause");
  });

  it("leaves non-conditional cells untouched when resolved", () => {
    const cells: readonly PolicyCell[] = [
      { kind: "auto" },
      { kind: "pause" },
      { kind: "skip-skill" },
      { kind: "n/a", why: "x" },
      { kind: "confirm", question: "q" },
    ];
    for (const c of cells) expect(resolveCell(c, {})).toBe(c);
  });

  it("records F17b as the edge routing AROUND the Mode-4 skipped state", () => {
    // ⚠️ `SKIP (entire skill)` removes a state; something must route past it. Held as
    // data (`aroundEdge`) so a caller follows the detour rather than guessing.
    const f39 = POLICY_ROWS.find((r) => r.edgeIds?.includes("F39"))!;
    const cell = f39.fsd;
    expect(cell.kind).toBe("skip-skill");
    if (cell.kind !== "skip-skill") throw new Error("unreachable");
    expect(cell.aroundEdge).toBe("F17b");
  });

  it("treats every non-auto cell as a stop, including an UNRESOLVED auto-skip", () => {
    // ⚠️ The WP3 condition "bias the failure direction toward WITHHOLDING" encoded: a
    // caller that forgets `resolveCell` must fail safe, not fire.
    expect(isStop({ kind: "auto" })).toBe(false);
    for (const c of [
      { kind: "pause" } as const,
      { kind: "n/a", why: "x" } as const,
      { kind: "skip-skill" } as const,
      { kind: "confirm", question: "q" } as const,
      {
        kind: "auto-skip",
        requires: ["verify-self-all-pass"],
        fallback: "pause",
      } as const,
    ]) {
      expect(`${c.kind}=${isStop(c)}`).toBe(`${c.kind}=true`);
    }
  });
});

describe("M15 WP2 Phase 2 — Mode 0 is expressible but NOT a suppressor (R-1)", () => {
  it("resolves `direct` to the STORED mode, never to a no-op", () => {
    // ⚠️ RULING R-1, pinned. Only 3 of 206 skill-using sessions carry a /session-start
    // marker while 139 chained 2+ skills, so honoring Mode 0 literally would suppress
    // firing on ~every real session and ship the milestone dead.
    for (const stored of DRIVE_MODES) {
      expect(
        `direct+${stored} → ${resolveEffectiveMode("direct", stored)}`,
      ).toBe(`direct+${stored} → ${stored}`);
    }
  });

  it("passes the four real modes through unchanged", () => {
    for (const m of DRIVE_MODES) {
      // The stored mode is deliberately DIFFERENT, to prove the input wins when it is
      // not `direct` — a resolver that always returned `stored` would pass the test
      // above while being wrong here.
      const stored: DriveMode = m === "fsd" ? "stepping" : "fsd";
      expect(`${m} → ${resolveEffectiveMode(m, stored)}`).toBe(`${m} → ${m}`);
    }
  });

  it("types `direct` as an input but never as a DriveMode", () => {
    // Compile-time property made observable: `DriveModeInput` admits "direct",
    // `DRIVE_MODES` (the four real modes) does not contain it.
    const input: DriveModeInput = "direct";
    expect(input).toBe("direct");
    expect((DRIVE_MODES as readonly string[]).includes("direct")).toBe(false);
    expect(DRIVE_MODES.length).toBe(4);
  });
});

describe("M15 WP2 Phase 2 — incidents are always Mode 2", () => {
  it("forces orchestrated for the incident workflow, whatever mode is selected", () => {
    for (const m of DRIVE_MODES) {
      expect(`incident+${m} → ${effectiveModeForWorkflow("incident", m)}`).toBe(
        `incident+${m} → orchestrated`,
      );
    }
    expect(INCIDENT_FORCES_MODE).toBe("orchestrated");
  });

  it("leaves every other workflow's mode alone", () => {
    for (const wf of ["feature", "task", "product", "session-ops"] as const) {
      for (const m of DRIVE_MODES) {
        expect(`${wf}+${m} → ${effectiveModeForWorkflow(wf, m)}`).toBe(
          `${wf}+${m} → ${m}`,
        );
      }
    }
  });

  it("writes the SAME cell into all four columns of every incident row", () => {
    // ⚠️ Belt and braces, deliberately: the override above is the rule, but a caller
    // that reads a column directly must still get the right answer. Verified against
    // upstream at build time — all 15 incident rows are uniform.
    for (const r of POLICY_ROWS) {
      if (r.workflow !== "incident") continue;
      const kinds = DRIVE_MODES.map((m) => cellForMode(r, m).kind);
      expect(`${r.key.slice(0, 40)}: ${new Set(kinds).size}`).toBe(
        `${r.key.slice(0, 40)}: 1`,
      );
    }
  });
});

describe("M15 WP2 Phase 2 — cells that must not silently change", () => {
  const cell = (workflow: string, key: string, mode: DriveMode): string => {
    const row = POLICY_ROWS.find(
      (r) => r.workflow === workflow && r.key === key,
    )!;
    return cellForMode(row, mode).kind;
  };

  it("PAUSEs feature/spec in autopilot — the F3/F4 regression sentinel", () => {
    // ⚠️ THE SENTINEL (inherited constraint 2). All 23 of the naive predicate's false
    // positives were spec exits (F4 x20, F3 x3). This row is what eliminates them —
    // if spec ever reads AUTO in Mode 3, the detector regresses to the naive baseline.
    expect(cell("feature", "spec", "autopilot")).toBe("pause");
    expect(cell("feature", "spec", "orchestrated")).toBe("pause");
    // And Mode 4 genuinely does AUTO through spec — so the sentinel is mode-specific,
    // not a blanket "spec always pauses".
    expect(cell("feature", "spec", "fsd")).toBe("auto");
  });

  it("PAUSEs F35 (terminate) in ALL FOUR modes, Mode 4 included", () => {
    const row = POLICY_ROWS.find((r) => r.edgeIds?.includes("F35"))!;
    for (const m of DRIVE_MODES) {
      expect(`F35/${m}=${cellForMode(row, m).kind}`).toBe(`F35/${m}=pause`);
    }
  });

  it("AUTOs S22 and S23 in all four modes — the boundary exit chain", () => {
    // ⚠️ What the Phase 18 port (P5.2) will pin from the other direction.
    for (const id of ["S22", "S23"]) {
      const row = POLICY_ROWS.find((r) => r.edgeIds?.includes(id))!;
      for (const m of DRIVE_MODES) {
        // Mode 1 (stepping) pauses after every skill by definition; the chain is AUTO
        // in Modes 2-4.
        const expected = m === "stepping" ? "pause" : "auto";
        expect(`${id}/${m}=${cellForMode(row, m).kind}`).toBe(
          `${id}/${m}=${expected}`,
        );
      }
    }
  });

  it("keeps [GLOBAL]-scope capture confirming even in autopilot/FSD", () => {
    // Higher blast radius than [PROJECT]; every logged reflect scope-correction was
    // [GLOBAL]→[PROJECT].
    expect(
      cell(
        "session-ops",
        "session-capture write — [GLOBAL] scope",
        "autopilot",
      ),
    ).toBe("pause");
    expect(
      cell("session-ops", "session-capture write — [GLOBAL] scope", "fsd"),
    ).toBe("pause");
    // …while [PROJECT] auto-writes there (read-time veto).
    expect(
      cell(
        "session-ops",
        "session-capture write — [PROJECT] scope",
        "autopilot",
      ),
    ).toBe("auto");
  });

  it("PAUSEs ESCALATE in every mode, in both workflows that declare it", () => {
    expect(cell("feature", "ESCALATE (any)", "fsd")).toBe("pause");
    expect(cell("task", "ESCALATE / REDIRECT", "fsd")).toBe("pause");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// verify-codify (Phase 2) — properties confirmed during build/verify-self by THROWAWAY
// probes, now codified as standing coverage.

describe("M15 WP2 Phase 2 — policy↔graph referential integrity (codified 2026-09-12)", () => {
  // ⚠️ NOTHING checked this before. A typo'd edge id in a policy row (`F4O` for `F40`)
  // leaves that row permanently unreachable by Phase 3's derivation — the row simply
  // never matches, the lookup falls through to whatever its default is, and every
  // structural test in both files still passes. The failure mode is a SILENTLY WRONG
  // VERDICT, which is precisely what this milestone exists to prevent.
  //
  // Measured at codify time: 42 edge-id references across the matrix, 0 dangling.

  it("resolves every edgeIds reference to a real edge in the graph", () => {
    const dangling: string[] = [];
    let references = 0;
    for (const row of POLICY_ROWS) {
      for (const id of row.edgeIds ?? []) {
        references++;
        if (!edgeById(id)) dangling.push(`${row.workflow}/${row.key} → ${id}`);
      }
    }
    expect(dangling).toEqual([]);
    // ⚠️ Guards the degenerate pass: with zero references the loop above is vacuous and
    // `dangling` is trivially empty.
    //
    // ⚠️ 42 → 49 at Phase 3 [2026-09-12]. The coverage survey found four rows whose keys
    // READ as step names while actually governing specific edges (task `verify (T5b/T5c
    // gate)`, product `vision scoping questions` / `roadmap review` / `research / arch /
    // wbs happy path`), so 7 edge ids were added. ⚠️ The integrity property never broke —
    // `dangling` stayed empty throughout; only the population grew. This test failing on
    // the count is the intended behavior: a deliberate widening must be acknowledged, not
    // absorbed silently.
    expect(references).toBe(49);
  });

  it("keeps each policy row's edgeIds inside its own workflow", () => {
    // A feature row pointing at an incident edge would type-check and resolve, but means
    // the transcription put a row under the wrong table.
    for (const row of POLICY_ROWS) {
      for (const id of row.edgeIds ?? []) {
        const edge = edgeById(id)!;
        // ⚠️ The session-boundary rows deliberately reference OTHER workflows' terminal
        // edges (F19/F21/T11/I10 → reflect) — that cross-reference is the exit chain's
        // whole point, so session-ops is exempted rather than the assertion weakened.
        if (row.workflow === "session-ops") continue;
        expect(`${row.key.slice(0, 30)} → ${id} (${edge.workflow})`).toBe(
          `${row.key.slice(0, 30)} → ${id} (${row.workflow})`,
        );
      }
    }
  });

  it("points the session-boundary chain at the four terminal-close edges", () => {
    // The exemption above is only safe if the cross-referenced ids are the intended ones.
    const row = POLICY_ROWS.find(
      (r) => r.workflow === "session-ops" && r.edgeIds?.includes("F19"),
    )!;
    expect([...row.edgeIds!].sort()).toEqual(["F19", "F21", "I10", "T11"]);
    for (const id of row.edgeIds!) {
      // Each is a terminal close in its own workflow — never dispatchable.
      expect(`${id}: ${edgeById(id)!.dispatchTarget.kind}`).toBe(
        `${id}: terminal`,
      );
    }
  });
});

describe("M15 WP2 Phase 2 — cellForMode is exhaustive over the four modes", () => {
  // ⚠️ The verify-self subagent proved the `never`-check live by mutation (omitting the
  // `confirm` arm produced `not assignable to type 'never'`), but that proof was
  // THROWAWAY. This makes the runtime half standing: every mode maps to a real column,
  // and no two modes alias the same column by accident.

  it("maps each of the four modes to its own distinct column", () => {
    // A row whose four columns are deliberately different, so aliasing is observable.
    const row = POLICY_ROWS.find(
      (r) => r.workflow === "feature" && r.key === "verify-human",
    )!;
    expect(cellForMode(row, "stepping").kind).toBe("pause");
    expect(cellForMode(row, "orchestrated").kind).toBe("pause");
    expect(cellForMode(row, "autopilot").kind).toBe("auto-skip");
    expect(cellForMode(row, "fsd").kind).toBe("skip-skill");
    // ⚠️ Positive control on the test itself: this row must actually distinguish the
    // columns, or the aliasing check above proves nothing.
    const kinds = DRIVE_MODES.map((m) => cellForMode(row, m).kind);
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("returns the same object identity the row holds, not a copy", () => {
    // Cheap, but it pins that cellForMode is a projection rather than a transformer —
    // a future refactor returning a normalized copy would break `resolveCell`'s
    // identity-preserving contract (tested above) silently.
    const row = POLICY_ROWS[0];
    expect(cellForMode(row, "stepping")).toBe(row.stepping);
    expect(cellForMode(row, "fsd")).toBe(row.fsd);
  });
});
