// M9 WP6b-2 Phase 3 — pure math for the Custom-range picker (ported from dashboard.jsx
// `validateRange` L293-317). Two Claudesk-specific concerns beyond the mechanical port:
//
//   (1) LOCAL-midnight query bounds. `validateRange`'s day-count + future checks are fine
//       in UTC / ISO-string space (offset-stable for day-level math — the source uses
//       `Date.parse` + ISO compare), but the `{kind:"custom"}` QUERY bounds handed to the
//       backend must be LOCAL-midnight epoch-ms (the backend `resolve_window` works in
//       local time — same as `monthMath.monthRangeMs`/`dayRangeMs`). `rangeToMs` builds
//       local-midnight start → local-end-of-last-day, so the custom span matches how Day
//       and Month already query.
//
//   (2) The 1-day-vs-multi-day discriminator. WP6b-2 renders a 1-day custom range through
//       the existing single-day timeline (proven by the Month drill-down); a multi-day
//       range's proper timeline is WP6b-4 (DayTimeline is single-day only). `rangeDayCount`
//       / `isSingleDay` gate that render-path fork in GlobalDashboard.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a start→end ISO date range. Returns an error string (for the picker's tooltip
 * + red-border state) or `null` when valid. Branch order mirrors the source: missing →
 * bad-shape → unreal → end<start → future → over-max. Day-level math uses UTC (`Date.parse`
 * of `YYYY-MM-DD` is UTC-anchored; both dates share the offset so the difference is stable)
 * and the future check compares ISO strings (sortable, no tz drift) — matching the source.
 */
export function validateRange(
  startIso: string,
  endIso: string,
  maxDays: number,
): string | null {
  if (!startIso || !endIso) return "Pick both start and end dates.";
  if (!ISO_DATE_RE.test(startIso) || !ISO_DATE_RE.test(endIso)) {
    return "Dates must be in YYYY-MM-DD form.";
  }
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return "One of the dates is not a real date.";
  }
  if (endMs < startMs) return "End date must be on or after start date.";
  const todayIso = localTodayIso(new Date());
  if (endIso > todayIso) return "End date must not be in the future.";
  const dayCount = Math.round((endMs - startMs) / 86_400_000) + 1;
  if (dayCount > maxDays) {
    return `Range too long (${dayCount} days > ${maxDays}). Narrow the range.`;
  }
  return null;
}

/** Today as a LOCAL ISO date `"YYYY-MM-DD"` — the picker's `max=` + the future-guard
 *  reference. (Source used `new Date().toISOString().slice(0,10)`, which is UTC and can be
 *  a day off near midnight; local is correct for a local-time tracker.) */
export function localTodayIso(now: Date): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Inclusive day count of a valid ISO range (end - start in days, +1). Assumes the inputs
 *  already passed {@link validateRange}; uses the same UTC day-level math. */
export function rangeDayCount(startIso: string, endIso: string): number {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

/** True when the range is exactly one day (start === end) — gates the single-day render
 *  path (multi-day → the WP6b-4-pending placeholder). */
export function isSingleDay(startIso: string, endIso: string): boolean {
  return (
    ISO_DATE_RE.test(startIso) &&
    ISO_DATE_RE.test(endIso) &&
    startIso === endIso
  );
}

/** Step an ISO date `"YYYY-MM-DD"` by ±N days (LOCAL calendar math — wraps month/year
 *  boundaries via the Date constructor's overflow handling). Used by the Day view's
 *  prev/next date arrows (WP6b-2 P3 merge). Malformed input → the input unchanged. */
export function stepIso(iso: string, deltaDays: number): string {
  if (!ISO_DATE_RE.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${String(dt.getFullYear()).padStart(4, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** A valid ISO range → LOCAL-midnight epoch-ms bounds for the `{kind:"custom"}` query.
 *  `start_ms` = start-date 00:00 local; `end_ms` = end-date 23:59:59.999 local (inclusive,
 *  matching the backend's inclusive `resolve_window`). Null on malformed input. */
export function rangeToMs(
  startIso: string,
  endIso: string,
): { start_ms: number; end_ms: number } | null {
  if (!ISO_DATE_RE.test(startIso) || !ISO_DATE_RE.test(endIso)) return null;
  const [sy, sm, sd] = startIso.split("-").map((n) => parseInt(n, 10));
  const [ey, em, ed] = endIso.split("-").map((n) => parseInt(n, 10));
  const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  return { start_ms: start.getTime(), end_ms: end.getTime() };
}
