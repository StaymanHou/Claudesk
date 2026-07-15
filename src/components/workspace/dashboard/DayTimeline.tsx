// M9 WP6a → WP6b-1 — the day-view timeline (project list + sessions), ported from
// the standalone claude-time dashboard.jsx `DayTimeline` chain (L2158-3137) into a
// dark-themed, React-19 TSX module for Claudesk's GLOBAL analytics view.
//
// WP6b-1 CHANGE — INTERACTIVE VIEWPORT (Phase 1): WP6a shipped a FIXED viewport
// (computed once from `hour_range`, passed DOWN as a plain `viewport` prop). WP6b-1
// revives the interactive zoom/pan viewport the source had: the viewport now lives
// in a SHARED `ViewportContext` (owned by GlobalDashboard's ViewportProvider), read
// here via `useViewport()`. Sub-components no longer receive a `viewport` prop —
// they read the context. The ruler/grid use ADAPTIVE tick density
// (`pickTickInterval`/`ticksInViewport`) instead of the WP6a fixed `HH:00` ruler.
// Phase 1 adds NO gesture wiring — nothing pans/zooms yet, so with the seeded
// window the render is identical to WP6a (the regression gate). Phase 2 attaches
// `useTimelineGestures`; Phase 3 adds the Minimap.
//
// Still dropped from the source (WP6b-1 remains single-day): NO FilterContext, NO
// multi-day `dayOffset` (every offset is 0, so the seg coordinate IS its minute-of-
// day), NO live "now" marker. Overlap detection stays same-project-scoped
// (operator definition, 2026-07-08). The viewport math + tick helpers now live in
// `./viewport` (pure, vitest-pinned).
//
// Palette / ink: colors come from `./tokens` (CT_TOKENS) + `./kinds`
// (segStyle/colorForKind — the 6-kind version). On-fill text uses `textOn(fill)`.

import { useCallback, useMemo, type CSSProperties } from "react";
import type {
  RangePayload,
  ProjectPayload,
  SessionPayload,
  SegPayload,
} from "../../../state/timeAnalytics";
import { CT_TOKENS, textOn } from "./tokens";
import { segStyle, colorForKind, RENDER_ORDER, sumActive, sumByKind } from "./kinds";
import { IconChevDown, IconChevRight } from "./Icon";
import {
  dayOffsetMin,
  pickTickInterval,
  ticksInViewport,
  viewportPct,
  type Viewport,
} from "./viewport";
import { useViewport } from "./ViewportContext";
import { useDayWindow } from "./DayWindowContext";
import { NowMarker } from "./NowMarker";
import { useTimelineGestures } from "./useTimelineGestures";

// ── Geometry (ported verbatim from dashboard.jsx L2158-2160) ─────────────────
const ROW_LEFT_WIDTH = 232;
const ROW_HEIGHT = 36;
const PROJECT_HEADER_HEIGHT = 40;

// NOTE: the `Viewport` type + `viewportFromHourRange` + `viewportPct` + the tick
// helpers moved to `./viewport` (pure module) in WP6b-1 Phase 1. GlobalDashboard
// seeds the provider from `viewportFromHourRange(data.hour_range)`.

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

