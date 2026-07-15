// M9 WP6a → WP6b-2 — dashboard chrome: Toolbar + SummaryStrip + Legend.
//
// Ported from dashboard.jsx (Toolbar L319, SummaryStrip L691, Legend L1734), stripped
// to the WP6a day-view MVP then extended by WP6b-2:
//   - Toolbar: the view-mode tabs. WP6a shipped ONLY Day functional (the rest inert);
//     WP6b-2 makes the toolbar VIEW-DRIVEN — `view` + `onViewChange` props select the
//     active tab and switch the body. Phase 1 enables Week; Month/Custom light up in
//     Phases 2/3 (their `enabled` flags flip as each lands). Compare stays disabled
//     (WP6c). The right-side slot is view-specific: Day shows the "Fit day" button;
//     other views get their own controls in later phases. No wordmark.
//   - SummaryStrip: the 4 day stats. The filter-chip cluster is DROPPED.
//   - Legend: a STATIC 6-kind key (swatch + label), display-only.
//
// Palette + kind model come from tokens.ts / kinds.ts (single source of truth).

import type { ReactNode } from "react";
import { CT_TOKENS } from "./tokens";
import { ALL_KINDS, colorForKind, segStyle, labelForKind } from "./kinds";
import type { DayStat } from "./dayStats";

// ── Toolbar ───────────────────────────────────────────────────────────────
/** The view modes the dashboard exposes. `day` is the interactive single-day timeline
 *  (WP6b-2 P3 gave it a date picker so it shows ANY day — the Custom→Day merge folded the
 *  former separate "Custom" range tab into Day); `week` is the rollup grid (P1); `month`
 *  is the contribution calendar (P2); `metrics` is the window-level aggregate-metrics view
 *  (WP6c-1); `compare` is the A/B comparison (WP6c-2). */
export type DashboardView = "day" | "week" | "month" | "metrics" | "compare";

interface ViewMode {
  value: DashboardView;
  label: string;
  enabled: boolean;
}

// Enabled set grows phase-by-phase. Day + Week (P1), Month (P2), Metrics (WP6c-1),
// Compare (WP6c-2). (The standalone Custom tab was REMOVED at P3 — merged into Day's
// date picker.)
const VIEW_MODES: readonly ViewMode[] = [
  { value: "day", label: "Day", enabled: true },
  { value: "week", label: "Week", enabled: true },
  { value: "month", label: "Month", enabled: true },
  { value: "metrics", label: "Metrics", enabled: true },
  { value: "compare", label: "Compare", enabled: true },
];

/** The view-mode tab strip. `view` selects the active tab; clicking an enabled tab
 *  fires `onViewChange`. The right-side slot is view-specific:
 *   - Day: the "Fit day" button (resets the interactive viewport — WP6b-1), when
 *     `onFitDay` is supplied.
 *   - other views: `rightSlot` (Phases 2/3 pass month-nav / range-picker controls).
 *  `dateLabel` renders in the label slot for views that want a plain read-only label
 *  (Day/Week); views with their own nav control pass a `rightSlot` instead. */
