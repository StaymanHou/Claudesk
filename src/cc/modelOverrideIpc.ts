// M11.5 WP1 — typed IPC wrappers for the per-project CC model override.
//
// Deliberately SEPARATE from `modelOverride.ts`, which is the pure (no React / no Tauri
// IPC) core holding the normalization rule and the alias hints so they stay vitest-pinnable
// without a running app. Adding `invoke` there would break that contract — so the wire
// calls live here, mirroring `permissionModeIpc.ts` and `state/workflowGate.ts`.
//
// ## Note the shape difference from `permissionModeIpc.ts`
// The permission mode is **app-global**: one value, and the backend re-broadcasts a
// `cc-permission-mode` event on write so every surface reflecting it re-syncs (its second
// surface — a View-menu radio — is what makes that fan-out earn its keep). The model
// override is **per-project**: each call is keyed by `projectPath`, and there is
// deliberately NO broadcast event, because **the picker row is the only surface showing a
// given project's value, and it is the surface that just changed it** — a fan-out would
// have exactly one subscriber.
//
// If a genuinely second surface is ever added (a workspace-header readout, a filmstrip tile
// badge), add the event *then*. Note that would be a real reversal, not an extension: the
// operator rejected a workspace-header control at Phase 2 verify-human specifically so this
// value would have ONE home — see design prior
// `set-a-spawn-time-choice-where-the-spawn-is-chosen`.
//
// The commands are registered in `src-tauri/src/lib.rs`'s invoke handler and implemented in
// `config_store/commands.rs`.

import { invoke } from "@tauri-apps/api/core";

// ## There is deliberately NO read wrapper here (removed at the 2026-08-12 paydown sweep)
//
// A `getProjectDefaultModel` once wrapped a `project_get_default_model` command. The M11.5
// repair (B) that fixed the picker's per-row IPC N+1 removed its last caller: `default_model`
// now arrives on the project-list payload and seeds each row through the `seedModel` prop, so
// the read never crosses the wire per row. The wrapper and its backend command then sat
// registered with zero callers for two milestones.
//
// ⚠️ Do not re-add one to "read a project's model" — that IS the N+1 coming back. Take the
// value from the row payload. The Rust-side `config_store::read_default_model` is unrelated
// and still live: `cc_session` reads it at spawn time, in-process, off the IPC surface.

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
