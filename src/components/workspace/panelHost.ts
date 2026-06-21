// WP5 — pure core for the RightPanelHost panel-select logic.
//
// The right half of a workspace shows exactly one of three panels: the CM6 editor,
// the git diff viewer, or (WP9) a second terminal. WP5 replaces the WP4 stopgap
// segmented toggle with DIRECT-SELECT — each panel has its own ⌘⇧+mnemonic chord
// AND a clickable tab; both route through `selectPanel`. NOT cycling: pressing a
// panel's chord goes straight to it and is idempotent (pressing it again is a no-op).
//
// This module holds the pieces that need no React/DOM so they are vitest-testable
// (repo posture: pure logic → vitest, live DOM → Playwright — same split as
// chord.ts / paletteCommands.ts / fontZoom.ts):
//   - the RightPanel union,
//   - `selectPanel` (direct-select; the "terminal" panel no-ops gracefully until
//     WP9 mounts it),
//   - `panelForChord` (maps a ⌘⇧+mnemonic keydown to the panel it selects).
//
// CHORD-OWNERSHIP (see paletteCommands.ts for the full app-wide matrix):
//   ⌘⇧E → Editor   ⌘⇧D → Diff   ⌘⇧T → Terminal (WP9)
//   ⌘⇧O → Sublime Text pop (transitional)   ⌘⇧P → palette
//   ⌘P → finder (WP6 — LIVE; bare meta, no shift; finder/finderChord.ts)
// All app-level chords use the WP1-proven capture-phase document listener.

/** Which right-half panel is front. "terminal" is reserved for WP9 (no-op until then). */
export type RightPanel = "editor" | "diff" | "terminal";

/** Panels actually mountable today. "terminal" is selectable-but-absent until WP9. */
export const AVAILABLE_PANELS: readonly RightPanel[] = ["editor", "diff"];

/**
 * Direct-select the target panel.
 *
 * Returns the panel to make front. Idempotent (selecting the current panel returns
 * it unchanged). The "terminal" panel is not mountable until WP9: selecting it while
 * absent is a graceful no-op — we keep the current panel rather than show a blank
 * slot. Once WP9 adds the terminal panel, drop it from the no-op guard.
 */
export function selectPanel(
  current: RightPanel,
  target: RightPanel,
): RightPanel {
  if (target === "terminal" && !AVAILABLE_PANELS.includes("terminal")) {
    // WP9 will mount the terminal panel; until then ⌘⇧T does nothing.
    return current;
  }
  return target;
}

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface PanelChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Map a ⌘⇧+mnemonic keydown to the panel it selects, or `null` if it isn't a
 * panel chord. E→editor, D→diff, T→terminal. Requires BOTH Cmd and Shift (the
 * ⌘⇧ family); `key` is matched case-insensitively because Shift uppercases it.
 * Distinct from ⌘⇧P (palette) and ⌘⇧O (Sublime) by letter, and from bare ⌘P
 * (finder) by the required Shift — so no two predicates fire on one event.
 */
export function panelForChord(e: PanelChordEvent): RightPanel | null {
  if (!e.metaKey || !e.shiftKey) return null;
  switch (e.key.toLowerCase()) {
    case "e":
      return "editor";
    case "d":
      return "diff";
    case "t":
      return "terminal";
    default:
      return null;
  }
}
