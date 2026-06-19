// WP9 P1.4 — Pure helper for the "removed stale projects" toast.
//
// The picker prunes projects whose folder no longer exists (`prune_missing_projects`
// IPC) on mount; when entries were dropped it shows a dismissible toast naming how
// many. This module holds the pure message composition so it is unit-testable under
// vitest without rendering the picker (the project's frontend posture: pure logic is
// unit-tested, live DOM is Playwright-verified in verify-self).

import type { RecentProject } from "./ProjectPicker";

/**
 * Compose the toast message for a set of pruned projects, or `null` when nothing was
 * pruned (the common case — no toast shown). Singular/plural is handled so the copy
 * reads naturally for one vs many.
 */
export function pruneToastMessage(dropped: RecentProject[]): string | null {
  const n = dropped.length;
  if (n === 0) return null;
  const noun = n === 1 ? "project" : "projects";
  return `Removed ${n} ${noun} whose folder no longer exists.`;
}
