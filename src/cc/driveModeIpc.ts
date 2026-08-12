// M12 WP4c — typed IPC wrapper for the per-project workflow drive mode.
//
// Mirrors `modelOverrideIpc.ts`'s SHAPE (a thin typed wrapper, kept out of any pure
// module so the pure cores stay vitest-pinnable without a running app), and deliberately
// diverges from it in two ways that are easy to get wrong. Both are recorded here because
// the model override is the nearest precedent and reading it as a template is the natural
// mistake.
//
// ## Divergence 1 — the value set is CLOSED, and validation is not optional
// ⚠️ `modelOverride.ts`'s "do NOT add a validator" rule does NOT transfer here — copying it
// would be a correctness bug, because one bad drive-mode string fails serde on read and takes
// the WHOLE project list down, not one row. The full comparison lives at `cc/driveMode.ts`
// (the canonical statement, with the blast-radius table); it is not restated here.
//
// ## Divergence 2 — there is no getter, ON PURPOSE
// `getProjectDefaultModel` exists as a leftover; the picker does NOT call it, because
// M11.5's repair (B) removed exactly that per-row read. Each call re-read + re-parsed +
// re-sorted the whole `projects.json` for one field `list_projects` had already put on the
// wire, and filtered-out rows unmount, so clearing the filter box re-fired all N
// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
//
// So this module ships **only a setter**. The cell seeds from `recents[i].default_drive_mode`,
// which the Rust side is pinned to keep on the wire by
// `tests::the_drive_mode_is_serialized_onto_the_list_projects_wire`. ⚠️ Do not add a
// `getProjectDefaultDriveMode` "for symmetry" — the symmetry is with a mistake.
//
// ## No broadcast event, same reasoning as the model override
// The permission mode is app-global and re-broadcasts on write because it has a second
// surface (a View-menu radio) that must re-sync. This value is per-project and has exactly
// ONE surface — the picker row that just changed it — so a fan-out would have one
// subscriber. If a genuinely second surface ever appears (a workspace-header readout, a
// filmstrip badge), add the event then; note that would be a real reversal rather than an
// extension, since the operator chose the picker row specifically so this class of
// per-project spawn-time value would have one home (design prior
// `set-a-spawn-time-choice-where-the-spawn-is-chosen`).
//
// The command is registered in `src-tauri/src/lib.rs`'s invoke handler and implemented in
// `config_store/commands.rs`.

import { invoke } from "@tauri-apps/api/core";
import type { DriveMode } from "./driveMode";

// The vocabulary lives in the PURE module (`driveMode.ts`) and is re-exported here for
// callers already importing from this file.
//
// ⚠️ The direction matters and was corrected mid-build: Phase 2 first declared `DriveMode` /
// `DRIVE_MODES` *here*, which would have forced the pure module to import from an
// `invoke`-carrying one — inverting the split that makes the pure core testable without a
// running app (`modelOverride.ts` has zero imports; `modelOverrideIpc.ts` owns `invoke`).
// Values flow pure → IPC, never the reverse.
export { DRIVE_MODES } from "./driveMode";
export type { DriveMode } from "./driveMode";

/**
 * Persist (or clear, with `null`) a project's drive mode.
 *
 * Takes effect on that project's **NEXT** CC spawn: the mode is read at spawn time and
 * becomes the `CLAUDESK_DRIVE_MODE` env var that gates the `UserPromptSubmit` hook. It does
 * **not** affect an already-running session — the env of a live process is fixed, the same
 * semantics as the model override's argv.
 *
 * `null` clears the override, which removes the key from disk entirely rather than storing
 * `null`. That is what makes "no mode set" and "a project predating this feature"
 * indistinguishable, and keeps "absent → do not set the env var → the hook stays inert →
 * a plain-terminal `claude` behaves byte-identically" a single code path.
 *
 * Rejects if no project record exists for `projectPath` — there would be nothing to attach
 * the value to, and reporting success for a write that vanishes on the next read is worse
 * than an error.
 */
export async function setProjectDefaultDriveMode(
  projectPath: string,
  mode: DriveMode | null,
): Promise<void> {
  return invoke<void>("project_set_default_drive_mode", {
    path: projectPath,
    mode,
  });
}
