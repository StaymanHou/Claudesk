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
// row — the two truth tables are asserted separately and must be changed together.

import { invoke } from "@tauri-apps/api/core";

/** The built-in profile's name (Rust `profiles::DEFAULT_PROFILE`). */
export const DEFAULT_PROFILE = "default";

/**
 * A workspace or row's profile reference: a profile NAME, `null` for the default profile, or
 * `undefined` while not yet known (no read has landed).
 */
export type ProfileReference = string | null | undefined;

/** Absent (`null`), blank, or `"default"` → the built-in profile. `undefined` is NOT default. */
export function isDefaultProfile(reference: ProfileReference): boolean {
  if (reference === undefined) return false;
  if (reference === null) return true;
  const trimmed = reference.trim();
  return trimmed === "" || trimmed === DEFAULT_PROFILE;
}

/**
 * Gate ON ∧ default profile. ⚠️ **An UNKNOWN profile (`undefined`) is NOT applicable** — fail
 * closed, the same direction the gate itself pre-seeds (`WORKFLOW_FEATURES_PRE_SEED_DEFAULT` is
 * `false`). A default workspace pays one IPC round-trip before its workflow surfaces appear; a
 * profile workspace never shows them at all, not even for a frame.
 */
export function isWorkflowApplicable(
  gateOn: boolean,
  reference: ProfileReference,
): boolean {
  return gateOn && isDefaultProfile(reference);
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
