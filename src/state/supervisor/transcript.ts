// M15 WP3 Phase 2 — the transcript reader's PARSE half (the verdict half is Phase 3).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ TWO MEASURED TRAPS SHAPE THIS ENTIRE MODULE. Both were found by the WP1 probe against
// the real corpus, and a reader written the obvious way gets both wrong SILENTLY.
//
// ⚠️ TRAP 1 — ~HALF OF ALL `TRANSITION:` OCCURRENCES ARE NOT VERDICTS.
// Measured 559 user-role / 555 assistant-role across a 40-file sample of this project. Skill
// bodies contain the full transitions table, and tool results echo docs — all injected into
// the conversation as USER-role content. So a file-level `grep 'TRANSITION:'` reads
// DOCUMENTATION as emitted verdicts. The parse MUST be scoped to the **last assistant text
// block** of the turn. A correctly-scoped parse yielded 2,281 verdicts across 150 files,
// reproducing the WBS's independently-measured turn count exactly — which is what
// cross-validates the scoping.
//
// ⚠️ TRAP 2 — THE CHAIN-DETECTION WINDOW MUST NOT CLOSE EARLY.
// Between emitting a verdict and invoking the next skill, the agent routinely runs
// `Bash`/`Read` calls and narrates in between — and that narration frequently RE-QUOTES the
// transition token. Proven case: session `06eb0e92` turn 504 emitted `F10` and DID chain, but
// the `Skill` call landed at line 511 after two `Bash` calls. An early-closing window labelled
// it a break. ⚠️ Only a real user **PROSE** turn ends the window; tool results arrive with
// role=`user` and MUST be skipped. Fixing this took the probe's break count 127 → 96.
//
// ⚠️ Erring PERMISSIVE is correct here. This milestone's standing measurement is that naive
// predicates OVER-flag by ~15x, and the binding failure direction (ruling R-6 condition 2) is
// to WITHHOLD — a missed break costs an operator nudge; a wrong fire is unrecoverable.

import { extractTransitionId } from "../workflowMachine/transitionToken";

/** One parsed transcript line. Only the fields the supervisor reads are modelled. */
export interface TranscriptLine {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  /** Present on tool-result lines. Part of trap 2's discriminator. */
  toolUseResult?: unknown;
}

/** The shape `transcript_tail` returns from Rust. */
export interface TranscriptTail {
  path: string | null;
  lines: string[];
}

/**
 * Parse raw JSONL into lines, skipping anything unparseable.
 *
 * ⚠️ A bad line is SKIPPED, not fatal. The Rust side reads a byte-bounded tail with lossy
 * UTF-8, and a transcript carries arbitrary tool output — one mangled record must not blank
 * the whole read.
 */
export function parseTranscript(lines: readonly string[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    try {
      const v = JSON.parse(raw) as unknown;
      if (v && typeof v === "object") out.push(v as TranscriptLine);
    } catch {
      // Skip — see the doc comment above.
    }
  }
  return out;
}

/**
 * Is this line a **real user prose turn** — the only thing that closes the chain window?
 *
 * ⚠️ THE DISCRIMINATOR IS THE CONTENT, NOT THE ROLE. Tool results arrive with role=`user`
 * and outnumber real prose heavily (measured 175 tool-result vs 12 prose user-lines in one
 * live session). Keying on `type === "user"` alone closes the window on the agent's own tool
 * calls — trap 2, which over-flagged 31 turns as breaks in the probe corpus.
 *
 * ⚠️ Also excluded by `type`: `system`, `attachment`, `queue-operation`, and the
 * `mode`/`permission-mode`/`atis-latch`/`last-prompt` bookkeeping lines the harness writes.
 * Only `type === "user"` is even considered.
 */
export function isUserProseTurn(line: TranscriptLine): boolean {
  if (line.type !== "user") return false;
  // A tool result is never prose, however its content is shaped.
  if (line.toolUseResult !== undefined) return false;
  const content = line.message?.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) {
    // Prose iff at least one block is text-like AND no block is a tool_result.
    let hasText = false;
    for (const b of content) {
      if (!b || typeof b !== "object") continue;
      const t = (b as { type?: string }).type;
      if (t === "tool_result") return false;
      if (t === "text") hasText = true;
    }
    return hasText;
  }
  return false;
}

/** Concatenated text of an assistant line's `text` blocks (empty when it has none). */
function assistantText(line: TranscriptLine): string {
  if (line.type !== "assistant") return "";
  const content = line.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string")
      parts.push(block.text);
  }
  return parts.join("\n");
}

/** Does this line invoke the `Skill` tool, and if so which skill? */
export function skillInvocation(line: TranscriptLine): string | null {
  if (line.type !== "assistant") return null;
  const content = line.message?.content;
  if (!Array.isArray(content)) return null;
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b as {
      type?: string;
      name?: string;
      input?: { skill?: string };
    };
    if (block.type === "tool_use" && block.name === "Skill") {
      return typeof block.input?.skill === "string" ? block.input.skill : "";
    }
  }
  return null;
}

/** What the reader concluded about the most recent emitted verdict. */
export interface TurnReading {
  /** The transition id from the last assistant text block that carried one. */
  edgeId: string | null;
  /** Index (into the parsed array) of the line the verdict was read from. */
  verdictIndex: number | null;
  /** The skill invoked after the verdict, if the window found one. */
  chainedTo: string | null;
  /** True iff a `Skill` call followed the verdict before a real user prose turn. */
  alreadyChained: boolean;
}

/**
 * Read the most recent emitted verdict and decide whether it already chained.
 *
 * ⚠️ **Scans BACKWARD for the last assistant line carrying a token** (trap 1 — the token must
 * come off an assistant text block, never a user line), then scans FORWARD from there for a
 * `Skill` call, stopping only at a real user prose turn (trap 2).
 *
 * ⚠️ The forward scan starts at the verdict line ITSELF, because an assistant message can
 * carry the `TRANSITION:` text block and the `Skill` tool_use block in the SAME message —
 * which is what a correctly-chaining agent produces. Starting at `verdictIndex + 1` would
 * label every same-message chain a break.
 */
export function readTurn(lines: readonly TranscriptLine[]): TurnReading {
  const none: TurnReading = {
    edgeId: null,
    verdictIndex: null,
    chainedTo: null,
    alreadyChained: false,
  };

  let verdictIndex: number | null = null;
  let edgeId: string | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = assistantText(lines[i]);
    if (!text.includes("TRANSITION:")) continue;
    // ⚠️ Read the LAST token in the block, not the first: a block that narrates the table
    // before emitting its own verdict would otherwise yield the quoted id.
    const idx = text.lastIndexOf("TRANSITION:");
    const id = extractTransitionId(text.slice(idx));
    if (id) {
      verdictIndex = i;
      edgeId = id;
      break;
    }
  }
  if (verdictIndex === null || edgeId === null) return none;

  for (let i = verdictIndex; i < lines.length; i++) {
    const line = lines[i];
    // ⚠️ The user-prose check comes FIRST, but must not fire on the verdict line itself
    // (which is an assistant line, so it cannot — stated because the ordering looks fragile).
    if (i !== verdictIndex && isUserProseTurn(line)) break;
    const skill = skillInvocation(line);
    if (skill !== null) {
      return { edgeId, verdictIndex, chainedTo: skill, alreadyChained: true };
    }
  }
  return { edgeId, verdictIndex, chainedTo: null, alreadyChained: false };
}
