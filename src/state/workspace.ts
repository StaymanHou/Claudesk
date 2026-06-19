// WP5 — Workspace data model + WorkspaceList state.
//
// This is the Phase 2-ready shape: the WorkspaceList holds an ARRAY of
// workspaces and tracks a focused id. In Phase 1 the array length is held to
// <= 1 by an explicit invariant (see `openWorkspace`); Phase 2 lifts that cap
// (WP13 multi-workspace UX) without reshaping this module.
//
// Pure data + reducer logic only — no React, no IPC. The picker (Phase 2) and
// the real config store / PtyCcSession (WP6/WP7) drive these actions later.

export type WorkspaceStatus = "idle" | "running" | "awaiting-input" | "unknown";

export interface Workspace {
  id: string;
  project_path: string;
  /** Set by WP7 when a real CC PTY session is spawned. Null in the WP5 mock. */
  cc_session_id: string | null;
  status: WorkspaceStatus;
  display_name: string;
}

/** Derive a human-friendly name from a project path (last path segment). */
export function deriveDisplayName(projectPath: string): string {
  const trimmed = projectPath.replace(/\/+$/, "");
  const segment = trimmed.split("/").pop();
  return segment && segment.length > 0 ? segment : projectPath;
}

let idCounter = 0;
/**
 * Mintable workspace id. Phase 1 uses a monotonic counter (deterministic,
 * test-friendly, and `Math.random`/`Date.now` are unavailable in some harness
 * contexts). WP7 replaces this with the backend-issued session id.
 */
function nextWorkspaceId(): string {
  idCounter += 1;
  return `ws-${idCounter}`;
}

/** Factory with the documented Phase 1 defaults. */
export function makeWorkspace(
  projectPath: string,
  overrides: Partial<Workspace> = {},
): Workspace {
  return {
    id: nextWorkspaceId(),
    project_path: projectPath,
    cc_session_id: null,
    status: "idle",
    display_name: deriveDisplayName(projectPath),
    ...overrides,
  };
}

export interface WorkspaceListState {
  workspaces: Workspace[];
  focusedId: string | null;
}

export const emptyWorkspaceList: WorkspaceListState = {
  workspaces: [],
  focusedId: null,
};

/**
 * Open a workspace for `projectPath` and focus it.
 *
 * PHASE 1 INVARIANT: at most one workspace exists. If a workspace is already
 * open we REPLACE it (and focus the new one) rather than append — Phase 1 only
 * ever shows a single project. Phase 2 (WP13) removes this clamp so opening a
 * project appends a new workspace and switches the center stage to it.
 */
export function openWorkspace(
  _state: WorkspaceListState,
  projectPath: string,
): WorkspaceListState {
  const ws = makeWorkspace(projectPath);
  // Phase 1 N<=1 clamp: replace any existing workspace.
  return { workspaces: [ws], focusedId: ws.id };
}

/** Focus an already-open workspace by id (no-op if id is unknown). */
export function focusWorkspace(
  state: WorkspaceListState,
  id: string,
): WorkspaceListState {
  if (!state.workspaces.some((w) => w.id === id)) return state;
  return { ...state, focusedId: id };
}

/**
 * Record the backend-issued CC session id on a workspace (WP7). Called when
 * `cc_spawn` resolves. No-op if the workspace id is unknown.
 */
export function setSessionId(
  state: WorkspaceListState,
  id: string,
  ccSessionId: string,
): WorkspaceListState {
  if (!state.workspaces.some((w) => w.id === id)) return state;
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === id ? { ...w, cc_session_id: ccSessionId } : w,
    ),
  };
}
