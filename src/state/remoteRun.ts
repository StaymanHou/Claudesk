// M18 WP6 + WP7 — remote runs on a host account (`arch/claude-substrate.md` §R.3): Install, Update
// and Uninstall over the host's master. The IPC shapes, the event names and the operator-facing
// copy. Mirrors `workflow_install::commands::{REMOTE_RUN_*_EVENT, RemoteRunLine, RemotePhase,
// RemoteRunView, RemoteUninstallPreview}` and `remote_runner::RemoteRunFinished` (Rust).
//
// ⚠️ WP7 D11 replaced WP6's `remote-install-*` events with ONE triple for all three ops, every
// payload carrying `host` and `op`: the old output event carried no host, so a Settings entry
// reopened mid-run could not tell whose output it was.

import { invoke } from "@tauri-apps/api/core";

/** Which remote run. */
export type RemoteOp = "install" | "update" | "uninstall";

/** One output line of a run (payload: {@link RemoteRunLine}). */
export const REMOTE_RUN_OUTPUT_EVENT = "remote-run-output";
/** A run's phase changed (payload: {@link RemotePhase}). */
export const REMOTE_RUN_PHASE_EVENT = "remote-run-phase";
/** A run ended (payload: {@link RemoteRunFinished}). */
export const REMOTE_RUN_FINISHED_EVENT = "remote-run-finished";

/**
 * `clone` (install) / `fetch` (update): Cancel is honoured. `install`: install.sh is running and
 * the run cannot be split (ruling A). An uninstall reports no phase and has no Cancel (WP7 D7).
 */
export type RemoteRunPhase = "clone" | "fetch" | "install";

export interface RemoteRunLine {
  readonly host: string;
  readonly op: RemoteOp;
  readonly line: string;
}

export interface RemotePhase {
  readonly host: string;
  readonly op: RemoteOp;
  readonly phase: RemoteRunPhase;
}

/** What a finished run MEANS; decided by the backend's reducers from a re-probe of the host. */
export interface RemoteRunFinished {
  readonly host: string;
  readonly op: RemoteOp;
  /** The run did what it was for (install/update: Managed; uninstall: Absent). */
  readonly ok: boolean;
  /** A Cancel stopped the run before it changed anything. */
  readonly cancelled: boolean;
  /** Plain words for the entry; `null` on a clean success. */
  readonly message: string | null;
}

/** The run in flight, for an entry reopened mid-run (D11). */
export interface RemoteRunView {
  readonly host: string;
  readonly op: RemoteOp;
  readonly phase: RemoteRunPhase | null;
}

/** Uninstall's preview: the guard-approved clone, and the host's own `uninstall.sh --dry-run`. */
export interface RemoteUninstallPreview {
  readonly host: string;
  readonly clone_dir: string;
  readonly preview: string;
}

/** Start a run on `host` over its open connection. Rejects with a plain-words refusal. */
export function startRemoteRun(op: RemoteOp, host: string): Promise<void> {
  const cmd = {
    install: "workflow_remote_install_start",
    update: "workflow_remote_update_start",
    uninstall: "workflow_remote_uninstall_start",
  }[op];
  return invoke<void>(cmd, { host });
}

/** Ask the install or update in flight to stop. Rejects with "Too late…" once install.sh started. */
export function cancelRemoteRun(): Promise<void> {
  return invoke<void>("workflow_remote_run_cancel");
}

/** The remote run in flight, or `null`. */
export function getRemoteRunState(): Promise<RemoteRunView | null> {
  return invoke<RemoteRunView | null>("workflow_remote_run_state");
}

/** Observe the host, run the refuse-guard, and return the dry run. Rejects with the refusal. */
export function previewRemoteUninstall(
  host: string,
): Promise<RemoteUninstallPreview> {
  return invoke<RemoteUninstallPreview>("workflow_remote_uninstall_preview", {
    host,
  });
}

/** Where the clone goes on the host, as the consent step names it. */
export const REMOTE_CLONE_PATH =
  "~/.claudesk/vendor/my-claude-code-customization";

/**
 * Everything a remote install changes on the host, in the order the consent step shows it. The
 * same facts as the local wizard's disclosures, for a host account: no directory picker (the path
 * is fixed), and the four permissions `install.sh` prints are NOT needed there (Claudesk runs
 * remote Claude Code with bypassPermissions; "Probe outcomes" (3)).
 */
export const REMOTE_CONSENT_ITEMS = [
  `Clones the companion repository (public HTTPS) to ${REMOTE_CLONE_PATH} on that host.`,
  "Runs its own install.sh there, which links its skills and agents into ~/.claude/ and adds a workflow block to ~/.claude/CLAUDE.md, for that host account only.",
  "Writes a small record (~/.claudesk/install-record.json) so Claudesk knows it installed this and can offer Uninstall later.",
  "Changes nothing on this Mac, and nothing in that account's ~/.claude/settings.json.",
  "Cancel works while the repository is cloning; once install.sh starts (about a second), the run finishes.",
] as const;

/** What an Update does on the host, in the order its confirm step shows it (WP7 D12). */
export const REMOTE_UPDATE_ITEMS = [
  `Fetches the latest version from GitHub into the clone at ${REMOTE_CLONE_PATH}.`,
  "Fast-forwards the clone. If it has local changes or commits of its own, nothing is changed and you are told why.",
  "Runs install.sh again, which refreshes the links in ~/.claude/ and the workflow block in ~/.claude/CLAUDE.md.",
  "Cancel works while fetching; once install.sh starts, the run finishes.",
] as const;

/** Uninstall's confirm step, around the host's own dry run (WP7 D12). */
export const REMOTE_UNINSTALL_INTRO =
  "Claudesk will run the host's own uninstall.sh, then delete the clone and the install record. Here is what uninstall.sh says it will remove:";
export const REMOTE_UNINSTALL_NOTE =
  "It doesn't edit that account's ~/.claude/settings.json, and changes nothing on this Mac. Uninstall can't be cancelled once it starts; it takes about a second.";

/** The Cancel button's label once install.sh has started. */
export const FINISHING_LABEL: Record<"install" | "update", string> = {
  install: "Finishing the install…",
  update: "Finishing the update…",
};
