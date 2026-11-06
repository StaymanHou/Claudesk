import { describe, expect, it } from "vitest";
import {
  distinctRuns,
  effective,
  flipRate,
  isRetryable,
  score,
  wilson,
  type Answer,
  type ScoreItem,
} from "./score";

const item = (key: string, truth: ScoreItem["truth"]): ScoreItem => ({
  key,
  truth,
  tail: "t",
});
const ans = (
  key: string,
  answer: Answer["answer"],
  run = 1,
  basis: Answer["basis"] = answer === null ? "error" : "model",
): Answer => ({ key, run, answer, basis, models: ["m"], raw: "" });

describe("effective", () => {
  it("withholds on anything but an explicit PROCEED, as production does", () => {
    expect(effective(ans("k", "PROCEED"))).toBe("PROCEED");
    expect(effective(ans("k", "AWAITING"))).toBe("AWAITING");
    expect(effective(ans("k", null))).toBe("AWAITING");
  });
});

describe("wilson", () => {
  it("matches a known interval and degrades safely", () => {
    const [lo, hi] = wilson(25, 29);
    expect(lo).toBeCloseTo(0.6944, 3);
    expect(hi).toBeCloseTo(0.945, 3);
    expect(wilson(0, 0)).toEqual([0, 0]);
  });
});

describe("score", () => {
  const items = [
    item("a1", "AWAITING"),
    item("a2", "AWAITING"),
    item("a3", "AWAITING"),
    item("a4", "AWAITING"),
    item("b1", "BREAK"),
    item("b2", "BREAK"),
    item("b3", "BREAK"),
    item("b4", "BREAK"),
    item("x", "BREAK"),
  ];
  const answers = [
    ans("a1", "AWAITING"),
    ans("a2", "AWAITING"),
    ans("a3", null), // a failed call withholds: counts FOR wrong-fire recall
    ans("a4", "PROCEED"),
    ans("b1", "PROCEED"),
    ans("b2", "PROCEED"),
    ans("b3", "PROCEED"),
    ans("b4", null, 1, "timeout"), // …and AGAINST real breaks preserved
    ans("x", "PROCEED", 2), // another run's answer is not this run's
  ];
  const s = score(items, answers, 1);

  it("scores both axes the way production would act", () => {
    expect(s.wrongFireRecall).toMatchObject({ n: 4, hits: 3, rate: 0.75 });
    expect(s.realBreaksPreserved).toMatchObject({ n: 4, hits: 3, rate: 0.75 });
    expect(s.missing).toEqual(["x"]);
    expect(s.scored).toBe(8);
    expect(s.failedCalls).toMatchObject({ error: 1, timeout: 1 });
  });

  it("passes a bar only when BOTH axes clear it", () => {
    expect(s.bars["0.75"].pass).toBe(true);
    expect(s.bars["0.80"].pass).toBe(false);
    expect(s.bars["0.75"].lowerBoundsClear).toBe(false);
  });
});

describe("flipRate", () => {
  it("counts items whose effective answer differs across runs, over items answered in all", () => {
    const answers = [
      ans("k1", "PROCEED", 1),
      ans("k1", "PROCEED", 2),
      ans("k2", "PROCEED", 1),
      ans("k2", null, 2),
      ans("k3", "AWAITING", 1),
    ];
    expect(flipRate(answers, [1, 2])).toEqual({
      items: 2,
      flipped: 1,
      rate: 0.5,
    });
  });
});

describe("isRetryable", () => {
  it("retries a spawn/CC error and a model-mismatch; a timeout or unparseable reply is a measurement", () => {
    const bases: Answer["basis"][] = [
      "model",
      "error",
      "timeout",
      "unparseable",
      "model-mismatch",
    ];
    expect(bases.filter((basis) => isRetryable({ basis }))).toEqual([
      "error",
      "model-mismatch",
    ]);
  });

  it("a mismatch scores as withheld and is counted, so it can never pass as the pin's answer", () => {
    const s = score(
      [item("k", "BREAK")],
      [
        {
          key: "k",
          run: 1,
          answer: null,
          basis: "model-mismatch",
          models: ["claude-sonnet-6"],
          raw: "",
        },
      ],
      1,
    );
    expect(s.realBreaksPreserved.hits).toBe(0);
    expect(s.failedCalls["model-mismatch"]).toBe(1);
  });
});

describe("distinctRuns", () => {
  it("orders runs numerically, so run 10 follows run 9", () => {
    expect(distinctRuns([10, 2, 9, 1, 2].map((run) => ({ run })))).toEqual([
      1, 2, 9, 10,
    ]);
  });
});
