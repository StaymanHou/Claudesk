// WP5 — App-shell view state machine.
//
// Two views: the Project Picker, or an open workspace. The view is DERIVED from
// WorkspaceList state rather than stored separately — a single source of truth
// avoids the picker and the list disagreeing. Phase 2 (multi-workspace) keeps
// the same rule: any focused workspace → workspace-open.
//
// Kept as a pure function (no React) so the transition is unit-testable.

import type { WorkspaceListState } from "./workspace";

export type AppView = "picker" | "workspace-open";

export function viewFor(state: WorkspaceListState): AppView {
  return state.focusedId !== null && state.workspaces.length > 0
    ? "workspace-open"
    : "picker";
}
