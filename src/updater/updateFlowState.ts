// M10 WP4 Phase 4 — pure model for the update FLOW (the confirm → download-progress →
// install/relaunch, cancel-before-install) + the two dialog specs. React-free, DOM-free
// so the phase transitions + the % math + the specs are vitest-testable (repo posture:
// pure logic → vitest, live DOM → Playwright/bridge; same split as confirmDialog.ts).
//
// The flow the useUpdater hook drives:
//   idle → (banner shown) → confirming → applying → (relaunch replaces process)
//                                       ↘ cancel → idle (running app untouched)
//                                       ↘ error → error (surface, no relaunch)
// `applying` carries the latest DownloadProgress so the banner can render a % bar.

import type { ConfirmSpec } from "../components/workspace/editor/confirmDialog";
import type { DownloadProgress } from "./updaterPrefs";

/** The flow phases the banner/hook step through. */
export type UpdateFlowPhase =
  | "idle" // no update in flight (banner may still be dismissed-but-available)
  | "confirming" // the Update…-confirm dialog is up
  | "applying" // download+install in progress (progress bar)
  | "error"; // apply failed (surfaced; app untouched or partially — see message)

/** The confirm dialog's outcomes. */
export type UpdateConfirmChoice = "update" | "cancel";

/**
 * The "Update & relaunch?" confirm dialog spec. Update (primary) / Cancel (default, the
 * safe choice — cancel leaves the running app untouched, nothing is downloaded/installed
 * until Update is pressed). Esc → cancel. `version` is woven in so the operator sees
 * exactly which version they're about to install + that the app will relaunch.
 */
export function updateConfirmSpec(version: string): ConfirmSpec<UpdateConfirmChoice> {
  return {
    title: "Update Claudesk",
    message: `Update to ${version}? Claudesk will download the update and relaunch.`,
    buttons: [
      { id: "update", label: "Update & Relaunch", value: "update", variant: "primary" },
      { id: "cancel", label: "Cancel", value: "cancel", variant: "default" },
    ],
    escValue: "cancel",
  };
}

/**
 * Compute a download-progress percentage (0–100) from a `DownloadProgress`, or `null`
 * when it can't be known (no total → indeterminate bar). `done` pins 100. Clamped to
 * [0,100] so a server that over/under-reports can't push the bar out of range.
 */
export function progressPercent(p: DownloadProgress): number | null {
  if (p.done) return 100;
  if (p.total === null || p.total <= 0) return null; // indeterminate
  const pct = (p.downloaded / p.total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * The WP1-FALLBACK quarantine dialog spec — shown ONLY if the self-`xattr`-clear proves
 * insufficient (WP1's live verdict, deferred to WP6). Default is the GO path (self-clear,
 * as WP2's updater_apply does); this dialog is the instruct-the-user escape hatch. A
 * single OK acknowledges. `bundlePath` is the installed bundle the user must clear.
 */
export type QuarantineAck = "ok";

export function quarantineFallbackSpec(bundlePath: string): ConfirmSpec<QuarantineAck> {
  return {
    title: "One more step to finish updating",
    message:
      `macOS quarantined the updated app. Run this in Terminal, then reopen Claudesk:\n\n` +
      `xattr -dr com.apple.quarantine "${bundlePath}"`,
    buttons: [{ id: "ok", label: "Got it", value: "ok", variant: "primary" }],
    escValue: "ok",
  };
}

/**
 * WP1 fallback flag — whether the instruct-user quarantine dialog path is active. Default
 * `false` = the GO path (updater_apply self-clears, as shipped in WP2). WP6 flips this to
 * `true` with a one-line change if the live Gatekeeper verdict requires the fallback (the
 * self-clear proved insufficient). Kept as a single named const so WP6's flip is greppable
 * and the seam is built now (operator decision, Q4).
 */
export const QUARANTINE_FALLBACK_ACTIVE = false;

/** A transient info/error note surfaced to the App-level updater status row (WP6 P1.4). */
export interface UpdaterStatusNote {
  kind: "info" | "error";
  message: string;
}

/**
 * Map a manual-check outcome to the App-level status note (WP6 P1.4). This is the feedback
 * the native-menu "Check for Updates…" path had no surface for (App.tsx has no toast like
 * the picker: SURFACE-2026-07-17-QUALITY-WP4-MENU-CHECK-DISCARDS-OUTCOME). The
 * `update-available` outcome shows the banner instead → no note (returns null). Pure so
 * the outcome→note mapping is vitest-testable without driving the hook.
 *
 * Reshaped M10 WP6: the `"brew-defer"` outcome is retired (brew now checks for real and
 * classifies as update-available / up-to-date like direct-download — the brew-specific
 * `brew upgrade` affordance moved into the banner's isBrew branch). So a brew "update
 * available" shows the banner (returns null here); a brew "up to date" is just "up to
 * date" — no more brew-defer note.
 */
export function statusNoteForOutcome(
  outcome: "update-available" | "up-to-date",
): UpdaterStatusNote | null {
  switch (outcome) {
    case "update-available":
      return null; // the banner surfaces this; no status note
    case "up-to-date":
      return { kind: "info", message: "Claudesk is up to date." };
  }
}

/** The note shown when a manual check itself fails (offline / endpoint unreachable). */
export function statusNoteForCheckError(): UpdaterStatusNote {
  return { kind: "error", message: "Could not check for updates." };
}
