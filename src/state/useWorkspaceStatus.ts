// M3 WP6 — live workspace-status subscription + open/close registration wiring.
//
// This hook is the runtime glue between WP4's backend broadcaster and the pure
// `workspaceStatus` model. It does TWO things, both keyed off the live workspace
// list:
//   1. SUBSCRIBE: `listen<WorkspaceStatusUpdate>("workspace-status")` once, folding
//      each update into a `WorkspaceStatusMap` via the pure `applyStatusUpdate`.
//      The indicator reads its workspace's state via `stateFor` (Unknown until an
//      event arrives — the honest default).
//   2. REGISTER: as workspaces open/close, `invoke("workspace_register" /
//      "workspace_deregister", …)` so WP4's cwd→workspace match has the mapping.
//      Without this the broadcaster drops every event (no registered path) and the
//      indicator stays Unknown forever — registration is what makes the chain live.
//
// Registration is driven by DIFFING the workspace list in an effect (not by
// hooking the openWorkspace callback) so the Phase-1 N≤1 replace — which swaps the
// whole array — correctly deregisters the outgoing path and registers the incoming
// one. This generalizes to Phase 2 multi-workspace open/close without change.
//
// The `listen`/`invoke` wiring is NOT unit-tested (runtime-bound, same posture as
// XtermPane's listeners + the WP4 emit). The pure fold/lookup it delegates to
// (`applyStatusUpdate`/`stateFor`) is covered in workspaceStatus.test.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriListen } from "../useTauriListen";
import {
  applyStatusUpdate,
  emptyStatusMap,
  snippetFor,
  stateFor,
  WORKSPACE_STATUS_EVENT,
  type WireWorkspaceState,
  type WorkspaceStatusMap,
  type WorkspaceStatusUpdate,
} from "./workspaceStatus";
import type { Workspace } from "./workspace";

export interface WorkspaceStatusApi {
  /** The live state for a workspace id — Unknown until its first hook event. */
  stateFor: (workspaceId: string) => WireWorkspaceState;
  /** The last prompt/message snippet for a workspace id (tooltip), if any. */
  snippetFor: (workspaceId: string) => string | undefined;
}

export function useWorkspaceStatus(
  workspaces: Workspace[],
): WorkspaceStatusApi {
  const [statusMap, setStatusMap] =
    useState<WorkspaceStatusMap>(emptyStatusMap);

  // 1. Subscribe once to the broadcaster. The listener lives for the app's
  //    lifetime; each update folds into the map by workspace_id (verbatim key).
  //    The async-listen + teardown-before-resolve guard lives in useTauriListen.
  useTauriListen<WorkspaceStatusUpdate>(WORKSPACE_STATUS_EVENT, (event) =>
    setStatusMap((map) => applyStatusUpdate(map, event.payload)),
  );

  // 2. Register/deregister as the workspace list changes. We track the set of
  //    (id → project_path) we've registered; on each list change we register any
  //    new id and deregister any path whose workspace is gone. A failed invoke is
  //    surfaced (console), never swallowed — a missing registration silently
  //    breaks status, so it must be visible (the WP6-picker / WP7-M2 lesson).
  const registeredRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const registered = registeredRef.current;
    const liveIds = new Set(workspaces.map((w) => w.id));

    // Deregister workspaces that are no longer present (e.g. the N≤1 replace, or a
    // QoL-WP1 close). Also STOP that workspace's filesystem watcher (QoL-WP0) — the
    // watcher's lifecycle is the same as the status registration's, so it rides the
    // same diff loop. (When WP1's closeWorkspace removes a workspace from the list,
    // this fires and tears down both for free.)
    for (const [id, projectPath] of registered) {
      if (!liveIds.has(id)) {
        registered.delete(id);
        void invoke("workspace_deregister", { projectPath }).catch((err) => {
          console.error(`workspace_deregister failed for ${projectPath}:`, err);
        });
        void invoke("workspace_watch_stop", { workspaceId: id }).catch(
          (err) => {
            console.error(`workspace_watch_stop failed for ${id}:`, err);
          },
        );
      }
    }

    // Register newly-opened workspaces AND start their filesystem watcher (QoL-WP0)
    // so the FileTree auto-refreshes + open editor docs live-reload on external
    // on-disk changes. A failed watch_start is surfaced (console), never swallowed —
    // a missing watcher silently lets the tree/editor go stale.
    for (const ws of workspaces) {
      if (!registered.has(ws.id)) {
        registered.set(ws.id, ws.project_path);
        void invoke("workspace_register", {
          projectPath: ws.project_path,
          workspaceId: ws.id,
        }).catch((err) => {
          console.error(`workspace_register failed for ${ws.id}:`, err);
        });
        void invoke("workspace_watch_start", {
          projectPath: ws.project_path,
          workspaceId: ws.id,
        }).catch((err) => {
          console.error(`workspace_watch_start failed for ${ws.id}:`, err);
        });
      }
    }
  }, [workspaces]);

  // Memoize the accessors on `statusMap` so a re-render that doesn't change the map
  // doesn't hand each per-workspace consumer (CenterStage, filmstrip tiles) a fresh
  // closure — keeps the lookup chain from re-running as the workspace list grows (N>1).
  const stateForCb = useCallback(
    (workspaceId: string) => stateFor(statusMap, workspaceId),
    [statusMap],
  );
  const snippetForCb = useCallback(
    (workspaceId: string) => snippetFor(statusMap, workspaceId),
    [statusMap],
  );

  return {
    stateFor: stateForCb,
    snippetFor: snippetForCb,
  };
}
