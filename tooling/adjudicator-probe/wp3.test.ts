import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { score, type ScoreItem } from "./score";
import { frozenLabelsRefusal, scoredKeys, type WP3Answer } from "./wp3";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const row = (
  key: string,
  basis: WP3Answer["basis"],
  over: Partial<WP3Answer> = {},
): WP3Answer => ({
  key,
  run: 1,
  answer: basis === "model" ? "PROCEED" : null,
  basis,
  models: [],
  raw: "",
  candidate: "v5",
  hash: "h5",
  half: "heldOut",
  ...over,
});

describe("frozenLabelsRefusal", () => {
  const body = '{"labels":[]}\n';
  const record = `WIP prose … sha256 ${sha(body)} … more prose`;

  it("passes when the body hashes to a sha the record carries", () => {
    expect(frozenLabelsRefusal(body, record)).toBeNull();
  });

  it("refuses a body changed by one byte, naming the new hash", () => {
    const changed = `${body} `;
    expect(frozenLabelsRefusal(changed, record)).toBe(
      `labels.frozen.json hashes to ${sha(changed)}, which WP2's WIP does not record — refusing`,
    );
  });
});

describe("scoredKeys", () => {
  it("counts model, timeout and unparseable rows as done, but retries error and mismatch rows", () => {
    const done = scoredKeys(
      [
        row("model", "model"),
        row("timeout", "timeout"),
        row("unparseable", "unparseable"),
        row("error", "error"),
        row("mismatch", "model-mismatch"),
      ],
      "h5",
      "heldOut",
      1,
    );
    expect([...done].sort()).toEqual(["model", "timeout", "unparseable"]);
  });

  it("ignores rows of another candidate hash, half or run", () => {
    const done = scoredKeys(
      [
        row("otherHash", "model", { hash: "h4" }),
        row("otherHalf", "model", { half: "dev" }),
        row("otherRun", "model", { run: 2 }),
        row("mine", "model"),
      ],
      "h5",
      "heldOut",
      1,
    );
    expect([...done]).toEqual(["mine"]);
  });

  it("an error row's retry supersedes it in the score, so an outage cannot score as AWAITING", () => {
    const items: ScoreItem[] = [{ key: "k", truth: "BREAK", tail: "t" }];
    const outage = row("k", "error");
    expect(scoredKeys([outage], "h5", "heldOut", 1).has("k")).toBe(false);
    expect(score(items, [outage], 1).realBreaksPreserved.hits).toBe(0);
    const retried = [outage, row("k", "model")];
    expect(scoredKeys(retried, "h5", "heldOut", 1).has("k")).toBe(true);
    expect(score(items, retried, 1).realBreaksPreserved.hits).toBe(1);
  });
});
