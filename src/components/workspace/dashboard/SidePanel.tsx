// M9 WP6b-2 Phase 4 — the session inspection SidePanel.
//
// Ported from the standalone claude-time dashboard.jsx `SidePanel` (L3727-3928) into a
// dark-themed, React-19 TSX module. Opens on the RIGHT of the Day view (a 360px flex
// sibling) when a segment bar is clicked; shows the clicked session's project, its
// active-of-wall time + a mini segment timeline, a per-kind activity breakdown, the
// tool-calls list, and the prompt count + real session id.
//
// PORT DELTAS from the source (per the WP6b-2 plan-time facts §"overlaps"):
//   - The 5-kind LIGHT breakdown (Active coding / Subagent / Reading / Thinking) →
//     the 6-kind dark breakdown via `sessionBreakdown` (sidePanelMath.ts): one row per
//     non-zero kind, colored by `colorForKind`, labeled by `labelForKind`.
//   - `CT_TOKENS.active` (the old tool-bar fill) → `colorForKind("ai-doing")`.
//   - The "Overlaps with" section + `OverlapsContext`/`useOverlaps` are DROPPED (a
//     WP12-era claude-time surface; the Day view already renders overlap markers).
//     Deferred nicety — re-add later if the per-session peer list is wanted.
//   - The `cs_4f8e1a · ` mock prefix on the Session ID line is DROPPED — show the real id.
//   - The mini-timeline's mock `segment?.idx === 1` highlight is DROPPED (there is no
//     per-seg highlight in the mini strip — the highlight ring lives on the main
//     timeline bar).
//   - The empty-`tools` map is GUARDED (the source's `tools[0][1]`/`maxTool` crash on a
//     session with no tool calls; here the list simply omits when empty).
//
// Palette/ink: `CT_TOKENS` + `segStyle`/`colorForKind` (kinds.ts) + `textOn` — same as
// DayTimeline. Pure math (breakdown + seg-id resolution) lives in `./sidePanelMath`.

import type { ProjectPayload, SessionPayload } from "../../../state/timeAnalytics";
import { CT_TOKENS } from "./tokens";
import { segStyle, colorForKind, sumActive } from "./kinds";
import { fmtDur, fmtClock } from "./dayStats";
import { sessionBreakdown } from "./sidePanelMath";

const SECTION_STYLE: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: `1px solid ${CT_TOKENS.border}`,
};

const CAPTION_STYLE: React.CSSProperties = {
  fontSize: 10.5,
  fontFamily: CT_TOKENS.sans,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: CT_TOKENS.textTertiary,
  fontWeight: 500,
};

export interface SidePanelProps {
  /** The clicked session. */
  session: SessionPayload;
  /** The project the session belongs to (for the alias + path header). */
  project: ProjectPayload;
  /** Close the panel + clear the selection. */
  onClose: () => void;
}

/**
 * The right-side session inspector. Renders inside the Day view as a flex sibling of the
 * timeline. `session`/`project` come from `resolveSelectedSeg(selectedSegId, dayData)` in
 * GlobalDashboard — the panel itself is presentational.
 */
