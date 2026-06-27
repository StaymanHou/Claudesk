import "./App.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceList } from "./state/useWorkspaceList";
import { useWorkspaceStatus } from "./state/useWorkspaceStatus";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
import {
  deriveTiles,
  tileForSwitchIndex,
} from "./components/workspace/filmstripTiles";
import { workspaceSwitchIndex } from "./components/workspace/workspaceSwitchChord";
import { newWorkspaceChord } from "./components/workspace/newWorkspaceChord";
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
  type CloseWorkspaceChoice,
} from "./components/workspace/editor/confirmDialog";
import { parseSeedParam } from "./state/seedWorkspace";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { menuActionFor } from "./menu/menuBridge";
import { openSublime, openSublimeMerge } from "./sublime/sublimeLaunch";
import { openFinder } from "./finder/finderLaunch";
import { usePipFanout } from "./pip/usePipFanout";
import { useMirrorTicker } from "./components/workspace/useMirrorTicker";

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
  const { stateFor } = useWorkspaceStatus(workspaces);

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
  useEffect(() => {
    if (view !== "workspace-open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const n = workspaceSwitchIndex(e);
      if (n === null) return;
      const tile = tileForSwitchIndex(tiles, n);
      if (!tile) return; // out of range → no-op (roster is complete; no Nth tile)
      e.preventDefault();
      focusWorkspace(tile.id);
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [view, tiles, focusWorkspace]);

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

  // QoL-WP1 — the workspace pending a close-confirm (dirty guard). null = no dialog.
  // Holds the id + display name + unsaved count so the ConfirmModal can show the blast
  // radius; resolving it (close/cancel) clears it.
  const [pendingClose, setPendingClose] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);

  // Close a workspace from the filmstrip × (QoL-WP1). If its editor has unsaved docs,
  // open the discard-or-cancel confirm; otherwise close immediately. The actual teardown
  // (CC + second-terminal kill on unmount, workspace_deregister, workspace_watch_stop)
  // rides closeWorkspace removing the id from the list — see closeWorkspace + the
  // useWorkspaceStatus diff loop + XtermPane's unmount-kill.
  const requestClose = useCallback(
    (workspaceId: string) => {
      const dirty = dirtyProbes.current.get(workspaceId)?.() ?? 0;
      if (dirty > 0) {
        const ws = workspaces.find((w) => w.id === workspaceId);
        setPendingClose({
          id: workspaceId,
          name: ws?.display_name ?? "This workspace",
          count: dirty,
        });
        return;
      }
      closeWorkspace(workspaceId);
    },
    [workspaces, closeWorkspace],
  );

  // Resolve the close-confirm: "close" tears the workspace down; "cancel" keeps it.
  const resolveClose = useCallback(
    (choice: CloseWorkspaceChoice) => {
      const target = pendingClose;
      setPendingClose(null);
      if (choice === "close" && target) closeWorkspace(target.id);
    },
    [pendingClose, closeWorkspace],
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
      if (action.callback === "newWorkspace") {
        setShowPicker(true);
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
  const openFromOverlay = useCallback(
    (projectPath: string) => {
      openWorkspace(projectPath);
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

  return (
    <div className="app-shell" data-testid="app-shell">
      {view === "picker" ? (
        <ProjectPicker onOpen={openWorkspace} />
      ) : (
        <>
          <Filmstrip
            tiles={tiles}
            statusFor={stateFor}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onPromote={focusWorkspace}
            onReorder={reorderTiles}
            onReorderCommit={commitOrder}
            onAddWorkspace={() => setShowPicker(true)}
            onClose={requestClose}
          />
          <CenterStage
            workspaces={workspaces}
            focusedId={focusedId}
            onSessionId={setSessionId}
            statusFor={stateFor}
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
              spec={closeWorkspaceSpec(pendingClose.name, pendingClose.count)}
              onChoose={resolveClose}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
