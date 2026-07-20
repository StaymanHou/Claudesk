// WP12 — pure model for the small modal confirm dialog.
//
// Two WP12 surfaces need a modal yes/no/cancel: the dirty-tab close guard (save /
// discard / cancel) and the disk-change conflict prompt (keep mine / load disk — no
// cancel). Rather than reuse the command-palette overlay (a filter
// list, a different shape) we build one tiny dark-styled <ConfirmDialog> over this
// model. This module holds the React-free, DOM-free part — the button definitions
// and which choice each press yields — so it is vitest-testable (repo posture: pure
// logic → vitest, live DOM → Playwright; same split as paletteCommands.ts).
//
// A dialog is a title + message + an ordered list of buttons; pressing a button (or
// Esc, which selects the designated cancel button) resolves to that button's `value`.
// The component renders `buttons` left→right and reports the chosen `value`.

import type { WireWorkspaceState } from "../../../state/workspaceStatus";

/** One dialog button. `value` is what the caller receives when it is pressed. */
export interface ConfirmButton<V extends string = string> {
  /** Stable id (React key + test handle). */
  id: string;
  /** Button label shown to the user. */
  label: string;
  /** The choice this button yields. */
  value: V;
  /** Visual emphasis — at most one button should be the primary (default) action. */
  variant?: "primary" | "default" | "danger";
}

/** A complete dialog spec the <ConfirmDialog> component renders. */
export interface ConfirmSpec<V extends string = string> {
  title: string;
  message: string;
  buttons: ConfirmButton<V>[];
  /**
   * Which button's `value` Esc / backdrop-click resolves to. For the close guard this
   * is "cancel"; for a conflict prompt with no safe cancel it is null (Esc is inert —
   * the user must pick a copy, so we never silently dismiss a conflict).
   */
  escValue: V | null;
}

/** The three outcomes of the dirty-tab close guard. */
export type CloseChoice = "save" | "discard" | "cancel";

/**
 * The close-dirty-tab dialog: Save (primary) / Discard (danger) / Cancel. Esc →
 * cancel (the safe default — keeps the tab). `name` is the tab label, woven into the
 * message so the operator knows which file they're about to lose.
 */
export function closeDirtySpec(name: string): ConfirmSpec<CloseChoice> {
  return {
    title: "Unsaved changes",
    message: `${name} has unsaved changes. Save before closing?`,
    buttons: [
      { id: "save", label: "Save", value: "save", variant: "primary" },
      { id: "discard", label: "Discard", value: "discard", variant: "danger" },
      { id: "cancel", label: "Cancel", value: "cancel", variant: "default" },
    ],
    escValue: "cancel",
  };
}

/** The two outcomes of the workspace-close guard (QoL-WP1 dirty + M10.5-WP2 active). */
export type CloseWorkspaceChoice = "close" | "cancel";

/**
 * Is a workspace's CC "active" for the close/quit guard? (M10.5-WP2, design prior
 * `explicit-selectable-mode-over-inferred-mode`.) True iff CC is mid-work — a running
 * turn (`running`) or a prompt the operator hasn't answered (`awaiting_input`). `idle`
 * and `unknown` are NOT active (nothing in flight to protect). Scoped to the reliable M3
 * `stateFor` signal; a raw right-panel terminal's "running command" is deliberately NOT
 * a signal here (no cheap foreground-process detection on a raw PTY — see WP2 Phase 3).
 * The single source of truth for "active" — reused by the App-level per-workspace close
 * gate AND the app-quit aggregate.
 */
export function isActiveState(state: WireWorkspaceState): boolean {
  return state === "running" || state === "awaiting_input";
}

/** Why a workspace close needs confirming — either/both may fire (M10.5-WP2). */
export interface CloseWorkspaceReasons {
  /** Count of unsaved editor docs (QoL-WP1). 0 → not dirty. */
  dirtyCount: number;
  /** CC is mid-work (`running`/`awaiting_input`) — M10.5-WP2. */
  active: boolean;
}

/**
 * The close-workspace confirm (QoL-WP1 dirty + M10.5-WP2 active): Close Anyway (danger)
 * / Cancel (primary, the safe default). Esc → cancel (keeps the workspace). Unlike the
 * single-tab `closeDirtySpec` there is no "Save" — a workspace can hold many dirty docs
 * and a live CC turn, so v1 offers discard-or-cancel (save-all-then-close is out of
 * scope).
 *
 * One factory, one dialog for either/both reasons (M10.5-WP2 spec decision b — never two
 * stacked dialogs): the message composes whichever reason(s) fired so the operator sees
 * the exact blast radius before closing —
 *   - dirty-only  → "<name> has unsaved changes in N file(s). Close anyway and discard them?"
 *   - active-only → "<name> is still working (Claude Code is running). Close anyway and stop it?"
 *   - both        → "<name> is still working AND has unsaved changes in N file(s). Close anyway and discard them?"
 *
 * `name` is the workspace display name; `reasons` is the fired-reason set. The caller
 * only opens this dialog when `dirtyCount > 0 || active` (App.requestClose) — but the
 * factory is total (a no-reason call yields a plain "Close <name>?" so it never throws).
 */
