// WP5 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: the RightPanelHost (WP5) — owns the Editor↔Diff(↔terminal) panels,
// the panel-select hotkeys (⌘⇧E/D/T), and the external-Sublime launch icon buttons
// (in the panel tab row, WP8).
// (Before WP5 the right half was an inline segmented toggle living in this file.)
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it stays mounted
// (xterm + PTY connection persist) but is pushed OFF-VIEWPORT (`left:-99999px`),
// NOT hidden with `display:none`. Two reasons, both load-bearing for M4 WP3's live
// filmstrip mirror (WP4 thumbnail-probe findings):
//   1. Off-viewport keeps the element laid out with real dimensions, so xterm's
//      FitAddon `fit()` still works (`display:none` → zero dims → `fit()` throws).
//   2. Off-viewport lets xterm's IntersectionObserver PAUSE the background
//      renderer for free (~5ms/frame saved) while the buffer still updates via
//      `write()` — so the filmstrip can read a current `serializeAsHTML()` snapshot
//      from the paused-renderer buffer (WP3 P3). `display:none` would also pause
//      rendering but breaks fit + can't be serialized into a sized tile.
// The `visible` prop drives that toggle, and is forwarded to RightPanelHost to gate
// panel liveness + the capture-phase hotkey (only the focused workspace's host reacts).

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane, type XtermPaneHandle } from "./XtermPane";
import { RightPanelHost } from "./RightPanelHost";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";
import type { WireWorkspaceState } from "../../state/workspaceStatus";
import { deriveFocusHalf, type FocusHalf } from "./focusHalf";
import { deriveRightSurface } from "./rightSurface";
import {
  loadSplitState,
  saveSplitState,
  gridColumnsFor,
  cycleRatio,
  toggleCollapse,
  type SplitState,
} from "./splitWidth";
import {
  loadTerminalFontSize,
  saveTerminalFontSize,
  nextTerminalFontSize,
  terminalZoomForChord,
  DEFAULT_TERMINAL_FONT_PX,
} from "./terminalFontZoom";
// M12 WP3 Phase 5 — the third arm. Both surfaces are GATED (a workflow skill + a statement
// about `workflow-system/` state), unlike Phase 3.5's ungated `--continue` announcement.
import { workspaceDriveModeReadout } from "../../cc/workspaceDriveMode";
import {
  readyToRespawn,
  waitForIdle,
  driveModeWriteFor,
  type DriveModeOutcome,
  APPLY_PENDING_LABEL,
  RESPAWN_INTENT_HOLD_MS,
} from "./applyDriveMode";
import { DriveModeConfirm } from "./DriveModeConfirm";
import {
  DRIVE_MODES,
  DRIVE_MODE_UNSET_PLACEHOLDER,
  driveModeChanged,
} from "../../cc/driveMode";
import {
  getProjectDefaultDriveMode,
  getSessionDriveMode,
  setProjectDefaultDriveMode,
  PROJECT_DRIVE_MODE_EVENT,
  type DriveMode,
  type ProjectDriveModeChanged,
} from "../../cc/driveModeIpc";
import { actionFromAnnounced } from "../../state/predictAction";
import { nextOpenIndicator } from "./sessionStartButton";
// M13 WP2 — the skill-button row. ⚠️ It ABSORBED the standalone `/session-start` button that
// used to live here: `/session-start` is a member of the row's fixed set, so keeping both would
// be two affordances for one skill (exactly the redundancy the WBS calls "the problem").
// `sessionStartButton.ts` still owns `nextOpenIndicator` and the never-auto-fire rationale.
import {
  fireSkillCommand,
  SKILL_BUTTONS,
  showSkillButtons,
} from "./skillButtons";
// M13 WP3 P3.1 — the Recycle operation. ⚠️ NOT a skill button: it is a multi-step operation
// (two injections + a completion wait + a flag clear + a respawn), so it is a sibling in the
// same row rather than a `SKILL_BUTTONS` member.
import { recycleSession, waitForFreshSessionId } from "./recycleSession";
// M15 WP4 — the workflow supervisor's per-workspace host. ⚠️ `fanOut` is deliberately NOT wired
// here; see `useSupervisor`'s header for why the host must be per-workspace.
import { useSupervisor } from "../../state/supervisor/useSupervisor";
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
// M13.5 WP3 — the nav state the prev/next controls render from. ⚠️ The old `inertAfter`
// inert-state machine is DELETED: it existed to explain a dead click, and a correct `disabled`
// state (driven by `canPrev`/`canNext`) makes a dead click impossible, so keeping both would be
// two mechanisms for one job. Do not reintroduce it.
import { type TurnNavState } from "./turnMarkers";
import {
  RECYCLE_LABEL,
  RECYCLE_TESTID,
  recycleTitle,
  showRecycleButton,
} from "./recycleButton";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** Store the backend CC session id once cc_spawn resolves (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
  /** QoL-WP1 — register this workspace's unsaved-doc probe with App's close guard. */
  registerDirtyProbe?: (
    workspaceId: string,
    probe: (() => number) | null,
  ) => void;
  /**
   * Live CC state from the `workspace-status` hook channel (M3 WP6). Defaults to
   * `"unknown"` — the honest no-data state before any hook event arrives. Phase 2
   * feeds the live value from the app-level subscription.
   */
  statusState?: WireWorkspaceState;
  /** Last prompt/message snippet for the indicator tooltip (M3 WP6). */
  statusSnippet?: string;
}

