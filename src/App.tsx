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
// WP8's Sublime hotkey + button live inside each Workspace's right panel
// (SublimeToolbar), not here — the focused workspace owns its own in-app ⌘⇧E
// handler, so the app shell stays unchanged from WP5/WP7.
function App() {
  const { workspaces, focusedId, view, openWorkspace, setSessionId } =
    useWorkspaceList();

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
