// WP2 P2.2 — pure save-state machine for the EditorPanel's Cmd+S write lifecycle.
//
// No React, no IPC — only the reducer, unit-testable under vitest (mirrors
// editorLoad.ts / cc/bridge.ts). EditorPanel drives this via useReducer; the
// write_file dispatches are a stable function (keeps writes out of a raw
// setState-in-callback and gives the save status its own testable transitions).
//
// "dirty" (buffer differs from last save) is derived in the component by
// comparing the live doc to the last-saved snapshot — NOT modeled here. This
// machine only tracks the in-flight/just-finished status of a write.

export type SaveState =
  | { kind: "idle" } // never saved this file, or freshly opened
  | { kind: "saving"; path: string }
  | { kind: "saved"; path: string }
  | { kind: "error"; path: string; message: string };

export type SaveEvent =
  | { type: "save-start"; path: string }
  | { type: "save-ok"; path: string }
  | { type: "save-fail"; path: string; message: string }
  | { type: "reset" }; // openPath changed → clear stale save status

export const initialSaveState: SaveState = { kind: "idle" };

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case "save-start":
      return { kind: "saving", path: event.path };
    case "save-ok":
      return { kind: "saved", path: event.path };
    case "save-fail":
      return { kind: "error", path: event.path, message: event.message };
    case "reset":
      return initialSaveState;
    default:
      return state;
  }
}
