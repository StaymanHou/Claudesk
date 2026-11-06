// M16.5 WP3 3.1 — the token-contract replay (WIP P1.5). Run on demand:
//   pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts tokenSplit
//
// For every turn in the local CC corpus whose verdict-bearing message carries `TRANSITION:`,
// read the turn twice: with the REAL `readTurn` (the emitted-token rule,
// `extractEmittedTransitionId`), and with the pre-3.1 rule
// (the last `TRANSITION:` anywhere in the message), reimplemented below as the baseline.
// Writes `OUT/token-split.json` (`paths.ts`) and prints the split. Every turn the new
// rule withholds is listed with its offending line, so the real verdicts it loses can be read.

import { it } from "vitest";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  isUserProseTurn,
  parseTranscript,
  readTurn,
  type TranscriptLine,
} from "../../src/state/supervisor/transcript";
import { extractTransitionId } from "../../src/state/workflowMachine/transitionToken";
import { OUT, PROJECTS } from "./paths";

/** Only turns that ended on or after this date (the 21-day window of the original count). */
const SINCE = process.env.WP3_SINCE ?? "2026-10-05";

function text(line: TranscriptLine): string {
  if (line.type !== "assistant") return "";
  const c = line.message?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter(
      (b): b is { type: string; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "text",
    )
    .map((b) => b.text)
    .join("\n");
}

/** The pre-3.1 reader's token rule: last `TRANSITION:` anywhere in the newest message. */
function oldEdge(
  turn: readonly TranscriptLine[],
): { id: string; msg: string } | null {
  for (let i = turn.length - 1; i > 0; i--) {
    const t = text(turn[i]);
    if (!t.includes("TRANSITION:")) continue;
    const id = extractTransitionId(t.slice(t.lastIndexOf("TRANSITION:")));
    if (id) return { id, msg: t };
  }
  return null;
}

function* transcripts(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!existsSync(p)) continue; // a dangling symlink (e.g. a memory link)
    const s = statSync(p);
    if (s.isDirectory()) yield* transcripts(p);
    else if (name.endsWith(".jsonl")) yield p;
  }
}

it("tokenSplit", () => {
  if (!existsSync(PROJECTS)) throw new Error(`no corpus at ${PROJECTS}`);
  let turns = 0;
  const same: string[] = [];
  const withheld: {
    file: string;
    old: string;
    line: string;
    lastLine: boolean;
    fenced: boolean;
    after: string;
  }[] = [];
  const changed: { file: string; old: string; now: string; line: string }[] =
    [];
  const gained: { file: string; now: string }[] = [];

  for (const file of transcripts(PROJECTS)) {
    if (file.includes("/subagents/")) continue;
    const lines = parseTranscript(
      readFileSync(file, "utf8").split("\n"),
    ).filter((l) => !(l as { isSidechain?: boolean }).isSidechain);
    const starts: number[] = [];
    lines.forEach((l, i) => isUserProseTurn(l) && starts.push(i));
    for (let k = 0; k < starts.length; k++) {
      const turn = lines.slice(
        starts[k],
        k + 1 < starts.length ? starts[k + 1] : lines.length,
      );
      const ts =
        (turn[turn.length - 1] as { timestamp?: string }).timestamp ?? "";
      if (ts < SINCE) continue;
      const before = oldEdge(turn);
      const now = readTurn(turn).edgeId;
      if (before === null && now === null) continue;
      turns++;
      if (before === null) gained.push({ file, now: now! });
      else if (now === null) {
        const msgLines = before.msg.split("\n");
        const nonEmpty = msgLines.filter((l) => l.trim() !== "");
        const idx = msgLines
          .map((l) => l.includes("TRANSITION:"))
          .lastIndexOf(true);
        const line = msgLines[idx] ?? "";
        const fences = msgLines
          .slice(0, idx)
          .filter((l) => /^\s*(```|~~~)/.test(l)).length;
        withheld.push({
          file,
          old: before.id,
          line: line.slice(0, 240),
          lastLine: line === nonEmpty[nonEmpty.length - 1],
          fenced: fences % 2 === 1,
          after: msgLines
            .slice(idx + 1)
            .join("\n")
            .trim()
            .slice(0, 120),
        });
      } else if (now !== before.id) {
        const line =
          before.msg
            .split("\n")
            .reverse()
            .find((l) => l.includes("TRANSITION:")) ?? "";
        changed.push({ file, old: before.id, now, line: line.slice(0, 240) });
      } else same.push(now);
    }
  }

  const report = {
    since: SINCE,
    turns,
    same: same.length,
    withheld: withheld.length,
    changed: changed.length,
    gained: gained.length,
    withheldRows: withheld,
    changedRows: changed,
    gainedRows: gained,
  };
  writeFileSync(join(OUT, "token-split.json"), JSON.stringify(report, null, 2));
  console.log(
    `since ${SINCE}: ${turns} token-bearing turns · same ${same.length} · withheld ${withheld.length} · changed ${changed.length} · gained ${gained.length}`,
  );
  for (const w of withheld) console.log(`  WITHHELD ${w.old}: ${w.line}`);
  for (const c of changed)
    console.log(`  CHANGED ${c.old}→${c.now}: ${c.line}`);
});
