// WP5 — React binding for the WorkspaceList reducer (src/state/workspace.ts).
//
// Thin useState wrapper. Kept separate from the pure reducer so the reducer
// stays unit-testable without React. Phase 2 may swap this for a Zustand store
// without touching the reducer or components that consume the returned API.

import { useCallback, useMemo, useState } from "react";
import {
  closeWorkspace as closeReducer,
  emptyWorkspaceList,
  focusWorkspace as focusReducer,
  openWorkspace as openReducer,
  setSessionId as setSessionIdReducer,
  type Workspace,
  type WorkspaceListState,
} from "./workspace";
import { viewFor, type AppView } from "./appView";
import type { AutoResumeAction, OpenIntent } from "./predictAction";

export interface WorkspaceListApi {
  workspaces: Workspace[];
  focusedId: string | null;
  focused: Workspace | null;
  /** Derived app-shell view: "picker" when nothing is open, else "workspace-open". */
  view: AppView;
  /** Open (or focus) a project. `pendingAction` (M12 WP3) rides onto the NEW workspace's
   *  record for its spawn to consume; it is dropped when the path is already open, since a
   *  focus has no spawn to apply it to. */
  openWorkspace: (
    projectPath: string,
    pendingAction?: AutoResumeAction,
    openIntent?: OpenIntent,
  ) => void;
  /** Promote an already-open workspace to center stage by id (M4 WP3 — filmstrip
   *  tile click + ⌘⇧+digit both route through this). No-op if id is unknown. */
  focusWorkspace: (id: string) => void;
  /** Close a workspace by id and re-pick the focus (QoL-WP1 — filmstrip-tile ×).
   *  Removing it from the list also tears down its panes + status registration +
   *  watcher (see `closeWorkspace` in workspace.ts). No-op if id is unknown. */
  closeWorkspace: (id: string) => void;
  /** Store the backend CC session id on a workspace once cc_spawn resolves (WP7). */
  setSessionId: (id: string, ccSessionId: string) => void;
}

export function useWorkspaceList(
  initial: WorkspaceListState = emptyWorkspaceList,
): WorkspaceListApi {
  const [state, setState] = useState<WorkspaceListState>(initial);

  const openWorkspace = useCallback(
    (
      projectPath: string,
      pendingAction: AutoResumeAction = null,
      openIntent: OpenIntent = "fire",
    ) => {
      setState((s) => openReducer(s, projectPath, pendingAction, openIntent));
    },
    [],
  );

  const focusWorkspace = useCallback((id: string) => {
    setState((s) => focusReducer(s, id));
  }, []);

  const closeWorkspace = useCallback((id: string) => {
    setState((s) => closeReducer(s, id));
  }, []);

  const setSessionId = useCallback((id: string, ccSessionId: string) => {
    setState((s) => setSessionIdReducer(s, id, ccSessionId));
  }, []);

  const focused = useMemo(
    () => state.workspaces.find((w) => w.id === state.focusedId) ?? null,
    [state.workspaces, state.focusedId],
  );

  return {
    workspaces: state.workspaces,
    focusedId: state.focusedId,
    focused,
    view: viewFor(state),
    openWorkspace,
    focusWorkspace,
    closeWorkspace,
    setSessionId,
  } satisfies WorkspaceListApi;
}
