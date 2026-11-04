// M16.5 WP4 Phase 3 — does this turn end sit at a verify-human pause?
//
// The operator ruled (WP1 verify-human, 2026-10-20) that EVERY verify-human pause reads blue,
// with or without background work. This module answers the one question that needs: "did the
// turn stop inside `feature-verify-human`?". The status channel's display overlay
// (`workspace_status_promote`) does the rest.
//
// ⚠️ SESSION-SCOPED, NOT TURN-SCOPED. A verify-human checklist routinely spans turns: the
// operator answers one item, the agent records it and asks the next, and that turn invokes no
// skill at all. Measured at spec over 45 days (2,736 turn ends): "last skill in THIS turn" finds
// 270 verify-human turn ends, "last skill in the session" finds 402, and a sample of the extra
// 129 was overwhelmingly still waiting on the operator. So the read is "the most recent skill
// invocation in the tail", wherever it sits.
//
// ⚠️ TWO INVOCATION FORMS. An agent-chained skill is a `Skill` tool call; a typed or injected
// one (the operator, the supervisor's own fire, M12 auto-resume) is a user line carrying
// `<command-name>/x</command-name>`. Both count, and whichever is later wins.
//
// ⚠️ NEVER FROM PTY OUTPUT, and never from `last_assistant_message` text: the transcript's
// structured tool calls and command lines are the only inputs.
//
// ⚠️ NOT KEYED ON THE TURN'S EXIT TOKEN (P3.verify-human.0, measured 2026-10-26). A turn that
// emits F11/F12/F13 and then stops has left verify-human, so it reads blue when it should not.
// That looked like a gap at verify-human, but over 45 days (324 verify-human turn ends) it
// happened ONCE (an F13 followed by a bare "Next: …"). The auto-skip variant never happened:
// both real auto-skips chained to verify-codify in the same turn, which already reads grey.
// A rule that withheld blue on an exit token would have un-blued 4–5 real asks in the same
// window: an F13 followed by a question, F12s asking the operator to act, and tokens QUOTED
// inside checklists (the same quoting `readTurn` cannot tell apart). Its cure is worse than
// the gap, so the one false blue is an accepted cost.

import type { WorkspaceStatusUpdate } from "../workspaceStatus";
import {
  lastUserProseIndex,
  parseTranscript,
  skillInvocation,
  type TranscriptLine,
  type TranscriptTail,
} from "./transcript";
import type { Decision } from "./useSupervisor";

/** The skill whose pause the overlay exists for. */
export const VERIFY_HUMAN_SKILL = "feature-verify-human";

const COMMAND_NAME = /<command-name>\/?([\w:.-]+)<\/command-name>/;

/** The slash command a user line invoked, if it carries a `<command-name>` tag. */
function commandInvocation(line: TranscriptLine): string | null {
  if (line.type !== "user") return null;
  const content = line.message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    for (const b of content) {
      if (
        b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "text"
      )
        text += (b as { text?: string }).text ?? "";
    }
  }
  return COMMAND_NAME.exec(text)?.[1] ?? null;
}

/**
 * The most recent skill invocation in the tail (main chain only), or `null` if there is none.
 * A subagent's `Skill` calls are skipped: they do not move the main conversation's state.
 */
export function lastSkillInvocation(
  lines: readonly TranscriptLine[],
): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.isSidechain === true) continue;
    const name = skillInvocation(line) ?? commandInvocation(line);
    if (name) return name;
  }
  return null;
}

/** Did the session's most recent skill invocation enter verify-human? */
export function endsAtVerifyHuman(lines: readonly TranscriptLine[]): boolean {
  return lastSkillInvocation(lines) === VERIFY_HUMAN_SKILL;
}

/**
 * May this turn end be shown as a verify-human pause, given what the supervisor decided?
 *
 * ⚠️ Not after a fire or a started recycle: the turn did not stop, and a blue flash before the
 * next turn starts would be a false ask. A duplicate delivery of the same `Stop` is skipped too
 * (the first delivery already promoted it). Every other outcome, including a withheld fire and
 * a declined recycle, is a real stop.
 */
export function mayPromote(
  decision: Pick<Decision, "outcome" | "reason">,
): boolean {
  if (decision.outcome === "fired" || decision.outcome === "recycle-started")
    return false;
  return decision.reason !== "duplicate-turn-end";
}

