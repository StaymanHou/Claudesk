// silent-supervisor Phase 3 — ONE DECISION PER `Stop`, WHATEVER DELIVERS IT TWICE.
//
// ⚠️ On 2026-09-25 one `Stop` (`status-channel.log`: a single `outcome=emitted` at …098074) produced
// TWO activity records, so a second consumer in the webview handled the same event. It could not be
// reproduced at research (drive-mode changes, hot reloads, a full reload with a respawn: one record
// per `Stop` each time), so the fix does not depend on finding it. The turn-end funnel claims each
// EVENT once, and a repeat is recorded as `duplicate-turn-end` instead of being decided again. Before
// this, the ledger masked the repeat as `already-fired-for-this-turn`, or, when the first decision
// withheld, let it be decided a second time.
//
// ⚠️ **MODULE-LEVEL, NOT PER-HOOK.** A duplicate from a second `useSupervisor` instance would have its
// own ledger and its own ref, and only process-wide state sees both.
//
// The key is `(workspace_id, last_event_at)`: `last_event_at` is the hook's send time in ms, set once
// per hook event, so two deliveries of one `Stop` share it and two turns never do. An event without
// it (a hook that sent no `ts`) is never deduplicated, so behavior there is exactly as before.

/** How many recent turn ends to remember. Only an immediate repeat needs to be caught. */
const REMEMBERED = 64;

const handled: string[] = [];

/**
 * Claim a turn-end event. Returns `false` when this exact event was already claimed, meaning this
 * delivery is a duplicate and must not be decided again.
 */
export function claimTurnEnd(
  workspaceId: string,
  lastEventAt: number | undefined,
): boolean {
  if (lastEventAt === undefined) return true;
  const key = `${workspaceId}\u0000${lastEventAt}`;
  if (handled.includes(key)) return false;
  handled.push(key);
  if (handled.length > REMEMBERED) handled.shift();
  return true;
}

/** Forget every claim. Tests only. */
export function resetTurnEnds(): void {
  handled.length = 0;
}
