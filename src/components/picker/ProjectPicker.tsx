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
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { pruneToastMessage } from "./pruneToast";
import { mapIpcError } from "./ipcError";

// A picker toast is either an INFO note (e.g. "removed N stale projects" on mount) or
// an ERROR (an IPC rejection that must surface, not be swallowed — the WP6 MAJOR). The
// kind drives styling; both are dismissible.
type PickerToast = { kind: "info" | "error"; message: string };

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
  // The picker toast: an info note (prune-on-mount) or a surfaced IPC error. `null` =
  // no toast (the common case). Both kinds are dismissible.
  const [toast, setToast] = useState<PickerToast | null>(null);
  // M6 WP7 Phase 3 — the CC yolo opt-out, surfaced ALSO on the picker (the app-global
  // home screen) as a checkbox synced with the native View-menu item. The backend is the
  // single source of truth: seed from cc_get_yolo on mount, stay in sync via the `cc-yolo`
  // broadcast (so a native-menu toggle flips this box too), and on change call cc_set_yolo
  // (which persists + re-broadcasts, re-checking the menu). Default ON until the read lands.
  const [ccYolo, setCcYolo] = useState(true);

  useEffect(() => {
    // Load recents on mount. First prune any project whose folder was deleted
    // between sessions (`prune_missing_projects` returns the dropped records), then
    // list the survivors. A `cancelled` guard avoids a state update if the picker
    // unmounts before the IPC resolves.
    //
    // M4 WP2 P4.1 — a failed prune/list is SURFACED, not swallowed: previously the
    // catch was empty, so a malformed projects.json read as "no projects yet" (the
    // deferred WP6 MAJOR). First-run-empty is NOT an error: the backend returns []
    // when projects.json is absent, which resolves normally (no toast).
    let cancelled = false;
    void (async () => {
      try {
        const dropped = await invoke<RecentProject[]>("prune_missing_projects");
        if (cancelled) return;
        const pruneMsg = pruneToastMessage(dropped);
        if (pruneMsg !== null) setToast({ kind: "info", message: pruneMsg });
        const projects = await invoke<RecentProject[]>("list_projects");
        if (!cancelled) setRecents(projects);
      } catch (e) {
        if (!cancelled)
          setToast({ kind: "error", message: mapIpcError("load projects", e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // M6 WP7 Phase 3 — seed the yolo checkbox from the backend on mount, then track the
  // `cc-yolo` broadcast so toggling the native View-menu item keeps this box in sync
  // (third surface, one source of truth — same pattern App.tsx uses for ccYoloRef + the
  // menu's apply_cc_yolo_to_menu). `cancelled` guards the async listen under StrictMode.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void invoke<boolean>("cc_get_yolo")
      .then((yolo) => {
        if (!cancelled) setCcYolo(yolo);
      })
      .catch((e) => console.error("[claudesk] cc_get_yolo (picker) failed:", e));
    void listen<boolean>("cc-yolo", (event) => {
      setCcYolo(event.payload);
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

  function handleToggleYolo(next: boolean) {
    // Optimistic flip; the `cc-yolo` broadcast (fired by cc_set_yolo) re-confirms it and
    // re-checks the menu. A rejection reverts the optimistic state + surfaces the error.
    setCcYolo(next);
    void invoke("cc_set_yolo", { yolo: next }).catch((e) => {
      setCcYolo(!next);
      setToast({ kind: "error", message: mapIpcError("update yolo setting", e) });
    });
  }

  async function handleOpenRecent(projectPath: string) {
    // Stamp recency before handing off so the next list_projects reflects it. A
    // rejection surfaces as an error toast (P4.2) — never dropped as an unhandled
    // promise rejection. We do NOT proceed to onOpen if recording failed, since the
    // store is in an unknown state.
    try {
      await invoke("record_open", { path: projectPath });
      onOpen(projectPath);
    } catch (e) {
      setToast({ kind: "error", message: mapIpcError("open project", e) });
    }
  }

  async function handleOpenFolder() {
    try {
      const picked = await openDialog({ directory: true });
      if (typeof picked !== "string") return; // user cancelled (null) or multi (array)
      await invoke("add_project", { path: picked });
      onOpen(picked);
    } catch (e) {
      setToast({ kind: "error", message: mapIpcError("open folder", e) });
    }
  }

  async function handleRemove(projectPath: string) {
    try {
      await invoke("remove_project", { path: projectPath });
      setRecents((rs) => rs.filter((r) => r.project_path !== projectPath));
    } catch (e) {
      setToast({ kind: "error", message: mapIpcError("remove project", e) });
    }
  }

  const visible = recents.filter((r) => matchesFilter(r, filter));

  return (
    <div className="picker" data-testid="picker">
      <h1>Claudesk</h1>
      <label className="picker-yolo" data-testid="picker-yolo">
        <input
          type="checkbox"
          checked={ccYolo}
          onChange={(e) => handleToggleYolo(e.target.checked)}
        />
        <span>Skip Permission Prompts (yolo)</span>
      </label>
      {toast !== null && (
        <div
          className={`picker-toast${toast.kind === "error" ? " picker-toast-error" : ""}`}
          role={toast.kind === "error" ? "alert" : "status"}
          data-testid="picker-toast"
          data-toast-kind={toast.kind}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className="picker-toast-dismiss"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
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
