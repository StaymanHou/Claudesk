// M10 WP4 Phase 4 — the non-modal, top-of-window update notification banner (operator
// chose the top banner over a bottom-corner toast — reads clearly over BOTH the picker
// scene and an open workspace). Full-width, dismissible, dark-token styled (App.css
// `.update-banner`). NOT a blocking modal — the app stays usable behind it.
//
// Three actions inline: Update… (→ confirm dialog, owned by useUpdater) / Skip this
// version (→ persist skipped_version, dismiss) / Dismiss (transient — re-notifies next
// launch). A Homebrew install renders the `brew upgrade` note INSTEAD of an Update button
// (WP3 defer seam) — the backend already returns no available_version for brew, so this
// branch fires only if a defer status reached the banner.
//
// This is the DUMB view — all state/flow lives in useUpdater. Props are the available
// version + the three callbacks + an optional applying-progress percent (null =
// indeterminate) that turns the Update button into a progress bar while a download runs.

interface UpdateNotifyBannerProps {
  /** The available version tag to offer (e.g. "0.2.6"). */
  version: string;
  /** True when this is a Homebrew-managed install → show the `brew upgrade` note. */
  isBrew: boolean;
  /** While a download is in flight: 0–100, or null for an indeterminate bar. `undefined`
   *  = not applying (show the action buttons). */
  applyingPercent?: number | null;
  onUpdate: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

export function UpdateNotifyBanner({
  version,
  isBrew,
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
        {isBrew ? (
          <>
            Claudesk {version} is available. This is a Homebrew install — run{" "}
            <code>brew upgrade claudesk</code> to update.
          </>
        ) : applying ? (
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
      ) : isBrew ? (
        // Homebrew: no Update button (defer to brew upgrade), only Dismiss.
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn"
            data-testid="update-banner-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
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
