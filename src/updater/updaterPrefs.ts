// M10 WP4 — the frontend seam for the in-app updater's user-control prefs + the shared
// updater DTO types. Thin typed wrappers over the backend commands (per bundle-identity
// config_store, mirror `state/timeAnalytics.ts`'s get/set/broadcast trio) + the two IPC
// payload shapes the notify banner / progress bar / manual check consume.
//
// Q1 (arch.md): the skip-list + disable FILTERING is frontend-side — `updater_check`
// stays a pure pre-flight (it still returns the available version even when skipped);
// `updateNotifyState.ts` owns the gating. These wrappers just persist/read the raw prefs.
//
// The event-name strings are pinned on the backend by
// `notifications_enabled_event_name_is_stable` + `download_progress_event_name_is_stable`
// (src-tauri/src/updater/commands.rs). The payload field names mirror the serde structs
// pinned by `download_progress_payload_serializes_snake_case_shape` — snake_case VERBATIM
// (Tauri does NOT camelCase-convert command/event payloads).

import { invoke } from "@tauri-apps/api/core";

/** Result of a `updater_check` pre-flight — what the running app is vs. what the manifest
 *  offers. `available_version` is `null` when up to date. snake_case VERBATIM (IPC-DTO
 *  casing). One self-update path for every install — the M10 WP6 install-source gate was
 *  removed (decision reversed: brew installs self-update too), so there is no
 *  `install_source` field. Moved here from WP2's throwaway `UpdaterTrigger.tsx` so it
 *  survives that file's deletion in P4. */
export interface UpdateCheckResult {
  current_version: string;
  available_version: string | null;
  status: string;
}

/** Download-progress event payload (backend `DownloadProgress`, emitted per chunk from
 *  `updater_apply`). `downloaded` is cumulative bytes; `total` is the server's
 *  content-length (`null` when omitted → show an indeterminate bar); `done` marks the
 *  final emit (flip to 100%/installing). snake_case VERBATIM. */
export interface DownloadProgress {
  downloaded: number;
  total: number | null;
  done: boolean;
}

/** Broadcast fired when the update-notification toggle changes (backend
 *  `UPDATER_NOTIFICATIONS_ENABLED_EVENT`). The picker checkbox listens so a change from
 *  any surface re-syncs it. */
export const UPDATER_NOTIFICATIONS_ENABLED_EVENT = "updater-notifications-enabled";

/** Event carrying real download progress (backend `UPDATER_DOWNLOAD_PROGRESS_EVENT`),
 *  emitted from `updater_apply`'s download callback. The progress bar subscribes. */
export const UPDATER_DOWNLOAD_PROGRESS_EVENT = "updater-download-progress";

/** Read the persisted update-notification toggle (default `true`/ON). Thin typed wrapper
 *  over `updater_get_notifications_enabled`. */
export async function getUpdateNotificationsEnabled(): Promise<boolean> {
  return invoke<boolean>("updater_get_notifications_enabled");
}

/** Persist the update-notification toggle. The backend re-broadcasts
 *  `updater-notifications-enabled` so every surface re-renders. Thin typed wrapper over
 *  `updater_set_notifications_enabled`. */
export async function setUpdateNotificationsEnabled(enabled: boolean): Promise<void> {
  return invoke<void>("updater_set_notifications_enabled", { enabled });
}

/** Read the persisted skipped-version tag (`null` when nothing skipped). Thin typed
 *  wrapper over `updater_get_skipped_version`. */
export async function getSkippedVersion(): Promise<string | null> {
  return invoke<string | null>("updater_get_skipped_version");
}

/** Persist the skipped-version tag (`null` clears the skip). Thin typed wrapper over
 *  `updater_set_skipped_version`. */
export async function setSkippedVersion(version: string | null): Promise<void> {
  return invoke<void>("updater_set_skipped_version", { version });
}

/** Run a `updater_check` pre-flight (no download, no install). Thin typed wrapper. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>("updater_check");
}

/** Drive the full update flow: check → download (progress events) → install → self-clear
 *  → relaunch. Resolves only on failure (a clean relaunch replaces the process). Thin
 *  typed wrapper over `updater_apply`. */
export async function applyUpdate(): Promise<string> {
  return invoke<string>("updater_apply");
}
