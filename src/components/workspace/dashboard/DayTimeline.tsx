// M9 WP6a — the day-view timeline (project list + sessions), ported from the
// standalone claude-time dashboard.jsx `DayTimeline` chain (L2158-3137) into a
// dark-themed, React-19 TSX module for Claudesk's GLOBAL analytics view.
//
// FIXED-VIEWPORT SIMPLIFICATION (WP6a is day-only — no zoom/pan/range-nav):
// the source was coupled to ViewportContext (interactive zoom/pan),
// DataWindowContext, FilterContext, hash-state, and multi-day `dayOffset`. All
// of that is eliminated here:
//   - The viewport is FIXED to the day's hour range, computed once in
//     `DayTimeline` from `RangePayload.hour_range` (fallback [6,23]) and passed
//     DOWN as a plain `viewport` prop (NOT a context).
//   - NO FilterContext — WP6a renders ALL kinds (the filter popover is WP6b).
//   - NO multi-day `dayOffset` — single-day only, so every offset is 0 and the
//     segment coordinate IS its minute-of-day.
//   - NO live "now" marker / useNowMin (static day render — no timer, no
//     `new Date()`).
//   - Overlaps: `detectSessionOverlaps` is ported locally + computed once in
//     `DayTimeline`; the `overlaps` map flows DOWN as a plain prop (NOT
//     OverlapsContext). Overlap detection is scoped **same-project-only** at the
//     source (operator definition, 2026-07-08), so no downstream peer-project
//     filter is needed. The marker + overlay rendering is kept — it's part of
//     the day-view value (concurrent-session signal).
//
// Palette / ink: colors come from `./tokens` (CT_TOKENS) + `./kinds`
// (segStyle/colorForKind — the 6-kind version; NOT the source's old 5-kind
// segStyle). On-fill text uses `textOn(fill)`, never a hardcoded `#fff`.

import { useMemo, type CSSProperties } from "react";
import type {
  RangePayload,
  ProjectPayload,
  SessionPayload,
  SegPayload,
} from "../../../state/timeAnalytics";
import { CT_TOKENS, textOn } from "./tokens";
import { segStyle, colorForKind, RENDER_ORDER, sumActive } from "./kinds";
import { IconChevDown, IconChevRight } from "./Icon";

// ── Geometry (ported verbatim from dashboard.jsx L2158-2160) ─────────────────
const ROW_LEFT_WIDTH = 232;
const ROW_HEIGHT = 36;
const PROJECT_HEADER_HEIGHT = 40;

// ── The fixed viewport (a plain prop, NOT a context) ─────────────────────────
/** Minutes-from-local-midnight bounds of the day the timeline renders. */
export interface Viewport {
  visible_start_min: number;
  visible_end_min: number;
}

const DEFAULT_HOUR_RANGE: [number, number] = [6, 23];

/** Compute the fixed viewport from a 1-day payload's `hour_range` (fallback [6,23]). */
function viewportFromHourRange(hourRange: [number, number] | undefined): Viewport {
  const [h0, h1] = hourRange ?? DEFAULT_HOUR_RANGE;
  return { visible_start_min: h0 * 60, visible_end_min: h1 * 60 };
}

