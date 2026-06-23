import "./App.css";
import { useCallback, useEffect, useState } from "react";
import { useWorkspaceList } from "./state/useWorkspaceList";
import { useWorkspaceStatus } from "./state/useWorkspaceStatus";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
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
  const { workspaces, focusedId, view, openWorkspace, setSessionId } =
    useWorkspaceList();
  // M3 WP6 — live CC status from the `workspace-status` hook channel + the
  // open/close registration that makes WP4's cwd→workspace match resolve.
  const { stateFor } = useWorkspaceStatus(workspaces);

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
          <Filmstrip onAddWorkspace={() => setShowPicker(true)} />
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
