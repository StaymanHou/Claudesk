// WP6 (debt-paydown, Theme H) — the canonical "minimal keydown shape" the pure chord
// predicates read.
//
// Every chord predicate (panel-select, finder, search, tab-switch, close-tab, new-file,
// new-terminal, new-workspace, workspace-switch, font-zoom) declared its OWN verbatim
// `{ metaKey; shiftKey; key }` interface with a "// mirrors ChordEvent" comment — but
// there was no actual `ChordEvent` to mirror. This is that type. Predicates that read the
// same fields alias this one, so "mirrors ChordEvent" is now literally true and the shape
// can't silently drift between seams.
//
// `ctrlKey` / `altKey` are OPTIONAL: the predicates are permissive on them (they assert
// only ⌘ + Shift + key), so they don't read these fields — but including them lets tests
// pass `ctrlKey: true` to PROVE that permissiveness rather than just assert the name of it.

/** A minimal keydown shape — the fields a chord predicate may read. */
export interface ChordEvent {
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  /** Permissive — predicates do not require a specific value (present for test coverage). */
  ctrlKey?: boolean;
  /** Permissive — predicates do not require a specific value (present for test coverage). */
  altKey?: boolean;
}
