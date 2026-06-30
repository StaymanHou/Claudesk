// WP2 — pure load-state machine for the EditorPanel's file open lifecycle.
//
// No React, no IPC — only the reducer, so it's unit-testable under vitest (the
// repo's frontend posture; mirrors src/cc/bridge.ts). EditorPanel drives this via
// useReducer, which keeps the file-read setState out of a raw useState-in-effect
// (the react-hooks/set-state-in-effect lint) and matches XtermPane's reducer
// pattern. The "no file open" case is derived from the openPath prop at render
// time and deliberately NOT modeled here — this machine only tracks loading a
// specific path.

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string }
  | { kind: "error"; path: string; message: string };

export type LoadEvent =
  | { type: "load-start"; path: string }
  | { type: "load-ok"; path: string }
  | { type: "load-fail"; path: string; message: string };

export const initialLoadState: LoadState = { kind: "idle" };

export function loadReducer(state: LoadState, event: LoadEvent): LoadState {
  switch (event.type) {
    case "load-start":
      return { kind: "loading", path: event.path };
    case "load-ok":
      return { kind: "loaded", path: event.path };
    case "load-fail":
      return { kind: "error", path: event.path, message: event.message };
    default:
      return state;
  }
}
