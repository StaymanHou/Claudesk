// M12 WP4c Phase 4 — the ONE writer both lines of the picker cell go through.
//
// ## Why one function instead of two symmetrical handlers (P4.4)
//
// The cell now has two independent editable values (model, drive mode). The obvious
// implementation is two handlers that each do the same four steps: decide whether the value
// changed, optimistically set local state, fire the IPC write, and revert on failure.
//
// ⚠️ **That shape is this milestone's most-repeated defect.** M11 WP4 shipped a CRITICAL
// because a state update and its paired dispatch lived at two call sites and one call site
// forgot the pair — and the module it forgot to call was itself fully mutation-proven. The
// recorded lesson is explicit: *"the fix is structural, not more assertions: funnel every
// write of a shared piece of state through ONE function, then guard that single writer."*
// The same shape has now been observed four times in M12 alone (an undispatched `"reset"`, a
// self-poisoning jump guard, a doc comment citing a nonexistent test, a stale dead-code
// allowance).
//
// So: both lines call `commitCellValue`. Forgetting the revert-on-failure step, or the
// changed-check, or the parent notification is not a discipline anyone has to remember at two
// call sites — it is impossible by construction, because there is only one site.
//
// ## What this deliberately does NOT do
// It does not know about React. It takes the setters it needs, so it stays a pure-ish
// orchestration function that a test can drive with spies instead of a rendered component
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` — but note the caveat
// there: a test that RE-IMPLEMENTS this logic shares its blind spot, so the component tests
// assert that the component *calls* this, not that a replica behaves the same way).

/** Everything one commit needs, supplied by the calling line. */
export interface CommitCellValueArgs<T> {
  /** The value the user just chose. */
  readonly next: T;
  /** The value currently persisted, read from a ref — NOT from state. */
  readonly persisted: T;
  /**
   * Whether `next` differs from `persisted`.
   *
   * Injected rather than computed with `!==` because the model line's rule is not identity:
   * a blank-or-whitespace draft normalizes to `null`, so `"  "` and `null` are the *same*
   * persisted value. `modelValueChanged` owns that rule; `driveModeChanged` is plain
   * inequality. Passing the predicate keeps both rules where they are already tested.
   */
  readonly changed: (next: T, persisted: T) => boolean;
  /** Persist it. Rejects on failure, which triggers the revert below. */
  readonly persist: (value: T) => Promise<void>;
  /** Optimistically reflect `value` locally, and again on revert. */
  readonly apply: (value: T) => void;
  /** Record the authoritative value outside React state (the StrictMode-safe ref). */
  readonly setRef: (value: T) => void;
  /** Clear/raise the "write failed" flag. */
  readonly setFailed: (failed: boolean) => void;
  /** Tell the parent so its `recents` copy stays truthful. SUCCESS PATH ONLY. */
  readonly notifyCommitted?: (value: T) => void;
  /** Label used in the console message on failure. */
  readonly what: string;
}

/**
 * Commit one of the cell's two values, with the full optimistic-write dance.
 *
 * Sequence, and every step is load-bearing:
 *  1. **No-op guard** — a blur or a re-pick of the same value must not write. Every
 *     `projects.json` write is a whole-file read-modify-write, so a redundant commit
 *     re-persists the entire list (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`).
 *  2. **Optimistic apply + ref update** — the UI reflects the choice immediately. The ref is
 *     updated *before* the await so a second commit races against the new value, not the old.
 *  3. **Persist**, then **notify the parent on success only** — writing back a value that
 *     failed to persist would make the parent's `recents` array lie, and that array is this
 *     cell's seed on the next mount (a filter round-trip unmounts every row).
 *  4. **Revert on failure** — restore the prior value in both state and ref, and raise the
 *     failed flag so the cell can show it.
 *
 * ⚠️ Returns a promise but callers deliberately do NOT await it: the optimistic update has
 * already happened by the time the IPC settles, and awaiting in an event handler would either
 * block the interaction or require an async handler React does not want.
 */
export async function commitCellValue<T>(
  args: CommitCellValueArgs<T>,
): Promise<void> {
  const {
    next,
    persisted,
    changed,
    persist,
    apply,
    setRef,
    setFailed,
    notifyCommitted,
    what,
  } = args;

  if (!changed(next, persisted)) {
    // Re-apply the canonical form even when not persisting, so a padded no-op edit snaps
    // back rather than lingering as typed.
    apply(persisted);
    return;
  }

  setRef(next);
  apply(next);
  setFailed(false);

  try {
    await persist(next);
    notifyCommitted?.(next);
  } catch (err: unknown) {
    setRef(persisted);
    apply(persisted);
    setFailed(true);
    console.error(`[claudesk] ${what} write failed:`, err);
  }
}
