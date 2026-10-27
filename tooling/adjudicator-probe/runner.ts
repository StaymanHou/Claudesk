// The production-shaped adjudicator call, shared by the WP2 scorer (`score.probe.ts`) and the
// WP3 re-measurement (`wp3.probe.ts`). Moved here at M16.5 WP3 so a candidate prompt can be
// scored through the SAME call the shipped prompt was scored through.
//
// ⚠️ PRODUCTION-SHAPED. `claude -p --model <ADJUDICATOR_MODEL> --output-format json` with:
// - cwd `/`, the installed app's spawn directory, so no project CLAUDE.md enters the context;
// - every `CLAUDE*` / `CLAUDESK*` variable stripped, so a parent session's effort, markers or
//   hook socket cannot leak into the child (the app's own spawn has none of them);
// - `--no-session-persistence`, so hundreds of judgments do not land in the transcript corpus.
// The reply is parsed with the real `parseAdjudication`.

import { spawn } from "node:child_process";
import {
  ADJUDICATOR_MODEL,
  ADJUDICATOR_TIMEOUT_MS,
  parseAdjudication,
} from "../../src/state/supervisor/adjudicator";
import type { Answer } from "./score";

/** Every variable a parent Claude Code session or a Claudesk PTY sets, removed. */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env))
    if (!/^(CLAUDE|CLAUDESK)/.test(k)) env[k] = v;
  return env;
}

/** Ask the pinned model one prompt; never rejects (a failure is an Answer with a null answer). */
export function adjudicateOnce(
  key: string,
  run: number,
  prompt: string,
): Promise<Answer> {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--model",
        ADJUDICATOR_MODEL,
        "--output-format",
        "json",
        "--no-session-persistence",
      ],
      { cwd: "/", env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, ADJUDICATOR_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", () => {
      clearTimeout(timer);
      const base = { key, run, models: [] as string[], raw: out.slice(0, 400) };
      if (timedOut) return resolve({ ...base, answer: null, basis: "timeout" });
      try {
        const j = JSON.parse(out) as {
          result?: string;
          is_error?: boolean;
          modelUsage?: Record<string, unknown>;
        };
        const models = Object.keys(j.modelUsage ?? {});
        if (j.is_error || typeof j.result !== "string")
          return resolve({ ...base, models, answer: null, basis: "error" });
        const parsed = parseAdjudication(j.result);
        resolve({
          ...base,
          models,
          raw: j.result.slice(0, 200),
          answer: parsed,
          basis: parsed === null ? "unparseable" : "model",
        });
      } catch {
        resolve({ ...base, answer: null, basis: "error" });
      }
    });
    child.stdin.end(prompt);
  });
}
