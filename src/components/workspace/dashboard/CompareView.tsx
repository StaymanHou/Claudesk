// M9 WP6c-2 — the Compare (A/B) view: PresetSelector + CompareView (window-label header +
// 8 EffectivenessRows), fed by the `ComparisonPayload` the Rust `build_comparison_data`
// emits. The retrospective A/B lens: "this week vs last / this month vs last / today vs a
// trailing baseline / a custom pair" — is my AI-leverage + parallelism trending up or down?
//
// Ported from claude-time's dashboard.jsx (PresetSelector L909, EffectivenessRow L995,
// CompareView L1271), dark-TSX. Simplifications vs the source (WP6c-2 decisions):
//   - D2 (defer): NO `_computeMetricsView` / `useFilter` — Claudesk's Metrics/Compare tabs
//     have no kind-filter seam yet, and CompareView is the sole consumer, so each side's
//     `metrics` feeds straight through.
//   - D3: no `deltas` map — every delta is recomputed FE-side (compareMath.ts).
//   - D5: the 2 kind-colored bar blocks (blocking-split, concurrency-mix) route through the
//     `colorForKind`/family seam (kinds.ts/tokens.ts), NOT the source's hardcoded hues.
//   - D6: the Custom preset reuses the existing RangePicker.tsx.
//
// All durations are RAW ms from the payload; `fmtMsDur` (metricsMath) formats at render.

import type { ReactNode } from "react";
import { CT_TOKENS } from "./tokens";
import { Toolbar, type DashboardView } from "./Chrome";
import { RangePicker } from "./RangePicker";
import { colorForKind } from "./kinds";
import type {
  ComparisonPayload,
  MetricsPayload,
  ComparePreset,
} from "../../../state/timeAnalytics";
import { fmtMsDur } from "./metricsMath";
import {
  fmtSignedDurMs,
  fmtRelPct,
  fmtSignedPp,
  fmtSignedMult,
  relPctOf,
  aiEffortPerHumanPct,
  blockingShares,
  concurrencyShares,
  topConcurrencyShift,
  topBlockingShift,
} from "./compareMath";

// Color-family fills for the two bar blocks (D5):
//   blocking-split — agent→human = AI made the human wait (AI family); human→agent = human
//     reviewing = made the agent wait (human family).
const AH_FILL = colorForKind("ai-doing"); // AI family (agent→human)
const HA_FILL = colorForKind("reviewing"); // human family (human→agent)
// concurrency-mix — the k=1/2/3/4+ strata are ENGAGEMENT LEVELS, not kinds (the one site
// with no kind to map). A graded ramp of increasing salience through the AI family (more
// parallel AI engagement), with a neutral k=1 baseline. Monotone + family-consistent.
const K_RAMP = [
  CT_TOKENS.surfaceAlt, // k=1 (baseline — single session, no parallelism)
  colorForKind("ai-reasoning"), // k=2
  colorForKind("ai-doing"), // k=3
  colorForKind("subagent"), // k=4+
] as const;

export type ComparePresetOrCustom = ComparePreset | "custom";

/** The Compare view container — Toolbar (Compare tab) + PresetSelector + CompareView body.
 *  Mirrors MetricsView's shell idiom (the tab strip stays even on an empty/absent payload,
 *  the nav-bearing-view convention). */
export function CompareViewContainer({
  view,
  onViewChange,
  comparison,
  preset,
  customA,
  customB,
  onPresetChange,
  onCustomRangeChange,
}: {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  comparison: ComparisonPayload | null;
  preset: ComparePresetOrCustom;
  customA: { start: string; end: string };
  customB: { start: string; end: string };
  onPresetChange: (p: ComparePresetOrCustom) => void;
  onCustomRangeChange: (side: "a" | "b", start: string, end: string) => void;
}) {
  return (
    <>
      <Toolbar view={view} onViewChange={onViewChange} dateLabel="" />
      <PresetSelector
        preset={preset}
        onPresetChange={onPresetChange}
        customA={customA}
        customB={customB}
        onCustomRangeChange={onCustomRangeChange}
      />
      <div
        className="dashboard-compare"
        data-testid="dashboard-compare"
        style={{ flex: 1, overflowY: "auto", background: CT_TOKENS.bg }}
      >
        <CompareBody comparison={comparison} />
      </div>
    </>
  );
}

