// WP12 — pure open-files model for the editor's multi-file tab strip.
//
// No React, no CodeMirror — just the ordered tab list + active-tab transitions, so
// it is unit-testable under vitest (the repo posture: pure logic → vitest, live DOM
// → Playwright; mirrors editorPanes.ts / editorLoad.ts / treeState.ts).
//
// This is the SERIALIZABLE, testable part of the multi-file model: the ordered tab
// list, the active-tab pointer, and per-tab METADATA (kind, path, label, dirty). The
// mutable per-tab EDITOR state (the CM6 buffer, language override, PanesState, the
// captured EditorView map, the disk marker, the save lifecycle) is imperative and
// lives in a Map<tabId, …> inside EditorPanel — NOT here. That split mirrors WP3c,
// where editorPanes.ts holds pane ids and EditorPanel holds the shared document.
//
// A tab is either a real FILE (content read from disk via read_file, editable, saved
// back, disk-change-checked) or a SYNTHETIC read-only buffer (content supplied
// programmatically — the WP7 "Find Results" seam; built generic, WP7 is the first
// consumer). The `kind` discriminates the two everywhere downstream.
//
// INVARIANT: `activeTabId` is either null (no tabs → the editor's empty state) or
// names an existing tab. `close` enforces the neighbor-reassign + empties-to-null
// edge cases (mirrors editorPanes' last-pane guard, but here the LAST close is
// allowed — it returns the editor to "No file open").

/** What a tab holds its content from. */
export type TabKind = "file" | "synthetic";

/** One open tab. Metadata only — the live editor state lives in EditorPanel's Map. */
export interface OpenFile {
  /** Stable id (caller-supplied — EditorPanel generates it; no Date/random here). */
  id: string;
  kind: TabKind;
  /**
   * For a "file" tab: the project-relative (or absolute-inside-root) path, the same
   * string the existing open seams pass. For a "synthetic" tab: null (no disk path).
   */
  path: string | null;
  /** Tab label shown in the strip (filename for files; caller-chosen for synthetic). */
  label: string;
  /** Unsaved-edits indicator. Always false for synthetic (read-only) tabs. */
  dirty: boolean;
}

export interface OpenFilesState {
  tabs: OpenFile[];
  /** Id of the active (front) tab, or null when no tabs are open. */
  activeTabId: string | null;
}

export type OpenFilesEvent =
  // Open a FILE: if a file tab with this path is already open, activate it (no
  // duplicate); otherwise add a new tab after the active one and activate it.
  // The caller supplies the id (used only if a new tab is created).
  | { type: "open-or-activate"; id: string; path: string; label: string }
  // Add a SYNTHETIC read-only tab (the WP7 seam). Always adds + activates (synthetic
  // tabs aren't de-duped by path — there is no path). Caller supplies id + label.
  | { type: "add-synthetic"; id: string; label: string }
  // Close a tab. Reassigns the active tab to a neighbor if the closed one was active;
  // closing the last tab leaves activeTabId null (the editor's empty state).
  | { type: "close"; id: string }
  // Activate a tab by id (a tab click). No-op if id is unknown or already active.
  | { type: "activate"; id: string }
  // Activate the Nth tab (1-based). n past the end clamps to the LAST tab — so ⌘9 on
  // a 3-tab strip activates the 3rd (the browser/Sublime "last tab" convention). No-op
  // if there are no tabs.
  | { type: "activate-index"; n: number }
  // Set a file tab's dirty flag (EditorPanel mirrors its buffer-vs-saved compare here
  // so the strip can render the ● indicator). No-op on a synthetic or unknown tab.
  | { type: "set-dirty"; id: string; dirty: boolean };

/** The initial empty state — no tabs, no active tab (the "No file open" editor). */
export function initialOpenFilesState(): OpenFilesState {
  return { tabs: [], activeTabId: null };
}

/** Index of the active tab in the list, or -1 if none/absent. */
function activeIndex(state: OpenFilesState): number {
  return state.tabs.findIndex((t) => t.id === state.activeTabId);
}

export function openFilesReducer(
  state: OpenFilesState,
  event: OpenFilesEvent,
): OpenFilesState {
  switch (event.type) {
    case "open-or-activate": {
      // Already open (same path, file kind) → just activate that tab. No duplicate,
      // and no churn if it's already active.
      const existing = state.tabs.find(
        (t) => t.kind === "file" && t.path === event.path,
      );
      if (existing) {
        if (existing.id === state.activeTabId) return state;
        return { ...state, activeTabId: existing.id };
      }
      // New file tab inserted directly after the active one (Sublime's "open beside")
      // and activated. With no active tab it appends.
      const tab: OpenFile = {
        id: event.id,
        kind: "file",
        path: event.path,
        label: event.label,
        dirty: false,
      };
      return insertAfterActiveAndActivate(state, tab);
    }
    case "add-synthetic": {
      // An already-open synthetic tab with this id activates rather than duplicating
      // (lets a consumer call add-synthetic idempotently to focus its tab).
      const existing = state.tabs.find((t) => t.id === event.id);
      if (existing) {
        if (existing.id === state.activeTabId) return state;
        return { ...state, activeTabId: existing.id };
      }
      const tab: OpenFile = {
        id: event.id,
        kind: "synthetic",
        path: null,
        label: event.label,
        dirty: false,
      };
      return insertAfterActiveAndActivate(state, tab);
    }
    case "close": {
      const idx = state.tabs.findIndex((t) => t.id === event.id);
      if (idx < 0) return state; // unknown id — nothing to close
      const tabs = state.tabs.filter((t) => t.id !== event.id);
      if (tabs.length === 0) return { tabs, activeTabId: null }; // last tab → empty
      // Reassign focus only if the closed tab was active: prefer the tab that took
      // its slot (the next sibling), else the new last tab.
      let activeTabId = state.activeTabId;
      if (event.id === state.activeTabId) {
        const neighbor = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = neighbor.id;
      }
      return { tabs, activeTabId };
    }
    case "activate": {
      if (!state.tabs.some((t) => t.id === event.id)) return state;
      if (event.id === state.activeTabId) return state; // no churn
      return { ...state, activeTabId: event.id };
    }
    case "activate-index": {
      if (state.tabs.length === 0) return state;
      // 1-based; clamp into range (n past the end → last tab; n<1 → first tab).
      const i = Math.min(Math.max(event.n, 1), state.tabs.length) - 1;
      const id = state.tabs[i].id;
      if (id === state.activeTabId) return state;
      return { ...state, activeTabId: id };
    }
    case "set-dirty": {
      const tab = state.tabs.find((t) => t.id === event.id);
      // No-op on unknown, synthetic (always clean), or unchanged.
      if (!tab || tab.kind === "synthetic" || tab.dirty === event.dirty)
        return state;
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === event.id ? { ...t, dirty: event.dirty } : t,
        ),
      };
    }
    default:
      return state;
  }
}

/** Insert `tab` directly after the active tab (or append) and make it active. */
function insertAfterActiveAndActivate(
  state: OpenFilesState,
  tab: OpenFile,
): OpenFilesState {
  const at = activeIndex(state);
  const insertAt = at < 0 ? state.tabs.length : at + 1;
  const tabs = [
    ...state.tabs.slice(0, insertAt),
    tab,
    ...state.tabs.slice(insertAt),
  ];
  return { tabs, activeTabId: tab.id };
}
