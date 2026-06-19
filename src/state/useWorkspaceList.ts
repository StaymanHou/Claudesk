// WP5 — React binding for the WorkspaceList reducer (src/state/workspace.ts).
//
// Thin useState wrapper. Kept separate from the pure reducer so the reducer
// stays unit-testable without React. Phase 2 may swap this for a Zustand store
// without touching the reducer or components that consume the returned API.

import { useCallback, useMemo, useState } from "react";
import {
  emptyWorkspaceList,
  focusWorkspace as focusReducer,
  openWorkspace as openReducer,
  setSessionId as setSessionIdReducer,
  type Workspace,
  type WorkspaceListState,
} from "./workspace";
import { viewFor, type AppView } from "./appView";

export interface WorkspaceListApi {
  workspaces: Workspace[];
  focusedId: string | null;
  focused: Workspace | null;
  /** Derived app-shell view: "picker" when nothing is open, else "workspace-open". */
  view: AppView;
  openWorkspace: (projectPath: string) => void;
  focusWorkspace: (id: string) => void;
  /** Store the backend CC session id on a workspace once cc_spawn resolves (WP7). */
  setSessionId: (id: string, ccSessionId: string) => void;
}

export function useWorkspaceList(
  initial: WorkspaceListState = emptyWorkspaceList,
): WorkspaceListApi {
  const [state, setState] = useState<WorkspaceListState>(initial);

  const openWorkspace = useCallback((projectPath: string) => {
    setState((s) => openReducer(s, projectPath));
  }, []);

  const focusWorkspace = useCallback((id: string) => {
    setState((s) => focusReducer(s, id));
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
    setSessionId,
  };
}
