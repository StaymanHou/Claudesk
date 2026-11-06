// M16.5 WP3 3.5 — re-measure a revised adjudicator question with a HELD-OUT split.
// Run on demand only (spawns `claude -p`, ~$0.005 a call warm):
//   pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts wp3 -t <step>
// Steps, each its own `it`:
//   split  → wp3-split.json: WP2's 291 scored rows split 50/50, stratified by truth, seeded.
//            ⚠️ Written ONCE: refuses to overwrite, so the split cannot be re-rolled after a peek.
//   tune   → WP3_CANDIDATE=<name>: scores the DEV half only, appends to wp3-answers.jsonl.
//   final  → WP3_CANDIDATE=<name> WP3_FINAL=1: scores the HELD-OUT half, runs 1–3. ⚠️ Refuses
//            unless the candidate's hash (`candidates.ts`) is already written in the WIP, which
//            is what makes "the prompt was chosen before the held-out half was seen" checkable.
//   report → wp3-report.json: per candidate, per half, per run, both axes + the AC-18 verdict.
//
// ⚠️ THE TRUTH IS THE OPERATOR'S (WP2's frozen labels via `score-set.json`), never the policy
// table's, so no score is 1.000 by identity (`[[detector-scored-against-its-own-table-is-circular]]`).

import { it } from "vitest";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CANDIDATES, candidateHash } from "./candidates";
import { mulberry32, shuffle } from "./labelSheet";
import { adjudicateOnce } from "./runner";
import { distinctRuns, score, type ScoreItem } from "./score";
import { frozenLabelsRefusal, scoredKeys, type WP3Answer } from "./wp3";
import { OUT, wipOrArchive } from "./paths";

const WIP = "m16-5-wp3-supervisor-correctness.md";
const SPLIT = join(OUT, "wp3-split.json");
const ANSWERS = join(OUT, "wp3-answers.jsonl");
// WP2 recorded the frozen labels' sha256 in its WIP.
const WP2_WIP = "m16-5-wp2-adjudicator-remeasure.md";
const SEED = 20261026;
const CONCURRENCY = 4;

interface Split {
  readonly seed: number;
  readonly dev: string[];
  readonly heldOut: string[];
}

const items = (): ScoreItem[] =>
  (
    JSON.parse(readFileSync(join(OUT, "score-set.json"), "utf8")) as {
      items: ScoreItem[];
    }
  ).items;

const readSplit = (): Split => JSON.parse(readFileSync(SPLIT, "utf8")) as Split;

function readAnswers(): WP3Answer[] {
  if (!existsSync(ANSWERS)) return [];
  return readFileSync(ANSWERS, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as WP3Answer);
}

/** Refuse unless the frozen labels still hash to what WP2 recorded (`frozenLabelsRefusal`). */
function assertFrozenLabels(): void {
  const refusal = frozenLabelsRefusal(
    readFileSync(join(OUT, "labels.frozen.json"), "utf8"),
    readFileSync(wipOrArchive(WP2_WIP), "utf8"),
  );
  if (refusal) throw new Error(refusal);
}

it("split", () => {
  assertFrozenLabels();
  if (existsSync(SPLIT))
    throw new Error(
      `${SPLIT} exists — the split is written once and never re-rolled`,
    );
  // ONE generator across both strata, in this order, so the split matches the recorded seed.
  const next = mulberry32(SEED);
  const dev: string[] = [];
  const heldOut: string[] = [];
  for (const truth of ["AWAITING", "BREAK"] as const) {
    const keys = shuffle(
      items()
        .filter((i) => i.truth === truth)
        .map((i) => i.key)
        .sort(),
      next,
    );
    const half = Math.ceil(keys.length / 2);
    dev.push(...keys.slice(0, half));
    heldOut.push(...keys.slice(half));
  }
  writeFileSync(SPLIT, JSON.stringify({ seed: SEED, dev, heldOut }, null, 1));
  console.log(
    `split: dev ${dev.length}, held-out ${heldOut.length}, seed ${SEED}`,
  );
});

