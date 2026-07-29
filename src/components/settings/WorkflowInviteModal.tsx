// M10.9 WP3 Phase 4 — the one-time evangelistic invite.
//
// The milestone's single shot at a first impression: it converts a hard audience boundary
// (workflow features exist but nobody outside the operator knows) into a soft, discoverable
// one. It shows at most once per install and never re-pitches after resolution.
//
// ## Scope — pitch + ROUTE, nothing else (operator decision, 2026-07-29)
// This modal does NOT carry install commands, does NOT run a presence check, and does NOT
// flip the gate. All of that lives in the Settings panel. The operator moved the boundary
// mid-cycle: **Settings owns the substrate, the invite owns only discovery.** That tightens
// Verdict (b)'s own scoping rule — the invite's irreducible non-overlap with Settings is
// *discovery* — which the original plan violated by duplicating install content here.
//
// Concretely: the primary button OPENS SETTINGS (and highlights the workflow-features row).
// It does not enable anything. This REVERSES the earlier "flips the gate inline" decision,
// and the reason is substantive rather than stylistic: once WP3.5 lands, enabling can trigger
// an install wizard, so enabling straight from a pitch would mean consenting without ever
// seeing whether the substrate is installed. The second step is where the actual decision is.
//
// ## Copy is operator-approved — do NOT freely edit
// From `wbs.md` → "Settled copy — 2026-07-29". Pinned by `workflowInviteCopy.test.ts`:
//   - frames the tour as `~10–15 min`, NEVER "quick" or "5-minute" (upstream §6 FORBIDS the
//     shorter claim and structurally pins its absence on their side too);
//   - names NO slash command at all — `/tutorial-getting-started` only works AFTER install.sh
//     has run, so naming it in the invite invites typing something that fails. The pointer
//     lives in Settings' installed state, where it is actionable.
//   - says nothing about the greenfield/brownfield fork or a permission mode (upstream §4c).
//
// ## No scrim
// Matches the Settings panel's test-pinned decision (operator-reviewed 2026-07-28). Do not
// add a dimmed backdrop to either surface without re-asking.

/**
 * The pitch, exported as a VALUE so the copy-fidelity test asserts what actually renders
 * rather than scraping JSX (this repo has no DOM test environment). The component
 * interpolates these constants; it does not re-type the sentences.
 */
export const INVITE_TITLE = "Workflow orchestration for Claude Code";

export const INVITE_BODY_1 =
  "Claudesk has an optional layer for a companion workflow system — it gives real project work structure: product → feature → task cycles, durable state in plain files you can open, and verification gates where you stay in the loop.";

export const INVITE_BODY_2 =
  "It needs a one-time install outside Claudesk. There's a guided ~10–15 minute walkthrough on a sample project — a real run, so you watch it actually work — and a single command uninstalls the whole thing if it's not for you.";

/** The three button labels, exported so the test pins the exact affordances. */
export const INVITE_PRIMARY_LABEL = "Show me in Settings";
export const INVITE_LATER_LABEL = "Later";
export const INVITE_DISMISS_LABEL = "Dismiss";

interface WorkflowInviteModalProps {
  /** Route to Settings (and highlight the gate row). Records `acknowledged`. */
  onShowSettings: () => void;
  /** Hide for THIS SESSION only — persists nothing, so it returns next launch. */
  onLater: () => void;
  /** Permanent suppression — records `dismissed`. */
  onDismiss: () => void;
}

/**
 * Three buttons, three genuinely distinct intents.
 *
 * The middle one is what makes the model coherent. An earlier two-button draft had
 * `[Not now]` meaning *permanent* suppression — a mislabeled control that lies to the user.
 * The operator's correction: `[Later]` must actually mean later.
 *
 * | Button | Persisted write | Effect |
 * |---|---|---|
 * | `[Show me in Settings]` | `acknowledged` | Routes to Settings; never re-shown. |
 * | `[Later]` | **none** | Hidden this session; **re-shows next launch**. |
 * | `[Dismiss]` | `dismissed` | Never re-shown. |
 *
 * `[Later]` being the *absence* of a write is exactly the updater's `dismissBanner`
 * (`useUpdater.ts:180-183` — clears the banner, persists nothing, reappears next launch)
 * versus `skipVersion` (`:173` — writes to disk for permanent suppression). That precedent
 * is why `[Later]` needs no field of its own: the existing `null` state already means
 * "unresolved", and a session-scoped hide is a React concern, not a persistence one.
 */
export function WorkflowInviteModal({
  onShowSettings,
  onLater,
  onDismiss,
}: WorkflowInviteModalProps) {
  return (
    <div
      className="workflow-invite"
      data-testid="workflow-invite"
      role="dialog"
      aria-modal="true"
      aria-label={INVITE_TITLE}
    >
      <h2 className="workflow-invite-title">{INVITE_TITLE}</h2>
      <p className="workflow-invite-body">{INVITE_BODY_1}</p>
      <p className="workflow-invite-body">{INVITE_BODY_2}</p>
      <div className="workflow-invite-actions">
        <button
          type="button"
          className="workflow-invite-btn workflow-invite-btn-primary"
          data-testid="workflow-invite-primary"
          onClick={onShowSettings}
        >
          {INVITE_PRIMARY_LABEL}
        </button>
        <button
          type="button"
          className="workflow-invite-btn"
          data-testid="workflow-invite-later"
          onClick={onLater}
        >
          {INVITE_LATER_LABEL}
        </button>
        <button
          type="button"
          className="workflow-invite-btn"
          data-testid="workflow-invite-dismiss"
          onClick={onDismiss}
        >
          {INVITE_DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}
