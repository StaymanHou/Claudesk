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
// ## Divergence 2 — the PICKER has no getter, ON PURPOSE
// `getProjectDefaultModel` exists as a leftover; the picker does NOT call it, because
// M11.5's repair (B) removed exactly that per-row read. Each call re-read + re-parsed +
// re-sorted the whole `projects.json` for one field `list_projects` had already put on the
// wire, and filtered-out rows unmount, so clearing the filter box re-fired all N
// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
//
// The cell seeds from `recents[i].default_drive_mode`, which the Rust side is pinned to keep
// on the wire by `tests::the_drive_mode_is_serialized_onto_the_list_projects_wire`. ⚠️ Do not
// add a per-row getter call to the picker "for symmetry" — that symmetry is with a mistake.
//
// ⚠️ **NARROWED at M13.5 WP4 (this header previously said "this module ships only a setter").**
// `getProjectDefaultDriveMode` now exists, for the WORKSPACE surface — a different shape, not a
// reversal. The rule above is about **per-picker-row** reads (20+ rows, remounting on every
// filter keystroke); a workspace is one read per open workspace, on a gated + visible-only path,
// and the workspace model carries no project record to seed from. The alternative — threading
// the mode through `openWorkspace`'s argument list — walks into the arity trap that has dropped
// a parameter four times this milestone (`pickerOnOpenArity.test.ts` exists for it). The Rust
// command's doc comment carries the full reasoning; it is not restated at the call site.
//
// ## The broadcast event — ADDED at M13.5 WP4 P3.1, on this comment's own terms
// ⚠️ **This block previously said "No broadcast event."** It also named the exact condition for
// adding one: *"If a genuinely second surface ever appears (a workspace-header readout, a
// filmstrip badge), add the event then."* WP4 added the workspace-header readout, so
// `PROJECT_DRIVE_MODE_EVENT` now exists and BOTH surfaces subscribe. Leaving the old text would
// have made this module lie about its own design.
//
// The permission mode is the precedent for two-surfaces-one-value (persist → `app.emit` → all
// surfaces re-render), and the model override's no-event pattern is now the WRONG template here.
//
// ⚠️ **One thing does NOT carry over from the permission mode: the payload shape.** That value is
// app-global, so it broadcasts a bare enum. This one is PER-PROJECT, so the payload carries
// `{path, mode}` — a bare mode would tell every open workspace to adopt one project's change.
// A subscriber MUST compare the path before applying.
//
// The original placement decision still stands and is not reopened by this: the picker row is
// still where a spawn-time value is CHOSEN (design prior
// `set-a-spawn-time-choice-where-the-spawn-is-chosen`). WP4's reversal is that the mode is also
// live-reconfigurable — the untested edge that prior's own `Why:` names — which is what earns
// the second surface and therefore the sync path.
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

/**
 * Read one project's **stored** drive mode — what its NEXT CC spawn will use.
 *
 * ⚠️ **The STORED value, never the running one.** What the live session actually spawned under
 * is {@link getSessionDriveMode}; a live process's environment is fixed, so the two disagree the
 * moment the operator changes the mode mid-session. That disagreement is precisely what the
 * workspace readout must surface — reading this one and labelling it "this session's mode" is
 * the confabulation the pair exists to prevent.
 *
 * ⚠️ **Not for the picker.** See this module's header: per-row reads are the shape M11.5's
 * repair (B) removed. This is for the workspace surface, one read per open workspace.
 *
 * Never rejects for a missing project or an unreadable list — the backend yields `null`, because
 * a missing readout costs a label while a rejected `invoke` would put an error toast on an
 * advisory surface.
 */
export async function getProjectDefaultDriveMode(
  projectPath: string,
): Promise<DriveMode | null> {
  return invoke<DriveMode | null>("project_get_default_drive_mode", {
    path: projectPath,
  });
}

/**
 * Read the **effective drive mode a running session spawned under** — `null` when it received no
 * `CLAUDESK_DRIVE_MODE` at all (gate off, no project mode, a degraded read, or a shell session).
 *
 * ⚠️ **Post-gate by construction** (M13.5 WP4 P1): the backend retains what
 * `resolve_cc_spawn_env` actually resolved, not the stored value. So `null` here means "this
 * session is running under no Claudesk-supplied mode", which is a different fact from "the
 * project pins no mode" — a project CAN pin one that a gate-off session never received.
 *
 * Rejects for an unknown session id rather than returning `null`: "no such session" and "a
 * session running under no mode" are different answers, and collapsing them would let the UI
 * render a confident readout for a workspace whose session is gone.
 */
export async function getSessionDriveMode(
  sessionId: string,
): Promise<DriveMode | null> {
  return invoke<DriveMode | null>("cc_drive_mode", { sessionId });
}

/**
 * The Tauri event broadcast when any project's drive mode changes (M13.5 WP4 P3.1).
 *
 * ⚠️ Mirrors Rust's `config_store::commands::PROJECT_DRIVE_MODE_EVENT` — the two literals are
 * separately declared and pinned against each other by `driveModeIpc.test.ts`.
 */
export const PROJECT_DRIVE_MODE_EVENT = "project-drive-mode";

/**
 * The {@link PROJECT_DRIVE_MODE_EVENT} payload.
 *
 * ⚠️ **`path` is load-bearing, not informational.** This value is per-project, so a subscriber
 * must compare `path` against its own project before applying `mode`. Skipping that check makes
 * one project's change silently rewrite every open workspace's readout — the reason this payload
 * diverges from the permission mode's bare-enum shape.
 */
export interface ProjectDriveModeChanged {
  readonly path: string;
  readonly mode: DriveMode | null;
}
