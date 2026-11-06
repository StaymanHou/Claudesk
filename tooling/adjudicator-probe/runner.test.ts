import { describe, expect, it } from "vitest";
import { ADJUDICATOR_MODEL } from "../../src/state/supervisor/adjudicator";
import { claudeJsonReply } from "../../src/state/supervisor/__tests__/adjudicatorReply";
import { adjudicateOnce, answerFromReply } from "./runner";

const classify = (stdout: string, timedOut = false) =>
  answerFromReply("k", 1, stdout, timedOut);

describe("answerFromReply", () => {
  it("parses the pinned model's answer", () => {
    expect(classify(claudeJsonReply("PROCEED"))).toMatchObject({
      answer: "PROCEED",
      basis: "model",
      models: [ADJUDICATOR_MODEL],
      raw: "PROCEED",
    });
  });

  it("an editorializing reply is unparseable, not an answer", () => {
    expect(classify(claudeJsonReply("PROCEED, probably"))).toMatchObject({
      answer: null,
      basis: "unparseable",
    });
  });

  it("⚠️ a DIFFERENT model's answer is a model-mismatch, never a measurement", () => {
    expect(
      classify(claudeJsonReply("PROCEED", ["claude-sonnet-6"])),
    ).toMatchObject({
      answer: null,
      basis: "model-mismatch",
      models: ["claude-sonnet-6"],
    });
  });

  it("⚠️ an EXTRA model beside the pin is a model-mismatch too", () => {
    expect(
      classify(
        claudeJsonReply("PROCEED", [ADJUDICATOR_MODEL, "claude-haiku-5-5"]),
      ).basis,
    ).toBe("model-mismatch");
  });

  it("a reply naming no model is a model-mismatch", () => {
    expect(classify(claudeJsonReply("PROCEED", [])).basis).toBe(
      "model-mismatch",
    );
  });

  it("CC's own error flag and non-JSON stdout are errors", () => {
    expect(
      classify(claudeJsonReply("usage limit", [ADJUDICATOR_MODEL], true)),
    ).toMatchObject({ answer: null, basis: "error" });
    expect(classify("not json")).toMatchObject({
      answer: null,
      basis: "error",
      raw: "not json",
    });
  });

  it("a timeout wins over whatever was printed", () => {
    expect(classify(claudeJsonReply("PROCEED"), true)).toMatchObject({
      answer: null,
      basis: "timeout",
    });
  });
});

describe("adjudicateOnce", () => {
  it("a binary that cannot be spawned resolves as an error instead of hanging", async () => {
    const a = await adjudicateOnce(
      "k",
      3,
      "prompt",
      "/nonexistent/claudesk-probe-no-such-binary",
    );
    expect(a).toMatchObject({ key: "k", run: 3, answer: null, basis: "error" });
    expect(a.raw).toContain("ENOENT");
  });
});
