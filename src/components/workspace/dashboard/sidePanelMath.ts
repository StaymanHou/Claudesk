// M9 WP6b-2 Phase 4 — pure helpers for the session SidePanel.
//
// Two pure functions the SidePanel consumes, extracted here so they're vitest-pinnable
// in isolation (same posture as kinds.ts / dayStats.ts / weekMath.ts / monthMath.ts):
//   - resolveSelectedSeg — parse a `"<sessionId>:<segIndex>"` selection id + a
//     RangePayload into the {project, session, segIndex} it points at (or null).
//   - sessionBreakdown — the 6-kind activity-breakdown rows for a session's segs.
//
// The seg-id format is `` `${session.id}:${segIndex}` `` — the SAME shape SessionRow
// builds at DayTimeline.tsx (`selected={`${session.id}:${i}` === selectedSegId}`) and
// the click handler emits. A session id can itself contain colons (CC session ids are
// UUID-ish but future-proof against `:`), so we split on the LAST colon: everything
// before it is the session id, the trailing numeric run is the seg index.

import type {
  RangePayload,
  ProjectPayload,
  SessionPayload,
} from "../../../state/timeAnalytics";
import { ALL_KINDS, colorForKind, labelForKind, sumByKind } from "./kinds";
import type { SegKind } from "./kinds";

/** The resolved target of a selection id. */
export interface SelectedSeg {
  project: ProjectPayload;
  session: SessionPayload;
  /** Index into `session.segs` of the clicked segment. */
  segIndex: number;
}

/**
 * Resolve a `"<sessionId>:<segIndex>"` selection id against a day payload.
 * Returns the containing project + session + the seg index, or `null` if the id is
 * malformed, the session isn't present (e.g. the payload changed under a stale
 * selection), or the index is out of range. Splitting on the LAST colon tolerates a
 * session id that itself contains colons.
 */
export function resolveSelectedSeg(
  id: string | null | undefined,
  data: RangePayload | null | undefined,
): SelectedSeg | null {
  if (!id || !data) return null;
  const lastColon = id.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === id.length - 1) return null; // no sep / empty half
  const sessionId = id.slice(0, lastColon);
  const idxStr = id.slice(lastColon + 1);
  if (!/^\d+$/.test(idxStr)) return null; // seg index must be a non-negative integer
  const segIndex = Number(idxStr);
  for (const project of data.projects) {
    for (const session of project.sessions) {
      if (session.id === sessionId) {
        if (segIndex < 0 || segIndex >= session.segs.length) return null;
        return { project, session, segIndex };
      }
    }
  }
  return null;
}

/** One activity-breakdown row: a kind's minutes + its swatch color + label. */
export interface BreakdownRow {
  kind: SegKind;
  label: string;
  minutes: number;
  color: string;
}

/**
 * The per-kind activity breakdown for a session's segments — one row per kind that has
 * >0 minutes, in `ALL_KINDS` order (AI family first, then human). Sums TRUE `dur_ms`
 * via `sumByKind` (never the minute-quantized `end - start`), so sub-minute AI work
 * still accrues (SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…). The source's 4-row
 * fixed list (`Active coding`/`Subagent`/`Reading`/`Thinking`) is replaced by the full
 * 6-kind set filtered to non-zero.
 */
export function sessionBreakdown(session: SessionPayload): BreakdownRow[] {
  return ALL_KINDS.map((kind) => ({
    kind,
    label: labelForKind(kind),
    minutes: sumByKind(session.segs, kind),
    color: colorForKind(kind),
  })).filter((r) => r.minutes > 0);
}
