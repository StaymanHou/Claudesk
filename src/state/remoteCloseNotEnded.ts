// M17 WP5 Phase 4 (AC-5.3) — a × / ⏸ on a remote workspace whose host was unreachable could not
// end its Claude Code session: it is still running there, and the next open will ask (dialog A).
// The backend says so with this event (`cc_session::remote::REMOTE_CLOSE_NOT_ENDED_EVENT`); the
// workspace is already gone, so the app shows it.

/** Mirrors `cc_session::remote::REMOTE_CLOSE_NOT_ENDED_EVENT`. */
export const REMOTE_CLOSE_NOT_ENDED_EVENT = "remote-close-not-ended";

/** Mirrors `cc_session::remote::RemoteCloseNotEnded` (wire camelCase). */
export interface RemoteCloseNotEnded {
  projectPath: string;
  host: string;
  /** The project as its picker row names it (paydown-2026-11-27 WP8). */
  project: string;
  /** Mirrors `CloseNotEndedReason`: the link was down, or the end ran and failed. */
  reason: "unreachable" | "failed";
}

/**
 * The toast's words, in plain terms (what happened, what is still true, what comes next).
 *
 * paydown-2026-11-27 WP8 — it names the project (two rows on one host used to give two identical
 * toasts) and says WHY the end did not happen: it used to say "it isn't reachable" even when the
 * end ran over a working link and failed.
 */
export function closeNotEndedText(e: RemoteCloseNotEnded): string {
  const why =
    e.reason === "failed"
      ? `ending it on ${e.host} failed`
      : `${e.host} isn't reachable`;
  return `Couldn't end the Claude Code session for ${e.project}: ${why}, so the session is still running there. The next time you open it, Claudesk will ask whether to end it or reconnect.`;
}
