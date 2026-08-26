// M13.5 WP4 P4.1 — the confirm raised when the operator changes a workspace's drive mode.
//
// ## Why a confirm exists at all
// Changing the mode IS the intent to apply it, and applying restarts Claude Code for this
// workspace. That consequence is real, so it is SURFACED and acknowledged rather than either
// (a) hidden behind a bare `<select>`, or (b) split off into a separate affordance the operator
// has to notice and click later. Option (b) was built and REJECTED by the operator at Phase 3
// verify-human; see the WIP's AC-5 for the full account.
//
// ## Shape borrowed from `WorkflowInviteModal`, deliberately
// `role="dialog"` + `aria-modal` + copy in named constants + a `data-testid` per button. Reusing
// that idiom rather than inventing a second modal shape keeps the app's two dialogs consistent
// and gives the tests the same handles.

import {
  APPLY_CONFIRM_APPLY,
  APPLY_CONFIRM_CANCEL,
  APPLY_CONFIRM_TITLE,
  applyConfirmBody,
} from "./applyDriveMode";

export const DRIVE_MODE_CONFIRM_TESTID = "drivemode-confirm";

interface DriveModeConfirmProps {
  /** The mode the operator just picked — named in the body copy. */
  next: string;
  /**
   * Whether the respawn can happen immediately. Drives the body copy: when false, the dialog
   * must say the restart WAITS for the current turn rather than promising it happens now.
   */
  canApplyNow: boolean;
  /** Apply: persist the mode and drive (or queue) the turn-level respawn. */
  onApply: () => void;
  /**
   * Cancel: ⚠️ a TRUE no-op. Nothing is persisted — not the mode, not a pending apply. A Cancel
   * that stored the value while declining to respawn would leave the readout claiming a mode the
   * session is not running under, which is the exact confabulation this feature exists to remove.
   */
  onCancel: () => void;
}

export function DriveModeConfirm({
  next,
  canApplyNow,
  onApply,
  onCancel,
}: DriveModeConfirmProps) {
  return (
    <div
      className="drivemode-confirm"
      data-testid={DRIVE_MODE_CONFIRM_TESTID}
      role="dialog"
      aria-modal="true"
      aria-label={APPLY_CONFIRM_TITLE}
      // ⚠️ Escape cancels (P4.7). Handled here rather than on the workspace root so the key is
      // caught while focus is inside the dialog, and `stopPropagation` keeps it away from the
      // workspace's own key handlers — the same discipline the picker cell's editor uses.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <h2 className="drivemode-confirm-title">{APPLY_CONFIRM_TITLE}</h2>
      <p
        className="drivemode-confirm-body"
        data-testid="drivemode-confirm-body"
      >
        {applyConfirmBody(canApplyNow, next)}
      </p>
      <div className="drivemode-confirm-actions">
        <button
          type="button"
          className="drivemode-confirm-btn drivemode-confirm-btn-primary"
          data-testid="drivemode-confirm-apply"
          // Focus lands on Apply when the dialog opens (P4.7), so Enter confirms and Escape
          // cancels without touching the mouse.
          autoFocus
          onClick={onApply}
        >
          {APPLY_CONFIRM_APPLY}
        </button>
        <button
          type="button"
          className="drivemode-confirm-btn"
          data-testid="drivemode-confirm-cancel"
          onClick={onCancel}
        >
          {APPLY_CONFIRM_CANCEL}
        </button>
      </div>
    </div>
  );
}
