// M16.5 WP3 3.2 — refresh the live transcript-close fixture. Run on demand, after a CC upgrade:
//   pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts transcriptFixture
//
// Finds the newest completed main-chain turn in `~/.claude/projects` (a user prose line, an
// assistant line with `stop_reason: end_turn`, then CC's `stop_hook_summary` and `turn_duration`
// close lines) and writes it to `src/state/supervisor/__tests__/fixtures/live-turn-close.jsonl`.
// `transcriptFormat.test.ts` then drives the real `isTurnComplete` over it, so a CC release that
// renames any of the three signals fails a test instead of silencing the supervisor.
//
// ⚠️ REDACTION BY WHITELIST, NOT BY DELETION. Only the structural fields the reader keys on are
// copied (`type`, `subtype`, `isSidechain`, `version`, `message.role`, `message.stop_reason`, the
// content block TYPES); every piece of prose is replaced with a fixed placeholder. A field
// nobody named cannot leak (`[[verify-redaction-by-what-remains]]`).

import { it } from "vitest";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { PROJECTS, REPO } from "./paths";

const OUT_FILE = join(
  REPO,
  "src/state/supervisor/__tests__/fixtures/live-turn-close.jsonl",
);

type Line = Record<string, unknown> & {
  type?: string;
  subtype?: string;
  isSidechain?: boolean;
  version?: string;
  message?: { role?: string; stop_reason?: string | null; content?: unknown };
};

function transcripts(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name !== "subagents") out.push(...transcripts(p));
    } else if (name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const isUserProse = (l: Line): boolean =>
  l.type === "user" && typeof l.message?.content === "string";

/** Copy only the structural fields; replace prose with placeholders. */
function redact(l: Line): Record<string, unknown> {
  const base = {
    type: l.type,
    ...(l.subtype === undefined ? {} : { subtype: l.subtype }),
    isSidechain: l.isSidechain ?? false,
    version: l.version,
  };
  if (l.type === "user") {
    return { ...base, message: { role: "user", content: "[redacted prompt]" } };
  }
  if (l.type === "assistant") {
    return {
      ...base,
      message: {
        role: "assistant",
        stop_reason: l.message?.stop_reason ?? null,
        content: [{ type: "text", text: "Done.\n\nTRANSITION: F8" }],
      },
    };
  }
  return base;
}

it("transcriptFixture", () => {
  const files = transcripts(PROJECTS)
    .map((f) => ({ f, m: statSync(f).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const { f } of files) {
    const lines: Line[] = [];
    for (const raw of readFileSync(f, "utf8").split("\n")) {
      try {
        if (raw.trim()) lines.push(JSON.parse(raw) as Line);
      } catch {
        // skip a torn line
      }
    }
    // Newest turn first: an assistant end_turn followed by both close lines before the next
    // user prose line.
    for (let i = lines.length - 1; i >= 0; i--) {
      const a = lines[i];
      if (
        a.type !== "assistant" ||
        a.isSidechain ||
        a.message?.stop_reason !== "end_turn"
      )
        continue;
      let user = -1;
      for (let j = i - 1; j >= 0; j--)
        if (isUserProse(lines[j])) {
          user = j;
          break;
        }
      const closes: Line[] = [];
      for (let j = i + 1; j < lines.length && !isUserProse(lines[j]); j++) {
        const sub = lines[j].subtype;
        if (
          lines[j].type === "system" &&
          (sub === "stop_hook_summary" || sub === "turn_duration")
        )
          closes.push(lines[j]);
      }
      const subs = closes.map((c) => c.subtype);
      if (
        user < 0 ||
        !subs.includes("stop_hook_summary") ||
        !subs.includes("turn_duration")
      )
        continue;
      const picked = [lines[user], a, ...closes].map(redact);
      writeFileSync(
        OUT_FILE,
        picked.map((l) => JSON.stringify(l)).join("\n") + "\n",
      );
      console.log(`wrote ${picked.length} lines from CC ${a.version} (${f})`);
      return;
    }
  }
  throw new Error("no completed main-chain turn with both close lines found");
});
