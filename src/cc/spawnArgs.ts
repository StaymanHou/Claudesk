// The arguments `XtermPane` sends to its spawn command, and the one-shot intent override that a
// drive-mode apply hands the NEXT spawn.
//
// The override exists because a drive-mode apply's respawn must spawn as `turn-respawn`, not as
// the door this workspace was opened with: `fire` CONSUMES the unclean-exit flag (right for a
// reopen acting on a crash signal, wrong here, since it spends the signal the next real open
// depends on), while `turn-respawn` resumes with `--continue` and leaves the flag intact.
//
// It is a REF read AT SPAWN TIME, and the spawn that reads it clears it. That is an event, not a
// timer: the apply sets the ref immediately before `relaunch()`, and nothing else reads it, so
// the spawn that relaunch causes is exactly the one that takes it. (It replaced a 400 ms sleep
// that held a prop across the relaunch and was synchronised against the React scheduler.)

import type { OpenIntent } from "../state/predictAction";

/** A one-shot intent for the next `cc_spawn`; `null` = use the pane's own `openIntent`. */
export interface SpawnIntentRef {
  current: OpenIntent | null;
}

/**
 * The invoke arguments for one spawn, taking (and clearing) any pending override.
 *
 * Only `cc_spawn` carries an intent: `term_spawn` (the right-panel shell) has no resume arm and its
 * Rust command takes no such parameter, so it never reads the override and never clears it.
 */
export function takeSpawnArgs(
  spawnCommand: string,
  projectPath: string,
  openIntent: OpenIntent,
  override: SpawnIntentRef | undefined,
): { projectPath: string; intent?: OpenIntent } {
  if (spawnCommand !== "cc_spawn") return { projectPath };
  const taken = override?.current ?? null;
  if (override) override.current = null;
  return { projectPath, intent: taken ?? openIntent };
}
