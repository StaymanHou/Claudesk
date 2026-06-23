// M4 WP3 P4 — pure helpers for the user-arranged, persisted filmstrip order.
//
// The order is a list of project_paths (NOT the per-session `ws-N` ids, which reset on
// every launch — a path-keyed order survives a restart; resolved decision in the WIP
// open-questions). It is the single source of truth for BOTH tile render order and the
// ⌘⇧+digit index (`deriveTiles` consumes it via `orderWorkspaces`). This module is the
// pure (no React/DOM beyond localStorage) core: the move helper + the load/save, same
// posture + error-swallowing discipline as filetree/railWidth.ts.

import { canonicalizeProjectPath } from "../../state/workspace";

/** localStorage key for the persisted filmstrip order (app-global UI chrome). */
export const FILMSTRIP_ORDER_KEY = "claudesk.filmstripOrder";

/**
 * Move the item at `from` to `to`, returning a NEW array (immutable). Out-of-range
 * indices return the array unchanged (clamped no-op) — defensive against a drag event
 * that reports a stale index. Pure → vitest-testable.
 */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length ||
    from === to
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The index the dragged tile should move to, given the horizontal MIDPOINTS of all tiles
 * (in current render order), the dragged tile's current index, and the pointer's x.
 *
 * Counts how many OTHER tiles (excluding the dragged one at `fromIndex`) the pointer has
 * passed — i.e. whose midpoint is left of the pointer. This is direction-SYMMETRIC: it
 * works identically dragging left or right. The earlier "compare against every tile's
 * midpoint incl. the dragged one" math was off-by-one moving LEFT, because the dragged
 * tile's own rect blocked the target slot (P4 verify-human r2 "only moves right"). Pure
 * (the DOM `getBoundingClientRect` read stays in the component) → vitest-testable.
 */
export function insertionIndex(
  midpoints: readonly number[],
  fromIndex: number,
  clientX: number,
): number {
  let count = 0;
  for (let i = 0; i < midpoints.length; i++) {
    if (i === fromIndex) continue;
    if (clientX > midpoints[i]) count++;
  }
  return count;
}

/**
 * Read the persisted order (a list of canonicalized project_paths). Returns [] when
 * nothing is stored, the value is unparseable, or localStorage is unavailable — never
 * throws. [] means "no user arrangement yet" → `orderWorkspaces` falls back to
 * WorkspaceList order.
 */
export function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(FILMSTRIP_ORDER_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only strings, canonicalized (trailing-slash normalized) for stable matching.
    return parsed
      .filter((p): p is string => typeof p === "string")
      .map(canonicalizeProjectPath);
  } catch {
    return [];
  }
}

/** Persist the order (a list of project_paths, canonicalized). Best-effort — swallows
 *  storage errors (quota / unavailable), same as railWidth.saveRailWidth. */
export function saveOrder(projectPaths: readonly string[]): void {
  try {
    const canonical = projectPaths.map(canonicalizeProjectPath);
    localStorage.setItem(FILMSTRIP_ORDER_KEY, JSON.stringify(canonical));
  } catch {
    /* storage unavailable / quota — a non-persisted order is acceptable */
  }
}