export function closeWorkspaceSpec(
  name: string,
  reasons: CloseWorkspaceReasons,
): ConfirmSpec<CloseWorkspaceChoice> {
  const { dirtyCount, active } = reasons;
  const files = dirtyCount === 1 ? "1 file" : `${dirtyCount} files`;
  let title: string;
  let message: string;
  if (active && dirtyCount > 0) {
    title = "Close active workspace";
    message = `${name} is still working AND has unsaved changes in ${files}. Close anyway and discard them?`;
  } else if (active) {
    title = "Close active workspace";
    message = `${name} is still working (Claude Code is running). Close anyway and stop it?`;
  } else if (dirtyCount > 0) {
    title = "Close workspace with unsaved changes";
    message = `${name} has unsaved changes in ${files}. Close anyway and discard them?`;
  } else {
    title = "Close workspace";
    message = `Close ${name}?`;
  }
  return {
    title,
    message,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel", variant: "primary" },
      {
        id: "close",
        label: "Close Anyway",
        value: "close",
        variant: "danger",
      },
    ],
    escValue: "cancel",
  };
}

/** The two outcomes of the app-quit-while-active confirm (M10.5-WP2). */
export type QuitWhileActiveChoice = "quit" | "cancel";

/**
 * The app-quit-while-active confirm (M10.5-WP2): Quit Anyway (danger) / Cancel (primary,
 * the safe default). Esc → cancel (keeps the app running — the native `prevent_close`
 * already held the close, so cancelling just dismisses). Fired when the operator triggers
 * a quit (⌘Q / red button) while one or more workspaces are `running`/`awaiting_input`.
 *
 * The message ENUMERATES the busy workspaces by name (M10.5-WP2 spec decision — the
 * operator asked "which ones?"), so they see exactly what in-flight work quitting would
 * destroy:
 *   - 1 → "scratch-a is still working. Quit Claudesk anyway and stop it?"
 *   - N → "scratch-a, scratch-b are still working. Quit Claudesk anyway and stop them?"
 *
 * `names` is the busy-workspace display-name list (non-empty — the caller only opens this
 * dialog when the busy set is non-empty; an empty-set quit skips the confirm entirely and
 * quits immediately). The factory is still total (empty → a generic "Quit Claudesk?").
 */
export function quitWhileActiveSpec(
  names: string[],
): ConfirmSpec<QuitWhileActiveChoice> {
  const list = names.join(", ");
  const single = names.length === 1; // one predicate drives every plural/singular pick below
  const them = single ? "it" : "them";
  const verb = single ? "is" : "are";
  const message =
    names.length > 0
      ? `${list} ${verb} still working. Quit Claudesk anyway and stop ${them}?`
      : "Quit Claudesk?";
  return {
    title: "Quit with active workspaces",
    message,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel", variant: "primary" },
      { id: "quit", label: "Quit Anyway", value: "quit", variant: "danger" },
    ],
    escValue: "cancel",
  };
}

/** The two outcomes of the delete-file confirm (QoL-WP5). */
export type DeleteFileChoice = "delete" | "cancel";

/**
 * The delete-file confirm dialog (QoL-WP5): Delete (danger) / Cancel (primary, the safe
 * default). Esc → cancel (keeps the file). Deleting is irreversible (a hard `remove_file`,
 * not a Trash move in v1), so the danger button is non-default and the safe Cancel is
 * primary. `name` is the file's basename, woven into the message so the operator knows
 * exactly which file they're about to remove.
 */
export function deleteFileSpec(name: string): ConfirmSpec<DeleteFileChoice> {
  return {
    title: "Delete file",
    message: `Delete ${name}? This can't be undone.`,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel", variant: "primary" },
      { id: "delete", label: "Delete", value: "delete", variant: "danger" },
    ],
    escValue: "cancel",
  };
}

/**
 * The delete-FOLDER confirm dialog (QoL-WP5b): Delete (danger) / Cancel (primary, the
 * safe default). Esc → cancel. STRONGER than the single-file `deleteFileSpec` because the
 * blast radius is a whole subtree: the message names the folder, says "and everything
 * inside it", and shows the descendant `count` so the operator sees the blast radius
 * before confirming. Unlike the single-file delete (a hard `remove_file`), folder delete
 * moves to the macOS Trash (recoverable) — the copy says so. `name` is the folder's
 * basename; `count` is the number of files+folders inside it (0 → an empty folder).
 */
export function deleteFolderSpec(
  name: string,
  count: number,
): ConfirmSpec<DeleteFileChoice> {
  const inside =
    count === 0
      ? "It is empty."
      : `It contains ${count} item${count === 1 ? "" : "s"}.`;
  return {
    title: "Delete folder",
    message: `Delete ${name} and everything inside it? ${inside} It will be moved to the Trash (recoverable from Finder).`,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel", variant: "primary" },
      {
        id: "delete",
        label: "Delete Folder",
        value: "delete",
        variant: "danger",
      },
    ],
    escValue: "cancel",
  };
}

/** The two outcomes of the disk-change conflict prompt. */
export type ConflictChoice = "keep-mine" | "load-disk";

/**
 * The disk-change conflict dialog: Keep My Changes (primary) / Load From Disk
 * (danger — discards the in-memory edits). No cancel: the file changed under a dirty
 * buffer and the operator must choose a copy, so Esc is inert (escValue null). This
 * never silently overwrites either direction.
 */
export function conflictSpec(name: string): ConfirmSpec<ConflictChoice> {
  return {
    title: "File changed on disk",
    message: `${name} changed on disk while you had unsaved edits. Which copy do you want to keep?`,
    buttons: [
      {
        id: "keep-mine",
        label: "Keep My Changes",
        value: "keep-mine",
        variant: "primary",
      },
      {
        id: "load-disk",
        label: "Load From Disk",
        value: "load-disk",
        variant: "danger",
      },
    ],
    escValue: null,
  };
}
