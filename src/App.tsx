import "./App.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceList } from "./state/useWorkspaceList";
import { useWorkspaceStatus } from "./state/useWorkspaceStatus";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
import { deriveTiles, tileForSwitchIndex } from "./components/workspace/filmstripTiles";
import { workspaceSwitchIndex } from "./components/workspace/workspaceSwitchChord";
import { loadOrder, reorder, saveOrder } from "./components/workspace/filmstripOrder";
import { loadCollapsed, saveCollapsed } from "./components/workspace/filmstripCollapse";
import { ProjectPicker } from "./components/picker/ProjectPicker";
import { PickerOverlay } from "./components/picker/PickerOverlay";
import { parseSeedParam } from "./state/seedWorkspace";

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
  const { workspaces, focusedId, view, openWorkspace, focusWorkspace, setSessionId } =
    useWorkspaceList();
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

  // M4 WP2 — the new-workspace overlay (the filmstrip "+" re-entry). Only ever
  // shown when a workspace is already open; first-open uses the full-screen picker.
  const [showPicker, setShowPicker] = useState(false);

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
          />
          <CenterStage
            workspaces={workspaces}
            focusedId={focusedId}
            onSessionId={setSessionId}
            statusFor={stateFor}
          />
          {showPicker && (
            <PickerOverlay
              onOpen={openFromOverlay}
              onDismiss={() => setShowPicker(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
