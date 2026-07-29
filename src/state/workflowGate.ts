// M10.9 WP2 — the frontend binding for the workflow-features opt-in gate.
//
// Typed wrappers over the two `workflow_gate` commands plus the broadcast event name.
// The CONSUMPTION SEAM that gated surfaces actually use is the
// `useWorkflowFeaturesEnabled` hook (useWorkflowFeaturesEnabled.ts) — this module is
// the raw binding underneath it. A gated surface should import the hook, never these
// helpers directly (see the seam contract in the hook's header).
//
// The event literal is a CROSS-LANGUAGE CONTRACT with
// `workflow_gate::commands::WORKFLOW_FEATURES_ENABLED_EVENT`. Both sides are pinned:
// Rust by `event_name_is_the_pinned_cross_language_string`, TS by the ?raw guard in
// __tests__/workflowGateContract.test.ts. A drift on either side silently desyncs every
// mirror surface — the listener just never fires, which looks like "the toggle didn't
// stick" at runtime and ships green.

import { invoke } from "@tauri-apps/api/core";

/** Broadcast fired by `workflow_set_features_enabled` when the gate changes. Must match
 *  `workflow_gate::commands::WORKFLOW_FEATURES_ENABLED_EVENT` byte-for-byte. */
export const WORKFLOW_FEATURES_ENABLED_EVENT = "workflow-features-enabled";

/**
 * The value the seam reports before the persisted setting has been read.
 *
 * Deliberately `false`, and deliberately a named constant rather than an inline
 * literal: the async seed leaves a window between mount and resolution, and defaulting
 * ON there would flash a gated surface for every user during startup — violating the
 * OFF invariant in the one window nobody tests. Naming it makes the choice reviewable
 * and lets the contract test assert it directly rather than through a running React
 * tree (this repo has no DOM test environment — pure logic → vitest, live DOM → the
 * MCP bridge).
 */
export const WORKFLOW_FEATURES_PRE_SEED_DEFAULT = false;

/** Read the persisted gate. Defaults to `false` backend-side when never set. */
export async function getWorkflowFeaturesEnabled(): Promise<boolean> {
  return invoke<boolean>("workflow_get_features_enabled");
}

/** Persist the gate. The backend re-broadcasts on success, so every subscribed surface
 *  re-syncs. Writes ONLY Claudesk's own settings.json — never `~/.claude/`. */
export async function setWorkflowFeaturesEnabled(
  enabled: boolean,
): Promise<void> {
  return invoke<void>("workflow_set_features_enabled", { enabled });
}
