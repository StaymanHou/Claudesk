// M10 WP6 P1.1/P1.4 — the App-level updater STATUS row: the single in-flow surface for
// (a) an apply FAILURE (`phase==="error"` + `errorMessage` — previously produced by
// useUpdater but consumed nowhere, so a failed update silently reverted the banner:
// SURFACE-2026-07-17-QUALITY-WP4-ERROR-STATE-UNCONSUMED), and (b) a transient manual-check
// NOTE (up-to-date / brew-defer / check-failed) that the native-menu path had no surface
// for (App.tsx has no toast like the picker: SURFACE-…-MENU-CHECK-DISCARDS-OUTCOME).
//
// Same in-flow, misclick-safe posture as the WP4 notify banner (an app-shell leading row,
// NOT an absolute overlay — the WP4 F12 fix) so it never covers filmstrip click-targets.
// Shares the `.update-banner` CSS family; the error kind adds `.update-banner-error`.
//
// DUMB view — all state lives in useUpdater. Renders at most ONE line: the error takes
// precedence over a note (an active failure is the more important thing to show). Returns
// null when there's nothing to surface (zero reserved height).

import type { UpdaterStatusNote } from "./updateFlowState";

interface UpdaterStatusRowProps {
  /** True when the update flow is in the error phase (apply failed, no relaunch). */
  isError: boolean;
  /** The error message to show when isError (apply failure detail). */
  errorMessage: string | null;
  /** A transient info/error note (manual-check outcome), or null. Shown only when NOT in
   *  the error phase (error takes precedence). */
  note: UpdaterStatusNote | null;
  /** Dismiss the error surface → idle. */
  onDismissError: () => void;
  /** Dismiss the transient note. */
  onDismissNote: () => void;
}

export function UpdaterStatusRow({
  isError,
  errorMessage,
  note,
  onDismissError,
  onDismissNote,
}: UpdaterStatusRowProps) {
  // Error takes precedence — an active failure is the more important surface.
  if (isError) {
    return (
      <div
        className="update-banner update-banner-error"
        data-testid="update-error"
        role="alert"
      >
        <span className="update-banner-icon" aria-hidden="true">
          ⚠︎
        </span>
        <span className="update-banner-text" data-testid="update-error-message">
          {errorMessage ?? "The update failed."}
        </span>
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn"
            data-testid="update-error-dismiss"
            onClick={onDismissError}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (note) {
    const isNoteError = note.kind === "error";
    return (
      <div
        className={`update-banner${isNoteError ? " update-banner-error" : ""}`}
        data-testid="update-status-note"
        data-note-kind={note.kind}
        role={isNoteError ? "alert" : "status"}
      >
        <span className="update-banner-icon" aria-hidden="true">
          {isNoteError ? "⚠︎" : "ℹ︎"}
        </span>
        <span className="update-banner-text" data-testid="update-status-note-message">
          {note.message}
        </span>
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn"
            data-testid="update-status-note-dismiss"
            onClick={onDismissNote}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
