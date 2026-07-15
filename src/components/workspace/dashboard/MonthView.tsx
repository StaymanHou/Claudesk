// M9 WP6b-2 Phase 2 — the Month view: a GitHub-contribution-grid calendar. 7 columns
// (Mon→Sun), N week-rows, one cell per in-month day. Each cell's background encodes that
// day's AI-active minutes (1D intensity, normalized against the month's busiest day);
// clicking a day drills into the Day view for that date (the D-6b-3 live-IPC drill-down —
// there is NO MonthNavToast; Claudesk re-queries in-process instead of the source's
// file:// CLI-reinvoke toast).
//
// Ported from dashboard.jsx `MonthView` (L3304-3469) into dark-themed React-19 TSX.
// Differences from the source (all mechanical / plan-locked): light `CT_TOKENS` → dark
// tokens; the light intensity ramp → the dark-anchored `MONTH_INTENSITY_PALETTE`; the
// `active`+`subagent` `end-start` day-total → `dayTotalsFromRange` (AI family, sums TRUE
// `dur_ms` — the WP4 minute-quant fix); `MonthNavToast` is NOT ported (drill-down is a
// real IPC re-query, wired in GlobalDashboard). Pure math lives in `./monthMath`.

import { useMemo } from "react";
import type { RangePayload } from "../../../state/timeAnalytics";
import { CT_TOKENS, textOn } from "./tokens";
import { fmtDur } from "./dayStats";
import {
  monthIsoToParts,
  daysInMonth,
  mondayIndex,
  intensityColor,
  dayTotalsFromRange,
  monthMax,
  todayDateIso,
} from "./monthMath";

const DOW_HEADERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export function MonthView({
  monthIso,
  payload,
  onDayClick,
}: {
  monthIso: string;
  payload: RangePayload | null;
  onDayClick: (iso: string) => void;
}) {
  const dayTotals = useMemo(() => dayTotalsFromRange(payload), [payload]);
  const max = useMemo(() => monthMax(dayTotals), [dayTotals]);

  const parts = monthIsoToParts(monthIso);
  if (!parts) {
    return (
      <div
        data-testid="dashboard-month-invalid"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: CT_TOKENS.surface,
          fontFamily: CT_TOKENS.sans,
          fontSize: 13,
          color: CT_TOKENS.textSecondary,
        }}
      >
        Invalid month: {monthIso}
      </div>
    );
  }

  const { year, month } = parts;
  const firstDay = new Date(year, month - 1, 1);
  const dim = daysInMonth(year, month);
  const leadingPad = mondayIndex(firstDay); // empty cells before day 1
  const totalCells = leadingPad + dim;
  const trailingPad = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const gridLen = leadingPad + dim + trailingPad; // multiple of 7

  // Today marker — only if today falls in the rendered month.
  const todayIso = todayDateIso(new Date());
  const todayDayNum =
    todayIso.slice(0, 7) === monthIso ? parseInt(todayIso.slice(8, 10), 10) : null;

  return (
    <div
      className="dashboard-month"
      data-testid="dashboard-month"
      data-month-grid={monthIso}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: CT_TOKENS.surface,
        padding: "14px 20px",
        overflow: "auto",
      }}
    >
      {/* Day-of-week header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 8,
        }}
      >
        {DOW_HEADERS.map((dow) => (
          <div
            key={dow}
            style={{
              textAlign: "center",
              padding: "4px 0",
              fontFamily: CT_TOKENS.sans,
              fontSize: 10.5,
              color: CT_TOKENS.textTertiary,
              letterSpacing: "0.08em",
              fontWeight: 500,
            }}
          >
            {dow}
          </div>
        ))}
      </div>

      {/* Day-cell grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          alignContent: "start",
        }}
      >
        {Array.from({ length: gridLen }, (_, i) => {
          const dayNum = i - leadingPad + 1;
          const inMonth = dayNum >= 1 && dayNum <= dim;
          if (!inMonth) {
            return (
              <div
                key={`pad-${i}`}
                style={{ aspectRatio: "2 / 1", background: "transparent" }}
              />
            );
          }
          const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const total = dayTotals.get(iso) ?? 0;
          const hasData = total > 0;
          const isToday = dayNum === todayDayNum;
          const intensity = hasData && max > 0 ? total / max : 0;
          const bg = intensityColor(intensity);
          // Ink adapts to the cell's fill lightness (bright cells → dark ink).
          const ink = hasData ? textOn(bg) : CT_TOKENS.textSecondary;
          return (
            <button
              key={iso}
              type="button"
              data-month-day={iso}
              data-month-day-active={hasData ? "true" : "false"}
              data-month-day-intensity={hasData ? intensity.toFixed(2) : "0"}
              onClick={() => onDayClick(iso)}
              title={hasData ? `${iso} — ${fmtDur(total)}` : `${iso} — no tracked time`}
              style={{
                position: "relative",
                aspectRatio: "2 / 1",
                border: isToday
                  ? `2px solid ${CT_TOKENS["ai-doing"]}`
                  : `1px solid ${CT_TOKENS.border}`,
                borderRadius: 5,
                background: bg,
                cursor: "pointer",
                padding: 0,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: 5,
                  fontFamily: CT_TOKENS.mono,
                  fontSize: 10,
                  color: ink,
                  fontWeight: isToday ? 600 : 500,
                  letterSpacing: "-0.01em",
                }}
              >
                {dayNum}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
