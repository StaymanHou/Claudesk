// M11 WP3 — which doc the panel lands on when it opens, with no click.
//
// ── Why this exists ─────────────────────────────────────────────────────────────
// The Docs panel is a RE-ORIENTATION surface, not a file browser: it answers "where is
// this project?" A panel that opens on an empty pane and waits for a click has pushed that
// question back to the user, which is the ceremony
// `primary-surface-is-zero-ceremony-not-a-mode` exists to prevent. So the panel picks.
//
// ── The ranking: MOST DOWNSTREAM WINS ───────────────────────────────────────────
// `.session.md` → most-recent `wip/*.md` → `wbs.md` → `roadmap.md` → first in workflow
// order. The principle is that the most *current* artifact answers "where am I?" best: the
// session pointer literally records where the last session stopped, while `vision.md`
// (which nearly every project has) answers a question nobody re-opens a workspace to ask.
//
// ⚠️ The operator states this chain as "vision > roadmap > wbs > wip > session pointer",
// where `>` means "FLOWS TOWARD" — not "outranks". Both notations describe the ranking
// below; the arrow direction is the opposite of precedence. Re-confirmed 2026-08-02, and
// recorded here because reading the arrow as precedence inverts the whole function and
// would land every project on `vision.md` with the rest of the list as dead code.

import type { DocEntry } from "../docsOrder";
import { orderDocs } from "../docsOrder";

/** Ranked `kind`s, most-downstream first. Anything unlisted falls to workflow order. */
const RELEVANCE_ORDER: readonly string[] = [
  "session", // .session.md — where the last session stopped
  "wip", // the item actually in flight
  "wbs", // the current cycle's decomposition
  "roadmap", // what's next, when there's no active cycle
];

/**
 * Choose the doc to select when the panel first opens.
 *
 * Returns the chosen entry's `rel_path`, or `null` for an empty doc set (a project with no
 * `workflow-system/` at all — a normal state, not an error; the panel shows its "no docs"
 * view).
 *
 * Pure and total: no I/O, no throwing, defined for every input including duplicates and
 * unknown kinds. That matters because WP4 calls it a SECOND time — when a new doc appears
 * on disk — so it must not carry any first-load-only assumption.
 *
 * ## The multi-WIP tiebreak — most recently MODIFIED wins
 * When several `wip/*.md` exist, the newest `mtime_ms` wins. That is the WBS's original
 * rule (task 3.3), restored at the operator's ask after an interim build shipped an
 * alphabetical `file_name` fallback because `DocEntry` carried no timestamp at all.
 *
 * ⚠️ **Modification time, NOT creation time** — the operator asked about created-time and
 * the two cost the same to add, so the choice is about correctness, not price. The panel
 * answers "where is this project *right now*?", which means the file being actively worked
 * in. Measured on a real WIP mid-session: birth 08:48, modified 09:28. Given
 * `feature-a` (created Monday, edited this minute) and `feature-b` (created an hour ago,
 * untouched), creation time picks `feature-b` — the one you are *not* in. It also misleads
 * in this workflow specifically, where WIP files are `git mv`'d to `archive/` and new ones
 * created, so birthtime tracks phase starts rather than where the work is.
 *
 * Ties (equal mtimes, or the `0` stat-failure fallback on both) fall through to
 * `orderDocs`' deterministic `file_name` ordering, so the answer is never arbitrary.
 */