/**
 * The most recent skill invocation SEEN per CC session, across turn ends (M16.5 WP4).
 *
 * ⚠️ **This exists because the tail is a window.** `transcript_tail` reads the last 512 KiB, and
 * a long checklist outgrows it: measured over 45 days, **49 of 407** verify-human turn ends sat
 * more than 512 KiB past their invocation (median 47 KiB, p95 1 MB, max 3.6 MB), and a sample
 * of them was still asking ("Reply per item", "**Pass?**"). Every turn end reads its own tail,
 * so each invocation is in view at the end of the turn it happened in; remembering it covers
 * the turns after.
 *
 * Keyed by CC's `session_id`, so a new or resumed session starts empty. The owner clears it
 * when the gate turns OFF, so a stale entry cannot outlive a window in which nothing was read.
 */
export class SessionSkillMemo {
  private readonly bySession = new Map<string, string>();

  /**
   * Fold one turn end's reading in, and return the session's most recent invocation.
   *
   * ⚠️ `turnStartInView` is the guard that keeps the memo honest. When the window does not even
   * reach the current turn's start, that one turn outgrew 512 KiB and may have invoked a skill
   * the window lost, so the memo cannot vouch for anything and is FORGOTTEN. Measured: without
   * this guard the memo raised hits from 358 to 394 of 407 but added 24 false blues, all from one
   * huge `feature-build` turn with agents still running; with it, 380 hits and 0 false blues.
   */
  resolve(
    sessionId: string | null,
    seenInTail: string | null,
    turnStartInView: boolean,
  ): string | null {
    if (sessionId === null) return seenInTail;
    if (seenInTail !== null) {
      this.bySession.set(sessionId, seenInTail);
      return seenInTail;
    }
    if (!turnStartInView) {
      this.bySession.delete(sessionId);
      return null;
    }
    return this.bySession.get(sessionId) ?? null;
  }

  clear(): void {
    this.bySession.clear();
  }
}

/** What {@link promoteIfVerifyHuman} needs from the outside world. */
export interface VerifyHumanPauseDeps {
  readonly workspaceId: string;
  readonly projectPath: string;
  /** The live PTY session id, or `null` when no CC is running in this workspace. */
  readonly ptySessionId: string | null;
  readonly readTail: (args: {
    projectPath: string;
    sessionId: string | null;
    ptySessionId: string;
  }) => Promise<TranscriptTail>;
  readonly promote: (args: {
    workspaceId: string;
    stopEventAt: number;
  }) => Promise<boolean>;
  /** Carries the last invocation past the tail window. Absent → the tail alone decides. */
  readonly memo?: SessionSkillMemo;
}

/**
 * Promote the workspace's dot to "needs you" if this turn end is a verify-human pause.
 * Returns whether a promotion was requested AND applied.
 *
 * ⚠️ The caller checks the M10.9 gate. This function is only reached with it ON, which is
 * what keeps the gate-OFF app byte-identical: no read, no promote, no overlay on the wire.
 *
 * ⚠️ `stopEventAt` is the `Stop`'s own `last_event_at`, and the backend applies the overlay
 * only while that `Stop` is still the workspace's latest event, so the REGISTRY never lets the
 * overlay overwrite a newer event. ⚠️ The EMITS are not ordered that way: the backend emits after
 * releasing its lock, and no consumer compares `last_event_at`, so in a microsecond window a
 * newer event's update can arrive first and the stale blue lands after it, until the next
 * mapped event. Without a timestamp there is nothing to compare against, so nothing is sent.
 */
export async function promoteIfVerifyHuman(
  event:
    | Pick<WorkspaceStatusUpdate, "last_event_at" | "session_id">
    | undefined,
  decision: Pick<Decision, "outcome" | "reason">,
  deps: VerifyHumanPauseDeps,
): Promise<boolean> {
  if (!mayPromote(decision)) return false;
  const stopEventAt = event?.last_event_at;
  if (stopEventAt === undefined || stopEventAt === null) return false;
  if (!deps.ptySessionId) return false;
  const tail = await deps.readTail({
    projectPath: deps.projectPath,
    sessionId: event?.session_id ?? null,
    ptySessionId: deps.ptySessionId,
  });
  const lines = parseTranscript(tail.lines);
  const seen = lastSkillInvocation(lines);
  const last = deps.memo
    ? deps.memo.resolve(
        event?.session_id ?? null,
        seen,
        lastUserProseIndex(lines) >= 0,
      )
    : seen;
  if (last !== VERIFY_HUMAN_SKILL) return false;
  return deps.promote({ workspaceId: deps.workspaceId, stopEventAt });
}
