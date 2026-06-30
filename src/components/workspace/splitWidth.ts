// M6 WP3 — pure helpers for the workspace split-ratio control.
//
// The outer left/right split (CC terminal ↔ RightPanelHost) is a DISCRETE,
// directly-selectable control — NOT a free-drag divider. The friend-user's real
// need is attention-switching between a few intents (CC focus / editor focus /
// balanced), so we model the intents with a small set of states rather than a
// continuous range (design prior: explicit-selectable-mode-over-inferred-mode;
// supersedes the wbs.md "drag divider" framing). This module is the pure core
// (no React/DOM): the state shape, its localStorage load/save, and the
// derivation to a `grid-template-columns` track string. Live DOM wiring lives in
// Workspace.tsx — vitest covers this pure logic per the repo posture.
//
// Persistence is app-global localStorage (UI chrome, not project data — no backend
// command, consistent with the file-tree rail width being frontend-only). The
// App.css `grid-template-columns: 1fr 1fr` rule remains the FALLBACK default; once
// a state is stored, an inline style on `.workspace` overrides it.
//
// Ships the three ratio presets + the cycle control AND the collapse selector (the
// two `◀ CC` / `ED ▶` toggles drive the `collapsed` field). `gridColumnsFor` handles
// every value of both fields.

/** Which half is fully collapsed (0 width). `none` = both visible at `ratio`. */
export type CollapsedHalf = "none" | "left" | "right";

/** The non-collapsed balance between the left (CC) and right (panel) halves. */
export type SplitRatio = "3:1" | "2:2" | "1:3";

/** The full persisted split state: a collapse selector + the last balance. */
export interface SplitState {
  collapsed: CollapsedHalf;
  ratio: SplitRatio;
}

/** localStorage key for the persisted split state (app-global UI chrome). */
export const SPLIT_STATE_KEY = "claudesk.workspace.splitState";

/** The default when nothing is stored — byte-identical to today's 50/50 layout. */
export const DEFAULT_SPLIT: SplitState = { collapsed: "none", ratio: "2:2" };

/** The ratios in cycle order. The cycle button steps through these (wrapping). */
const RATIO_CYCLE: readonly SplitRatio[] = ["3:1", "2:2", "1:3"] as const;

/** `grid-template-columns` track for each non-collapsed ratio. */
const RATIO_TRACKS: Record<SplitRatio, string> = {
  "3:1": "3fr 1fr",
  "2:2": "1fr 1fr",
  "1:3": "1fr 3fr",
};

function isCollapsedHalf(v: unknown): v is CollapsedHalf {
  return v === "none" || v === "left" || v === "right";
}

function isSplitRatio(v: unknown): v is SplitRatio {
  return v === "3:1" || v === "2:2" || v === "1:3";
}

/**
 * Derive the effective `grid-template-columns` track string from a split state.
 *
 * A collapsed half gets `display:none` in the DOM (so XtermPane's existing
 * `offsetParent === null` fit-guard fires — no fit-to-0 crash; see Workspace.tsx).
 * `display:none` REMOVES that half from grid flow, so the grid must declare a
 * SINGLE `1fr` track — the one remaining (visible) item fills it. A two-track
 * `0 1fr` would mis-place the lone visible item into the first (`0`) track,
 * collapsing the visible half to ~0px (the bug found at P2 verify-human). With one
 * displayed item + one track, the visible half always gets the full width.
 * `none` maps to the ratio's two-fr track (both halves displayed).
 */
export function gridColumnsFor(state: SplitState): string {
  if (state.collapsed !== "none") return "1fr"; // one half hidden → single track
  return RATIO_TRACKS[state.ratio] ?? RATIO_TRACKS["2:2"];
}

/** The next ratio in the cycle (3:1 → 2:2 → 1:3 → 3:1). Unknown → default. */
export function cycleRatio(ratio: SplitRatio): SplitRatio {
  const i = RATIO_CYCLE.indexOf(ratio);
  if (i < 0) return DEFAULT_SPLIT.ratio;
  return RATIO_CYCLE[(i + 1) % RATIO_CYCLE.length];
}

/**
 * Toggle a collapse half. The `ratio` field is the "last balance" and is preserved
 * untouched across collapse/restore, so toggling a collapse OFF returns to exactly
 * the ratio the user had before. Semantics:
 *  - half already collapsed → restore (collapsed:'none', ratio kept)
 *  - half NOT collapsed (other half collapsed OR none) → collapse this half
 *    (mutual exclusion: at most one half is ever collapsed — collapsing one while
 *    the other was collapsed simply moves the collapse to the requested half)
 */
export function toggleCollapse(
  state: SplitState,
  half: "left" | "right",
): SplitState {
  if (state.collapsed === half) {
    return { ...state, collapsed: "none" };
  }
  return { ...state, collapsed: half };
}

/**
 * Read the persisted split state. Returns DEFAULT_SPLIT when nothing is stored,
 * the value is unparseable, a field is invalid, or localStorage is unavailable —
 * never throws. An unknown field falls back to its default independently.
 */
export function loadSplitState(): SplitState {
  try {
    const raw = localStorage.getItem(SPLIT_STATE_KEY);
    if (raw == null) return DEFAULT_SPLIT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SPLIT;
    const obj = parsed as Record<string, unknown>;
    return {
      collapsed: isCollapsedHalf(obj.collapsed)
        ? obj.collapsed
        : DEFAULT_SPLIT.collapsed,
      ratio: isSplitRatio(obj.ratio) ? obj.ratio : DEFAULT_SPLIT.ratio,
    };
  } catch {
    return DEFAULT_SPLIT;
  }
}

/** Persist the split state. Swallows storage errors (best-effort). */
export function saveSplitState(state: SplitState): void {
  try {
    localStorage.setItem(SPLIT_STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable / quota — a non-persisted state is acceptable */
  }
}