// ── PresetSelector — segmented control + Custom's A/B RangePickers ────────────
function PresetSelector({
  preset,
  onPresetChange,
  customA,
  customB,
  onCustomRangeChange,
}: {
  preset: ComparePresetOrCustom;
  onPresetChange: (p: ComparePresetOrCustom) => void;
  customA: { start: string; end: string };
  customB: { start: string; end: string };
  onCustomRangeChange: (side: "a" | "b", start: string, end: string) => void;
}) {
  const presets: { value: ComparePresetOrCustom; label: string }[] = [
    { value: "wow", label: "WoW" },
    { value: "today_vs_trailing", label: "Today vs trailing" },
    { value: "mom", label: "MoM" },
    { value: "custom", label: "Custom" },
  ];
  return (
    <div
      data-testid="dashboard-compare-presets"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 20px",
        borderBottom: `1px solid ${CT_TOKENS.border}`,
        background: CT_TOKENS.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: 3,
          background: CT_TOKENS.surfaceDim,
          borderRadius: 8,
          border: `1px solid ${CT_TOKENS.border}`,
          alignSelf: "flex-start",
        }}
      >
        {presets.map((p) => {
          const active = p.value === preset;
          return (
            <button
              key={p.value}
              type="button"
              data-compare-preset={p.value}
              data-active={active ? "true" : "false"}
              onClick={() => onPresetChange(p.value)}
              style={{
                background: active ? CT_TOKENS.surface : "transparent",
                color: active ? CT_TOKENS.textPrimary : CT_TOKENS.textSecondary,
                border: "none",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: active ? 550 : 450,
                fontFamily: CT_TOKENS.sans,
                cursor: "pointer",
                boxShadow: active ? `inset 0 0 0 1px ${CT_TOKENS.border}` : "none",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: CT_TOKENS.sans,
              fontSize: 11,
              color: CT_TOKENS.textSecondary,
              fontWeight: 500,
            }}
          >
            A:
          </span>
          <RangePicker
            startIso={customA.start}
            endIso={customA.end}
            onChange={(s, e) => onCustomRangeChange("a", s, e)}
          />
          <span style={{ fontFamily: CT_TOKENS.mono, fontSize: 12, color: CT_TOKENS.textTertiary }}>
            vs
          </span>
          <span
            style={{
              fontFamily: CT_TOKENS.sans,
              fontSize: 11,
              color: CT_TOKENS.textSecondary,
              fontWeight: 500,
            }}
          >
            B:
          </span>
          <RangePicker
            startIso={customB.start}
            endIso={customB.end}
            onChange={(s, e) => onCustomRangeChange("b", s, e)}
          />
        </div>
      )}
    </div>
  );
}

// ── CompareBody — window labels + 8 effectiveness rows ────────────────────────
const ROWS: { rowKey: string; label: string; kind: RowKind }[] = [
  { rowKey: "parallelism-multiplier", label: "Parallelism ×", kind: "multiplier" },
  { rowKey: "ai-effort-per-human-wallclock", label: "AI effort / human wall", kind: "ratio-pct" },
  { rowKey: "blocking-split", label: "Blocking split", kind: "blocking-split" },
  { rowKey: "concurrency-mix", label: "Concurrency mix", kind: "concurrency-mix" },
  { rowKey: "ai-agent", label: "AI agent", kind: "absolute-wallclock-effort-mult" },
  { rowKey: "tool-call", label: "Tool calls", kind: "absolute-wallclock-effort-mult" },
  { rowKey: "human", label: "Human (you)", kind: "absolute-wallclock-only" },
  { rowKey: "engaged-session", label: "Engaged sessions", kind: "absolute-engaged" },
];

