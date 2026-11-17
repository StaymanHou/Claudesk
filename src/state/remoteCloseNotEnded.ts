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
}

/** The toast's words, in plain terms (what happened, what is still true, what comes next). */
export function closeNotEndedText(e: RemoteCloseNotEnded): string {
  return `Couldn't end the Claude Code session on ${e.host}: it isn't reachable, so the session is still running there. The next time you open it, Claudesk will ask whether to end it or reconnect.`;
}