// ── Formatting helpers (ported from dashboard.jsx L41-52) ────────────────────
function fmtDur(mins: number): string {
  if (mins < 1) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Viewport math (pure; the fixed-viewport analogue of the source helpers) ──
/** Percent left/width of a [start, end] minute span within the fixed viewport. */
function viewportPct(
  start: number,
  end: number,
  viewport: Viewport,
): { left: string; width: string } {
  const range = viewport.visible_end_min - viewport.visible_start_min;
  const left = ((start - viewport.visible_start_min) / range) * 100;
  const width = ((end - start) / range) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

/** The whole hours covered by the fixed viewport — one `HH:00` tick each. */
function hoursInViewport(viewport: Viewport): number[] {
  const startHour = Math.floor(viewport.visible_start_min / 60);
  const endHour = Math.ceil(viewport.visible_end_min / 60);
  const out: number[] = [];
  for (let h = startHour; h < endHour; h++) out.push(h);
  return out;
}

// ── Overlap detection (ported locally from dashboard.jsx L100-129) ───────────
// One peer overlap contributed to a session.
interface OverlapPeer {
  id: string;
  overlapStartMin: number;
  overlapEndMin: number;
}
export interface OverlapDesc {
  overlapMs: number;
  peers: OverlapPeer[];
}
/** session_id → its overlap descriptor. */
export type OverlapMap = Record<string, OverlapDesc>;

/**
 * O(N²) pairwise overlap detection, scoped **within each project**. An "overlap"
 * is two concurrent sessions IN THE SAME PROJECT whose `[start,end]` intervals
 * intersect (operator definition, 2026-07-08 — `SURFACE-2026-07-08-M9-WP6A-
 * OVERLAP-MUST-BE-SAME-PROJECT-ONLY`). Cross-project concurrency (e.g. a
 * long-lived agent session in one project running alongside a session in
 * another) is NOT an overlap and must contribute nothing. Pairing per-project
 * enforces this at the source, so both the marker layer and the overlay layer
 * are correct without any downstream same-project post-filter.
 *
 * WP6a is single-day, so the source's `day_iso` guard is a no-op here (all
 * sessions share the day) but is preserved for defensiveness. No filter-gating —
 * WP6a shows all kinds, so overlaps are always computed.
 */
export function detectSessionOverlaps(projects: ProjectPayload[]): OverlapMap {
  const out: OverlapMap = {};
  for (const p of projects) {
    const sessions = p.sessions;
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if ((a.day_iso ?? null) !== (b.day_iso ?? null)) continue;
        const ovStart = Math.max(a.start, b.start);
        const ovEnd = Math.min(a.end, b.end);
        if (ovEnd <= ovStart) continue; // no intersection (strict)
        const ovMin = ovEnd - ovStart;
        const ovMs = ovMin * 60 * 1000;
        if (!out[a.id]) out[a.id] = { overlapMs: 0, peers: [] };
        if (!out[b.id]) out[b.id] = { overlapMs: 0, peers: [] };
        out[a.id].overlapMs += ovMs;
        out[a.id].peers.push({
          id: b.id,
          overlapStartMin: ovStart,
          overlapEndMin: ovEnd,
        });
        out[b.id].overlapMs += ovMs;
        out[b.id].peers.push({
          id: a.id,
          overlapStartMin: ovStart,
          overlapEndMin: ovEnd,
        });
      }
    }
  }
  return out;
}

// ── Per-project filter-aware-free totals (WP6a: no filter, so plain sums) ────
interface ProjectTotals {
  activePlusSub: number;
  away: number;
}

/** Total minutes of `kind` across all segs (ported `sumKind`, L54). */
function sumKind(segs: SegPayload[], kind: SegPayload["kind"]): number {
  return segs
    .filter((s) => s.kind === kind)
    .reduce((a, s) => a + (s.end - s.start), 0);
}

