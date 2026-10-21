// M16.5 WP2 — THE ADJUDICATOR RE-MEASUREMENT, CODIFIED (R-6 condition 3).
//
// ═══════════════════════════════════════════════════════════════════════════════
// This replays the committed evidence — `wp2-adjudicator-set.json`, 291 scored turns with the
// operator's frozen labels and the pinned model's recorded answers — through the real scorer.
// It makes NO live call: the answers are frozen evidence, like `verdictReplay.test.ts`'s fixture.
//
// ⚠️ WHAT IT PINS IS THE VERDICT, NOT A TARGET. On 2026-10-21 the shipped adjudicator (the
// shipped prompt, `sonnet` → `claude-sonnet-5-5`) held 95/103 AWAITING turns but let only
// 126/188 real breaks fire, so it FAILS R-6's 0.80/0.80 bar on the break axis. A change to the
// prompt or the model makes these recorded answers stale; the remedy is to re-run the probe
// (`tooling/adjudicator-probe/`) and replace the set, never to edit the expected numbers here.
//
// ⚠️ NON-CIRCULAR BY CONSTRUCTION. Every scored truth is the operator's (a card review, a ruling,
// or both blind readers agreeing on AWAITING/SKIP) or a mechanical content-free prod that the
// hidden controls validated at 15/16. None comes from the policy table, so the score cannot be
// 1.000 by identity (`[[detector-scored-against-its-own-table-is-circular]]`).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  score,
  type Answer,
  type ScoreItem,
} from "../../../../tooling/adjudicator-probe/score";

const SET_PATH = resolve(
  __dirname,
  "../../../../workflow-system/product/wp2-adjudicator-set.json",
);

interface CommittedRecord {
  key: string;
  edgeId: string;
  labelSource?: string;
  truthBasis: string;
  scoredTruth?: "AWAITING" | "BREAK";
  answers?: string[];
}

const { records } = JSON.parse(readFileSync(SET_PATH, "utf8")) as {
  records: CommittedRecord[];
};
const scored = records.filter((r) => r.scoredTruth !== undefined);
const items: ScoreItem[] = scored.map((r) => ({
  key: r.key,
  truth: r.scoredTruth!,
  tail: "",
}));
const answers: Answer[] = scored.flatMap((r) =>
  (r.answers ?? []).map((a, i) => ({
    key: r.key,
    run: i + 1,
    answer: a === "AWAITING" || a === "PROCEED" ? a : null,
    basis: a === "AWAITING" || a === "PROCEED" ? "model" : "error",
    models: [],
    raw: "",
  })),
);

describe("the adjudicator re-measurement (M16.5 WP2, frozen evidence)", () => {
  it("is the set the probe scored: 291 turns, 103 AWAITING / 188 BREAK, three runs each", () => {
    expect(scored).toHaveLength(291);
    expect(scored.filter((r) => r.scoredTruth === "AWAITING")).toHaveLength(
      103,
    );
    expect(scored.every((r) => r.answers?.length === 3)).toBe(true);
  });

  it("takes no truth from the policy table, and scores no product or incident turn", () => {
    const allowed = new Set(["operator", "operator-ruling", "readers-agree"]);
    for (const r of scored) {
      if (r.labelSource !== undefined) expect(allowed).toContain(r.labelSource);
      else expect(r.truthBasis).toMatch(/^prod-(text|command|complaint)$/);
      expect(r.edgeId).not.toMatch(/^[PI]/);
    }
  });

  it("run 1 — what production does — holds 95/103 waits and fires 126/188 breaks", () => {
    const s = score(items, answers, 1);
    expect(s.missing).toEqual([]);
    expect(s.wrongFireRecall).toMatchObject({ n: 103, hits: 95 });
    expect(s.realBreaksPreserved).toMatchObject({ n: 188, hits: 126 });
  });

  it("fails R-6's bar on the break axis at 0.75, 0.80 and 0.85, in every run", () => {
    for (const run of [1, 2, 3]) {
      const s = score(items, answers, run);
      expect(s.wrongFireRecall.rate).toBeGreaterThan(0.85);
      expect(s.realBreaksPreserved.rate).toBeLessThan(0.7);
      expect(Object.values(s.bars).every((b) => !b.pass)).toBe(true);
    }
  });
});
