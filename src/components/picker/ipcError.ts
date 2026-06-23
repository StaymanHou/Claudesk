// M4 WP2 P4.2 — Pure helper for surfacing a picker IPC failure as a toast message.
//
// Folds in the deferred M1 WP6 picker IPC error-surfacing MAJORs
// (SURFACE-2026-06-18-QUALITY-* picker IPC error-surfacing): the picker's mount
// loader and its mutation handlers (record_open / add_project / remove_project)
// used to swallow rejections — a malformed projects.json read as "no projects yet,"
// and a failed mutation dropped as an unhandled promise rejection. This module holds
// the pure error→message composition so it is unit-testable under vitest without
// rendering the picker (the project's frontend posture: pure logic is unit-tested,
// live DOM is Playwright-verified in verify-self).

/**
 * Compose a human-readable toast message for a rejected picker IPC call. The Tauri
 * `invoke`/dialog rejection is an `unknown` (commonly a string from our Rust command
 * layer, which maps `CcError`/store errors to `String`). `action` names what failed
 * so the toast reads naturally ("Could not load projects: …", "Could not open
 * project: …"). Always returns a non-empty string — a rejection is never silent.
 */
export function mapIpcError(action: string, err: unknown): string {
  const detail =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err);
  const trimmed = detail.trim();
  return trimmed.length > 0
    ? `Could not ${action}: ${trimmed}`
    : `Could not ${action}.`;
}