export function Workspace({
  workspace,
  visible,
  onSessionId,
  registerDirtyProbe,
  statusState = "unknown",
  statusSnippet,
}: WorkspaceProps) {
  // M4 WP4b — which half (left CC terminal / right panel) holds keyboard focus, so the
  // CSS can paint a #6ea8ff accent on it. Capture-phase focusin/focusout on this
  // workspace's root keeps the read scoped to THIS workspace (no document-level
  // listener that every workspace would re-handle). Only the visible/center-stage
  // workspace indicates: backgrounds are off-viewport + unfocusable, and clearing to
  // "none" on hide prevents a stale accent if a workspace is demoted while focused.
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusHalf, setFocusHalf] = useState<FocusHalf>("none");

  // ── M12 WP3 Phase 5 — the third arm ──────────────────────────────────────────────
  //
  // The gate seam. Read the HOOK, never the raw command or the one-shot wrapper: a one-shot
  // read never re-syncs on the broadcast, which is a defect that actually shipped in M10.9 WP3.
  const workflowEnabled = useWorkflowFeaturesEnabled();
  // What this workspace WOULD fire if reopened now. Re-read on every `visible` edge rather than
  // once on mount, because the whole point is to reflect a flag the ⏸ may have set *since* —
  // and workspaces stay mounted forever (the standing invariant), so a mount-only read would go
  // stale for the entire life of the app.
  const [announcedNextOpen, setAnnouncedNextOpen] = useState<string | null>(
    null,
  );
  // ⚠️ The gate-off / hidden case is DERIVED AT RENDER, not stored via a `setState` in the
  // effect. Two reasons, and the first is a hard error rather than a preference:
  //   1. Calling the setter synchronously inside the effect is a cascading render, which
  //      eslint's `react-hooks` rule rejects outright as an ERROR (it caught this — the first
  //      draft cleared the label in the effect's gate-off branch).
  //   2. M11's lesson: reconciling a surface that just became unavailable must be a
  //      render-time derivation, so it is never rendered for even one frame. A state write
  //      would let a stale label survive until the next commit.
  const nextOpen = workflowEnabled && visible ? announcedNextOpen : null;

  // ── M13.5 WP4 P2 — the drive-mode readout ────────────────────────────────────────
  //
  // TWO values, because they can disagree and the disagreement is the feature: `stored` is what
  // the NEXT spawn will use (`projects.json`); `running` is what this live session actually
  // spawned under (P1's retained value). A live process's env is fixed, so a mid-session change
  // reaches the first and not the second.
  const [storedDriveMode, setStoredDriveMode] = useState<DriveMode | null>(
    null,
  );
  const [runningDriveMode, setRunningDriveMode] = useState<DriveMode | null>(
    null,
  );
  // ⚠️ DERIVED AT RENDER, same rule as `nextOpen` above and for the same two reasons — the
  // gate-off branch must not be a `setState` (eslint `react-hooks` rejects the cascading render
  // as an ERROR), and a gated surface must never render for even one frame after the gate
  // closes. `workspaceDriveModeReadout` returns `null` when the gate is off, so the gate
  // decision lives in ONE place and this render simply follows the data.
  const driveModeReadout = workspaceDriveModeReadout(
    storedDriveMode,
    runningDriveMode,
    workflowEnabled && visible,
    workspace.cc_session_id !== null,
  );
  useEffect(() => {
    // Fetch-only, like the indicator effect below. Re-read on every `visible` edge: workspaces
    // stay mounted forever (the standing invariant), so a mount-only read would go stale for
    // the app's whole life — and the picker can change this value while the workspace is open.
    // ⚠️ Phase 3 adds the broadcast that makes the two surfaces re-sync on a write; until then
    // this refresh-on-reveal is the only re-read, which is why it is not mount-only.
    if (!workflowEnabled || !visible) return;
    let cancelled = false;
    const sid = workspace.cc_session_id;
    // ⚠️ `.catch` on BOTH, mandatory: an unhandled Tauri rejection vanishes silently (the WP6
    // picker MAJOR). `cc_drive_mode` genuinely rejects on an unknown session id, which is a
    // reachable state here — a workspace whose CC died still renders.
    void getProjectDefaultDriveMode(workspace.project_path)
      .then((m) => {
        if (!cancelled) setStoredDriveMode(m);
      })
      .catch((e) => {
        console.warn("drive-mode readout: stored read failed", e);
        if (!cancelled) setStoredDriveMode(null);
      });
    // ⚠️ NO `setState` on the no-session branch — the effect only FETCHES, and declines to
    // when there is nothing to fetch. `sessionLive` already collapses that case at the
    // derivation above (a dead session cannot be stale), so clearing state here would be a
    // cascading render that eslint's `react-hooks` rule rejects as an ERROR — which it did,
    // catching exactly this on the first run. Same rule the `nextOpen` block above documents.
    if (sid !== null) {
      void getSessionDriveMode(sid)
        .then((m) => {
          if (!cancelled) setRunningDriveMode(m);
        })
        .catch((e) => {
          console.warn("drive-mode readout: running read failed", e);
          if (!cancelled) setRunningDriveMode(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    workflowEnabled,
    visible,
    workspace.project_path,
    workspace.cc_session_id,
  ]);

  // ── M13.5 WP4 P3.3–P3.5 — the selector ───────────────────────────────────────────
  const [editingDriveMode, setEditingDriveMode] = useState(false);
  const driveModeSelectRef = useRef<HTMLSelectElement>(null);
  // ⚠️ P3.5 — the persisted value, readable OUTSIDE a state updater. React StrictMode
  // double-invokes updater callbacks, so a `persist()` called inside one fires TWO IPC writes
  // per user action — the exact defect that shipped in M10.9 WP2's `useSettingControl` and was
  // caught at code review, not by tests. The picker cell carries the same ref for the same
  // reason.
  const storedDriveModeRef = useRef<DriveMode | null>(null);
  useEffect(() => {
    storedDriveModeRef.current = storedDriveMode;
  }, [storedDriveMode]);

  // Focus the select on entering edit mode, so it is immediately usable.
  useEffect(() => {
    if (editingDriveMode) driveModeSelectRef.current?.focus();
  }, [editingDriveMode]);

  // ── M13.5 WP4 P4 — confirm-on-change + idle-gated apply ──────────────────────────
  //
  // The mode the operator picked but has NOT yet confirmed. Non-null ⇒ the confirm is open.
  // ⚠️ Held as state rather than written straight through, which is the whole of P4.2: Cancel
  // must leave `projects.json` byte-identical.
  const [pendingDriveMode, setPendingDriveMode] = useState<{
    next: DriveMode | null;
  } | null>(null);
  // An apply has been confirmed and persisted; the respawn is owed. Stays true while the agent
  // is busy, which is what makes "wait until idle" a queue rather than a dropped click.
  const [respawnWanted, setRespawnWanted] = useState(false);
  // ⚠️ The intent the NEXT spawn uses. Set immediately before `relaunch()` and cleared once the
  // respawn has produced a fresh session id — so the spawn (whose effect does NOT list
  // `openIntent` as a dep; it reads the closure at nonce-bump time) sees `turn-respawn` rather
  // than the door this workspace was originally opened with. The difference is load-bearing:
  // `fire` CONSUMES the unclean-exit flag, which is correct for a reopen acting on a crash
  // signal and wrong here — it would spend the signal the next real open depends on.
  const [spawnAsTurnRespawn, setSpawnAsTurnRespawn] = useState(false);
  // Mirror of the live status prop, readable from inside the async apply operation. Same idiom
  // as `ccSessionIdRef` above: a closure captured at click time would poll a frozen value.
  const statusStateRef = useRef(statusState);
  useEffect(() => {
    statusStateRef.current = statusState;
  }, [statusState]);
  // Mirrors whether a CC session is live, for the same reason as `statusStateRef`: the poll runs
  // inside an async operation and a captured boolean would freeze at click time.
  const sessionLiveRef = useRef(workspace.cc_session_id !== null);
  useEffect(() => {
    sessionLiveRef.current = workspace.cc_session_id !== null;
  }, [workspace.cc_session_id]);

  // ⚠️ P4.2 — CHOOSING A MODE NO LONGER WRITES. It stages a PENDING value and raises the
  // confirm; only Apply persists. The Phase 3 version wrote optimistically here, which under the
  // rejected model was fine (the write WAS the whole interaction) and under this one is a bug:
  // Cancel must leave `projects.json` byte-identical, and a persisted-but-not-respawned mode is
  // precisely the "looks live and is not" state AC-5 exists to prevent.
  const chooseDriveMode = useCallback((next: DriveMode | null) => {
    setEditingDriveMode(false);
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
  // exactly this shape (an async function in an event handler, polling `waitForFreshSessionId`
  // for a genuinely NEW id), so this follows that precedent instead of inventing a second one.
  const startApply = useCallback(
    (next: DriveMode | null) => {
      const previous = storedDriveModeRef.current;
      // Optimistic local apply; the broadcast arrives and sets the same value, idempotently.
      storedDriveModeRef.current = next;
      setStoredDriveMode(next);
      setRespawnWanted(true);

      void (async () => {
        try {
          await setProjectDefaultDriveMode(workspace.project_path, next);
        } catch (e) {
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
        const wentIdle = await waitForIdle(statusStateRef, sessionLiveRef);
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
        // keeping this conversation.
        setSpawnAsTurnRespawn(true);
        // Let the intent land in a committed render before the spawn closure reads it — the spawn
        // effect does NOT list `openIntent` as a dep, so it captures whatever the closure holds at
        // nonce-bump time.
        await Promise.resolve();
        ccPaneRef.current?.relaunch();
        // ⚠️ Hold the `turn-respawn` intent across the relaunch chain, which is asynchronous
        // (kill → clear the spawn-once latch → nonce bump → spawn effect). `openIntent` is NOT in
        // that effect's dep list — it is read from the closure at nonce-bump time — so clearing
        // the latch immediately would let the spawn read the ORIGINAL door and consume the
        // unclean-exit flag. One settle beat past the nonce bump is enough, and matches the
        // `INJECT_SETTLE_MS` idiom the auto-resume arm already uses for the same reason.
        await new Promise((r) => setTimeout(r, RESPAWN_INTENT_HOLD_MS));
        setSpawnAsTurnRespawn(false);
        setRespawnWanted(false);
      })();
    },
    [workspace.project_path],
  );

  /** Cancel: ⚠️ a TRUE no-op. Nothing persisted, nothing queued, nothing respawned. */
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

  // Apply: persist, then respawn — immediately if the agent is idle, otherwise as soon as it is.
  //
  // ⚠️ **ONE ASYNC OPERATION IN A HANDLER, not an effect-driven state machine.** Three attempts
  // at the latter were each rejected by eslint's `react-hooks` rule (setState-in-effect /
  // refs-during-render), and the rule was right: sequencing an imperative multi-step operation
  // is not what effects are for. `recycleSession` — the app's other multi-step operation — has
  // exactly this shape (an async function in an event handler, polling `waitForFreshSessionId`
  // for a genuinely NEW id), so this follows that precedent instead of inventing a second one.

  // M13.5 WP4 P3.2 — re-sync on the broadcast, from EITHER surface.
  //
  // ⚠️ **This is the fix for a defect Phase 2's verify-self reproduced**, not a nicety. The
  // effect above re-reads on a `visible` edge, and there is often no such edge: the reopen-dedup
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
        if (cancelled || e.payload.path !== workspace.project_path) return;
        setStoredDriveMode(e.payload.mode);
      },
    );
    return () => {
      cancelled = true;
      void un.then((f) => f());
    };
  }, [workflowEnabled, workspace.project_path]);

  useEffect(() => {
    // No `setState` on this path — the derivation above already hides the surface. The effect
    // only FETCHES, and simply declines to when there is nothing to show.
    if (!workflowEnabled || !visible) return;
    let cancelled = false;
    // Reuses the picker's batched command — one call returning every project's resolved action,
    // so this adds no per-workspace IPC shape. ⚠️ `.catch` is mandatory: an unhandled Tauri
    // rejection vanishes silently (the WP6 picker MAJOR), and this surface failing quietly is
    // exactly the write-only problem it exists to fix.
    invoke<Record<string, "continue" | "restore">>("picker_announce_actions")
      .then((map) => {
        if (cancelled) return;
        const announced = map[workspace.project_path];
        // ⚠️ Mapped through `actionFromAnnounced`, the purpose-built seam — NOT by rebuilding
        // synthetic signals and re-running the predictor over them.
        //
        // This used to call `predictAction({ uncleanFlag: announced === "continue",
        // sessionMdPresent: announced === "restore" })`, whose comment claimed it derived the
        // action "from the SIGNALS via the real predictor". It did not: the command had
        // already resolved the arm, and those booleans were reconstructed FROM its answer, so
        // the predictor was re-deciding a question using inputs invented from its own output.
        // It happened to agree only because the two-signal precedence puts `continue` first —
        // an accident of ordering, not a guarantee, and a third arm would break it silently.
        // (`SURFACE-2026-08-05-QUALITY-WP3-INDICATOR-BYPASSES-THE-WIRE-SEAM`.)
        setAnnouncedNextOpen(
          nextOpenIndicator({
            workflowEnabled: true,
            action: actionFromAnnounced(announced),
          }),
        );
      })
      .catch((e) => {
        console.warn("next-open indicator: announce read failed", e);
        if (!cancelled) setAnnouncedNextOpen(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowEnabled, visible, workspace.project_path]);

  /**
   * Fire a skill command into this workspace's live CC session, on an explicit click only.
   *
   * ⚠️ **Every skill button routes through here, and here routes through ONE funnel**
   * (`fireSkillCommand` → `injectCommand`). This replaced a hand-rolled `invoke("cc_input", …)`
   * that duplicated both the `.catch` and the `\r` payload rule — a second injection path for
   * the same rule, which is what task 2.6's "funnel every send through ONE function" forbids.
   *
   * Error surfacing is settled and lives in `injectCommand`: `console.warn` for diagnosis, and
   * NO error overlay — replacing a working terminal with an error, over a command the user can
   * simply type, would be worse.
   */
  const fireSkill = (command: string) => {
    const sessionId = workspace.cc_session_id;
    if (sessionId === null) return; // unreachable — the row does not render without one.
    void fireSkillCommand(sessionId, command);
  };

  // M13 WP3 P3.1 — the live session id, mirrored into a ref so `awaitFreshSessionId` can watch
  // it CHANGE after a relaunch. The id arrives by a push (XtermPane's `onSessionId` → App state
  // → back down as this prop), which a promise cannot await; a ref updated every render is the
  // only place a polling closure can read the current value without going stale.
  // ⚠️ Written in an EFFECT, not during render. Assignment-on-render trips eslint's
  // `Cannot access refs during render` as an ERROR (it caught this), and the rule is pointing at
  // something real: a render-phase ref write can land for a render React later discards, so the
  // polling closure would read a value that was never committed. The same latest-ref-via-effect
  // idiom is used by `XtermPane`'s `onSessionIdRef` (which is likewise written inside a
  // `useEffect`).
  //
  // ⚠️ **This rule is about LATEST-VALUE refs, not all refs** (reconciled 2026-08-18, paydown
  // WP3). `XtermPane` deliberately assigns `handleRelaunchRef`/`fitAndResizeRef` DURING render,
  // and that is correct: those are imperative-handle forwarding refs, never read during render.
  // The full discriminator lives at `XtermPane.tsx`'s `handleRelaunchRef` assignment — read it
  // before concluding either file is wrong.
  const ccSessionIdRef = useRef(workspace.cc_session_id);
  useEffect(() => {
    ccSessionIdRef.current = workspace.cc_session_id;
  }, [workspace.cc_session_id]);

  // M13 WP3 P3.1 — one Recycle at a time. Guards the double-click: the sequence takes tens of
  // seconds (figures: `RECYCLE_TIMEOUT_MS`, the single authority), so a second click mid-run
  // would start a competing operation against the same session and both would race the same
  // signals.
  const [recycling, setRecycling] = useState(false);
  // M13.5 WP3 — the turn-navigation state the prev/next controls render from (AC-4 + AC-5).
  //
  // ⚠️ THIS IS STATE, NOT A REF, and that is the whole point of the re-plan. The previous design
  // kept only a post-hoc `jumpInert` boolean because "the marker list lives in a ref inside
  // XtermPane, so this component cannot know the count until it asks". That reasoning produced an
  // affordance that could only learn it was wrong AFTER a dead click — and then lied until the
  // next successful one. `XtermPane` now PUSHES the nav state on every turn-start
  // (`onTurnStartRecorded`) and every step returns it, so the count is known BEFORE the click and
  // the controls can be honestly `disabled` instead of dimmed-after-the-fact.
  const [turnNav, setTurnNav] = useState<TurnNavState>({
    canPrev: false,
    canNext: false,
    ordinal: 0,
    total: 0,
  });

  // Paydown WP7 — abort an in-flight Recycle when this workspace unmounts.
  //
  // ⚠️ Closing a workspace REMOVES it from the WorkspaceList array, so this component genuinely
  // unmounts (the documented exception to "all workspaces stay mounted" — a center-stage switch
  // only flips `display`). A Recycle runs up to 3 minutes, so that gesture lands mid-operation
  // easily. Without this, step 4 cleared the unclean-exit flag and then `relaunch()` below
  // **silently no-opped on the nulled `ccPaneRef`** — leaving a session that never respawned with
  // its flag wrongly clear, so the next open announced nothing instead of offering `--continue`.
  //
  // ⚠️ A ref, not state: the controller must survive re-renders unchanged, and aborting is a
  // cleanup effect, never a render-time concern.
  const recycleAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      recycleAbortRef.current?.abort();
    },
    [],
  );

  /**
   * Run the Recycle operation for this workspace, on an explicit click only.
   *
   * ⚠️ This is NOT a skill button and does NOT go through `fireSkill`. `SKILL_BUTTONS` holds
   * slash commands routed to `injectCommand`; Recycle is a multi-step OPERATION that injects two
   * different commands, waits on a composite completion signal, clears the unclean-exit flag,
   * and respawns CC. It is a sibling affordance in the same row, wired to `recycleSession`.
   *
   * ⚠️ The failure arm is surfaced, not swallowed. `recycleSession` never throws — every failure
   * is a value — so the only way a refused handoff becomes visible is if this caller reads it.
   */
  const fireRecycle = () => {
    const sessionId = workspace.cc_session_id;
    if (sessionId === null || recycling) return;
    setRecycling(true);
    const ac = new AbortController();
    recycleAbortRef.current = ac;
    void recycleSession({
      signal: ac.signal,
      workspaceId: workspace.id,
      projectPath: workspace.project_path,
      ccSessionId: sessionId,
      relaunch: () => ccPaneRef.current?.relaunch(),
      // Poll the mirrored ref for an id that is BOTH non-null AND different from the one we
      // just killed. ⚠️ Waiting for merely non-null would return the DEAD id immediately, since
      // the prop still holds it until the respawn resolves — and the restore would then be typed
      // into a killed PTY, failing silently.
      awaitFreshSessionId: () =>
        waitForFreshSessionId(ccSessionIdRef, sessionId),
      // ⚠️ No `onProgress`. It exists on the interface for a caller that renders progress, and
      // this one does not: the CC pane is right there and shows the handoff running. Wiring a
      // state setter that only ever feeds an unread variable would be surface with no reader.
    })
      .then((outcome) => {
        // ⚠️ `aborted` is deliberately NOT warned. The other reasons describe something that
        // happened TO the operator's session; `aborted` means they closed the workspace, so there
        // is nothing to tell them and no surface left to tell it on. Logging it would make an
        // ordinary close read as a defect in the log.
        if (!outcome.ok && outcome.reason !== "aborted") {
          // ⚠️ `console.warn`, matching the row's established failure channel: replacing a
          // working terminal with an error overlay, over an operation the user can retry, would
          // be worse. The reason distinguishes "nothing happened" from "recycled — now restore
          // by hand", which is exactly why Phase 2 split the two.
          console.warn(
            `recycle: ${workspace.display_name} did not complete (${outcome.reason})`,
          );
        }
      })
      .finally(() => {
        // Drop the controller once the run is over — a stale one would have `abort()` called on
        // it at unmount, which is harmless but makes the ref lie about whether a run is in flight.
        if (recycleAbortRef.current === ac) recycleAbortRef.current = null;
        setRecycling(false);
      });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // M15 WP4 P4.1/P4.2 — THE SUPERVISOR'S FIRST PRODUCTION CALLER.
  //
  // ⚠️ **THE RECYCLE REUSES `fireRecycle` — THERE IS NO SECOND RECYCLE CALL SITE.**
  // `recycleSession`'s own header rule is "every caller enters here", and the standing local
  // defect shape is *a mechanism correct in itself behind a caller that does not honor it*. A
  // separate programmatic path would duplicate the `recycling` re-entrancy guard, the
  // AbortController wiring, and the failure-arm surfacing — three chances to diverge.
  //
  // ⚠️ `fireRecycle` already no-ops when `recycling` is true or the session id is null, so the
  // supervisor cannot start a second recycle on top of a running one.
  // ⚠️ Reuses the app's existing gate hook rather than a second source of truth.
  const workflowFeaturesEnabled = useWorkflowFeaturesEnabled();
  useSupervisor({
    workspaceId: workspace.id,
    projectPath: workspace.project_path,
    // ⚠️ The M10.9 gate. With it OFF the app must be byte-identical to one that never had the
    // workflow features, so supervision is off entirely rather than merely quiet.
    enabled: workflowFeaturesEnabled,
    storedModeRef: storedDriveModeRef,
    ccSessionIdRef,
    onRecycle: (info) => {
      // ⚠️ Announced BEFORE the recycle runs. The operation is unattended and takes up to 3
      // minutes; without this line an operator returning to the pane sees a session that
      // restarted for no visible reason. `console.warn` matches the row's established failure
      // channel (an overlay over a working terminal would be worse — M13's decision).
      console.warn(
        `supervisor: recycling ${workspace.display_name} at ${info.tokens} tokens — ` +
          `deferring /${info.skill} to the fresh session`,
      );
      fireRecycle();
    },
  });

  // QoL-WP3 — auto-focus the LEFT CC terminal on the false→true `visible` edge (and on
  // mount when already visible), since the always-active XtermPane's own focus never
  // re-fires on a center-stage switch. rAF-deferred: focusing a parked element is
  // unreliable in WKWebview, so we wait for the off-viewport→on-viewport layout flip to
  // settle (the non-obvious bit — mirrors XtermPane's own rAF-then-focus). focus() only,
  // never a PTY byte, so a switch can't inject a spurious prompt line. (See commit + WIP
  // for the operator decision to always focus CC-left for v1.)
  const ccPaneRef = useRef<XtermPaneHandle>(null);
  // M6 WP10 — handle for the RIGHT-panel second terminal (TerminalPane → XtermPane),
  // threaded down through RightPanelHost. Lives here beside ccPaneRef + the zoom router
  // so both terminal handles are co-located with the keydown listener that targets them.
  const termPaneRef = useRef<XtermPaneHandle>(null);
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => ccPaneRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // M6 WP3 — the outer left/right split ratio. App-global-PERSISTED (one localStorage
  // key, mirroring the file-tree rail's model — UI chrome, not project data), but held
  // in per-Workspace useState: each mounted workspace keeps its OWN live copy. So
  // "app-global" means the shared key, not shared live state — cross-workspace sync is
  // by REMOUNT (a fresh workspace seeds from the key), not cross-instance live updates.
  // Fine for the single-window switch-on-display pattern. The derived
  // `grid-template-columns` overrides the App.css 1fr/1fr default via an inline style on
  // `.workspace`. The three ratio presets are cycled by the header button; the two
  // collapse toggles (◀ CC / ED ▶) hide a half (the state shape carries `collapsed`).
  const [splitState, setSplitState] = useState<SplitState>(loadSplitState);
  const cycleSplit = () =>
    setSplitState((s) => {
      const next: SplitState = { ...s, ratio: cycleRatio(s.ratio) };
      saveSplitState(next);
      return next;
    });
  // M6 WP3 — collapse a half (◀ CC / ED ▶). The collapsed half gets
  // display:none (below), which makes XtermPane's existing offsetParent===null
  // fit-guard skip fitting to 0 — no crash, PTY stays alive. Toggling the same
  // half restores to the last ratio (toggleCollapse preserves `ratio`).
  const toggleSplitCollapse = (half: "left" | "right") =>
    setSplitState((s) => {
      const next = toggleCollapse(s, half);
      saveSplitState(next);
      return next;
    });
  const leftCollapsed = splitState.collapsed === "left";
  const rightCollapsed = splitState.collapsed === "right";

  // M6 WP3 — nudge a terminal re-fit when the CC half un-collapses
  // (display:none → shown). The ResizeObserver on the xterm host usually catches the
  // box going 0 → real, but a display flip is not guaranteed to fire it under
  // WKWebView, so we explicitly refit on the leftCollapsed false-edge. rAF-deferred
  // so the layout settles first (same pattern as the visible-edge focus above);
  // fitAndResize's offsetParent guard makes it a no-op if still hidden. Left-only by
  // design — the right half needs no nudge: only xterm's FitAddon has the display-flip
  // race; RightPanelHost's own ResizeObserver handles the editor side.
  useEffect(() => {
    if (leftCollapsed) return;
    const raf = requestAnimationFrame(() => ccPaneRef.current?.refit());
    return () => cancelAnimationFrame(raf);
  }, [leftCollapsed]);

  // M6 WP4 — live CC-terminal font size (focus-scoped ⌘+/⌘−/⌘0 zoom). App-global,
  // mirroring the editor's fontZoom + the WP3 split state (UI chrome, persisted under
  // one localStorage key; a fresh workspace inherits the last zoom). Seeded from
  // localStorage so it agrees with XtermPane's constructor seed. Workspace doesn't
  // RENDER the size (xterm owns the visual via the setFontSize handle) — useState is
  // only the batch-safe store the functional updater reads the prior size from, so the
  // value binding is intentionally unused; only the setter is.
  const [, setTerminalFontSize] = useState<number>(loadTerminalFontSize);
  // Apply a zoom ACTION ("in"/"out"/"reset"). The next size is computed INSIDE the
  // functional setState updater so it always reads the latest committed size — even
  // when several chords fire within one React batch (the updater is the only
  // batch-safe source of the prior value; a captured `current` or a ref synced via a
  // post-commit effect would all see the same stale value mid-batch). The persist +
  // the xterm apply ride along in the updater (it returns the same value it sets, so
  // it stays a pure-enough updater — no extra render, and React calls it once per
  // queued update with the running value).
  // M6 WP10 — `target` chooses WHICH terminal the chord zooms ("cc" left half / "right"
  // panel terminal). The SIZE is shared: one localStorage key (claudesk.terminal.fontSize),
  // one useState store — so a zoom in either terminal moves the persisted size, and the
  // OTHER terminal re-seeds from it on its next mount/refit (the shared-key decision). We
  // apply the new size to ONLY the focused terminal here so the gesture zooms the one the
  // user is looking at; the other catches up when re-seeded (a persistently-mounted
  // background terminal lags until its next refit). Both share the batch-safe
  // functional updater so several chords in one React batch read the latest committed size.
  const applyTerminalZoom = (
    action: "in" | "out" | "reset",
    target: "cc" | "right",
  ) => {
    setTerminalFontSize((prev) => {
      const next =
        action === "reset"
          ? DEFAULT_TERMINAL_FONT_PX
          : nextTerminalFontSize(prev, action);
      saveTerminalFontSize(next);
      const pane = target === "cc" ? ccPaneRef.current : termPaneRef.current;
      pane?.setFontSize(next);
      return next;
    });
  };

  // M6 WP4 — FOCUS-SCOPED zoom routing. The editor's ⌘+/⌘−/⌘0 is a CM6 keymap that
  // fires only when CodeMirror holds DOM focus. xterm forwards keystrokes to the PTY,
  // so the same chord pressed while the terminal is focused would otherwise reach CC
  // (or trigger WKWebView page-zoom), not a zoom handler. This capture-phase listener
  // closes that gap: when the LEFT (CC terminal) half holds focus, it intercepts the
  // zoom chord, applies+persists the terminal zoom, and preventDefault+stopPropagation
  // so it never reaches the PTY or the browser. When the RIGHT (editor) half is focused
  // it does NOTHING — the existing CM6 keymap handles it unchanged. Gated on `visible`
  // (only the center-stage workspace routes). Registered on this workspace's root, not
  // the document, so backgrounds never react.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const action = terminalZoomForChord(e);
      if (!action) return;
      // Route by which surface holds focus. Read the LIVE DOM focus (not the React
      // `focusHalf` state) to avoid a stale-closure race (the state may lag a
      // just-changed focus by a render).
      const half = deriveFocusHalf(document.activeElement);
      if (half === "left") {
        // CC terminal (left half) — WP4 behavior, unchanged.
        e.preventDefault();
        e.stopPropagation();
        applyTerminalZoom(action, "cc");
        return;
      }
      // M6 WP10 — the RIGHT half is one of several panels; only the second TERMINAL
      // wants the chord (the editor/diff have their own ⌘+/⌘−/⌘0 — CM6's keymap). The
      // term-pane's elements are focusable only when that panel is front (the others
      // are display:none), so "focus inside term-pane" == "terminal panel is the focused
      // right surface". When it is, zoom the right-panel terminal and swallow the chord;
      // otherwise fall through so the editor's keymap handles it unchanged.
      if (
        half === "right" &&
        deriveRightSurface(document.activeElement) === "terminal"
      ) {
        e.preventDefault();
        e.stopPropagation();
        applyTerminalZoom(action, "right");
      }
    };
    root.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => root.removeEventListener("keydown", onKeyDown, true);
    // Keyed only on `visible` (the gate). The handler captures no changing state — the
    // current size is read inside applyTerminalZoom's functional updater, and dispatch
    // goes through the stable ccPaneRef — so the listener lives for the visible-edge's
    // lifetime, the same shape as the focusin/focusout effect below.
  }, [visible]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) {
      setFocusHalf("none");
      return;
    }
    // focusin bubbles (unlike focus) so a single listener on the root sees focus landing
    // anywhere inside either half. focusout's relatedTarget is where focus is GOING —
    // deriving the half from it (not the leaving element) keeps the accent correct when
    // moving directly from one half to the other, and clears to "none" on focus leaving
    // the workspace entirely (relatedTarget null or outside both halves).
    const onFocusIn = (e: FocusEvent) =>
      setFocusHalf(deriveFocusHalf(e.target));
    const onFocusOut = (e: FocusEvent) =>
      setFocusHalf(deriveFocusHalf(e.relatedTarget));
    root.addEventListener("focusin", onFocusIn, true);
    root.addEventListener("focusout", onFocusOut, true);
    return () => {
      root.removeEventListener("focusin", onFocusIn, true);
      root.removeEventListener("focusout", onFocusOut, true);
    };
  }, [visible]);

  return (
    <div
      ref={rootRef}
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      data-visible={visible ? "true" : "false"}
      // QoL — a hidden workspace is pushed off-viewport (not `display:none`, which would
      // break FitAddon/serialize), so it stays in the tab order + a11y tree unless we
      // mark it `inert`. `inert` removes the off-screen editor + live PTY from keyboard
      // focus and screen-reader announcement without affecting layout or serialization.
      inert={!visible}
      // M4 WP4b — only the center-stage workspace lights a half; backgrounds stay "none".
      data-focus-half={visible ? focusHalf : "none"}
      // Always display:grid (real dimensions → FitAddon works); hidden workspaces
      // are pushed off-viewport instead of `display:none`. See the header comment:
      // this is what keeps background xterm buffers serializable for the WP3
      // filmstrip mirror while xterm pauses their off-screen renderer.
      style={
        // M6 WP3 — the split ratio drives grid-template-columns (overrides the
        // App.css 1fr/1fr default). Applied in BOTH branches so a backgrounded
        // workspace lays out at the same track as it will when promoted (keeps
        // FitAddon sizing the background terminal correctly).
        visible
          ? {
              display: "grid",
              gridTemplateColumns: gridColumnsFor(splitState),
            }
          : {
              display: "grid",
              gridTemplateColumns: gridColumnsFor(splitState),
              position: "absolute",
              left: "-99999px",
              top: 0,
              // Match the on-stage footprint so FitAddon sizes the background
              // terminal the same as it will appear once promoted.
              width: "100%",
              height: "100%",
            }
      }
    >
      <div className="workspace-header" data-testid="workspace-header">
        <span className="workspace-header-name">{workspace.display_name}</span>
        {/* M12 WP3 Phase 5 — the already-open indicator. Reads back what this workspace
            WOULD fire on its next open, so the unclean flag stops being write-only: WP2's ⏸
            set it with no way to confirm the click landed short of reading
            `session-state.json` by hand, which is why the operator deferred WP2's hard-kill
            verification. A PREDICTION, never an instruction — nothing consumes this string.
            Both this and the button below are GATED (the label states workflow state; the
            button sends a workflow skill), unlike Phase 3.5's ungated `--continue` announce. */}
        {nextOpen !== null && (
          <span
            className="workspace-header-nextopen"
            data-testid="workspace-header-nextopen"
            title={`On next open, this workspace ${nextOpen}`}
          >
            ↻ {nextOpen}
          </span>
        )}
        {/* M13.5 WP4 P2 — the drive-mode readout. ⚠️ GATED: `workspaceDriveModeReadout` returns
            null when the gate is off, so with workflow features disabled this element does not
            exist in the DOM at all — not hidden, not disabled, not an empty reserved slot
            (`useWorkflowFeaturesEnabled`'s contract). The gate decision lives in the pure module;
            this render follows the data, the same shape the picker cell uses.
            ⚠️ THIS IS A DELIBERATE REVERSAL of M12's "picker row ONLY" placement, not an
            oversight — design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen` names
            this exact edge as untested ("a setting read at creation that is ALSO
            live-reconfigurable later, which may want both"). ⚠️ The MODEL OVERRIDE does not come
            along: it is fixed at spawn for the process's life and stays picker-row-only. */}
        {driveModeReadout &&
          (editingDriveMode ? (
            /* M13.5 WP4 P3.3 — the editor. ⚠️ A native <select> is CORRECT here, and the model
               override's "do NOT validate" rule must NOT be generalized to it: the four modes are
               a CLOSED set, and one bad string fails serde on read and takes the WHOLE project
               list down (not just this row). See `cc/driveMode.ts`'s blast-radius table.
               ⚠️ Options come from `DRIVE_MODES` — no second vocabulary. */
            <select
              ref={driveModeSelectRef}
              className="workspace-header-drivemode-select"
              data-testid="workspace-header-drivemode-select"
              value={storedDriveMode ?? ""}
              aria-label={`Workflow drive mode for ${workspace.display_name}`}
              title={driveModeReadout.title}
              onChange={(e) =>
                chooseDriveMode(
                  e.target.value === "" ? null : (e.target.value as DriveMode),
                )
              }
              onBlur={() => setEditingDriveMode(false)}
              onKeyDown={(e) => {
                // Keep Escape/typing away from the workspace's own key handlers.
                e.stopPropagation();
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingDriveMode(false);
                }
              }}
            >
              <option value="">{DRIVE_MODE_UNSET_PLACEHOLDER}</option>
              {DRIVE_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            /* ⚠️ P3.4 — ITS OWN HIT REGION. The header now carries several adjacent clickable
               affordances (skill row, recycle, turn-nav, split control), which is the same
               structural risk M12 hit in the picker cell: a click meant for one control routed
               into another "presents as 'the control does nothing' and no unit test can see it."
               Every defence is copied from `CellValueLine`, which solved it: stopPropagation on
               BOTH pointerdown and click, plus an explicit Enter/Space mirror (a
               <span role="button"> has no implicit keyboard activation) and tabIndex. */
            <span
              role="button"
              tabIndex={0}
              className={`workspace-header-drivemode${driveModeReadout.isStale ? " is-stale" : ""}`}
              data-testid="workspace-header-drivemode"
              aria-label={`Workflow drive mode for ${workspace.display_name}: ${driveModeReadout.text}. Click to change.`}
              title={driveModeReadout.title}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setEditingDriveMode(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingDriveMode(true);
                }
              }}
            >
              ⇅ {driveModeReadout.text}
              {/* The stale marker. ⚠️ Purple, NOT the alarm-blue used for AwaitingInput — an
                  ambient signal that borrows the alarm's urgency erodes the alarm itself
                  (`[[semantic-distance-not-just-visual-distance-for-status-colour]]`). */}
              {driveModeReadout.isStale && (
                <span
                  className="workspace-header-drivemode-stale"
                  data-testid="workspace-header-drivemode-stale"
                >
                  {" "}
                  ⚠
                </span>
              )}
              {/* ⚠️ P4.4 — the QUEUED state must be visible. An apply that is waiting on a busy
                  agent otherwise looks like a click that did nothing, which is the write-only
                  problem this whole surface exists to fix. */}
              {respawnWanted && (
                <span
                  className="workspace-header-drivemode-pending"
                  data-testid="workspace-header-drivemode-pending"
                  title={APPLY_PENDING_LABEL}
                >
                  {" "}
                  ⏳
                </span>
              )}
            </span>
          ))}
        {/* M13.5 WP4 P4.1 — the confirm. Rendered inside the header so it is scoped to THIS
            workspace (backgrounded workspaces stay mounted, so an app-level dialog would need a
            workspace id to disambiguate). ⚠️ Gated on `pendingDriveMode` alone: it can only be
            non-null via `chooseDriveMode`, which is itself only reachable from the gated
            selector — so no separate gate check is needed or wanted here. */}
        {pendingDriveMode && (
          <DriveModeConfirm
            next={pendingDriveMode.next ?? "None"}
            canApplyNow={readyToRespawn(
              statusState,
              workspace.cc_session_id !== null,
            )}
            onApply={() => resolveDriveMode("apply")}
            onCancel={() => resolveDriveMode("cancel")}
          />
        )}
        {/* M13 WP2 — the skill-button row: five fixed workflow commands as clicks. ⚠️ Recycle
            Session is NOT here — it is WP3's operation, and WP2 deliberately ships without it
            (an earlier version of this comment said "plus the Recycle button", which was false
            at the render site itself). ⚠️ GATED as a whole: every command is a companion-workflow
            skill, so with the gate off the row is ABSENT, not hidden or disabled. */}
        {showSkillButtons({
          workflowEnabled,
          ccSessionId: workspace.cc_session_id,
        }) && (
          <div
            className="workspace-skill-row"
            data-testid="workspace-skill-row"
          >
            {SKILL_BUTTONS.map((btn) => (
              <button
                key={btn.command}
                type="button"
                className="workspace-skill-btn"
                data-testid={`workspace-skill-${btn.command.slice(1)}`}
                aria-label={`Run ${btn.command} in ${workspace.display_name}`}
                title={btn.title}
                onClick={() => fireSkill(btn.command)}
              >
                {btn.label}
              </button>
            ))}
            {/* M13 WP3 P3.1 — THE SIXTH AFFORDANCE. ⚠️ Rendered as a SIBLING of the mapped
                skill buttons, NOT as a `SKILL_BUTTONS` member: that array holds slash commands
                routed to `injectCommand`, and Recycle is an operation. Same row, same look,
                different wiring — see `recycleButton.ts`. */}
            {showRecycleButton({
              workflowEnabled,
              ccSessionId: workspace.cc_session_id,
            }) && (
              <button
                type="button"
                className="workspace-skill-btn workspace-recycle-btn"
                data-testid={RECYCLE_TESTID}
                aria-label={`Recycle the CC session in ${workspace.display_name}`}
                title={recycleTitle(recycling)}
                disabled={recycling}
                onClick={fireRecycle}
              >
                {RECYCLE_LABEL}
              </button>
            )}
          </div>
        )}
        {/* M6 WP3 — the split-ratio control. Two collapse toggles (◀ CC / ED ▶)
            flank a cycle button whose label is the current ratio (3:1 / 2:2 / 1:3).
            Collapse + cycle are orthogonal: the cycle steps the three ratios; the
            toggles fully hide a half (and restore to the last ratio on re-click).
            At most one half collapsed at a time (toggleCollapse mutual exclusion). */}
        <div
          className="workspace-split-control"
          data-testid="workspace-split-control"
        >
          {/* M13.5 WP3 — step to the previous / next CC turn start.
              ⚠️ DELIBERATELY *NOT* IN THE SKILL-BUTTON ROW ABOVE. That row is gated as a whole
              (`showSkillButtons({workflowEnabled, …})`), and a "turn" is a plain Claude Code
              concept that exists for every user with or without `~/.claude/skills/` — nothing
              here reads `workflow-system/`, a skill, or a drive mode. Per the gate's
              applicability rule (`arch.md`: the gate applies PER ARM, by applicability, never by
              audience size) this surface is UNGATED and takes NO guard arm (AC-10). Putting it in
              the skill row would make it vanish whenever the gate is off. ⚠️ It lives INSIDE the
              split control (the shipped single button sat beside it) so the cluster reads as one
              ungated terminal-chrome group.
              ⚠️ PAIRED AFFORDANCES, per design-prior [[paired-actions-need-paired-affordances]]:
              prev and next are INVERSES, so both get a control of the same kind. A single
              backward-only button that dead-ends cannot support the actual task, which is
              SCANNING — stepping back and forward to re-locate a spot. */}
          <button
            type="button"
            className="workspace-turn-nav-btn"
            data-testid="workspace-turn-prev"
            disabled={!turnNav.canPrev}
            aria-label={`Go to the previous turn start in ${workspace.display_name}`}
            title="Previous turn start"
            onClick={() => {
              // The pane owns the position; it returns the fresh nav state so this component
              // never has to poll or re-derive it (the two could then disagree — AC-5).
              ccPaneRef.current?.stepTurn("prev");
              const next = ccPaneRef.current?.turnNavState();
              if (next) setTurnNav(next);
            }}
          >
            ↑
          </button>
          {/* AC-5 — the position readout. Hidden at zero turns: two disabled arrows are
              self-explanatory, and "0/0" is noise. */}
          {turnNav.total > 0 && (
            <span
              className="workspace-turn-nav-readout"
              data-testid="workspace-turn-readout"
              aria-live="polite"
              title={`Turn ${turnNav.ordinal} of ${turnNav.total}`}
            >
              {turnNav.ordinal}/{turnNav.total}
            </span>
          )}
          <button
            type="button"
            className="workspace-turn-nav-btn"
            data-testid="workspace-turn-next"
            disabled={!turnNav.canNext}
            aria-label={`Go to the next turn start in ${workspace.display_name}`}
            title="Next turn start"
            onClick={() => {
              ccPaneRef.current?.stepTurn("next");
              const next = ccPaneRef.current?.turnNavState();
              if (next) setTurnNav(next);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className={`split-collapse-btn${leftCollapsed ? " is-active" : ""}`}
            data-testid="split-collapse-cc"
            aria-label={
              leftCollapsed ? "Show CC terminal" : "Collapse CC terminal"
            }
            aria-pressed={leftCollapsed}
            title={
              leftCollapsed
                ? "Show CC terminal"
                : "Collapse CC (show editor only)"
            }
            onClick={() => toggleSplitCollapse("left")}
          >
            ◀ CC
          </button>
          <button
            type="button"
            className="split-cycle-btn"
            data-testid="split-cycle-btn"
            aria-label={`Split ratio ${splitState.ratio} — click to cycle`}
            title="Cycle split ratio (CC ↔ editor)"
            disabled={splitState.collapsed !== "none"}
            onClick={cycleSplit}
          >
            {splitState.ratio}
          </button>
          <button
            type="button"
            className={`split-collapse-btn${rightCollapsed ? " is-active" : ""}`}
            data-testid="split-collapse-ed"
            aria-label={
              rightCollapsed ? "Show editor panel" : "Collapse editor panel"
            }
            aria-pressed={rightCollapsed}
            title={
              rightCollapsed
                ? "Show editor panel"
                : "Collapse editor (show CC only)"
            }
            onClick={() => toggleSplitCollapse("right")}
          >
            ED ▶
          </button>
        </div>
        <WorkspaceStatusIndicator state={statusState} snippet={statusSnippet} />
      </div>
      {/* M6 WP3 — the ◀ CC collapse hides the left half via display:none. That makes
          XtermPane's fitAndResize see host.offsetParent === null and SKIP fit()
          (no fit-to-0 crash); the PTY session stays alive. On restore, the
          ResizeObserver re-fires and fits to the recovered width. */}
      <div
        className="workspace-left"
        style={leftCollapsed ? { display: "none" } : undefined}
      >
        <XtermPane
          ref={ccPaneRef}
          workspaceId={workspace.id}
          projectPath={workspace.project_path}
          onSessionId={(sid) => onSessionId?.(workspace.id, sid)}
          // M13.5 WP3 P3.3 — only the CC pane records turn-start markers. Same exclusion
          // reasoning as `pendingAction` below: `TerminalPane` mounts this component for a
          // login SHELL, which has no turns, so it never opts in (the prop defaults false).
          markTurnStarts
          // ⚠️ AC-6 — a new turn PUSHES fresh nav state, so the controls learn that an empty
          // list became non-empty. Without this edge the affordance could only ever learn the
          // truth from a click, which is the shipped defect: one dead click on a fresh session
          // left it dimmed and asserting "no earlier turn start" forever — a UI that lies.
          // The pane resets its position to the newest at the same moment.
          onTurnStartRecorded={(nav) => setTurnNav(nav)}
          // M12 WP3 Phase 4 — the auto-resume action, read off the workspace model this
          // component already receives. NO new `Workspace` prop was needed: `pending_action`
          // rides on the record (set on the mint branch of `openReducer`, deliberately
          // dropped on the focus branch), so threading it is one line rather than a prop
          // chain through App → Workspace → XtermPane.
          //
          // ⚠️ Only the RIGHT-panel terminal is excluded: `TerminalPane` spawns a login
          // SHELL, not CC, so injecting a CC slash command there would type it at a bash
          // prompt. That pane simply never receives this prop (it defaults to `null`).
          pendingAction={workspace.pending_action}
          // P4.6 — the door that opened this workspace, for the backend's argv-arm gate. Rides
          // the same workspace record as `pending_action` for the same reason, but stays a
          // DISTINCT field: `pending_action === null` cannot distinguish the no-fire door from
          // "no signal", and the argv arm needs that distinction.
          // ⚠️ M13.5 WP4 P4.5 — the intent the NEXT spawn uses.
          //
          // A relaunch driven by the drive-mode apply must spawn as `turn-respawn`, NOT as the
          // door this workspace was originally opened with. The difference is load-bearing:
          // `fire` CONSUMES the unclean-exit flag (correct for a reopen acting on a crash
          // signal, wrong here — it would spend the signal the next real open depends on),
          // while `turn-respawn` resumes with `--continue` and leaves the flag intact.
          // `no-fire` would not resume at all, losing the conversation.
          //
          // Falls back to the original door for every other relaunch path (the `cc-relaunch`
          // control, Recycle), so their behavior is unchanged.
          openIntent={
            spawnAsTurnRespawn ? "turn-respawn" : workspace.open_intent
          }
        />
      </div>
      <RightPanelHost
        workspaceId={workspace.id}
        projectPath={workspace.project_path}
        visible={visible}
        collapsed={rightCollapsed}
        registerDirtyProbe={registerDirtyProbe}
        terminalPaneRef={termPaneRef}
      />
    </div>
  );
}