// ── HourRuler ────────────────────────────────────────────────────────────────
// WP6b-1: reads the shared viewport + uses ADAPTIVE tick density
// (pickTickInterval/ticksInViewport). Ticks recompute every render off the live
// viewport, so zooming in shows 30m/15m/5m/1m ticks; zooming out coarsens to 1h.
// WP6b-4: reads the day-window context → passes `windowStartIso` to `ticksInViewport`
// so a multi-day viewport gets "MMM DD" day labels (day-level + midnight-boundary
// prefixes). Single-day (`windowStartIso===null`) → byte-identical single-day labels.
function HourRuler() {
  const viewport = useViewport();
  const { windowStartIso } = useDayWindow();
  const range = viewport.visible_end_min - viewport.visible_start_min;
  const interval = pickTickInterval(viewport);
  const ticks = ticksInViewport(viewport, interval, windowStartIso);
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
      {ticks.map((t) => {
        const leftPct =
          range > 0
            ? ((t.min - viewport.visible_start_min) / range) * 100
            : 0;
        const widthPct = range > 0 ? (interval / range) * 100 : 0;
        return (
          <div
            key={t.min}
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
              {t.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── HourGridBackground ───────────────────────────────────────────────────────
// WP6b-1: reads the shared viewport + adaptive tick density (matches HourRuler).
// WP6b-4: in multi-day mode, overlays STRONGER day-separator gridlines at each
// midnight (`dayIx*1440`) within the viewport, so day lanes are visually distinct
// from the hour grid. Single-day → no day separators (only day 0's start is in view).
function HourGridBackground() {
  const viewport = useViewport();
  const { windowStartIso } = useDayWindow();
  const range = viewport.visible_end_min - viewport.visible_start_min;
  const interval = pickTickInterval(viewport);
  const ticks = ticksInViewport(viewport, interval, windowStartIso);
  // Day-separator positions: every midnight (multiple of 1440) strictly inside the
  // viewport. Only meaningful in multi-day mode (windowStartIso set); a single-day
  // viewport is within [0,1440] so no interior midnight exists.
  const daySeparators: number[] = [];
  if (windowStartIso) {
    const firstMidnight =
      Math.ceil(viewport.visible_start_min / 1440) * 1440;
    for (let t = firstMidnight; t < viewport.visible_end_min; t += 1440) {
      if (t > viewport.visible_start_min) daySeparators.push(t);
    }
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {ticks.map((t) => {
        const leftPct =
          range > 0
            ? ((t.min - viewport.visible_start_min) / range) * 100
            : 0;
        const widthPct = range > 0 ? (interval / range) * 100 : 0;
        return (
          <div
            key={t.min}
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
      {/* Day separators — a brighter hairline at each interior midnight (multi-day). */}
      {daySeparators.map((t) => {
        const leftPct =
          range > 0 ? ((t - viewport.visible_start_min) / range) * 100 : 0;
        return (
          <div
            key={`day-sep-${t}`}
            data-day-separator={t / 1440}
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: `1px solid ${CT_TOKENS.gridDay}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

// ── SegmentBar ───────────────────────────────────────────────────────────────
// WP6b-1: reads the shared viewport (was a prop). Still no filter-gating (always
// render); no multi-day dayOffset (offset 0, so the seg coordinate IS its minute-
// of-day). Emits `data-seg-kind` + `data-seg-id`/`data-kind` (the verify attrs +
// the click-vs-pan hook — the pan handler early-returns on `[data-seg-id]`).
// WP6b-2 Phase 4: `onSelect` closes the click→select loop — clicking a bar calls it
// with this seg's `"<sessionId>:<segIndex>"` id (the read-side `selected` highlight
// ring was already wired). `stopPropagation` keeps the click from also reaching the
// timeline body's pointer handlers.
function SegmentBar({
  seg,
  viewport,
  dayOffset = 0,
  selected = false,
  onSelect,
}: {
  seg: SegPayload;
  viewport: Viewport;
  /** Multi-day lane offset (minutes) = `dayOffsetMin(session.day_iso, windowStartIso)`.
   *  0 for single-day, so the coordinate IS the minute-of-day (WP6b-1 behavior). */
  dayOffset?: number;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { left, width } = viewportPct(
    seg.start + dayOffset,
    seg.end + dayOffset,
    viewport,
  );
  const isSubagent = seg.kind === "subagent";
  const height = isSubagent ? 14 : ROW_HEIGHT - 12;
  const top = isSubagent ? (ROW_HEIGHT - 14) / 2 + 4 : 6;
  return (
    <div
      title={`${seg.kind} · ${fmtClock(seg.start)}–${fmtClock(seg.end)}`}
      data-seg-id={`${seg.kind}-${seg.start}-${seg.end}`}
      data-kind={seg.kind}
      data-seg-kind={seg.kind}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      style={{
        position: "absolute",
        left,
        width,
        top,
        height,
        borderRadius: 3,
        cursor: onSelect ? "pointer" : "default",
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
// WP6b-4: `dayOffsetForSession` shifts each session's segs onto its multi-day lane
// (`seg + dayOffset`) BEFORE merging, so a project's collapsed band tiles correctly
// across days (each day's run stays in its own 1440-min lane instead of collapsing
// onto minute-of-day and falsely merging across days). Single-day → the fn returns 0
// for every session, so coordinates stay minute-of-day (WP6a behavior).
type IntervalsByKind = Record<string, [number, number][]>;

function mergeProjectIntervalsByKind(
  project: ProjectPayload,
  dayOffsetForSession: (s: SessionPayload) => number = () => 0,
): IntervalsByKind {
  const byKind: Record<string, [number, number][]> = {};
  for (const kind of RENDER_ORDER) byKind[kind] = [];
  for (const s of project.sessions) {
    const off = dayOffsetForSession(s);
    for (const seg of s.segs) {
      if (byKind[seg.kind] === undefined) continue; // unknown kind — skip
      byKind[seg.kind].push([seg.start + off, seg.end + off]);
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
  dayOffsetForSession = () => 0,
}: {
  project: ProjectPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
  /** WP6b-4: shift each session's overlap coords onto its multi-day lane. Overlaps
   *  are same-day by construction (`detectSessionOverlaps` skips cross-day pairs), so
   *  the owning session's offset applies to both peers. 0 for single-day. */
  dayOffsetForSession?: (s: SessionPayload) => number;
}) {
  const seen = new Set<string>();
  const markers: { peerId: string; start: number; end: number }[] = [];
  for (const s of project.sessions) {
    const desc = overlaps[s.id];
    if (!desc || !desc.peers) continue;
    const off = dayOffsetForSession(s);
    for (const peer of desc.peers) {
      const start = peer.overlapStartMin + off;
      const end = peer.overlapEndMin + off;
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
  const { windowStartIso } = useDayWindow();
  const dayOffsetForSession = useCallback(
    (s: SessionPayload) => dayOffsetMin(s.day_iso, windowStartIso),
    [windowStartIso],
  );
  const intervalsByKind = useMemo(
    () => mergeProjectIntervalsByKind(project, dayOffsetForSession),
    [project, dayOffsetForSession],
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
        <HourGridBackground />
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
          dayOffsetForSession={dayOffsetForSession}
        />
      </div>
    </div>
  );
}

// ── ProjectHeaderRow (ported L2541-2616) ─────────────────────────────────────
function ProjectHeaderRow({
  project,
  totals,
  expanded = true,
  alt = false,
  onToggle,
}: {
  project: ProjectPayload;
  totals: ProjectTotals;
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
        <HourGridBackground />
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
  dayOffset = 0,
}: {
  session: SessionPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
  /** Multi-day lane offset for this session (0 single-day). */
  dayOffset?: number;
}) {
  const desc = overlaps[session.id];
  if (!desc || !desc.peers || desc.peers.length === 0) return null;
  return (
    <>
      {desc.peers.map((peer, i) => {
        const { left, width } = viewportPct(
          peer.overlapStartMin + dayOffset,
          peer.overlapEndMin + dayOffset,
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
  onSelectSeg,
  lastInGroup = false,
}: {
  session: SessionPayload;
  viewport: Viewport;
  overlaps: OverlapMap;
  alt?: boolean;
  selectedSegId?: string | null;
  onSelectSeg?: (id: string) => void;
  lastInGroup?: boolean;
}) {
  const { windowStartIso } = useDayWindow();
  const dayOffset = dayOffsetMin(session.day_iso, windowStartIso);
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
        <HourGridBackground />
        {session.segs.map((seg, i) => (
          <SegmentBar
            key={i}
            seg={seg}
            viewport={viewport}
            dayOffset={dayOffset}
            selected={`${session.id}:${i}` === selectedSegId}
            onSelect={
              onSelectSeg ? () => onSelectSeg(`${session.id}:${i}`) : undefined
            }
          />
        ))}
        <OverlapOverlayLayer
          session={session}
          viewport={viewport}
          overlaps={overlaps}
          dayOffset={dayOffset}
        />
      </div>
    </div>
  );
}

// ── DayTimeline (ported L2884-3135) ──────────────────────────────────────────
export interface DayTimelineProps {
  /** A 1-day range payload (`queryTimeAnalytics({kind:"day"}, "global")`). */
  data: RangePayload;
  /** Project ids whose row is expanded (GlobalDashboard owns this state). */
  expandedProjects: string[];
  /** Toggle a project's expanded/collapsed state. */
  onToggleProject: (projectId: string) => void;
  /** Optional `"<session_id>:<segIndex>"` of a selected segment (highlight ring). */
  selectedSegId?: string | null;
  /** Click→select callback — fires with a seg's `"<session_id>:<segIndex>"` id when a
   *  segment bar is clicked (WP6b-2 Phase 4: opens the SidePanel). */
  onSelectSeg?: (id: string) => void;
}

/**
 * The day-view timeline. WP6b-1: the viewport is now READ from the shared
 * `ViewportContext` (owned by GlobalDashboard's ViewportProvider) instead of
 * computed here — so it responds to Phase-2 gestures + the Phase-3 Minimap. The
 * overlap map + per-project totals are still computed here from the payload. The
 * viewport is passed DOWN to the leaf renderers as a plain `viewport` prop (they
 * receive it once from this component's `useViewport()` read — the ruler/grid read
 * the context directly since they also want the adaptive tick interval).
 */
export function DayTimeline({
  data,
  expandedProjects,
  onToggleProject,
  selectedSegId = null,
  onSelectSeg,
}: DayTimelineProps) {
  const viewport = useViewport();

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
        away: sumByKind(allSegs, "away"),
      };
    }
    return out;
  }, [data.projects]);

  // WP6b-1 Phase 2: pointer/wheel gestures drive the shared viewport. Attached to
  // the scrollable body wrapper below (the region right of the label column). The
  // hook's pointerdown early-returns on a `[data-seg-id]` target, so segment clicks
  // still select without starting a pan.
  const gestures = useTimelineGestures();

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
          <HourRuler />
        </div>
      </div>

      {/* Body rows — the pan/zoom gesture surface (WP6b-1 Phase 2). `cursor:grab`
          signals draggability; `touchAction:none` prevents the browser claiming the
          pointer for native scroll mid-drag. A press on a `[data-seg-id]` bar is
          excluded from panning by the hook, so segment selection still works. */}
      <div
        data-testid="dashboard-timeline-body"
        onPointerDown={gestures.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onWheel={gestures.onWheel}
        style={{
          flex: 1,
          overflow: "auto",
          position: "relative",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        {/* Live NOW marker overlay — spans the full body height, inset by the label
            column so it aligns to the same timeline area the rows render into. Reads
            the shared viewport + day-window, so it tracks pan/zoom and lands on today's
            lane in multi-day mode. Renders null when today isn't in the shown window. */}
        <div
          style={{
            position: "absolute",
            left: ROW_LEFT_WIDTH,
            right: 0,
            top: 0,
            bottom: 0,
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: 3,
          }}
        >
          <NowMarker />
        </div>
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
                  onSelectSeg={onSelectSeg}
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
