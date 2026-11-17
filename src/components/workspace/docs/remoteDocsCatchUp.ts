// M17 WP7 — the remote Docs panel's polling, ACTIVE ONLY while it is on screen,
// and the announced catch-up on a return.
//
// Operator ruling (2026-11-17): "no need to poll unless the workspace and the particular Docs tab
// is active", and "a small toast indicating that an immediate poll has initiated and come back with
// the result too whether it's successful or failed. only the very first update after switching
// needs this". Design prior `background-work-only-for-what-is-on-screen`.
//
// So, for a REMOTE workspace (its key is not a local path; the backend poller watches it):
// - on screen (centre stage AND Docs fronted) → `remote_poll_catch_up`: the host's worker ticks at
//   once, diffs against the snapshot kept while paused, emits any change as `fs-change` (the panel's
//   own listener reloads), and answers the outcome;
// - off screen → `remote_poll_pause`: the workspace leaves the host's exec, keeping its snapshot.
//
// The toast announces only RETURNS: the first activation after the workspace opens takes the
// baseline (the panel is listing fresh at that moment anyway), so it shows nothing. "First" is
// decided by a catch-up having ANSWERED before (any answer, an error included: a link still
// connecting at open must not silence the next return), not by an effect having run, so
// StrictMode's double effect cannot turn the opening activation into an announced one.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { workspaceSurfaces } from "../../../state/workspaceSurfaces";

/** The backend's `remote_fs::poller::CatchUp`, verbatim (`kind` tag, snake_case). */
export type CatchUp =
  | { kind: "baseline" }
  | { kind: "unchanged" }
  | { kind: "changed"; paths: string[] }
  | { kind: "gate_off" }
  | { kind: "link_down" }
  | { kind: "failed"; reason: string };

/** A toast for the workspace, or `null` to clear the one this panel put up. */
export type DocsNotice = {
  text: string;
  kind: "info" | "error";
  /** Clear it after this long. Absent: it stays until dismissed or replaced. */
  autoDismissMs?: number;
} | null;

/** How long a successful catch-up's toast stays. A failure stays until dismissed. */
export const CATCH_UP_TOAST_MS = 4000;

export const CHECKING_TEXT = "Checking the remote docs for changes…";

/** The words "the remote host isn't reachable" use everywhere else (`remote_fs::LINK_DOWN`). */
const LINK_DOWN_TEXT = "the remote host isn't reachable right now.";

/** The toast an ANNOUNCED catch-up's answer gets (it replaces "checking"). `null` = clear it. */
export function catchUpNotice(r: CatchUp): DocsNotice {
  switch (r.kind) {
    case "unchanged":
      return {
        text: "Remote docs checked: no changes.",
        kind: "info",
        autoDismissMs: CATCH_UP_TOAST_MS,
      };
    case "changed": {
      const n = r.paths.length;
      return {
        text: `Remote docs checked: ${n} ${n === 1 ? "doc" : "docs"} changed.`,
        kind: "info",
        autoDismissMs: CATCH_UP_TOAST_MS,
      };
    }
    case "link_down":
      return {
        text: `Couldn't check the remote docs: ${LINK_DOWN_TEXT}`,
        kind: "error",
      };
    case "failed":
      return {
        text: `Couldn't check the remote docs: ${r.reason}.`,
        kind: "error",
      };
    // Reachable on a return only when no earlier tick ever answered (the link was down until now):
    // nothing to compare with, but the check did complete.
    case "baseline":
      return {
        text: "Remote docs checked.",
        kind: "info",
        autoDismissMs: CATCH_UP_TOAST_MS,
      };
    // The Docs tab is gone with the gate OFF, so there is nothing to announce on.
    case "gate_off":
      return null;
  }
}

/** The toast for a catch-up whose command itself failed (a timeout, a refused key). */
export function catchUpErrorNotice(e: unknown): DocsNotice {
  return { text: `Couldn't check the remote docs: ${String(e)}`, kind: "error" };
}

/**
 * Drive a remote workspace's polling from whether its Docs panel is on screen. A no-op for a
 * local workspace (its `notify` watcher is always on and costs no remote exec).
 */
export function useRemoteDocsPolling({
  workspaceId,
  projectPath,
  onScreen,
  onNotice,
}: {
  workspaceId: string;
  projectPath: string;
  /** Centre stage AND the Docs tab fronted. */
  onScreen: boolean;
  onNotice?: (n: DocsNotice) => void;
}): void {
  const remote = !workspaceSurfaces(projectPath).fsWatch;
  // Latest-ref, so a new callback identity never re-runs the activation.
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);
  // Whether a catch-up has answered before: the next one is a RETURN, and is announced.
  const answeredRef = useRef(false);

  useEffect(() => {
    if (!remote) return;
    if (!onScreen) {
      void invoke("remote_poll_pause", { workspaceId }).catch((err) => {
        console.error(`remote_poll_pause failed for ${workspaceId}:`, err);
      });
      return;
    }
    const announce = answeredRef.current;
    if (announce) noticeRef.current?.({ text: CHECKING_TEXT, kind: "info" });
    // The WP7 review MAJOR: a catch-up whose panel went off screen before it answered is STALE. It
    // announces nothing (a late result, or the "no longer watched" its dropped waiter now gets
    // from `pause`, would land on a panel no longer in front), and its "checking…" goes with it.
    let cancelled = false;
    let settled = false;
    invoke<CatchUp>("remote_poll_catch_up", { workspaceId, projectPath }).then(
      (r) => {
        settled = true;
        // A late success still counts: the backend recorded the baseline.
        answeredRef.current = true;
        if (announce && !cancelled) noticeRef.current?.(catchUpNotice(r));
      },
      (err) => {
        settled = true;
        if (cancelled) return;
        answeredRef.current = true;
        if (announce) noticeRef.current?.(catchUpErrorNotice(err));
        else console.error(`remote_poll_catch_up failed for ${workspaceId}:`, err);
      },
    );
    return () => {
      cancelled = true;
      // Only a still-pending "checking…" goes: an answer already shown stays (a failure stays until
      // dismissed). `null` clears only a docs-owned toast (`Workspace.showDocsNotice`), so this
      // never takes down a notice something else raised meanwhile.
      if (announce && !settled) noticeRef.current?.(null);
    };
  }, [remote, onScreen, workspaceId, projectPath]);
}
