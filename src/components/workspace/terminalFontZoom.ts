// M6 WP4 — pure font-zoom logic for the CC terminal (focus-scoped Cmd+= / Cmd+- / Cmd+0).
//
// The verbatim sibling of editor/fontZoom.ts: no React, no xterm, no DOM, so it is
// unit-testable under vitest (repo posture: pure logic → vitest). The xterm
// `term.options.fontSize` apply + the focus-scoped keydown routing live in
// XtermPane / Workspace; this module owns the math (clamp/step), the persistence
// (localStorage), and the chord matcher.
//
// Scope decision: persisted GLOBALLY under one localStorage key — the lite,
// frontend-only choice matching fontZoom.ts (the editor zoom) and the WP3 split
// state. A freshly opened workspace's terminal inherits the last zoom.
//
// DEFAULT_TERMINAL_FONT_PX = 11 matches the historical hardcode in the XtermPane
// `Terminal` constructor, so first run (no persisted value) is visually identical
// to pre-WP4 — the zoom only ever departs from 11 when the user asks.

export const DEFAULT_TERMINAL_FONT_PX = 11;
export const MIN_TERMINAL_FONT_PX = 6;
export const MAX_TERMINAL_FONT_PX = 32;
export const TERMINAL_FONT_STEP_PX = 1;
/** Global localStorage key for the persisted terminal font size. */
export const TERMINAL_FONT_SIZE_KEY = "claudesk.terminal.fontSize";

/** Clamp a candidate size into the supported range. */
export function clampTerminalFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERMINAL_FONT_PX;
  return Math.min(
    MAX_TERMINAL_FONT_PX,
    Math.max(MIN_TERMINAL_FONT_PX, Math.round(px)),
  );
}

/** The next size for a zoom direction, clamped. "in" grows, "out" shrinks. */
export function nextTerminalFontSize(
  current: number,
  direction: "in" | "out",
): number {
  const delta =
    direction === "in" ? TERMINAL_FONT_STEP_PX : -TERMINAL_FONT_STEP_PX;
  return clampTerminalFontSize(current + delta);
}

/**
 * Read the persisted font size from a Storage (defaults to localStorage). Returns
 * DEFAULT_TERMINAL_FONT_PX when absent, unparseable, or out of range — never throws
 * (a private-mode / disabled-storage access error is swallowed to the default).
 */
export function loadTerminalFontSize(
  storage: Storage | undefined = safeStorage(),
): number {
  if (!storage) return DEFAULT_TERMINAL_FONT_PX;
  try {
    const raw = storage.getItem(TERMINAL_FONT_SIZE_KEY);
    if (raw == null) return DEFAULT_TERMINAL_FONT_PX;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_TERMINAL_FONT_PX;
    return clampTerminalFontSize(n);
  } catch {
    return DEFAULT_TERMINAL_FONT_PX;
  }
}

/** Persist the font size (clamped). Swallows storage-access errors. */
export function saveTerminalFontSize(
  px: number,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      TERMINAL_FONT_SIZE_KEY,
      String(clampTerminalFontSize(px)),
    );
  } catch {
    // private mode / quota / disabled — zoom still works for the session.
  }
}

/** What a terminal-zoom chord asks for: grow, shrink, reset, or not-a-chord. */
export type TerminalZoomAction = "in" | "out" | "reset";

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface TerminalZoomChordEvent {
  metaKey: boolean;
  key: string;
}

/**
 * Map a ⌘-family keydown to a terminal-zoom action, or `null` if it isn't a zoom
 * chord. ⌘= / ⌘+ grow, ⌘- shrink, ⌘0 reset — the SAME chords the editor uses
 * (editorExtensions.ts coreKeymap); the focus-scoped routing in Workspace decides
 * WHICH half (terminal vs editor) acts on them, so the two zoom paths stay disjoint.
 * Both the unshifted "=" and the shifted "+" map to "in" so it works across keyboards.
 * Requires Cmd; deliberately does NOT require Shift (these are plain Mod chords, not
 * the ⌘⇧-family panel/palette chords).
 */
export function terminalZoomForChord(
  e: TerminalZoomChordEvent,
): TerminalZoomAction | null {
  if (!e.metaKey) return null;
  switch (e.key) {
    case "=":
    case "+":
      return "in";
    case "-":
      return "out";
    case "0":
      return "reset";
    default:
      return null;
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
