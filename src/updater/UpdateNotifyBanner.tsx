// M10 WP4 Phase 4 — the non-modal, top-of-window update notification banner (operator
// chose the top banner over a bottom-corner toast — reads clearly over BOTH the picker
// scene and an open workspace). Full-width, dismissible, dark-token styled (App.css
// `.update-banner`). NOT a blocking modal — the app stays usable behind it.
//
// One self-update path for every install (M10 WP6 Phase B1, decision reversal): the
// banner shows Update… (→ confirm dialog) / Skip this version / Dismiss regardless of how
// the app was installed (brew and direct download self-update identically). The earlier
// brew-specific copy-`brew upgrade` branch was removed with the install-source gate.
//
// This is the DUMB view — all state/flow lives in useUpdater. Props are the available
// version + the callbacks + an optional applying-progress percent (null = indeterminate)
// that turns the Update button into a progress bar while a download runs.

interface UpdateNotifyBannerProps {
  /** The available version tag to offer (e.g. "0.2.7"). */
  version: string;
  /** While a download is in flight: 0–100, or null for an indeterminate bar. `undefined`
   *  = not applying (show the action buttons). */
  applyingPercent?: number | null;
  onUpdate: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

export function UpdateNotifyBanner({
  version,
  applyingPercent,
  onUpdate,
  onSkip,
  onDismiss,
}: UpdateNotifyBannerProps) {
  const applying = applyingPercent !== undefined;

  return (
    <div className="update-banner" data-testid="update-notify-banner" role="status">
      <span className="update-banner-icon" aria-hidden="true">
        ⬆︎
      </span>
      <span className="update-banner-text">
        {applying ? (
          <>Updating to {version}…</>
        ) : (
          <>
            Claudesk <strong>{version}</strong> is available.
          </>
        )}
      </span>

      {applying ? (
        // Progress bar (driven by the updater-download-progress event via useUpdater).
        <div
          className="update-banner-progress"
          data-testid="update-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={applyingPercent ?? undefined}
        >
          <div
            className={`update-banner-progress-fill${
              applyingPercent === null ? " indeterminate" : ""
            }`}
            style={
              applyingPercent === null ? undefined : { width: `${applyingPercent}%` }
            }
          />
        </div>
      ) : (
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn update-banner-btn-primary"
            data-testid="update-banner-update"
            onClick={onUpdate}
          >
            Update…
          </button>
          <button
            type="button"
            className="update-banner-btn"
            data-testid="update-banner-skip"
            onClick={onSkip}
          >
            Skip this version
          </button>
          <button
            type="button"
            className="update-banner-btn"
            data-testid="update-banner-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
