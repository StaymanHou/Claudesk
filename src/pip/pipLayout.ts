// M5 WP4 — PiP layout modes (the pure core).
//
// WP3 shipped ONE hardcoded layout (the horizontal-mirror tile row). WP4 generalizes
// to FOUR layouts, richest → most minimal:
//   1. horizontal-mirror — live thumbnails in a row (WP3's default).
//   2. vertical-mirror    — same live thumbnails, stacked vertically.
//   3. compact            — project name + status dot only, stacked (NO mirror).
//   4. minimal            — status dots only, no names, no mirror.
//
// This module is the pure (no React / no Tauri IPC) core so the layout vocabulary,
// the "does this layout render a serialize mirror?" predicate, and the cycle order are
// vitest-pinnable independent of the render/IPC wiring (repo posture: pure logic →
// vitest, listen/emit/resize → verify-self). The Rust side mirrors `PipLayout` verbatim
// (serde kebab-case) so the on-the-wire string is identical end-to-end — same discipline
// as the `workspace-status` wire contract (see state/workspaceStatus.ts).
//
// LAYOUT IS BACKEND-OWNED (single source of truth): the switcher calls `pip_set_layout`,
// the backend persists + resizes the NSPanel + broadcasts `pip-layout` to all webviews;
// the PiP re-renders from that broadcast (it does NOT set its layout optimistically). So
// the resize (backend) and the render (frontend) always read ONE value — same pattern as
// the `pip-visibility` cost gate.

/**
 * The four PiP layouts. The string values are the wire contract — they must stay
 * byte-identical to the Rust `pip::layout::PipLayout` serde kebab-case rendering
 * (`pip_set_layout`/`pip_get_layout` IPC + the `pip-layout` event payload).
 */
export type PipLayout =
  | "horizontal-mirror"
  | "vertical-mirror"
  | "compact"
  | "minimal";

/** The default layout on first run (before any persisted choice) — WP3's layout. */
export const DEFAULT_PIP_LAYOUT: PipLayout = "horizontal-mirror";

/** The event (all webviews) carrying the active layout — mirrors Rust `PIP_LAYOUT_EVENT`. */
export const PIP_LAYOUT_EVENT = "pip-layout";

/**
 * The cycle order the on-panel switcher steps through (richest → most minimal, wrapping).
 * Single source of truth for both the switcher's `nextLayout` and any "all layouts" loop.
 */
export const PIP_LAYOUT_CYCLE: readonly PipLayout[] = [
  "horizontal-mirror",
  "vertical-mirror",
  "compact",
  "minimal",
];

/**
 * True only for the layouts that render a live `serializeAsHTML()` mirror (the two
 * mirror layouts). Compact + minimal render no mirror, so when one is active the PiP
 * pays NO serialize cost — `useMirrorTicker` gates its PiP serialize/emit on this (the
 * same "stop the loop when not showing thumbnails" discipline as filmstrip-collapse).
 */
export function layoutNeedsMirror(layout: PipLayout): boolean {
  return layout === "horizontal-mirror" || layout === "vertical-mirror";
}

/**
 * The next layout in the cycle (wraps after the last). Pure — the switcher computes
 * this, then calls `pip_set_layout` with the result (it does NOT mutate its own state
 * directly; the backend broadcast is the source of truth). An unrecognized current
 * value falls back to the first cycle entry (defensive, never throws).
 */
export function nextLayout(current: PipLayout): PipLayout {
  const idx = PIP_LAYOUT_CYCLE.indexOf(current);
  if (idx === -1) return PIP_LAYOUT_CYCLE[0];
  return PIP_LAYOUT_CYCLE[(idx + 1) % PIP_LAYOUT_CYCLE.length];
}

/**
 * Normalize an arbitrary persisted/wire string to a known layout, defaulting on any
 * unrecognized value. Used when reading `pip_get_layout` / a `pip-layout` payload so a
 * stale or corrupt value never renders a broken panel (honest fall-back to the default).
 */
export function coercePipLayout(value: unknown): PipLayout {
  return PIP_LAYOUT_CYCLE.includes(value as PipLayout)
    ? (value as PipLayout)
    : DEFAULT_PIP_LAYOUT;
}

// ── Phase 4: minimal-layout attention weighting ────────────────────────────────
//
// The minimal layout answers the operator's "is anyone waiting on me?" glance for the
// all-instances-busy case. Two pure helpers support it (the POP styling itself is CSS):
//   1. `isAwaitingInput` — the single predicate for "this workspace needs me" (keyed on
//      the wire `awaiting_input` state, the ONE source of truth — see workspaceStatus.ts).
//   2. `orderForAttention` — stable-sort awaiting-input workspaces to the FRONT, otherwise
//      preserving the incoming (persisted filmstrip) order, so "needs me" rises to where
//      the eye lands first without scrambling the calm row of running/idle dots.

/** A minimal structural subset of the wire status map this module needs — each entry
 *  exposes at least a `state` string (`WorkspaceStatusMap` satisfies this). Kept narrow
 *  so this module doesn't depend on the full `workspaceStatus` types. */
export type AttentionStatusMap = Record<string, { state: string }>;

/** The wire state literal that means "this workspace is waiting on the operator". Kept
 *  in sync with `WireWorkspaceState`'s `awaiting_input` (snake_case wire contract). */
export const AWAITING_INPUT_STATE = "awaiting_input";

/** True iff the workspace's current wire state is awaiting-input (the "needs me" cue). */
export function isAwaitingInput(
  statusMap: AttentionStatusMap,
  workspaceId: string,
): boolean {
  return statusMap[workspaceId]?.state === AWAITING_INPUT_STATE;
}

/**
 * Stable-sort `items` so awaiting-input workspaces come FIRST, with all other ordering
 * (the persisted filmstrip order) preserved within each group. Pure + stable: ties keep
 * their incoming order; an all-running (or all-idle) roster is returned in its original
 * order untouched. Generic over any item carrying an `id` so the PiP can pass its tiles.
 *
 * Why stable + group-only: the operator's glance wants "needs me" pulled to the front
 * WITHOUT reshuffling the rest each tick (a churning dot row is worse than a calm one) —
 * see the minimal-layout intent in the WIP problem statement.
 */
export function orderForAttention<T extends { id: string }>(
  items: readonly T[],
  statusMap: AttentionStatusMap,
): T[] {
  // A single stable partition: awaiting-input first, everything else after, each group
  // in its original relative order. (Array.prototype.sort is stable in modern engines,
  // but an explicit partition is unambiguously stable and clearer than a comparator.)
  const awaiting: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (isAwaitingInput(statusMap, item.id)) awaiting.push(item);
    else rest.push(item);
  }
  return [...awaiting, ...rest];
}
