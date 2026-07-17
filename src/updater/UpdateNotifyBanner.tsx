// M10 WP4 Phase 4 — the non-modal, top-of-window update notification banner (operator
// chose the top banner over a bottom-corner toast — reads clearly over BOTH the picker
// scene and an open workspace). Full-width, dismissible, dark-token styled (App.css
// `.update-banner`). NOT a blocking modal — the app stays usable behind it.
//
// A DIRECT-DOWNLOAD install shows: Update… (→ confirm dialog) / Skip this version /
// Dismiss. A HOMEBREW install (reshaped M10 WP6) gets the SAME "an update is available"
// experience — same version text, same Skip/Dismiss — but the in-app Update button is
// replaced by a ONE-CLICK-TO-COPY `brew upgrade claudesk` button (clicking copies the
// command + flashes "Copied!"), since brew installs must NOT self-install (only the ACTION
// differs; brew now checks for real, so `isBrew` here means a genuine available update).
//
// This is the DUMB view — all state/flow lives in useUpdater; only the transient "Copied!"
// affordance is local view state. Props are the available version + the callbacks + an
// optional applying-progress percent (null = indeterminate) that turns the Update button
// into a progress bar while a download runs (direct-download only).

import { useState } from "react";
import { BREW_UPGRADE_CMD, copyToClipboard } from "./copyToClipboard";

interface UpdateNotifyBannerProps {
  /** The available version tag to offer (e.g. "0.2.6"). */
  version: string;
  /** True when this is a Homebrew-managed install → the Update button becomes a
   *  copy-to-clipboard `brew upgrade claudesk` button (no in-app self-install). */
  isBrew: boolean;
  /** While a download is in flight: 0–100, or null for an indeterminate bar. `undefined`
   *  = not applying (show the action buttons). Direct-download only (brew never applies). */
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
  const [copied, setCopied] = useState(false);

  async function handleCopyBrew() {
    const ok = await copyToClipboard(BREW_UPGRADE_CMD);
    if (ok) {
      setCopied(true);
      // Revert the "Copied!" affordance after a moment so the button re-invites a copy.
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

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
            {isBrew ? " Update via Homebrew:" : ""}
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
        // Homebrew: no in-app Update button (brew must not self-install). Instead a
        // one-click-to-copy `brew upgrade claudesk` button (flashes "Copied!"), plus the
        // same Skip / Dismiss as direct-download. Same notification, different action.
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn update-banner-btn-primary update-banner-btn-copy"
            data-testid="update-banner-brew-copy"
            data-copied={copied ? "true" : "false"}
            onClick={() => void handleCopyBrew()}
            title={`Copy “${BREW_UPGRADE_CMD}” to the clipboard`}
          >
            {copied ? "Copied!" : <><code>{BREW_UPGRADE_CMD}</code> ⧉</>}
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