export function SidePanel({ session, project, onClose }: SidePanelProps) {
  // The panel's "active" number is the AI-execution family sum — the SAME definition the
  // SessionRow pill + SummaryStrip use, so the number agrees across surfaces.
  const totalActive = sumActive(session.segs);
  const wallTime = Math.max(0, session.end - session.start);
  const breakdown = sessionBreakdown(session);

  // tool-name → count, descending. Guard the empty map (a session with no tool calls) —
  // the source assumed ≥1 entry (`tools[0][1]`) and would crash here.
  const tools = Object.entries(session.tools).sort((a, b) => b[1] - a[1]);
  const maxTool = tools.length > 0 ? tools[0][1] : 0;
  const totalTools = tools.reduce((a, [, n]) => a + n, 0);

  return (
    <div
      data-testid="dashboard-side-panel"
      data-session-id={session.id}
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surface,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header — project alias + path + close */}
      <div
        style={{
          ...SECTION_STYLE,
          padding: "14px 16px 12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...CAPTION_STYLE, marginBottom: 4 }}>Session</div>
          <div
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 13,
              color: CT_TOKENS.textPrimary,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              marginBottom: 6,
            }}
          >
            {project.alias}
          </div>
          <div
            title={project.path}
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 11,
              color: CT_TOKENS.textTertiary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project.path}
          </div>
        </div>
        {/* Close ✕ — reuses the main dashboard-header close treatment
            (`.global-dashboard-close`: borderless, textSecondary→white on hover) so the
            SidePanel's close affordance matches the app's existing one. (P4 verify-human:
            the earlier bordered iconChromeBtn + faint SVG glyph read as a near-empty box.) */}
        <button
          type="button"
          className="global-dashboard-close"
          onClick={onClose}
          aria-label="Close session details"
          title="Close"
          data-testid="side-panel-close"
        >
          ✕
        </button>
      </div>

      {/* Time block — active-of-wall + start→end + mini seg timeline */}
      <div style={SECTION_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 22,
              color: CT_TOKENS.textPrimary,
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            {fmtDur(totalActive)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: CT_TOKENS.textTertiary,
              fontFamily: CT_TOKENS.sans,
            }}
          >
            active of {fmtDur(wallTime)} wall
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: CT_TOKENS.mono,
            fontSize: 11.5,
            color: CT_TOKENS.textSecondary,
          }}
        >
          <span>{fmtClock(session.start)}</span>
          <span style={{ flex: 1, height: 1, background: CT_TOKENS.border }} />
          <span>{fmtClock(session.end)}</span>
        </div>

        {/* Mini segment timeline (positions relative to the session's own wall span) */}
        <div
          data-testid="side-panel-mini-timeline"
          style={{
            marginTop: 12,
            height: 14,
            position: "relative",
            borderRadius: 3,
            overflow: "hidden",
            background: CT_TOKENS.surfaceDim,
          }}
        >
          {wallTime > 0 &&
            session.segs.map((seg, i) => {
              const left = ((seg.start - session.start) / wallTime) * 100;
              const width = ((seg.end - seg.start) / wallTime) * 100;
              return (
                <div
                  key={i}
                  data-seg-kind={seg.kind}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: 1,
                    ...segStyle(seg.kind),
                  }}
                />
              );
            })}
        </div>
      </div>

      {/* Activity breakdown — 6-kind, non-zero rows */}
      <div style={SECTION_STYLE} data-testid="side-panel-breakdown">
        <div style={{ ...CAPTION_STYLE, marginBottom: 10 }}>
          Activity breakdown
        </div>
        {breakdown.map((r) => (
          <div
            key={r.kind}
            data-breakdown-kind={r.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 0",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: r.color,
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: CT_TOKENS.textPrimary,
                fontFamily: CT_TOKENS.sans,
              }}
            >
              {r.label}
            </span>
            <span
              style={{
                fontFamily: CT_TOKENS.mono,
                fontSize: 11.5,
                color: CT_TOKENS.textSecondary,
              }}
            >
              {fmtDur(r.minutes)}
            </span>
          </div>
        ))}
      </div>

      {/* Tool calls — omitted entirely when the session made none */}
      <div
        style={{ ...SECTION_STYLE, flex: 1, overflow: "auto" }}
        data-testid="side-panel-tools"
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={CAPTION_STYLE}>Tool calls</span>
          <span
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 11,
              color: CT_TOKENS.textTertiary,
            }}
          >
            {totalTools} total
          </span>
        </div>
        {tools.length === 0 ? (
          <div
            style={{
              fontSize: 11.5,
              color: CT_TOKENS.textTertiary,
              fontFamily: CT_TOKENS.sans,
            }}
          >
            No tool calls recorded.
          </div>
        ) : (
          tools.map(([name, n]) => (
            <div
              key={name}
              data-tool-name={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "5px 0",
              }}
            >
              <span
                style={{
                  width: 56,
                  fontFamily: CT_TOKENS.mono,
                  fontSize: 11.5,
                  color: CT_TOKENS.textPrimary,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  background: CT_TOKENS.surfaceDim,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${maxTool > 0 ? (n / maxTool) * 100 : 0}%`,
                    background: colorForKind("ai-doing"),
                    opacity: 0.85,
                  }}
                />
              </div>
              <span
                style={{
                  width: 28,
                  textAlign: "right",
                  fontFamily: CT_TOKENS.mono,
                  fontSize: 11.5,
                  color: CT_TOKENS.textSecondary,
                }}
              >
                {n}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Prompts + real session id */}
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ ...CAPTION_STYLE, marginBottom: 3 }}>Prompts</div>
          <div
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 17,
              fontWeight: 500,
              color: CT_TOKENS.textPrimary,
            }}
          >
            {session.prompts}
          </div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...CAPTION_STYLE, marginBottom: 3 }}>Session ID</div>
          <div
            title={session.id}
            style={{
              fontFamily: CT_TOKENS.mono,
              fontSize: 11.5,
              color: CT_TOKENS.textSecondary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {session.id}
          </div>
        </div>
      </div>
    </div>
  );
}
