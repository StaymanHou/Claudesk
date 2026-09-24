// F-b — which profile a WORKSPACE is running under, for the workflow-applicability funnel
// (`isWorkflowApplicable` in ./workflowApplicable.ts).
//
// Two sources, because neither alone is the truth for a workspace's whole life:
//   - the row's STORED reference (`project_get_profile`) — known before any session exists, and
//     what the first spawn reads;
//   - the LIVE session's reference (`cc_session_profile`) — what a running process actually
//     spawned under. A respawn (Recycle, restart) re-reads `projects.json`, so if the row was
//     changed while the workspace was open, only this one is right.
//
// The decision lives in `resolveWorkspaceProfile` (pure, tested); the hook only does IO.

import { useEffect, useState } from "react";
import {
  getProjectProfile,
  getSessionProfile,
  type ProfileReference,
} from "./workflowApplicable";

/** A live-session read, tagged with the session it answers for. */
export interface SessionProfileRead {
  readonly sessionId: string;
  readonly profile: string | null;
}

/**
 * The effective profile reference:
 * - a live read **for the current session id** wins;
 * - otherwise the stored row value (which is also what that session's spawn just read — the two
 *   diverge only if the row changed while the workspace was open AND a respawn happened, and the
 *   live read lands one IPC round-trip later);
 * - `undefined` when nothing has landed yet → the funnel fails CLOSED.
 *
 * ⚠️ A live read for a PREVIOUS session id is ignored, never carried forward: after a respawn it
 * describes a process that no longer exists.
 */
export function resolveWorkspaceProfile(
  stored: ProfileReference,
  live: SessionProfileRead | null,
  currentSessionId: string | null,
): ProfileReference {
  if (
    live !== null &&
    currentSessionId !== null &&
    live.sessionId === currentSessionId
  ) {
    return live.profile;
  }
  return stored;
}

export function useWorkspaceProfile(
  projectPath: string,
  ccSessionId: string | null,
): ProfileReference {
  const [stored, setStored] = useState<ProfileReference>(undefined);
  const [live, setLive] = useState<SessionProfileRead | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getProjectProfile(projectPath)
      .then((profile) => {
        if (!cancelled) setStored(profile);
      })
      .catch((e) => {
        // Stays `undefined` → the workflow layer stays OFF for this workspace. Never guess
        // "default" on a failed read.
        console.warn("[claudesk] project_get_profile failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    if (ccSessionId === null) return;
    let cancelled = false;
    void getSessionProfile(ccSessionId)
      .then((profile) => {
        if (!cancelled) setLive({ sessionId: ccSessionId, profile });
      })
      .catch((e) => {
        console.warn("[claudesk] cc_session_profile failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [ccSessionId]);

  return resolveWorkspaceProfile(stored, live, ccSessionId);
}
