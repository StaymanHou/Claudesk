// M6 WP5 — pure line-wrap toggle logic for the editor (⌘\).
//
// No React, no CM6, no DOM — unit-testable under vitest (repo posture: pure logic
// → vitest, live DOM → Playwright; same split as fontZoom.ts). The Compartment
// wiring + the ⌘\ keybinding live in theme.ts / editorExtensions.ts / EditorPanel;
// this module owns only the persisted flag (localStorage), so it's testable with a
// mock Storage.
//
// Scope decision (WBS WP5 said "per-editor-view, persisted"): the flag is persisted
// GLOBALLY under one localStorage key — the same lite, frontend-only choice fontZoom
// makes. A freshly opened view inherits the last wrap state. ("Per-view" is honored
// at the RUNTIME layer: each EditorView holds its own lineWrapCompartment seeded from
// this shared value; the persisted PREFERENCE is one global flag, not per-path.)
// Default OFF preserves the deliberate no-wrap behavior (verify-human 2026-06-20) —
// long lines scroll horizontally until the operator opts wrap on.

export const DEFAULT_WRAP = false;
/** Global localStorage key for the persisted editor line-wrap flag. */
export const LINE_WRAP_KEY = "claudesk.editor.lineWrap";

/**
 * Read the persisted wrap flag from a Storage (defaults to localStorage). Returns
 * DEFAULT_WRAP when absent, unparseable, or anything but the literal "true"/"false"
 * — never throws (a private-mode / disabled-storage access error is swallowed to
 * the default).
 */
export function loadWrap(
  storage: Storage | undefined = safeStorage(),
): boolean {
  if (!storage) return DEFAULT_WRAP;
  try {
    const raw = storage.getItem(LINE_WRAP_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_WRAP;
  } catch {
    return DEFAULT_WRAP;
  }
}

/** Persist the wrap flag. Swallows storage-access errors. */
export function saveWrap(
  on: boolean,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LINE_WRAP_KEY, on ? "true" : "false");
  } catch {
    // private mode / quota / disabled — wrap still works for the session.
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
