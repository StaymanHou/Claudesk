// WP11 Part C — pure helpers for the drag-to-resize file-tree rail.
//
// The rail width (Part A set a fixed 299px) is now USER-ADJUSTABLE via a drag handle
// (RightPanelHost), persisted across app restarts. This module is the pure (no
// React/DOM) core: the clamp bounds + the localStorage load/save — vitest-testable
// per the repo posture (pure logic → vitest, live DOM → Playwright).
//
// Persistence is app-global localStorage (UI chrome, not project data — no backend
// command, consistent with the rail-collapse preference being frontend-only). The
// Part-A 299px CSS rule remains the FALLBACK default; once a width is stored or
// dragged, an inline style on the rail overrides it.

/** Smallest the rail may be dragged to (still shows a useful slice of filenames). */
export const RAIL_MIN = 160;
/** Largest the rail may be dragged to (leaves room for the editor in the 50/50 split). */
export const RAIL_MAX = 600;
/** The default width when nothing is stored — matches the Part-A CSS value (299px). */
export const RAIL_DEFAULT = 299;

/** localStorage key for the persisted rail width (app-global UI chrome). */
export const RAIL_WIDTH_KEY = "claudesk.fileTreeRailWidth";

/** Clamp a candidate width to [RAIL_MIN, RAIL_MAX]. Non-finite → RAIL_DEFAULT. */
export function clampRailWidth(px: number): number {
  if (!Number.isFinite(px)) return RAIL_DEFAULT;
  if (px < RAIL_MIN) return RAIL_MIN;
  if (px > RAIL_MAX) return RAIL_MAX;
  return Math.round(px);
}

/**
 * Read the persisted rail width, clamped. Returns RAIL_DEFAULT when nothing is
 * stored, the value is unparseable, or localStorage is unavailable — never throws.
 */
export function loadRailWidth(): number {
  try {
    const raw = localStorage.getItem(RAIL_WIDTH_KEY);
    if (raw == null) return RAIL_DEFAULT;
    const px = Number.parseInt(raw, 10);
    if (Number.isNaN(px)) return RAIL_DEFAULT;
    return clampRailWidth(px);
  } catch {
    return RAIL_DEFAULT;
  }
}

/** Persist the rail width (clamped first). Swallows storage errors (best-effort). */
export function saveRailWidth(px: number): void {
  try {
    localStorage.setItem(RAIL_WIDTH_KEY, String(clampRailWidth(px)));
  } catch {
    /* storage unavailable / quota — a non-persisted width is acceptable */
  }
}

/**
 * The largest fraction of the containing right-panel width the rail may occupy.
 * At a narrow panel (e.g. the M6 WP3 3:1 split → ~320px) the stored/dragged rail
 * width (default ~299px) would otherwise crowd the editor into an unusable sliver.
 * Capping the *applied* width to half the panel guarantees the editor always keeps
 * at least the other half. At wide panels the cap never bites (panel*0.5 ≫ the
 * stored width), so the user's dragged width is honored unchanged.
 */
export const RAIL_MAX_PANEL_FRACTION = 0.5;

/**
 * The rail width to actually APPLY, given the stored/dragged width and the live
 * containing-panel width. Caps to RAIL_MAX_PANEL_FRACTION of the panel so the
 * editor stays usable at narrow splits — but NEVER below RAIL_MIN (a too-narrow
 * panel keeps a usable-minimum rail rather than vanishing it), and never above the
 * stored width (widening the panel restores exactly the dragged width). A
 * non-positive/non-finite panelWidth (not yet measured) → the stored width
 * unchanged, so first paint matches today.
 */
export function effectiveRailWidth(
  storedWidth: number,
  panelWidth: number,
): number {
  if (!Number.isFinite(panelWidth) || panelWidth <= 0) return storedWidth;
  const cap = Math.max(RAIL_MIN, panelWidth * RAIL_MAX_PANEL_FRACTION);
  return Math.min(storedWidth, cap);
}
