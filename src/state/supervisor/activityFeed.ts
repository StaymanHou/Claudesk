// The live half of the supervisor activity record: the newest decision per project, held in the
// webview so the `⚙ supervised` badge's "last action" hint updates the moment a decision is made.
//
// ⚠️ Frontend-only by design. The recorder publishes here and appends to the file in the same
// call; no backend→frontend event direction is added (ruling R-4). Keyed by PROJECT PATH, like the
// file's reader, because workspace ids are reassigned on every app run.

import { useSyncExternalStore } from "react";
import type { ActivityRecord } from "./activityRecord";
import {
  alarmFor,
  nextAlarmState,
  NO_FAILURES,
  type AlarmState,
  type SupervisorAlarm,
} from "./failureAlarm";

const latest = new Map<string, ActivityRecord>();
// M16.5 WP3 — each project's run of structural failures, folded from every record published
// here in time order (see `failureAlarm.ts`). Seeded from the file on mount like `latest`, so a
// relaunch does not silently clear an alarm the log still shows.
const failures = new Map<string, AlarmState>();
const alarms = new Map<string, SupervisorAlarm | null>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Record `record` as its project's newest decision, unless a newer one is already held. */
export function publishActivity(record: ActivityRecord): void {
  const held = latest.get(record.projectPath);
  if (held && held.ts > record.ts) return;
  // ⚠️ A record already held (the same ts, as the mount seed can re-publish) folds nothing:
  // counting it twice would raise the alarm a turn early.
  if (held !== record && !(held && held.ts === record.ts)) {
    const state = nextAlarmState(
      failures.get(record.projectPath) ?? NO_FAILURES,
      record,
    );
    failures.set(record.projectPath, state);
    // A new object only when the alarm itself changes, so the React snapshot stays stable.
    const next = alarmFor(state);
    const prev = alarms.get(record.projectPath) ?? null;
    if (
      next?.kind !== prev?.kind ||
      (next !== null && prev !== null && next.count !== prev.count)
    ) {
      alarms.set(record.projectPath, next);
    }
  }
  latest.set(record.projectPath, record);
  notify();
}

/** The project's structural-failure alarm, or `null` (M16.5 WP3). */
export function activityAlarm(projectPath: string): SupervisorAlarm | null {
  return alarms.get(projectPath) ?? null;
}

/** The newest decision held for `projectPath`, or `null`. */
export function latestActivity(projectPath: string): ActivityRecord | null {
  return latest.get(projectPath) ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding: re-renders when this project's newest decision changes. */
export function useLatestActivity(projectPath: string): ActivityRecord | null {
  const get = () => latestActivity(projectPath);
  // The same getter serves as the server snapshot: `renderToStaticMarkup` (the render tests)
  // requires one, and the store has no server-side state that could differ.
  return useSyncExternalStore(subscribe, get, get);
}

/** React binding: re-renders when this project's alarm changes. */
export function useActivityAlarm(projectPath: string): SupervisorAlarm | null {
  const get = () => activityAlarm(projectPath);
  return useSyncExternalStore(subscribe, get, get);
}

/** Test seam: forget everything. */
export function resetActivityFeed(): void {
  latest.clear();
  failures.clear();
  alarms.clear();
  notify();
}
