// WP5 — Project Picker (mock).
//
// VSCode-style entry surface: a list of recent projects + an "Open Folder"
// button. Clicking a recent (or picking a folder) calls `onOpen(path)`, which
// the app shell turns into an openWorkspace action + a view transition.
//
// Recents semantics (confirmed with operator during WP5 verify-human): the list
// KEEPS EVERY project indefinitely — nothing auto-evicts. Entries leave the list
// only when the user explicitly deletes them (the per-row × button). With 20+
// rotating projects the list is scrollable. Ordering is most-recently-opened
// first (WP6 supplies real `last_opened_at` ordering via `record_open`).
//
// Phase 1 (this build): recents are CANNED mock data held in component state so
// the delete affordance is exercisable, and "Open Folder" calls a MOCKED dialog
// stub (no real native dialog). WP6 replaces the mock list with real IPC
// (`list_projects` ordered by recency) and delete with `remove_project`, and the
// button with `tauri-plugin-dialog`.

import { useState } from "react";

interface RecentProject {
  display_name: string;
  project_path: string;
}

// Canned recents — replaced by the real config store (projects.json) in WP6.
// A long-ish list so the scroll behaviour is observable in the mock.
const MOCK_RECENTS: RecentProject[] = [
  {
    display_name: "claudesk",
    project_path: "/Users/stayman/Personal/projects/claudesk",
  },
  {
    display_name: "my-claude-code-customization",
    project_path:
      "/Users/stayman/Personal/projects/my-claude-code-customization",
  },
  {
    display_name: "scratch",
    project_path: "/Users/stayman/Personal/projects/scratch",
  },
  {
    display_name: "api-gateway",
    project_path: "/Users/stayman/Personal/projects/api-gateway",
  },
  {
    display_name: "marketing-site",
    project_path: "/Users/stayman/Personal/projects/marketing-site",
  },
  {
    display_name: "data-pipeline",
    project_path: "/Users/stayman/Personal/projects/data-pipeline",
  },
  {
    display_name: "mobile-app",
    project_path: "/Users/stayman/Personal/projects/mobile-app",
  },
  {
    display_name: "infra",
    project_path: "/Users/stayman/Personal/projects/infra",
  },
];

// Mocked folder-picker dialog. WP6 swaps this for `tauri-plugin-dialog`'s
// `open({ directory: true })`. Returns a canned path so the flow is exercisable.
function mockOpenFolderDialog(): string | null {
  return "/Users/stayman/Personal/projects/picked-folder";
}

interface ProjectPickerProps {
  onOpen: (projectPath: string) => void;
}

export function ProjectPicker({ onOpen }: ProjectPickerProps) {
  // Mock-only local state so the × delete affordance works in WP5. WP6 lifts
  // this to the real store (`remove_project`) — the recents are never owned by
  // this component in production.
  const [recents, setRecents] = useState<RecentProject[]>(MOCK_RECENTS);

  function handleOpenFolder() {
    const picked = mockOpenFolderDialog();
    if (picked) onOpen(picked);
  }

  function handleRemove(projectPath: string) {
    setRecents((rs) => rs.filter((r) => r.project_path !== projectPath));
  }

  return (
    <div className="picker" data-testid="picker">
      <h1>Claudesk</h1>
      <ul className="picker-recents" data-testid="picker-recents">
        {recents.map((r) => (
          <li key={r.project_path} className="picker-recent-row">
            <button
              type="button"
              className="picker-recent"
              data-testid="picker-recent"
              onClick={() => onOpen(r.project_path)}
            >
              <span className="picker-recent-name">{r.display_name}</span>
              <span className="picker-recent-path">{r.project_path}</span>
            </button>
            <button
              type="button"
              className="picker-recent-remove"
              data-testid="picker-recent-remove"
              aria-label={`Remove ${r.display_name} from recents`}
              title="Remove from recents"
              onClick={() => handleRemove(r.project_path)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="picker-open-folder"
        onClick={handleOpenFolder}
      >
        Open Folder…
      </button>
    </div>
  );
}
