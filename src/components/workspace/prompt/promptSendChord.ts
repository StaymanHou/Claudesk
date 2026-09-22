// F-a WP4 Phase 2 (task 4.2) — pure chord predicates for the Prompt panel's two send modes.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ BOTH CHORDS WERE VERIFIED FREE BEFORE THIS FILE WAS WRITTEN (2026-09-22), because the WBS
// makes that a precondition of the task rather than a nicety:
//   - No `chordRegistry.ts` entry binds Enter — the registry's 20 entries are ⌘⇧-letters,
//     ⌘-letters, ⌘-digits, ⌘, and the CM6 set. None is Enter.
//   - No sibling `*Chord.ts` predicate matches Enter (all 11 read `key` as a letter or digit).
//   - `promptExtensions.ts` binds no Enter key: the panel ships `basicSetup={false}` with no
//     `defaultKeymap`, so CM6 contributes no `Mod-Enter` binding for these to fight.
//   - ⚠️ ⌘⇧+DIGIT stays reserved for filmstrip workspace switching
//     (`[[cmd-shift-digit-reserved-for-filmstrip]]`) — untouched here; Enter is not a digit.
// The bare-`Enter` handlers elsewhere in the app (picker cells, filetree rename, project
// search) all require NO modifier, so they cannot collide with a ⌘-modified Enter.
//
// ⚠️ TWO PREDICATES, NOT ONE WITH A BOOLEAN RETURN. The caller must distinguish auto-submit
// from stage-only to pick the `SendMode`, and a single `isSendChord()` returning true for both
// would force the call site to re-derive `shiftKey` — putting the mode decision back at the
// call site, which is exactly what `sendStagedDraft.ts` exists to prevent.
//
// ⚠️ `key === "Enter"` covers BOTH Return and the numeric keypad's Enter: the KeyboardEvent
// `key` value is "Enter" for both (they differ only in `code`, which is not read here). That is
// the intent — an operator on a full keyboard should not find one Enter works and the other
// does not.

import type { ChordEvent } from "../chordEvent";

/**
 * True iff `e` is the AUTO-SUBMIT send chord: ⌘ + Enter, Shift ABSENT.
 *
 * ⚠️ Shift is REQUIRED-ABSENT, which is the entire disjointness argument against
 * {@link isStageOnlyChord}. The same shape as ⌘T vs ⌘⇧T elsewhere in this app.
 *
 * Ctrl/Alt are permissive — strict only on the facts that define the chord.
 */
export function isAutoSubmitChord(e: ChordEvent): boolean {
  if (!e.metaKey || e.shiftKey) return false;
  return e.key === "Enter";
}

/**
 * True iff `e` is the STAGE-ONLY send chord: ⌘ + Shift + Enter.
 *
 * ⚠️ The mode whose bytes omit the trailing `\r`, so the text lands in CC's prompt WITHOUT
 * submitting. Getting this arm wrong submits a half-finished dictation, which is the failure
 * F-a exists to prevent — hence a predicate of its own rather than a negated flag.
 */
export function isStageOnlyChord(e: ChordEvent): boolean {
  if (!e.metaKey || !e.shiftKey) return false;
  return e.key === "Enter";
}
