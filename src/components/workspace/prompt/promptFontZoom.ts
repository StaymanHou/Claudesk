// F-a WP3 Phase 2 — font zoom for the Prompt panel's prose view.
//
// Thin config over the shared `makeFontZoom` factory (`../fontZoomCore`) — the same one
// the editor and the terminals use. The clamp/step/persist math is NOT reimplemented here;
// only the bounds and the storage key differ.
//
// ⚠️ ITS OWN STORAGE KEY, deliberately. Reusing `claudesk.editor.fontSize` would couple a
// PROSE surface's zoom to a CODE surface's — they are read at different distances and the
// operator zooms them for different reasons (a dictated paragraph vs. a diff hunk). One
// key would mean zooming the draft silently resized every code file, which reads as a bug.
//
// ⚠️ The DEFAULT is shared, though: `DEFAULT_FONT_PX` is imported from the editor's module
// rather than re-typed, so a fresh Prompt panel, a fresh editor and the terminals all start
// at the same size and cannot silently drift apart. Only the PERSISTED value is separate.

import { makeFontZoom, safeStorage } from "../fontZoomCore";
import { DEFAULT_FONT_PX } from "../editor/fontZoom";

/** Starting size, shared with the editor + terminals (derived, never a re-typed literal). */
export const DEFAULT_PROMPT_FONT_PX = DEFAULT_FONT_PX;
export const MIN_PROMPT_FONT_PX = 8;
export const MAX_PROMPT_FONT_PX = 32;
export const PROMPT_FONT_STEP_PX = 1;

/** Global localStorage key for the persisted prompt-panel font size. */
export const PROMPT_FONT_SIZE_KEY = "claudesk.prompt.fontSize";

const zoom = makeFontZoom({
  defaultPx: DEFAULT_PROMPT_FONT_PX,
  minPx: MIN_PROMPT_FONT_PX,
  maxPx: MAX_PROMPT_FONT_PX,
  stepPx: PROMPT_FONT_STEP_PX,
  storageKey: PROMPT_FONT_SIZE_KEY,
});

/** Clamp a candidate size into the supported range. */
export function clampPromptFontSize(px: number): number {
  return zoom.clamp(px);
}

/** The next size for a zoom direction, clamped. "in" grows, "out" shrinks. */
export function nextFontSize(current: number, direction: "in" | "out"): number {
  return zoom.next(current, direction);
}

/**
 * Read the persisted size. Returns [`DEFAULT_PROMPT_FONT_PX`] when absent, unparseable or
 * out of range — never throws (private mode / disabled storage is swallowed to the default).
 */
export function loadPromptFontSize(
  storage: Storage | undefined = safeStorage(),
): number {
  return zoom.load(storage);
}

/** Persist the size (clamped). Swallows storage-access errors. */
export function savePromptFontSize(
  px: number,
  storage: Storage | undefined = safeStorage(),
): void {
  zoom.save(px, storage);
}
