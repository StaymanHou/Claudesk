// M18 WP6 — Install over the master (`arch/claude-substrate.md` §R.3): the IPC shapes, event names
// and the consent copy. Mirrors `workflow_install::commands::{REMOTE_INSTALL_*_EVENT, RemotePhase}`
// and `workflow_install::remote_runner::RemoteInstallFinished` (Rust).

import { invoke } from "@tauri-apps/api/core";

/** One non-sentinel output line of the run (payload: the line). */
export const REMOTE_INSTALL_OUTPUT_EVENT = "remote-install-output";
/** The run's phase changed (payload: {@link RemotePhase}). */
export const REMOTE_INSTALL_PHASE_EVENT = "remote-install-phase";
/** The run ended (payload: {@link RemoteInstallFinished}). */
export const REMOTE_INSTALL_FINISHED_EVENT = "remote-install-finished";

/** `clone`: Cancel is honoured. `install`: install.sh is running and the run cannot be split. */
export type RemoteInstallPhase = "clone" | "install";

export interface RemotePhase {
  readonly host: string;
  readonly phase: RemoteInstallPhase;
}

/** What a finished run MEANS; decided by the backend's reducer from a re-probe of the host. */
export interface RemoteInstallFinished {
  readonly host: string;
  /** The host now reads as installed by Claudesk. */
  readonly ok: boolean;
  /** A Cancel stopped the run before anything was installed. */
  readonly cancelled: boolean;
  /** Plain words for the entry; `null` on a clean success. */
  readonly message: string | null;
}

/** Start an install on `host` over its open connection. Rejects with a plain-words refusal. */
export function startRemoteInstall(host: string): Promise<void> {
  return invoke<void>("workflow_remote_install_start", { host });
}

/** Ask the run in flight to stop. Rejects with "Too late…" once install.sh has started. */
export function cancelRemoteInstall(): Promise<void> {
  return invoke<void>("workflow_remote_install_cancel");
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

/** The Cancel button's label once install.sh has started. */
export const FINISHING_LABEL = "Finishing the install…";
