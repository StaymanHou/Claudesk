// The production-shaped adjudicator call, shared by the WP2 scorer (`score.probe.ts`) and the
// WP3 re-measurement (`wp3.probe.ts`). Moved here at M16.5 WP3 so a candidate prompt can be
// scored through the SAME call the shipped prompt was scored through.
//
// ⚠️ PRODUCTION-SHAPED. `claude -p --model <ADJUDICATOR_MODEL> --output-format json` with:
// - cwd `/`, the installed app's spawn directory, so no project CLAUDE.md enters the context;
// - every `CLAUDE*` / `CLAUDESK*` variable stripped, so a parent session's effort, markers or
//   hook socket cannot leak into the child (the app's own spawn has none of them);
// - `--no-session-persistence`, so hundreds of judgments do not land in the transcript corpus.
// The reply goes through production's own `parseReplyEnvelope`, `answeredByPinOnly` and
// `parseAdjudication`, so the probe accepts exactly the replies production would.

import { spawn } from "node:child_process";
import {
  ADJUDICATOR_MODEL,
  ADJUDICATOR_TIMEOUT_MS,
  answeredByPinOnly,
  parseAdjudication,
  parseReplyEnvelope,
} from "../../src/state/supervisor/adjudicator";
import type { Answer } from "./score";

/** Every variable a parent Claude Code session or a Claudesk PTY sets, removed. */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env))
    if (!/^(CLAUDE|CLAUDESK)/.test(k)) env[k] = v;
  return env;
}

/**
 * Classify one finished call. A reply from anything but the pin alone is `model-mismatch`, never
 * a measurement: scoring it would credit another model's answer to the pinned one.
 */
export function answerFromReply(
  key: string,
  run: number,
  stdout: string,
  timedOut: boolean,
): Answer {
  const base = { key, run, models: [] as string[], raw: stdout.slice(0, 400) };
  if (timedOut) return { ...base, answer: null, basis: "timeout" };
  const envelope = parseReplyEnvelope(stdout);
  if (envelope === null) return { ...base, answer: null, basis: "error" };
  const models = [...envelope.models];
  if (envelope.isError)
    return { ...base, models, answer: null, basis: "error" };
  if (!answeredByPinOnly(models))
    return { ...base, models, answer: null, basis: "model-mismatch" };
  const parsed = parseAdjudication(envelope.result);
  return {
    ...base,
    models,
    raw: envelope.result.slice(0, 200),
    answer: parsed,
    basis: parsed === null ? "unparseable" : "model",
  };
}

/**
 * Ask the pinned model one prompt; never rejects (a failure is an Answer with a null answer).
 * `bin` exists for the test that proves a spawn failure resolves instead of hanging.
 */
export function adjudicateOnce(
  key: string,
  run: number,
  prompt: string,
  bin = "claude",
): Promise<Answer> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (a: Answer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(a);
    };
    const child = spawn(
      bin,
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
    // A missing binary emits `error` (and may never emit `close`); writing the prompt to its
    // stdin then fails with EPIPE, which would otherwise be an unhandled error.
    child.on("error", (e) =>
      settle({
        key,
        run,
        models: [],
        raw: String(e).slice(0, 400),
        answer: null,
        basis: "error",
      }),
    );
    child.stdin.on("error", () => {});
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", () => settle(answerFromReply(key, run, out, timedOut)));
    child.stdin.end(prompt);
  });
}
