// M4 WP4 — pure load/save for the filmstrip collapse preference.
//
// The filmstrip toggles between EXPANDED (full ~1 fps thumbnail tiles, WP3) and
// COLLAPSED (a one-line row of mini status pills). The chosen mode persists across app
// restarts. This module is the pure (no React/DOM beyond localStorage) core — the
// boolean load/save — mirroring `filetree/railWidth.ts` and `filmstripOrder.ts`:
// app-global localStorage UI chrome, vitest-testable, never throws.
//
// EXPANDED is the default (false) — the rich surface is what a fresh user sees; collapse
// is an opt-in space-reclaim.

/** localStorage key for the persisted collapse preference (app-global UI chrome). */
export const FILMSTRIP_COLLAPSED_KEY = "claudesk.filmstripCollapsed";

/**
 * Read the persisted collapse preference. Returns `false` (expanded) when nothing is
 * stored, the value is anything other than the literal "true", or localStorage is
 * unavailable — never throws.
 */
export function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(FILMSTRIP_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the collapse preference. Swallows storage errors (best-effort). */
export function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(FILMSTRIP_COLLAPSED_KEY, collapsed ? "true" : "false");
  } catch {
    /* storage unavailable / quota — a non-persisted preference is acceptable */
  }
}
