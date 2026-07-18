// M10 WP4 Phase 3 — the pure UX-state logic for the updater notify layer (Q1: the
// skip-list + disable filtering is frontend-side; the backend `updater_check` stays a
// pure pre-flight). No React, no invoke — plain functions over plain args, so the
// gating truth-table is fully unit-testable without a running app or DOM.
//
// Two decisions live here (both install-source-agnostic — there is one self-update path
// for every install after the M10 WP6 gate removal):
//  - `shouldAutoNotify` — the AUTO-check-on-launch gate: given a check result + the two
//    prefs, should the non-modal banner appear? (OFF pref, skipped version, and up-to-date
//    suppress it.)
//  - `manualCheckOutcome` — classifies a MANUAL "Check for Updates…" result. A manual
//    check IGNORES the skip-list + disable pref (it always reports the truth): the user
//    asked, so tell them up-to-date / update-available.

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
 * Install-source-agnostic: the gate fires on {enabled, newer-than-current, not-skipped}
 * alone (there is one self-update path for every install).
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
 * (even if it's the skipped version — a manual check re-offers it). Install-source-
 * agnostic (one self-update path for every install).
 */
export function manualCheckOutcome(result: UpdateCheckResult): ManualCheckOutcome {
  if (result.available_version === null) return "up-to-date";
  return "update-available";
}
