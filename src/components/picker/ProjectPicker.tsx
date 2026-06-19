// WP6 — Project Picker (real config store).
//
// VSCode-style entry surface: a filterable list of recent projects + an "Open
// Folder" button. Recents come from the Rust config store (projects.json) via
// the `list_projects` IPC command, ordered most-recently-opened first. Clicking
// a recent records the open (`record_open`) then calls `onOpen(path)`. "Open
// Folder…" opens the native directory dialog, persists the pick (`add_project`),
// then opens it. The per-row × deletes the project from the store
// (`remove_project`) — manual delete only, nothing auto-evicts.
//
// Recents semantics (confirmed with operator during WP5 verify-human): the list
// KEEPS EVERY project indefinitely. With 20+ rotating projects the list is
// scrollable and the always-present filter box narrows it by substring.
//
// Phase posture: WP6 wires the real store + dialog (replacing WP5's mock data and
// mocked folder stub). The opened workspace is still the WP5 mock workspace until
// WP7 swaps in a PTY-backed CC session.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// Mirrors the Rust `Project` serialization (`path` serializes as `project_path`).
// Only the fields the picker reads are typed here; `last_opened_at` /
// `default_drive_mode` exist on the wire but are unused by this component.
export interface RecentProject {
  display_name?: string;
  project_path: string;
}

// Pure, testable filter predicate. Case-insensitive substring match on the
// display name and the path. An empty/blank query matches everything.
export function matchesFilter(project: RecentProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const name = (project.display_name ?? "").toLowerCase();
  const path = project.project_path.toLowerCase();
  return name.includes(q) || path.includes(q);
}

// Label shown for a project row: prefer the display name, fall back to the path.
function labelFor(project: RecentProject): string {
  return project.display_name ?? project.project_path;
}

interface ProjectPickerProps {
  onOpen: (projectPath: string) => void;
}

export function ProjectPicker({ onOpen }: ProjectPickerProps) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // Load recents from the config store on mount. A `cancelled` guard avoids a
    // state update if the picker unmounts before the IPC resolves. A failed load
    // leaves the list empty (first run has no projects.json yet — the backend
    // returns []).
    let cancelled = false;
    void (async () => {
      const projects = await invoke<RecentProject[]>("list_projects");
      if (!cancelled) setRecents(projects);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleOpenRecent(projectPath: string) {
    // Stamp recency before handing off so the next list_projects reflects it.
    await invoke("record_open", { path: projectPath });
    onOpen(projectPath);
  }

  async function handleOpenFolder() {
    const picked = await openDialog({ directory: true });
    if (typeof picked !== "string") return; // user cancelled (null) or multi (array)
    await invoke("add_project", { path: picked });
    onOpen(picked);
  }

  async function handleRemove(projectPath: string) {
    await invoke("remove_project", { path: projectPath });
    setRecents((rs) => rs.filter((r) => r.project_path !== projectPath));
  }

  const visible = recents.filter((r) => matchesFilter(r, filter));

  return (
    <div className="picker" data-testid="picker">
      <h1>Claudesk</h1>
      <input
        type="search"
        className="picker-filter"
        data-testid="picker-filter"
        placeholder="Filter projects…"
        aria-label="Filter projects"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="picker-recents" data-testid="picker-recents">
        {visible.map((r) => (
          <li key={r.project_path} className="picker-recent-row">
            <button
              type="button"
              className="picker-recent"
              data-testid="picker-recent"
              onClick={() => void handleOpenRecent(r.project_path)}
            >
              <span className="picker-recent-name">{labelFor(r)}</span>
              <span className="picker-recent-path">{r.project_path}</span>
            </button>
            <button
              type="button"
              className="picker-recent-remove"
              data-testid="picker-recent-remove"
              aria-label={`Remove ${labelFor(r)} from recents`}
              title="Remove from recents"
              onClick={() => void handleRemove(r.project_path)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="picker-open-folder"
        onClick={() => void handleOpenFolder()}
      >
        Open Folder…
      </button>
    </div>
  );
}
