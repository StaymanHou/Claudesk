// M11 WP4 — what a `fs-change` event MEANS for the Docs panel, as a pure function.
//
// ── Why this is a module and not three `if`s in the fs-change callback ───────────
// Because the interesting part is a decision over two doc-set snapshots, and a decision is
// exactly the kind of thing a `?raw` source guard cannot check. WP3 shipped two guards for a
// behavioral property that both passed while the property was broken; the fix was extracting
// the code so a test imports and drives the real thing. Same shape here: `decideReload` is
// driven with real inputs in `docsReloadDecision.test.ts`, so "a deleted selection falls
// back" is asserted as a VALUE rather than as the presence of a substring.
//
// ── ⚠️ Why the decision comes from DIFFING the list, never from `FsChange.kind` ──
// `FsChangeKind` is documented as "a hint only; the authoritative signal is `paths`", and
// the backend classifier (`fs_watch/commands.rs::classify`) folds a mixed 200ms-debounced
// batch down to `Other`. So the one sequence this WP most needs to get right — the restore
// that DELETES `.session.md` and the handoff that RE-CREATES it — is indistinguishable from
// the event itself when the two land in one debounce window.
//
// Diffing the freshly-listed doc set sidesteps that entirely: whatever the watcher coalesced,
// the set before and the set after are ground truth. This is also why `wbs.md` task 4.3's
// open question ("does `notify` coalesce delete+create?") needs no empirical answer to build
// against — the diff is correct under either behavior. (Worth knowing, not worth blocking on.)
//
// ── The four outcomes (wbs.md task 4.3, amended at WP3 verify-human) ─────────────
//   appear      → JUMP. A doc showing up is the "a new phase started" signal, and landing on
//                 it is the re-orientation the panel exists for.
//   content     → re-render in place, selection untouched. CC rewrites WIP files many times
//                 per turn; jumping on those would yank the doc out from under a reader.
//   disappear   → fall back to the ranking, and CLEAR the explicit pick (see below).
//   none        → do nothing. Distinct from "content" so the caller can skip a `docs_read`.
//
// ⚠️ APPEAR OUTRANKS CONTENT, deliberately. A single debounced batch can carry both (CC
// writes the WIP file and creates a new one). The appear is the more informative event, and
// the jump subsumes the re-render because the caller reads the newly-selected doc anyway.

import type { DocEntry } from "../docsOrder";
import { pickInitialDoc } from "./pickInitialDoc";

/**
 * What the panel should do about a change on disk.
 *
 * `chosen` and `selected` are only present on the decisions that change them, so a caller
 * cannot accidentally re-apply a stale value on a `"none"`/`"content"` outcome.
 */
export type ReloadDecision =
  /** Nothing relevant changed — not even mtimes. No re-read, no re-render. */
  | { kind: "none" }
  /** The selected doc's bytes changed. Re-read + re-render in place; selection stands. */
  | { kind: "content" }
  /**
   * A doc APPEARED. Re-rank and jump to the answer.
   *
   * `selected` is `pickInitialDoc`'s answer for the NEW set. `chosen` is carried through
   * unchanged — an explicit pick is still sacred here, so a caller that has one never
   * applies the jump (see `shouldJump` below for why the decision still reports it).
   */
  | { kind: "jump"; selected: string | null }
  /**
   * The SELECTED doc is gone. Fall back to the ranking over the new set.
   *
   * ⚠️ `chosen: null` is the whole point of this arm and is NOT the same as re-pointing the
   * sentinel at `selected`. Re-pointing would forge a fake "the user chose this" state, and
   * that fake choice would then suppress the next legitimate jump-on-appear — a silent,
   * permanent downgrade of the panel triggered by an unrelated file deletion. Clearing it
   * returns the panel to "unchosen", which is the truth: the user's pick no longer exists.
   */
  | { kind: "refallback"; chosen: null; selected: string | null };

