// The IPC half of the supervisor activity record: append one record line to
// `<app-data>/supervisor-activity.log`. The schema lives in `activityRecord.ts`.
//
// ⚠️ Best-effort by contract. A failed append is reported with `console.warn` and swallowed:
// the record observes the supervisor, so it must never be able to break a fire or a recycle.

import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { serializeRecord, type ActivityRecord } from "./activityRecord";
import { publishActivity } from "./activityFeed";

let appVersion: Promise<string | null> | null = null;

/** The running app's version, read once per webview and cached. `null` if unreadable. */
export function readAppVersion(): Promise<string | null> {
  appVersion ??= getVersion().then(
    (v) => (typeof v === "string" ? v : null),
    () => null,
  );
  return appVersion;
}

/** Append one record. Never rejects. */
export async function appendActivity(record: ActivityRecord): Promise<void> {
  try {
    await invoke("supervisor_activity_append", {
      line: serializeRecord(record),
    });
  } catch (e) {
    console.warn(
      `supervisor: could not append the activity record — ${String(e)}`,
    );
  }
}

/**
 * The supervisor's default record sink: publish to the live feed (the badge's hint), then
 * append to the durable file. Never rejects.
 */
export async function recordActivity(record: ActivityRecord): Promise<void> {
  publishActivity(record);
  await appendActivity(record);
}

/** The newest `limit` raw record lines from the durable file, oldest first. `[]` on failure. */
export async function readActivityLines(limit: number): Promise<string[]> {
  try {
    const lines = await invoke<string[]>("supervisor_activity_read", { limit });
    return Array.isArray(lines) ? lines : [];
  } catch (e) {
    console.warn(
      `supervisor: could not read the activity record — ${String(e)}`,
    );
    return [];
  }
}
