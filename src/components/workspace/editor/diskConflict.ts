// WP12 Phase 3 — pure decision logic for disk-change detection.
//
// On tab activation and before a save, the editor re-stats the open file (the backend
// `stat_file` → a FileMarker of mtime_ms + size) and compares it to the marker stored
// on the document when it was last loaded/saved. This module is the React-free, IPC-free
// decision: given the stored marker, the freshly-read disk marker, and whether the doc
// has unsaved edits → what to do. Vitest-testable (the repo posture: pure logic → vitest;
// mirrors editorDocs.ts / editorPanes.ts).
//
// No filesystem watcher (a later-milestone concern) — detection is this synchronous
// on-activate / pre-save check only. A file changed on disk while its tab is backgrounded
// is caught when you next activate it.

/** The on-disk marker — mirrors the backend `FileMarker` (snake_case, the IPC-DTO lesson). */
export interface FileMarker {
  mtime_ms: number;
  size: number;
}

/** Two markers are equal iff BOTH mtime and size match. A change in either = disk differs. */
export function markersEqual(
  a: FileMarker | undefined,
  b: FileMarker | undefined,
): boolean {
  if (a == null || b == null) return false;
  return a.mtime_ms === b.mtime_ms && a.size === b.size;
}

/** What to do when a document's disk state is re-checked. */
export type ConflictDecision =
  // Disk matches what we loaded (or we have no baseline yet) → do nothing but record
  // the marker. The caller stores `disk` as the new baseline.
  | "noop"
  // Disk changed and the buffer is CLEAN → silently reload from disk (re-read, advance
  // doc + savedDoc + marker). No edits to lose.
  | "reload"
  // Disk changed and the buffer is DIRTY → the operator must choose (keep mine / load
  // disk). Raise the conflict popup. No silent overwrite either direction.
  | "conflict";

/**
 * Decide what to do given the marker stored on the document (from its last load/save),
 * the marker just read from disk, and whether the doc has unsaved edits.
 *
 * - No stored marker (first stat, e.g. just loaded) OR markers equal → `"noop"` (caller
 *   records `disk` as the baseline; nothing changed).
 * - Markers differ + clean buffer → `"reload"` (safe; no edits at stake).
 * - Markers differ + dirty buffer → `"conflict"` (operator decides; never auto-overwrite).
 */
export function diskDecision(
  stored: FileMarker | undefined,
  disk: FileMarker,
  dirty: boolean,
): ConflictDecision {
  if (stored == null) return "noop"; // no baseline yet → just adopt the disk marker
  if (markersEqual(stored, disk)) return "noop";
  return dirty ? "conflict" : "reload";
}
