import "./App.css";
import { useEffect } from "react";
import { useWorkspaceList } from "./state/useWorkspaceList";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
import { ProjectPicker } from "./components/picker/ProjectPicker";
import { parseSeedParam } from "./state/seedWorkspace";

// WP5 app shell. The view is a state machine over WorkspaceList:
//   - "picker"         → Project Picker (no workspace open)
//   - "workspace-open" → Filmstrip slot + Center Stage (a workspace is focused)
//
// Opening a project from the picker calls openWorkspace(path), which adds a
// workspace and focuses it; the derived `view` flips to "workspace-open".
//
// WP8's Sublime launchers (Text + Merge) are icon buttons in each workspace's
// right-panel tab row (RightPanelHost), not here — so the app shell stays
// unchanged from WP5/WP7. (The old ⌘⇧O Text hotkey was removed in WP8.)
function App() {
  const { workspaces, focusedId, view, openWorkspace, setSessionId } =
    useWorkspaceList();

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
          <Filmstrip />
          <CenterStage
            workspaces={workspaces}
            focusedId={focusedId}
            onSessionId={setSessionId}
          />
        </>
      )}
    </div>
  );
}

export default App;
