// M17 WP2 — pure helpers for a REMOTE picker row (a project whose CC session runs on another Mac
// over SSH; `arch/remote-workspaces.md` §A).
//
// ⚠️ A remote row's `project_path` is its `ssh://host/abs/path` IDENTITY KEY, not a path anyone
// should read. Every path-keyed IPC (remove, record_open, model / drive mode) uses it unchanged.
//
// How a remote row READS (operator ruling, WP2 P3.verify-human.2, 2026-11-16): the path line shows
// the REMOTE PATH only, and the marker on the name's line shows the SHORT host (`⇄ mini-host`)
// with the full `user@host` in its tooltip. The first version showed `user@host:path` on the path
// line, and a Tailscale MagicDNS host then truncated the path, which is the part that tells
// projects apart, so it never showed.
import type { RecentProject } from "./ProjectPicker";
import {
  predictAction,
  type AnnounceMap,
  type AnnouncedAction,
} from "../../state/predictAction";
import type { ConfirmSpec } from "../workspace/editor/confirmDialog";

/** Whether this row runs on another host. The one predicate every remote branch asks. */
export function isRemoteRow(r: Pick<RecentProject, "remote">): boolean {
  return r.remote != null;
}

/** The path line a row shows: the REMOTE path for a remote row, the local path otherwise. */
export function pathLineFor(
  r: Pick<RecentProject, "remote" | "project_path">,
): string {
  return r.remote != null ? r.remote.path : r.project_path;
}

/**
 * The host as the marker shows it: `user@` dropped, then cut at the first `.` so a MagicDNS name
 * (`mini-host.tail0000.ts.net`) reads as `mini-host`. An IP address or a bracketed IPv6
 * literal is kept whole, since cutting either would be meaningless.
 */
export function shortHost(host: string): string {
  const bare = host.includes("@")
    ? host.slice(host.lastIndexOf("@") + 1)
    : host;
  if (bare.startsWith("[") || /^[0-9.]+$/.test(bare)) return bare;
  const dot = bare.indexOf(".");
  return dot > 0 ? bare.slice(0, dot) : bare;
}

/** What the filter matches for a row beyond its name and key: `user@host:path` for a remote row. */
export function remoteSearchText(r: Pick<RecentProject, "remote">): string {
  return r.remote != null ? `${r.remote.host}:${r.remote.path}` : "";
}

/**
 * M17 WP3/WP5 — mirrors `remote_link::commands::OpenCheck`: the picker's pre-open check, which
 * since WP5 also DECIDES what the open does (AC-3), from the remote (folder, live session) and
 * Claudesk's local record of that session.
 */
export type RemoteOpenCheck =
  | ({ kind: "start" } & RemoteStartSignals)
  | { kind: "reconnect"; mode: string | null }
  | { kind: "ask-end-pending"; message: string }
  | { kind: "ask-unrecorded"; message: string }
  | { kind: "folder-missing"; message: string }
  | { kind: "unreachable"; message: string }
  | { kind: "invalid"; message: string };

/**
 * M17 WP5 Phase 2 — mirrors `remote_link::commands::StartSignals`: the resume signals of a DEAD
 * remote session, read by the open check at click time (AC-3.3). Each reads `false` when it could
 * not be read (a fresh session is the safe side).
 */
export type RemoteStartSignals = {
  /** The LOCAL unclean-exit flag for the row (the spawn consumes it, not the check). */
  uncleanFlag: boolean;
  /** The REMOTE `workflow-system/state/.session.md` exists (`false` with the gate off). */
  sessionMd: boolean;
  /** The remote Claude Code has trusted the folder (its physical path or an ancestor). */
  trusted: boolean;
};

/**
 * The announced value a remote START resolves to, from the check's signals. ⚠️ The precedence
 * rule is NOT re-stated here: {@link predictAction} decides the arm, and this only maps the arm
 * (plus the remote trust answer) onto the wire vocabulary the picker's `rowAffordances` already
 * reads. So the remote click goes through the SAME gate and door logic as a local row, from
 * signals read at click time rather than from the row's label (which, for a remote row, comes
 * from the local record and cannot know the remote `.session.md`).
 */
export function startAnnounced(
  signals: RemoteStartSignals,
): AnnouncedAction | undefined {
  const action = predictAction({
    uncleanFlag: signals.uncleanFlag,
    sessionMdPresent: signals.sessionMd,
  });
  if (action === null) return undefined;
  switch (action.kind) {
    case "argv":
      return "continue";
    case "inject":
      return signals.trusted ? "restore" : "restore-manual";
  }
}

