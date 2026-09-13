// M15 WP3 Phase 1 — the workflow supervisor's turn-end trigger.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS IS A PREDICATE PLUS A HOOK, AND NOT AN INLINE `if` IN A COMPONENT
//
// The supervisor fires commands into a PTY with no human watching and — deliberately —
// `injectCommand` has **no retry and no pre-send cancel window**. The only recovery from a
// wrong fire is CC's own Esc. So the question *"is this event a turn end I should act on?"*
// is a correctness boundary, not a formality, and it gets the same treatment M13.5 WP3 gave
// `shouldRecordTurnStart`: extracted so a test can drive **the caller's contract**, not just
// the mechanism behind it.
//
// That extraction is the standing local lesson — *a mechanism correct in itself behind a
// caller that does not honor it* has bitten this repo four times, twice in M11 WP4 with one
// shipped CRITICAL (`arch.md` → Verification method). Re-inlining these guards silently
// removes the coverage that exists to prevent a fifth.

import { useTauriListen } from "../../useTauriListen";
import {
  WORKSPACE_STATUS_EVENT,
  type WorkspaceStatusUpdate,
} from "../workspaceStatus";

/**
 * The slice of a status update the turn-end decision reads.
 *
 * Structurally typed (mirroring `TurnStartSignal`) so a test can build one without the whole
 * DTO, and so the predicate's real inputs are visible in its signature rather than buried in
 * a wide interface.
 */
export interface TurnEndSignal {
  workspace_id: string;
  is_turn_end?: boolean;
  session_id?: string;
}

/**
 * Should this event be treated as the end of a CC turn in this workspace?
 *
 * ⚠️ **Matches `is_turn_end`, NEVER `state`.** The backend maps `Stop` to **two** states —
 * `"idle"`, and `"background_work"` when the turn ended with background tasks outstanding.
 * A predicate written as `state === "idle"` matches one of them and **silently never fires**
 * on the other (`[[derived-state-is-not-a-proxy-for-its-event]]`). The backend classifies;
 * we match its classification.
 *
 * ⚠️ **`enabled` gates the WORK, not the subscription** — see {@link useTurnEnd}.
 */
export function shouldHandleTurnEnd(args: {
  enabled: boolean;
  paneWorkspaceId: string;
  payload: TurnEndSignal;
}): boolean {
  return (
    args.enabled &&
    args.payload.workspace_id === args.paneWorkspaceId &&
    args.payload.is_turn_end === true
  );
}

/**
 * Subscribe to turn-end events for one workspace.
 *
 * ⚠️ **Taps the RAW event stream, never `WorkspaceStatusMap`.** The map folds by
 * `workspace_id`, so two consecutive `Stop`s overwrite each other and "a turn ended" is
 * unrecoverable from it (`[[workspace-status-map-collapses-consecutive-events]]`, whose
 * failure mode is a feature that silently never fires). A per-event consumer must tap the
 * event itself.
 *
 * ⚠️ **Subscribes unconditionally and filters inside**, mirroring `XtermPane`'s turn-start
 * tap: a conditional `useTauriListen` would make hook order depend on `enabled`. `enabled`
 * gates the callback, not the subscription.
 *
 * The `listen` wiring itself is not unit-tested (runtime-bound, the same posture as every
 * other listener seam here); {@link shouldHandleTurnEnd} carries the logic that is.
 */
export function useTurnEnd(args: {
  enabled: boolean;
  workspaceId: string;
  onTurnEnd: (payload: WorkspaceStatusUpdate) => void;
}): void {
  const { enabled, workspaceId, onTurnEnd } = args;
  useTauriListen<WorkspaceStatusUpdate>(WORKSPACE_STATUS_EVENT, (event) => {
    if (
      !shouldHandleTurnEnd({
        enabled,
        paneWorkspaceId: workspaceId,
        payload: event.payload,
      })
    ) {
      return;
    }
    onTurnEnd(event.payload);
  });
}
