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
import { pruneToastMessage } from "./pruneToast";
import { mapIpcError } from "./ipcError";
import { ProjectModelCell, ProjectModelHints } from "./ProjectModelCell";
import { PICKER_ROW_CELLS } from "./pickerRowOrder";

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
  // M9 WP6a — the time-analytics dashboard is a GLOBAL (all-projects) surface, so it
  // must be reachable from the picker scene at launch, not only after a workspace opens
  // (SURFACE-2026-07-08-M9-WP6A-DASHBOARD-FROM-PICKER). When provided, the picker shows an
  // analytics entry point that toggles the same single <GlobalDashboard> App.tsx owns.
  // OPTIONAL here (unlike Filmstrip's required `onOpenDashboard`) on purpose: the picker can
  // render before App wires the handler, and it guards the absence (the entry point just hides);
  // the filmstrip only ever mounts with a live handler, so it requires it.
  onOpenDashboard?: () => void;
  // M10.9 WP2 Phase 4 — open the app-global Settings panel. Same shape as
  // `onOpenDashboard`: the picker renders a header entry point that opens the single
  // <SettingsPanel> App.tsx owns; optional, and the button hides when unwired.
  //
  // Added AFTER the strip migration, on operator review: WP1's verdict specified ⌘, and a
  // Settings… menu item as the entry points, and nobody asked whether a chord plus a menu
  // item is enough DISCOVERY for the surface that had just become the only home for four
  // settings. The Analytics button sitting alone in this header made the asymmetry
  // obvious — two app-global overlays, one with a visible affordance and one without.
  //
  // This is NOT re-adding the settings strip. The strip was four CONTROLS costing ~148px
  // of vertical space above the project list; this is one icon in a header row that
  // already exists (zero added vertical space), and it OPENS the panel rather than
  // hosting settings — so the "settings in four places" trap stays closed.
  //
  // NOTE: `onCheckForUpdates` moved to SettingsPanel along with the update-notifications
  // toggle it sat beside — the picker no longer hosts any settings CONTROLS.
  onOpenSettings?: () => void;
}

