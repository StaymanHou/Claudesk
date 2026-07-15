// M9 WP6a — dark design tokens for the time-analytics dashboard.
//
// Lifted from the WP1 dark-render spike (docs/product/wp1-time-analytics-probe-outcome.md
// §b) — the LIGHT source `CT_TOKENS` (dashboard.jsx L12-38) inverted to dark via the
// OKLCH lightness-first method: neutral surface/text ramp flips the L channel keeping
// chroma/hue; base surfaces anchored to Claudesk's #1e1e1e/#2a2a2a. Two non-mechanical
// exceptions from WP1: (1) grid lines → white-alpha (a hairline over dark, not black);
// (2) away stripes → DARKER, not lighter (subtractive stripes must recede on dark).
//
// The 6 semantic segment colors are assigned by the AI-vs-human COLOR FAMILY split
// (SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN). Iterated twice at P3 verify-human
// (2026-07-08): (1) the first palette collided across families (subagent-teal ≈ typing-
// green; ai-doing-indigo ≈ reviewing-lavender); (2) the warm amber/orange retune read as
// "warnings" (wrong for good human-engagement activity). FINAL assignment:
//   AI-execution family  — COOL blue→violet: ai-doing (indigo) / ai-reasoning (blue) / subagent (violet)
//   Human family         — GREEN (go/healthy/human, no alarm): typing (emerald) / reviewing (yellow-green)
//   Away                 — neutral darker stripes
// AI hues 240–300 vs human hues 135–155 stay well separated (no cross-family collision).
// Text ON a fill is chosen by luminance via `textOn()` (never a hardcoded #fff), so the
// ink stays legible on every fill AND auto-adapts to the lightnesses.

export const CT_TOKENS = {
  // ── Neutral surface / text ramp (dark) ──────────────────────────────
  bg: "#1e1e1e",
  surface: "#252526",
  surfaceAlt: "#2a2a2a",
  surfaceDim: "#202020",
  border: "oklch(1 0 0 / 0.10)",
  borderStrong: "oklch(1 0 0 / 0.18)",
  textPrimary: "oklch(0.96 0.01 60)",
  textSecondary: "oklch(0.74 0.01 60)",
  textTertiary: "oklch(0.60 0.01 60)",
  textMuted: "oklch(0.48 0.01 60)",

  // ── Semantic segment fills — the 6-kind family palette (P3-retuned) ──
  // AI-execution family — COOL blue→violet lineage (hues 268/240/300):
  "ai-doing": "oklch(0.50 0.17 268)", // indigo
  "ai-reasoning": "oklch(0.58 0.14 240)", // blue
  subagent: "oklch(0.52 0.16 300)", // violet
  // Human family — GREEN lineage (hues 155/135; go/healthy, no alarm connotation):
  typing: "oklch(0.62 0.13 155)", // emerald
  reviewing: "oklch(0.66 0.12 135)", // yellow-green
  // Away — subtractive hairline stripes (neutral darker pair, not a solid fill):
  awayBase: "oklch(0.22 0.008 80)",
  awayStripe: "oklch(0.28 0.008 80)",

  // ── Grid / row chrome ────────────────────────────────────────────────
  gridHour: "oklch(1 0 0 / 0.04)",
  gridDay: "oklch(1 0 0 / 0.10)",
  rowAlt: "oklch(1 0 0 / 0.02)",
  // Live "now" marker (WP6b-4) — a warm accent DISTINCT from the neutral grid + from
  // the cool AI / green human seg families, so the current-time line reads as chrome
  // (a "you are here" tick), not as a segment. Deliberately the one warm hue on the
  // surface; low-chroma so it's a hairline, not an alarm.
  nowMarker: "oklch(0.70 0.15 45)",

  sans: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

// ── Luminance-based ink (textOn) ──────────────────────────────────────
// Lifted verbatim from the WP1 contrast fix. Reads the fill's OKLCH L channel and
// returns near-black for bright fills (L > 0.6) or light for dark fills, so on-fill
// text (subagent labels, active-minute pills) is legible on EVERY kind and survives
// a WP3 recolor with no code change. Non-OKLCH inputs fall back to light ink.
const INK_DARK = "#111111";
const INK_LIGHT = "#f6f6f6";

/** Parse the L channel out of an `oklch(L C H ...)` string; null if not oklch. */
function oklchLightness(color: string): number | null {
  const m = /^oklch\(\s*([0-9.]+)/i.exec(color.trim());
  if (!m) return null;
  const l = parseFloat(m[1]);
  return Number.isFinite(l) ? l : null;
}

/**
 * Pick legible ink for text drawn ON `bg`. Bright fills (OKLCH L > 0.6) get near-black
 * ink; darker fills get light ink. Non-OKLCH fills default to light ink (the dashboard's
 * fills are all OKLCH, so this is only the defensive fallback).
 */
export function textOn(bg: string): string {
  const l = oklchLightness(bg);
  if (l === null) return INK_LIGHT;
  return l > 0.6 ? INK_DARK : INK_LIGHT;
}
