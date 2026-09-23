// M14 WP0 Phase 2 — what the WORKSPACE header shows for the SUPERVISOR toggle.
//
// ## Why a separate module from `workspaceDriveMode.ts`
// That module answers *"what mode will this session run under, and does it still match?"*. This
// one answers *"may the supervisor act on this workspace at all?"* — a different question with a
// different storage key, a different default, and no staleness concept (the toggle takes effect
// without a respawn, because the supervisor reads it at fire time rather than at spawn — see
// `supervisorToggleIpc.ts` for how fresh that read is).
//
// ⚠️ **They are NOT merged, and they must not be.** Sharing a derivation would tie the toggle's
// fate to `default_drive_mode`, and clearing the drive mode ALSO disables the auto-resume
// announcement and the picker readout — so "unsupervise this project" and "unset its mode" would
// become one act. They are deliberately independent.
//
// ## ⚠️ THE THREE CONDITIONS, AND WHY THE TOGGLE IS THE THIRD
// Supervision already required **two** things: the M10.9 gate ON, and a stored `default_drive_mode`
// (ruling R-1 — the STORED mode is the authority). This adds a third, narrower one. Turning the
// toggle off must never be confused with clearing the mode; the toggle is the *sanctioned* off
// switch, which is the whole point of WP0's ruling 3 (*do NOT flip `workflow_features_enabled` as
// a stopgap* — the blunt gate also hides the Docs panel and the rest of the workflow layer).
//
// ## ⚠️ PHASE 3 EXTENDS THIS FUNCTION — it does not add a second one
// D-5's suppressed-state marker is a THIRD state of this same readout, not a new derivation.
// Arm 6 of the OFF-invariant guard polices registries by subject; a second derivation would be a
// second subject to register and a second place the gate could be forgotten. When Phase 3 lands,
// add its state to {@link WorkspaceSupervisorReadout} here.

/** What the workspace header should render for the supervisor toggle. */
export interface WorkspaceSupervisorReadout {
  /** Whether the supervisor may act on this project. */
  readonly enabled: boolean;
  /**
   * M14 WP0 Phase 3 (D-5) — the THIRD state: supervision is on, but a half-typed line is
   * currently suppressing it.
   *
   * ⚠️ **DERIVED, NEVER SETTABLE.** It reflects the operator's own unsent input and clears when
   * they submit or abandon the line (the four bytes in `CLEARING_BYTES`). A click-to-clear
   * affordance was CONSIDERED AND DECLINED at spec review — it would be a second control whose
   * effect is invisible until the next turn end.
   *
   * ⚠️ **Only meaningful when `enabled` is true.** A workspace the operator turned off is not
   * "suppressed" — it is off, and the two must never be shown at once or the badge stops
   * meaning anything.
   */
  readonly suppressed: boolean;
  /** The text to render. */
  readonly text: string;
  /** Tooltip — states the effect, not just the state. */
  readonly title: string;
  /** `aria-label` for the control; names the workspace so screen readers disambiguate. */
  readonly label: string;
}

/**
 * The state labels.
 *
 * ⚠️ **"supervised" / "unsupervised", NOT "auto" / "manual" — operator correction at Phase 2
 * verify-human (2026-09-17).** `auto` collided with the DRIVE-MODE readout sitting immediately
 * beside this control, whose own vocabulary includes `autopilot`: two adjacent badges both
 * saying "auto" read as one mode concept rather than two independent settings. These words name
 * the thing the toggle actually governs — whether the *supervisor* acts here — and share a stem
 * with the feature's own name, so the control is self-describing.
 */
export const SUPERVISOR_ON_LABEL = "supervised";
export const SUPERVISOR_OFF_LABEL = "unsupervised";

/**
 * The suppressed marker's glyph.
 *
 * ⚠️ A PAUSE symbol, not a warning triangle or an alarm. Suppression is the supervisor
 * deliberately holding back because the operator is mid-sentence — it is working correctly, and
 * a ⚠-style glyph would read as a fault. The drive-mode readout already uses `⚠` for STALE and
 * `⏳` for a queued apply, so both are taken and neither means this.
 */
export const SUPERVISOR_SUPPRESSED_GLYPH = "⏸";

/**
 * Derive the workspace header's supervisor readout.
 *
 * ⚠️ **Returns `null` when the gate is OFF — the gate decision lives in ONE place**, and the
 * render site follows the data rather than re-deciding. A gated surface must **not exist** when
 * off: not hidden, not disabled, not an empty reserved slot (`useWorkflowFeaturesEnabled`'s
 * contract). This is the shape arm 6 of the OFF-invariant guard can actually police; a
 * component-level `{enabled && <X/>}` would be invisible to it.
 *
 * ⚠️ **`storedMode === null` does NOT hide the control, deliberately.** A project with no drive
 * mode is not supervised today, so it would be tempting to hide the toggle — but then the
 * operator could never pre-set it, and the control would appear and disappear as the mode is
 * set and cleared. The toggle states *this project's* policy; whether supervision is currently
 * possible is the drive-mode readout's job, sitting immediately beside it.
 *
 * @param enabled the project's persisted `supervisor_enabled` (absent → `true`, resolved in Rust)
 * @param gateEnabled `workflow_features_enabled` — when false there is no readout at all
 * @param workspaceName display name, for the accessible label
 */
export function workspaceSupervisorReadout(
  enabled: boolean,
  gateEnabled: boolean,
  workspaceName: string,
  unsentInput = false,
): WorkspaceSupervisorReadout | null {
  if (!gateEnabled) return null;

  // ⚠️ Suppression is only meaningful while supervision is ON. A workspace the operator turned
  // off is not "held back by your typing" — it is off. Showing both would make the badge mean
  // two different things at once, and the OFF state is the one the operator chose.
  const suppressed = enabled && unsentInput;

  return {
    enabled,
    suppressed,
    text: enabled ? SUPERVISOR_ON_LABEL : SUPERVISOR_OFF_LABEL,
    // ⚠️ The tooltip states what will HAPPEN, not merely what the flag is. "Supervisor: on" tells
    // the operator nothing they cannot see; naming the consequence is what makes a two-state
    // control self-explaining on hover.
    // ⚠️ The SUPPRESSED tooltip must say the supervisor is working correctly and name what
    // clears it — otherwise a held-back workspace reads as a broken one, which is the opposite
    // of the reassurance this marker exists to give.
    title: suppressed
      ? "Workflow supervisor is ON but HELD BACK — you have unsent input in this pane, so it " +
        "will not run a skill over what you are typing. Submit the line (or press Esc / " +
        "Ctrl+C / Ctrl+U to abandon it) and it resumes."
      : enabled
        ? "Workflow supervisor is ON for this project — it may auto-run the next skill when a " +
          "turn ends. Click to turn it off for this project only."
        : "Workflow supervisor is OFF for this project — it will never auto-run a skill here. " +
          "Click to turn it back on.",
    label:
      `Workflow supervisor for ${workspaceName}: ${enabled ? "on" : "off"}` +
      `${suppressed ? ", currently held back by unsent input" : ""}. Click to toggle.`,
  };
}
