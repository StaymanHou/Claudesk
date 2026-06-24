// "Reveal in Finder" launch helper — mirrors sublime/sublimeLaunch.ts.
//
// Invokes the backend `finder_open` command with the workspace's project path and
// SURFACES a rejection (console.error) rather than dead-clicking (the WP6 picker
// lesson). The Tauri `invoke` is injected (defaulting to the real one) so the
// helper is unit-testable without mocking the module.

import { invoke } from "@tauri-apps/api/core";

/** The subset of Tauri's `invoke` this helper uses; injectable for tests. */
export type Invoker = (
  cmd: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** Open the workspace's project directory in the macOS Finder via `finder_open`. */
export function openFinder(
  projectPath: string,
  invoker: Invoker = invoke,
): Promise<void> {
  return invoker("finder_open", { projectPath })
    .then(() => undefined)
    .catch((err) => {
      // Surface rather than dead-click; e.g. `open` failed to spawn.
      console.error("[finder] open failed:", err);
    });
}
