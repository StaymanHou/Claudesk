// M16.5 WP2 — the adjudicator re-measurement probe: the PURE half of the miner.
//
// ⚠️ THE POPULATION IS WHAT THE SHIPPED CODE WOULD FIRE ON. Every candidate comes from the real
// `decideVerdict` over a turn prefix, and its tail from the real `tailTextOf`. Nothing here
// re-implements the M15 Python labeller, whose rules and prompt both differ from what shipped.
//
// ⚠️ THE ONLY MECHANICAL LABEL IS `BREAK`. A content-free prod ("continue", the operator typing
// the exact skill the supervisor would have fired, or a complaint that the agent stopped) proves
// nothing was being asked.
// A substantive reply does NOT prove the opposite: it is also what a redirect after a real break
// looks like. So everything that is not a prod goes to the operator.

import {
  isTurnComplete,
  isUserProseTurn,
  parseTranscript,
  readTurn,
  type TranscriptLine,
} from "../../src/state/supervisor/transcript";
import { decideVerdict } from "../../src/state/supervisor/verdict";
import { tailTextOf } from "../../src/state/supervisor/fanOut";

/** The fixed opening of every adjudicator prompt, shipped (`adjudicationPrompt`) and M15's. */
const ADJUDICATOR_PROMPT_OPENINGS = [
  "You are judging one thing about the end of an AI assistant's turn.",
  "You are judging whether an AI coding agent's turn ENDED WAITING FOR THE OPERATOR.",
];

/** The M15 probe's own run directory. Its sessions are the probe, not the operator. */
export const M15_PROBE_SLUG =
  "-Users-stayman-Personal-projects-claudesk-tmp-scratch-m15-probe";

/**
 * A `tmp/scratch` workspace (`scratch-a/b/c`, the M15 probe dir). The agent drives CC there
 * during verify-self, so its "operator" lines are scripted ("Use no tools. Reply with the single
 * word Built…") and are not operator behavior.
 */
export function isScratchSlug(slug: string): boolean {
  return slug.includes("-tmp-scratch-");
}

export type ProjectClass = "claudesk" | "personal" | "work" | "other";

/** Which tails may be committed is decided by this, so it is deliberately coarse. */
/**
 * The ONLY slugs whose tails may be committed unredacted: this repo and its `src-tauri` cwd.
 * ⚠️ Exact, never a prefix: a sibling `claudesk-*` directory (a worktree, a fork, the scratch
 * workspaces' new home) would otherwise be committed with no forbidden-token scan.
 */
export const CLAUDESK_SLUGS: ReadonlySet<string> = new Set([
  "-Users-stayman-Personal-projects-claudesk",
  "-Users-stayman-Personal-projects-claudesk-src-tauri",
]);

export function projectClassOf(slug: string): ProjectClass {
  if (CLAUDESK_SLUGS.has(slug)) return "claudesk";
  if (slug.includes("-Work-")) return "work";
  if (slug.startsWith("-Users-stayman-Personal-")) return "personal";
  return "other";
}

/** A parsed line plus its 0-based line number in the raw file (M15's `turn_index`). */
export interface IndexedLine {
  readonly raw: number;
  readonly line: TranscriptLine & { isMeta?: boolean; timestamp?: string };
}

/** Parse raw JSONL, keeping each line's raw index. Bad lines are skipped, as in production. */
export function parseIndexed(rawLines: readonly string[]): IndexedLine[] {
  const out: IndexedLine[] = [];
  rawLines.forEach((raw, i) => {
    const [line] = parseTranscript([raw]);
    if (line) out.push({ raw: i, line });
  });
  return out;
}

