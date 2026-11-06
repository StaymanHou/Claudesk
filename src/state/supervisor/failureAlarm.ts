// M16.5 WP3 3.2 / 3.6 — the badge ALARM: a supervisor that keeps failing for a structural reason
// says so, instead of looking like a quiet one.
//
// ⚠️ Two failures are silent by construction:
// - **A CC transcript-format change.** `isTurnComplete` keys on undocumented `stop_reason` values
//   and `system` subtypes. If a CC release renames them, every turn withholds
//   `transcript-incomplete` — the "supervisor silently never fires" symptom shipped once already.
// - **An adjudicator that cannot answer** (retired model id, a different model, CC errors).
//   Every fire candidate withholds `adjudicator-failed` by R-6 condition 2.
// Both are correct, safe withholds one at a time, and invisible in aggregate. Per CLAUDE.md:
// silence from a component whose success is invisible is not evidence it works.
//
// ⚠️ THE COUNT IS PER AXIS, OVER THE TURNS THAT REACHED THAT AXIS — not over every record. Most
// turns end with no token at all and never reach the adjudicator, so "3 consecutive records"
// would almost never see 3 adjudicator failures in a row. A record that never got as far as an
// axis is NEUTRAL there: it neither counts nor clears.
//
// ⚠️ EVERY REASON IS CLASSIFIED, EXHAUSTIVELY. `EFFECTS` is a `Record<SupervisorReason, …>`, so a
// new reason does not compile until someone decides what it means for each axis. A default arm
// would let a new failure reason slip past as "clears the alarm".

import type { ActivityRecord, SupervisorReason } from "./activityRecord";

/** Failures in a row, on one axis, that raise the alarm. */
export const ALARM_THRESHOLD = 3;

/** What one record does to one axis's run of failures. */
type Effect = "count" | "clear" | "neutral";

interface AxisEffects {
  /** The transcript-completion read (`transcript-incomplete`). */
  readonly transcript: Effect;
  /** The adjudicator (`adjudicator-failed`). */
  readonly adjudicator: Effect;
}

/** A decision made BEFORE the transcript was read: says nothing about either axis. */
const BEFORE_READ: AxisEffects = {
  transcript: "neutral",
  adjudicator: "neutral",
};
/** A complete transcript was read, and the decision stopped before adjudication. */
const READ_NOT_ADJUDICATED: AxisEffects = {
  transcript: "clear",
  adjudicator: "neutral",
};
/** The adjudicator answered (or the decision passed it). */
const ADJUDICATED: AxisEffects = { transcript: "clear", adjudicator: "clear" };

const EFFECTS: Record<SupervisorReason, AxisEffects> = {
  // Early exits in `useSupervisor`, before `fireOne` runs.
  "supervisor-toggled-off": BEFORE_READ,
  "no-stored-mode": BEFORE_READ,
  "no-pty-session": BEFORE_READ,
  "duplicate-turn-end": BEFORE_READ,
  // The transcript could not be read at all: a different failure, not the format alarm's.
  "no-transcript": BEFORE_READ,
  "transcript-unreadable": BEFORE_READ,
  "sweep-threw": BEFORE_READ,
  // ⚠️ The transcript axis's failure.
  "transcript-incomplete": { transcript: "count", adjudicator: "neutral" },
  // The verdict, after a complete read.
  "no-verdict": READ_NOT_ADJUDICATED,
  "unknown-edge": READ_NOT_ADJUDICATED,
  unmapped: READ_NOT_ADJUDICATED,
  "policy-not-auto": READ_NOT_ADJUDICATED,
  "not-supervised": READ_NOT_ADJUDICATED,
  "not-dispatchable": READ_NOT_ADJUDICATED,
  "already-chained": READ_NOT_ADJUDICATED,
  "workflow-not-supervised": READ_NOT_ADJUDICATED,
  "already-fired-for-this-turn": READ_NOT_ADJUDICATED,
  // ⚠️ The adjudicator axis's failure.
  "adjudicator-failed": { transcript: "clear", adjudicator: "count" },
  // Past the adjudicator.
  "adjudicator-says-awaiting": ADJUDICATED,
  "context-pressure-recycle": ADJUDICATED,
  // The same decision as `context-pressure-recycle`; only the caller's recycle then threw, which
  // says nothing new about either axis.
  "recycle-threw": ADJUDICATED,
  "unsent-input-present": ADJUDICATED,
  "inject-failed": ADJUDICATED,
};

/** The run of failures on each axis for one project. */
export interface AlarmState {
  readonly transcript: number;
  readonly adjudicator: number;
}

export const NO_FAILURES: AlarmState = { transcript: 0, adjudicator: 0 };

/** Fold one record into a project's alarm state. A fire (`reason: null`) clears both axes. */
export function nextAlarmState(
  prev: AlarmState,
  record: Pick<ActivityRecord, "reason">,
): AlarmState {
  const e = record.reason === null ? ADJUDICATED : EFFECTS[record.reason];
  // An unknown reason (a record written by a newer build) is neutral, not a clear.
  if (e === undefined) return prev;
  const step = (n: number, effect: Effect): number =>
    effect === "count" ? n + 1 : effect === "clear" ? 0 : n;
  return {
    transcript: step(prev.transcript, e.transcript),
    adjudicator: step(prev.adjudicator, e.adjudicator),
  };
}

/** The alarm to show, or `null` while both runs are under the threshold. */
export interface SupervisorAlarm {
  readonly kind: "transcript-format" | "adjudicator";
  readonly count: number;
}

export function alarmFor(state: AlarmState): SupervisorAlarm | null {
  if (state.transcript >= ALARM_THRESHOLD)
    return { kind: "transcript-format", count: state.transcript };
  if (state.adjudicator >= ALARM_THRESHOLD)
    return { kind: "adjudicator", count: state.adjudicator };
  return null;
}
