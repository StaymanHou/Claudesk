import { describe, expect, it } from "vitest";
import type { Candidate } from "./corpus";
import { joinSeeds, type M15Seed } from "./seedJoin";

const cand = (turnIndex: number, over: Partial<Candidate> = {}): Candidate => ({
  project: "-Users-stayman-Personal-projects-claudesk",
  projectClass: "claudesk",
  session: "d0a276b5-aaaa",
  turnIndex,
  turnStart: 478,
  edgeId: "F9b",
  skill: "feature-build",
  tail: "TRANSITION: F9b",
  ts: null,
  nextText: "continue",
  nextKind: "prod-text",
  supervisorFired: false,
  truth: "BREAK",
  truthBasis: "prod-text",
  ...over,
});
const seed = (
  turnIndex: number,
  truth: M15Seed["truth"],
  edgeId = "F9b",
): M15Seed => ({
  session8: "d0a276b5",
  turnIndex,
  edgeId,
  truth,
});

describe("joinSeeds", () => {
  it("joins an exact (session, line) match and carries its truth", () => {
    const { m15, m15Truth } = joinSeeds([seed(563, "BREAK")], [cand(563)]);
    expect(m15).toMatchObject({
      total: 1,
      refound: 1,
      notRefound: [],
      disagreements: [],
    });
    expect(m15Truth).toEqual({ "d0a276b5:563": "BREAK" });
  });

  it("falls back to the same-edge candidate whose turn contains the seed line", () => {
    const { m15, m15Truth } = joinSeeds([seed(556, "UNKNOWN")], [cand(563)]);
    expect(m15.refoundInTurn).toEqual(["d0a276b5:556 → d0a276b5:563"]);
    expect(m15Truth).toEqual({ "d0a276b5:563": "UNKNOWN" });
  });

  it("does not fall back across a turn boundary or onto another edge", () => {
    const outside = joinSeeds([seed(470, "BREAK")], [cand(563)]); // before turnStart 478
    const otherEdge = joinSeeds([seed(556, "BREAK", "F8")], [cand(563)]);
    expect(outside.m15.notRefound).toEqual(["d0a276b5:470 F9b (m15 BREAK)"]);
    expect(otherEdge.m15.notRefound).toHaveLength(1);
  });

  // The live case: M15 had TWO records for one turn, with conflicting truths. The exact match must
  // win whatever order the seeds arrive in, and the other is recorded, not silently dropped.
  it.each([
    [[seed(556, "UNKNOWN"), seed(563, "AWAITING")]],
    [[seed(563, "AWAITING"), seed(556, "UNKNOWN")]],
  ])(
    "keeps the exact match's truth when M15 counted a turn twice (%#)",
    (seeds) => {
      const { m15, m15Truth } = joinSeeds(seeds, [cand(563)]);
      expect(m15Truth).toEqual({ "d0a276b5:563": "AWAITING" });
      expect(m15.duplicateTurns).toEqual([
        "d0a276b5:556 (m15 UNKNOWN) is the same turn as d0a276b5:563 (m15 AWAITING)",
      ]);
      expect(
        m15.refound + m15.duplicateTurns.length + m15.notRefound.length,
      ).toBe(m15.total);
    },
  );

  it("lists both disagreement directions instead of overwriting", () => {
    const { m15 } = joinSeeds(
      [seed(10, "BREAK"), seed(20, "AWAITING")],
      [
        cand(10, { truth: null, truthBasis: "reply" }),
        cand(20, {
          turnStart: 15,
          truth: "BREAK",
          truthBasis: "prod-complaint",
        }),
      ],
    );
    expect(m15.disagreements).toEqual([
      "d0a276b5:10 F9b: m15 BREAK, now residual (reply)",
      "d0a276b5:20 F9b: m15 AWAITING, now BREAK (prod-complaint)",
    ]);
  });
});
