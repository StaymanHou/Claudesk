// M4 WP3 P4 — pure helpers for the user-arranged filmstrip order: the move helper and the
// drag hit-test.
//
// ⚠️ The order is NOT persisted (paydown 2026-11-04 WP6, reversing M4 WP3's localStorage
// order). It lives in `App` state as workspace ids for the app run; see `filmstripTiles.ts`
// for why (a path-keyed, persisted order slotted reopened projects into stale positions, and
// the operator ruled that a newly opened workspace always appends on the right). The old
// `claudesk.filmstripOrder` localStorage key may still sit on disk; nothing reads it.

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