/** Set of `rel_path`s, the identity axis for appear/disappear. */
function paths(entries: readonly DocEntry[]): Set<string> {
  return new Set(entries.map((e) => e.rel_path));
}

/**
 * Decide what a re-listed doc set means for the panel.
 *
 * `prev === null` means "no previous list" — the very first `docs_list` result. That is a
 * plain `"none"`: WP3's render path already lands on `pickInitialDoc`'s answer by deriving
 * the selection, so reporting a jump here would be redundant at best and, if the caller
 * applied it as an explicit selection, would suppress the first real jump.
 *
 * ## Precedence, in order
 * 1. **The selected doc disappeared** → `"refallback"`. Checked FIRST because it is the only
 *    outcome that must override an explicit pick, so no later arm may shadow it.
 * 2. **Any doc appeared** → `"jump"`.
 * 3. **The selected doc's mtime moved** → `"content"`.
 * 4. Otherwise → `"none"`. Note a doc *other* than the selected one changing its bytes is
 *    `"none"`: the panel renders one doc, and re-reading it because a sibling changed would
 *    be work with no visible effect. (The LIST is still refreshed by the caller regardless —
 *    that is how mtimes advance at all — so the next tiebreak sees current data.)
 *
 * Pure and total: no I/O, no throwing, defined for empty sets, duplicate paths, and a
 * `selected` that appears in neither snapshot.
 */
export function decideReload({
  prev,
  next,
  selected,
}: {
  /** The doc set as of the last list, or `null` on the first ever load. */
  prev: readonly DocEntry[] | null;
  /** The freshly-listed doc set. */
  next: readonly DocEntry[];
  /** The path currently rendered — `chosen` if the user picked, else the auto-selection. */
  selected: string | null;
}): ReloadDecision {
  if (prev === null) return { kind: "none" };

  const before = paths(prev);
  const after = paths(next);

  // 1. The rendered doc is gone. This is the routine `/session-restore` step-7 case, not an
  //    edge case: the panel's top-ranked landing doc is `.session.md`, and a restore deletes
  //    it every time.
  if (selected !== null && before.has(selected) && !after.has(selected)) {
    return { kind: "refallback", chosen: null, selected: pickInitialDoc(next) };
  }

  // 2. Something new showed up. Deliberately checked before the content arm — a batch can
  //    carry both, and the appear is the more informative half.
  //
  //    ⚠️ A path that vanished and came back within one diff step lands here, which is
  //    correct: `.session.md` deleted by a restore and re-written by a handoff is a NEW
  //    landing target, not an edit to the one we were showing. It only reaches this arm when
  //    it was not the selection (arm 1 would have caught that), so nothing is lost.
  for (const p of after) {
    if (!before.has(p)) return { kind: "jump", selected: pickInitialDoc(next) };
  }

  // 3. The rendered doc's bytes moved. mtime is the signal; identical mtimes mean identical
  //    content for this purpose (the watcher only fires when something actually happened, so
  //    a same-mtime write within one filesystem tick is a re-read we can afford to skip).
  if (selected !== null) {
    const prevEntry = prev.find((e) => e.rel_path === selected);
    const nextEntry = next.find((e) => e.rel_path === selected);
    if (
      prevEntry !== undefined &&
      nextEntry !== undefined &&
      prevEntry.mtime_ms !== nextEntry.mtime_ms
    ) {
      return { kind: "content" };
    }
  }

  return { kind: "none" };
}

/**
 * Whether a `"jump"` decision should actually be applied, given the user's pick.
 *
 * Separated from `decideReload` so the rule reads as one line at the call site and is
 * assertable on its own: **an explicit pick is never overridden by a jump.** The decision
 * still reports the jump (it is a fact about the doc set); this is the policy over it.
 *
 * ⚠️ Note the asymmetry with `"refallback"`, which has no equivalent veto — there, the
 * chosen doc has ceased to exist, so honoring the pick is not an option.
 */
export function shouldJump(chosen: string | null): boolean {
  return chosen === null;
}
