// Paydown WP10 — the persisted "mark as dictated" toggle for the Prompt panel.
//
// ⚠️ DEFAULT ON (operator ruling 2026-09-23). The panel exists for dictation, and macOS dictation
// leaves no DOM signal to detect it by (it arrives as ordinary input events), so the only honest
// choices were "always" or an operator toggle. It is a toggle, and it starts ON.
//
// ⚠️ ONE GLOBAL KEY, following `promptFontZoom.ts`, not one per workspace: the operator either
// dictates into this panel or does not, and a per-project value would mean switching it off again
// in every project.
//
// ⚠️ Anything other than the literal `"false"` reads as ON, deliberately. A corrupt or missing
// value should fall back to the caveat being PRESENT: an unneeded note costs a line, but a missing
// one lets CC act on a mishearing.

import { safeStorage } from "../fontZoomCore";

/** Global localStorage key for the persisted toggle. */
export const PROMPT_DICTATED_WRAP_KEY = "claudesk.prompt.dictatedWrap";

/** Read the persisted toggle. Never throws; any failure reads as ON. */
export function loadDictatedWrap(
  storage: Storage | undefined = safeStorage(),
): boolean {
  try {
    return storage?.getItem(PROMPT_DICTATED_WRAP_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Persist the toggle. Swallows storage-access errors. */
export function saveDictatedWrap(
  on: boolean,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(PROMPT_DICTATED_WRAP_KEY, on ? "true" : "false");
  } catch {
    // Private mode / disabled storage: the toggle still works for this session.
  }
}
