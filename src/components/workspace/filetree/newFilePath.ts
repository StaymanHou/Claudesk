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
 * Compose the project-relative path for a new file named `name` inside `dir` (a
 * project-relative dir path, or "" / null for the workspace root). Validates that the
 * name is a usable SINGLE segment — non-empty (after trim), not "." / "..", no "/" or
 * "\\" segment separators, not absolute. Returns the joined project-relative POSIX path
 * on success, or a typed rejection. Does NOT check collision — call `collides` for that.
 */
export function proposeNewFilePath(
  dir: string | null,
  name: string,
): ProposeResult {
  const trimmed = name.trim();
  if (trimmed === "") {
    return { ok: false, reason: "Enter a file name." };
  }
  // A new file is a single segment in an existing dir (v1 — no nested-dir create).
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return {
      ok: false,
      reason:
        "Name can't contain a path separator (create in an existing folder).",
    };
  }
  if (trimmed === "." || trimmed === "..") {
    return { ok: false, reason: "Invalid file name." };
  }
  // Defensive: an absolute-looking name is never a workspace-relative new file.
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    return { ok: false, reason: "Enter a name, not an absolute path." };
  }
  const base = (dir ?? "").replace(/\/+$/, "");
  const path = base === "" ? trimmed : `${base}/${trimmed}`;
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
