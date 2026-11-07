// The workspace header's drive-mode APPLY chain: the stored value, the broadcast re-sync, and the
// stage → confirm → persist → wait-for-idle → respawn operation (M13.5 WP4 P3–P4), extracted from
// `Workspace.tsx` at paydown 2026-11-04 WP12.
//
// The readout's reveal read stays in `Workspace` because it shares one effect with the supervisor
// toggle's read; it writes back through `setStoredDriveMode`. The select editor's open/closed
// state stays there too: it is render state for the header, and `chooseDriveMode` only stages.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { listen } from "@tauri-apps/api/event";
import type { WireWorkspaceState } from "../../state/workspaceStatus";
import type { XtermPaneHandle } from "./XtermPane";
import {
  driveModeWriteFor,
  waitForIdle,
  type DriveModeOutcome,
} from "./applyDriveMode";
import { driveModeChanged } from "../../cc/driveMode";
import {
  PROJECT_DRIVE_MODE_EVENT,
  setProjectDefaultDriveMode,
  type DriveMode,
  type ProjectDriveModeChanged,
} from "../../cc/driveModeIpc";
import type { SpawnIntentRef } from "../../cc/spawnArgs";

export interface DriveModeApplyInput {
  projectPath: string;
  workflowEnabled: boolean;
  statusState: WireWorkspaceState;
  sessionLive: boolean;
  ccPaneRef: RefObject<XtermPaneHandle | null>;
}