function CompareBody({ comparison }: { comparison: ComparisonPayload | null }) {
  if (!comparison) {
    return (
      <div
        data-testid="dashboard-compare-empty"
        className="dashboard-empty"
        style={{ padding: "48px 0" }}
      >
        <p className="dashboard-empty-title">No comparison data</p>
        <p className="dashboard-empty-hint">
          Once you work in a tracked project, the A/B comparison for the selected
          windows appears here.
        </p>
      </div>
    );
  }
  const a = comparison.a.metrics;
  const b = comparison.b.metrics;
  const meta = comparison.meta;
  const aWall = a.engaged_session.wallclock_ms || 0;
  const bWall = b.engaged_session.wallclock_ms || 0;
  const aEmpty = aWall === 0;
  const bEmpty = bWall === 0;
  const bothEmpty = aEmpty && bEmpty;
  const lengthMismatch =
    meta.a_day_count > 0 && meta.b_day_count > 0 && meta.a_day_count !== meta.b_day_count;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Window labels — A and B with day-counts. */}
      <div
        data-compare-section="window-labels"
        style={{
          display: "flex",
          justifyContent: "space-around",
          padding: "10px 20px",
          background: CT_TOKENS.surface,
          borderBottom: `1px solid ${CT_TOKENS.border}`,
        }}
      >
        <WindowLabel
          side="A"
          empty={aEmpty}
          start={meta.a_start}
          end={meta.a_end}
          days={meta.a_day_count}
        />
        <WindowLabel
          side="B"
          empty={bEmpty}
          start={meta.b_start}
          end={meta.b_end}
          days={meta.b_day_count}
        />
      </div>
      {lengthMismatch && (
        <div
          data-compare-warning="length-mismatch"
          style={{
            padding: "6px 20px",
            background: CT_TOKENS.surfaceDim,
            fontFamily: CT_TOKENS.sans,
            fontSize: 11,
            color: CT_TOKENS.textSecondary,
            borderBottom: `1px solid ${CT_TOKENS.border}`,
          }}
        >
          {`windows are different lengths: A is ${meta.a_day_count}d, B is ${meta.b_day_count}d — deltas are absolute, not normalized`}
        </div>
      )}
      {bothEmpty ? (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontFamily: CT_TOKENS.sans,
            fontSize: 13,
            color: CT_TOKENS.textSecondary,
            fontWeight: 500,
          }}
        >
          no tracked time in either window
        </div>
      ) : (
        <div data-compare-section="effectiveness" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...GRID, ...HEADER_STYLE }}>
            <div>Metric</div>
            <div>A</div>
            <div>B</div>
            <div style={{ textAlign: "right" }}>Δ (B − A)</div>
          </div>
          {ROWS.map((r) => (
            <EffectivenessRow key={r.rowKey} rowKey={r.rowKey} label={r.label} a={a} b={b} kind={r.kind} />
          ))}
        </div>
      )}
    </div>
  );
}

function WindowLabel({
  side,
  empty,
  start,
  end,
  days,
}: {
  side: string;
  empty: boolean;
  start: string;
  end: string;
  days: number;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: CT_TOKENS.sans,
          fontSize: 10,
          fontWeight: 500,
          color: CT_TOKENS.textTertiary,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {side} {empty ? "(empty)" : ""}
      </div>
      <div style={{ fontFamily: CT_TOKENS.mono, fontSize: 11, color: CT_TOKENS.textPrimary }}>
        {`${start || "—"} → ${end || "—"} (${days || 0}d)`}
      </div>
    </div>
  );
}

// ── EffectivenessRow — one generalized A·B·Δ row, `kind` dispatches the columns ──
type RowKind =
  | "multiplier"
  | "ratio-pct"
  | "blocking-split"
  | "concurrency-mix"
  | "absolute-wallclock-effort-mult"
  | "absolute-wallclock-only"
  | "absolute-engaged";

const GRID = {
  display: "grid",
  gridTemplateColumns: "160px 1fr 1fr 130px",
  alignItems: "center",
  gap: 8,
  padding: "8px 20px",
} as const;

const HEADER_STYLE = {
  background: CT_TOKENS.surfaceDim,
  borderBottom: `1px solid ${CT_TOKENS.border}`,
  fontFamily: CT_TOKENS.sans,
  fontSize: 10,
  fontWeight: 600,
  color: CT_TOKENS.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
} as const;

function EffectivenessRow({
  rowKey,
  label,
  a,
  b,
  kind,
}: {
  rowKey: string;
  label: string;
  a: MetricsPayload;
  b: MetricsPayload;
  kind: RowKind;
}) {
  return (
    <div
      data-compare-row={rowKey}
      style={{ ...GRID, borderBottom: `1px solid ${CT_TOKENS.border}` }}
    >
      <div
        style={{
          fontFamily: CT_TOKENS.sans,
          fontSize: 12,
          fontWeight: 500,
          color: CT_TOKENS.textPrimary,
        }}
      >
        {label}
      </div>
      <RowColumns rowKey={rowKey} a={a} b={b} kind={kind} />
    </div>
  );
}

