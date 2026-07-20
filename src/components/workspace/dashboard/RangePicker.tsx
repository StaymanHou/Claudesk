// M9 WP6b-4 — the Day view's date-RANGE control (start→end). Supersedes the single-date
// DayDatePicker: this picks EITHER a single day (start===end, the common case — today default,
// prev/next arrows step ±1 day, exactly the shipped DayDatePicker ergonomic) OR an arbitrary
// multi-day span (start<end, ≤MAX_RANGE_DAYS=30 — the WP6b-4 re-spec D9 cap, matching the
// flexible timeline's 30-lane zoom-out ceiling), which the flexible timeline renders. Lives in
// the Day Toolbar `rightSlot` (D1: "range mode in the Day view, no separate tab"; D5: "the picker
// is the only range signal" — no tab/label change).
//
// Validation: `validateRange(start, end, MAX_RANGE_DAYS)` (rangeMath). An invalid range
// (end<start, future end, >30 days) shows a red border + `title` tooltip and does NOT commit —
// the parent never fetches an invalid window. A valid change commits via `onChange(startIso, endIso)`.
//
// Prev/next arrows: only meaningful for a SINGLE day (step the day ±1, keeping start===end).
// For a multi-day span they're hidden — a range is set by editing the two date fields
// directly (stepping a whole N-day window by a day is an ambiguous ergonomic we deliberately
// omit; the arrows stay the crisp single-day day-nav they were).

import { useState, type CSSProperties } from "react";
import { CT_TOKENS } from "./tokens";
import { localTodayIso, stepIso, validateRange, isSingleDay } from "./rangeMath";
import { MAX_ZOOM_OUT_SPAN_MIN } from "./viewport";

/** The max span the range picker accepts (WP6b-4 re-spec D9: cap 31→30, matching the
 *  timeline's 30-lane zoom-out ceiling `MAX_ZOOM_OUT_SPAN_MIN`). DERIVED from that ceiling
 *  (÷1440 min/day) so the picker max and the timeline's zoom-out cap are provably ONE number —
 *  `framedRange` caps its reactive readout to this same value, so the readout can never present
 *  a span the picker would reject (SURFACE-2026-07-15-QUALITY-WP6B4-FRAMEDRANGE-PICKER-OFFBYONE).
 *  Exported so tests + callers share it. */
export const MAX_RANGE_DAYS = MAX_ZOOM_OUT_SPAN_MIN / 1440;

export function RangePicker({
  startIso,
  endIso,
  onChange,
}: {
  /** Current range start (`"YYYY-MM-DD"`, local). */
  startIso: string;
  /** Current range end (`"YYYY-MM-DD"`, local). For a single day, `=== startIso`. */
  endIso: string;
  /** Called with a VALID new range (start ≤ end, end ≤ today, ≤31 days). Never called
   *  with an invalid range — the picker shows the error inline and holds. */
  onChange: (startIso: string, endIso: string) => void;
}) {
  const todayIso = localTodayIso(new Date());
  // Buffered inputs, re-synced to props via adjust-during-render (React's recommended
  // alternative to setState-in-effect). Two buffers: start + end.
  const [bufStart, setBufStart] = useState(startIso);
  const [bufEnd, setBufEnd] = useState(endIso);
  const [syncedStart, setSyncedStart] = useState(startIso);
  const [syncedEnd, setSyncedEnd] = useState(endIso);
  if (startIso !== syncedStart) {
    setSyncedStart(startIso);
    setBufStart(startIso);
  }
  if (endIso !== syncedEnd) {
    setSyncedEnd(endIso);
    setBufEnd(endIso);
  }

  const single = isSingleDay(startIso, endIso);
  const atToday = endIso >= todayIso;
  // Validate the current BUFFER (what the user is typing) for the inline error state.
  const bufError = validateRange(bufStart, bufEnd, MAX_RANGE_DAYS);

  // Commit a proposed range only when valid + actually changed.
  const commit = (s: string, e: string) => {
    if (validateRange(s, e, MAX_RANGE_DAYS) === null && (s !== startIso || e !== endIso)) {
      onChange(s, e);
    }
  };
  // Single-day prev/next: step BOTH endpoints by ±1 (keeps start===end). Guarded at today.
  const stepSingle = (delta: number) => {
    const next = stepIso(startIso, delta);
    if (next <= todayIso) commit(next, next);
  };

  const arrowStyle = (disabled: boolean): CSSProperties => ({
    height: 28,
    width: 28,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    cursor: disabled ? "not-allowed" : "pointer",
    color: CT_TOKENS.textSecondary,
    opacity: disabled ? 0.4 : 1,
    fontSize: 14,
    fontFamily: CT_TOKENS.mono,
  });

  const inputStyle = (invalid: boolean): CSSProperties => ({
    padding: "4px 6px",
    border: `1px solid ${invalid ? CT_TOKENS.nowMarker : CT_TOKENS.border}`,
    borderRadius: 5,
    background: CT_TOKENS.surface,
    fontFamily: CT_TOKENS.mono,
    fontSize: 12,
    color: CT_TOKENS.textPrimary,
    width: 130,
    colorScheme: "dark",
  });

  return (
    <div
      data-testid="dashboard-range-picker"
      title={bufError ?? undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 2,
        background: CT_TOKENS.surfaceDim,
        borderRadius: 8,
        border: `1px solid ${bufError ? CT_TOKENS.nowMarker : CT_TOKENS.border}`,
      }}
    >
      {/* Single-day prev arrow (only when the range is one day). */}
      {single && (
        <button
          type="button"
          data-day-nav="prev"
          onClick={() => stepSingle(-1)}
          title="Previous day"
          style={arrowStyle(false)}
        >
          {"‹"}
        </button>
      )}
      <input
        type="date"
        data-range-start
        value={bufStart}
        max={todayIso}
        onChange={(e) => setBufStart(e.target.value)}
        onBlur={() => commit(bufStart, bufEnd)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        style={inputStyle(!!bufError)}
      />
      <span style={{ color: CT_TOKENS.textMuted, fontFamily: CT_TOKENS.mono, fontSize: 12 }}>
        →
      </span>
      <input
        type="date"
        data-range-end
        value={bufEnd}
        max={todayIso}
        onChange={(e) => setBufEnd(e.target.value)}
        onBlur={() => commit(bufStart, bufEnd)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        style={inputStyle(!!bufError)}
      />
      {/* Single-day next arrow (only when the range is one day; guarded at today). */}
      {single && (
        <button
          type="button"
          data-day-nav="next"
          onClick={atToday ? undefined : () => stepSingle(1)}
          disabled={atToday}
          title="Next day"
          style={arrowStyle(atToday)}
        >
          {"›"}
        </button>
      )}
    </div>
  );
}
