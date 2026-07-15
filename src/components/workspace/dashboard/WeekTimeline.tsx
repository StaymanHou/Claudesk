// M9 WP6b-2 — the Week view: a per-project × 7-day grid of stacked-minute bars.
// Ported from dashboard.jsx `WeekTimeline` (L3138-3302) into dark-themed React-19 TSX,
// remapped to the WP3 6-kind model. Consumes WP4's `WeekPayload` (7 `RollupCell`s per
// project, Mon→Sun). Pure math (day-header parse, cell→bands, ceiling, per-project
// totals) lives in `./weekMath` (vitest-pinned); this file is the render shell.
//
// Differences from the source (all mechanical): light `CT_TOKENS` → dark tokens; the
// 4-kind stacked bar → the 6-kind `cellSegments` (away excluded, RENDER_ORDER); the
// buggy `days[i].split(' ')` day-header parse → `parseDayHeader` (backend emits
// "MON · JUL 13", not "MON 13"); the mock `isToday = i === 2` → a real compare against
// today's day-of-week token. No wordmark, no filter chips.

import type { WeekPayload } from "../../../state/timeAnalytics";
import { CT_TOKENS } from "./tokens";
import { segStyle } from "./kinds";
import { fmtDur } from "./dayStats";
import { IconChevRight } from "./Icon";
import {
  parseDayHeader,
  isWeekendDow,
  cellSegments,
  cellTotal,
  weekCeiling,
  projectWeekActive,
} from "./weekMath";

const ROW_LEFT_WIDTH = 232;

/** Today's day-of-week token (e.g. "MON"), for the today-column highlight. */
function todayDow(): string {
  // toLocaleDateString short weekday, uppercased to match the backend "%a" token.
  return new Date()
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
}

export function WeekTimeline({ data }: { data: WeekPayload }) {
  const ceiling = weekCeiling(data.projects.map((p) => p.rollup));
  const headers = data.days.map(parseDayHeader);
  const today = todayDow();

  return (
    <div
      className="dashboard-week"
      data-testid="dashboard-week"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: CT_TOKENS.surface,
      }}
    >
      {/* Header row: Project label + 7 day columns */}
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
            height: 46,
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
            Week total
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            borderBottom: `1px solid ${CT_TOKENS.border}`,
            background: CT_TOKENS.surfaceAlt,
          }}
        >
          {headers.map((h, i) => {
            const isToday = h.dow.toUpperCase() === today;
            const weekend = isWeekendDow(h.dow);
            return (
              <div
                key={`${h.dow}-${i}`}
                data-week-day-header={data.days[i]}
                style={{
                  flex: 1,
                  borderRight:
                    i < headers.length - 1
                      ? `1px solid ${CT_TOKENS.gridDay}`
                      : "none",
                  padding: "6px 10px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                  background: isToday
                    ? "oklch(0.50 0.17 268 / 0.10)"
                    : "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: CT_TOKENS.sans,
                    fontSize: 10.5,
                    color: isToday
                      ? CT_TOKENS["ai-doing"]
                      : weekend
                        ? CT_TOKENS.textMuted
                        : CT_TOKENS.textTertiary,
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                  }}
                >
                  {h.dow}
                </span>
                <span
                  style={{
                    fontFamily: CT_TOKENS.mono,
                    fontSize: 15,
                    fontWeight: 500,
                    color: isToday ? CT_TOKENS["ai-doing"] : CT_TOKENS.textPrimary,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {h.dayNum || ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Body: one row per project, with day-column gridlines behind */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: ROW_LEFT_WIDTH,
            right: 0,
            display: "flex",
            pointerEvents: "none",
          }}
        >
          {headers.map((h, i) => (
            <div
              key={`grid-${h.dow}-${i}`}
              style={{
                flex: 1,
                borderRight:
                  i < headers.length - 1
                    ? `1px solid ${CT_TOKENS.gridDay}`
                    : "none",
                background: isWeekendDow(h.dow) ? CT_TOKENS.rowAlt : "transparent",
              }}
            />
          ))}
        </div>

        {data.projects.map((p, pi) => {
          const weekActive = projectWeekActive(p.rollup);
          return (
            <div
              key={p.id}
              data-week-project-row={p.id}
              style={{
                display: "flex",
                height: 64,
                borderBottom: `1px solid ${CT_TOKENS.border}`,
                background: pi % 2 === 1 ? CT_TOKENS.rowAlt : CT_TOKENS.surface,
                position: "relative",
                zIndex: 1,
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
                  background: pi % 2 === 1 ? CT_TOKENS.rowAlt : CT_TOKENS.surface,
                }}
              >
                <span style={{ color: CT_TOKENS.textTertiary, display: "flex" }}>
                  <IconChevRight size={12} />
                </span>
                <span
                  style={{
                    fontFamily: CT_TOKENS.mono,
                    fontSize: 12.5,
                    color: CT_TOKENS.textPrimary,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.alias}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  data-week-project-total={p.id}
                  style={{
                    fontFamily: CT_TOKENS.mono,
                    fontSize: 11,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background:
                      weekActive > 0 ? CT_TOKENS["ai-doing"] : CT_TOKENS.surfaceDim,
                    color: weekActive > 0 ? "#fff" : CT_TOKENS.textTertiary,
                    fontWeight: 500,
                  }}
                >
                  {weekActive > 0 ? fmtDur(weekActive) : "—"}
                </span>
              </div>

              <div style={{ flex: 1, display: "flex" }}>
                {p.rollup.map((cell, di) => {
                  const total = cellTotal(cell);
                  const bands = cellSegments(cell);
                  return (
                    <div
                      key={di}
                      style={{
                        flex: 1,
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        padding: "8px 10px",
                      }}
                    >
                      {total === 0 ? (
                        <div
                          style={{
                            height: 4,
                            background: CT_TOKENS.surfaceDim,
                            borderRadius: 2,
                          }}
                        />
                      ) : (
                        <>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column-reverse",
                              height: `${(total / ceiling) * 44}px`,
                              borderRadius: 3,
                              overflow: "hidden",
                              boxShadow: `inset 0 0 0 0.5px oklch(1 0 0 / 0.06)`,
                            }}
                          >
                            {bands.map((b) => (
                              <div
                                key={b.kind}
                                style={{
                                  ...segStyle(b.kind),
                                  height: `${(b.minutes / total) * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 10,
                              fontFamily: CT_TOKENS.mono,
                              fontSize: 10.5,
                              color: CT_TOKENS.textSecondary,
                              fontWeight: 500,
                            }}
                          >
                            {fmtDur(total)}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
