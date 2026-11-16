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
