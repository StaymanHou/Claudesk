// WP10 Phase 2 — pure expand/collapse state for the FileTree.
//
// Which directories are expanded is a Set of dir paths. This module is the pure
// reducer over that Set (no React, no DOM) so it's vitest-testable — the repo
// posture (pure logic → vitest, live DOM → Playwright). The FileTree component holds
// the Set in `useReducer(treeReducer, ...)` and renders a dir's children only when
// its path is in the set.
//
// Default = COLLAPSED (empty set). Top-level dirs are NOT auto-expanded: the
// operator expands what they need, and a large project's root shouldn't dump every
// top-level dir's first level on open. (WP10 plan decision; revisit if it annoys.)

export type ExpandedDirs = ReadonlySet<string>;

export const initialExpanded: ExpandedDirs = new Set<string>();

export type TreeAction =
  | { type: "toggle"; path: string }
  | { type: "expand"; path: string }
  | { type: "collapse"; path: string }
  | { type: "collapse-all" };

/**
 * Pure reducer over the expanded-dir set. Returns a NEW set on change (so React
 * sees a new reference), or the same set when the action is a no-op (e.g. collapsing
 * an already-collapsed dir) to avoid a needless re-render.
 */
export function treeReducer(
  state: ExpandedDirs,
  action: TreeAction,
): ExpandedDirs {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.path)) {
        next.delete(action.path);
      } else {
        next.add(action.path);
      }
      return next;
    }
    case "expand": {
      if (state.has(action.path)) return state; // already expanded — no-op
      const next = new Set(state);
      next.add(action.path);
      return next;
    }
    case "collapse": {
      if (!state.has(action.path)) return state; // already collapsed — no-op
      const next = new Set(state);
      next.delete(action.path);
      return next;
    }
    case "collapse-all":
      return state.size === 0 ? state : new Set<string>();
    default:
      return state;
  }
}

/** Convenience predicate the component uses to decide whether to render children. */
export function isExpanded(state: ExpandedDirs, path: string): boolean {
  return state.has(path);
}
