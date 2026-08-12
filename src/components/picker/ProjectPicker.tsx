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

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { pruneToastMessage } from "./pruneToast";
import { mapIpcError } from "./ipcError";
import { ProjectModelCell, ProjectModelHints } from "./ProjectModelCell";
import {
  applyCommittedDriveMode,
  applyCommittedModel,
} from "./applyCommittedModel";
import type { DriveMode } from "../../cc/driveMode";
import { PICKER_ROW_CELLS } from "./pickerRowOrder";
import {
  actionForIntent,
  rowAffordances,
  type OpenIntent,
} from "./announceRow";
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
import type { AnnounceMap, AutoResumeAction } from "../../state/predictAction";

// A picker toast is either an INFO note (e.g. "removed N stale projects" on mount) or
// an ERROR (an IPC rejection that must surface, not be swallowed — the WP6 MAJOR). The
// kind drives styling; both are dismissible.
type PickerToast = { kind: "info" | "error"; message: string };

// Mirrors the Rust `Project` serialization (`path` serializes as `project_path`).
// Only the fields the picker reads are typed here; `last_opened_at` exists on the wire but
// is unused by this component.
//
// `default_model` IS read: it seeds each row's model cell. Typing it here is what
// removed an N+1 — the cell used to re-fetch this exact value per row via
// `project_get_default_model`, and every such read re-read + re-parsed + re-sorted the
// whole `projects.json` to keep one field. `list_projects` already returns it on the
// wire; the field was simply absent from this interface. Optional because the Rust side
// is `Option<String>` and may omit it entirely.
//
// `default_drive_mode` is read for the SAME reason as of M12 WP4c — it seeds the second line
// of that same cell. ⚠️ This comment previously said the field was "unused by this
// component", which is no longer true; and note there is deliberately no
// `project_get_default_drive_mode` command to fall back on (`driveModeIpc.ts` ships no
// getter, precisely so the N+1 above cannot be reintroduced for the new field). The Rust
// side is pinned to keep this on the wire by
// `tests::the_drive_mode_is_serialized_onto_the_list_projects_wire`.
export interface RecentProject {
  display_name?: string;
  project_path: string;
  default_model?: string | null;
  default_drive_mode?: DriveMode | null;
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
  /**
   * Open a project. `action` is the auto-resume action to fire on spawn (M12 WP3), or
   * `null` to open plainly.
   *
   * ⚠️ The action is RE-DERIVED at click time from the current announce map, never read
   * from the rendered label — WP1 Verdict (b)'s load-bearing rule. That is what makes a
   * stale announcement harmless (worst case: a label promised something and nothing fires,
   * never a WRONG action).
   *
   * `intent` (P4.6) is which door was used. It is carried SEPARATELY from `action` because it
   * cannot be recovered from it: `action === null` means both "the no-fire door" and "the row
   * door with no signal", and the backend must suppress the argv arm for the first but not the
   * second. Passing only `action` is what let the `⏵` door resume anyway.
   */
  onOpen: (
    projectPath: string,
    action: AutoResumeAction,
    intent: OpenIntent,
  ) => void;
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
  // M12 WP3 — the batched auto-resume announcement. ONE call per picker open (never a
  // per-row probe: M11.5 WP1's review found the model cell issuing an IPC read per row for
  // a value already on the wire, and this is the same surface). `{}` until it resolves.
  //
  // ⚠️ NOT `{}` forever when the gate is off — that claim predates the 2026-08-05 move to a
  // PER-ARM gate and was corrected at the 2026-08-12 paydown sweep. The ungated `--continue`
  // arm still yields entries with the gate off (it reads Claudesk's own store and serves every
  // Claude Code user); only the `/session-restore` arm is suppressed. Found by grepping the
  // CLAIM repo-wide rather than trusting the two sites the backlog entry named — the
  // scope-list-is-a-floor rule, earning its keep again.
  // (`SURFACE-2026-08-05-QUALITY-WP3-STALE-WHOLE-FEATURE-GATE-DOCS`.)
  const [announceMap, setAnnounceMap] = useState<AnnounceMap>({});
  // The M10.9 gate seam. Read the HOOK — never the underlying Tauri command ad hoc and
  // never the raw getter wrapper (a one-shot read never re-syncs on the broadcast). Both
  // bypass shapes are scanned by the OFF-invariant guard, whose scan is a plain substring
  // match over source: it cannot tell a real call from prose, so this comment deliberately
  // does NOT spell either forbidden identifier. Naming them here would flag this file as an
  // offender. See `useWorkflowFeaturesEnabled.ts` for the full contract.
  const workflowEnabled = useWorkflowFeaturesEnabled();
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
        // M12 WP3 — ONE announce call per picker open, alongside the existing two. Read
        // AFTER the list so a slow stat never delays the rows appearing; a row simply gains
        // its announcement a moment later. Gate-checked server-side, so this returns `{}`
        // without statting anything when the workflow layer is off.
        //
        // Its own try/catch: an announce failure must NOT take down the project list, which
        // is the picker's actual job. A missing announcement degrades to "no prediction"
        // (the safe direction — a missed auto-fire costs a click), so it is logged rather
        // than toasted.
        try {
          const announced = await invoke<AnnounceMap>(
            "picker_announce_actions",
          );
          if (!cancelled) setAnnounceMap(announced);
        } catch (e) {
          console.warn(
            "picker_announce_actions failed; no rows will announce",
            e,
          );
        }
      } catch (e) {
        if (!cancelled)
          setToast({ kind: "error", message: mapIpcError("load projects", e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Open a project via one of the two doors.
   *
   * ⚠️ **BOTH doors funnel through here** — the row click (`"fire"`) and the ⏵
   * (`"no-fire"`). That is deliberate: a second open path would be a second place for the
   * recency stamp, the error handling, and the re-derivation to drift, and only one of them
   * would get fixed when a bug appeared. `intent` is the ONLY difference between them.
   *
   * ⚠️ The action is **re-derived here, at click time**, from the current announce map —
   * never read back from the rendered label. WP1 Verdict (b): *the announcement is a
   * prediction, never the input to the action.* `.session.md` can vanish while the picker
   * is open, so the label can be stale; re-deriving makes that harmless (a label that
   * promised something and nothing fires) instead of wrong (firing a restore whose pointer
   * is gone).
   */
  async function handleOpenRecent(
    projectPath: string,
    intent: OpenIntent = "fire",
  ) {
    // Re-derive, do not read the label. `rowAffordances` is the same function the row
    // rendered with, called fresh — so a signal that changed since render is reflected.
    const { action } = rowAffordances(
      projectPath,
      announceMap,
      workflowEnabled,
    );
    // Stamp recency before handing off so the next list_projects reflects it. A
    // rejection surfaces as an error toast (P4.2) — never dropped as an unhandled
    // promise rejection. We do NOT proceed to onOpen if recording failed, since the
    // store is in an unknown state. BOTH doors record the open; only the firing differs.
    try {
      await invoke("record_open", { path: projectPath });
      // ⚠️ P4.6 — `intent` is passed ALONGSIDE the action, not folded into it.
      // `actionForIntent` correctly nulls the action on the no-fire door, but `null` is
      // ambiguous downstream (it also means "row door, no signal"), and the backend needs the
      // unambiguous door to gate the argv arm. Folding them was the shipped defect.
      onOpen(projectPath, actionForIntent(action, intent), intent);
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
      // M12 WP3 — "Open Folder…" NEVER auto-fires. Explicit `null` rather than relying on
      // the newly-added path being absent from `announceMap`: it happens to be absent
      // (the map was fetched at mount, before this folder existed), but that is a
      // coincidence of fetch timing, not a decision — and a future focus-refresh of the map
      // would silently turn this into an auto-fire.
      //
      // The decision itself: a folder you just picked from a dialog is a deliberate,
      // explicit act on a project that may be brand new to Claudesk. Firing a resumption
      // command into it would act on state the user has not seen. It goes through the
      // recents row on the NEXT open, where the announcement is visible first.
      //
      // ⚠️ P4.6 — `"no-fire"` is passed EXPLICITLY, and it is load-bearing here in a way the
      // `null` action above is not. This path could reach a project whose unclean flag is set
      // (re-picking a folder already in recents), and the ARGV arm is resolved from that flag in
      // the backend — so `null` alone would have let "Open Folder…" resume, exactly as it let the
      // `⏵` door resume. The comment above reasons carefully about not relying on coincidence;
      // before P4.6 the argv arm was a second coincidence it did not know about.
      onOpen(picked, null, "no-fire");
    } catch (e) {
      setToast({ kind: "error", message: mapIpcError("open folder", e) });
    }
  }

  // Fold a persisted model override back into `recents`, so each row's cell re-seeds from
  // a truthful value after an unmount (a filter round-trip unmounts filtered-out rows).
  // `applyCommittedModel` is PURE — computing the next state is the only thing a state
  // updater may do. StrictMode double-invokes updaters, so a side effect in here would
  // fire twice (the M10.9 WP2 double-write defect); there is deliberately none.
  const handleModelCommitted = useCallback(
    (projectPath: string, model: string | null) => {
      setRecents((rs) => applyCommittedModel(rs, projectPath, model));
    },
    [],
  );

  // Same contract, same purity requirement, for the drive mode (M12 WP4c).
  const handleDriveModeCommitted = useCallback(
    (projectPath: string, mode: DriveMode | null) => {
      setRecents((rs) => applyCommittedDriveMode(rs, projectPath, mode));
    },
    [],
  );

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
                case "open": {
                  // M12 WP3 (operator spec, 2026-08-04): the title box AUTO-FIRES by
                  // default, and the no-fire escape hatch lives INSIDE it.
                  //
                  // ⚠️ Both M12 elements are nested in this <button>, which is NOT a
                  // violation of pickerRowOrder.ts's rule — that rule forbids a nested
                  // <button> (a button-in-button cannot disambiguate the click). The
                  // announcement is an inert <span>; the no-fire control is a
                  // <span role="button"> with stopPropagation, the same discipline
                  // TileActionButton.tsx uses for this exact problem in the filmstrip.
                  const { announcement, showNoFireDoor } = rowAffordances(
                    r.project_path,
                    announceMap,
                    workflowEnabled,
                  );
                  return (
                    <button
                      key={cell}
                      type="button"
                      className="picker-recent"
                      data-testid="picker-recent"
                      onClick={() => void handleOpenRecent(r.project_path)}
                    >
                      <span className="picker-recent-text">
                        {/* The announcement sits on the NAME's line (operator decision,
                            2026-08-04), settled by measuring rather than by taste: on the
                            path's line the badge took 140px and halved the path
                            (369→184px), while names have real slack (~80-180px).
                            ⚠️ The original comment here also claimed the path then "keeps
                            its FULL width — identical on every row." That was MEASURED
                            FALSE at verify-human (2026-08-05) and is why the gutter below
                            is now reserved unconditionally: see `.picker-recent-gutter`. */}
                        <span className="picker-recent-headline">
                          <span className="picker-recent-name">
                            {labelFor(r)}
                          </span>
                          {announcement !== null && (
                            <span
                              className="picker-recent-announce"
                              data-testid="picker-recent-announce"
                              title={`Opening this project will run ${announcement}`}
                            >
                              ↻ {announcement}
                            </span>
                          )}
                        </span>
                        <span className="picker-recent-path">
                          {r.project_path}
                        </span>
                      </span>
                      {/* ⚠️ THE GUTTER IS ALWAYS RENDERED — this is the P3.9 fix
                          (operator decision, 2026-08-05), and it is load-bearing.
                          Previously `{showNoFireDoor && <span .../>}` put the control
                          directly here as a sibling of `.picker-recent-text`, which has
                          `flex: 1 1 auto` — so on a row with NO prediction the text stack
                          ABSORBED the control's width. Measured: 369px without a badge vs
                          331px with one, meaning a 37-char name truncated mid-word while a
                          LONGER 35-char name on the adjacent row showed in full. Rows
                          disagreed about how much name you get, for a reason invisible to
                          the reader.
                          Reserving the box unconditionally makes every row share one
                          geometry, so names truncate at the same length everywhere. The
                          cost is deliberate and accepted: non-announcing rows also give up
                          the 38px.
                          Note the conditional moved INWARD rather than being deleted —
                          `showNoFireDoor` still governs whether the *control* exists (the
                          contract `announceRow.ts` pins: no prediction ⇒ no control, since
                          both doors would be identical). An empty gutter is spacing, not a
                          control: no role, no tabIndex, no handler, aria-hidden. */}
                      <span
                        className="picker-recent-gutter"
                        aria-hidden={!showNoFireDoor}
                      >
                        {showNoFireDoor && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="picker-recent-nofire"
                            data-testid="picker-recent-nofire"
                            aria-label={`Open ${labelFor(r)} without running ${announcement}`}
                            title={`Open without running ${announcement}`}
                            // stopPropagation on BOTH pointerdown and click: the outer
                            // <button> would otherwise fire its open-and-run handler, which
                            // is the silent "the control does the wrong thing" failure.
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenRecent(r.project_path, "no-fire");
                            }}
                            // Keyboard mirror — a span has no implicit Enter/Space activation,
                            // so without this the control is mouse-only.
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleOpenRecent(
                                  r.project_path,
                                  "no-fire",
                                );
                              }
                            }}
                          >
                            {/* ⚠️ `⊘` (U+2298), NOT a play triangle. The glyph was `⏵` until the
                                operator rejected it 2026-08-05, and the objection is a real
                                semantic inversion rather than taste: a play icon promises "run
                                this", and this control's entire purpose is to open WITHOUT
                                running the announced command. It advertised the thing it
                                withholds.

                                `⊘` reads as suppression — and the row's announcement one span
                                over is `↻ <command>`, so the pair reads "would re-run X" /
                                "don't". Deliberately not `⤓`/`↴` (motion metaphors that can be
                                misread as "just go, faster") and not `↷` (too close to `↻` to
                                distinguish at 0.72rem). The ACCESSIBLE name is carried by
                                `aria-label`/`title` below, so the glyph never has to be
                                self-explanatory to a screen reader. */}
                            ⊘
                          </span>
                        )}
                      </span>
                    </button>
                  );
                }
                case "model":
                  return (
                    <ProjectModelCell
                      key={cell}
                      projectPath={r.project_path}
                      projectLabel={labelFor(r)}
                      seedModel={r.default_model ?? null}
                      seedDriveMode={r.default_drive_mode ?? null}
                      onCommitted={handleModelCommitted}
                      onDriveModeCommitted={handleDriveModeCommitted}
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
