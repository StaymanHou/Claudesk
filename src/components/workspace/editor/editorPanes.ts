// WP3c — pure pane/focus model for the editor's split panes.
//
// No React, no CodeMirror `EditorView` — just the pane list + active-pane
// transitions, so it is unit-testable under vitest (the repo posture: pure logic
// → vitest, live DOM → Playwright; mirrors editorLoad.ts / editorSave.ts /
// paletteCommands.ts).
//
// SHARED-DOCUMENT model (P1.1 decision, 2026-06-20): every pane is a viewport
// onto the SAME panel-level document. So a pane carries only an `id` — the buffer
// (`doc`/`savedDoc`), language override, font size, and load/save lifecycle all
// live at panel level in EditorPanel, NOT per pane. That is why this reducer never
// mentions a file path or content: splitting adds a viewport, not a file.
//
// INVARIANT: while a file is open there is ALWAYS ≥1 pane and exactly one
// `activePaneId` that names an existing pane. `closePane` enforces the last-pane
// guard (it never removes the final pane) and reassigns focus to a surviving pane.

/** A single editor viewport. Shared-document → id is all the state a pane holds. */
export interface EditorPane {
  id: string;
}

export interface PanesState {
  panes: EditorPane[];
  /** Id of the focused pane — chords (save / palette / panel-switch) act on it. */
  activePaneId: string;
}

export type PanesEvent =
  // Add a pane below the active one and focus the new pane (Sublime's split gesture).
  | { type: "split"; id: string }
  // Close a pane; no-op if it's the last pane (the guard). Reassigns focus if the
  // closed pane was active.
  | { type: "close"; id: string }
  // Mark a pane focused (a click / focus landed inside it). No-op if id is unknown.
  | { type: "focus"; id: string }
  // Collapse back to a single pane keeping `keepId` (used on file change — see P2.2).
  | { type: "collapse"; keepId: string };

/**
 * The initial single-pane state. The id is supplied by the caller (EditorPanel
 * generates stable ids) so this stays pure — no id generation, no Date/random.
 */
export function initialPanesState(firstPaneId: string): PanesState {
  return { panes: [{ id: firstPaneId }], activePaneId: firstPaneId };
}

/** Index of the active pane in the list, or -1 if it somehow isn't present. */
function activeIndex(state: PanesState): number {
  return state.panes.findIndex((p) => p.id === state.activePaneId);
}

export function panesReducer(state: PanesState, event: PanesEvent): PanesState {
  switch (event.type) {
    case "split": {
      // Insert the new pane directly after the active one; focus it. A duplicate
      // id (caller bug) is ignored to keep ids unique.
      if (state.panes.some((p) => p.id === event.id)) return state;
      const at = activeIndex(state);
      const insertAt = at < 0 ? state.panes.length : at + 1;
      const panes = [
        ...state.panes.slice(0, insertAt),
        { id: event.id },
        ...state.panes.slice(insertAt),
      ];
      return { panes, activePaneId: event.id };
    }
    case "close": {
      // Last-pane guard: never drop below one pane while a file is open.
      if (state.panes.length <= 1) return state;
      const idx = state.panes.findIndex((p) => p.id === event.id);
      if (idx < 0) return state; // unknown id — nothing to close
      const panes = state.panes.filter((p) => p.id !== event.id);
      // Reassign focus only if the closed pane was the active one: prefer the
      // pane that took its slot (sibling), else the new last pane.
      let activePaneId = state.activePaneId;
      if (event.id === state.activePaneId) {
        const sibling = panes[Math.min(idx, panes.length - 1)];
        activePaneId = sibling.id;
      }
      return { panes, activePaneId };
    }
    case "focus": {
      if (!state.panes.some((p) => p.id === event.id)) return state;
      if (event.id === state.activePaneId) return state; // no churn
      return { ...state, activePaneId: event.id };
    }
    case "collapse": {
      // Keep exactly one pane. If keepId isn't present (shouldn't happen), keep
      // the current active pane instead so we never produce an empty list.
      const keep = state.panes.some((p) => p.id === event.keepId)
        ? event.keepId
        : state.activePaneId;
      return { panes: [{ id: keep }], activePaneId: keep };
    }
    default:
      return state;
  }
}
