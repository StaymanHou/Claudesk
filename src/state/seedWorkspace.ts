// WP6 Phase 2 — dev-only workspace seed seam (pure parser).
//
// The only way to open a workspace in production is the picker's "Open Folder"
// dialog (Tauri `plugin:dialog|open`). That dialog stub-wedges a headless browser
// (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE), so verify-self cannot
// reach the workspace UI to drive the editor/diff/finder flows. This seam provides
// a DEV-ONLY way to seed a workspace for a given path WITHOUT the dialog:
//   - `?ws=<abs-path>` in the URL (Playwright navigates here), and
//   - `window.__seedWorkspace(path)` (console-driven harnesses).
// Both funnel through the existing `openWorkspace` reducer — no new workspace-
// creation logic. The wiring (App.tsx) is gated on `import.meta.env.DEV` so neither
// path exists in a `pnpm tauri build` bundle.
//
// This module is the PURE half (parse a query string → a path or null), kept React-
// and DOM-free so it is vitest-testable (repo posture: pure logic → vitest, live DOM
// → Playwright). The wiring half lives in App.tsx.

/** The query-string key the seed seam reads. */
export const SEED_PARAM = "ws";

/**
 * Parse the dev-only `?ws=<path>` seed param out of a query string.
 *
 * Returns the trimmed path, or `null` when the param is absent, empty, or only
 * whitespace. `search` is a raw query string (e.g. `window.location.search`,
 * with or without the leading `?`). Pure — no DOM, no env access; the caller is
 * responsible for the `import.meta.env.DEV` gate.
 */
export function parseSeedParam(search: string): string | null {
  const value = new URLSearchParams(search).get(SEED_PARAM);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
