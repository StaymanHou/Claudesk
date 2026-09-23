// M14 WP0 Phase 2 — the per-project supervisor toggle's IPC pair.
//
// ⚠️ **A SEPARATE MODULE FROM `driveModeIpc.ts`, not a pair of functions bolted onto it.** That
// module's header carries a specific caution about per-ROW reads (M11.5's repair (B) removed
// them), and its two getters answer *stored vs running* — a distinction this value does not have,
// because the supervisor consults it at fire time rather than baking it into the spawn. Merging
// them would invite a reader to assume this value has a "running" counterpart it must reconcile.
// It does not.
//
// ⚠️ **"At fire time" is the READ, not the FRESHNESS.** The supervisor reads a ref on every turn
// end, but `Workspace.tsx` refills that ref from disk only on a `visible` edge and on this
// workspace's own toggle write. That is complete today because the workspace toggle is the ONLY
// writer (one surface, no broadcast — below) and `WorkspaceRegistry` is 1:1 by path, so no
// background workspace can hold a value that differs from disk. A second writer, or two
// workspaces on one tree (F-b), breaks that — then re-read on turn end or broadcast.
//
// ⚠️ **THERE IS NO BROADCAST EVENT, AND THAT IS DELIBERATE.** `driveModeIpc` has one because the
// drive mode has TWO surfaces to keep in sync (picker row + workspace header). This value has
// exactly ONE (the workspace header, spec decision D-3), so a fan-out would have a single
// consumer — the component that just wrote it. The Rust command's doc records the same decision
// and the condition that would reverse it (a second surface appearing).

import { invoke } from "@tauri-apps/api/core";

/**
 * Read whether the workflow supervisor may act on this project.
 *
 * ⚠️ **Never rejects, and degrades to `true`.** The backend answers `true` on every failure path
 * — unresolvable data dir, unreadable list, no project record — because the ruled default is ON
 * and a degraded read that answered `false` would silently unsupervise a project for reasons the
 * operator can neither see nor fix. This wrapper adds a `.catch` for the IPC layer itself so a
 * transport failure lands in the same direction rather than rejecting into a caller that has no
 * error surface.
 */
export async function getProjectSupervisorEnabled(
  projectPath: string,
): Promise<boolean> {
  return invoke<boolean>("project_get_supervisor_enabled", {
    path: projectPath,
  }).catch(() => true);
}

/**
 * Set whether the workflow supervisor may act on this project.
 *
 * ⚠️ **Rejects when no project record exists** — mirroring `setProjectDefaultDriveMode`. Writing
 * a setting that vanishes on the next read is worse than an error, because the operator would
 * click a toggle that silently does nothing. The caller surfaces the failure and reverts its
 * optimistic state.
 */
export async function setProjectSupervisorEnabled(
  projectPath: string,
  enabled: boolean,
): Promise<void> {
  return invoke<void>("project_set_supervisor_enabled", {
    path: projectPath,
    enabled,
  });
}