/** The A / B / Δ cells for a given row kind. Split out so the row chrome stays uniform. */
function RowColumns({
  rowKey,
  a,
  b,
  kind,
}: {
  rowKey: string;
  a: MetricsPayload;
  b: MetricsPayload;
  kind: RowKind;
}) {
  if (kind === "multiplier") {
    const aM = a.engaged_session.multiplier || 0;
    const bM = b.engaged_session.multiplier || 0;
    const absDelta = bM - aM;
    return (
      <>
        <Col value={`${aM.toFixed(2)}×`} />
        <Col value={`${bM.toFixed(2)}×`} strong />
        <Delta positive={absDelta >= 0}>
          <div>{fmtSignedMult(absDelta)}</div>
          <Sub>{fmtRelPct(relPctOf(aM, bM))}</Sub>
        </Delta>
      </>
    );
  }
  if (kind === "ratio-pct") {
    const aHu = a.human.wallclock_ms || 0;
    const bHu = b.human.wallclock_ms || 0;
    const aRatio = aiEffortPerHumanPct(a);
    const bRatio = aiEffortPerHumanPct(b);
    const absDelta = bRatio - aRatio;
    return (
      <>
        <Col value={aHu === 0 ? "—" : `${aRatio.toFixed(1)}%`} />
        <Col value={bHu === 0 ? "—" : `${bRatio.toFixed(1)}%`} strong />
        <Delta positive={absDelta >= 0}>
          {aHu === 0 || bHu === 0 ? "(N/A)" : fmtSignedPp(absDelta)}
        </Delta>
      </>
    );
  }
  if (kind === "blocking-split") {
    const as = blockingShares(a);
    const bs = blockingShares(b);
    const aWall = a.engaged_session.wallclock_ms || 0;
    const bWall = b.engaged_session.wallclock_ms || 0;
    const shift = topBlockingShift(a, b);
    return (
      <>
        <BarCol>
          {aWall === 0 ? "—" : <BlockingBar ah={as.agentToHuman} ha={as.humanToAgent} />}
        </BarCol>
        <BarCol>
          {bWall === 0 ? "—" : <BlockingBar ah={bs.agentToHuman} ha={bs.humanToAgent} />}
        </BarCol>
        <Delta positive={shift.delta >= 0}>
          <Sub>{shift.label}</Sub>
          <div>{fmtSignedPp(shift.delta)}</div>
        </Delta>
      </>
    );
  }
  if (kind === "concurrency-mix") {
    const aWall = a.engaged_session.wallclock_ms || 0;
    const bWall = b.engaged_session.wallclock_ms || 0;
    const as = concurrencyShares(a);
    const bs = concurrencyShares(b);
    const top = topConcurrencyShift(a, b);
    return (
      <>
        <BarCol>{aWall === 0 ? "—" : <ConcurrencyBar shares={as} />}</BarCol>
        <BarCol>{bWall === 0 ? "—" : <ConcurrencyBar shares={bs} />}</BarCol>
        <Delta positive={top.delta >= 0}>
          <Sub>{`${top.label} share`}</Sub>
          <div>{fmtSignedPp(top.delta)}</div>
        </Delta>
      </>
    );
  }
  if (kind === "absolute-wallclock-effort-mult") {
    const key = rowKey === "ai-agent" ? "ai_agent" : "tool_call";
    const aSub = a[key];
    const bSub = b[key];
    const wallDelta = (bSub.wallclock_ms || 0) - (aSub.wallclock_ms || 0);
    return (
      <>
        <Col>
          <TripletCell wall={aSub.wallclock_ms} eff={aSub.effort_ms} mult={aSub.multiplier} />
        </Col>
        <Col strong>
          <TripletCell wall={bSub.wallclock_ms} eff={bSub.effort_ms} mult={bSub.multiplier} />
        </Col>
        <Delta positive={wallDelta >= 0}>
          <div>{fmtSignedDurMs(wallDelta)}</div>
          <Sub>{fmtRelPct(relPctOf(aSub.wallclock_ms || 0, bSub.wallclock_ms || 0))}</Sub>
        </Delta>
      </>
    );
  }
  if (kind === "absolute-wallclock-only") {
    const aWall = a.human.wallclock_ms || 0;
    const bWall = b.human.wallclock_ms || 0;
    const wallDelta = bWall - aWall;
    return (
      <>
        <Col value={fmtMsDur(aWall)} />
        <Col value={fmtMsDur(bWall)} strong />
        <Delta positive={wallDelta >= 0}>
          <div>{fmtSignedDurMs(wallDelta)}</div>
          <Sub>{fmtRelPct(relPctOf(aWall, bWall))}</Sub>
        </Delta>
      </>
    );
  }
  // absolute-engaged
  const aS = a.engaged_session;
  const bS = b.engaged_session;
  const wallDelta = (bS.wallclock_ms || 0) - (aS.wallclock_ms || 0);
  return (
    <>
      <Col>
        <EngagedCell s={aS} />
      </Col>
      <Col strong>
        <EngagedCell s={bS} />
      </Col>
      <Delta positive={wallDelta >= 0}>
        <div>{fmtSignedDurMs(wallDelta)}</div>
        <Sub>{fmtRelPct(relPctOf(aS.wallclock_ms || 0, bS.wallclock_ms || 0))}</Sub>
      </Delta>
    </>
  );
}

