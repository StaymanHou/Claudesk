// M11.5 repair (B) — the recents write-back, as a pure function.
//
// ## Why this module exists (it is not ceremony)
// Removing the picker's per-row `project_get_default_model` N+1 means each row's model
// cell is seeded from the `recents` array the picker already holds. That trade has a
// catch the finding did not name: the cell used to re-read from disk on every mount,
// and that re-read is precisely what silently kept a committed value truthful.
//
// `project_set_default_model` returns `void`, and this setting deliberately has NO
// broadcast event (M11.5 WP1 as-built: one surface, so a one-subscriber fan-out was
// rejected). So with the read deleted and nothing writing back, this sequence shows a
// stale value:
//
//   1. set project A -> "opus"   (persisted; `recents[A].default_model` still null)
//   2. type in the filter box so A is filtered out  -> the cell UNMOUNTS
//   3. clear the filter -> A remounts, seeded from the STALE array -> shows "Default"
//
// That is a visible correctness regression traded for a perf win — strictly worse than
// the N+1 it replaces. This function closes the window by folding the committed value
// back into the array, so the seed stays truthful across unmount.
//
// It is a pure function rather than an inline `setRecents` callback because this repo
// has **no component-render harness** (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`
// — zero of 123 test files render a component), so the behavior is otherwise pinnable
// only by a `?raw` source guard. Those have now rotted three separate times here
// (`SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`, corroborated again by
// the 2026-08-01 formatting sweep). Extract the decision, assert the value — the same
// discipline `pickerRowOrder.ts` applies to the row's cell order.

import type { RecentProject } from "./ProjectPicker";
import type { DriveMode } from "../../cc/driveMode";

/**
 * Fold a just-committed model override back into the `recents` array.
 *
 * Returns a NEW array (never mutates the input) with `default_model` replaced on the
 * row whose `project_path` matches. `null` means "cleared — inherit CC's own default",
 * which is a real value here, not a missing one: it must overwrite a previous override
 * rather than leave it in place.
 *
 * An unknown `projectPath` is a no-op returning an equal-valued array. That case is not
 * defensive padding — a row can be removed from recents while its cell is still mounted,
 * and resurrecting a deleted project by writing it back would be worse than dropping the
 * update (the value is already persisted on disk either way).
 *
 * Paths are compared verbatim, matching the backend's `add_or_touch` / `remove` /
 * `read_default_model`, so a normalization difference here could never make the frontend
 * and backend disagree about which record a write landed on.
 */
export function applyCommittedModel(
  recents: readonly RecentProject[],
  projectPath: string,
  model: string | null,
): RecentProject[] {
  return recents.map((r) =>
    r.project_path === projectPath ? { ...r, default_model: model } : r,
  );
}

/**
 * Fold a just-committed drive mode back into the `recents` array (M12 WP4c).
 *
 * The drive-mode twin of {@link applyCommittedModel}, and **every word of this module's
 * header applies to it identically** — same seeded-from-`recents` design, same `void`-returning
 * setter, same deliberate absence of a broadcast event, so the same stale-after-filter-
 * round-trip window and the same fix.
 *
 * ⚠️ Kept as a separate function rather than generalizing both into
 * `applyCommittedField(recents, path, key, value)`. A generic version would need the field
 * name as a runtime string, which trades a **compile-time** guarantee (each function can only
 * write its own correctly-typed field) for a stringly-typed one — and the field being written
 * here is `default_drive_mode`, where a bad value does not degrade gracefully: it fails serde
 * on the next read and takes the whole project list down. Two four-line functions with real
 * types beat one clever one. If a THIRD per-project field ever arrives, revisit — but weigh it
 * against that specific loss, not against the duplication alone.
 */
export function applyCommittedDriveMode(
  recents: readonly RecentProject[],
  projectPath: string,
  mode: DriveMode | null,
): RecentProject[] {
  return recents.map((r) =>
    r.project_path === projectPath ? { ...r, default_drive_mode: mode } : r,
  );
}
