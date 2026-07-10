// M9 WP6a — dashboard chrome: Toolbar + SummaryStrip + Legend.
//
// Ported from dashboard.jsx (Toolbar L319, SummaryStrip L691, Legend L1734), stripped
// to the WP6a day-view MVP:
//   - Toolbar: the 5-mode view tabs (Day/Week/Month/Custom/Compare) with ONLY Day
//     enabled — the others render disabled/inert so the toolbar's final geometry is
//     stable and WP6b just wires them (resolved decision 2026-07-08). No month/week/
//     custom nav controls (those come with 6b). No wordmark (Claudesk isn't claude-time).
//   - SummaryStrip: the 4 day stats. The filter-chip cluster is DROPPED (no filter in
//     6a — resolved decision; WP6b adds the ProjectFilterPopover + chips together).
//   - Legend: a STATIC 6-kind key (swatch + label). The source Legend was clickable
//     (FilterContext toggles) — WP6a has no filter, so it's display-only.
//
// Palette + kind model come from tokens.ts / kinds.ts (single source of truth).

import { CT_TOKENS } from "./tokens";
import { ALL_KINDS, colorForKind, segStyle, labelForKind } from "./kinds";
import type { DayStat } from "./dayStats";

// ── Toolbar ───────────────────────────────────────────────────────────────
const VIEW_MODES = [
  { value: "day", label: "Day", enabled: true },
  { value: "week", label: "Week", enabled: false },
  { value: "month", label: "Month", enabled: false },
  { value: "custom", label: "Custom", enabled: false },
  { value: "compare", label: "Compare", enabled: false },
] as const;

/** The view-mode tab strip. Day is the only functional mode in WP6a; the rest are
 *  disabled placeholders (WP6b/6c wire them) so the toolbar layout never shifts. */
export function Toolbar({ dateLabel }: { dateLabel: string }) {
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
          const current = m.value === "day";
          return (
            <button
              key={m.value}
              type="button"
              role="tab"
              data-tab={m.value}
              aria-selected={current}
              aria-disabled={!m.enabled}
              disabled={!m.enabled}
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
