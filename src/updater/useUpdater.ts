// M10 WP4 Phase 4 — the App-level updater orchestration hook. Owns:
//  - check-on-launch, GATED by the notifications pref + the skip-list (Q1: filtering is
//    frontend-side, via `shouldAutoNotify`); shows the banner when it should.
//  - the confirm → apply → download-progress → relaunch flow (progress via the
//    `updater-download-progress` event); cancel-before-apply leaves the app untouched.
//  - skip-this-version (persist `skipped_version`, dismiss) + transient dismiss.
//  - a MANUAL check path (`checkNow`) the Phase 5 menu item + picker button call — it
//    IGNORES the skip-list + disable pref (a manual check always reports the truth).
//
// The hook is mounted ONCE at App level (over both scenes). The banner + dialogs render
// from its returned state. The heavy logic (gating, % math, specs) lives in the pure
// updateNotifyState.ts / updateFlowState.ts modules — this hook is the wiring.

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  applyUpdate,
  checkForUpdate,
  getSkippedVersion,
  getUpdateNotificationsEnabled,
  setSkippedVersion,
  UPDATER_DOWNLOAD_PROGRESS_EVENT,
  type DownloadProgress,
  type UpdateCheckResult,
} from "./updaterPrefs";
import { shouldAutoNotify, manualCheckOutcome } from "./updateNotifyState";
import {
  progressPercent,
  QUARANTINE_FALLBACK_ACTIVE,
  type UpdateFlowPhase,
} from "./updateFlowState";

/** What a manual "Check for Updates…" produced, for the caller to surface (Phase 5). */
export interface ManualCheckReport {
  outcome: ReturnType<typeof manualCheckOutcome>;
  result: UpdateCheckResult;
}

export interface UseUpdater {
  /** The check result currently offered by the banner, or null when nothing is shown. */
  banner: UpdateCheckResult | null;
  /** The flow phase (idle/confirming/applying/error). */
  phase: UpdateFlowPhase;
  /** Latest download progress percent (0–100) while applying, or null (indeterminate). */
  applyingPercent: number | null;
  /** An error message when phase === "error" (apply failed, no relaunch). */
  errorMessage: string | null;
  /** WP1-fallback: the bundle path to show in the quarantine dialog, or null when the
   *  fallback isn't active/triggered. (Default GO path leaves this null.) */
  fallbackBundlePath: string | null;
  /** Banner action: open the confirm dialog. */
  requestUpdate: () => void;
  /** Confirm-dialog outcome. */
  confirmUpdate: () => void;
  cancelUpdate: () => void;
  /** Banner action: skip this version (persist + dismiss). */
  skipVersion: () => void;
  /** Banner action: transient dismiss (re-notifies next launch). */
  dismissBanner: () => void;
  /** Dismiss the WP1-fallback quarantine dialog. */
  dismissFallback: () => void;
  /** Manual check (menu item / picker button) — ignores skip + disable; returns the
   *  classified outcome for the caller to surface, and shows the banner if applicable. */
  checkNow: () => Promise<ManualCheckReport | null>;
}

export function useUpdater(): UseUpdater {
  const [banner, setBanner] = useState<UpdateCheckResult | null>(null);
  const [phase, setPhase] = useState<UpdateFlowPhase>("idle");
  const [applyingPercent, setApplyingPercent] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackBundlePath, setFallbackBundlePath] = useState<string | null>(null);

  // Check-on-launch: gated by the notifications pref + skip-list (frontend filter). Runs
  // once on mount. A failed check is swallowed (no update surface on a network error — a
  // manual check will surface the error explicitly). The disable pref OFF means we don't
  // even call check() proactively.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const enabled = await getUpdateNotificationsEnabled();
        if (cancelled || !enabled) return; // OFF → no auto-check at all
        const skipped = await getSkippedVersion();
        const result = await checkForUpdate();
        if (cancelled) return;
        if (shouldAutoNotify(result, { notificationsEnabled: true, skippedVersion: skipped })) {
          setBanner(result);
        }
      } catch {
        // Auto-check failure is silent — a manual check surfaces errors explicitly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to download-progress events for the whole hook lifetime (the emit only
  // fires during an apply; the % is ignored unless we're applying). Registered once.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<DownloadProgress>(UPDATER_DOWNLOAD_PROGRESS_EVENT, (e) => {
      setApplyingPercent(progressPercent(e.payload));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const requestUpdate = useCallback(() => setPhase("confirming"), []);

  const cancelUpdate = useCallback(() => {
    // Cancel before apply: the running app is untouched. Back to idle; the banner stays
    // so the user can reconsider (or dismiss/skip it).
    setPhase("idle");
  }, []);

  const confirmUpdate = useCallback(() => {
    setPhase("applying");
    setApplyingPercent(null); // indeterminate until the first progress event
    setErrorMessage(null);
    void (async () => {
      try {
        // applyUpdate resolves only on FAILURE — a clean relaunch replaces the process,
        // so the success path never returns here. Any resolution/rejection = a failure
        // stage (no update / download+verify / install / self-clear).
        const msg = await applyUpdate();
        // If we got here without relaunch AND the WP1 fallback is active, the self-clear
        // path is the suspected culprit → show the instruct-user quarantine dialog.
        if (QUARANTINE_FALLBACK_ACTIVE) {
          setFallbackBundlePath("/Applications/Claudesk.app");
        }
        setErrorMessage(`Update did not relaunch: ${msg}`);
        setPhase("error");
      } catch (e) {
        setErrorMessage(String(e));
        setPhase("error");
      }
    })();
  }, []);

  const skipVersion = useCallback(() => {
    const v = banner?.available_version ?? null;
    setBanner(null);
    setPhase("idle");
    if (v) void setSkippedVersion(v).catch(() => {});
  }, [banner]);

  const dismissBanner = useCallback(() => {
    setBanner(null);
    setPhase("idle");
  }, []);

  const dismissFallback = useCallback(() => setFallbackBundlePath(null), []);

  const checkNow = useCallback(async (): Promise<ManualCheckReport | null> => {
    // Manual check: IGNORE skip + disable (the user explicitly asked). Surface the truth.
    try {
      const result = await checkForUpdate();
      const outcome = manualCheckOutcome(result);
      // Show the banner for an available direct-download update (the same UX as
      // auto-notify, but here it fires even for a skipped version — manual re-offers it).
      if (outcome === "update-available") setBanner(result);
      return { outcome, result };
    } catch {
      return null;
    }
  }, []);

  return {
    banner,
    phase,
    applyingPercent,
    errorMessage,
    fallbackBundlePath,
    requestUpdate,
    confirmUpdate,
    cancelUpdate,
    skipVersion,
    dismissBanner,
    dismissFallback,
    checkNow,
  };
}
