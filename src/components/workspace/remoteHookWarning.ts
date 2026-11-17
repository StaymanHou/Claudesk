// M17 WP4 (AC-1.2) — the remote workspace's "the hook could not be registered" toast.
//
// ⚠️ WHY IT IS READ, NOT LISTENED FOR. The remote hook install runs on the host LINK, before the
// link reports Up, and the link usually comes Up during the picker's open check, before this
// workspace exists. An event would arrive with no listener. A notice written into the pane would
// be wiped by tmux's first full redraw on attach. So the link keeps the last connect's result
// (sticky, in plain words), and the workspace reads it once its spawn has resolved: by then the
// install of the connect the spawn rode has finished.

import { invoke } from "@tauri-apps/api/core";
import { REMOTE_KEY_PREFIX } from "../../cc/spawnArgs";

/**
 * The plain-words install failure for the host of `projectPath`, or `null` when the install
 * worked, the project is local, or the read itself failed (a toast about a toast is noise).
 */
export async function readRemoteHookWarning(
  projectPath: string,
): Promise<string | null> {
  if (!projectPath.startsWith(REMOTE_KEY_PREFIX)) return null;
  try {
    return (
      (await invoke<string | null>("remote_hook_warning", { projectPath })) ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * M17 WP5 (AC-2.3) — what the open check found that the picker's label did not predict (the label
 * is read from Claudesk's local record and may be stale, e.g. "reconnect" for a session that has
 * since ended), taken once; or `null`. Read like the hook warning, once the spawn has resolved:
 * the picker is gone by then, so this workspace is where the operator meets it (prior
 * `a-silent-non-action-must-not-read-as-done`).
 */
export async function readRemoteOpenNotice(
  projectPath: string,
): Promise<string | null> {
  if (!projectPath.startsWith(REMOTE_KEY_PREFIX)) return null;
  try {
    return (
      (await invoke<string | null>("remote_open_notice", { projectPath })) ??
      null
    );
  } catch {
    return null;
  }
}

/** The remote workspace's open-time toast: the open notice, then the hook warning, either or both. */
export async function readRemoteOpenToast(
  projectPath: string,
): Promise<string | null> {
  const [notice, warning] = await Promise.all([
    readRemoteOpenNotice(projectPath),
    readRemoteHookWarning(projectPath),
  ]);
  const parts = [notice, warning].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}
