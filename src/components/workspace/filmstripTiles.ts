// M4 WP3 — pure tile-list derivation for the Filmstrip.
//
// The Filmstrip renders ONE tile per open workspace, INCLUDING the center-staged
// one (marked active, not excluded — so the roster is complete and the ⌘⇧+digit
// indices stay stable across switches). This module is the pure (no React/DOM/IPC)
// core: WorkspaceList + focusedId + an optional persisted project_path order →
// an ordered FilmstripTile[]. Same vitest-testable posture as workspace.ts.
//
// ORDER (P4 wires `persistedOrder` in): when a persisted order of project_paths is
// supplied, tiles render in that order. Any open workspace whose path is NOT in the
// persisted order appends at the end (in WorkspaceList order) — newly-opened
// projects show up without needing a stored entry. Persisted paths that are no
// longer open are ignored. With no persisted order (P1), tiles follow WorkspaceList
// order verbatim.

import { canonicalizeProjectPath, type Workspace } from "../../state/workspace";

/** A single filmstrip tile — the render-ready projection of a workspace. */
export interface FilmstripTile {
  id: string;
  project_path: string;
  display_name: string;
  /** True for the center-staged workspace (static, marked tile — no live mirror). */
  active: boolean;
}

/**
 * Derive the ordered filmstrip tiles.
 *
 * @param workspaces   the live WorkspaceList
 * @param focusedId    the center-staged workspace id (its tile is `active`)
 * @param persistedOrder  optional list of project_paths giving the user-arranged
 *                        order (P4); undefined/empty → WorkspaceList order.
 */
export function deriveTiles(
  workspaces: Workspace[],
  focusedId: string | null,
  persistedOrder?: readonly string[],
): FilmstripTile[] {
  const ordered = orderWorkspaces(workspaces, persistedOrder);
  return ordered.map((w) => ({
    id: w.id,
    project_path: w.project_path,
    display_name: w.display_name,
    active: w.id === focusedId,
  }));
}

/**
 * Resolve a 1-based ⌘⇧+digit switch index to the tile it promotes, or null if the
 * index is out of range (the roster is complete, so N past the tile count is a
 * genuine no-op — no Nth tile to switch to; resolved decision M4 WP3, NOT a clamp).
 * Pure so the off-by-one + out-of-range contract is pinned by a vitest test rather
 * than living only as inline `tiles[n-1]` arithmetic in App.tsx.
 */
export function tileForSwitchIndex(
  tiles: readonly FilmstripTile[],
  oneBasedIndex: number,
): FilmstripTile | null {
  if (oneBasedIndex < 1 || oneBasedIndex > tiles.length) return null;
  return tiles[oneBasedIndex - 1];
}

/**
 * Order workspaces by a persisted project_path order, appending any not-yet-ordered
 * open workspaces at the end (WorkspaceList order). Pure — used by deriveTiles and
 * reused by the ⌘⇧+digit index mapping so render order and switch index agree.
 */
export function orderWorkspaces(
  workspaces: Workspace[],
  persistedOrder?: readonly string[],
): Workspace[] {
  if (!persistedOrder || persistedOrder.length === 0) {
    return [...workspaces];
  }
  const orderKeys = persistedOrder.map(canonicalizeProjectPath);
  const remaining = [...workspaces];
  const result: Workspace[] = [];

  // First, emit workspaces in persisted order (skipping stored paths not open).
  for (const key of orderKeys) {
    const idx = remaining.findIndex(
      (w) => canonicalizeProjectPath(w.project_path) === key,
    );
    if (idx !== -1) {
      result.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  }
  // Then append any open workspace not covered by the persisted order.
  result.push(...remaining);
  return result;
}
