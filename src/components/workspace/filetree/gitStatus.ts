// WP11 Part B — pure mapping from a file's git status to its tree-row indicator.
//
// The backend `git_file_statuses` command (git_status::commands) returns a
// `Record<repo-relative-path, GitFileStatus>` where the status strings are the
// lowercase serde forms of the Rust `GitFileStatus` (= git_diff::ChangedStatus):
// "modified" | "added" | "deleted" | "renamed" | "untracked". Clean files are
// absent from the map (no entry → no indicator).
//
// This module is the pure (no React/DOM) glyph + class mapping, vitest-tested —
// the repo posture (pure logic → vitest, live DOM → Playwright). The dark-only
// color tokens live in App.css keyed on the `data-status` attribute this drives;
// here we only pick the single-char glyph + the status string used for the class
// and the data attribute.

/** The git status strings the backend emits (lowercase serde of GitFileStatus). */
export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

/** path (repo-relative, forward-slashed) → status. Clean files are omitted. */
export type GitStatusMap = Record<string, GitFileStatus>;

/**
 * The single-char sidebar glyph for a status (Sublime/VS-Code convention), or null
 * when there is no indicator (clean / unknown). M=modified, A=added, U=untracked,
 * D=deleted, R=renamed. Untracked is distinct from added (U vs A) — a new file not
 * yet `git add`-ed reads differently from a staged-new file.
 */
export function statusGlyph(status: GitFileStatus | undefined): string | null {
  switch (status) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "untracked":
      return "U";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return null; // clean / undefined → no glyph
  }
}

/**
 * The CSS modifier class for a status row indicator (the color token lives in
 * App.css: `.file-tree-status--<status>`), or null when there is no indicator.
 * The status string is also surfaced as the `data-status` attribute for tests +
 * styling.
 */
export function statusClass(status: GitFileStatus | undefined): string | null {
  if (statusGlyph(status) === null) return null;
  return `file-tree-status--${status}`;
}
