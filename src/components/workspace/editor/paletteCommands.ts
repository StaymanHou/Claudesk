// WP3b — pure core for the editor command palette.
//
// CodeMirror 6 ships no turnkey command palette, so this is a small custom
// subsystem. This module holds the pieces that need no React and no live DOM, so
// they are unit-testable under vitest (the repo posture: pure logic → vitest,
// live DOM → Playwright — same split as chord.ts / fontZoom.ts / language.ts):
//   - the PaletteCommand registry shape (id / title / run),
//   - the Cmd+Shift+P chord predicate (mirrors isSublimeChord),
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
// CHORD-OWNERSHIP MAP (so the downstream WPs land without collision — the
// isPaletteChord exclusivity matrix in paletteCommands.test.ts codifies this;
// the panel-select chords are codified in panelHost.test.ts):
//   ⌘⇧P  → command palette        (WP3b — THIS module; opens the overlay)
//   ⌘P   → fuzzy file finder       (WP6; bare meta, NO shift — distinct from ⌘⇧P)
//   ⌘⇧E  → Editor panel-select     (WP5; RightPanelHost — panelHost.panelForChord)
//   ⌘⇧D  → Diff panel-select       (WP5; RightPanelHost)
//   ⌘⇧T  → Terminal panel-select   (WP5 scheme; live binding lands with WP9)
//   ⌘⇧O  → Sublime Text pop        (WP5 reassigned ⌘⇧E→⌘⇧O; src/sublime/chord.ts —
//                                   transitional, removed once the in-app editor
//                                   reaches parity, WBS WP8)
//   (Sublime Merge → button only, NO chord — permanent, SublimeToolbar)
//   ⌘F ⌘R ⌘S ⌘D ⌘=/-/0            → CM6 editor chords (editorExtensions coreKeymap)
// NOTE: ⌘⇧D (panel-select Diff) is APP-level + capture-phase, distinct from the
// editor-internal bare ⌘D (Cmd-D select-next, CM6 keymap, no Shift) — the Shift
// disambiguates, same as ⌘⇧P vs ⌘P.
// All APP-level chords (⌘⇧P, ⌘P, ⌘⇧E/D/T, ⌘⇧O) use the WP1-proven capture-phase
// document listener; editor-internal chords use the Prec.highest CM6 keymap.
// See workflow/archive/m2-wp1-cm6-probe.md → Objective (a).

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
