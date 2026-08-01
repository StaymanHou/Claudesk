// WP5 — pure core for the RightPanelHost panel-select logic.
//
// The right half of a workspace shows exactly one of three panels: the CM6 editor,
// the git diff viewer, or the WP9 second terminal. WP5 replaces the WP4 stopgap
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
//   ⌘⇧E → Editor   ⌘⇧D → Diff   ⌘⇧T → Terminal (WP9)   ⌘⇧K → Docs (M11, GATED)
//   ⌘⇧O → Sublime Text pop (transitional)   ⌘⇧P → palette
//   ⌘P → finder (WP6 — LIVE; bare meta, no shift; finder/finderChord.ts)
//   ⌘⇧A → GLOBAL time-analytics dashboard (M9 WP6a) — NOT a panel; an app-level
//         chord in App.tsx (dashboard/dashboardChord.ts). Listed here only so the
//         ownership map stays complete; panelForChord deliberately does NOT map "a".
// All app-level chords use the WP1-proven capture-phase document listener.

import type { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";

/** The gate's value, typed as exactly what the seam hook returns.
 *
 * ── Why this indirection exists (it is not decoration) ──
 * This module is PURE (no React), so it cannot call `useWorkflowFeaturesEnabled()` itself
 * — its callers do, and pass the result in. But "the caller promises to pass the gate" is
 * a convention, and the M10.9 OFF-invariant guard rightly refuses to accept a convention:
 * its chord arm strips comments before matching, so a module that names a workflow term
 * must reference the seam in EXECUTABLE source, not in prose.
 *
 * Deriving the parameter type from the hook's own return type makes that reference real
 * and machine-checked. If the seam ever changes shape (say to a `{enabled, loading}`
 * object), every `enabled` parameter in this file breaks at compile time instead of
 * silently accepting the wrong value. The dependency is structural, which is precisely
 * what the guard is asking for.
 */
type WorkflowGateValue = ReturnType<typeof useWorkflowFeaturesEnabled>;

/** Which right-half panel is front.
 *
 * `"docs"` (M11) is a GATED member: it is only ever selectable while
 * `workflow_features_enabled` is on. Its presence in this union is a type-level statement
 * that the value can exist, NOT that it is available — availability is decided at runtime
 * by [`availablePanels`], and every transition routes through [`selectPanel`].
 */
export type RightPanel = "editor" | "diff" | "terminal" | "docs";

/** The panels available while the workflow gate is OFF — the ungated baseline.
 *
 * This is the OFF-state value the M10.9 OFF-invariant guard asserts against. It is
 * deliberately a separate constant rather than a filter over the union, so the guard has
 * a literal to check and a future gated panel cannot sneak in by being absent from a
 * blocklist.
 */
export const AVAILABLE_PANELS: readonly RightPanel[] = [
  "editor",
  "diff",
  "terminal",
];

/** The panels available while the workflow gate is ON — the baseline plus `"docs"`. */
const AVAILABLE_PANELS_WITH_WORKFLOW: readonly RightPanel[] = [
  ...AVAILABLE_PANELS,
  "docs",
];

/**
 * Which panels are mountable right now, derived from the workflow-features gate.
 *
 * ── Why this is gate-DERIVED rather than a static array (M11 WP2, decision D1) ──
 * M10.9's seam contract is that a gated surface must not EXIST when the gate is off —
 * not rendered-then-hidden, not present-but-disabled. A static `AVAILABLE_PANELS`
 * containing `"docs"` would violate that; a static one omitting it could never show the
 * panel at all. So the registry itself became a function of the gate.
 *
 * The OFF-invariant guard's own header anticipates exactly this move ("If M11 makes
 * AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that
 * computation rather than deleting the assertion"), and the guard now asserts
 * `availablePanels(false)`. The seam reference the guard's chord arm demands lives in
 * `WorkflowGateValue` above — in executable source, since the arm strips comments before
 * matching (measured: a comment-only mention did NOT satisfy it).
 */
export function availablePanels(
  enabled: WorkflowGateValue,
): readonly RightPanel[] {
  return enabled ? AVAILABLE_PANELS_WITH_WORKFLOW : AVAILABLE_PANELS;
}

/**
 * Direct-select the target panel.
 *
 * Returns the panel to make front. Idempotent (selecting the current panel returns it
 * unchanged). A target not in [`AVAILABLE_PANELS`] is a graceful no-op — we keep the
 * current panel rather than flip to an unmounted (blank) slot. As of WP9 all three
 * panels are available, so the no-op branch is dormant; it's kept as the structural
 * guard against ever selecting a panel that has no mounted JSX slot (the
 * SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED failure mode).
 */
export function selectPanel(
  current: RightPanel,
  target: RightPanel,
  enabled: WorkflowGateValue = false,
): RightPanel {
  if (!availablePanels(enabled).includes(target)) {
    return current;
  }
  return target;
}

/**
 * Reconcile a front panel against the gate — the OFF-invariant's *standing* half.
 *
 * [`selectPanel`] guards transitions INTO a panel; it never re-examines one already front.
 * The gate is runtime-toggleable (⌘, Settings), so a user can have Docs front and then
 * turn the gate off — leaving `panel === "docs"` with nothing to correct it. The type
 * system cannot catch this: the value is already in `useState`, so no assignment happens
 * at flip time and nothing type-checks. That is a dead gated surface in exactly the state
 * M10.9 forbids.
 *
 * Returns the panel that should be front: the current one if it is still available, else
 * the safe fallback (`"editor"`, always ungated). Idempotent, so it is safe to run on
 * every render or in an effect that fires on any gate change.
 */
export function reconcilePanel(
  current: RightPanel,
  enabled: WorkflowGateValue,
): RightPanel {
  return availablePanels(enabled).includes(current) ? current : "editor";
}

// WP11 — `railVisibleForPanel` (a pure "rail visible for this panel?" predicate)
// was removed in Phase 5: the FileTree rail is no longer CSS-hidden per panel — it
// now lives STRUCTURALLY inside the editor slot (RightPanelHost), so it only exists
// when the Editor panel is rendered. The editor-only guarantee is structural, not a
// computed visibility flag.

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
 * NOTE (M9 WP6a): ⌘⇧A is the GLOBAL dashboard chord, handled app-level in App.tsx
 * (dashboard/dashboardChord.ts) — NOT a panel, so it is deliberately absent here.
 */
export function panelForChord(
  e: PanelChordEvent,
  enabled: WorkflowGateValue = false,
): RightPanel | null {
  if (!e.metaKey || !e.shiftKey) return null;
  switch (e.key.toLowerCase()) {
    case "e":
      return "editor";
    case "d":
      return "diff";
    case "t":
      return "terminal";
    // M11 — ⌘⇧K → Docs. GATED: returns null while the workflow gate is off, so the
    // listener never calls preventDefault and the keystroke passes through untouched.
    // A chord that matched-then-no-opped would still SWALLOW the key, which the M10.9
    // seam contract names explicitly as a forbidden "registered-with-a-no-op-handler".
    // (⌘⇧K over ⌘⇧G: `G` reads as "git" beside the Diff panel and would mis-cue. Both
    // were verified free at M11 activation.)
    case "k":
      return enabled ? "docs" : null;
    default:
      return null;
  }
}
