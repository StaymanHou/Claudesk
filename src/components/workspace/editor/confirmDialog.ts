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

/** The two outcomes of the workspace-close dirty guard (QoL-WP1). */
export type CloseWorkspaceChoice = "close" | "cancel";

/**
 * The close-workspace-with-unsaved-edits dialog (QoL-WP1): Close Anyway (danger) /
 * Cancel (primary, the safe default). Esc → cancel (keeps the workspace). Unlike the
 * single-tab `closeDirtySpec` there is no "Save" — a workspace can hold many dirty docs
 * across panes/files, so v1 offers discard-or-cancel (save-all-then-close is out of
 * scope). `name` is the workspace display name; `count` is the unsaved-doc count, woven
 * into the message so the operator knows the blast radius before discarding.
 */
export function closeWorkspaceSpec(
  name: string,
  count: number,
): ConfirmSpec<CloseWorkspaceChoice> {
  const files = count === 1 ? "1 file" : `${count} files`;
  return {
    title: "Close workspace with unsaved changes",
    message: `${name} has unsaved changes in ${files}. Close anyway and discard them?`,
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
