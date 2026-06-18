import "./App.css";
import { useWorkspaceList } from "./state/useWorkspaceList";
import { CenterStage } from "./components/workspace/CenterStage";
import { Filmstrip } from "./components/workspace/Filmstrip";
import { ProjectPicker } from "./components/picker/ProjectPicker";

// WP5 app shell. The view is a state machine over WorkspaceList:
//   - "picker"         → Project Picker (no workspace open)
//   - "workspace-open" → Filmstrip slot + Center Stage (a workspace is focused)
//
// Opening a project from the picker calls openWorkspace(path), which adds a
// workspace and focuses it; the derived `view` flips to "workspace-open".
//
// Phase 1's mock workspace + xterm mount, and the empty Filmstrip slot, ride
// underneath unchanged. WP6 swaps the picker's mock data for the real config
// store; WP7 swaps the mock terminal for a PTY-backed CC session.
function App() {
  const { workspaces, focusedId, view, openWorkspace } = useWorkspaceList();

  return (
    <div className="app-shell" data-testid="app-shell">
      {view === "picker" ? (
        <ProjectPicker onOpen={openWorkspace} />
      ) : (
        <>
          <Filmstrip />
          <CenterStage workspaces={workspaces} focusedId={focusedId} />
        </>
      )}
    </div>
  );
}

export default App;
