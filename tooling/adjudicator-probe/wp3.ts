// M16.5 WP3 3.5 — the pure halves of `wp3.probe.ts`, extracted so the unit gate can drive them
// (the probe file itself is excluded from `verify:auto` because it spawns `claude -p`).

import { createHash } from "node:crypto";
import type { Answer } from "./score";

export interface WP3Answer extends Answer {
  readonly candidate: string;
  readonly hash: string;
  readonly half: "dev" | "heldOut";
}

/**
 * The refusal message when `labels.frozen.json`'s body no longer hashes to a sha256 the record
 * (WP2's WIP) carries, else null. `score-set.json` is derived from the frozen labels, so a
 * re-labelled set would otherwise score silently against new truth.
 */
export function frozenLabelsRefusal(
  body: string,
  record: string,
): string | null {
  const sha = createHash("sha256").update(body).digest("hex");
  return record.includes(sha)
    ? null
    : `labels.frozen.json hashes to ${sha}, which WP2's WIP does not record — refusing`;
}

/**
 * The keys already scored for one candidate, half and run, so a re-run scores only the rest.
 * ⚠️ An `error` row is RETRIED, not done: a usage-limit outage returns `is_error` with zero
 * tokens and scores as AWAITING, which measured the account instead of the prompt (v3 lost 37
 * rows, v4 all 146, on 2026-10-26). `score()` keeps the LAST answer per key, so a retry supersedes.
 */
export function scoredKeys(
  answers: readonly WP3Answer[],
  hash: string,
  half: WP3Answer["half"],
  run: number,
): Set<string> {
  return new Set(
    answers
      .filter(
        (a) =>
          a.hash === hash &&
          a.half === half &&
          a.run === run &&
          a.basis !== "error",
      )
      .map((a) => a.key),
  );
}
