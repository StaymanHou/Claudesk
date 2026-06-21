// WP6 Phase 3 — pure fuzzy-match + ranking for the Cmd+P file finder.
//
// The finder fuzzy-matches a typed query against the backend file index
// (fs_index). This module is the PURE half — no React, no DOM — so it is
// vitest-testable (repo posture: pure logic → vitest, live DOM → Playwright; same
// split as fuzzyMatch's siblings panelHost.ts / paletteCommands.ts / fontZoom.ts).
//
// MATCH MODEL: case-insensitive SUBSEQUENCE match (the query chars must appear in
// the candidate in order, not necessarily contiguous) — the Sublime/VS-Code Cmd+P
// model. `fuzzyMatch` returns a numeric score (HIGHER = better) or `null` when the
// query is not a subsequence of the candidate.
//
// SCORING (must-have ranker per the plan; deliberately simple, not fzf-grade):
//   - segment-boundary bonus: a query char that matches the first char of a path
//     segment (start of string or right after '/') or a camel/separator boundary
//     scores higher — "fm" should rank fileMatch.ts / finder/match.ts above a
//     buried mid-word match.
//   - contiguity bonus: adjacent query chars matching adjacent candidate chars.
//   - shorter-candidate bonus: among equal-quality matches, the shorter path wins.
//   - earlier-first-match bonus: a match starting nearer the front of the basename
//     wins. We weight the BASENAME (text after the last '/') since the user usually
//     types the filename, not the directory.

export interface FileMatch {
  /** The candidate path (project-relative, as returned by fs_index). */
  path: string;
  /** Match score; higher is better. */
  score: number;
}

/** True when `ch` is a path-segment boundary char (we bonus the char AFTER it). */
function isBoundary(ch: string): boolean {
  return ch === "/" || ch === "_" || ch === "-" || ch === ".";
}

/**
 * Score how well `query` fuzzy-matches `candidate`, or `null` if `query` is not a
 * (case-insensitive) subsequence of `candidate`. Higher score = better match.
 *
 * An empty/whitespace query matches everything with a neutral score of 0 (the
 * finder shows the whole index when nothing is typed; rankFiles then sorts by path).
 */
export function fuzzyMatch(query: string, candidate: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;

  const cand = candidate.toLowerCase();
  // Index where the basename starts (char after the last '/'), for basename weighting.
  const lastSlash = cand.lastIndexOf("/");
  const baseStart = lastSlash + 1; // 0 when no slash

  let score = 0;
  let qi = 0;
  let prevMatchIdx = -2; // for contiguity detection (need ci === prev+1)
  let firstMatchIdx = -1;

  for (let ci = 0; ci < cand.length && qi < q.length; ci++) {
    if (cand[ci] !== q[qi]) continue;

    // Base point for a matched char.
    score += 1;

    // Segment-boundary bonus: matched at the very start, or right after a boundary.
    if (ci === 0 || isBoundary(cand[ci - 1])) score += 8;

    // Basename bonus: matching within the filename (vs the directory prefix) —
    // the user usually types the filename.
    if (ci >= baseStart) score += 2;

    // Contiguity bonus: this matched char is adjacent to the previous matched one.
    if (ci === prevMatchIdx + 1) score += 3;

    if (firstMatchIdx === -1) firstMatchIdx = ci;
    prevMatchIdx = ci;
    qi++;
  }

  // Not all query chars consumed → not a subsequence.
  if (qi < q.length) return null;

  // Earlier-first-match bonus: a match starting nearer the front of the basename
  // ranks higher. Measured relative to the basename so deep dirs don't penalize.
  const firstInBase = Math.max(0, firstMatchIdx - baseStart);
  score -= firstInBase * 0.5;

  // Shorter-candidate bonus: among equal-quality matches the shorter path wins.
  score -= candidate.length * 0.05;

  return score;
}

/**
 * Rank `files` against `query`: keep only matches, sort best-first, and (optionally)
 * cap the result count. Stable secondary order is the path itself (so an empty query
 * — every file scores 0 — comes back sorted by path, and equal scores are
 * deterministic).
 *
 * `limit` bounds how many results the overlay renders (default 100 — plenty for a
 * keyboard-driven picker; avoids rendering thousands of rows on an empty query in a
 * huge repo).
 */
export function rankFiles(
  query: string,
  files: string[],
  limit = 100,
): FileMatch[] {
  const matches: FileMatch[] = [];
  for (const path of files) {
    const score = fuzzyMatch(query, path);
    if (score !== null) matches.push({ path, score });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return limit >= 0 ? matches.slice(0, limit) : matches;
}
