// M9 WP6a — the 6-kind segment vocabulary + the AI-vs-human color-family model.
//
// The source dashboard.jsx used a 5-kind LIGHT enum (active/reading/thinking/subagent/
// away). WP3 redesigned the reclassifier to the 6-kind KEBAB set that WP4's DTO ships
// (`timeAnalytics.SegKind`): the old `active` split into `ai-doing` (tool execution) +
// `typing` (human keystrokes), `reading`→`reviewing`, `thinking`→`ai-reasoning`. This
// module is the single place every kind→color / kind→family / kind-ordering / kind-sum
// decision lives, so the port's ~15 old-enum sites all consume ONE source of truth.
//
// COLOR FAMILIES (SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN): AI-execution
// activity reads from one hue lineage, human activity from another. Palette values live
// in tokens.ts; this module maps kind → token + kind → family.

import type { CSSProperties } from "react";
import type { SegKind } from "../../../state/timeAnalytics";
import { CT_TOKENS } from "./tokens";

export type { SegKind };

/** Which family a kind belongs to (drives the hue lineage + the "active work" sum). */
export type KindFamily = "ai" | "human";

/** AI-execution kinds: the agent is doing/thinking/delegating. */
export const AI_KINDS: readonly SegKind[] = [
  "ai-doing",
  "subagent",
  "ai-reasoning",
];

/** Human kinds: the operator is typing/reviewing, or away. */
export const HUMAN_KINDS: readonly SegKind[] = ["typing", "reviewing", "away"];

/** kind → family. */
export function familyOf(kind: SegKind): KindFamily {
  return AI_KINDS.includes(kind) ? "ai" : "human";
}

/** The full kind set (used for legend + filter defaults). */
export const ALL_KINDS: readonly SegKind[] = [...AI_KINDS, ...HUMAN_KINDS];

/**
 * kind → its palette fill token. `away` has no solid fill (it's rendered as
 * subtractive stripes via {@link segStyle}); callers that need a swatch color for the
 * legend use `awayBase`.
 */
export function colorForKind(kind: SegKind): string {
  switch (kind) {
    case "ai-doing":
      return CT_TOKENS["ai-doing"];
    case "subagent":
      return CT_TOKENS.subagent;
    case "ai-reasoning":
      return CT_TOKENS["ai-reasoning"];
    case "reviewing":
      return CT_TOKENS.reviewing;
    case "typing":
      return CT_TOKENS.typing;
    case "away":
      return CT_TOKENS.awayBase;
    default:
      return CT_TOKENS.surfaceAlt; // defensive — unknown kind
  }
}

/**
 * The CSS fill for a segment bar. Solid `background` for every kind except `away`,
 * which is rendered as diagonal hairline stripes (subtractive — it reads as "gap").
 * Ported from dashboard.jsx `segStyle` (L252-262), remapped to the 6-kind set.
 */
export function segStyle(kind: SegKind): CSSProperties {
  if (kind === "away") {
    return {
      backgroundColor: CT_TOKENS.awayBase,
      backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, ${CT_TOKENS.awayStripe} 3px 5px)`,
    };
  }
  return { background: colorForKind(kind) };
}

/**
 * Bottom-to-top paint order for the collapsed-track merged bands (ported from the
 * source `renderOrder`, L2447, remapped): away first (backmost), then the engagement
 * kinds, with the most salient (ai-doing + subagent) on top.
 */
export const RENDER_ORDER: readonly SegKind[] = [
  "away",
  "reviewing",
  "ai-reasoning",
  "typing",
  "ai-doing",
  "subagent",
];

/** One tiled segment (mirrors `timeAnalytics.SegPayload` sans `label`). */
interface KindSpan {
  kind: SegKind;
  start: number;
  end: number;
}

/** Total minutes of segments of exactly `kind`. (Ported `sumKind`, L54.) */
export function sumByKind(segs: readonly KindSpan[], kind: SegKind): number {
  return segs
    .filter((s) => s.kind === kind)
    .reduce((a, s) => a + (s.end - s.start), 0);
}

/**
 * Total "active work" minutes = the AI-execution family (ai-doing + subagent +
 * ai-reasoning). Ported from `sumActive` (L53) — the old code summed `active`+`subagent`;
 * the 6-kind analogue is the whole AI family (the agent doing real work), which is what
 * the SummaryStrip "Active" stat + the longest-session ranking measure.
 */
export function sumActive(segs: readonly KindSpan[]): number {
  return segs
    .filter((s) => AI_KINDS.includes(s.kind))
    .reduce((a, s) => a + (s.end - s.start), 0);
}

/** Human-facing legend label per kind. */
export function labelForKind(kind: SegKind): string {
  switch (kind) {
    case "ai-doing":
      return "AI · doing";
    case "subagent":
      return "Subagent";
    case "ai-reasoning":
      return "AI · reasoning";
    case "reviewing":
      return "Reviewing";
    case "typing":
      return "Typing";
    case "away":
      return "Away";
    default:
      return kind;
  }
}
