// The supervisor activity record: ONE durable line per turn-end decision.
//
// Why it exists: every supervisor trace used to go to `console.warn`, which neither the operator
// (shipped build) nor an agent (`read_logs` captures nothing) can read, and four exits left no
// trace at all. So "firing correctly", "correctly declining" and "doing nothing" were
// indistinguishable, and the supervisor went silent for a week unnoticed
// (`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`).
//
// ⚠️ This module is the record's ONLY schema home. Rust appends and reads opaque lines (R-4),
// so a field added here needs no backend change, and a field renamed here is a format change
// for every agent reading the file with `jq`. Bump `v` when a field's meaning changes.

import type { DriveMode } from "../workflowMachine/policy";
import type { FanOutReason } from "./fanOut";

/** Exits in `useSupervisor.onTurnEnd` that return BEFORE `fireOne` runs. */
export type EarlyExitReason =
  /** The per-workspace `⚙ supervised` toggle is off. */
  | "supervisor-toggled-off"
  /** The project has no stored drive mode, so it is not supervised (ruling R-1). */
  | "no-stored-mode"
  /** No CC PTY session is attached to the workspace, so there is nothing to inject into. */
  | "no-pty-session";

/** Every reason a record can carry: one closed union, so reasons stay exhaustive and grep-able. */
export type SupervisorReason = FanOutReason | EarlyExitReason;

/** What the turn-end decision came to. */
export type ActivityOutcome =
  | "fired"
  | "withheld"
  | "recycle-started"
  | "recycle-declined"
  /** The supervisor itself failed (a thrown sweep, a failed injection), not a decision. */
  | "error";

/** One line of `supervisor-activity.log`. */
export interface ActivityRecord {
  /** Schema version. */
  readonly v: 1;
  /** Epoch milliseconds. */
  readonly ts: number;
  readonly appVersion: string | null;
  readonly workspaceId: string;
  readonly projectPath: string;
  /** The CC session id from the turn-end hook event, when the event carried one. */
  readonly sessionId: string | null;
  readonly outcome: ActivityOutcome;
  /** `null` only for `fired`. */
  readonly reason: SupervisorReason | null;
  /** The transcript file the decision read, when it got that far. */
  readonly transcriptPath: string | null;
  /** The `TRANSITION:` edge read from the turn, when one was. */
  readonly edgeId: string | null;
  /** The drive mode the policy was resolved under, when a policy was consulted. */
  readonly mode: DriveMode | null;
  /** The verdict's human-readable detail: policy cell, adjudicator basis. Never transcript text. */
  readonly detail: string | null;
  /** The injected command, for `fired`, or the deferred command, for the recycle outcomes. */
  readonly command: string | null;
  /** The context token reading, when it was taken. */
  readonly tokens: number | null;
}

/** Failures of the supervisor's own machinery, as opposed to decisions it made. */
const ERROR_REASONS: ReadonlySet<SupervisorReason> = new Set<SupervisorReason>([
  "sweep-threw",
  "inject-failed",
]);

/** The outcome a non-fire, non-recycle reason maps to. */
export function outcomeForReason(reason: SupervisorReason): ActivityOutcome {
  return ERROR_REASONS.has(reason) ? "error" : "withheld";
}

/** Everything a caller may know about a decision; unknown fields default to `null`. */
export interface RecordInput {
  readonly ts: number;
  readonly appVersion: string | null;
  readonly workspaceId: string;
  readonly projectPath: string;
  readonly sessionId: string | null;
  readonly outcome: ActivityOutcome;
  readonly reason: SupervisorReason | null;
  readonly transcriptPath?: string | null;
  readonly edgeId?: string | null;
  readonly mode?: DriveMode | null;
  readonly detail?: string | null;
  readonly command?: string | null;
  readonly tokens?: number | null;
}

/** Build a complete record, filling every absent optional field with `null`. */
export function buildRecord(input: RecordInput): ActivityRecord {
  return {
    v: 1,
    ts: input.ts,
    appVersion: input.appVersion,
    workspaceId: input.workspaceId,
    projectPath: input.projectPath,
    sessionId: input.sessionId,
    outcome: input.outcome,
    reason: input.reason,
    transcriptPath: input.transcriptPath ?? null,
    edgeId: input.edgeId ?? null,
    mode: input.mode ?? null,
    detail: input.detail ?? null,
    command: input.command ?? null,
    tokens: input.tokens ?? null,
  };
}

/** One JSONL line. `JSON.stringify` escapes newlines, so a record can never span two lines. */
export function serializeRecord(record: ActivityRecord): string {
  return JSON.stringify(record);
}

/** A one-line, human-readable statement of what the decision was. */
export function describeDecision(record: ActivityRecord): string {
  switch (record.outcome) {
    case "fired":
      return `fired ${record.command ?? "(unknown command)"}`;
    case "recycle-started":
      return `recycled, deferring ${record.command ?? "the next skill"}`;
    case "recycle-declined":
      return `recycle declined (${record.command ?? "next skill"} not run)`;
    case "error":
      return `error: ${record.reason ?? "unknown"}`;
    case "withheld":
      return `withheld: ${record.reason ?? "unknown"}`;
  }
}

/**
 * Parse one line of `supervisor-activity.log`. Returns `null` for anything that is not a v1
 * record (a torn write, a future schema), so one bad line never hides the rest.
 */
export function parseRecordLine(line: string): ActivityRecord | null {
  try {
    const r = JSON.parse(line) as Partial<ActivityRecord> | null;
    if (
      !r ||
      r.v !== 1 ||
      typeof r.ts !== "number" ||
      typeof r.projectPath !== "string" ||
      typeof r.outcome !== "string"
    ) {
      return null;
    }
    return r as ActivityRecord;
  } catch {
    return null;
  }
}

/**
 * This project's newest `limit` records, newest FIRST.
 *
 * ⚠️ Filtered by PROJECT PATH, never by workspace id: ids like `ws-1` are reassigned on every app
 * run, so matching on the id would mix another project's history from an earlier run into this
 * one's list.
 */
export function recentForProject(
  lines: readonly string[],
  projectPath: string,
  limit: number,
): ActivityRecord[] {
  const out: ActivityRecord[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const r = parseRecordLine(lines[i]);
    if (r && r.projectPath === projectPath) out.push(r);
  }
  return out;
}
