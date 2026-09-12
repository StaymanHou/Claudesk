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
