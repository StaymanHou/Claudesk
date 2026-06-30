// WP5 — Workspace data model + WorkspaceList state.
//
// The WorkspaceList holds an ARRAY of workspaces and tracks a focused id.
// Through M1–M3 the array length was held to <= 1 by an explicit clamp in
// `openWorkspace` (open REPLACED the single workspace). M4 WP2 lifts that clamp:
// opening a project now APPENDS a new workspace (and switches the center stage
// to it), so N projects coexist — re-opening an already-open project focuses
// the existing one instead of spawning a duplicate.
//
// Pure data + reducer logic only — no React, no IPC. The picker and the real
// config store / PtyCcSession (WP6/WP7) drive these actions.

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

/**
 * Normalize a project path for "is this the same project already open?" comparison
 * (the WP2 reopen-focuses-existing dedup).
 *
 * This is a STRING-level normalization (trim trailing slashes), NOT a filesystem
 * canonicalization. The reducer is pure TS with no disk access, so it cannot run
 * the backend's `Path::canonicalize()` (symlink/`..` resolution) — that stronger
 * canonicalization lives in the Rust status-broadcaster registry
 * (`status_broadcaster/mod.rs::canonical_key`) as a separate layer. The two agree
 * on the realistic dup case (the picker hands back the same path string, possibly
 * with/without a trailing slash); a symlinked-alias path that resolves to the same
 * dir is a non-goal here (the backend registry still de-dupes those server-side).
 */
export function canonicalizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\/+$/, "");
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
 * M4 WP2 — N>1: APPEND a new workspace and focus it, so N projects coexist (the
 * center stage switches to the new one; every other workspace stays mounted in
 * the background, PTY + panel state intact, per the "all workspaces stay mounted"
 * rule). This replaces the M1–M3 N<=1 clamp that REPLACED the single workspace.
 *
 * REOPEN = FOCUS, NOT DUPLICATE: if a workspace whose path normalizes to the same
 * value (see `canonicalizeProjectPath`) is already open, focus that existing
 * workspace and append nothing — no second CC session for the same directory.
 */
export function openWorkspace(
  state: WorkspaceListState,
  projectPath: string,
): WorkspaceListState {
  const key = canonicalizeProjectPath(projectPath);
  const existing = state.workspaces.find(
    (w) => canonicalizeProjectPath(w.project_path) === key,
  );
  if (existing) {
    // Already open → focus it, mint no new workspace / CC session.
    return { ...state, focusedId: existing.id };
  }
  const ws = makeWorkspace(projectPath);
  return { workspaces: [...state.workspaces, ws], focusedId: ws.id };
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
 * Close a workspace (QoL-WP1): remove it from the list and re-pick `focusedId`.
 *
 * Closing is the explicit EXCEPTION to the "all workspaces stay mounted" rule — the
 * workspace is genuinely removed from the array, so its `<Workspace>` truly unmounts and
 * tears down its panes (the per-pane `cc_kill` on unmount reaps both PTY sessions) and
 * its status-registry entry + filesystem watcher (the `useWorkspaceStatus` diff loop sees
 * the id leave the array and fires `workspace_deregister` + `workspace_watch_stop`).
 *
 * Focus re-pick:
 *   - Closing a NON-focused workspace → `focusedId` unchanged.
 *   - Closing the FOCUSED workspace with others remaining → promote the ARRAY-index-left
 *     neighbour (or the new leftmost, index 0, if the closed one was leftmost). Array
 *     order coincides with filmstrip order in the common case (no custom drag-order); a
 *     custom-ordered roster promoting the array-left rather than the visual-left neighbour
 *     is an accepted v1 imperfection that keeps this reducer pure (resolved-decision Q1).
 *   - Closing the LAST workspace → `focusedId: null` (the derived view flips to "picker").
 *
 * No-op (returns the SAME state reference) if the id is unknown.
 */
export function closeWorkspace(
  state: WorkspaceListState,
  id: string,
): WorkspaceListState {
  const idx = state.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return state; // unknown id → no-op

  const workspaces = state.workspaces.filter((w) => w.id !== id);

  // Closed a NON-focused workspace: drop it, keep focus where it was.
  if (state.focusedId !== id) {
    return { workspaces, focusedId: state.focusedId };
  }

  // Closed the focused one: promote the left neighbour (the workspace now at idx-1
  // in the FILTERED list), or the new leftmost if it was index 0, or null if empty.
  const focusedId =
    workspaces.length === 0 ? null : workspaces[Math.max(0, idx - 1)].id;
  return { workspaces, focusedId };
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
