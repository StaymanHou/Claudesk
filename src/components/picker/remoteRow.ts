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
 * WP2 stub: opening a remote row does nothing yet, through EITHER door (the row and `⊘`), and says
 * so. Returns the toast text, or `null` for a local row (open normally). The terminal arrives in
 * WP3; until then a click must neither mint an empty workspace nor stamp `record_open`.
 */
export function remoteOpenRefusal(
  r: Pick<RecentProject, "remote"> | undefined,
): string | null {
  if (r?.remote == null) return null;
  return `Remote workspaces can't be opened yet: ${r.remote.host} is saved, and opening it arrives in a later build.`;
}
