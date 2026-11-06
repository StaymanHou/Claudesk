// M16.5 WP2 Phase 3 — the live score (WIP P3.1–P3.2). Steps, each its own `it`:
//   set    → score-set.json: every frozen AWAITING/BREAK row + every mechanical BREAK not on the
//            sheet, minus policy-excluded workflows. ⚠️ Refuses unless labels.frozen.json still
//            hashes to the sha256 recorded in the WIP (the labels predate every answer).
//   score  → appends run WP2_RUN (default 1) to answers.jsonl, resuming where it stopped.
//   report → score-report.json: per run, both axes, Wilson intervals, bars, flip rate, models.
//
// ⚠️ PRODUCTION-SHAPED CALLS. The real `adjudicationPrompt` over stdin and the real
// `parseAdjudication`, run as `claude -p --model <ADJUDICATOR_MODEL>` with:
// - cwd `/`, the installed app's spawn directory, so no project CLAUDE.md enters the context;
// - every `CLAUDE*` / `CLAUDESK*` variable stripped, so a parent session's effort, markers or
//   hook socket cannot leak into the child (the app's own spawn has none of them);
// - `--output-format json` only to read the RESOLVED model id (the pin is an alias), and
//   `--no-session-persistence` so ~300 judgments do not land in the transcript corpus.

import { it } from "vitest";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { adjudicationPrompt } from "../../src/state/supervisor/adjudicator";
import { adjudicateOnce } from "./runner";
import type { Candidate } from "./corpus";
import type { SheetRow } from "./labelSheet";
import { keyOf } from "./redact";
import {
  BARS,
  distinctRuns,
  flipRate,
  isRetryable,
  score,
  type Answer,
  type ScoreItem,
} from "./score";
import { isPolicyExcluded } from "./triage";
import { OUT, wipOrArchive } from "./paths";
import { frozenLabelsRefusal } from "./wp3";

// WP2's WIP records the frozen labels' sha256; it is in `archive/` once finalize has run.
const WP2_WIP = "m16-5-wp2-adjudicator-remeasure.md";
const CONCURRENCY = 4;

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(OUT, name), "utf8")) as T;

interface Frozen {
  labels: { id: string; key: string; label: string; source: string }[];
}

it("set", () => {
  const body = readFileSync(join(OUT, "labels.frozen.json"), "utf8");
  const refusal = frozenLabelsRefusal(
    body,
    readFileSync(wipOrArchive(WP2_WIP), "utf8"),
  );
  if (refusal) throw new Error(refusal);
  const sha = createHash("sha256").update(body).digest("hex");
  const frozen = JSON.parse(body) as Frozen;
  const rows = new Map(read<SheetRow[]>("rows.json").map((r) => [r.id, r]));
  const { candidates, m15Truth } = read<{
    candidates: Candidate[];
    m15Truth: Record<string, string>;
  }>("candidates.json");
  const m15Of = (c: Candidate) =>
    m15Truth[`${c.session.slice(0, 8)}:${c.turnIndex}`];
  const byKey = new Map(candidates.map((c) => [keyOf(c), c]));
  const onSheet = new Set(frozen.labels.map((l) => l.key));

  const items: (ScoreItem & { source: string; edgeId: string })[] = [];
  for (const l of frozen.labels) {
    if (l.label !== "AWAITING" && l.label !== "BREAK") continue;
    const c = byKey.get(l.key)!;
    items.push({
      key: l.key,
      truth: l.label,
      tail: rows.get(l.id)!.tail,
      source: l.source,
      edgeId: c.edgeId,
      ...(m15Of(c) ? { m15Truth: m15Of(c) } : {}),
    });
  }
  for (const c of candidates) {
    const k = keyOf(c);
    if (c.truth !== "BREAK" || onSheet.has(k) || isPolicyExcluded(c.edgeId))
      continue;
    items.push({
      key: k,
      truth: "BREAK",
      tail: c.tail,
      source: `mechanical:${c.truthBasis}`,
      edgeId: c.edgeId,
      ...(m15Of(c) ? { m15Truth: m15Of(c) } : {}),
    });
  }
  writeFileSync(
    join(OUT, "score-set.json"),
    JSON.stringify({ frozenSha256: sha, items }, null, 1),
  );
});

function readAnswers(): Answer[] {
  const path = join(OUT, "answers.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Answer);
}

it("score", async () => {
  const run = Number(process.env.WP2_RUN ?? "1");
  const { items } = read<{ items: ScoreItem[] }>("score-set.json");
  const done = new Set(
    readAnswers()
      .filter((a) => a.run === run && !isRetryable(a))
      .map((a) => a.key),
  );
  // WP2_LIMIT caps a run for a smoke test; the rest resumes on the next invocation.
  const todo = items
    .filter((i) => !done.has(i.key))
    .slice(0, Number(process.env.WP2_LIMIT ?? Infinity));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const item = todo[next++];
      const a = await adjudicateOnce(
        item.key,
        run,
        adjudicationPrompt(item.tail),
      );
      appendFileSync(join(OUT, "answers.jsonl"), `${JSON.stringify(a)}\n`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
});

it("report", () => {
  const { items, frozenSha256 } = read<{
    items: (ScoreItem & { source: string })[];
    frozenSha256: string;
  }>("score-set.json");
  const answers = readAnswers();
  const runs = distinctRuns(answers);
  const models: Record<string, number> = {};
  for (const a of answers)
    for (const m of a.models) models[m] = (models[m] ?? 0) + 1;
  const m15 = items.filter(
    (i) => i.m15Truth === "AWAITING" || i.m15Truth === "BREAK",
  );
  const report = {
    frozenSha256,
    items: items.length,
    truth: {
      AWAITING: items.filter((i) => i.truth === "AWAITING").length,
      BREAK: items.filter((i) => i.truth === "BREAK").length,
    },
    bars: BARS,
    models,
    runs: runs.map((r) => score(items, answers, r)),
    flip: runs.length >= 2 ? flipRate(answers, runs) : null,
    // The M15 subset on IDENTICAL inputs, scored against M15's own truth and against the new truth.
    m15Subset: runs.map((r) => ({
      run: r,
      againstM15Truth: score(
        m15.map((i) => ({ ...i, truth: i.m15Truth as ScoreItem["truth"] })),
        answers,
        r,
      ),
      againstNewTruth: score(m15, answers, r),
    })),
  };
  writeFileSync(
    join(OUT, "score-report.json"),
    JSON.stringify(report, null, 1),
  );
});
