// QoL-WP5 — pure helpers for the editor's "new file" create flow.
//
// Composes a project-relative POSIX path from a target directory + a typed name, and
// reports whether that path collides with an existing tree entry. NO filesystem IO and
// no React/DOM — the actual create is `write_file` (RightPanelHost), confined to the
// workspace root by the backend `resolve_within` guard. This module is the pure,
// vitest-testable validation + path-composition layer (repo posture: pure logic →
// vitest; same split as buildTree.ts / newFileChord.ts).
//
// SCOPE (v1): the name is a single path segment created in an EXISTING directory (the
// workspace root, or `dir` if supplied). The backend's `resolve_within` requires the
// target's parent dir to already exist, so a name containing "/" (which would imply a
// new intermediate dir) is REJECTED here rather than handed to a write that would fail
// with a confusing Io error. Recursive/`mkdir -p` create is out of scope (matches the
// directory-delete-out-of-scope decision).

/** A rejected name carries a human-readable reason for the inline error row. */
export type ProposeResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/**
 * Validate a project-relative path's SEGMENTS — each non-empty, not "." / "..", and the
 * whole thing not absolute (`/`- or `~`-leading). Backslash is treated as a separator too
 * (defensive on a macOS-only app). Returns null on success, or a human-readable reason.
 * QoL-WP5b: shared by the file + dir proposers; the segment rules mirror the backend's
 * lexical guard (reject `..`/empty/absolute) so the UI rejects before the IPC does.
 */
function validateRelSegments(trimmed: string): string | null {
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    return "Enter a name, not an absolute path.";
  }
  const segments = trimmed.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === "") return "Path has an empty segment (no leading/trailing/double /).";
    if (seg === "." || seg === "..") return "Path can't contain '.' or '..'.";
  }
  return null;
}

/**
 * Compose the project-relative path for a new file named `name` inside `dir` (a
 * project-relative dir path, or "" / null for the workspace root).
 *
 * QoL-WP5b: `allowNested` controls whether `name` may carry a relative sub-path. When
 * `false` (default — the Phase-1 behavior) the name must be a single segment and any
 * separator is rejected. When `true` (the nested-file create) a `/`-bearing name like
 * `sub/new.txt` is allowed — the parent dirs are created (`mkdir -p`) by the caller via
 * the `create_dir` IPC before the write. Either way every segment is validated (non-empty,
 * not "." / ".."), and an absolute name is rejected. Does NOT check collision — call
 * `collides` for that.
 */
export function proposeNewFilePath(
  dir: string | null,
  name: string,
  allowNested = false,
): ProposeResult {
  const trimmed = name.trim();
  if (trimmed === "") {
    return { ok: false, reason: "Enter a file name." };
  }
  if (!allowNested && (trimmed.includes("/") || trimmed.includes("\\"))) {
    return {
      ok: false,
      reason:
        "Name can't contain a path separator (create in an existing folder).",
    };
  }
  const segErr = validateRelSegments(trimmed);
  if (segErr) return { ok: false, reason: segErr };
  const base = (dir ?? "").replace(/\/+$/, "");
  // Normalize the nested name's separators to POSIX (a macOS-only app, but defensive).
  const rel = trimmed.replace(/\\/g, "/");
  const path = base === "" ? rel : `${base}/${rel}`;
  return { ok: true, path };
}

/**
 * Compose the project-relative path for a NEW DIRECTORY named `name` inside `dir` (QoL-WP5b
 * — the "new folder" affordance). A nested path (`a/b`) is allowed (the backend
 * `create_dir` does `mkdir -p`); every segment is validated (non-empty, not "." / ".."),
 * absolute rejected. Returns the joined project-relative POSIX path, or a typed rejection.
 * Does NOT check collision (a folder that already exists is an idempotent no-op on the
 * backend, so the caller may choose to allow or guard it).
 */
export function proposeNewDirPath(
  dir: string | null,
  name: string,
): ProposeResult {
  // A trailing slash on a folder name is benign ("dir/" means the dir "dir") — strip it
  // BEFORE segment validation so it isn't read as an empty trailing segment.
  const trimmed = name.trim().replace(/[/\\]+$/, "");
  if (trimmed === "") {
    return { ok: false, reason: "Enter a folder name." };
  }
  const segErr = validateRelSegments(trimmed);
  if (segErr) return { ok: false, reason: segErr };
  const base = (dir ?? "").replace(/\/+$/, "");
  const rel = trimmed.replace(/\\/g, "/");
  const path = base === "" ? rel : `${base}/${rel}`;
  return { ok: true, path };
}

/**
 * Whether `path` already exists in the set of current tree paths (project-relative
 * POSIX, the same strings `fs_tree` / buildTree use). Used to block a create that would
 * clobber an existing file. Exact-match only — the backend `write_file` would overwrite
 * silently, so this is the guard that turns "create" into "create new, don't clobber".
 */
export function collides(
  path: string,
  existingPaths: Iterable<string>,
): boolean {
  for (const p of existingPaths) {
    if (p === path) return true;
  }
  return false;
}
