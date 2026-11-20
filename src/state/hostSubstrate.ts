// M18 WP4 — a remote HOST ACCOUNT's workflow substrate (`arch/claude-substrate.md` §R.1–§R.2).
//
// The open check probes it on the host (`remote_cmd::SUBSTRATE_PROBE`); `LinkRegistry` caches it
// per host and broadcasts each change as `remote-substrate`. The workflow funnel reads it as its
// third input (`isWorkflowApplicable(gate, profile, host)`), through ONE seam hook,
// `useHostSubstrate` (./useHostSubstrate.ts). Never a one-shot read (`workflow-gate.md`).
//
// Mirrors `remote_substrate::HostSubstrate` (Rust, `#[serde(tag = "state")]`).

import { invoke } from "@tauri-apps/api/core";
import { remoteAuthority } from "./workspaceSurfaces";

/** The provenance record Claudesk writes on the host when it installs (WP6). */
export interface HostInstallRecord {
  readonly clone_path: string;
  readonly installed_at: string;
  readonly origin_url: string;
}

/** A remote host account's workflow substrate. `unknown` fails CLOSED in the funnel. */
export type HostSubstrate =
  | { readonly state: "unknown" }
  | { readonly state: "absent" }
  | {
      readonly state: "developer";
      readonly root: string | null;
      readonly head: string | null;
    }
  | {
      readonly state: "managed";
      readonly root: string | null;
      readonly head: string | null;
      readonly record: HostInstallRecord;
    };

/** The `remote-substrate` event payload: one host's substrate changed. */
export interface HostSubstrateEvent {
  readonly host: string;
  readonly substrate: HostSubstrate;
}

/** Rust `remote_substrate::SUBSTRATE_EVENT`. */
export const HOST_SUBSTRATE_EVENT = "remote-substrate";

/** Never probed (or no answer). The value a remote workspace starts from. */
export const UNKNOWN_SUBSTRATE: HostSubstrate = Object.freeze({
  state: "unknown",
});

/**
 * The funnel's host input: `"local"` (always applicable), a remote host's substrate, or
 * `undefined` while not yet known. Only a hook produces one (`useHostSubstrate` /
 * `hostSubstrateFor`), never a literal at a consumer (`workflowApplicableGuard.test.ts`).
 */
export type HostInput = "local" | HostSubstrate | undefined;

/** Every probed host's substrate, by host (`remote_host_substrates`). */
export async function getHostSubstrates(): Promise<
  Record<string, HostSubstrate>
> {
  return invoke<Record<string, HostSubstrate>>("remote_host_substrates");
}

/**
 * The host input for `projectPath` from a by-host map (the picker's many rows): `"local"` for a
 * local key, the host's entry for a remote one, `undefined` (closed) when that host is not in
 * the map yet.
 */
export function hostSubstrateFor(
  projectPath: string,
  byHost: Readonly<Record<string, HostSubstrate>>,
): HostInput {
  const host = remoteAuthority(projectPath);
  if (host === null) return "local";
  return byHost[host];
}

/**
 * The host input for a remote OPEN, from the open check's own answer: the substrate the check
 * just observed (`null` = not probed → closed). ⚠️ Use this, not `hostSubstrateFor(path, map)`, on
 * the open path: the map is the last render's value, from before this check wrote the cache.
 */
export function hostFromOpenCheck(signals: {
  readonly hostSubstrate: HostSubstrate | null;
}): HostInput {
  return signals.hostSubstrate ?? undefined;
}
