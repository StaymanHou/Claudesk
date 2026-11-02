// M16.5 WP5 (5.7) — the picker's row order (operator ruling, 2026-11-02).
//
// 1. Projects that are NOT open lead, most recently CLOSED first. A project never closed
//    since `last_closed_at` existed falls back to its `last_opened_at`. ("Sorted by last
//    closed, not last opened": an open stamp only records the order the morning's
//    workspaces were clicked in.)
// 2. Projects that ARE open go last, in their own group. The operator: seeing them at the
//    top is "useless information" — ⌘⇧N is for opening something that isn't open yet, and
//    switching between open workspaces is the filmstrip's job. They stay listed (clicking
//    one focuses its workspace), just out of the way.
//
// Pure (no React, no IPC) so the order is unit-testable apart from the component.

import { canonicalizeProjectPath } from "../../state/workspace";

/** The recency fields `list_projects` puts on the wire (unix epoch ms). */
export interface PickerOrderFields {
  project_path: string;
  last_opened_at?: number | null;
  last_closed_at?: number | null;
}

export interface PickerOrder<T> {
  /** Not open — most recently closed first. */
  available: T[];
  /** Already open (or opening) — shown last, marked. */
  open: T[];
}

function closedKey(p: PickerOrderFields): number {
  return p.last_closed_at ?? p.last_opened_at ?? 0;
}

export function orderPickerRows<T extends PickerOrderFields>(
  rows: readonly T[],
  openProjectPaths: Iterable<string>,
): PickerOrder<T> {
  const open = new Set(
    [...openProjectPaths].map((p) => canonicalizeProjectPath(p)),
  );
  const isOpen = (r: T) => open.has(canonicalizeProjectPath(r.project_path));
  // `sort` is stable, so equal keys keep the backend's own (recency) order.
  const available = rows
    .filter((r) => !isOpen(r))
    .sort((a, b) => closedKey(b) - closedKey(a));
  const openRows = rows
    .filter(isOpen)
    .sort((a, b) => (b.last_opened_at ?? 0) - (a.last_opened_at ?? 0));
  return { available, open: openRows };
}