export function Toolbar({
  view,
  onViewChange,
  dateLabel,
  onFitDay,
  fitLabel = "Fit day",
  rightSlot,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  dateLabel: string;
  onFitDay?: () => void;
  /** Label for the fit/reset button — "Fit day" (single-day) or "Fit range" (multi-day). */
  fitLabel?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div
      className="dashboard-toolbar"
      data-testid="dashboard-toolbar"
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surface,
        flexShrink: 0,
      }}
    >
      <div
        role="tablist"
        aria-label="Time range"
        style={{
          display: "flex",
          gap: 2,
          padding: 3,
          background: CT_TOKENS.surfaceDim,
          borderRadius: 8,
          border: `1px solid ${CT_TOKENS.border}`,
        }}
      >
        {VIEW_MODES.map((m) => {
          const current = m.value === view;
          return (
            <button
              key={m.value}
              type="button"
              role="tab"
              data-tab={m.value}
              aria-selected={current}
              aria-disabled={!m.enabled}
              disabled={!m.enabled}
              onClick={m.enabled ? () => onViewChange(m.value) : undefined}
              title={m.enabled ? undefined : "Coming in a later update"}
              style={{
                background: current ? CT_TOKENS.surfaceAlt : "transparent",
                color: !m.enabled
                  ? CT_TOKENS.textMuted
                  : current
                    ? CT_TOKENS.textPrimary
                    : CT_TOKENS.textSecondary,
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: current ? 550 : 450,
                fontFamily: CT_TOKENS.sans,
                cursor: m.enabled ? "pointer" : "not-allowed",
                opacity: m.enabled ? 1 : 0.5,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <span
        style={{
          fontFamily: CT_TOKENS.mono,
          fontSize: 12,
          color: CT_TOKENS.textSecondary,
          letterSpacing: "0.04em",
        }}
      >
        {dateLabel}
      </span>

      <span style={{ flex: 1 }} />

      {rightSlot}

      {onFitDay && (
        <button
          type="button"
          className="dashboard-fit-day"
          data-testid="dashboard-fit-day"
          onClick={onFitDay}
          title="Fit the whole window in view (reset zoom/pan · press 0)"
          style={{
            background: CT_TOKENS.surfaceDim,
            color: CT_TOKENS.textSecondary,
            border: `1px solid ${CT_TOKENS.border}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 450,
            fontFamily: CT_TOKENS.sans,
            cursor: "pointer",
          }}
        >
          {fitLabel}
        </button>
      )}
    </div>
  );
}

// ── MonthNav ────────────────────────────────────────────────────────────────
/** The Month view's prev/next-month nav control (Toolbar `rightSlot` for `view==="month"`).
 *  Ported from dashboard.jsx's month-nav arrows (L520-557). `label` is the month name
 *  ("July 2026"); `nextDisabled` blocks stepping past the current month. */
export function MonthNav({
  label,
  monthIso,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  monthIso: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  const arrowStyle = (disabled: boolean) => ({
    height: 28,
    width: 28,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    cursor: disabled ? ("not-allowed" as const) : ("pointer" as const),
    color: CT_TOKENS.textSecondary,
    opacity: disabled ? 0.4 : 1,
    fontSize: 14,
    fontFamily: CT_TOKENS.mono,
  });
  return (
    <div
      data-testid="dashboard-month-nav"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: CT_TOKENS.surfaceDim,
        borderRadius: 8,
        border: `1px solid ${CT_TOKENS.border}`,
        padding: 2,
      }}
    >
      <button
        type="button"
        data-month-nav="prev"
        onClick={onPrev}
        title="Previous month"
        style={arrowStyle(false)}
      >
        {"‹"}
      </button>
      <span
        data-month-iso={monthIso}
        style={{
          fontFamily: CT_TOKENS.mono,
          fontSize: 12,
          color: CT_TOKENS.textPrimary,
          padding: "0 8px",
          minWidth: 100,
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        data-month-nav="next"
        onClick={nextDisabled ? undefined : onNext}
        disabled={nextDisabled}
        title="Next month"
        style={arrowStyle(nextDisabled)}
      >
        {"›"}
      </button>
    </div>
  );
}

// ── WeekNav ───────────────────────────────────────────────────────────────
/** The Week view's prev/next-week nav control (Toolbar `rightSlot` for `view==="week"`).
 *  A sibling of `MonthNav` (same arrow styling), ported from the reference's `data-week-nav`
 *  arrows (viz/dashboard.jsx L472-515). `label` is the week span ("Jul 7 – Jul 13");
 *  `nextDisabled` blocks stepping into a future week. `mondayIso` is exposed as a data attr
 *  for the live verify-self assertions. */
export function WeekNav({
  label,
  mondayIso,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  mondayIso: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  const arrowStyle = (disabled: boolean) => ({
    height: 28,
    width: 28,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    cursor: disabled ? ("not-allowed" as const) : ("pointer" as const),
    color: CT_TOKENS.textSecondary,
    opacity: disabled ? 0.4 : 1,
    fontSize: 14,
    fontFamily: CT_TOKENS.mono,
  });
  return (
    <div
      data-testid="dashboard-week-nav"
      data-week-monday={mondayIso}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: CT_TOKENS.surfaceDim,
        borderRadius: 8,
        border: `1px solid ${CT_TOKENS.border}`,
        padding: 2,
      }}
    >
      <button
        type="button"
        data-week-nav="prev"
        onClick={onPrev}
        title="Previous week"
        style={arrowStyle(false)}
      >
        {"‹"}
      </button>
      <span
        style={{
          fontFamily: CT_TOKENS.mono,
          fontSize: 12,
          color: CT_TOKENS.textPrimary,
          padding: "0 8px",
          minWidth: 116,
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        data-week-nav="next"
        onClick={nextDisabled ? undefined : onNext}
        disabled={nextDisabled}
        title="Next week"
        style={arrowStyle(nextDisabled)}
      >
        {"›"}
      </button>
    </div>
  );
}

// ── SummaryStrip ──────────────────────────────────────────────────────────
/** The 4 day-summary stat cells (Active / Away / Longest session / Most-used tool). */
export function SummaryStrip({ stats }: { stats: DayStat[] }) {
  return (
    <div
      className="dashboard-summary"
      data-testid="dashboard-summary"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        padding: "14px 20px",
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surface,
        flexShrink: 0,
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontFamily: CT_TOKENS.sans,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: CT_TOKENS.textTertiary,
            }}
          >
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontFamily: CT_TOKENS.mono,
                fontSize: 17,
                fontWeight: 500,
                color: s.accent ?? CT_TOKENS.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              {s.value}
            </span>
            {s.sub && (
              <span
                style={{
                  fontFamily: CT_TOKENS.sans,
                  fontSize: 11,
                  color: CT_TOKENS.textTertiary,
                }}
              >
                {s.sub}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────
/** Static 6-kind color key (swatch + label). Display-only in WP6a (no filter). */
export function Legend() {
  return (
    <div
      className="dashboard-legend"
      data-testid="dashboard-legend"
      style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
    >
      {ALL_KINDS.map((kind) => (
        <span
          key={kind}
          data-legend-kind={kind}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 14,
              height: 8,
              borderRadius: 2,
              ...(kind === "away"
                ? segStyle("away")
                : { background: colorForKind(kind) }),
              border:
                kind === "away" ? `1px solid ${CT_TOKENS.border}` : "none",
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: CT_TOKENS.textSecondary,
              fontFamily: CT_TOKENS.sans,
            }}
          >
            {labelForKind(kind)}
          </span>
        </span>
      ))}
    </div>
  );
}
