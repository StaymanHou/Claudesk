// paydown-2026-11-27 WP8 — the workspace's notices: a short LIST of rows, each with its own kind.
//
// ⚠️ WHY A LIST. The workspace used to have ONE toast slot, shared by every writer (refused
// injections, the remote open notice, the hook-install warning, the auto-resume withheld notices,
// the app's failed-Detach notice, the Docs catch-up, a refused copy). The last writer won, so a
// withheld notice erased the open notice ~1.5 s after it appeared, and every writer but two
// stamped the red error kind whether or not anything had failed. Now each notice is its own row
// and says what it is: `error` (something failed: red, `role="alert"`) or `info` (it only reports
// what happened: neutral, `role="status"`).
//
// Every write goes through {@link toastsReducer}, the one funnel, so its rules hold for all writers:
//
// - **No duplicates.** A notice whose text is already showing is not added again. The hook warning
//   is sticky on the link and is re-read after every respawn (Recycle, drive-mode apply-now).
// - **A dismissed hook warning stays dismissed** for the workspace's life (latched by its text), so
//   the next respawn's re-read does not bring it back. A DIFFERENT warning still shows.
// - **The Docs catch-up owns only its own row**: a new docs notice replaces the previous docs row
//   (with a fresh id, so its auto-dismiss timer restarts), and a docs `null` clears only that row.
// - **Bounded.** At most {@link MAX_TOASTS} rows; past that, the oldest INFO row goes first, and an
//   error row goes only when every row is an error.

import type { DocsNotice } from "./docs/remoteDocsCatchUp";

export type ToastKind = "error" | "info";

/** Who raised a row, for the writers with their own rules (see the module header). */
export type ToastSource = "docs" | "hook";

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  source?: ToastSource;
  /** Clear this row after this long (the Docs catch-up's success). */
  autoDismissMs?: number;
}

export interface ToastState {
  toasts: Toast[];
  nextId: number;
  /** Hook-warning texts the operator dismissed. */
  dismissedHook: string[];
}

export const EMPTY_TOASTS: ToastState = {
  toasts: [],
  nextId: 1,
  dismissedHook: [],
};

/** The most rows shown at once. */
export const MAX_TOASTS = 4;

export type ToastAction =
  | {
      type: "push";
      text: string;
      kind: ToastKind;
      source?: Exclude<ToastSource, "docs">;
    }
  | { type: "dismiss"; id: number }
  | { type: "docs"; notice: DocsNotice };

function bounded(toasts: Toast[]): Toast[] {
  const out = [...toasts];
  while (out.length > MAX_TOASTS) {
    const info = out.findIndex((t) => t.kind === "info");
    out.splice(info >= 0 ? info : 0, 1);
  }
  return out;
}

export function toastsReducer(
  state: ToastState,
  action: ToastAction,
): ToastState {
  switch (action.type) {
    case "push": {
      if (
        action.source === "hook" &&
        state.dismissedHook.includes(action.text)
      ) {
        return state;
      }
      if (state.toasts.some((t) => t.text === action.text)) return state;
      const row: Toast = {
        id: state.nextId,
        text: action.text,
        kind: action.kind,
        ...(action.source ? { source: action.source } : {}),
      };
      return {
        ...state,
        toasts: bounded([...state.toasts, row]),
        nextId: state.nextId + 1,
      };
    }
    case "dismiss": {
      const row = state.toasts.find((t) => t.id === action.id);
      if (row === undefined) return state;
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.id),
        dismissedHook:
          row.source === "hook"
            ? [...state.dismissedHook, row.text]
            : state.dismissedHook,
      };
    }
    case "docs": {
      const at = state.toasts.findIndex((t) => t.source === "docs");
      if (action.notice === null) {
        if (at < 0) return state;
        return {
          ...state,
          toasts: state.toasts.filter((t) => t.source !== "docs"),
        };
      }
      const row: Toast = {
        id: state.nextId,
        text: action.notice.text,
        kind: action.notice.kind,
        source: "docs",
        ...(action.notice.autoDismissMs !== undefined
          ? { autoDismissMs: action.notice.autoDismissMs }
          : {}),
      };
      const toasts =
        at < 0
          ? bounded([...state.toasts, row])
          : state.toasts.map((t, i) => (i === at ? row : t));
      return { ...state, toasts, nextId: state.nextId + 1 };
    }
  }
}
