// WP3a Phase 2 — pure font-zoom logic for the editor (Cmd+= / Cmd+- / Cmd+0).
//
// No React, no CM6, no DOM — unit-testable under vitest (repo posture: pure logic
// → vitest). The Compartment wiring + keybindings live in editorExtensions.ts /
// EditorPanel; this module owns the math (clamp/step) and the persistence
// (localStorage), so both are independently testable with a mock Storage.
//
// Scope decision (CLAUDE.md WBS allowed "per-project OR globally"): the size is
// persisted GLOBALLY under one localStorage key — the lite, frontend-only choice
// (no backend round-trip). A freshly opened workspace inherits the last zoom.

// DEFAULT_FONT_PX = 11 matches DEFAULT_TERMINAL_FONT_PX (terminalFontZoom.ts) so a
// fresh editor and the ⌘0 reset land at the same size as the CC/right-panel terminals.
export const DEFAULT_FONT_PX = 11;
export const MIN_FONT_PX = 8;
export const MAX_FONT_PX = 32;
export const FONT_STEP_PX = 1;
/** Global localStorage key for the persisted editor font size. */
export const FONT_SIZE_KEY = "claudesk.editor.fontSize";

/** Clamp a candidate size into the supported range. */
export function clampFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_FONT_PX;
  return Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, Math.round(px)));
}

/** The next size for a zoom direction, clamped. "in" grows, "out" shrinks. */
export function nextFontSize(current: number, direction: "in" | "out"): number {
  const delta = direction === "in" ? FONT_STEP_PX : -FONT_STEP_PX;
  return clampFontSize(current + delta);
}

/**
 * Read the persisted font size from a Storage (defaults to localStorage). Returns
 * DEFAULT_FONT_PX when absent, unparseable, or out of range — never throws (a
 * private-mode / disabled-storage access error is swallowed to the default).
 */
export function loadFontSize(
  storage: Storage | undefined = safeStorage(),
): number {
  if (!storage) return DEFAULT_FONT_PX;
  try {
    const raw = storage.getItem(FONT_SIZE_KEY);
    if (raw == null) return DEFAULT_FONT_PX;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_FONT_PX;
    return clampFontSize(n);
  } catch {
    return DEFAULT_FONT_PX;
  }
}

/** Persist the font size (clamped). Swallows storage-access errors. */
export function saveFontSize(
  px: number,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(FONT_SIZE_KEY, String(clampFontSize(px)));
  } catch {
    // private mode / quota / disabled — zoom still works for the session.
  }
}

/** localStorage if available, else undefined (SSR / test without DOM). */
function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
