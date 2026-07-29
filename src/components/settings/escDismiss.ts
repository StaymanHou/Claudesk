// M10.9 WP2 Phase 3 — which app-level overlay an Esc keypress dismisses.
//
// Claudesk has two app-level overlays that both close on Esc: the ⌘⇧A time-analytics
// dashboard (z-index 40) and the ⌘, Settings panel (z-index 45). One keypress must
// dismiss only the FRONT one — the higher z-index wins, and the other stays open.
//
// ## Why this is a pure function and not three lines inline
// It was inline, and it shipped a bug that three green tests missed. The first version
// read a flag assigned inside a `setShowSettings` UPDATER and checked it on the next
// line; React defers updater callbacks, so the flag was still `false` at the guard and a
// single Esc closed BOTH overlays. The wiring test asserted the two branches appeared in
// the right ORDER IN THE SOURCE — which was true, and irrelevant, because source order is
// not execution order.
//
// Extracting the decision makes it a value, not a control-flow accident: it can be
// asserted directly for every combination of open overlays, with no React, no DOM, and no
// batching semantics in the way. The caller's only job is to read current state (via a
// latest-ref, since the listener registers once) and apply the verdict.
//
// A third overlay added later belongs HERE, in the union and the table below — not as
// another `if` in the keydown handler.

/** Which overlays are currently mounted. */
export interface OverlayState {
  /** The ⌘⇧A global time-analytics dashboard (z-index 40). */
  dashboard: boolean;
  /** The ⌘, Settings panel (z-index 45 — in front of the dashboard). */
  settings: boolean;
}

/**
 * The overlay an Esc keypress should dismiss, or `null` when Esc is not ours to consume.
 *
 * `null` is meaningful: with no overlay open, Esc must pass through untouched so the
 * editor, finder, palette, and terminal keep their own Esc handling. Swallowing it to do
 * nothing is the "registered-with-a-no-op-handler" shape the gate's seam contract forbids
 * elsewhere in this milestone.
 */
export function escDismissTarget(
  state: OverlayState,
): "settings" | "dashboard" | null {
  // Front-most first. Settings (45) outranks the dashboard (40), so when both are open
  // Esc closes Settings and leaves the dashboard up — the user is returned to the surface
  // they opened Settings *from*, not dumped out of both.
  if (state.settings) return "settings";
  if (state.dashboard) return "dashboard";
  return null;
}
