// M16.5 WP2 — build the committable set (WIP P1.6) from `OUT/candidates.json` (`paths.ts`).
// Re-run after each later phase; it carries whatever labels and answers exist by then.

import { it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adjudicationPrompt } from "../../src/state/supervisor/adjudicator";
import { TAIL_CHARS } from "../../src/state/supervisor/fanOut";
import type { Candidate } from "./corpus";
import { redact, redactionViolations } from "./redact";
import { COMMITTED_SET, OUT } from "./paths";

/** Every non-claudesk project's name segments, e.g. `Kenosis`, `ops-data-hub`. */
function forbiddenTokens(candidates: readonly Candidate[]): string[] {
  const out = new Set<string>(["/Users/", "Kenosis"]);
  for (const c of candidates) {
    if (c.projectClass === "claudesk") continue;
    const name = c.project.replace(
      /^-Users-stayman-(Personal-projects-|Personal-|Work-)?/,
      "",
    );
    if (name.length >= 4) out.add(name);
  }
  return [...out];
}

it("redact", () => {
  const src = JSON.parse(
    readFileSync(join(OUT, "candidates.json"), "utf8"),
  ) as {
    _meta: Record<string, unknown>;
    m15Truth: Record<string, string>;
    candidates: Candidate[];
  };
  // Phases 2–3 add, per record and only as workflow vocabulary: the frozen label and its source,
  // the scored truth (absent = not scored), and each run's answer. These are what the committed
  // replay test (`adjudicatorRemeasure.test.ts`) asserts over.
  const opt = <T>(name: string): T | undefined =>
    existsSync(join(OUT, name))
      ? (JSON.parse(readFileSync(join(OUT, name), "utf8")) as T)
      : undefined;
  const frozen = new Map(
    (
      opt<{ labels: { key: string; label: string; source: string }[] }>(
        "labels.frozen.json",
      )?.labels ?? []
    ).map((l) => [l.key, l]),
  );
  const scored = new Map(
    (
      opt<{ items: { key: string; truth: string }[] }>("score-set.json")
        ?.items ?? []
    ).map((i) => [i.key, i.truth]),
  );
  const answers = new Map<string, Record<number, string>>();
  const resolvedModels = new Set<string>();
  const answersPath = join(OUT, "answers.jsonl");
  if (existsSync(answersPath))
    for (const line of readFileSync(answersPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const a = JSON.parse(line) as {
        key: string;
        run: number;
        answer: string | null;
        models: string[];
      };
      for (const m of a.models) resolvedModels.add(m);
      if (!answers.has(a.key)) answers.set(a.key, {});
      answers.get(a.key)![a.run] = a.answer ?? "FAILED";
    }
  const records = src.candidates.map((c) => {
    const r = redact(
      c,
      src.m15Truth[`${c.session.slice(0, 8)}:${c.turnIndex}`],
    );
    const f = frozen.get(r.key);
    const runs = answers.get(r.key);
    return {
      ...r,
      ...(f ? { label: f.label, labelSource: f.source } : {}),
      ...(scored.has(r.key) ? { scoredTruth: scored.get(r.key) } : {}),
      ...(runs
        ? {
            answers: Object.keys(runs)
              .map(Number)
              .sort((a, b) => a - b)
              .map((n) => runs[n]),
          }
        : {}),
    };
  });
  const violations = redactionViolations(
    records,
    forbiddenTokens(src.candidates),
  );
  if (violations.length > 0)
    throw new Error(`redaction failed:\n${violations.slice(0, 20).join("\n")}`);

  // ⚠️ What the recorded answers measured. The replay test asserts these equal the live values,
  // so a changed prompt, tail length or pin fails it ("re-run the probe") instead of leaving it
  // green about an adjudicator that no longer ships. Run this right after `score`.
  if (resolvedModels.size > 1)
    throw new Error(
      `answers came from ${[...resolvedModels].join(", ")} — one set must measure one model`,
    );
  const measuredAgainst =
    resolvedModels.size === 1
      ? {
          promptSha256: createHash("sha256")
            .update(adjudicationPrompt(""))
            .digest("hex"),
          tailChars: TAIL_CHARS,
          model: [...resolvedModels][0],
        }
      : undefined;

  const { m15, ...meta } = src._meta as { m15: Record<string, unknown> };
  const out = {
    _meta: {
      ...meta,
      m15: { total: m15.total, refound: m15.refound },
      ...(measuredAgainst ? { measuredAgainst } : {}),
      redaction:
        "Only claudesk records carry tails and the operator's reply. Every other record keeps " +
        "workflow vocabulary and an opaque key; rebuild its text locally with mine.probe.ts.",
    },
    records,
  };
  writeFileSync(COMMITTED_SET, `${JSON.stringify(out, null, 1)}\n`);
});
