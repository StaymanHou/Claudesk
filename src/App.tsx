import "./App.css";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspaceList } from "./state/useWorkspaceList";
import type { AutoResumeAction, OpenIntent } from "./state/predictAction";
// M12 WP2 — clear the unclean-exit flag on a clean close (opt-in per route).
import { markSessionClean, resolveCloseIntent } from "./state/cleanExit";
import { useWorkspaceStatus } from "./state/useWorkspaceStatus";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
import {
  deriveTiles,
  tileForSwitchIndex,
} from "./components/workspace/filmstripTiles";
import { workspaceSwitchIndex } from "./components/workspace/workspaceSwitchChord";
import { newWorkspaceChord } from "./components/workspace/newWorkspaceChord";
import { isDashboardChord } from "./components/workspace/dashboard/dashboardChord";
import { isSettingsChord } from "./components/settings/settingsChord";
import { escDismissTarget } from "./components/settings/escDismiss";
import { WorkflowInviteModal } from "./components/settings/WorkflowInviteModal";
import { shouldShowWorkflowInviteFor } from "./state/workflowInviteState";
import type { WorkflowInviteOutcome } from "./state/workflowInviteState";
import {
  getWorkflowInvite,
  setWorkflowInvite,
} from "./state/workflowSubstrate";
import { useWorkflowFeaturesEnabled } from "./state/useWorkflowFeaturesEnabled";
import {
  loadOrder,
  reorder,
  saveOrder,
} from "./components/workspace/filmstripOrder";
import {
  loadCollapsed,
  saveCollapsed,
} from "./components/workspace/filmstripCollapse";
import { ProjectPicker } from "./components/picker/ProjectPicker";
import { PickerOverlay } from "./components/picker/PickerOverlay";
import { ConfirmModal } from "./components/workspace/editor/ConfirmModal";
import {
  closeWorkspaceSpec,
  isActiveState,
  quitWhileActiveSpec,
  type CloseWorkspaceChoice,
  type QuitWhileActiveChoice,
} from "./components/workspace/editor/confirmDialog";
import { parseSeedParam } from "./state/seedWorkspace";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { menuActionFor } from "./menu/menuBridge";
import { openSublime, openSublimeMerge } from "./sublime/sublimeLaunch";
import { openFinder } from "./finder/finderLaunch";
import { usePipFanout } from "./pip/usePipFanout";
import { useMirrorTicker } from "./components/workspace/useMirrorTicker";
// M10 WP4 — the polished in-app updater UX: an App-level hook driving a top-of-window
// non-modal notify banner + confirm/progress/cancel flow + the WP1-fallback quarantine
// dialog. Replaces WP2's throwaway corner UpdaterTrigger (now deleted). Mounted ONCE at
// App level so the banner reads over BOTH the picker and an open-workspace scene.
import { useUpdater } from "./updater/useUpdater";
import { UpdaterStatusRow } from "./updater/UpdaterStatusRow";
import { UpdateNotifyBanner } from "./updater/UpdateNotifyBanner";
import {
  updateConfirmSpec,
  quarantineFallbackSpec,
} from "./updater/updateFlowState";

// M9 WP6a — the GLOBAL time-analytics dashboard is a top-level view, mounted ONCE,
// overlaying the center stage (the PickerOverlay pattern). LAZY: its chunk (the
// ported dashboard surface) loads on first open, not at app boot (folds in
// SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD).
const GlobalDashboard = lazy(
  () => import("./components/workspace/dashboard/GlobalDashboard"),
);

// M10.9 WP2 — the app-global Settings panel (⌘, / Claudesk → Settings…). Same
// mount-once + lazy shape as the dashboard: a top-level overlay reachable from BOTH the
// picker and an open workspace, which is the reachability the retired picker settings
// strip never had.
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel"));

// WP5 app shell. The view is a state machine over WorkspaceList:
//   - "picker"         → Project Picker, full-screen (no workspace open yet)
//   - "workspace-open" → Filmstrip slot + Center Stage (a workspace is focused)
//
// Opening a project from the picker calls openWorkspace(path), which (M4 WP2)
// APPENDS a workspace and focuses it; the derived `view` flips to "workspace-open".
//
// M4 WP2 — opening a SECOND/THIRD project: once a workspace is open the full-screen
// picker is gone, so the Filmstrip carries a "+" control that summons the picker as
// an overlay (`showPicker`). Picking there appends another workspace and dismisses
// the overlay; Esc / backdrop / × dismiss without opening anything.
//
// WP8's Sublime launchers (Text + Merge) are icon buttons in each workspace's
// right-panel tab row (RightPanelHost), not here. (The old ⌘⇧O Text hotkey was
// removed in WP8.)

// One shared fallback for a workspace missing a `display_name` — used by BOTH the
// per-workspace close gate (`requestClose`) and the app-quit busy list (`busyNamesRef`),
// so the two gates can never present divergent wording (a real workspace always has a
// name, so this is belt-and-suspenders). SURFACE-2026-07-18-QUALITY-WP2-FALLBACK-STRING-PARITY.
const UNNAMED_WORKSPACE = "This workspace";