/** The text of a user line: a string, or its `text` blocks joined. */
function userText(line: TranscriptLine): string {
  const content = line.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

/**
 * Is this transcript an adjudicator's own `claude -p` session?
 *
 * ⚠️ Keyed on the FIRST user prompt STARTING with a fixed opening, never on "contains": a session
 * that discusses the adjudicator (this one did) quotes the opening too, and is real corpus.
 * `queue-operation` lines are checked as well, because a `-p` session records its stdin prompt
 * there before the user line.
 */
export function isAdjudicatorSession(lines: readonly IndexedLine[]): boolean {
  for (const { line } of lines) {
    const l = line as TranscriptLine & { content?: unknown };
    let text: string | null = null;
    if (l.type === "queue-operation" && typeof l.content === "string")
      text = l.content;
    else if (l.type === "user" && l.toolUseResult === undefined)
      text = userText(l);
    if (text === null) continue;
    const t = text.trimStart();
    return ADJUDICATOR_PROMPT_OPENINGS.some((o) => t.startsWith(o));
  }
  return false;
}

/** An injected (`isMeta`) user line: a skill body, a command caveat. Never the operator. */
function isMetaLine(line: IndexedLine["line"]): boolean {
  return line.isMeta === true;
}

/** A line the OPERATOR (or something typing as them) sent: prose, and not an injected skill body. */
function isOperatorLine(line: IndexedLine["line"]): boolean {
  return isUserProseTurn(line) && line.isMeta !== true;
}

/** How the next operator line reads. Only the two `prod-*` kinds are a mechanical label. */
export type NextKind =
  | "no-reply"
  | "task-notification"
  | "interrupted"
  | "prod-command"
  | "prod-text"
  | "prod-complaint"
  | "other-command"
  | "ack"
  | "reply";

// A content-free prod: nothing in it could be an answer to a question.
const PROD_TEXT =
  /^(continue|next|go|go on|go ahead|proceed|keep going|carry on|resume|so|and|do it|run it|next step|go for it|please continue|continue please)[\s.!?]*$/i;
// A prod that complains the agent stopped ("so? not autopiloting?", "just chain it!"). All 13 of
// M15's BREAK labels that the two rules above miss read like this. ⚠️ Capped in length: a long
// message that mentions autopilot is usually a redirect carrying new instructions, which is the
// operator's call, not a prod.
const PROD_COMPLAINT =
  /^(so\?|chain\b)|\bautopilot|\bauto[- ]?chain|\bchain it\b|\breturn(ing)? control\b/i;
const PROD_COMPLAINT_MAX = 160;
// A bare acknowledgement. ⚠️ M15 corrected these to UNKNOWN: "ok" can close a question as well
// as wave a turn on.
const ACK_TEXT =
  /^(ok|okay|k|good|great|nice|cool|thanks|thank you|yes|yep|yeah|sure|👍)[\s.!?]*$/i;

/** Classify the operator line after a fire candidate. `skill` is what the supervisor would fire. */
export function classifyNext(text: string | null, skill: string): NextKind {
  if (text === null) return "no-reply";
  const t = text.trim();
  if (t.startsWith("<task-notification")) return "task-notification";
  if (t.includes("[Request interrupted by user")) return "interrupted";
  const cmd = /<command-name>\/?([^<]+)<\/command-name>/.exec(t);
  if (cmd) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t);
    const bare = (args?.[1] ?? "").trim() === "";
    return cmd[1].trim() === skill && bare ? "prod-command" : "other-command";
  }
  if (PROD_TEXT.test(t)) return "prod-text";
  if (t.length <= PROD_COMPLAINT_MAX && PROD_COMPLAINT.test(t))
    return "prod-complaint";
  if (ACK_TEXT.test(t)) return "ack";
  return "reply";
}

/** One supervisor fire from `supervisor-activity.log`. */
export interface FiredRecord {
  readonly sessionId: string;
  readonly ts: number;
  readonly command: string | null;
}

/** One fire candidate. `truth` is `BREAK` or `null` (the residual, for the operator). */
export interface Candidate {
  readonly project: string;
  readonly projectClass: ProjectClass;
  readonly session: string;
  /** Raw line index of the verdict line (M15's `turn_index`). */
  readonly turnIndex: number;
  /** Raw line index of the operator line that opened this turn, or -1 at file start. */
  readonly turnStart: number;
  readonly edgeId: string;
  readonly skill: string;
  readonly tail: string;
  /** ISO timestamp of the verdict line, when the line carries one. */
  readonly ts: string | null;
  readonly nextText: string | null;
  readonly nextKind: NextKind;
  readonly supervisorFired: boolean;
  readonly truth: "BREAK" | null;
  readonly truthBasis: string;
}

