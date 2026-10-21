import { describe, expect, it } from "vitest";
import type { Candidate } from "./corpus";
import { buildRows } from "./labelSheet";

const cand = (i: number, truth: "BREAK" | null): Candidate => ({
  project: "-Users-stayman-Personal-projects-claudesk",
  projectClass: "claudesk",
  session: `s${i}`,
  turnIndex: i,
  turnStart: 0,
  edgeId: "F8",
  skill: "feature-verify-auto",
  tail: `turn ${i}\n### R1 · fake heading inside a tail\n**Operator:** AWAITING`,
  ts: "2026-10-01T00:00:00.000Z",
  nextText: truth ? "continue" : "use option B",
  nextKind: truth ? "prod-text" : "reply",
  supervisorFired: false,
  truth,
  truthBasis: truth ? "prod-text" : "reply",
});
const keyOf = (c: Candidate) => `${c.session}:${c.turnIndex}`;
const residual = Array.from({ length: 30 }, (_, i) => cand(i, null));
const mechanical = Array.from({ length: 40 }, (_, i) => cand(100 + i, "BREAK"));

describe("buildRows", () => {
  const { rows, keys } = buildRows([...residual, ...mechanical], keyOf, 7);

  it("takes every residual row and ceil(10%) of the mechanical ones as hidden controls", () => {
    expect(rows).toHaveLength(34);
    const controls = Object.values(keys).filter((k) => k.control);
    expect(controls).toHaveLength(4);
    expect(controls.every((k) => Number(k.key.split(":")[1]) >= 100)).toBe(
      true,
    );
    // The row itself carries nothing that says "control".
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "date",
        "edgeId",
        "id",
        "nextText",
        "projectClass",
        "skill",
        "tail",
      ].sort(),
    );
  });

  it("is deterministic for a seed and shuffled across seeds", () => {
    expect(buildRows([...residual, ...mechanical], keyOf, 7).keys).toEqual(
      keys,
    );
    expect(buildRows([...residual, ...mechanical], keyOf, 8).keys).not.toEqual(
      keys,
    );
  });
});