export function ProjectPicker({
  onOpen,
  onOpenDashboard,
  onOpenSettings,
}: ProjectPickerProps) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [filter, setFilter] = useState("");
  // The picker toast: an info note (prune-on-mount) or a surfaced IPC error. `null` =
  // no toast (the common case). Both kinds are dismissible.
  const [toast, setToast] = useState<PickerToast | null>(null);
  // NOTE (M10.9 WP2 Phase 4): the three app-global settings states that used to live here
  // (ccPermissionMode / timeTrackingEnabled / updateNotificationsEnabled), together with
  // their seed+listen effects and optimistic-set handlers, MOVED to the Settings panel —
  // they were not duplicated. The shared discipline they hand-copied three times now
  // lives once in components/settings/useSettingControl.ts.

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
      // `add_project` returns the persisted record; reflect it in local `recents`
      // immediately so a newly-added folder appears at the top without a remount
      // (symmetry with `handleRemove`, which prunes locally — fixes the
      // add-no-refresh asymmetry that surfaced once the picker stays mounted in the
      // multi-workspace shell). Prepend-and-dedup: a re-added existing path moves to
      // the front (matching the backend's most-recently-opened-first ordering).
      const added = await invoke<RecentProject>("add_project", {
        path: picked,
      });
      setRecents((rs) => [
        added,
        ...rs.filter((r) => r.project_path !== added.project_path),
      ]);
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
      <div className="picker-header">
        <h1>Claudesk</h1>
        {onOpenDashboard && (
          <button
            type="button"
            className="picker-open-dashboard"
            data-testid="picker-open-dashboard"
            aria-label="Open time analytics"
            title="Time analytics (⌘⇧A)"
            onClick={onOpenDashboard}
          >
            {/* Bar-chart glyph — mirrors the Filmstrip analytics button. */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1"
                y="9"
                width="3"
                height="6"
                rx="0.5"
                fill="currentColor"
              />
              <rect
                x="6.5"
                y="5"
                width="3"
                height="10"
                rx="0.5"
                fill="currentColor"
              />
              <rect
                x="12"
                y="2"
                width="3"
                height="13"
                rx="0.5"
                fill="currentColor"
              />
            </svg>
            <span>Analytics</span>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className="picker-open-settings"
            data-testid="picker-open-settings"
            aria-label="Open settings"
            title="Settings (⌘,)"
            onClick={onOpenSettings}
          >
            {/* Gear glyph — the conventional settings mark, sized to match the
                Analytics bar-chart beside it. */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm0 4.1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
                fill="currentColor"
              />
              <path
                d="M13.3 8c0-.3 0-.6-.1-.9l1.3-1-1.3-2.2-1.5.6a5.2 5.2 0 0 0-1.5-.9L10 2H7.5l-.2 1.6c-.6.2-1 .5-1.5.9l-1.5-.6-1.3 2.2 1.3 1a5 5 0 0 0 0 1.8l-1.3 1 1.3 2.2 1.5-.6c.4.4.9.7 1.5.9l.2 1.6H10l.2-1.6c.6-.2 1-.5 1.5-.9l1.5.6 1.3-2.2-1.3-1c0-.3.1-.6.1-.9Zm-1.2 1.4.2.1 1 .8-.5.9-1.2-.5-.3.3c-.4.4-.9.7-1.4.8l-.4.1-.2 1.3h-1l-.2-1.3-.4-.1a4 4 0 0 1-1.4-.8l-.3-.3-1.2.5-.5-.9 1-.8.2-.1a4 4 0 0 1 0-1.6l-.1-.2-1-.8.5-.9 1.2.5.3-.3c.4-.4.9-.7 1.4-.8l.4-.1.2-1.3h1l.2 1.3.4.1c.5.1 1 .4 1.4.8l.3.3 1.2-.5.5.9-1 .8-.2.2a4 4 0 0 1 0 1.6Z"
                fill="currentColor"
              />
            </svg>
            <span>Settings</span>
          </button>
        )}
      </div>
      {/* M10.9 WP2 Phase 4 — the app-global settings CONTROLS that used to live here
          (permission mode / time tracking / update notifications) MOVED to the ⌘,
          Settings panel. That was the point of the migration: the picker is the surface
          hit on every project open, and the strip spent ~148px above the project list
          doing a job that belongs to a preferences dialog. The project list now starts
          directly below the filter.
          The header gear ABOVE is not a walk-back of that — it opens the panel and costs
          no vertical space (it shares the existing header row with Analytics). Do NOT
          re-add settings CONTROLS here — see components/settings/SettingsPanel.tsx. */}
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
      {/* One shared datalist for every row's model hints (not one per row). */}
      <ProjectModelHints />
      <ul className="picker-recents" data-testid="picker-recents">
        {visible.map((r) => (
          <li key={r.project_path} className="picker-recent-row">
            {/* The row's cells are emitted by mapping PICKER_ROW_CELLS, so their ORDER
                and — critically — their FLATNESS live in one asserted value rather than in
                JSX indentation. The model cell (M11.5 WP1) must be a SIBLING of the
                open-project button: nested inside it, every click meant for the model
                would open the project instead. A source-text guard for that rule was
                written first and provably failed to catch a deliberately nested cell, so
                the structure is data now. See pickerRowOrder.ts. */}
            {PICKER_ROW_CELLS.map((cell) => {
              switch (cell) {
                case "open":
                  return (
                    <button
                      key={cell}
                      type="button"
                      className="picker-recent"
                      data-testid="picker-recent"
                      onClick={() => void handleOpenRecent(r.project_path)}
                    >
                      <span className="picker-recent-name">{labelFor(r)}</span>
                      <span className="picker-recent-path">
                        {r.project_path}
                      </span>
                    </button>
                  );
                case "model":
                  return (
                    <ProjectModelCell
                      key={cell}
                      projectPath={r.project_path}
                      projectLabel={labelFor(r)}
                    />
                  );
                case "remove":
                  return (
                    <button
                      key={cell}
                      type="button"
                      className="picker-recent-remove"
                      data-testid="picker-recent-remove"
                      aria-label={`Remove ${labelFor(r)} from recents`}
                      title="Remove from recents"
                      onClick={() => void handleRemove(r.project_path)}
                    >
                      ×
                    </button>
                  );
              }
            })}
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
