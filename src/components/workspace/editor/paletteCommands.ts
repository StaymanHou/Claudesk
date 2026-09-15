// WP3b — pure core for the editor command palette.
//
// CodeMirror 6 ships no turnkey command palette, so this is a small custom
// subsystem. This module holds the pieces that need no React and no live DOM, so
// they are unit-testable under vitest (the repo posture: pure logic → vitest,
// live DOM → Playwright — same split as fontZoom.ts / language.ts):
//   - the PaletteCommand registry shape (id / title / run),
//   - the Cmd+Shift+P chord predicate,
//   - the filter predicate that narrows the command list as the user types.
//
// EXTENSION POINT — adding a command is ONE registry entry. The command set is
// assembled by the WIRING layer (EditorPanel builds the syntax-selection set from
// SYNTAX_MODES) and passed into <CommandPalette commands={...} />; the overlay
// renders whatever array it is handed. To add a command (a future WP, or a new
// editor action), push a `{ id, title, run }` onto the set the wiring layer
// composes — no change to CommandPalette.tsx or this module is needed. Keep `id`
// stable (it's the React key + test handle) and `title` user-facing (it's what
// the filter matches on).
//
// CHORD-OWNERSHIP MAP — MOVED (M14 WP3, 2026-09-15).
//
// The ~60-line map that used to live here is now TYPED DATA at
// components/workspace/chordRegistry.ts (CHORD_REGISTRY). It was moved because a comment
// cannot be rendered to the user, cannot be tested against the code it describes, and had
// ALREADY silently drifted — it omitted ⌘⇧N, ⌘, and ⌘N while claiming to be the collision
// reference every downstream WP checked against.
//
// The registry is guarded by chordRegistry.test.ts, which asserts each entry's matcher is
// actually CALLED by a registration host (comment-stripped, call-shape) — so an entry that
// documents a chord wired to nothing now fails the suite instead of reading as true.
//
// The exclusivity matrices that codify the disjointness rules are unchanged and remain in
// paletteCommands.test.ts and panelHost.test.ts.

/** Human-facing label for the palette chord, shown in hints. */
export const PALETTE_CHORD_LABEL = "⌘⇧P";

/**
 * One palette command. `run` performs the action (e.g. set the editor syntax);
 * it returns nothing — the overlay closes after invoking it. `id` is a stable
 * key for React lists + tests; `title` is what the user sees and filters over.
 */
export interface PaletteCommand {
  id: string;
  title: string;
  run: () => void;
}

/** A minimal keydown shape — just the fields the matcher reads (mirrors ChordEvent). */
export interface PaletteChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

/**
 * Whether a keydown is the command-palette chord: Cmd+Shift+P (macOS-only app).
 *
 * `key` is matched case-insensitively because Shift makes the browser report "P".
 * Shift is REQUIRED — this is what distinguishes the palette from WP6's bare
 * Cmd+P fuzzy finder, so the two chords never both fire. Ctrl/Alt are not
 * required-absent (permissive on extras, strict on the two that define the chord).
 */
export function isPaletteChord(e: PaletteChordEvent): boolean {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "p";
}

/**
 * Filter a command list by a query: case-insensitive substring match on `title`.
 * An empty/whitespace-only query returns the full list (palette open shows all).
 * Pure — order is preserved (the registry's order is the display order).
 */
export function filterCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (q === "") return commands;
  return commands.filter((c) => c.title.toLowerCase().includes(q));
}