export function pickInitialDoc(entries: readonly DocEntry[]): string | null {
  if (entries.length === 0) return null;

  // Ordered once, so both the ranked lookup and the fallback share one tiebreak rule and
  // cannot disagree about which of two same-kind docs comes first.
  const ordered = orderDocs(entries);

  for (const kind of RELEVANCE_ORDER) {
    const matches = ordered.filter((e) => e.kind === kind);
    if (matches.length === 0) continue;

    // `ordered` is already `file_name`-sorted, and `reduce` keeps the FIRST element on a
    // tie (`>` not `>=`) — so equal mtimes, including two `0` stat failures, resolve to
    // the deterministic alphabetical answer rather than to input order.
    return matches.reduce((best, e) => (e.mtime_ms > best.mtime_ms ? e : best))
      .rel_path;
  }

  // Nothing ranked is present (e.g. a project with only vision + arch): fall back to the
  // panel's own display order so the landing doc is the top row rather than an arbitrary
  // one — the selection and the list agree, which is what makes it not look like a bug.
  return ordered[0].rel_path;
}

/**
 * THE selection: the user's explicit pick if they have made one, else the auto-selected
 * landing doc.
 *
 * Extracted from `DocsPanel`'s render so the PRECEDENCE is assertable as a value rather
 * than as source text. The distinction matters: a `?raw` guard can confirm the expression
 * `chosen ?? pickInitialDoc(docs)` appears in the file, but not that explicit-beats-auto
 * actually holds for every input — including the one that matters most, where the user has
 * picked a doc that auto-selection would never have chosen.
 *
 * ⚠️ `chosen` wins even when it is NOT the top-ranked doc, and even when the doc set later
 * changes underneath it. That is the whole point: auto-selection is a *default*, not a
 * correction. WP4 relies on this — it re-runs `pickInitialDoc` when a doc appears, and must
 * not override a reader who has deliberately opened something else.
 *
 * ⚠️ One case where `chosen` must NOT survive, and which this function deliberately does
 * NOT handle: the chosen doc being DELETED. That fall-back belongs to WP4 (`wbs.md` task
 * 4.3, "disappear" row), which clears the sentinel rather than re-pointing it — see that
 * task for why re-pointing would forge a fake user choice.
 *
 * ## FOUR tiers (a fourth added at WP5 P3.2 — operator decision)
 * `chosen` (user) > `jumpedTo` (machine jump) > `settled` (latched auto-resolution) >
 * `pickInitialDoc` (live default).
 *
 * ⚠️ `jumpedTo` exists because collapsing it into `chosen` was a shipped CRITICAL: the jump
 * arm wrote its own answer into `chosen`, and since the caller's jump guard is
 * `chosen === null`, the FIRST jump permanently suppressed every later one. Keeping the
 * machine's landing spot in its own slot means a jump can be superseded by the next jump
 * while a USER pick still outranks both — which is the precedence this function exists to
 * state. Defaulted so existing two-argument callers keep their exact behavior.
 *
 * ⚠️ `settled` fixes a REPRODUCED defect (`SURFACE-2026-08-02-QUALITY-WP4-SIBLING-EDIT-MOVES-
 * AUTOSELECTION`). Without it the bottom tier recomputes `pickInitialDoc(docs)` on every
 * render, and because the caller refreshes `docs` (with new mtimes) on every `fs-change`,
 * editing a file the reader is NOT looking at silently moved the selection: measured live at
 * WP5 P3.1 — reading `older-feature.md` at `scrollTop` 600, a touch of the sibling
 * `newer-feature.md` swapped the rendered doc and dropped the reader at `scrollTop` 0. No
 * reload arm ran, so nothing captured or restored the position. Latching the first
 * resolution means **only an appear/disappear may move an auto-selection** — the operator's
 * chosen semantics ("pin once resolved"), which keeps mtime churn from stealing the panel.
 */
export function selectedDoc(
  chosen: string | null,
  docs: readonly DocEntry[] | null,
  jumpedTo: string | null = null,
  settled: string | null = null,
): string | null {
  if (chosen !== null) return chosen;
  if (jumpedTo !== null) return jumpedTo;
  // The latched auto-resolution outranks a fresh compute, so later mtime churn cannot move
  // it. Only cleared by the caller on appear/disappear (where re-ranking is the intent).
  if (settled !== null) return settled;
  return docs !== null ? pickInitialDoc(docs) : null;
}