/** Counts per file, for the `_meta` the yield report reads. */
export interface FileStats {
  turnsRead: number;
  incomplete: number;
}

/** How long after the verdict line a supervisor fire still belongs to this turn. */
const FIRE_WINDOW_MS = 120_000;

/**
 * Mine one transcript for fire candidates.
 *
 * A turn ends at each operator line (and at EOF). The prefix up to there is exactly what the live
 * reader sees at that turn's `Stop`: `readTurn` floors at the last user prose line itself.
 * ⚠️ An incomplete turn (interrupted, still running) is skipped, because production gates on
 * `isTurnComplete` and would not decide it either.
 */
export function mineTranscript(args: {
  project: string;
  session: string;
  rawLines: readonly string[];
  fired: readonly FiredRecord[];
  stats: FileStats;
}): Candidate[] {
  const indexed = parseIndexed(args.rawLines);
  const lines = indexed.map((x) => x.line);
  const ends: number[] = [];
  indexed.forEach((x, i) => {
    if (isOperatorLine(x.line)) ends.push(i);
  });
  ends.push(indexed.length);

  const out: Candidate[] = [];
  const firedHere = args.fired.filter((f) => f.sessionId === args.session);
  let turnStart = -1;
  for (const end of ends) {
    const opener = turnStart;
    if (end < indexed.length) turnStart = indexed[end].raw;
    // ⚠️ Cut at what the live reader sees at `Stop`, not at the next operator line. CC writes
    // `isMeta` user lines between a closed turn and the next prompt (`/exit` is preceded by a
    // `<local-command-caveat>`), and `readTurn` floors at ANY user prose line, so leaving one in
    // hides the turn's verdict. verify-self found 13 fires lost this way, 3 of them M15 seeds.
    let stop = end;
    while (
      stop > 0 &&
      lines[stop - 1].type === "user" &&
      isMetaLine(lines[stop - 1])
    )
      stop--;
    if (stop === 0) continue;
    const prefix = lines.slice(0, stop);
    args.stats.turnsRead++;
    if (!isTurnComplete(prefix)) {
      args.stats.incomplete++;
      continue;
    }
    const verdict = decideVerdict({ lines: prefix, storedMode: "autopilot" });
    if (verdict.kind !== "fire") continue;

    // ⚠️ The verdict line comes from `readTurn` itself, never a re-scan: the tail must be the one
    // production sends, and `decideVerdict` read this same prefix the same way.
    const vi = readTurn(prefix).verdictIndex;
    if (vi === null) continue;

    const next = end < indexed.length ? userText(lines[end]) : null;
    const nextKind = classifyNext(next, verdict.skill);
    const ts = indexed[vi].line.timestamp ?? null;
    const t0 = ts ? Date.parse(ts) : NaN;
    const supervisorFired = firedHere.some(
      (f) => !Number.isNaN(t0) && f.ts >= t0 && f.ts <= t0 + FIRE_WINDOW_MS,
    );

    let truth: "BREAK" | null = null;
    let truthBasis: string = nextKind;
    if (supervisorFired) truthBasis = "supervisor-fired";
    else if (
      nextKind === "prod-command" ||
      nextKind === "prod-text" ||
      nextKind === "prod-complaint"
    )
      truth = "BREAK";

    out.push({
      project: args.project,
      projectClass: projectClassOf(args.project),
      session: args.session,
      turnIndex: indexed[vi].raw,
      turnStart: opener,
      edgeId: verdict.edgeId,
      skill: verdict.skill,
      tail: tailTextOf(lines, vi),
      ts,
      nextText: next,
      nextKind,
      supervisorFired,
      truth,
      truthBasis,
    });
  }
  return out;
}