// ── column primitives ─────────────────────────────────────────────────────────
function Col({ value, children, strong }: { value?: string; children?: ReactNode; strong?: boolean }) {
  return (
    <div
      data-compare-col="ab"
      style={{
        fontFamily: CT_TOKENS.mono,
        fontSize: 12,
        color: CT_TOKENS.textPrimary,
        fontVariantNumeric: "tabular-nums",
        fontWeight: strong ? 550 : 400,
      }}
    >
      {children ?? value}
    </div>
  );
}

function BarCol({ children }: { children: ReactNode }) {
  return (
    <div
      data-compare-col="ab"
      style={{
        fontFamily: CT_TOKENS.mono,
        fontSize: 12,
        color: CT_TOKENS.textPrimary,
      }}
    >
      {children}
    </div>
  );
}

function Delta({ children, positive }: { children: ReactNode; positive: boolean }) {
  return (
    <div
      data-compare-col="delta"
      style={{
        textAlign: "right",
        fontFamily: CT_TOKENS.mono,
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 500,
        // No red/green (source R4): active-accent for a positive shift, muted for negative.
        color: positive ? CT_TOKENS.textPrimary : CT_TOKENS.textMuted,
      }}
    >
      {children}
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: CT_TOKENS.textTertiary, fontWeight: 400 }}>{children}</div>
  );
}

function TripletCell({
  wall,
  eff,
  mult,
}: {
  wall: number;
  eff: number;
  mult: number;
}) {
  return (
    <div>
      <div>{fmtMsDur(wall)}</div>
      <div style={{ fontSize: 10, color: CT_TOKENS.textSecondary }}>
        {`eff: ${fmtMsDur(eff)} · ${(mult || 0).toFixed(2)}×`}
      </div>
    </div>
  );
}

function EngagedCell({
  s,
}: {
  s: { wallclock_ms: number; effort_ms: number; multiplier: number; session_count: number };
}) {
  return (
    <div>
      <div>{fmtMsDur(s.wallclock_ms || 0)}</div>
      <div style={{ fontSize: 10, color: CT_TOKENS.textSecondary }}>
        {`eff: ${fmtMsDur(s.effort_ms || 0)} · ${(s.multiplier || 0).toFixed(2)}×`}
      </div>
      <div style={{ fontSize: 10, color: CT_TOKENS.textTertiary }}>
        {`${s.session_count || 0} sessions`}
      </div>
    </div>
  );
}

// ── the two color-family bar blocks (D5) ────────────────────────────────────────
function BlockingBar({ ah, ha }: { ah: number; ha: number }) {
  return (
    <div
      data-compare-bar="blocking-split"
      title={`agent→human: ${ah.toFixed(1)}%, human→agent: ${ha.toFixed(1)}%`}
      style={{
        display: "flex",
        height: 10,
        borderRadius: 2,
        overflow: "hidden",
        background: CT_TOKENS.surfaceDim,
      }}
    >
      <div style={{ width: `${ah}%`, background: AH_FILL }} />
      <div style={{ width: `${ha}%`, background: HA_FILL }} />
    </div>
  );
}

function ConcurrencyBar({ shares }: { shares: { k1: number; k2: number; k3: number; k4: number } }) {
  return (
    <div
      data-compare-bar="concurrency-mix"
      title={`k=1: ${shares.k1.toFixed(1)}%, k=2: ${shares.k2.toFixed(1)}%, k=3: ${shares.k3.toFixed(1)}%, k=4+: ${shares.k4.toFixed(1)}%`}
      style={{
        display: "flex",
        height: 10,
        borderRadius: 2,
        overflow: "hidden",
        background: CT_TOKENS.surfaceDim,
      }}
    >
      <div style={{ width: `${shares.k1}%`, background: K_RAMP[0] }} />
      <div style={{ width: `${shares.k2}%`, background: K_RAMP[1] }} />
      <div style={{ width: `${shares.k3}%`, background: K_RAMP[2] }} />
      <div style={{ width: `${shares.k4}%`, background: K_RAMP[3] }} />
    </div>
  );
}
