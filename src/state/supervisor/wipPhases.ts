// M15 WP4 Phase 2 — IS THE FEATURE AT A PHASE BOUNDARY, AND IS IT THE LAST ONE?
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS A CONTRACT-READER, NOT A GUESSER — AND THE CONTRACT IS SOMEONE ELSE'S.
//
// The Work Tree schema is defined in the companion workflow-system repo (mccc), not here.
// WP4 task 4.7 hands off a request that mccc PIN the schema with a `check-structure.sh` phase,
// so that this parser reads a guaranteed shape rather than a shape that happens to hold today.
// ⚠️ **Until that pin lands, every property this module depends on is an OBSERVED regularity,
// not an enforced one.** The properties, so the handoff can name them exactly:
//
//   1. A phase line matches `- [ ] Phase <N>: <title>` or `- [x] …` at **column 0**.
//   2. `[x]` means complete; `[ ]` means not. (`<!-- status: … -->` is commentary — see below.)
//   3. The workflow is named by a `**Workflow:** <name>` line in the frontmatter block.
//
// ⚠️ **THE CHECKBOX IS THE AUTHORITY, NOT THE `<!-- status: -->` COMMENT.** Both appear on every
// phase line and they can disagree: the GLOBAL Work Tree rules say a parent's checkbox may only
// be `[x]` when all children are, and the status comment carries free-form text
// (`NOT-STARTED; depends on Phase 1`, `in-progress`, `DONE`, `SURFACED: …`). Parsing the comment
// would mean parsing prose with no fixed vocabulary; the checkbox is a two-valued contract.
//
// ⚠️ **A "BOUNDARY" REQUIRES AT LEAST ONE COMPLETED PHASE.** A fresh WIP with nothing done is
// not at a boundary — there is no completed unit of work to recycle at, and recycling there
// would throw away a session that has produced nothing. This is the one place the obvious
// reading ("is any phase incomplete?") is wrong.

/** The workflow a WIP file belongs to, as named by its `**Workflow:**` frontmatter line. */
export type WipWorkflow = "feature" | "task" | "incident" | "product" | null;

/** One phase node from the Work Tree. */
export interface WipPhase {
  /** The phase's title text, for diagnostics. */
  readonly title: string;
  /** True iff the checkbox reads `[x]`. */
  readonly done: boolean;
}

/** What the parser could read out of a WIP file. */
export interface ParsedWip {
  readonly workflow: WipWorkflow;
  readonly phases: readonly WipPhase[];
}

/**
 * `- [ ] Phase 3: The boundary rule — recycle vs chain  <!-- status: … -->`
 *
 * ⚠️ **Anchored at column 0 (`^`) with the `m` flag.** Phase lines are top-level tree nodes;
 * their child impl tasks are INDENTED (`  - [ ] P2.1 …`). Dropping the anchor would match every
 * child leaf and report a five-phase feature as having thirty "phases" — and since children
 * outnumber phases, the done/not-done ratio would be wrong too, silently.
 *
 * ⚠️ `[xX]` accepts either case; the schema writes lowercase but a hand-edit may not.
 */
const PHASE_LINE = /^- \[([ xX])\]\s+Phase\s+\d+\s*:\s*(.*)$/gm;

/**
 * `**Workflow:** feature`
 *
 * ⚠️ Not anchored to the literal first lines: a WIP file's frontmatter is a small markdown
 * block, not YAML, and its field order is not fixed.
 */
const WORKFLOW_LINE = /^\*\*Workflow:\*\*\s*([A-Za-z-]+)\s*$/m;

/** The workflow names the state machine defines. Anything else reads as `null`. */
const KNOWN_WORKFLOWS = new Set(["feature", "task", "incident", "product"]);

/**
 * Parse a WIP file's text.
 *
 * ⚠️ **Never throws.** The supervisor calls this on a turn boundary across every open
 * workspace; a malformed file must degrade to "I learned nothing" (which withholds the
 * recycle), not take down the sweep. `null` is returned only for input that is not text at all.
 *
 * @returns the parse, or `null` when `text` is empty/absent. ⚠️ A file that parses to **zero
 *          phases** is NOT `null` — it is a real answer (a task WIP has no Work Tree), and the
 *          boundary check handles it.
 */
export function parseWip(text: string | null | undefined): ParsedWip | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;

  const wfMatch = WORKFLOW_LINE.exec(text);
  const named = wfMatch?.[1]?.toLowerCase();
  const workflow: WipWorkflow =
    named && KNOWN_WORKFLOWS.has(named) ? (named as WipWorkflow) : null;

  const phases: WipPhase[] = [];
  // `lastIndex` reset — DEFENSIVE, and deliberately kept despite being unobservable today.
  //
  // ⚠️ **Honest status: this is an EQUIVALENT-MUTANT site.** Removing this line changes no
  // behavior reachable through `parseWip`, and a mutation run proved it (19/19 still green).
  // The reason is that the loop below always runs to exhaustion — `exec` returns `null` on the
  // final attempt and resets `lastIndex` to 0 itself, so a module-level `g` regex is already
  // back at 0 by the time the next call starts.
  //
  // ⚠️ It stays because it becomes load-bearing the moment anyone adds a `break`, an early
  // `return`, or a `phases.length` cap to that loop — at which point the regex WOULD retain a
  // non-zero `lastIndex` and the NEXT call would silently find fewer phases. That failure is
  // invisible (a short phase list reads as a valid parse), and this line costs nothing.
  // ⚠️ Do not "clean it up" as dead code without also proving the loop still exhausts.
  PHASE_LINE.lastIndex = 0;
  for (let m = PHASE_LINE.exec(text); m !== null; m = PHASE_LINE.exec(text)) {
    phases.push({
      done: m[1].toLowerCase() === "x",
      title: m[2].replace(/<!--.*?-->/g, "").trim(),
    });
  }

  return { workflow, phases };
}

/**
 * Is this WIP at a phase boundary that is **not** the last phase?
 *
 * True iff at least one phase is complete AND at least one is not.
 *
 * ⚠️ **Both halves are load-bearing, and each guards a different wrong recycle:**
 * - *No completed phase* → a fresh WIP. Nothing has been finished, so there is no boundary and
 *   recycling would discard a session that has produced nothing.
 * - *No incomplete phase* → the last phase is done. Recycling here hands a fresh session a
 *   feature with no work left, and the very next step is ship/finalize.
 *
 * ⚠️ This deliberately does NOT ask whether the CURRENT phase just ended — it asks whether the
 * file is in a state where a later phase exists. The turn-end trigger supplies the "a phase just
 * ended" half; conflating the two here would duplicate that signal in a second place.
 */
export function atNonFinalPhaseBoundary(parsed: ParsedWip | null): boolean {
  if (parsed === null || parsed.phases.length === 0) return false;
  const anyDone = parsed.phases.some((p) => p.done);
  const anyOpen = parsed.phases.some((p) => !p.done);
  return anyDone && anyOpen;
}

/**
 * Is this WIP a **feature** workflow?
 *
 * ⚠️ **The recycle is feature-workflow-only** (operator-confirmed at decomposition). Task,
 * incident, and product WIPs have no phase structure, so the boundary rule is meaningless for
 * them — but auto-chain enforcement still applies, which is why this gates only the recycle
 * branch and not the supervisor as a whole.
 */
export function isFeatureWorkflow(parsed: ParsedWip | null): boolean {
  return parsed?.workflow === "feature";
}
