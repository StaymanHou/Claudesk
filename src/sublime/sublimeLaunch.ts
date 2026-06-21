// WP8 — external Sublime launch helpers.
//
// Extracted from the (now-deleted) SublimeToolbar when both launchers moved into
// the RightPanelHost panel tab row. Each helper invokes its backend command with
// the workspace's project path and SURFACES a rejection (console.error) rather
// than dead-clicking — the WP6 picker lesson.
//
// The Tauri `invoke` is injected (defaulting to the real one) so the two helpers
// are unit-testable without mocking the module — matching this codebase's
// pure-core test convention (no `vi.mock` anywhere else).

import { invoke } from "@tauri-apps/api/core";

/** The subset of Tauri's `invoke` these helpers use; injectable for tests. */
export type Invoker = (
  cmd: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** Open the workspace's project in Sublime Text via the backend `sublime_open`. */
export function openSublime(
  projectPath: string,
  invoker: Invoker = invoke,
): Promise<void> {
  return invoker("sublime_open", { projectPath })
    .then(() => undefined)
    .catch((err) => {
      // Surface rather than dead-click; e.g. `subl` failed to spawn.
      console.error("[sublime] open failed:", err);
    });
}

/** Open the workspace's project in Sublime Merge via the backend `smerge_open`. */
export function openSublimeMerge(
  projectPath: string,
  invoker: Invoker = invoke,
): Promise<void> {
  return invoker("smerge_open", { projectPath })
    .then(() => undefined)
    .catch((err) => {
      // Surface rather than dead-click; e.g. `smerge` failed to spawn.
      console.error("[smerge] open failed:", err);
    });
}
