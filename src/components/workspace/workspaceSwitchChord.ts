// M4 WP3 — pure chord predicate for switching the center-stage workspace by number
// (⌘⇧1..⌘⇧9 — promote the Nth filmstrip tile).
//
// ⌘⇧+digit was RESERVED for exactly this (operator 2026-06-21; memory
// `cmd-shift-digit-reserved-for-filmstrip`). Shift is REQUIRED-PRESENT, which makes
// it disjoint from the bare ⌘+digit editor tab-switch (WP12 `tabSwitchIndex`, which
// requires Shift ABSENT) — the two never both fire. It is also disjoint from the
// other ⌘⇧ chords (⌘⇧E/D/T/P/F) because those are letters, not digits.
//
// Pure (no React/DOM) → vitest-testable, same posture as editor/tabSwitchChord.ts.
// REGISTERED in App.tsx via an APP-LEVEL capture-phase document listener (fires
// regardless of which workspace half holds focus — inside CM6, the terminal,
// anywhere — `preventDefault` so it's not swallowed). See the chord-ownership map in
// editor/paletteCommands.ts.

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface WorkspaceSwitchChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * If `e` is a workspace-switch chord (⌘ + Shift + a digit 1–9), return that digit
 * (1-based); otherwise null.
 *
 * Shift is REQUIRED-PRESENT (keeps it disjoint from the bare-⌘ editor tab chord).
 * ⌘⇧0 is intentionally NOT a switch chord (0 would be a no-op index). Ctrl/Alt are
 * permissive (strict only on the facts that define the chord: ⌘ present, Shift
 * present, key is 1–9). NOTE: with Shift held, some keyboard layouts report the
 * shifted symbol as `e.key` (e.g. "!"), but on macOS `⌘⇧1` reports `e.key === "1"`
 * (the digit), so matching on the digit key is correct for the target platform.
 */
export function workspaceSwitchIndex(
  e: WorkspaceSwitchChordEvent,
): number | null {
  if (!e.metaKey || !e.shiftKey) return null;
  if (e.key.length === 1 && e.key >= "1" && e.key <= "9") {
    return Number(e.key);
  }
  return null;
}
