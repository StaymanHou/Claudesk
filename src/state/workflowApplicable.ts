// F-b ruling 4 — **the workflow layer exists only for the DEFAULT profile.**
//
// A non-default profile (a named `CLAUDE_CONFIG_DIR`) carries none of the companion workflow
// skills — the `original` profile says so outright — so the supervisor, the skill row, the
// `/session-restore` inject arm, the drive-mode cell/readout and the gated docs panel must not
// exist for it, regardless of `workflow_features_enabled`. Absent, not greyed: the same rule the
// gate itself follows.
//
// ⚠️ **THE ONE FUNNEL.** Every per-workspace or per-row call of `useWorkflowFeaturesEnabled()`
// must be wrapped directly — `isWorkflowApplicable(useWorkflowFeaturesEnabled(), profile)` — and
// `workflowApplicableGuard.test.ts` enforces that shape at every call site. App-wide consumers
// (the invite, Settings) are on that test's allowlist, and the allowlist is checked in reverse.
//
// Mirrors `config_store::profiles::{is_default_reference, workflow_applicable}` in Rust, row for
// row — the two truth tables are asserted separately and must be changed together. M18 WP4: the
// third input is the HOST (`HostInput`, ./hostSubstrate.ts): local, or a remote host's substrate.

import { invoke } from "@tauri-apps/api/core";
import type { HostInput } from "./hostSubstrate";

/** The built-in profile's name (Rust `profiles::DEFAULT_PROFILE`). */
export const DEFAULT_PROFILE = "default";

/**
 * A workspace or row's profile reference: a profile NAME, `null` for the default profile, or
 * `undefined` while not yet known (no read has landed).
 */
export type ProfileReference = string | null | undefined;

/**
 * A blank or `"default"` NAME is the built-in profile — the frontend's one copy of that rule.
 * Callers differ only in what an absent reference means, so they share this core, not a wrapper.
 */
export function isDefaultProfileName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === "" || trimmed === DEFAULT_PROFILE;
}

/** Absent (`null`), blank, or `"default"` → the built-in profile. `undefined` is NOT default. */
export function isDefaultProfile(reference: ProfileReference): boolean {
  if (reference === undefined) return false;
  if (reference === null) return true;
  return isDefaultProfileName(reference);
}

/**
 * Gate ON ∧ default profile ∧ (local ∨ the host has the workflow system) — M18 WP4 adds the
 * third input (`arch/claude-substrate.md` §R.1). ⚠️ **An UNKNOWN profile (`undefined`) is NOT
 * applicable**, and neither is an unknown host (`undefined`, or a substrate in state `unknown`)
 * — fail closed, the same direction the gate itself pre-seeds
 * (`WORKFLOW_FEATURES_PRE_SEED_DEFAULT` is `false`). A default local workspace pays one IPC
 * round-trip before its workflow surfaces appear; a profile workspace, or one on a skill-less
 * host, never shows them at all, not even for a frame.
 *
 * ⚠️ `host` comes ONLY from `useHostSubstrate(path)` / `hostSubstrateFor(path, map)`, never a
 * literal `"local"` at a consumer (`workflowApplicableGuard.test.ts`): a literal would make a
 * remote workspace read as local, which is exactly the hole this input closes.
 */
export function isWorkflowApplicable(
  gateOn: boolean,
  reference: ProfileReference,
  host: HostInput,
): boolean {
  return gateOn && isDefaultProfile(reference) && isHostApplicable(host);
}

/** The host half of the funnel: local, or a substrate that is present (Managed / Developer). */
function isHostApplicable(host: HostInput): boolean {
  if (host === "local") return true;
  if (host === undefined) return false;
  return host.state === "developer" || host.state === "managed";
}

/**
 * M18 WP4 (D8) — the ONE other accepted wrapper of the raw gate: the workflow layer WOULD apply
 * here (gate ON, default profile) but the workspace's REMOTE host does not have it, or has not
 * answered. Drives the absent-host note — never a workflow surface itself.
 */
export function isWorkflowHostBlocked(
  gateOn: boolean,
  reference: ProfileReference,
  host: HostInput,
): boolean {
  return (
    gateOn &&
    isDefaultProfile(reference) &&
    host !== "local" &&
    !isHostApplicable(host)
  );
}

/** A project row's STORED profile reference (`null` = default, or no record). */
export async function getProjectProfile(
  projectPath: string,
): Promise<string | null> {
  return invoke<string | null>("project_get_profile", { path: projectPath });
}

/**
 * The profile a LIVE session spawned under (`null` = default). Rejects for an unknown session id.
 * ⚠️ This, not the stored row value, is the truth once a session exists: a respawn re-reads
 * `projects.json`, so the row can change under a running workspace.
 */
export async function getSessionProfile(
  sessionId: string,
): Promise<string | null> {
  return invoke<string | null>("cc_session_profile", { sessionId });
}
