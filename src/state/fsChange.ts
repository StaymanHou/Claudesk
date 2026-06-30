// QoL-WP0 — the frontend mirror of the backend `fs_watch::FsChange` DTO + the
// `fs-change` event name. snake_case field names VERBATIM (the IPC-DTO casing
// convention, SURFACE-2026-06-21: Tauri does NOT camelCase-convert command/event
// payloads, so the TS type must mirror the serde field names exactly).
//
// The watcher emits one debounced, gitignore-filtered FsChange per workspace on every
// external on-disk change under that workspace's root. Consumers (the FileTree rail,
// open editor docs) subscribe to FS_CHANGE_EVENT and act on the matching workspace_id.

/** The Tauri event the backend `fs_watch` watcher emits. Mirrors `FS_CHANGE_EVENT`. */
export const FS_CHANGE_EVENT = "fs-change";

/** Coarse change kind — mirrors backend `FsKind` (snake_case). A hint only; the
 *  authoritative signal is `paths`. */
export type FsChangeKind =
  | "created"
  | "modified"
  | "removed"
  | "renamed"
  | "other";

/** One debounced filesystem-change notification for a single workspace. `paths` are
 *  project-relative POSIX strings, already ignore-filtered (every path is one the
 *  FileTree would show) and NEVER include `.git/`-internal paths. `git_meta` (WP9) is
 *  the git-status-only signal: true when the batch touched a `.git/` meta path
 *  (index/HEAD/MERGE_HEAD/refs) — i.e. a `git add`/commit/stash/checkout that flips a
 *  file's status with no working-tree change. Route it to a git-status re-fetch ONLY,
 *  never a tree re-walk. The backend never emits with `paths` empty AND `git_meta`
 *  false — a consumer always has at least one path, the git-meta signal, or both. */
export interface FsChange {
  workspace_id: string;
  paths: string[];
  kind: FsChangeKind;
  git_meta: boolean;
}

/**
 * Whether an `fs-change` event applies to a given workspace — the watcher broadcasts
 * one event channel, so each consumer filters by its own workspace_id. Pure (the one
 * piece of consumer logic worth a unit test; the key-bump + re-walk it gates live in
 * the component effect, which the repo's no-jsdom posture leaves to verify-human).
 */
export function appliesToWorkspace(
  change: FsChange,
  workspaceId: string,
): boolean {
  return change.workspace_id === workspaceId;
}