function App() {
  const {
    workspaces,
    focusedId,
    view,
    openWorkspace,
    focusWorkspace,
    closeWorkspace,
    setSessionId,
  } = useWorkspaceList();
  // M3 WP6 — live CC status from the `workspace-status` hook channel + the
  // open/close registration that makes WP4's cwd→workspace match resolve.
  const { stateFor, snippetFor } = useWorkspaceStatus(workspaces);

  // M4 WP3 P4 — the user-arranged, persisted filmstrip order (a list of project_paths,
  // localStorage-backed). Read once on mount; a drag-drop updates it + persists. It's the
  // single source of truth for both tile render order and the ⌘⇧+digit index.
  const [order, setOrder] = useState<string[]>(() => loadOrder());

  // M4 WP3 — the ordered filmstrip tiles, derived ONCE here so the render order
  // (Filmstrip) and the ⌘⇧+digit index (the chord handler below) share one source of
  // truth. `order` (persisted project_paths) is deriveTiles' 3rd arg; open workspaces not
  // in the stored order append at the end (orderWorkspaces handles the merge).
  const tiles = useMemo(
    () => deriveTiles(workspaces, focusedId, order),
    [workspaces, focusedId, order],
  );

  // M4 WP3 P4 — LIVE pointer-drag reorder (WYSIWYG). `reorderTiles` fires on every
  // pointermove that crosses a tile boundary, so tiles shuffle in real time as the user
  // drags — it updates the order state but does NOT persist (avoids a localStorage write
  // per move). `commitOrder` persists the current arrangement once on pointerup.
  const reorderTiles = useCallback(
    (from: number, to: number) => {
      setOrder(reorder(tiles, from, to).map((t) => t.project_path));
    },
    [tiles],
  );

  // M5 WP3 Phase 2 — fan the roster out to the PiP NSPanel webview (it can't read this
  // React state). The roster is the SAME ordered `tiles`, projected to {id, display_name}
  // — but UNLIKE the filmstrip, NO tile is dropped/marked-static: the PiP mirrors ALL N
  // workspaces incl. the center-staged one (the intentional divergence). The projection
  // is memoized on (id, name, order) so the fan-out effect only re-emits when the roster
  // actually changes, not on every status tick. Status itself reaches the PiP via the
  // backend's all-webview `workspace-status` broadcast — not fanned out here.
  const pipRoster = useMemo(
    () => tiles.map((t) => ({ id: t.id, display_name: t.display_name })),
    [tiles],
  );
  usePipFanout(pipRoster);
  const commitOrder = useCallback(() => {
    saveOrder(tiles.map((t) => t.project_path));
  }, [tiles]);

  // M4 WP3 P2 — ⌘⇧1..⌘⇧9 promotes the Nth tile to center stage (the keyboard
  // equivalent of clicking it). APP-LEVEL capture-phase listener (the WP1-proven
  // pattern): fires regardless of which workspace half holds focus — inside CM6,
  // the terminal, anywhere. Only active when a workspace is open. N past the tile
  // count is a NO-OP (the roster is complete, so there's no Nth tile to switch to).
  //
  // The listener reads `tiles` + `focusWorkspace` via a latest-ref (the focusedPathRef
  // idiom below) so it registers ONCE per view transition, not on every `tiles` change
  // (which re-derives whenever workspaces/focus/order shift) — re-subscribing the
  // document listener on that churn was needless add/removeEventListener thrash.
  const switchTilesRef = useRef(tiles);
  const focusWorkspaceRef = useRef(focusWorkspace);
  useEffect(() => {
    switchTilesRef.current = tiles;
    focusWorkspaceRef.current = focusWorkspace;
  }, [tiles, focusWorkspace]);
  useEffect(() => {
    if (view !== "workspace-open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const n = workspaceSwitchIndex(e);
      if (n === null) return;
      const tile = tileForSwitchIndex(switchTilesRef.current, n);
      if (!tile) return; // out of range → no-op (roster is complete; no Nth tile)
      e.preventDefault();
      focusWorkspaceRef.current(tile.id);
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [view]);

  // M4 WP4 — filmstrip collapse: EXPANDED (full ~1 fps thumbnail tiles, WP3) ↔
  // COLLAPSED (a one-line row of mini status pills). Seeded from the persisted
  // preference (localStorage, app-global UI chrome — same pattern as `order` above and
  // the M2 rail width). The toggle flips state + persists; Filmstrip reads `collapsed`
  // both to choose its render mode AND to gate the serialize mirror ticker (P2 — the
  // loop stops while collapsed so the background-render CPU cost goes to zero).
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      saveCollapsed(next);
      return next;
    });
  }, []);

  // M5 WP3 Phase 3 — the SINGLE serialize ticker, shared by the filmstrip + the PiP.
  // It serializes the needed workspace set once per tick into the shared mirrorFrame
  // (filmstrip reads it for its tiles; the PiP gets the same snapshot as a pip-mirror
  // emit when shown). No second serialize loop. `allIds` = the ordered roster; the
  // ticker excludes the center-staged one from the filmstrip set but includes it for
  // the PiP (the divergence). It tracks PiP visibility itself via the backend
  // `pip-visibility` broadcast, so the cost is paid only while the PiP is up.
  const allIds = useMemo(() => tiles.map((t) => t.id), [tiles]);
  useMirrorTicker({ allIds, focusedId, collapsed });

  // M4 WP2 — the new-workspace overlay (the filmstrip "+" re-entry). Only ever
  // shown when a workspace is already open; first-open uses the full-screen picker.
  const [showPicker, setShowPicker] = useState(false);

  // QoL-WP6 — ⌘⇧N opens the picker overlay to start a new workspace (the keyboard
  // parity for the native "New Workspace" menu item, which displays ⌘⇧N as label-only).
  // Same APP-LEVEL capture-phase pattern as the ⌘⇧+digit switch above; gated on
  // view === "workspace-open" (the only view where PickerOverlay renders — in "picker"
  // view the full-screen picker is already up, so ⌘⇧N would be a no-op anyway).
  useEffect(() => {
    if (view !== "workspace-open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!newWorkspaceChord(e)) return;
      e.preventDefault();
      setShowPicker(true);
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [view]);

  // M9 WP6a — the GLOBAL time-analytics dashboard, a top-level view that overlays whichever
  // scene is up (NOT a per-workspace panel — its data is all-projects). Because it is global,
  // it is reachable from BOTH the picker scene at launch AND an open workspace
  // (SURFACE-2026-07-08-M9-WP6A-DASHBOARD-FROM-PICKER) — so this chord is NOT gated on `view`
  // (unlike ⌘⇧N / ⌘⇧+digit, which only make sense with a workspace open). ⌘⇧A toggles it;
  // Esc closes it while open. Same APP-LEVEL capture-phase pattern. `showDashboard` mounts a
  // single <GlobalDashboard> (lazy), rendered at the app-shell top level below.
  const [showDashboard, setShowDashboard] = useState(false);
  // M10.9 WP2 — the app-global Settings panel (⌘, / Claudesk → Settings…). Declared
  // beside showDashboard because the two share one Esc handler below: they are both
  // app-level overlays, and Esc must dismiss only whichever is in front.
  const [showSettings, setShowSettings] = useState(false);
  // Latest-refs mirroring the two overlay states, so the once-registered keydown listener
  // below can read the CURRENT values synchronously (same idiom as focusedPathRef /
  // busyNamesRef — the listener has empty deps, so it cannot close over the state).
  //
  // Load-bearing, and the reason is a bug this code already had: the first version read a
  // flag assigned INSIDE a `setShowSettings` updater and checked it on the next line.
  // React DEFERS updater callbacks, so the flag was still false when the guard ran and one
  // Esc closed BOTH overlays. A state updater cannot answer a question the handler needs
  // answered NOW — hence the refs.
  const showSettingsRef = useRef(false);
  const showDashboardRef = useRef(false);
  // M10.9 WP3 — which settings group to flash when the panel opens. Set only when the
  // invite routes the user here; `undefined` on every ordinary ⌘, / menu / gear open.
  const [settingsHighlight, setSettingsHighlight] = useState<
    string | undefined
  >(undefined);

  // ── M10.9 WP3 Phase 4: the one-time workflow-features invite ──────────────────────
  //
  // Mounted at the app shell so it overlays whichever scene is up (picker or workspace),
  // matching the GlobalDashboard/updater precedent. NOT lazy: it is small and shows at most
  // once per install, so a chunk boundary would buy nothing.
  //
  // NOT gated behind `useWorkflowFeaturesEnabled` — see the note at the render site. It is the
  // one workflow-NAMED surface that must exist precisely when the gate is OFF.
  //
  // The GATE half comes from the seam hook, not from a raw read (caught at review-quality,
  // 2026-07-29). Two reasons, and the second is a live defect the first would have hidden:
  //   1. `workflowGate.ts`'s header says a consumer imports the hook, never the helpers —
  //      WP2's whole contribution was "the seam is the only door", and routing around it
  //      here would have made this feature the first exception to a rule the milestone
  //      exists to establish.
  //   2. A one-shot `getWorkflowFeaturesEnabled()` NEVER RE-SYNCS. The hook subscribes to
  //      `WORKFLOW_FEATURES_ENABLED_EVENT`; a bare read does not. So enabling the gate in
  //      Settings mid-session left this value stale for the process lifetime. It happened to
  //      be masked — the show-predicate's `dismissedThisSession` term suppressed the invite
  //      on the only reachable path — but that is two independent flags coinciding, not a
  //      guarantee, and the masking would evaporate the moment either changed.
  // Worth noting the OFF-invariant guard could NOT see the violation: its bypass scan matches
  // the raw command strings, so an import of the typed wrapper was invisible to it.
  const workflowFeaturesEnabled = useWorkflowFeaturesEnabled();
  const [inviteSettings, setInviteSettings] = useState<{
    workflowInvite: WorkflowInviteOutcome | null;
  } | null>(null);
  const [inviteProjectCount, setInviteProjectCount] = useState(0);
  // `[Later]` lives here and ONLY here — React state, never disk. That is what makes "Later"
  // mean later: nothing is persisted, so the invite returns next launch.
  const [inviteDismissedThisSession, setInviteDismissedThisSession] =
    useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invite = await getWorkflowInvite();
        if (cancelled) return;
        setInviteSettings({ workflowInvite: invite });
        // Gate the project-count read on an UNRESOLVED invite — **M10.9's** Verdict (b)
        // (the invite-lifecycle verdict, issued at its WP1 probe and implemented by WP3).
        // ⚠️ Disambiguated 2026-08-18: this is NOT **M12 WP1's** Verdict (b), a different
        // rule entirely (the batched announce query — the announcement is a prediction,
        // never read back from the rendered label), which six sibling files cite as
        // "WP1 Verdict (b)". Two verdicts share the letter; always name the milestone:
        // once the invite has resolved — permanently, for all but first-run users — this
        // second `list_projects` call site is skipped entirely.
        if (invite === null) {
          const projects = await invoke<unknown[]>("list_projects");
          if (!cancelled) setInviteProjectCount(projects.length);
        }
      } catch {
        // Fail CLOSED: leaving `inviteSettings` null means the predicate never runs and the
        // invite never shows. A broken read must not spend the milestone's one-shot pitch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Includes the not-yet-loaded / rejected case (`inviteSettings === null` → false), which is
  // the fail-closed property: a broken read must not spend the one-shot pitch. Kept in the pure
  // module so that property is assertable as a VALUE — it was inline, which made it invisible to
  // any test of the predicate (which never receives null).
  const showInvite = shouldShowWorkflowInviteFor(
    inviteSettings === null
      ? null
      : { ...inviteSettings, workflowFeaturesEnabled },
    inviteProjectCount,
    inviteDismissedThisSession,
  );

  /** Resolve the invite permanently, then run an optional follow-up (e.g. open Settings). */
  const resolveInvite = useCallback(
    (outcome: WorkflowInviteOutcome, then?: () => void) => {
      // Optimistic local update so the modal closes immediately; the write follows. A failed
      // write only means the invite may reappear next launch — strictly better than blocking
      // the UI on IPC, and the operator can always Dismiss again.
      setInviteSettings((prev) =>
        prev === null ? prev : { ...prev, workflowInvite: outcome },
      );
      void setWorkflowInvite(outcome).catch((e) => {
        console.error("[claudesk] workflow_set_invite failed:", e);
      });
      then?.();
    },
    [],
  );

  // Latest-ref for the invite too, for the same reason the other two exist: the keydown
  // listener registers once with empty deps and must read the CURRENT value synchronously.
  const showInviteRef = useRef(false);
  useEffect(() => {
    showSettingsRef.current = showSettings;
    showDashboardRef.current = showDashboard;
    showInviteRef.current = showInvite;
  }, [showSettings, showDashboard, showInvite]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isDashboardChord(e)) {
        e.preventDefault();
        setShowDashboard((prev) => !prev); // toggle open/closed
        return;
      }
      // Esc dismisses the FRONT overlay only. Both the dashboard and (M10.9 WP2) the
      // Settings panel are app-level overlays with their own Esc branch, so one keypress
      // must not close both. Settings sits at z-index 45 above the dashboard's 40, so it
      // gets first refusal; the dashboard branch is skipped when Settings consumed the key.
      if (e.key === "Escape") {
        // Which overlay (if any) this Esc dismisses is decided by a pure function so the
        // rule is testable without React batching in the way — see escDismiss.ts for why
        // that matters (an inline version of this shipped a two-overlays-close-at-once
        // bug that source-text tests could not see). `null` = no overlay open, so Esc
        // passes through to the editor/finder/palette untouched.
        const target = escDismissTarget({
          dashboard: showDashboardRef.current,
          settings: showSettingsRef.current,
          invite: showInviteRef.current,
        });
        if (target !== null) e.preventDefault();
        // Esc on the invite means `[Later]`, NOT `[Dismiss]` — it hides for this session and
        // persists nothing, so the pitch returns next launch. Reading a keypress as permanent
        // suppression of a one-time pitch would resurrect the mislabeled-control bug the
        // three-button model exists to prevent: the user pressed Esc, not "never again".
        if (target === "invite") setInviteDismissedThisSession(true);
        if (target === "settings") setShowSettings(false);
        if (target === "dashboard") setShowDashboard(false);
        // ⚠️ Added 2026-08-18 (paydown WP3) for SYMMETRY with the dashboard-chord branch
        // above, which returns. Without it an Escape fell through to `isSettingsChord(e)`.
        // That was HARMLESS — `isSettingsChord` requires `e.key === ","`, which Escape can
        // never be — so this fixes no live bug. It removes a trap: the next chord predicate
        // added below this point inherits the fall-through, and a predicate that keys on
        // modifiers rather than a specific character would fire on Escape.
        return;
      }
      // M10.9 WP2 — ⌘, toggles the Settings panel. Also NOT gated on `view`: Settings is
      // app-global and must be reachable from the picker AND with a workspace focused —
      // the reachability requirement that drove WP1's verdict to retire the picker-only
      // settings strip.
      if (isSettingsChord(e)) {
        e.preventDefault();
        setShowSettings((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // QoL-WP1 — per-workspace unsaved-doc probe registry. Each workspace's RightPanelHost
  // registers `() => editor.dirtyDocCount()` on mount (cleared on unmount). The close
  // handler reads the closing workspace's probe to decide whether to confirm. A ref (not
  // state) because the probe set changes on workspace open/close, not per render, and the
  // close handler reads it imperatively at click time. `registerDirtyProbe` is useCallback-
  // stable so the registering effect in RightPanelHost runs once per workspace.
  const dirtyProbes = useRef<Map<string, () => number>>(new Map());
  const registerDirtyProbe = useCallback(
    (workspaceId: string, probe: (() => number) | null) => {
      if (probe) dirtyProbes.current.set(workspaceId, probe);
      else dirtyProbes.current.delete(workspaceId);
    },
    [],
  );

  // QoL-WP1 + M10.5-WP2 — the workspace pending a close-confirm. null = no dialog.
  // Holds the id + display name + the fired reason(s) (unsaved-doc count AND/OR
  // CC-active) so the ConfirmModal shows the exact blast radius; resolving it
  // (close/cancel) clears it. The `active` flag is captured at request time (a snapshot
  // of the CC status when × was clicked), not re-read while the dialog is open.
  const [pendingClose, setPendingClose] = useState<{
    id: string;
    name: string;
    dirtyCount: number;
    active: boolean;
    /** M12 WP2 — true when the ⏸ (pause) control opened this confirm rather than the ×.
     *  Carried through so the resolve runs the teardown the user actually asked for. */
    unclean: boolean;
  } | null>(null);

  // M10.5-WP2 — app-quit-while-active confirm. When the backend `CloseRequested` handler
  // holds the quit (`prevent_close`) and emits `quit-requested`, we compute the busy
  // workspace names here (the FE owns `isActiveState(stateFor)` + display names). null =
  // no dialog; a non-empty name list = the enumerated "quit anyway?" confirm is showing.
  // (An empty busy set never sets this — it quits immediately via `quit_now`.)
  const [pendingQuit, setPendingQuit] = useState<{ names: string[] } | null>(
    null,
  );

  // M10 WP4 — the in-app updater. One App-level hook drives the notify banner, the
  // confirm/progress/cancel flow, skip-this-version, and the WP1-fallback dialog. The
  // Phase 5 menu item + picker button call `updater.checkNow()` (a manual check that
  // ignores skip/disable); auto-check-on-launch is internal to the hook (gated by the
  // notifications pref + skip-list).
  const updater = useUpdater();

  // Close a workspace from the filmstrip × (QoL-WP1 + M10.5-WP2). Confirm before
  // destroying in-flight work: if its editor has unsaved docs (dirty) OR its CC is
  // mid-work (running/awaiting_input — `isActiveState`), open the discard-or-cancel
  // confirm; otherwise close immediately. The one dialog composes whichever reason(s)
  // fired (M10.5-WP2 spec: never two stacked dialogs). The actual teardown (CC +
  // second-terminal kill on unmount, workspace_deregister, workspace_watch_stop) rides
  // closeWorkspace removing the id from the list — see closeWorkspace + the
  // useWorkspaceStatus diff loop + XtermPane's unmount-kill.
  // M12 WP2 (P2.2/P2.4) — THE SINGLE FUNNEL for a *clean* workspace close.
  //
  // Every ordinary close routes through here so the unclean-exit flag is cleared exactly
  // once, at the one place that knows the close was user-intended and clean. `closeWorkspace`
  // has two call sites (immediate + post-confirm) and will likely gain more; funnelling them
  // means a future site inherits the clearing rather than having to remember it. That is the
  // M11 WP4 lesson (CLAUDE.md): guard ONE writer, don't rely on vigilance at each call site.
  //
  // ⚠️ The unclean-exit close (P2.4) deliberately does NOT come through here — see
  // `closeWorkspaceUnclean` below. Clearing is opt-in, so that path clears by not calling.
  const closeWorkspaceCleanly = useCallback(
    (workspaceId: string) => {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws) markSessionClean(ws.project_path, "workspace-close");
      closeWorkspace(workspaceId);
    },
    [workspaces, closeWorkspace],
  );

  // M12 WP2 (P2.4) — the UNCLEAN-exit close. Tears the workspace down through the exact
  // same path (so the PTY is reaped cleanly — that clean process-level shutdown is this
  // button's entire remaining value over a force-quit) while deliberately NOT clearing the
  // flag, so the next open offers `/resume`.
  //
  // It is a sibling of `closeWorkspaceCleanly`, not a variant with a boolean: the two
  // differ in one call, and naming them separately makes the difference legible at every
  // call site rather than hidden behind an argument someone can pass wrongly.
  const closeWorkspaceUnclean = useCallback(
    (workspaceId: string) => {
      closeWorkspace(workspaceId);
    },
    [closeWorkspace],
  );

  // The × and the ⏸ share ONE gate. `unclean` rides along in `pendingClose` so the
  // post-confirm resolve knows which teardown the user originally asked for — otherwise a
  // ⏸ on a busy workspace would silently resolve as a clean close, clearing the very flag
  // the button exists to preserve.
  const requestCloseWithIntent = useCallback(
    (workspaceId: string, unclean: boolean) => {
      const dirty = dirtyProbes.current.get(workspaceId)?.() ?? 0;
      const active = isActiveState(stateFor(workspaceId));
      if (dirty > 0 || active) {
        const ws = workspaces.find((w) => w.id === workspaceId);
        setPendingClose({
          id: workspaceId,
          name: ws?.display_name ?? UNNAMED_WORKSPACE,
          dirtyCount: dirty,
          active,
          unclean,
        });
        return;
      }
      if (unclean) closeWorkspaceUnclean(workspaceId);
      else closeWorkspaceCleanly(workspaceId);
    },
    [workspaces, closeWorkspaceCleanly, closeWorkspaceUnclean, stateFor],
  );

  const requestClose = useCallback(
    (workspaceId: string) => requestCloseWithIntent(workspaceId, false),
    [requestCloseWithIntent],
  );

  // M12 WP2 — the ⏸ (hover-revealed) close: same guard, same teardown, flag preserved.
  const requestPauseClose = useCallback(
    (workspaceId: string) => requestCloseWithIntent(workspaceId, true),
    [requestCloseWithIntent],
  );

  // Resolve the close-confirm: "close" tears the workspace down; "cancel" keeps it.
  // ⚠️ Honors the ORIGINAL intent (`target.unclean`) — see requestCloseWithIntent.
  const resolveClose = useCallback(
    (choice: CloseWorkspaceChoice) => {
      const target = pendingClose;
      setPendingClose(null);
      // The intent decision lives in the pure `resolveCloseIntent` so it can be driven by
      // tests directly — a dropped `unclean` here is silent (the ⏸ would clear the flag it
      // exists to preserve) and would not show up in any rendered output.
      const { action, id } = resolveCloseIntent(choice, target);
      if (action === "close-unclean" && id) closeWorkspaceUnclean(id);
      else if (action === "close-clean" && id) closeWorkspaceCleanly(id);
    },
    [pendingClose, closeWorkspaceCleanly, closeWorkspaceUnclean],
  );

  // Native menu bridge: the macOS menu (src-tauri/src/app_menu) emits a clicked
  // functional item's id on the `menu` event. We map it (menuBridge) to either a
  // synthetic KeyboardEvent re-dispatched on document — reproducing the exact chord
  // the existing capture-phase handlers already listen for (panel-switch, finder,
  // search, palette, close-tab), so no handler changes — or a React callback (open
  // the picker; launch Sublime/Merge/Finder against the FOCUSED workspace's path).
  //
  // The focused workspace's path is read via a ref so the listener registers ONCE
  // (latest-ref pattern, as in RightPanelHost) — re-subscribing on every focus change
  // would be churn and could drop an in-flight menu event.
  const focusedPathRef = useRef<string | null>(null);
  useEffect(() => {
    const focused = workspaces.find((w) => w.id === focusedId);
    focusedPathRef.current = focused ? focused.project_path : null;
  }, [workspaces, focusedId]);

  // M10.5-WP2 — latest-ref computing the busy workspace names, so the once-registered
  // `quit-requested` listener reads the CURRENT set without re-subscribing (same
  // latest-ref pattern as focusedPathRef). "Busy" = CC running/awaiting-input via the
  // Phase-1 `isActiveState` predicate — ONE source of truth for "active" across the
  // per-workspace close gate and this app-quit gate.
  const busyNamesRef = useRef<string[]>([]);
  useEffect(() => {
    busyNamesRef.current = workspaces
      .filter((w) => isActiveState(stateFor(w.id)))
      .map((w) => w.display_name ?? UNNAMED_WORKSPACE);
  }, [workspaces, stateFor]);

  // M10.5-WP2 — the app-quit round-trip. The backend holds the quit (`prevent_close`)
  // and emits `quit-requested`; here we decide. No busy workspace → quit immediately
  // (`quit_now` runs the shared teardown + app.exit). One or more busy → show the
  // enumerated confirm; "Quit Anyway" then calls `quit_now`, "Cancel" dismisses (the
  // close is already held, so the app just keeps running). Registers ONCE — the busy set
  // is read from busyNamesRef at event time.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen("quit-requested", () => {
      const names = busyNamesRef.current;
      if (names.length === 0) {
        void invoke("quit_now");
      } else {
        setPendingQuit({ names });
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Resolve the app-quit confirm: "quit" runs the real teardown + exit via the backend
  // command; "cancel" dismisses (the app keeps running — prevent_close already held it).
  const resolveQuit = useCallback((choice: QuitWhileActiveChoice) => {
    setPendingQuit(null);
    if (choice === "quit") void invoke("quit_now");
  }, []);

  // M10 WP4 — latest-ref for the updater's manual-check so the once-registered `menu`
  // listener can trigger "Check for Updates…" without re-subscribing (same latest-ref
  // pattern as focusedPathRef). checkNow ignores the skip-list + disable pref and shows
  // the banner if an update is available.
  const checkNowRef = useRef(updater.checkNow);
  useEffect(() => {
    checkNowRef.current = updater.checkNow;
  }, [updater.checkNow]);

  // CC permission mode (friend-requested dropdown, replacing the old yolo toggle) is the
  // backend's source of truth (persisted via cc_set_permission_mode, broadcast on
  // `cc-permission-mode`). Unlike the old yolo toggle, the View-menu radio carries the
  // TARGET mode on each item, so the menu handler invokes cc_set_permission_mode with that
  // mode directly — no current-state tracking is needed here (App.tsx no longer holds a
  // ref for it). The picker dropdown owns the visible seed/sync of the current value.

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // `cancelled` guard (mirrors useWorkspaceStatus): `listen` is async, so under
    // React StrictMode's dev double-mount the effect's cleanup can run BEFORE the
    // promise resolves. Without this guard the first subscription's unlisten is never
    // captured → two live `menu` listeners → every menu click dispatches the synthetic
    // keydown TWICE. Invisible for idempotent actions (panel-switch setPanel(→target))
    // but CANCELS OUT the toggle actions (finder/search/palette setX(open=>!open)
    // open-then-close) — the vh.2 bug. Unlisten immediately if torn down already.
    let cancelled = false;
    void listen<string>("menu", (event) => {
      const action = menuActionFor(event.payload);
      if (!action) return; // unknown / label-only id — ignore defensively
      if (action.kind === "key") {
        // Re-dispatch the synthetic chord; the capture-phase listeners (App + the
        // focused RightPanelHost) handle it exactly as a real keypress.
        document.dispatchEvent(new KeyboardEvent("keydown", action.init));
        return;
      }
      // callback actions
      // M10 WP4 — manual "Check for Updates…" (app-global, runs before the focused-path
      // guard). checkNow ignores the skip-list + disable pref and surfaces the outcome
      // (shows the banner when an update is available; no-op-ish otherwise).
      if (action.callback === "checkForUpdates") {
        void checkNowRef.current();
        return;
      }
      if (action.callback === "newWorkspace") {
        setShowPicker(true);
        return;
      }
      // M10.9 WP2 — Settings… is app-global (runs before the focused-path guard). OPENS
      // rather than toggles: a menu click is an unambiguous "show me settings", whereas
      // ⌘, is a toggle because a chord is cheap to press twice.
      if (action.callback === "openSettings") {
        setShowSettings(true);
        return;
      }
      // WP5 Phase 2 (rework) — PiP mode is app-global (not workspace-scoped), so these run
      // BEFORE the focused-path guard. Each View-menu radio item sets that mode via the
      // single pip_set_mode command (which persists + applies + broadcasts `pip-mode`).
      const pipModeForCallback =
        action.callback === "pipModeOff"
          ? "off"
          : action.callback === "pipModeOn"
            ? "on"
            : action.callback === "pipModeAuto"
              ? "auto"
              : null;
      if (pipModeForCallback) {
        void invoke("pip_set_mode", { mode: pipModeForCallback }).catch((e) => {
          console.error("[claudesk] pip_set_mode (menu) failed:", e);
        });
        return;
      }
      // CC permission mode is app-global (not workspace-scoped), so it runs BEFORE the
      // focused-path guard too. Each View-menu radio item carries its TARGET mode, so we
      // invoke cc_set_permission_mode with that mode directly (no invert). The backend
      // persists + broadcasts `cc-permission-mode`, which re-checks the menu radio + the
      // picker dropdown. Takes effect on the NEXT cc_spawn (argv is chosen once per process).
      if (action.callback === "setCcPermissionMode") {
        void invoke("cc_set_permission_mode", { mode: action.mode }).catch(
          (e) => {
            // Menu-path write failures are deliberately silent (console-only) — App.tsx has
            // no toast surface like the picker, and this mirrors the pip_set_mode menu path
            // above. The picker's dropdown handler keeps its optimistic-set + revert + toast.
            console.error(
              "[claudesk] cc_set_permission_mode (menu) failed:",
              e,
            );
          },
        );
        return;
      }
      // The three launchers act on the focused workspace; no-op when none is open.
      const path = focusedPathRef.current;
      if (!path) return;
      if (action.callback === "openSublimeText") void openSublime(path);
      else if (action.callback === "openSublimeMerge")
        void openSublimeMerge(path);
      else if (action.callback === "revealInFinder") void openFinder(path);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Open from the overlay = append a workspace, then dismiss the overlay.
  // ⚠️ The second AND THIRD parameters are LOAD-BEARING and TypeScript cannot enforce either.
  // A handler declared `(projectPath: string) => void` still satisfies the picker's
  // `(projectPath, action, intent) => void` prop — parameter counts are contravariant, so a
  // too-narrow handler type-checks and **silently discards the trailing arguments**. That is the
  // exact shape of bug this milestone has now paid for FOUR times (a dead enum route; a
  // spawn-order term that was never consumed; this handler dropping the action in Phase 3; and
  // P4.6's no-fire intent never reaching `cc_spawn` — which shipped and resumed a conversation
  // the user had explicitly declined). Guarded by `pickerOnOpenArity.test.ts`, not by
  // remembering.
  const openFromOverlay = useCallback(
    (
      projectPath: string,
      pendingAction: AutoResumeAction = null,
      openIntent: OpenIntent = "fire",
    ) => {
      openWorkspace(projectPath, pendingAction, openIntent);
      setShowPicker(false);
    },
    [openWorkspace],
  );

  // WP6 Phase 2 — DEV-ONLY workspace seed seam. Gated on `import.meta.env.DEV`, so
  // neither path exists in a `pnpm tauri build` bundle. Both paths funnel through
  // the same live `openWorkspace` reducer callback (no new workspace-creation
  // logic): the picker dialog stub-wedges a headless browser
  // (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE), so this lets
  // verify-self / console harnesses open a workspace without the Tauri dialog.
  //   - `?ws=<path>` (read once on mount) — Playwright navigates here.
  //   - `window.__seedWorkspace(path)` — console-driven harnesses.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const seeded = parseSeedParam(window.location.search);
    if (seeded) openWorkspace(seeded);
    window.__seedWorkspace = (path: string) => openWorkspace(path);
    return () => {
      delete window.__seedWorkspace;
    };
  }, [openWorkspace]);

  // M10.9 WP3 Phase 4 — DEV-ONLY invite reset seam. Same `import.meta.env.DEV` gate and
  // same delete-on-cleanup shape as `__seedWorkspace` above, so it is absent from a
  // `pnpm tauri build` bundle.
  //
  // Exists because the invite is a ONE-TIME surface: once resolved, nothing in the product
  // ever un-resolves it (by design — there is no "show me that invite again" affordance).
  // Verifying the first-run path therefore needs a way back to `null`, and the alternative is
  // hand-editing `settings.json` between runs, which is both slow and easy to get wrong.
  //
  // Writes through the SAME setter the invite uses, so the reset exercises the real path
  // rather than a test-only shortcut. Re-seeds local state too, so the invite can reappear
  // without a reload.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__workflowInviteReset = async () => {
      await setWorkflowInvite(null);
      setInviteSettings((prev) =>
        prev === null ? prev : { ...prev, workflowInvite: null },
      );
      setInviteDismissedThisSession(false);
      const projects = await invoke<unknown[]>("list_projects");
      setInviteProjectCount(projects.length);
    };
    return () => {
      delete window.__workflowInviteReset;
    };
  }, []);

  return (
    <div className="app-shell" data-testid="app-shell">
      {/* M10 WP4 — the update-notify banner is an IN-FLOW leading row of the app-shell
          (NOT an absolute overlay), so the scene below it (picker or filmstrip+stage) is
          pushed down and NEVER covered. This removes the operator-flagged misclick hazard
          (P4.verify-human.1): an absolute banner would overlay the filmstrip's top ~35px,
          so a slow-network late-load could obscure/steal a tile click. Reserving the row
          means the filmstrip can't be clicked-through by the banner. The banner is
          conditional, so when absent it occupies zero height (no reserved gap). */}
      {updater.banner && (
        <UpdateNotifyBanner
          version={updater.banner.available_version ?? ""}
          applyingPercent={
            updater.phase === "applying" ? updater.applyingPercent : undefined
          }
          onUpdate={updater.requestUpdate}
          onSkip={updater.skipVersion}
          onDismiss={updater.dismissBanner}
        />
      )}
      {/* M10 WP6 P1.1/P1.4 — the updater STATUS row: surfaces an apply FAILURE
          (phase==="error" + errorMessage — the WP4 MAJOR gap, previously unconsumed so a
          failed update silently reverted the banner) and the manual-check NOTE
          (up-to-date / check-failed — the native-menu path had no App-side surface). Same
          in-flow, misclick-safe app-shell row as the notify banner above; renders null
          (zero height) when there's nothing to show. Error > note precedence. */}
      <UpdaterStatusRow
        isError={updater.phase === "error"}
        errorMessage={updater.errorMessage}
        note={updater.statusNote}
        onDismissError={updater.dismissError}
        onDismissNote={updater.dismissStatusNote}
      />
      <div className="app-shell-scene" data-testid="app-shell-scene">
        {view === "picker" ? (
          <ProjectPicker
            onOpen={openWorkspace}
            onOpenDashboard={() => setShowDashboard(true)}
            // M10.9 WP2 Phase 4 — the picker's Settings entry point. Opens (not toggles)
            // the same single <SettingsPanel>, matching the menu item's semantics; ⌘, is
            // the toggle.
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <>
            <Filmstrip
              tiles={tiles}
              statusFor={stateFor}
              snippetFor={snippetFor}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              onPromote={focusWorkspace}
              onReorder={reorderTiles}
              onReorderCommit={commitOrder}
              onAddWorkspace={() => setShowPicker(true)}
              onOpenDashboard={() => setShowDashboard(true)}
              onClose={requestClose}
              onPauseClose={requestPauseClose}
            />
            <CenterStage
              workspaces={workspaces}
              focusedId={focusedId}
              onSessionId={setSessionId}
              statusFor={stateFor}
              snippetFor={snippetFor}
              registerDirtyProbe={registerDirtyProbe}
            />
            {showPicker && (
              <PickerOverlay
                onOpen={openFromOverlay}
                onDismiss={() => setShowPicker(false)}
              />
            )}
            {/* QoL-WP1 — close-with-unsaved-changes confirm (discard or cancel). Mounted
              only while a close is pending the guard; reuses the shared ConfirmModal. */}
            {pendingClose && (
              <ConfirmModal
                spec={closeWorkspaceSpec(pendingClose.name, {
                  dirtyCount: pendingClose.dirtyCount,
                  active: pendingClose.active,
                })}
                onChoose={resolveClose}
              />
            )}
          </>
        )}
      </div>
      {/* M9 WP6a — the GLOBAL time-analytics dashboard is app-level (NOT inside the
          workspace-open branch), so it overlays whichever scene is up — the picker at
          launch OR an open workspace — reachable in both (its data is all-projects;
          SURFACE-2026-07-08-M9-WP6A-DASHBOARD-FROM-PICKER). Mounted ONCE, lazy — the chunk
          loads on first open. Opened via ⌘⇧A, the Filmstrip analytics button, or the picker
          analytics button; dismissed via its own close button or Esc. Whatever is beneath
          (picker or CenterStage + workspaces) stays mounted underneath. */}
      {showDashboard && (
        <Suspense
          fallback={
            <div
              className="global-dashboard-loading"
              data-testid="global-dashboard-loading"
            >
              Loading analytics…
            </div>
          }
        >
          <GlobalDashboard onClose={() => setShowDashboard(false)} />
        </Suspense>
      )}
      {/* M10.9 WP2 — the app-global Settings panel. Also app-level (NOT inside the
          workspace-open branch) so ⌘, and Claudesk → Settings… reach it from the picker
          AND from an open workspace. Rendered AFTER the dashboard and at a higher
          z-index, so it stacks on top when both happen to be open; its Esc branch runs
          first for the same reason. */}
      {showSettings && (
        <Suspense
          fallback={
            <div
              className="settings-panel-loading"
              data-testid="settings-panel-loading"
            >
              Loading settings…
            </div>
          }
        >
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            // M10.9 WP2 Phase 4 — the manual update check moved here with the
            // update-notifications toggle it sits beside. App owns `useUpdater`; the
            // panel just kicks the check.
            onCheckForUpdates={updater.checkNow}
            // M10.9 WP3 — set only when the invite routed the user here, so they can see
            // WHICH of four groups they were sent to.
            highlightGroup={settingsHighlight}
          />
        </Suspense>
      )}
      {/* M10.9 WP3 Phase 4 — the one-time invite. Front-most (z-index 50): its primary
          button opens the Settings panel BEHIND it, so it must outrank Settings' 45.

          DELIBERATELY NOT gated behind `useWorkflowFeaturesEnabled` (P4.6). Every other
          workflow-named surface in this milestone must not exist while the gate is OFF — this
          one is the exact inverse: it exists PRECISELY when the gate is off, and disappears
          once the user has engaged. It is the on-ramp to the gate, not a consumer of it, so
          the seam contract does not apply.

          It also does not trip the OFF-invariant guard, but that is a property of the guard's
          current arms rather than a principle: the guard checks AVAILABLE_PANELS (this is not
          a right-panel tab), MENU_IDS (no menu item), and *chord*.ts modules (no chord). The
          invite is none of those. Recorded so a future reader doesn't "fix" this by gating it
          — that would hide the only affordance that tells a user the features exist. */}
      {showInvite && (
        <WorkflowInviteModal
          onShowSettings={() =>
            resolveInvite("acknowledged", () => {
              setSettingsHighlight("workflow-features");
              setShowSettings(true);
            })
          }
          // Persists NOTHING — that is what makes "Later" mean later.
          onLater={() => setInviteDismissedThisSession(true)}
          onDismiss={() => resolveInvite("dismissed")}
        />
      )}
      {/* M10 WP4 — the confirm + WP1-fallback dialogs are modal OVERLAYS (they SHOULD
          cover the scene while active), unlike the notify banner (an in-flow row, hoisted
          to the top of the app-shell above). Update… opens this confirm; confirm drives
          download (progress bar in the banner) → install → self-clear → relaunch. The
          fallback quarantine dialog shows only if the self-clear proves insufficient
          (default GO path leaves fallbackBundlePath null). */}
      {updater.phase === "confirming" && updater.banner?.available_version && (
        <ConfirmModal
          spec={updateConfirmSpec(updater.banner.available_version)}
          onChoose={(v) =>
            v === "update" ? updater.confirmUpdate() : updater.cancelUpdate()
          }
        />
      )}
      {updater.fallbackBundlePath && (
        <ConfirmModal
          spec={quarantineFallbackSpec(updater.fallbackBundlePath)}
          onChoose={() => updater.dismissFallback()}
        />
      )}
      {/* M10.5-WP2 — app-quit-while-active confirm. App-shell level (NOT inside the
          workspace-open branch) so a ⌘Q from either the picker or an open workspace can
          surface it. Only mounted when the backend held a quit and ≥1 workspace is busy. */}
      {pendingQuit && (
        <ConfirmModal
          spec={quitWhileActiveSpec(pendingQuit.names)}
          onChoose={resolveQuit}
        />
      )}
    </div>
  );
}

export default App;
