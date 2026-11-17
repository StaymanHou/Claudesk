// M17 WP5 Phase 3 (AC-4) — Detach a remote workspace: leave its Claude Code session running on the
// host and close the tile. Pure (its IO is injected), so the order and the failure rule are tested.
//
// ⚠️ THE ORDER IS THE FEATURE. `cc_detach` takes the session out of the registry BEFORE the tile
// closes, so the pane's unmount `cc_kill` finds nothing. Closing first (or closing after a failed
// detach) would run that `cc_kill`, whose close ENDS the remote session: the opposite of a Detach.
//
// The close is the UNCLEAN one (the flag stays set, AC-4.2): if the session dies meanwhile, the
// next open resumes it with `--continue`. And no dialog (AC-4.1): an explicit action keeps its
// meaning.

/** The error text of `CcError::UnknownSession` (`no such session: <id>`). */
const NO_SUCH_SESSION = "no such session";

/** What a Detach did. */
export type DetachOutcome =
  /** The session was detached (or was already gone), and the tile closed. */
  | "closed"
  /** The detach failed; the tile stays, because closing it would END the remote session. */
  | "kept";

export interface DetachRun {
  /** The workspace's PTY session id; `null` = no live session (nothing to detach). */
  sessionId: string | null;
  /** The `cc_detach` IPC. */
  detach: (sessionId: string) => Promise<void>;
  /** The unclean close (flag kept). */
  closeUnclean: () => void;
  /** Told why a detach failed (the tile stays). */
  onError: (message: string) => void;
}

export async function detachThenClose(run: DetachRun): Promise<DetachOutcome> {
  if (run.sessionId !== null) {
    try {
      await run.detach(run.sessionId);
    } catch (e) {
      const message = String(e);
      // Already gone (CC exited, or the workspace ended): nothing is running to leave behind or
      // to kill, so closing is safe.
      if (!message.includes(NO_SUCH_SESSION)) {
        run.onError(message);
        return "kept";
      }
    }
  }
  run.closeUnclean();
  return "closed";
}
