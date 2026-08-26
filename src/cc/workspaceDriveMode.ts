// M13.5 WP4 P2 — what the WORKSPACE header shows for the drive mode.
//
// ## Why this is a separate module from `driveMode.ts`
// `cc/driveMode.ts` owns the VOCABULARY (`DRIVE_MODES`, the wire strings) and the PICKER CELL's
// layout (`cellLines`). This module owns the WORKSPACE readout's derivation, and the two are
// deliberately not shared:
//
// ⚠️ **`cellLines()` is the picker cell's layout, NOT a shared widget** (WBS task 4.5, verbatim:
// "do not reuse it here and do not widen it to serve two callers"). The picker cell stacks a
// model line above a mode line and answers "what will the NEXT spawn use". This surface answers
// a different question — "what is THIS session running under, and does it still match?" — which
// the picker cell has no concept of, because a picker row has no running session.
//
// The vocabulary IS shared: `DriveMode` and `DRIVE_MODES` are imported, never redeclared.
// ⚠️ `fsd` and `stepping` are the load-bearing spellings; `full-autopilot` / `step-by-step` are
// the wrong guesses and fail serde on read, taking the whole project list down.
//
// ## The two values, and why BOTH are needed
// A live process's environment is fixed, so changing a project's mode mid-session does not reach
// the running CC. That leaves two facts that can disagree:
//
//   - **stored** — `projects.json`'s `default_drive_mode`. What the NEXT spawn will use.
//   - **running** — what the live session actually spawned under (M13.5 WP4 P1's retained
//     value, read back via `cc_drive_mode`). Post-gate: `null` means the session received no
//     `CLAUDESK_DRIVE_MODE` at all.
//
// Showing only `stored` while a session runs on the old value is a confabulation channel — the
// operator would read a mode the session is not obeying. Showing only `running` hides the change
// they just made. So the readout shows stored, and marks itself STALE when they differ.
//
// ## ⚠️ STALE IS A CALL TO ACT, NOT A NOTICE TO WAIT — the copy rule this surface got wrong once
// The first tooltip read *"takes effect on the next session"*, and the operator rejected it at
// Phase 2 verify-human as **against the spec**: that sentence describes the REJECTED design.
// The whole point of WP4 is that a mode change applies to the session you are IN, via the
// turn-level respawn (`/exit` → new env → relaunch with `--continue`) that P1 built as
// `OpenIntent::TurnRespawn`. Telling the operator to wait for a new session points them at
// **Recycle** — the session-boundary instrument this WP explicitly rejected, which writes a
// handoff and restores from notes rather than keeping the conversation.
//
// So any copy on this surface must (a) name the running session's actual mode, and (b) point at
// APPLYING it here — never at a future session. AC-5: when stale, the readout offers the
// respawn. Phase 4 wires that affordance; this text is what tells the operator it exists.

import type { DriveMode } from "./driveMode";

/** What the workspace header should render for the drive mode. */
export interface WorkspaceDriveModeReadout {
  /** The mode the NEXT spawn will use — `null` when the project pins none. */
  readonly stored: DriveMode | null;
  /** What the live session spawned under — `null` when it received no mode. */
  readonly running: DriveMode | null;
  /**
   * True when `stored` and `running` disagree, i.e. the operator changed the mode and the
   * running session has not picked it up. Phase 4's apply-now affordance keys on this.
   */
  readonly isStale: boolean;
  /** The text to render. */
  readonly text: string;
  /** Tooltip — states both values when stale, so the readout is self-explaining on hover. */
  readonly title: string;
}

/** Compact label for a project that pins no mode. Mirrors `DRIVE_MODE_UNSET_LABEL`'s brevity. */
export const WORKSPACE_DRIVE_MODE_UNSET_LABEL = "None";

/**
 * Derive the workspace header's drive-mode readout.
 *
 * ⚠️ **Returns `null` when the gate is OFF, and that is the gate decision living in ONE place.**
 * The render site follows the data rather than re-deciding — the same shape `cellLines` uses, and
 * the reason the picker cell's gate collapse is provable as a value. A gated surface must **not
 * exist** when off (not hidden, not disabled, not an empty reserved slot) per
 * `useWorkflowFeaturesEnabled`'s contract.
 *
 * ⚠️ **`sessionLive` is a distinct input from `running`, and conflating them was the available
 * bug.** A workspace whose CC has not spawned yet (or failed to) has NO running mode, which is
 * not the same as "running under no mode": the first cannot be stale, the second can. Without
 * this flag a not-yet-spawned workspace with a stored mode would render as stale and offer an
 * apply-now respawn against a session that does not exist.
 *
 * @param stored the project's persisted mode, or `null` if it pins none
 * @param running what the live session spawned under, or `null` if it received no mode
 * @param gateEnabled `workflow_features_enabled` — when false there is no readout at all
 * @param sessionLive whether a CC session is actually running for this workspace
 */
export function workspaceDriveModeReadout(
  stored: DriveMode | null,
  running: DriveMode | null,
  gateEnabled: boolean,
  sessionLive: boolean,
): WorkspaceDriveModeReadout | null {
  if (!gateEnabled) return null;

  // Staleness is only meaningful against a session that exists to be stale.
  const isStale = sessionLive && stored !== running;
  const storedText = stored ?? WORKSPACE_DRIVE_MODE_UNSET_LABEL;

  return {
    stored,
    running,
    isStale,
    text: storedText,
    title: isStale
      ? `Drive mode: ${storedText}. This session is still running as ` +
        `${running ?? WORKSPACE_DRIVE_MODE_UNSET_LABEL} — apply it to restart Claude Code ` +
        `here and keep this conversation.`
      : `Drive mode: ${storedText}.`,
  };
}
