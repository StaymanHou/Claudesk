// WP3a Phase 2 — pure font-zoom logic for the editor (Cmd+= / Cmd+- / Cmd+0).
//
// The Compartment wiring + keybindings live in editorExtensions.ts / EditorPanel;
// this module owns the editor's bounds + key and delegates the clamp/step/persist
// math to the shared factory (makeFontZoom, ../fontZoomCore) it shares verbatim with
// the terminal zoom. Named exports below are unchanged — consumers + tests are stable.
//
// Scope decision (CLAUDE.md WBS allowed "per-project OR globally"): the size is
// persisted GLOBALLY under one localStorage key — the lite, frontend-only choice
// (no backend round-trip). A freshly opened workspace inherits the last zoom.

import { makeFontZoom, safeStorage } from "../fontZoomCore";
import { DEFAULT_TERMINAL_FONT_PX } from "../terminalFontZoom";

// DEFAULT_FONT_PX is DERIVED from DEFAULT_TERMINAL_FONT_PX (not a re-typed literal) so a
// fresh editor and the ⌘0 reset land at the same size as the CC/right-panel terminals,
// and the two can never silently drift apart. A `===` structural test pins this.
export const DEFAULT_FONT_PX = DEFAULT_TERMINAL_FONT_PX;
export const MIN_FONT_PX = 8;
export const MAX_FONT_PX = 32;
export const FONT_STEP_PX = 1;
/** Global localStorage key for the persisted editor font size. */
export const FONT_SIZE_KEY = "claudesk.editor.fontSize";

const zoom = makeFontZoom({
  defaultPx: DEFAULT_FONT_PX,
  minPx: MIN_FONT_PX,
  maxPx: MAX_FONT_PX,
  stepPx: FONT_STEP_PX,
  storageKey: FONT_SIZE_KEY,
});

/** Clamp a candidate size into the supported range. */
export function clampFontSize(px: number): number {
  return zoom.clamp(px);
}

/** The next size for a zoom direction, clamped. "in" grows, "out" shrinks. */
export function nextFontSize(current: number, direction: "in" | "out"): number {
  return zoom.next(current, direction);
}

/**
 * Read the persisted font size from a Storage (defaults to localStorage). Returns
 * DEFAULT_FONT_PX when absent, unparseable, or out of range — never throws (a
 * private-mode / disabled-storage access error is swallowed to the default).
 */
export function loadFontSize(
  storage: Storage | undefined = safeStorage(),
): number {
  return zoom.load(storage);
}

/** Persist the font size (clamped). Swallows storage-access errors. */
export function saveFontSize(
  px: number,
  storage: Storage | undefined = safeStorage(),
): void {
  zoom.save(px, storage);
}
