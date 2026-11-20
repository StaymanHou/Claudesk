// M18 WP4 (§R.1, D8) — the ABSENT-HOST NOTE: the one plain-words line a remote workspace shows in
// the skill-row slot when the workflow layer WOULD apply (gate ON, default profile) but its host
// account does not have the workflow system, or has not answered. Prior
// `a-silent-non-action-must-not-read-as-done`: the skill row, Recycle, Session-Start and Docs are
// absent there, and absence on a gate-ON workspace must say why instead of looking broken.
//
// ⚠️ A GATED SURFACE (arm 5 of `offInvariantGuard.test.ts`, its own subject): with the gate OFF
// `hostBlocked` is false, so the note does not exist. The caller computes `hostBlocked` through
// `isWorkflowHostBlocked` (the funnel module's second accepted wrapper of the raw gate), never
// from the raw gate.

import type { HostInput } from "../../state/hostSubstrate";
import { shortHost } from "../picker/remoteRow";

/** The note's test hook. */
export const ABSENT_HOST_NOTE_TESTID = "workspace-absent-host-note";

/** The note: its visible text and its tooltip. */
export interface AbsentHostNote {
  /** With the SHORT host (`mini-host`), as the picker row's `⇄` marker shows it (M17 WP2). */
  readonly text: string;
  /** The same sentence with the full `user@host`, as the picker marker's tooltip shows it. */
  readonly tooltip: string;
}

/**
 * The note, or `null` for no note.
 *
 * - `absent` → the workflow system is not installed for the host; Settings → Remote hosts.
 * - `unknown` → the probe could not answer (e.g. no perl on the host): say so, never guess
 *   (operator ruling A, 2026-11-20).
 * - `undefined` (the store has not seeded yet) → no note: the seed lands within one round-trip
 *   after the open check that preceded the workspace, and a note there would flash.
 *
 * The host reads SHORT in the text and in full in the tooltip (operator, WP4 P3.verify-human.1:
 * the same split the picker row uses, through the same `shortHost`).
 */
export function absentHostNote(inputs: {
  hostBlocked: boolean;
  host: HostInput;
  authority: string | null;
}): AbsentHostNote | null {
  const { hostBlocked, host, authority } = inputs;
  if (!hostBlocked || authority === null) return null;
  if (host === undefined || host === "local") return null;
  const sentence = (who: string): string | null => {
    switch (host.state) {
      case "absent":
        return `The workflow system isn't installed for ${who}. Install it in Settings → Remote hosts.`;
      case "unknown":
        return `Claudesk couldn't check whether the workflow system is installed for ${who}.`;
      default:
        return null;
    }
  };
  const text = sentence(shortHost(authority));
  const tooltip = sentence(authority);
  return text === null || tooltip === null ? null : { text, tooltip };
}
