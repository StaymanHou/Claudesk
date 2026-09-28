// The live half of the supervisor activity record: the newest decision per project, held in the
// webview so the `⚙ supervised` badge's "last action" hint updates the moment a decision is made.
//
// ⚠️ Frontend-only by design. The recorder publishes here and appends to the file in the same
// call; no backend→frontend event direction is added (ruling R-4). Keyed by PROJECT PATH, like the
// file's reader, because workspace ids are reassigned on every app run.

import { useSyncExternalStore } from "react";
import type { ActivityRecord } from "./activityRecord";

const latest = new Map<string, ActivityRecord>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Record `record` as its project's newest decision, unless a newer one is already held. */
export function publishActivity(record: ActivityRecord): void {
  const held = latest.get(record.projectPath);
  if (held && held.ts > record.ts) return;
  latest.set(record.projectPath, record);
  notify();
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

/** Test seam: forget everything. */
export function resetActivityFeed(): void {
  latest.clear();
  notify();
}
