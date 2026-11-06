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
// Paydown 2026-11-04 WP8 — the projects whose file replay has been folded, and, for each project
// not seeded yet, the live records published so far. The seed is async, so a live decision can
// land first; the seed then folds the replay IN FRONT of these instead of being dropped as older.
const seeded = new Set<string>();
const unseededLive = new Map<string, ActivityRecord[]>();

/** How many of a project's newest file records the mount seed replays. */
export const SEED_REPLAY_LIMIT = 50;

function notify(): void {
  for (const l of listeners) l();
}

/** Show `state`'s alarm, replacing the held object only when the alarm itself changed. */
function setAlarmState(projectPath: string, state: AlarmState): void {
  failures.set(projectPath, state);
  const next = alarmFor(state);
  const prev = alarms.get(projectPath) ?? null;
  // A new object only when the alarm itself changes, so the React snapshot stays stable.
  if (
    next?.kind !== prev?.kind ||
    (next !== null && prev !== null && next.count !== prev.count)
  ) {
    alarms.set(projectPath, next);
  }
}

/** Record `record` as its project's newest decision, unless a newer one is already held. */
export function publishActivity(record: ActivityRecord): void {
  const held = latest.get(record.projectPath);
  if (held && held.ts > record.ts) return;
  setAlarmState(
    record.projectPath,
    nextAlarmState(failures.get(record.projectPath) ?? NO_FAILURES, record),
  );
  if (!seeded.has(record.projectPath)) {
    const buffered = unseededLive.get(record.projectPath) ?? [];
    buffered.push(record);
    // Only the trailing run matters to the alarm; the cap keeps an unseeded project bounded.
    if (buffered.length > SEED_REPLAY_LIMIT) buffered.shift();
    unseededLive.set(record.projectPath, buffered);
  }
  latest.set(record.projectPath, record);
  notify();
}

/**
 * A record's identity across the file and the live feed. The same decision read back from the
 * file is a different object with the same fields, and two distinct decisions can share a
 * millisecond (a `duplicate-turn-end` and the turn it repeats), so neither `===` nor `ts` alone
 * will do.
 */
function identity(r: ActivityRecord): string {
  return `${r.ts}|${r.workspaceId}|${r.outcome}|${r.reason ?? ""}`;
}

/**
 * Fold a project's file replay (oldest first) into the feed, ONCE per project per app run.
 *
 * Merged with whatever was published live before it landed: deduped by {@link identity}, sorted
 * by time, and folded from scratch, so a live decision that beat the async read neither drops
 * the replay nor is counted twice. A later seed for the same project (a second workspace) is a
 * no-op, because every record it would replay has already been folded.
 */
export function seedActivity(
  projectPath: string,
  replay: readonly ActivityRecord[],
): void {
  if (seeded.has(projectPath)) return;
  seeded.add(projectPath);
  const live = unseededLive.get(projectPath) ?? [];
  unseededLive.delete(projectPath);
  const byId = new Map<string, ActivityRecord>();
  for (const r of [...replay, ...live]) byId.set(identity(r), r);
  // `sort` is stable, so equal-ts records keep replay-then-live order.
  const merged = [...byId.values()].sort((a, b) => a.ts - b.ts);
  if (merged.length === 0) return;
  setAlarmState(
    projectPath,
    merged.reduce<AlarmState>(nextAlarmState, NO_FAILURES),
  );
  const newest = merged[merged.length - 1];
  const held = latest.get(projectPath);
  if (!held || held.ts <= newest.ts) latest.set(projectPath, newest);
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
  seeded.clear();
  unseededLive.clear();
  notify();
}