// ── HourRuler ────────────────────────────────────────────────────────────────
// Simple `HH:00` ruler over the fixed viewport (the source's adaptive-density +
// multi-day tick-label formatting + NOW marker are all dropped for WP6a).
function HourRuler({ viewport }: { viewport: Viewport }) {
  const hours = hoursInViewport(viewport);
  const range = viewport.visible_end_min - viewport.visible_start_min;
  return (
    <div
      style={{
        height: 30,
        position: "relative",
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surfaceAlt,
        overflow: "hidden",
      }}
    >
      {hours.map((h) => {
        const min = h * 60;
        const leftPct = ((min - viewport.visible_start_min) / range) * 100;
        const widthPct = (60 / range) * 100;
        return (
          <div
            key={h}
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              top: 0,
              bottom: 0,
              borderRight: `1px solid ${CT_TOKENS.gridHour}`,
              display: "flex",
              alignItems: "center",
              paddingLeft: 6,
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                fontFamily: CT_TOKENS.mono,
                fontSize: 10.5,
                color: CT_TOKENS.textTertiary,
                letterSpacing: "0.02em",
              }}
            >
              {`${String(h).padStart(2, "0")}:00`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── HourGridBackground ───────────────────────────────────────────────────────
function HourGridBackground({ viewport }: { viewport: Viewport }) {
  const hours = hoursInViewport(viewport);
  const range = viewport.visible_end_min - viewport.visible_start_min;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {hours.map((h) => {
        const min = h * 60;
        const leftPct = ((min - viewport.visible_start_min) / range) * 100;
        const widthPct = (60 / range) * 100;
        return (
          <div
            key={h}
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              top: 0,
              bottom: 0,
              borderRight: `1px solid ${CT_TOKENS.gridHour}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

// ── SegmentBar ───────────────────────────────────────────────────────────────
// WP6a: no filter-gating (always render); no multi-day dayOffset (offset 0, so
// the seg coordinate IS its minute-of-day). Emits `data-seg-kind` (the 6-kind
// verify attribute) alongside the ported `data-kind`/`data-seg-id`.
function SegmentBar({
  seg,
  viewport,
  selected = false,
}: {
  seg: SegPayload;
  viewport: Viewport;
  selected?: boolean;
}) {
  const { left, width } = viewportPct(seg.start, seg.end, viewport);
  const isSubagent = seg.kind === "subagent";
  const height = isSubagent ? 14 : ROW_HEIGHT - 12;
  const top = isSubagent ? (ROW_HEIGHT - 14) / 2 + 4 : 6;
  return (
    <div
      title={`${seg.kind} · ${fmtClock(seg.start)}–${fmtClock(seg.end)}`}
      data-seg-id={`${seg.kind}-${seg.start}-${seg.end}`}
      data-kind={seg.kind}
      data-seg-kind={seg.kind}
      style={{
        position: "absolute",
        left,
        width,
        top,
        height,
        borderRadius: 3,
        ...segStyle(seg.kind),
        boxShadow: selected
          ? `0 0 0 2px ${CT_TOKENS.surface}, 0 0 0 4px ${colorForKind("ai-doing")}`
          : isSubagent
            ? `0 0 0 1px ${CT_TOKENS.surface}`
            : "none",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        paddingLeft: 5,
        minWidth: 2,
      }}
    >
      {isSubagent && seg.label && (
        <span
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 9.5,
            color: textOn(colorForKind("subagent")),
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {seg.label}
        </span>
      )}
    </div>
  );
}

// ── Merge-by-kind union for the collapsed track (ported L2331-2355) ──────────
// Returns kind → array of merged non-overlapping [start, end] intervals.
// WP6a: single-day, so no per-session dayOffset (coordinates are minute-of-day).
type IntervalsByKind = Record<string, [number, number][]>;

function mergeProjectIntervalsByKind(project: ProjectPayload): IntervalsByKind {
  const byKind: Record<string, [number, number][]> = {};
  for (const kind of RENDER_ORDER) byKind[kind] = [];
  for (const s of project.sessions) {
    for (const seg of s.segs) {
      if (byKind[seg.kind] === undefined) continue; // unknown kind — skip
      byKind[seg.kind].push([seg.start, seg.end]);
    }
  }
  const out: IntervalsByKind = {};
  for (const k of Object.keys(byKind)) {
    const sorted = byKind[k].slice().sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const iv of sorted) {
      if (merged.length === 0 || iv[0] > merged[merged.length - 1][1]) {
        merged.push([iv[0], iv[1]]);
      } else {
        merged[merged.length - 1][1] = Math.max(
          merged[merged.length - 1][1],
          iv[1],
        );
      }
    }
    out[k] = merged;
  }
  return out;
}

// ── OverlapMarkerLayer (ported L2369-2430) ───────────────────────────────────
// Hairline markers on the collapsed band at each within-project overlap
// interval. WP6a: no filter-gating. `overlaps` is already scoped same-project by
// `detectSessionOverlaps` (see its note), so no peer-project post-filter is
// needed — every peer here belongs to this project by construction.
function OverlapMarkerLayer({
  project,
  viewport,
  overlaps,
}: {
  project: ProjectPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
}) {
  const seen = new Set<string>();
  const markers: { peerId: string; start: number; end: number }[] = [];
  for (const s of project.sessions) {
    const desc = overlaps[s.id];
    if (!desc || !desc.peers) continue;
    for (const peer of desc.peers) {
      const start = peer.overlapStartMin;
      const end = peer.overlapEndMin;
      const key = `${peer.id}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ peerId: peer.id, start, end });
    }
  }
  if (markers.length === 0) return null;
  return (
    <>
      {markers.map((m, i) => {
        const mid = (m.start + m.end) / 2;
        const { left } = viewportPct(mid, mid + 0.5, viewport);
        const dur = m.end - m.start;
        return (
          <div
            key={`${m.peerId}-${m.start}-${m.end}-${i}`}
            data-overlap-marker
            data-overlap-peer={m.peerId}
            data-overlap-start={m.start}
            data-overlap-end={m.end}
            title={`Overlaps with ${m.peerId} for ${fmtDur(dur)}`}
            style={{
              position: "absolute",
              left,
              top: 0,
              bottom: 0,
              width: 2,
              marginLeft: -1,
              // Session-overlap marker — DOWNPLAYED (P3 verify-human): neutral
              // white-alpha at low opacity, not the old red-orange (which read as an
              // alarm + clashed with the no-warning palette). Concurrent-session
              // overlap is a rare, secondary signal — a faint hint, not a flag.
              background: "oklch(0.85 0 0 / 0.15)",
              pointerEvents: "auto",
              zIndex: 2,
            }}
          />
        );
      })}
    </>
  );
}

// ── CollapsedTrackRow (ported L2438-2539) ────────────────────────────────────
function CollapsedTrackRow({
  project,
  totals,
  viewport,
  overlaps,
  alt = false,
  onToggle,
}: {
  project: ProjectPayload;
  totals: ProjectTotals;
  viewport: Viewport;
  overlaps: OverlapMap;
  alt?: boolean;
  onToggle?: () => void;
}) {
  const intervalsByKind = useMemo(
    () => mergeProjectIntervalsByKind(project),
    [project],
  );
  return (
    <div
      data-project-row
      data-project-alias={project.alias}
      data-expanded="false"
      data-collapsed-track
      style={{
        display: "flex",
        height: PROJECT_HEADER_HEIGHT,
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: alt ? CT_TOKENS.surfaceAlt : CT_TOKENS.surface,
      }}
    >
      <div
        style={{
          width: ROW_LEFT_WIDTH,
          flexShrink: 0,
          borderRight: `1px solid ${CT_TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
        }}
      >
        <span
          data-chevron-toggle
          role="button"
          aria-label="expand project"
          onClick={
            onToggle
              ? (e) => {
                  e.stopPropagation();
                  onToggle();
                }
              : undefined
          }
          style={{
            color: CT_TOKENS.textTertiary,
            display: "flex",
            cursor: onToggle ? "pointer" : "default",
            userSelect: "none",
          }}
        >
          <IconChevRight size={12} />
        </span>
        <span
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 13,
            color: CT_TOKENS.textPrimary,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.alias}
        </span>
        <span style={{ flex: 1 }} />
        <span
          data-active-pill
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 999,
            background: colorForKind("ai-doing"),
            color: textOn(colorForKind("ai-doing")),
            fontWeight: 500,
          }}
        >
          {fmtDur(totals.activePlusSub)}
        </span>
        <span
          data-away-pill
          title="Away time (idle/stripe segs)"
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 999,
            marginLeft: 6,
            background: CT_TOKENS.awayBase,
            color: CT_TOKENS.textSecondary,
            fontWeight: 500,
          }}
        >
          {fmtDur(totals.away)}
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <HourGridBackground viewport={viewport} />
        {RENDER_ORDER.map((kind) => {
          const isSubagent = kind === "subagent";
          const height = isSubagent ? 14 : ROW_HEIGHT - 12;
          const top = isSubagent ? (ROW_HEIGHT - 14) / 2 + 4 : 6;
          return intervalsByKind[kind].map(([s, e]) => {
            const { left, width } = viewportPct(s, e, viewport);
            return (
              <div
                key={`${kind}-${s}-${e}`}
                data-collapsed-seg
                data-kind={kind}
                data-seg-kind={kind}
                title={`${kind} (collapsed) · ${fmtClock(s % 1440)}–${fmtClock(e % 1440)}`}
                style={{
                  position: "absolute",
                  left,
                  width,
                  top,
                  height,
                  borderRadius: 3,
                  ...segStyle(kind),
                  overflow: "hidden",
                  minWidth: 2,
                  boxShadow: isSubagent
                    ? `0 0 0 1px ${CT_TOKENS.surface}`
                    : "none",
                }}
              />
            );
          });
        })}
        <OverlapMarkerLayer
          project={project}
          viewport={viewport}
          overlaps={overlaps}
        />
      </div>
    </div>
  );
}

// ── ProjectHeaderRow (ported L2541-2616) ─────────────────────────────────────
function ProjectHeaderRow({
  project,
  totals,
  viewport,
  expanded = true,
  alt = false,
  onToggle,
}: {
  project: ProjectPayload;
  totals: ProjectTotals;
  viewport: Viewport;
  expanded?: boolean;
  alt?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      data-project-row
      data-project-alias={project.alias}
      data-expanded={expanded ? "true" : "false"}
      style={{
        display: "flex",
        height: PROJECT_HEADER_HEIGHT,
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: alt ? CT_TOKENS.surfaceAlt : CT_TOKENS.surface,
      }}
    >
      <div
        style={{
          width: ROW_LEFT_WIDTH,
          flexShrink: 0,
          borderRight: `1px solid ${CT_TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
        }}
      >
        <span
          data-chevron-toggle
          role="button"
          aria-label={expanded ? "collapse project" : "expand project"}
          onClick={
            onToggle
              ? (e) => {
                  e.stopPropagation();
                  onToggle();
                }
              : undefined
          }
          style={{
            color: CT_TOKENS.textTertiary,
            display: "flex",
            cursor: onToggle ? "pointer" : "default",
            userSelect: "none",
          }}
        >
          {expanded ? <IconChevDown size={12} /> : <IconChevRight size={12} />}
        </span>
        <span
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 13,
            color: CT_TOKENS.textPrimary,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.alias}
        </span>
        <span style={{ flex: 1 }} />
        <span
          data-active-pill
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 999,
            background: colorForKind("ai-doing"),
            color: textOn(colorForKind("ai-doing")),
            fontWeight: 500,
          }}
        >
          {fmtDur(totals.activePlusSub)}
        </span>
        <span
          data-away-pill
          title="Away time (idle/stripe segs)"
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 999,
            marginLeft: 6,
            background: CT_TOKENS.awayBase,
            color: CT_TOKENS.textSecondary,
            fontWeight: 500,
          }}
        >
          {fmtDur(totals.away)}
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <HourGridBackground viewport={viewport} />
        {/* Aggregate density bar at bottom */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 6,
            height: 3,
            background: CT_TOKENS.surfaceDim,
          }}
        />
      </div>
    </div>
  );
}

