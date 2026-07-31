// M11.5 WP1 — typed IPC wrappers for the per-project CC model override.
//
// Deliberately SEPARATE from `modelOverride.ts`, which is the pure (no React / no Tauri
// IPC) core holding the normalization rule and the alias hints so they stay vitest-pinnable
// without a running app. Adding `invoke` there would break that contract — so the wire
// calls live here, mirroring `permissionModeIpc.ts` and `state/workflowGate.ts`.
//
// ## Note the shape difference from `permissionModeIpc.ts`
// The permission mode is **app-global**: one value, and the backend re-broadcasts a
// `cc-permission-mode` event on write so every surface reflecting it re-syncs. The model
// override is **per-project**: each call is keyed by `projectPath`, and there is
// deliberately NO broadcast event — a workspace header is the only surface showing a given
// project's value, and it is the surface that just changed it. If a second surface ever
// displays this (a picker-row badge, say), add the event then rather than pre-building a
// fan-out with one subscriber.
//
// The commands are registered in `src-tauri/src/lib.rs`'s invoke handler and implemented in
// `config_store/commands.rs`.

import { invoke } from "@tauri-apps/api/core";

/**
 * Read a project's persisted model override. `null` = the project inherits CC's own default
 * model (also the answer for a path with no stored record, so a caller never has to
 * special-case an unknown project).
 */
export async function getProjectDefaultModel(
  projectPath: string,
): Promise<string | null> {
  return invoke<string | null>("project_get_default_model", {
    path: projectPath,
  });
}

/**
 * Persist (or clear, with `null`) a project's model override.
 *
 * Takes effect on that project's **NEXT** CC spawn — argv is fixed once per process, the
 * same semantics as the app-global permission mode. Rejects if no project record exists for
 * `projectPath` (there would be nothing to attach the value to, and reporting success for a
 * write that vanishes on the next read is worse than an error).
 */
export async function setProjectDefaultModel(
  projectPath: string,
  model: string | null,
): Promise<void> {
  return invoke<void>("project_set_default_model", {
    path: projectPath,
    model,
  });
}