/** What the picker does with a remote row's open check. */
export type RemoteOpenPlan =
  /**
   * Start CC through the two-signal rule. `announce` is a one-row map for the row, built from the
   * check's signals: the click derives its action from it, never from the picker's map.
   */
  | { open: "start"; announce: AnnounceMap }
  /** Attach to the live session Claudesk left running: fire nothing (R-2). */
  | { open: "reconnect" }
  /**
   * M17 WP5 (R-4) — a live session the picker must ASK about before opening: `end-pending`
   * (dialog A: closed while the host was unreachable) or `unrecorded` (dialog B: Claudesk has no
   * record of starting it). Never joined or ended without the operator's answer (A8).
   */
  | { open: "ask"; kind: RemoteAskKind; message: string }
  /**
   * Open nothing; show `message`, offering Remove when `offerRemove` (a missing folder) or Retry
   * when `offerRetry` (an unreachable host, AC-5.4).
   */
  | { open: null; message: string; offerRemove: boolean; offerRetry: boolean };

/** Which R-4 dialog a live session needs. */
export type RemoteAskKind = "end-pending" | "unrecorded";

/** What the operator picks in an R-4 dialog. */
export type RemoteAskChoice = "end" | "reconnect" | "cancel";

/**
 * M17 WP5 (AC-5.1 / AC-5.2) — the R-4 dialog for a live remote session, from the open check's
 * plain-words `message`. Esc / backdrop → Cancel (opens nothing, changes nothing).
 *
 * - **A, closed while offline:** End it and open (default: it carries out the close the operator
 *   asked for) / Reconnect / Cancel.
 * - **B, unrecorded:** Reconnect (default: ending a session Claudesk did not start is the
 *   riskier act) / End it and start fresh / Cancel.
 */
export function remoteAskSpec(
  kind: RemoteAskKind,
  message: string,
): ConfirmSpec<RemoteAskChoice> {
  const cancel = {
    id: "remote-ask-cancel",
    label: "Cancel",
    value: "cancel" as const,
  };
  return kind === "end-pending"
    ? {
        title: "Still running on the host",
        message,
        buttons: [
          {
            id: "remote-ask-end",
            label: "End it and open",
            value: "end",
            variant: "primary",
          },
          {
            id: "remote-ask-reconnect",
            label: "Reconnect",
            value: "reconnect",
          },
          cancel,
        ],
        escValue: "cancel",
      }
    : {
        title: "Already running on the host",
        message,
        buttons: [
          {
            id: "remote-ask-reconnect",
            label: "Reconnect",
            value: "reconnect",
            variant: "primary",
          },
          {
            id: "remote-ask-end",
            label: "End it and start fresh",
            value: "end",
            variant: "danger",
          },
          cancel,
        ],
        escValue: "cancel",
      };
}

/**
 * The plan for a remote row's open check. ⚠️ Only a MISSING FOLDER offers Remove, and only as an
 * offer: an unreachable host must never look like a deleted project, and nothing is removed by
 * itself (`SURFACE-2026-11-16-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS`).
 *
 * The two `ask-*` kinds (R-4) ask before anything opens ({@link remoteAskSpec}); an unreachable
 * host offers Retry, never anything else (AC-5.4).
 */
export function remoteOpenPlan(
  projectPath: string,
  check: RemoteOpenCheck,
): RemoteOpenPlan {
  switch (check.kind) {
    case "start": {
      const announced = startAnnounced(check);
      return {
        open: "start",
        announce: announced === undefined ? {} : { [projectPath]: announced },
      };
    }
    case "reconnect":
      return { open: "reconnect" };
    case "folder-missing":
      return {
        open: null,
        message: check.message,
        offerRemove: true,
        offerRetry: false,
      };
    case "ask-end-pending":
      return { open: "ask", kind: "end-pending", message: check.message };
    case "ask-unrecorded":
      return { open: "ask", kind: "unrecorded", message: check.message };
    case "unreachable":
      return {
        open: null,
        message: check.message,
        offerRemove: false,
        offerRetry: true,
      };
    case "invalid":
      return {
        open: null,
        message: check.message,
        offerRemove: false,
        offerRetry: false,
      };
  }
}