// ── OverlapOverlayLayer (ported L2623-2665) ──────────────────────────────────
// Translucent bottom-half strip inside SessionRow at each overlap subrange.
// WP6a: no filter-gating; single-day (dayOffset 0); overlaps arrive as a prop.
function OverlapOverlayLayer({
  session,
  viewport,
  overlaps,
}: {
  session: SessionPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
}) {
  const desc = overlaps[session.id];
  if (!desc || !desc.peers || desc.peers.length === 0) return null;
  return (
    <>
      {desc.peers.map((peer, i) => {
        const { left, width } = viewportPct(
          peer.overlapStartMin,
          peer.overlapEndMin,
          viewport,
        );
        return (
          <div
            key={`${peer.id}-${peer.overlapStartMin}-${peer.overlapEndMin}-${i}`}
            data-overlap-peer={peer.id}
            data-overlap-start={peer.overlapStartMin}
            data-overlap-end={peer.overlapEndMin}
            title={`Overlaps with ${peer.id} · ${fmtClock(peer.overlapStartMin)}–${fmtClock(peer.overlapEndMin)}`}
            style={{
              position: "absolute",
              left,
              width,
              top: ROW_HEIGHT / 2,
              height: ROW_HEIGHT / 2 - 1,
              // Overlap overlay strip — DOWNPLAYED to neutral white-alpha (matches the
              // marker; see the OverlapMarkerLayer note). Faint hint, not an alarm.
              background: "oklch(0.85 0 0 / 0.08)",
              borderTop: `1px dashed oklch(0.85 0 0 / 0.20)`,
              pointerEvents: "none",
              minWidth: 2,
            }}
          />
        );
      })}
    </>
  );
}

