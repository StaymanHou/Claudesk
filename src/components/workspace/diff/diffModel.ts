// WP4 Phase B — pure model for the Sublime-Merge-style git diff viewer.
//
// No React, no IPC — types + pure reducers/helpers, vitest-tested (the repo's
// frontend posture; mirrors editorLoad.ts / editorSave.ts). DiffPanel drives the
// IPC + render; this module owns the data shapes those touch, the view-mode state
// (working dir vs. viewing a commit), the per-file collapse set, and the commit
// pagination accumulator.

// ── Backend shapes (mirror the Rust serde output) ────────────────────────────
//
// These must match the `git_diff` Rust structs byte-for-byte (serde lowercases the
// enums). git_changed_files → ChangedFile[]; git_file_hunks → FileDiff;
// git_recent_commits → CommitSummary[]; git_commit_diff → FileDiff[].

export type ChangedStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

/** One changed file as `git_changed_files` returns it (file-list entry). */
export interface ChangedFile {
  path: string;
  status: ChangedStatus;
  /** true = staged (index vs HEAD); false = unstaged (working tree vs index). */
  staged: boolean;
}

export type LineOrigin = "context" | "add" | "remove";

/** One rendered diff line (mirrors Rust `DiffLine`). */
export interface DiffLine {
  origin: LineOrigin;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

/** A contiguous `@@ … @@` hunk (mirrors Rust `Hunk`). */
export interface Hunk {
  header: string;
  lines: DiffLine[];
}

/** One changed file's full diff (mirrors Rust `FileDiff`). */
export interface FileDiff {
  path: string;
  status: ChangedStatus;
  staged: boolean;
  binary: boolean;
  hunks: Hunk[];
}

/** One commit in the history list (mirrors Rust `CommitSummary`). */
export interface CommitSummary {
  sha: string;
  short_sha: string;
  subject: string;
  author: string;
  /** Author/commit time, epoch seconds. */
  time: number;
  is_head: boolean;
}

// ── Display helpers ───────────────────────────────────────────────────────────

interface StatusMeta {
  label: string;
  /** Single-letter git-status-style badge. */
  badge: string;
}

const STATUS_META: Record<ChangedStatus, StatusMeta> = {
  added: { label: "added", badge: "A" },
  modified: { label: "modified", badge: "M" },
  deleted: { label: "deleted", badge: "D" },
  renamed: { label: "renamed", badge: "R" },
  untracked: { label: "untracked", badge: "?" },
};

/** Label + one-char badge for a status (total over the union). */
export function statusMeta(status: ChangedStatus): StatusMeta {
  return STATUS_META[status];
}

/**
 * Stable identity for a changed file. A path can appear twice (one staged + one
 * unstaged entry — see the Rust doc), so the key folds in `staged`, otherwise the
 * two rows would collide as React keys and as the collapse-set member.
 */
export function fileKey(file: { path: string; staged: boolean }): string {
  return `${file.staged ? "staged" : "unstaged"}:${file.path}`;
}

/**
 * Format an epoch-seconds timestamp as a coarse relative time ("3h ago", "2d
 * ago", "just now"). Pure given `now` (epoch seconds) so it's testable without a
 * clock; DiffPanel passes `Date.now()/1000` at render. Future times clamp to
 * "just now" (clock skew between commit time and local).
 */
export function relativeTime(epochSecs: number, nowSecs: number): string {
  const delta = Math.max(0, nowSecs - epochSecs);
  if (delta < 60) return "just now";
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ── View-mode state machine ───────────────────────────────────────────────────
//
// The files area shows EITHER the working-directory changes (default) or a
// selected commit's diff. Modeled as a reducer (mirrors editorLoad/editorSave) so
// the transition is testable and DiffPanel's setState stays out of effect bodies.

export type DiffView =
  | { kind: "working" }
  | { kind: "commit"; sha: string; subject: string };

export type DiffViewEvent =
  | { type: "view-commit"; sha: string; subject: string }
  | { type: "view-working" };

export const initialDiffView: DiffView = { kind: "working" };

export function diffViewReducer(
  state: DiffView,
  event: DiffViewEvent,
): DiffView {
  switch (event.type) {
    case "view-commit":
      return { kind: "commit", sha: event.sha, subject: event.subject };
    case "view-working":
      return initialDiffView;
    default:
      return state;
  }
}

// ── Per-file collapse set ─────────────────────────────────────────────────────
//
// Files default to EXPANDED; the set holds the keys of the COLLAPSED ones (so a
// fresh file list shows everything open without seeding the set). Pure toggle so
// DiffPanel can keep it in a single state value.

export function toggleCollapsed(
  collapsed: ReadonlySet<string>,
  key: string,
): Set<string> {
  const next = new Set(collapsed);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

export function isCollapsed(
  collapsed: ReadonlySet<string>,
  key: string,
): boolean {
  return collapsed.has(key);
}

// ── Commit pagination accumulator ─────────────────────────────────────────────
//
// The commit list loads in pages (`git_recent_commits(offset, limit)`); "Load
// more" appends the next page. `appendPage` is the pure accumulate step;
// `hasMore` decides whether to show the button (a short page = end of history).

export const COMMIT_PAGE_SIZE = 50;

/** Append a freshly-fetched page to the accumulated commit list. */
export function appendPage(
  existing: readonly CommitSummary[],
  page: readonly CommitSummary[],
): CommitSummary[] {
  return [...existing, ...page];
}

/**
 * Whether a "Load more" affordance should show: only when the last fetched page
 * came back full (=== pageSize). A short/empty page means we've reached the end of
 * history. `lastPageLen` is the length of the most recent page fetched.
 */
export function hasMore(lastPageLen: number, pageSize: number): boolean {
  return lastPageLen === pageSize && pageSize > 0;
}