async function scoreHalf(
  candidate: string,
  half: "dev" | "heldOut",
  run: number,
): Promise<void> {
  assertFrozenLabels();
  const build = CANDIDATES[candidate];
  if (!build) throw new Error(`unknown candidate "${candidate}"`);
  const hash = candidateHash(candidate);
  const keys = new Set(readSplit()[half]);
  const done = scoredKeys(readAnswers(), hash, half, run);
  const todo = items().filter((i) => keys.has(i.key) && !done.has(i.key));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const item = todo[next++];
      const a = await adjudicateOnce(item.key, run, build(item.tail));
      const row: WP3Answer = { ...a, candidate, hash, half };
      appendFileSync(ANSWERS, `${JSON.stringify(row)}\n`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

it("tune", async () => {
  const candidate = process.env.WP3_CANDIDATE;
  if (!candidate) throw new Error("set WP3_CANDIDATE");
  await scoreHalf(candidate, "dev", Number(process.env.WP3_RUN ?? "1"));
});

it("final", async () => {
  const candidate = process.env.WP3_CANDIDATE;
  if (!candidate || process.env.WP3_FINAL !== "1")
    throw new Error("set WP3_CANDIDATE and WP3_FINAL=1");
  const hash = candidateHash(candidate);
  if (!readFileSync(wipOrArchive(WIP), "utf8").includes(hash))
    throw new Error(
      `candidate "${candidate}" (${hash}) is not recorded in the WIP — record the choice before the held-out run`,
    );
  for (const run of [1, 2, 3]) await scoreHalf(candidate, "heldOut", run);
});

it("report", () => {
  const split = readSplit();
  const all = items();
  const answers = readAnswers();
  const groups = new Map<string, WP3Answer[]>();
  for (const a of answers) {
    const g = `${a.candidate}|${a.hash}|${a.half}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(a);
  }
  const report = [...groups.entries()].map(([g, as]) => {
    const [candidate, hash, half] = g.split("|") as [
      string,
      string,
      "dev" | "heldOut",
    ];
    const keys = new Set(split[half]);
    const its = all.filter((i) => keys.has(i.key));
    const runs = distinctRuns(as);
    const scores = runs.map((r) => score(its, as, r));
    const mean = (f: (s: (typeof scores)[number]) => number) =>
      scores.reduce((t, s) => t + f(s), 0) / scores.length;
    const waits = mean((s) => s.wrongFireRecall.rate);
    const breaks = mean((s) => s.realBreaksPreserved.rate);
    return {
      candidate,
      hash,
      half,
      runs: scores.map((s) => ({
        run: s.run,
        scored: s.scored,
        missing: s.missing.length,
        waitsHeld: `${s.wrongFireRecall.hits}/${s.wrongFireRecall.n}`,
        breaksFired: `${s.realBreaksPreserved.hits}/${s.realBreaksPreserved.n}`,
        waitsHeldCi95: s.wrongFireRecall.ci95,
        breaksFiredCi95: s.realBreaksPreserved.ci95,
        failedCalls: s.failedCalls,
      })),
      meanWaitsHeld: waits,
      meanBreaksFired: breaks,
      // AC-18 (operator, 2026-10-26): ≥0.80 on both axes AND waits held ≥0.85, mean of 3 runs.
      shipBar: waits >= 0.85 && breaks >= 0.8,
    };
  });
  writeFileSync(join(OUT, "wp3-report.json"), JSON.stringify(report, null, 1));
  for (const r of report)
    console.log(
      `${r.candidate} (${r.hash}) ${r.half}: waits ${r.meanWaitsHeld.toFixed(3)} breaks ${r.meanBreaksFired.toFixed(3)} runs ${r.runs.length} → shipBar ${r.shipBar}`,
    );
});