// ── SessionRow (ported L2667-2715) ───────────────────────────────────────────
// WP6a: filter-aware total → plain `sumActive` (all kinds shown); single-day
// (dayOffset 0); overlaps arrive as a prop.
function SessionRow({
  session,
  viewport,
  overlaps,
  alt = false,
  selectedSegId = null,
  lastInGroup = false,
}: {
  session: SessionPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
  alt?: boolean;
  selectedSegId?: string | null;
  lastInGroup?: boolean;
}) {
  const totalActive = sumActive(session.segs);
  return (
    <div
      data-session-row
      data-session-id={session.id}
      style={{
        display: "flex",
        height: ROW_HEIGHT,
        borderBottom: lastInGroup
          ? `1px solid ${CT_TOKENS.border}`
          : `1px solid ${CT_TOKENS.gridHour}`,
        background: alt ? CT_TOKENS.rowAlt : CT_TOKENS.surface,
      }}
    >
      <div
        style={{
          width: ROW_LEFT_WIDTH,
          flexShrink: 0,
          borderRight: `1px solid ${CT_TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px 0 30px",
        }}
      >
        <span
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 11.5,
            color: CT_TOKENS.textSecondary,
          }}
        >
          {fmtClock(session.start)}{" "}
          <span style={{ color: CT_TOKENS.textMuted }}>→</span>{" "}
          {fmtClock(session.end)}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: CT_TOKENS.mono,
            fontSize: 10.5,
            color: CT_TOKENS.textTertiary,
          }}
        >
          {fmtDur(totalActive)}
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <HourGridBackground viewport={viewport} />
        {session.segs.map((seg, i) => (
          <SegmentBar
            key={i}
            seg={seg}
            viewport={viewport}
            selected={`${session.id}:${i}` === selectedSegId}
          />
        ))}
        <OverlapOverlayLayer
          session={session}
          viewport={viewport}
          overlaps={overlaps}
        />
      </div>
    </div>
  );
}

// ── DayTimeline (ported L2884-3135, fixed-viewport) ──────────────────────────
export interface DayTimelineProps {
  /** A 1-day range payload (`queryTimeAnalytics({kind:"day"}, "global")`). */
  data: RangePayload;
  /** Project ids whose row is expanded (GlobalDashboard owns this state). */
  expandedProjects: string[];
  /** Toggle a project's expanded/collapsed state. */
  onToggleProject: (projectId: string) => void;
  /** Optional `"<session_id>:<segIndex>"` of a selected segment (highlight ring). */
  selectedSegId?: string | null;
}

/**
 * The day-view timeline. Pure presentational: it computes the fixed viewport
 * from `data.hour_range` (fallback [6,23]) and the overlap map once, then
 * renders the project list — collapsed projects as a merged-by-kind track,
 * expanded projects as a header + per-session rows. No data fetch, no zoom/pan,
 * no live-now marker, no filter (all WP6b+ scope).
 */
export function DayTimeline({
  data,
  expandedProjects,
  onToggleProject,
  selectedSegId = null,
}: DayTimelineProps) {
  const viewport = useMemo(
    () => viewportFromHourRange(data.hour_range),
    [data.hour_range],
  );

  // Overlap map (same-project-scoped at the source), computed once.
  const overlaps = useMemo(
    () => detectSessionOverlaps(data.projects),
    [data.projects],
  );

  // Per-project totals (WP6a shows all kinds, so plain sums — no filter gating).
  const totalsByProject = useMemo(() => {
    const out: Record<string, ProjectTotals> = {};
    for (const p of data.projects) {
      const allSegs = p.sessions.flatMap((s) => s.segs);
      out[p.id] = {
        // "Active" = the whole AI-execution family (sumActive) — the SAME definition
        // the SessionRow pill + the Phase-3 SummaryStrip use, so the day view reports
        // one consistent "active work" number everywhere.
        activePlusSub: sumActive(allSegs),
        away: sumKind(allSegs, "away"),
      };
    }
    return out;
  }, [data.projects]);

  const rootStyle: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: CT_TOKENS.surface,
    userSelect: "none",
  };

  return (
    <div data-testid="dashboard-day-timeline" style={rootStyle}>
      {/* Header row: project label area + hour ruler */}
      <div style={{ display: "flex", flexShrink: 0 }}>
        <div
          style={{
            width: ROW_LEFT_WIDTH,
            flexShrink: 0,
            borderRight: `1px solid ${CT_TOKENS.border}`,
            borderBottom: `1px solid ${CT_TOKENS.border}`,
            background: CT_TOKENS.surfaceAlt,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            height: 30,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontFamily: CT_TOKENS.sans,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: CT_TOKENS.textTertiary,
              fontWeight: 500,
            }}
          >
            Project
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 10.5,
              fontFamily: CT_TOKENS.sans,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: CT_TOKENS.textTertiary,
              fontWeight: 500,
            }}
          >
            Active
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <HourRuler viewport={viewport} />
        </div>
      </div>

      {/* Body rows */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {data.projects.map((p, pi) => {
          const expanded = expandedProjects.includes(p.id);
          const handleToggle = () => onToggleProject(p.id);
          if (!expanded) {
            return (
              <CollapsedTrackRow
                key={p.id}
                project={p}
                totals={totalsByProject[p.id]}
                viewport={viewport}
                overlaps={overlaps}
                alt={pi % 2 === 1}
                onToggle={handleToggle}
              />
            );
          }
          return (
            <div key={p.id}>
              <ProjectHeaderRow
                project={p}
                totals={totalsByProject[p.id]}
                viewport={viewport}
                expanded={true}
                alt={pi % 2 === 1}
                onToggle={handleToggle}
              />
              {p.sessions.map((s, si) => (
                <SessionRow
                  key={s.day_iso ? `${s.day_iso}:${s.id}` : s.id}
                  session={s}
                  viewport={viewport}
                  overlaps={overlaps}
                  alt={si % 2 === 1}
                  selectedSegId={selectedSegId}
                  lastInGroup={si === p.sessions.length - 1}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
