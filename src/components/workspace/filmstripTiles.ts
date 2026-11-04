// M4 WP3 — pure tile-list derivation for the Filmstrip.
//
// The Filmstrip renders ONE tile per open workspace, INCLUDING the center-staged
// one (marked active, not excluded — so the roster is complete and the ⌘⇧+digit
// indices stay stable across switches). This module is the pure (no React/DOM/IPC)
// core: WorkspaceList + focusedId + an optional drag-arranged order of workspace ids →
// an ordered FilmstripTile[]. Same vitest-testable posture as workspace.ts.
//
// ORDER: tiles render in the dragged order, and any open workspace not in it appends at the
// end (in WorkspaceList order). ⚠️ The order is keyed by workspace ID, not project path
// (paydown 2026-11-04 WP6, operator ask: "the newly open workspace just always gets
// appended to the right"). Every open mints a fresh id (`openWorkspace` → `makeWorkspace`),
// so a newly opened workspace is never in the order and always lands on the RIGHT, even a
// project that sat elsewhere earlier. The path-keyed, localStorage-persisted order that
// M4 WP3 shipped slotted a reopened project back into its old dragged position, which read
// as random. Ids no longer open are ignored. With no order, tiles follow WorkspaceList order.

import type { Workspace } from "../../state/workspace";
import { reorder } from "./filmstripOrder";

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
 * @param orderIds     optional workspace ids in the user's dragged order;
 *                     undefined/empty → WorkspaceList order.
 */
export function deriveTiles(
  workspaces: Workspace[],
  focusedId: string | null,
  orderIds?: readonly string[],
): FilmstripTile[] {
  const ordered = orderWorkspaces(workspaces, orderIds);
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
 * The order a drag leaves behind: the tiles with `from` moved to `to`, as workspace IDS. The
 * one place the order's key is chosen, so `App` and the tests cannot disagree on it. ⚠️ Ids,
 * never paths: a path key puts a reopened project back into its old slot instead of on the
 * right.
 */
export function orderAfterDrag(
  tiles: readonly FilmstripTile[],
  from: number,
  to: number,
): string[] {
  return reorder(tiles, from, to).map((t) => t.id);
}

/**
 * Order workspaces by a dragged order of workspace ids, appending any open workspace not in
 * it at the end (WorkspaceList order), which is where every newly opened workspace lands.
 * Pure — used by deriveTiles and reused by the ⌘⇧+digit index mapping so render order and
 * switch index agree.
 */
export function orderWorkspaces(
  workspaces: Workspace[],
  orderIds?: readonly string[],
): Workspace[] {
  if (!orderIds || orderIds.length === 0) {
    return [...workspaces];
  }
  const remaining = [...workspaces];
  const result: Workspace[] = [];

  // First, emit workspaces in the dragged order (skipping ids no longer open).
  for (const id of orderIds) {
    const idx = remaining.findIndex((w) => w.id === id);
    if (idx !== -1) {
      result.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  }
  // Then append any open workspace not in the dragged order: every new open.
  result.push(...remaining);
  return result;
}
