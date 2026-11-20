// M18 WP5 — Settings → Remote hosts: the IPC shapes and the group's id (`arch/claude-substrate.md`
// §R.4, §R.5). Mirrors `remote_link::commands::{RemoteHostEntry, RefreshOutcome}` and
// `remote_substrate::Drift` (Rust).
//
// The group's id lives here, not in the settings component, because the absent-host note in a
// workspace routes to it (WP5 task 5.2b) and a workspace must not import a settings module.

import { invoke } from "@tauri-apps/api/core";
import type { HostSubstrate } from "./hostSubstrate";

/** The Settings group id the absent-host note lands on. */
export const REMOTE_HOSTS_GROUP_ID = "remote-hosts";

/** One distinct host among the valid remote rows (`remote_hosts`). */
export interface RemoteHostEntry {
  readonly host: string;
  /** The host's link is Up now. Settings never brings one up, so a down host is not asked. */
  readonly link_up: boolean;
  /** The last substrate this app session observed (`unknown` when never probed). */
  readonly substrate: HostSubstrate;
}

/** The host clone against GitHub. `differs`: the two HEADs differ (no fetch, §R.4). */
export type Drift =
  | {
      readonly drift: "up_to_date";
      readonly head: string;
      readonly remote: string;
    }
  | {
      readonly drift: "differs";
      readonly head: string;
      readonly remote: string;
    }
  | { readonly drift: "cant_check"; readonly reason: string };

/** What one refresh of a host found (`remote_substrate_refresh`). */
export type RefreshOutcome =
  | {
      readonly outcome: "checked";
      readonly substrate: HostSubstrate;
      /** `null` when there is nothing to compare (absent or unknown). */
      readonly drift: Drift | null;
    }
  | { readonly outcome: "link_down" }
  | { readonly outcome: "failed"; readonly reason: string };

/** The hosts Settings → Remote hosts lists; empty when there is no valid remote row. */
export function getRemoteHosts(): Promise<RemoteHostEntry[]> {
  return invoke<RemoteHostEntry[]>("remote_hosts");
}

/** Re-probe `host` and read its drift, over its already-Up link (one exec). */
export function refreshRemoteHost(host: string): Promise<RefreshOutcome> {
  return invoke<RefreshOutcome>("remote_substrate_refresh", { host });
}

/** A git object name as the readout prints it. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
