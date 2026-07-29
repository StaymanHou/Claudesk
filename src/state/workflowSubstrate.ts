// M10.9 WP3 — frontend bindings for the workflow-substrate detection + the invite's
// one-time lifecycle marker.
//
// Sibling to `workflowGate.ts` (the gate's binding). Kept separate for the same reason the
// Rust modules are separate: `workflow_gate` carries a standing guard that fails if its
// production code so much as names `.claude`/`skills`/`HOME`, and this surface necessarily
// concerns that tree. Keeping the frontend split mirrored to the backend split means the
// two halves stay legible as one feature.
//
// READ-ONLY detection. `install.sh`/`uninstall.sh` are never invoked from here — WP3.5's
// wizards own that, in their own module with a sandbox fixture and a refuse-guard.

import { invoke } from "@tauri-apps/api/core";

/**
 * How the one-time invite was resolved, or `null` when never resolved.
 *
 * The wire strings are a cross-language contract with the Rust `WorkflowInviteOutcome`
 * enum; both directions are pinned by the contract tests in
 * `state/__tests__/workflowInviteState.test.ts`. The canonical TYPE lives in
 * `workflowInviteState.ts` (the pure module) — re-exported here so a caller wiring IPC
 * doesn't need to import from two places.
 */
export type { WorkflowInviteOutcome } from "./workflowInviteState";

import type { WorkflowInviteOutcome } from "./workflowInviteState";

/**
 * Does the companion workflow system appear to be installed under `~/.claude/skills/`?
 *
 * Read-only `stat` — the backend never creates the directory (an auto-created empty
 * `skills/` would read as INSTALLED to every later check, including this one). The backend
 * returns a plain bool and never an error, so this cannot reject: an unresolvable `HOME`
 * reports `false`, which surfaces install instructions rather than breaking the panel.
 */
export async function getWorkflowSubstrateInstalled(): Promise<boolean> {
  return invoke<boolean>("workflow_substrate_installed");
}

/** Read the invite's persisted outcome. `null` = never resolved (the invite may still show). */
export async function getWorkflowInvite(): Promise<WorkflowInviteOutcome | null> {
  return invoke<WorkflowInviteOutcome | null>("workflow_get_invite");
}

/**
 * Record how the invite was resolved.
 *
 * Note which button does NOT call this: `[Later]`. It persists nothing, leaving the setting
 * `null` so the invite returns next launch — a `[Later]` that wrote here would silently
 * become a `[Dismiss]`. Passing `null` is reachable only from the dev-only reset seam.
 *
 * Writes Claudesk's own `settings.json` and nothing else.
 */
export async function setWorkflowInvite(
  outcome: WorkflowInviteOutcome | null,
): Promise<void> {
  return invoke<void>("workflow_set_invite", { outcome });
}
