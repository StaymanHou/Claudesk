// WP8 — external Sublime launch helpers.
//
// Extracted from the (now-deleted) SublimeToolbar when both launchers moved into
// the RightPanelHost panel tab row. Each helper invokes its backend command with
// the workspace's project path and SURFACES a rejection (console.error) rather
// than dead-clicking — the WP6 picker lesson.
//
// ⚠️ BUTTON-ONLY, BY DECISION — and `⌘⇧O` IS FREE. These launchers are reached from the panel
// tab row, not a keybinding. The launch went OS-global first (`tauri-plugin-global-shortcut` +
// a macOS Accessibility flow, rejected at verify-human 2026-06-19 — see `src-tauri/src/sublime/`),
// was then rebuilt as an in-app `⌘⇧E`→`⌘⇧O` keydown hotkey, and at WP8's 2026-06-20 redefinition
// the `⌘⇧O` half was DELETED as redundant with the button. So `⌘⇧O` is unclaimed and available to
// a future feature; do not assume it is taken. (`⌘⇧`+digit is NOT — that is reserved for
// filmstrip/workspace switching.)
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