export function useDriveModeApply({
  projectPath,
  workflowEnabled,
  statusState,
  sessionLive,
  ccPaneRef,
}: DriveModeApplyInput) {
  // What the NEXT spawn will use (`projects.json`). `Workspace` reads the RUNNING value separately:
  // a live process's env is fixed, so the two can disagree, and the disagreement is the readout.
  const [storedDriveMode, setStoredDriveMode] = useState<DriveMode | null>(
    null,
  );
  // ⚠️ P3.5 — the persisted value, readable OUTSIDE a state updater. React StrictMode
  // double-invokes updater callbacks, so a `persist()` called inside one fires TWO IPC writes
  // per user action — the exact defect that shipped in M10.9 WP2's `useSettingControl` and was
  // caught at code review, not by tests. The picker cell carries the same ref for the same
  // reason. `useSupervisor` reads it too, at fire time.
  const storedDriveModeRef = useRef<DriveMode | null>(null);
  useEffect(() => {
    storedDriveModeRef.current = storedDriveMode;
  }, [storedDriveMode]);

  // The mode the operator picked but has NOT yet confirmed. Non-null ⇒ the confirm is open.
  // ⚠️ Held as state rather than written straight through, which is the whole of P4.2: Cancel
  // must leave `projects.json` byte-identical.
  const [pendingDriveMode, setPendingDriveMode] = useState<{
    next: DriveMode | null;
  } | null>(null);
  // An apply has been confirmed and persisted; the respawn is owed. Stays true while the agent
  // is busy, which is what makes "wait until idle" a queue rather than a dropped click.
  const [respawnWanted, setRespawnWanted] = useState(false);
  // The one-shot intent the respawn's spawn takes (see `cc/spawnArgs.ts`). Passed to the CC pane.
  const spawnIntentRef = useRef<SpawnIntentRef["current"]>(null);

  // Mirrors of the live status and session liveness, readable from inside the async apply. A
  // value captured at click time would poll a frozen status.
  const statusStateRef = useRef(statusState);
  useEffect(() => {
    statusStateRef.current = statusState;
  }, [statusState]);
  const sessionLiveRef = useRef(sessionLive);
  useEffect(() => {
    sessionLiveRef.current = sessionLive;
  }, [sessionLive]);

  // Abort an in-flight apply when this workspace unmounts. Closing a workspace removes it from
  // the WorkspaceList, so this genuinely unmounts; without the abort a queued apply kept polling
  // for up to `IDLE_WAIT_MS` after the workspace was gone. Same shape as `Workspace`'s
  // `recycleAbortRef`, and a ref for the same reason.
  const applyAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      applyAbortRef.current?.abort();
    },
    [],
  );

  // ⚠️ P4.2 — CHOOSING A MODE DOES NOT WRITE. It stages a PENDING value and raises the confirm;
  // only Apply persists. Cancel must leave `projects.json` byte-identical, and a
  // persisted-but-not-respawned mode is the "looks live and is not" state AC-5 exists to prevent.
  const chooseDriveMode = useCallback((next: DriveMode | null) => {
    // ⚠️ Unchanged pick → no dialog, no write. `driveModeChanged` also suppresses the redundant
    // whole-file read-modify-write of `projects.json`
    // (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`). Compared against the REF,
    // not the state, for the StrictMode reason above.
    if (!driveModeChanged(next, storedDriveModeRef.current)) return;
    setPendingDriveMode({ next });
  }, []);

  // Apply: persist, then respawn — immediately if the agent is idle, otherwise as soon as it is.
  //
  // ⚠️ **ONE ASYNC OPERATION IN A HANDLER, not an effect-driven state machine.** Three attempts
  // at the latter were each rejected by eslint's `react-hooks` rule (setState-in-effect /
  // refs-during-render), and the rule was right: sequencing an imperative multi-step operation
  // is not what effects are for. `recycleSession` — the app's other multi-step operation — has
  // exactly this shape, so this follows that precedent instead of inventing a second one.
  const startApply = useCallback(
    (next: DriveMode | null) => {
      const previous = storedDriveModeRef.current;
      // Optimistic local apply; the broadcast arrives and sets the same value, idempotently.
      storedDriveModeRef.current = next;
      setStoredDriveMode(next);
      setRespawnWanted(true);
      const ac = new AbortController();
      applyAbortRef.current = ac;

      void (async () => {
        try {
          await setProjectDefaultDriveMode(projectPath, next);
        } catch (e) {
          // After an unmount there is no readout left to revert, and nothing to tell.
          if (ac.signal.aborted) return;
          // ⚠️ Revert AND abandon the respawn — restarting CC to pick up a mode that never
          // reached disk would kill the session for nothing.
          console.warn("drive-mode apply: write failed", e);
          storedDriveModeRef.current = previous;
          setStoredDriveMode(previous);
          setRespawnWanted(false);
          return;
        }
        // ⚠️ P4.4 — WAIT FOR IDLE by OBSERVING THE STATE, not by waiting on a transition EVENT.
        // `statusStateRef` mirrors the prop, which is fed from a COLLAPSED MAP: two consecutive
        // same-state updates are indistinguishable
        // (`[[workspace-status-map-collapses-consecutive-events]]`, failure mode *a feature that
        // silently never fires*). "Is it idle NOW", polled, is expressible; "it BECAME idle" is
        // not. The idle case needs no separate branch — it is simply the first poll succeeding.
        const wentIdle = await waitForIdle(statusStateRef, sessionLiveRef, {
          signal: ac.signal,
        });
        // ⚠️ An aborted apply is the operator closing the workspace: no relaunch, no state, no
        // warning (the same reasoning as Recycle's unwarned `aborted`). The mode is already on
        // disk, so it applies at the next natural spawn.
        if (ac.signal.aborted) return;
        if (applyAbortRef.current === ac) applyAbortRef.current = null;
        if (!wentIdle) {
          console.warn(
            "drive-mode apply: timed out waiting for the agent to go idle",
          );
          setRespawnWanted(false);
          return;
        }
        // ⚠️ P4.5 — the pane's EXISTING relaunch path (one nonce-bump path, shared with Recycle
        // and `cc-relaunch`). NOT `recycleSession`: that is the session-boundary instrument and
        // injects `/session-handoff` + `/session-restore`, restoring from notes rather than
        // keeping this conversation. The intent is set FIRST, so the spawn that this relaunch
        // causes takes it (`cc/spawnArgs.ts`).
        // ⚠️ Only when there IS a pane to relaunch: the override is one-shot, so set with no
        // relaunch to take it, it would wait for the next unrelated spawn (Retry, `cc-relaunch`,
        // Recycle) and turn that into a `turn-respawn`.
        const pane = ccPaneRef.current;
        if (pane) {
          spawnIntentRef.current = "turn-respawn";
          pane.relaunch();
        }
        setRespawnWanted(false);
      })();
    },
    [projectPath, ccPaneRef],
  );

  /**
   * Close the confirm with an outcome. ⚠️ **BOTH Cancel and Apply route through here**, so the
   * write decision is taken in ONE place from `driveModeWriteFor` rather than being implicit in
   * two handlers. A mutant that made Cancel persist passed all 2255 tests when the handlers were
   * separate; funnelling them is the structural fix (`arch.md`: funnel shared-state writes
   * through ONE function and guard THAT, rather than adding assertions).
   */
  const resolveDriveMode = useCallback(
    (outcome: DriveModeOutcome) => {
      const pending = pendingDriveMode;
      setPendingDriveMode(null);
      const { persist } = driveModeWriteFor(outcome);
      // ⚠️ `persist === false` is the ONLY thing standing between Cancel and the "looks live and
      // is not" state. There is no second write path in this component.
      if (!pending || !persist || respawnWanted) return;
      startApply(pending.next);
    },
    [pendingDriveMode, respawnWanted, startApply],
  );

  // M13.5 WP4 P3.2 — re-sync on the broadcast, from EITHER surface.
  //
  // ⚠️ **This is the fix for a defect Phase 2's verify-self reproduced**, not a nicety. The
  // reveal read re-reads on a `visible` edge, and there is often no such edge: the reopen-dedup
  // FOCUSES an already-open workspace rather than remounting it, so changing the mode from the
  // picker left this readout showing a stale value with no stale marker. Workspaces also stay
  // mounted forever (the standing invariant), so "it will refresh on reveal" is not a guarantee.
  //
  // ⚠️ **NOT gated on `visible`.** A backgrounded workspace must stay truthful — it is one
  // filmstrip click from being centre stage, and a readout that is only correct while focused is
  // the write-only problem this surface exists to fix. It IS gated on `workflowEnabled`, because
  // with the gate off there is no readout to keep in sync.
  useEffect(() => {
    if (!workflowEnabled) return;
    let cancelled = false;
    const un = listen<ProjectDriveModeChanged>(
      PROJECT_DRIVE_MODE_EVENT,
      (e) => {
        // ⚠️ THE PATH CHECK IS LOAD-BEARING. The payload is per-project (unlike the permission
        // mode's app-global bare enum), so without this every open workspace would adopt one
        // project's new mode — a silent cross-project corruption of the readout.
        if (cancelled || e.payload.path !== projectPath) return;
        setStoredDriveMode(e.payload.mode);
      },
    );
    return () => {
      cancelled = true;
      void un.then((f) => f());
    };
  }, [workflowEnabled, projectPath]);

  return {
    storedDriveMode,
    setStoredDriveMode,
    storedDriveModeRef,
    pendingDriveMode,
    respawnWanted,
    chooseDriveMode,
    resolveDriveMode,
    spawnIntentRef,
  };
}
