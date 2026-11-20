// M18 WP5 — the "Remote hosts" settings group's body (`arch/claude-substrate.md` §R.4, §R.5): one
// entry per distinct host among the remote rows, with the host account's workflow substrate
// (Absent / Developer / Managed), its short HEAD, and its drift against GitHub.
//
// ## Read-only in WP5
// No buttons. Install (WP6) lands on an Absent entry; Update / Uninstall (WP7) on a Managed one.
//
// ## Background work only while shown (prior `background-work-only-for-what-is-on-screen`)
// The drift read reaches GitHub (`ls-remote` from the host, about a second), so it runs once per
// host when this group mounts, and never on open or on a timer. A result that arrives after the
// panel closed is dropped (`useRemoteHostsReadout`'s cleanup).
//
// ## Settings never brings a link up (§R.5)
// A host whose link is down is not asked at all; its entry says how to get an answer and keeps
// showing the last state this app session observed. The backend refuses the same way
// (`remote_substrate_refresh` is master-only), so this is a cost saving, not the safety.
//
// ## The state shown comes through the seam
// The substrate is read through `useHostSubstrates` (the one store every workspace reads), never
// from a one-shot copy: a refresh writes the backend cache, and the `remote-substrate` event
// updates this readout and every open workspace together.

import { useEffect, useState } from "react";
import type { HostSubstrate } from "../../state/hostSubstrate";
import {
  getRemoteHosts,
  refreshRemoteHost,
  shortSha,
  type RefreshOutcome,
  type RemoteHostEntry,
} from "../../state/remoteHosts";
import { useHostSubstrates } from "../../state/useHostSubstrate";

/** A host's refresh, as the readout tracks it. */
export type HostCheck = RefreshOutcome | { readonly outcome: "checking" };

export interface RemoteHostsReadout {
  /** `null` until the host list resolves (the group then renders nothing). */
  readonly hosts: readonly RemoteHostEntry[] | null;
  /** By host: the refresh in flight or its outcome. A host with its link down has none. */
  readonly checks: Readonly<Record<string, HostCheck>>;
}

/**
 * Load the host list, then refresh every host whose link is Up, in parallel, ONCE per mount.
 * Unmounting drops every result still in flight (no state update after the panel closed).
 */
export function useRemoteHostsReadout(): RemoteHostsReadout {
  const [hosts, setHosts] = useState<readonly RemoteHostEntry[] | null>(null);
  const [checks, setChecks] = useState<Record<string, HostCheck>>({});
  useEffect(() => {
    let cancelled = false;
    const record = (host: string, check: HostCheck) => {
      if (!cancelled) setChecks((prev) => ({ ...prev, [host]: check }));
    };
    getRemoteHosts()
      .then((list) => {
        if (cancelled) return;
        setHosts(list);
        for (const entry of list) {
          if (!entry.link_up) continue;
          record(entry.host, { outcome: "checking" });
          refreshRemoteHost(entry.host)
            .then((outcome) => record(entry.host, outcome))
            .catch((e: unknown) =>
              record(entry.host, { outcome: "failed", reason: String(e) }),
            );
        }
      })
      .catch((e: unknown) => {
        // No list, no group: a failed local read must not invent hosts.
        console.error("[claudesk] remote_hosts failed:", e);
        if (!cancelled) setHosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { hosts, checks };
}

/** One entry's text, as values (asserted directly in the tests). */
export interface HostReadoutLines {
  /** "Developer", "Managed", "Absent", or "Unknown". */
  readonly state: string;
  /** What the state means, in plain words. */
  readonly stateDetail: string;
  /** "HEAD f8e8873", when the install's HEAD is known. */
  readonly head: string | null;
  /** The install's folder on the host (the HEAD's tooltip), when known. */
  readonly root: string | null;
  /** The drift or link line, or `null` when there is nothing to say. */
  readonly drift: string | null;
}

/** The plain-words readout for one host: its substrate, its link, and its refresh. */
export function hostReadoutLines(
  substrate: HostSubstrate,
  linkUp: boolean,
  check: HostCheck | undefined,
): HostReadoutLines {
  const [state, stateDetail] = {
    unknown: ["Unknown", "not checked yet"],
    absent: ["Absent", "the workflow system isn't installed for this account"],
    developer: ["Developer", "installed by hand; Claudesk doesn't manage it"],
    managed: ["Managed", "installed by Claudesk"],
  }[substrate.state];
  const present =
    substrate.state === "developer" || substrate.state === "managed";
  const head =
    present && substrate.head ? `HEAD ${shortSha(substrate.head)}` : null;
  const root = present ? substrate.root : null;
  return { state, stateDetail, head, root, drift: driftLine(linkUp, check) };
}

function driftLine(
  linkUp: boolean,
  check: HostCheck | undefined,
): string | null {
  if (!linkUp || check?.outcome === "link_down") {
    return "Connect a workspace on this host to check.";
  }
  if (check === undefined) return null;
  switch (check.outcome) {
    case "checking":
      return "Checking GitHub…";
    case "failed":
      return `Can't check: ${check.reason}`;
    case "checked": {
      const d = check.drift;
      if (d === null) return null;
      if (d.drift === "up_to_date") return "Up to date with GitHub.";
      if (d.drift === "behind") {
        return `Behind GitHub: this host is at ${shortSha(d.head)}, GitHub at ${shortSha(d.remote)}.`;
      }
      return `Can't check: ${d.reason}`;
    }
  }
}

export function RemoteHostsSettings({
  readout,
}: {
  /** The panel's readout (it decides whether this group renders at all). */
  readout: RemoteHostsReadout;
}) {
  const hosts = readout.hosts ?? [];
  const live = useHostSubstrates(hosts.length > 0);
  return (
    <ul className="remote-hosts" data-testid="remote-hosts">
      {hosts.map((entry) => {
        const check = readout.checks[entry.host];
        // The store first (it hears every later change); then a refresh's own answer, which the
        // store also gets by event; then the list's snapshot.
        const substrate =
          live[entry.host] ??
          (check?.outcome === "checked" ? check.substrate : entry.substrate);
        const lines = hostReadoutLines(substrate, entry.link_up, check);
        return (
          <li
            key={entry.host}
            className="remote-host"
            data-testid={`remote-host-${entry.host}`}
          >
            <div className="remote-host-line">
              <span className="remote-host-name">{entry.host}</span>
              <span
                className={`remote-host-state remote-host-state-${substrate.state}`}
                data-testid="remote-host-state"
              >
                {lines.state}
              </span>
            </div>
            <p className="settings-row-help" data-testid="remote-host-detail">
              {lines.stateDetail}
              {lines.head !== null && (
                <>
                  {" · "}
                  <code title={lines.root ?? undefined}>{lines.head}</code>
                </>
              )}
            </p>
            {lines.drift !== null && (
              <p
                className="settings-row-help remote-host-drift"
                data-testid="remote-host-drift"
              >
                {lines.drift}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
