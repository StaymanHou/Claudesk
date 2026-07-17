// M10 WP4 Phase 3 — the pure UX-state logic for the updater notify layer (Q1: the
// skip-list + disable filtering is frontend-side; the backend `updater_check` stays a
// pure pre-flight). No React, no invoke — plain functions over plain args, so the
// gating truth-table is fully unit-testable without a running app or DOM.
//
// Two decisions live here:
//  - `shouldAutoNotify` — the AUTO-check-on-launch gate: given a check result + the two
//    prefs, should the non-modal banner appear? (OFF pref, skipped version, and up-to-date
//    suppress it. Reshaped M10 WP6: install-source-agnostic — brew installs auto-notify
//    like direct-download.)
//  - `manualCheckOutcome` — classifies a MANUAL "Check for Updates…" result. A manual
//    check IGNORES the skip-list + disable pref (it always reports the truth): the user
//    asked, so tell them up-to-date / update-available. (Reshaped M10 WP6: the `brew-defer`
//    outcome is retired — brew classifies like direct-download; the banner branches on
//    `install_source` for the brew-specific copy affordance.)

import type { UpdateCheckResult } from "./updaterPrefs";

/** The prefs that gate an auto-notify. */
export interface NotifyPrefs {
  notificationsEnabled: boolean;
  /** The exact version tag the user chose to skip, or `null` if nothing skipped. */
  skippedVersion: string | null;
}

/**
 * The AUTO-check-on-launch gate. Returns `true` only when the non-modal update banner
 * should proactively appear. Suppressed when:
 *  - notifications are OFF (the user disabled proactive nags), OR
 *  - there is no newer version (`available_version === null` — up to date), OR
 *  - the available version is exactly the one the user skipped.
 *
 * A version NEWER than the skipped one still notifies (skip is per-exact-tag, not a
 * floor) — this falls out naturally: `available_version !== skippedVersion`.
 *
 * Reshaped M10 WP6: Homebrew installs are NO LONGER suppressed here — a brew user gets
 * the same auto-notify as direct-download when a newer version exists (the banner then
 * shows a copy-to-clipboard `brew upgrade` instruction instead of an Update button). Only
 * self-INSTALLING is disabled for brew, not the notification. So this gate is now
 * install-source-agnostic: it fires on {enabled, newer-than-current, not-skipped} alone.
 */
export function shouldAutoNotify(
  result: UpdateCheckResult,
  prefs: NotifyPrefs,
): boolean {
  if (!prefs.notificationsEnabled) return false;
  if (result.available_version === null) return false;
  if (result.available_version === prefs.skippedVersion) return false;
  return true;
}

/** The classified outcome of a MANUAL check (ignores skip-list + disable pref). */
export type ManualCheckOutcome = "up-to-date" | "update-available";

/**
 * Classify a MANUAL "Check for Updates…" result. A manual check always reports the
 * truth — the skip-list and the disable pref do NOT suppress it (the user explicitly
 * asked). `available_version === null` is up-to-date; otherwise an update is available
 * (even if it's the skipped version — a manual check re-offers it).
 *
 * Reshaped M10 WP6: the `"brew-defer"` outcome is RETIRED. Homebrew installs now check
 * for real and are classified exactly like direct-download (update-available / up-to-date)
 * — the brew-ness rides `result.install_source`, which the banner branches on to show the
 * copy-to-clipboard `brew upgrade` instruction. Classifying brew as "update-available"
 * (not a separate defer outcome) is what makes the notification experience symmetric.
 */
export function manualCheckOutcome(result: UpdateCheckResult): ManualCheckOutcome {
  if (result.available_version === null) return "up-to-date";
  return "update-available";
}
