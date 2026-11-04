// M15 WP2 — the transition-token parser.
//
// ⚠️ MOVED OUT OF THE TEST FILE at code-quality review [2026-09-12]. It was originally
// `export`ed from `__tests__/workflowMachineUpstreamContract.test.ts` and described there
// as "the regex WP3's transcript reader will use" — which would have left WP3 either
// importing production code from a test directory, or re-deriving a second regex while
// the carefully-pinned `F10b`-truncation trap stayed pinned on a copy nobody used.
//
// ⚠️ That is THIS WP's own thesis — *one funnel, guarded* — failing one layer up: the
// PARSE half of the contract has to be single-source for the same reason the POLICY half
// does. The test file now imports from here, so the pinned shapes guard the real thing.

/**
 * The transition-token regex WP3's transcript reader will use.
 *
 * ⚠️ Must admit every shape upstream's corpus actually contains:
 *   • plain ids (`F1`, `T2`, `P10`, `S18`)
 *   • letter-suffixed ids (`F9b`, `F10b`, `F17b`, `T5a`) — ⚠️ a bare `F[0-9]+` silently
 *     drops six real edges, two of which (F9b/F10b) are exactly the ones the stale
 *     AGENTS.md copy omits
 *   • compound/legacy scenario ids (`F-CHGLOG-1`, `F16-triage-ambiguous`)
 *   • hyphenated sidebar tokens (`DEBUG-BISECT-START`)
 *   • markdown decoration (`**TRANSITION:**`, `*TRANSITION:*`)
 *   • an arrow suffix (`TRANSITION: T2 (plan → act)`)
 * …and must NOT match prose that merely says the word.
 */
export const TRANSITION_TOKEN_RE =
  /TRANSITION:\s*\*{0,2}\s*([A-Za-z0-9][A-Za-z0-9-]*)/;

/** Extract a transition id the way the reader will. Strips markdown emphasis first. */
export function extractTransitionId(line: string): string | null {
  const m = TRANSITION_TOKEN_RE.exec(line.replace(/\*/g, ""));
  return m ? m[1] : null;
}

/**
 * Leading line decoration: whitespace, a list marker (`-`, `*`, `+`, `1.`), a blockquote `>`,
 * and markdown emphasis (`*`, `_`). Applied repeatedly.
 */
const LINE_DECORATION_RE = /^(?:\s+|[-+]\s|\d+[.)]\s|>|[*_]+)/;

/** What may END the text before an emitted token: a sentence or clause boundary. */
const CLAUSE_BOUNDARY_RE = /(?:[.!?:;,(\u2192\u2014]|->|[.!?]\))$/;

/**
 * Extract the transition id a message EMITS, or `null` when there is none: the last
 * `TRANSITION:` that OPENS A SENTENCE OR CLAUSE and is not inside a quote.
 *
 * ⚠️ M16.5 WP3 3.1 — a token QUOTED in prose must not fire. The reader used to take the last
 * `TRANSITION:` anywhere in the message, and live (2026-09-28) a turn whose final message said
 * *The "Built / TRANSITION: F8" reply was the literal text you asked for* re-fired its own
 * skill.
 *
 * The rule, measured on the local corpus (`tooling/adjudicator-probe/tokenSplit.probe.ts`):
 * - **Emitted:** the token begins its line (after list / quote / emphasis decoration), or the
 *   text before it ends a clause, ignoring emphasis and backticks between
 *   (`Approved. **TRANSITION: F13**`, `` → `TRANSITION: F38` ``). The full set is
 *   `CLAUSE_BOUNDARY_RE`: `.` `!` `?` `:` `;` `,` `(` `→` `—` `->`, and a sentence end inside a
 *   closing paren (`.)` `!)` `?)`). ⚠️ The comma is the loosest boundary
 *   (`Plan complete, \`TRANSITION: F7\``), so it is the likeliest way a quoted token gets
 *   through; `(` admits `(TRANSITION: P10)`. Tests depend on both.
 * - **Quoted:** the token is the object of a verb (`` I'm still not emitting `TRANSITION: F13` ``),
 *   sits inside a double-quoted span (`"…"`, `“…”`), or sits inside a code span that holds
 *   other text before it. A fenced code block is NOT a quote: older sessions emitted the
 *   verdict alone inside one.
 *
 * ⚠️ Two simpler rules were REFUTED by that replay, so do not reach for them:
 * - "the token must start its line" (the WBS default) withheld 132 of 477 recent real
 *   verdicts, because emitted verdicts now usually END a sentence;
 * - "a backticked token is a quote" withheld hundreds of older real ones, written
 *   `` `TRANSITION: F8` — build → verify-auto ``.
 */
export function extractEmittedTransitionId(text: string): string | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    for (
      let at = line.lastIndexOf("TRANSITION:");
      at >= 0;
      at = at === 0 ? -1 : line.lastIndexOf("TRANSITION:", at - 1)
    ) {
      if (!opensClause(line.slice(0, at))) continue;
      const id = extractTransitionId(line.slice(at));
      if (id !== null) return id;
    }
  }
  return null;
}

/** Does a token preceded by `prefix` (on its line) open a sentence or clause, unquoted? */
function opensClause(prefix: string): boolean {
  const count = (ch: string): number => prefix.split(ch).length - 1;
  if (count('"') % 2 === 1 || count("\u201C") > count("\u201D")) return false;
  // Inside a code span, the token is emitted only if it OPENS the span
  // (`` `TRANSITION: F8` ``); any other text in the span makes it a quoted instruction
  // (`` `Reply with exactly this line: TRANSITION: T2` ``).
  if (count("`") % 2 === 1) {
    const open = prefix.lastIndexOf("`");
    if (prefix.slice(open + 1).replace(/[\s*_]/g, "") !== "") return false;
    prefix = prefix.slice(0, open);
  }
  for (;;) {
    const m = LINE_DECORATION_RE.exec(prefix);
    if (m === null) break;
    prefix = prefix.slice(m[0].length);
  }
  const before = prefix.replace(/[\s*_`]+$/, "");
  return before === "" || CLAUSE_BOUNDARY_RE.test(before);
}
