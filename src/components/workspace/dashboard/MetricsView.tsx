// M9 WP6c-1 — the Metrics view: HeadlineCard (5 summary tiles) + MetricsPanel (6 detailed
// sections), fed by the window-level `MetricsPayload` the Rust `build_metrics` emits.
//
// Ported from claude-time's dashboard.jsx (HeadlineCard L1418, MetricsPanel L1551),
// RE-DERIVED onto WP3's 6-kind model (operator-locked 2026-07-15): `ai_agent` folds in
// ai-reasoning; `human` = typing + reviewing; `blocking.human_blocking_agent` = reviewing
// only. Simplifications vs. the source: NO filter-chip projection (`_computeMetricsView`
// was dropped in WP6a), and away/parallel come straight from the payload (`human.away_ms`
// + the concurrency strata) rather than frontend `_computeAwayMsForWindow` plumbing.
//
// MONOCHROME — the metrics tables use only neutral tokens (the 2 kind-colored
// EffectivenessRow bar blocks live in CompareView = WP6c-2, not here). All durations are
// RAW ms from the payload; `fmtMsDur` formats at render (never quantized upstream — the
// SURFACE-2026-07-13 minute-quantization anti-pattern lives on the summing side, which
// build_metrics does at ms precision).

import type { ReactNode } from "react";
import { CT_TOKENS } from "./tokens";
import { Toolbar, type DashboardView } from "./Chrome";
import type { MetricsPayload } from "../../../state/timeAnalytics";
import {
  fmtMsDur,
  fmtMult,
  parallelMsOf,
  METRIC_SECTIONS,
  type MetricRow,
} from "./metricsMath";

/** The Metrics view container — Toolbar (Metrics tab) + HeadlineCard + MetricsPanel.
 *  Mirrors WeekView/MonthViewContainer's shell idiom. When `isEmpty`, the body shows an
 *  inline zero-state but the toolbar (tab strip) stays, matching the nav-bearing-view
 *  convention (the operator can switch tabs from an empty Metrics view). */
export function MetricsView({
  view,
  onViewChange,
  data,
  isEmpty,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  data: MetricsPayload | null;
  isEmpty: boolean;
}) {
  return (
    <>
      <Toolbar
        view={view}
        onViewChange={onViewChange}
        dateLabel={data ? windowLabel(data) : ""}
      />
      <div
        className="dashboard-metrics"
        data-testid="dashboard-metrics"
        style={{ overflowY: "auto", padding: "18px 20px", flex: 1 }}
      >
        {!data || isEmpty ? (
          <div
            className="dashboard-empty"
            data-testid="dashboard-metrics-empty"
            style={{ padding: "48px 0" }}
          >
            <p className="dashboard-empty-title">No tracked activity today</p>
            <p className="dashboard-empty-hint">
              Once you work in a tracked project, the aggregate metrics for the
              window appear here.
            </p>
          </div>
        ) : (
          <>
            <HeadlineCard data={data} />
            <MetricsPanel data={data} />
          </>
        )}
      </div>
    </>
  );
}

/** `"MAY 13 — MAY 13 · 1 day"` style window readout for the toolbar label. */
function windowLabel(data: MetricsPayload): string {
  const { start, end, day_count } = data.window;
  const days = day_count === 1 ? "1 day" : `${day_count} days`;
  return start === end ? `${start} · ${days}` : `${start} — ${end} · ${days}`;
}

// ── HeadlineCard — 5 big summary tiles ──────────────────────────────────────
/** The one-glance headline: Active session / Human activity / AI effort / Away / Parallel.
 *  Monochrome. Away reads `human.away_ms` (carried in the payload); Parallel = the summed
 *  k≥2 concurrency wallclock (cross-session overlap). */
function HeadlineCard({ data }: { data: MetricsPayload }) {
  const tiles: { label: string; value: string; sub: string }[] = [
    {
      label: "Active session",
      value: fmtMsDur(data.engaged_session.wallclock_ms),
      sub: "wall-clock",
    },
    {
      label: "Human activity",
      value: fmtMsDur(data.human.wallclock_ms),
      sub: "wall-clock",
    },
    {
      label: "AI effort",
      value: fmtMsDur(data.ai_agent.effort_ms),
      sub: "effort-time",
    },
    { label: "Away", value: fmtMsDur(data.human.away_ms), sub: "wall-clock" },
    {
      label: "Parallel",
      value: fmtMsDur(parallelMsOf(data)),
      sub: "overlap",
    },
  ];
  return (
    <div
      className="dashboard-headline"
      data-testid="dashboard-headline"
      style={{
        display: "flex",
        gap: 32,
        flexWrap: "wrap",
        paddingBottom: 20,
        marginBottom: 20,
        borderBottom: `1px solid ${CT_TOKENS.border}`,
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          data-headline-tile={t.label}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
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
            {t.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontFamily: CT_TOKENS.mono,
                fontSize: 24,
                fontWeight: 500,
                color: CT_TOKENS.textPrimary,
                letterSpacing: "-0.01em",
              }}
            >
              {t.value}
            </span>
            <span
              style={{
                fontFamily: CT_TOKENS.sans,
                fontSize: 11,
                color: CT_TOKENS.textTertiary,
              }}
            >
              {t.sub}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MetricsPanel — 6 detailed sections ──────────────────────────────────────
/** The detailed breakdown: 6 bordered sections, each a `Wall-clock | Effort | ×Mult` row
 *  set. Concurrency + Blocking suppress the multiplier column (a "×" there would mislead).
 *  Monochrome — neutral tokens only. Rows are produced by `METRIC_SECTIONS` (pure). */
function MetricsPanel({ data }: { data: MetricsPayload }) {
  return (
    <div className="dashboard-metrics-panel" data-testid="dashboard-metrics-panel">
      {METRIC_SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.rows(data).map((row, i) => (
            <MetricRowView key={`${section.title}-${i}`} row={row} />
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      data-metric-section={title}
      style={{
        border: `1px solid ${CT_TOKENS.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 12,
        background: CT_TOKENS.surface,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: CT_TOKENS.sans,
          fontWeight: 550,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: CT_TOKENS.textSecondary,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

/** One metric row: a left label + up to three right-aligned value cells
 *  (wall-clock / effort / ×mult). A row without a multiplier omits that cell. */
function MetricRowView({ row }: { row: MetricRow }) {
  return (
    <div
      data-metric-row={row.label}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        alignItems: "baseline",
        gap: 16,
        fontFamily: CT_TOKENS.mono,
        fontSize: 12.5,
      }}
    >
      <span style={{ fontFamily: CT_TOKENS.sans, color: CT_TOKENS.textSecondary }}>
        {row.label}
      </span>
      <Cell
        label="wall"
        value={
          row.count != null
            ? String(row.count)
            : row.wallclock_ms != null
              ? fmtMsDur(row.wallclock_ms)
              : ""
        }
      />
      <Cell label="effort" value={row.effort_ms != null ? fmtMsDur(row.effort_ms) : ""} />
      <Cell
        label="mult"
        value={row.multiplier != null ? fmtMult(row.multiplier) : ""}
      />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  if (!value) return <span data-cell={label} />;
  return (
    <span
      data-cell={label}
      style={{ color: CT_TOKENS.textPrimary, minWidth: 56, textAlign: "right" }}
    >
      {value}
    </span>
  );
}
