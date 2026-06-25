// QoL-WP7 — pure roll-up of leaf git statuses to their ancestor folders.
//
// M2 WP11 decorated only leaf FILE rows with their git status (gitStatus.ts). WP7
// bubbles those statuses UP: each folder row shows a single DOMINANT-status marker
// derived from its changed descendants, so a collapsed folder hiding a modified file
// still reads as "has changes" (the VS Code / Sublime sidebar convention — one
// dominant color, not a pile of glyphs).
//
// This is the PURE half (no React/DOM), vitest-tested — same posture as gitStatus.ts /
// buildTree.ts. It operates on the SAME key space as the leaf lookup: the
// `git_file_statuses` map keys (matched against `fs_tree`'s workspace-relative
// `node.path`). WP7 does NOT change WP11's path-keying — staying consistent with the
// existing leaf lookup is the requirement, so a folder's roll-up agrees with the
// indicators on the rows inside it.

import type { GitFileStatus, GitStatusMap } from "./gitStatus";

/**
 * Precedence for folding a folder's mixed descendant statuses into ONE dominant
 * status — most-attention-grabbing first. A folder showing `deleted` outranks one
 * showing `modified`, which outranks `added`, which outranks `untracked`. `renamed`
 * is ranked with `modified` (they share the amber token in App.css), placed just
 * after it so a folder with both reads as `modified` (the more common signal).
 *
 * Lower index = higher precedence.
 */
export const rollupPrecedence: readonly GitFileStatus[] = [
  "deleted",
  "modified",
  "renamed",
  "added",
  "untracked",
];

/**
 * Fold a set of statuses into the single dominant one per `rollupPrecedence`, or
 * `undefined` for an empty set (a folder with no changed descendants → no roll-up).
 * An unknown status (not in the precedence list) is ignored — it can't out-rank a
 * recognized one, and an all-unknown set folds to `undefined`.
 */
export function dominantStatus(
  statuses: Iterable<GitFileStatus>,
): GitFileStatus | undefined {
  let best: GitFileStatus | undefined;
  let bestRank = Infinity;
  for (const s of statuses) {
    const rank = rollupPrecedence.indexOf(s);
    if (rank === -1) continue; // unknown status — never dominates
    if (rank < bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

/**
 * Build a `directory-path → dominant GitFileStatus` map from the flat
 * `git_file_statuses` map. For every changed path, walk its ancestor-dir chain
 * (`src/a/b.ts` → `src/a`, `src`) and fold that path's status toward each ancestor's
 * running dominant. Directories with no changed descendants are simply absent (no
 * key → no roll-up), mirroring how clean files are absent from `GitStatusMap`.
 *
 * Keys are the same forward-slashed, workspace-relative dir paths that appear as
 * `TreeNode.path` for directory rows, so a folder row looks itself up by `node.path`.
 *
 * Cost is O(changed-paths × depth) — no full-tree walk, since the status map only
 * carries changed paths (clean files are omitted by the backend).
 */
export function dominantStatusByDir(
  gitStatus: GitStatusMap,
): Record<string, GitFileStatus> {
  const byDir: Record<string, GitFileStatus> = {};
  const consider = (dir: string, status: GitFileStatus): void => {
    const current = byDir[dir];
    // dominantStatus over the pair keeps the precedence rule in one place. Returns
    // undefined only when BOTH inputs are unrecognized — leave the dir absent in
    // that case rather than recording a bogus key.
    const next = dominantStatus(
      current === undefined ? [status] : [current, status],
    );
    if (next !== undefined) byDir[dir] = next;
  };

  for (const path in gitStatus) {
    const status = gitStatus[path];
    // Walk every ancestor dir of this changed path.
    let slash = path.lastIndexOf("/");
    while (slash !== -1) {
      const dir = path.slice(0, slash);
      consider(dir, status);
      slash = dir.lastIndexOf("/");
    }
  }
  return byDir;
}
