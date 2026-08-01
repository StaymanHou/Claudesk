// M10.9 WP2 — the Settings panel: Claudesk's app-global preferences surface.
//
// A TOP-LEVEL overlay mounted ONCE at the app shell (the GlobalDashboard pattern), NOT a
// per-workspace right-panel tab. Opened by ⌘, (settingsChord.ts) or Claudesk → Settings…,
// dismissed via its own close button or Esc. Lazy default export — the chunk loads on
// first open, not at app boot.
//
// ## Why this surface exists (WP1 verdict iii-b)
// Three app-global settings had accumulated in an ad-hoc strip inside the ProjectPicker.
// That host was wrong on two counts: the strip was only reachable when NO workspace was
// focused (`viewFor` returns "workspace-open" as soon as one is), and it spent vertical
// space in the picker — the surface hit on every project open — directly above the
// project list that is the picker's actual job.
//
// The decision was NOT "where does one new boolean go" but "has the settings collection
// outgrown its container". It had. So this panel took the three existing controls, added
// the workflow-features gate as a fourth, and the strip is RETIRED — the picker got its
// real estate back, reachability falls out of the design rather than being bolted on, and
// there is finally room for a per-setting help line (which the gate needs, since it
// depends on an external `~/.claude/` install).
//
// Option (iii-a) — build the panel but LEAVE the strip — was the explicitly rejected
// trap: it spreads settings across four places. Migrating the three controls is what made
// this panel worth building.
//
// ## State discipline
// Every control goes through `useSettingControl` (seed → listen → optimistic set →
// revert-on-reject). That discipline was hand-copied three times in the picker; the
// migration MOVED it here once rather than duplicating it a fourth time for the gate.
// The backend is the single source of truth for all four.
//
// ## No dimmed backdrop — a DECISION, not an oversight
// The panel is `aria-modal` but the scene behind renders at full brightness. Reviewed at
// verify-human (2026-07-28) and accepted as-is: it matches the app's flat dark aesthetic
// and the panel is dismissed in seconds. Pinned by a test. **Do not add a scrim without
// re-asking** — a future phase would otherwise "fix" it on the reasonable-looking
// assumption that a modal wants one.
//
// ## Scope guard (WP1 verdict (a)) — do NOT grow this beyond its remit
// NOT in scope: project-list management, a hotkey editor, search/filter within settings,
// per-project settings. PiP mode deliberately stays a View-menu WINDOW command, not a
// preference (same reason "Zoom In" is not in Settings) — so the migration count is 3,
// not 4. M14 EXTENDS this panel; it does not re-litigate it.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSettingControl } from "./useSettingControl";
import { invoke } from "@tauri-apps/api/core";
import {
  WorkflowSubstrateInfo,
  offersInstallWizard,
  type SubstratePresence,
  type InstallProvenance,
} from "./WorkflowSubstrateInfo";
import { WorkflowInstallWizard } from "./WorkflowInstallWizard";
import {
  WorkflowUninstallDialog,
  type UninstallFinished,
} from "./WorkflowUninstallDialog";
import {
  gateToggleAction,
  outcomeForIntent,
  type UninstallIntent,
  type UninstallTrigger,
} from "./uninstallIntercept";
import { UNINSTALL_BUTTON_LABEL } from "./workflowUninstallCopy";
import { getWorkflowSubstrateInstalled } from "../../state/workflowSubstrate";
import {
  CC_PERMISSION_MODE_EVENT,
  CC_PERMISSION_MODE_OPTIONS,
  DEFAULT_CC_PERMISSION_MODE,
  coerceCcPermissionMode,
  type CcPermissionMode,
} from "../../cc/permissionMode";
import {
  getCcPermissionMode,
  setCcPermissionMode,
} from "../../cc/permissionModeIpc";
import {
  TIME_TRACKING_ENABLED_EVENT,
  getTimeTrackingEnabled,
  setTimeTrackingEnabled,
} from "../../state/timeAnalytics";
import {
  UPDATER_NOTIFICATIONS_ENABLED_EVENT,
  getUpdateNotificationsEnabled,
  setUpdateNotificationsEnabled,
} from "../../updater/updaterPrefs";
import {
  WORKFLOW_FEATURES_ENABLED_EVENT,
  WORKFLOW_FEATURES_PRE_SEED_DEFAULT,
  getWorkflowFeaturesEnabled,
  setWorkflowFeaturesEnabled,
} from "../../state/workflowGate";

export interface SettingsPanelProps {
  /** Close the panel (Esc is handled app-level, alongside the ⌘, toggle). */
  onClose: () => void;
  /** M10 WP4 — kick a MANUAL update check. App owns `useUpdater`; this just fires.
   *  Optional: the button hides when App hasn't wired it (mirrors the picker's guard). */
  onCheckForUpdates?: () => void;
  /**
   * M10.9 WP3 Phase 4 — briefly highlight one settings group on open.
   *
   * The invite's primary button routes here, and a user who just clicked "Show me in
   * Settings" needs to know WHICH of four groups they were sent to. Without this the routing
   * is technically correct and practically useless — the panel opens and the user hunts.
   *
   * Pure presentation: the named group gets a self-clearing CSS class. No new state
   * discipline, no change to `useSettingControl`, and it does NOT touch the setting's value.
   * `undefined` (the normal ⌘, / menu / gear path) highlights nothing.
   */
  highlightGroup?: string;
}

/** One labelled settings group. The label + help line are the affordance a flat
 *  unlabelled strip could not offer — and the reason the gate has somewhere to explain
 *  its `~/.claude/` dependency. */
function SettingsGroup({
  id,
  title,
  hint,
  highlighted = false,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  /** M10.9 WP3 — briefly flash this group (the invite routed the user here). */
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`settings-group${highlighted ? " settings-group-highlight" : ""}`}
      data-testid={`settings-group-${id}`}
      data-highlighted={highlighted ? "true" : undefined}
    >
      <h3 className="settings-group-title">{title}</h3>
      <p className="settings-group-hint">{hint}</p>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

/**
 * How long the routed-to group stays flashed — three discrete blinks (operator, 2026-07-29).
 *
 * MUST match the `settings-group-flash` keyframe duration in App.css. If this is longer, the
 * class lingers after the animation finishes and the group sits inertly styled; if shorter,
 * React yanks the class mid-blink and the cue truncates. The pairing is asserted by
 * `settingsHighlight.test.ts` so the two cannot drift.
 */
const HIGHLIGHT_MS = 1200;

export default function SettingsPanel({
  onClose,
  onCheckForUpdates,
  highlightGroup,
}: SettingsPanelProps) {
  // One error surface for the whole panel. A failed WRITE is a direct consequence of a
  // user action, so it must be visible (not console-only). Reads stay silent — see
  // useSettingControl.
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((message: string) => setError(message), []);

  const permissionMode = useSettingControl<CcPermissionMode>({
    initial: DEFAULT_CC_PERMISSION_MODE,
    get: getCcPermissionMode,
    persist: setCcPermissionMode,
    event: CC_PERMISSION_MODE_EVENT,
    errorLabel: "update permission mode",
    onError,
    // A stale/corrupt persisted value falls back to the default rather than selecting an
    // impossible option (behavior carried over from the picker dropdown).
    coerce: coerceCcPermissionMode,
  });

  const timeTracking = useSettingControl<boolean>({
    initial: false, // matches the backend default — no flicker on mount
    get: getTimeTrackingEnabled,
    persist: setTimeTrackingEnabled,
    event: TIME_TRACKING_ENABLED_EVENT,
    errorLabel: "update time tracking",
    onError,
  });

  const updateNotifications = useSettingControl<boolean>({
    initial: true, // backend default is ON (operator-benefit default)
    get: getUpdateNotificationsEnabled,
    persist: setUpdateNotificationsEnabled,
    event: UPDATER_NOTIFICATIONS_ENABLED_EVENT,
    errorLabel: "update notification setting",
    onError,
  });

  const workflowFeatures = useSettingControl<boolean>({
    initial: WORKFLOW_FEATURES_PRE_SEED_DEFAULT, // false — OFF for everyone
    get: getWorkflowFeaturesEnabled,
    persist: setWorkflowFeaturesEnabled,
    event: WORKFLOW_FEATURES_ENABLED_EVENT,
    errorLabel: "update workflow features",
    onError,
  });

  // M10.9 WP3 — substrate presence. Deliberately NOT a `useSettingControl`: that hook's
  // contract is seed → listen to a broadcast → optimistic set → revert, and three of those
  // four don't apply. This is a READ-ONLY probe of the filesystem with no setter, and there
  // is no Claudesk-side event for "a directory appeared" — inventing one (or polling) would
  // add a mechanism to watch something that changes about once in a user's lifetime.
  //
  // `null` until resolved, so the surface renders nothing rather than guessing (see the
  // component header). A rejection also lands as `null`: the backend is contracted never to
  // error, so a rejection here means something unexpected, and silently claiming
  // "not installed" would be worse than showing nothing.
  // M10.9 WP3 — the routed-from-invite highlight, self-clearing after HIGHLIGHT_MS.
  //
  // Seeded from the prop rather than read directly at render time so it FADES: a bare
  // `highlightGroup === id` check would leave the group flashed for as long as the panel
  // stayed open, turning a wayfinding cue into a stuck visual state.
  const [highlighted, setHighlighted] = useState<string | undefined>(
    highlightGroup,
  );
  useEffect(() => {
    if (highlightGroup === undefined) return;
    // Schedules the CLEAR only — it does NOT set the value first. The `useState` initializer
    // above already seeds it from the prop, so a synchronous `setHighlighted(highlightGroup)`
    // here would write a value the state already holds and cost an extra render for nothing
    // (flagged by `react-hooks/set-state-in-effect`, correctly).
    //
    // The panel mounts fresh each time it opens (App renders it conditionally), so the
    // initializer runs on every open — there is no stale-highlight case for a re-open to fix.
    const t = setTimeout(() => setHighlighted(undefined), HIGHLIGHT_MS);
    // Clearing the timer on unmount matters: the panel is dismissible mid-highlight (Esc,
    // close button, the ⌘, toggle), and a surviving timer would call setState on an
    // unmounted component.
    return () => clearTimeout(t);
  }, [highlightGroup]);

  const [substratePresent, setSubstratePresent] =
    useState<SubstratePresence>(null);
  // Extracted so the install wizard can re-run it on success — see `onFinished` below. WP3
  // only ever needed this at mount (a directory does not appear on its own); WP3.5a's wizard
  // makes it appear, so the read has to be repeatable.
  const refreshSubstratePresent = useCallback(() => {
    getWorkflowSubstrateInstalled()
      .then(setSubstratePresent)
      .catch(() => setSubstratePresent(null));
  }, []);
  useEffect(() => {
    let cancelled = false; // StrictMode double-mount guard, same as useSettingControl's
    getWorkflowSubstrateInstalled()
      .then((present) => {
        if (!cancelled) setSubstratePresent(present);
      })
      .catch(() => {
        if (!cancelled) setSubstratePresent(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // M10.9 WP3.5a — the substrate's PROVENANCE, which is a different question from WP3's
  // presence check and cannot be derived from it. Presence answers "is something installed?";
  // provenance answers "did *Claudesk* install it?" — and only the latter decides whether an
  // install affordance may appear. A hand-clone and a Claudesk-managed install are both
  // "present"; only one of them is ours to act on.
  //
  // `null` until resolved, same discipline as `substratePresent`: no affordance is offered
  // until we know, because the default-wrong direction here offers to install over the
  // operator's live repo.
  const [provenance, setProvenance] = useState<InstallProvenance>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const refreshProvenance = useCallback(() => {
    invoke<string>("workflow_install_state")
      .then((s) => setProvenance(s as Exclude<InstallProvenance, null>))
      .catch(() => setProvenance(null));
  }, []);
  useEffect(() => {
    let cancelled = false;
    invoke<string>("workflow_install_state")
      .then((s) => {
        if (!cancelled) setProvenance(s as Exclude<InstallProvenance, null>);
      })
      .catch(() => {
        if (!cancelled) setProvenance(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // M10.9 WP3.5b — the uninstall dialog's open state, plus HOW it was opened. Both entry
  // points are supported (operator, 2026-07-31): the substrate row's button and the gate
  // toggle. The trigger is carried explicitly rather than inferred, because `[Cancel]` means
  // something different on each path — see `UninstallTrigger`.
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallTrigger, setUninstallTrigger] =
    useState<UninstallTrigger>("toggle");

  /**
   * The gate checkbox's onChange. Routes through the pure `gateToggleAction` decision rather
   * than branching inline — this is the branch that decides whether a DESTRUCTIVE dialog
   * opens, which is exactly the shape the repo rule says must be asserted as a value.
   *
   * The `"open-uninstall-dialog"` arm deliberately does NOT call `workflowFeatures.set(false)`
   * first. Not persisting is what makes `[Cancel]` structural: there is no window in which the
   * gate is off-but-not-uninstalled, so a crash or a quit mid-dialog cannot strand the user in
   * `[Keep mccc]`'s state without having chosen it. See `uninstallIntercept.ts`.
   */
  const onGateToggle = useCallback(
    (nextValue: boolean) => {
      if (gateToggleAction(nextValue, provenance) === "open-uninstall-dialog") {
        setUninstallTrigger("toggle");
        setUninstallOpen(true);
        return;
      }
      workflowFeatures.set(nextValue);
    },
    [provenance, workflowFeatures],
  );

  /**
   * Apply an intent from the uninstall dialog.
   *
   * The intent→outcome mapping is the shared pure table, so the dialog's buttons and this
   * handler cannot disagree about what "keep" versus "cancel" means. `persistGate: null` is
   * the cancel case — nothing is written, which is the whole revert.
   */
  const onUninstallIntent = useCallback(
    (intent: UninstallIntent) => {
      const outcome = outcomeForIntent(intent);
      if (outcome.persistGate !== null) {
        workflowFeatures.set(outcome.persistGate);
      }
      // Deliberately does NOT close: `uninstall` fires this at run-START, and tearing the
      // dialog down there would hide the run the user just authorized. The dialog owns its
      // own dismissal via `onClose`.
    },
    [workflowFeatures],
  );

  return (
    <div
      className="settings-panel"
      data-testid="settings-panel"
      role="dialog"
      aria-label="Settings"
      aria-modal="true"
    >
      <header className="settings-panel-header">
        <span className="settings-panel-title">Settings</span>
        <button
          type="button"
          className="settings-panel-close"
          data-testid="settings-panel-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="settings-panel-body">
        <SettingsGroup
          id="claude-code"
          title="Claude Code"
          hint="How new Claude Code sessions start. Takes effect on the next session — the mode is chosen once per process."
        >
          <label className="settings-row">
            <span className="settings-row-label">Permission mode</span>
            <select
              data-testid="picker-permission-mode"
              aria-label="Permission mode"
              value={permissionMode.value}
              onChange={(e) =>
                permissionMode.set(coerceCcPermissionMode(e.target.value))
              }
            >
              {CC_PERMISSION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </SettingsGroup>

        <SettingsGroup
          id="workflow-features"
          title="Workflow features"
          hint="Opt in to the workflow-orchestration layer — docs, auto-resume, and skill shortcuts."
          highlighted={highlighted === "workflow-features"}
        >
          <label className="settings-row settings-row-check">
            <input
              type="checkbox"
              data-testid="settings-workflow-features"
              checked={workflowFeatures.value}
              onChange={(e) => onGateToggle(e.target.checked)}
            />
            <span className="settings-row-label">Enable workflow features</span>
          </label>
          {/* The help line the flat strip had no room for. This setting is the one that
              genuinely needs it: it gates a whole feature class AND depends on software
              Claudesk does not ship. Enabling here is a pure UI flip — it never installs
              or modifies anything under ~/.claude/.

              WP3 trimmed the "Requires the workflow system installed in ~/.claude/" clause
              that used to open this line: the substrate block immediately below now states
              the install status as a FACT for this machine, which is strictly better than a
              generic requirement the reader has to go check. Keeping both would have said
              the same thing twice in adjacent paragraphs. The "doesn't install anything"
              half stays — it is the part the status line does not cover, and it is the
              milestone's load-bearing promise. (Revisit at WP3.5: once the wizards exist,
              enabling CAN trigger an install, so this sentence will need to change.)

              REVISITED 2026-07-29 (WP3.5a Phase 4), and the promise SURVIVES — sharpened, not
              deleted. The wizard installs, but the TOGGLE still does not: milestone property 2's
              revision says Claudesk may install "EXCEPT through an explicit, user-driven wizard",
              and keeping those two acts separate is the whole point. So the copy now attributes
              the non-action to the toggle specifically, and points at the deliberate second step
              rather than claiming nothing in the app can ever install. Saying "this installs
              nothing" would now be false; dropping the line entirely would lose the very
              distinction the milestone is built on. */}
          <p className="settings-row-help">
            Turning this on only shows the features — it doesn&rsquo;t install
            anything. Installing is a separate, explicit step.
          </p>
          {/* M10.9 WP3.5a — the install affordance is passed INTO the substrate block as a
              slot, so it renders directly under "Workflow system: not installed" and above the
              manual-steps disclosure (operator, verify-human 2026-07-30).

              Position is the requirement, not decoration. Rendering the button as a sibling
              *before* this block put it above the very status line that explains why a user
              would want it — an action floating free of its own justification. Inside the
              block, the reading order is: what state am I in → the button that changes it →
              the manual fallback if Claudesk can't act.

              Gated on `offersInstallWizard`, true ONLY for `"absent"`: a `"developer"`
              substrate is the operator's live repo (or a hand-clone) that Claudesk did not
              record installing, and per the provenance rule it must describe, never act.
              `null` (unresolved) shows nothing. */}
          <WorkflowSubstrateInfo
            present={substratePresent}
            provenance={provenance}
            uninstallAction={
              uninstallOpen ? (
                <WorkflowUninstallDialog
                  trigger={uninstallTrigger}
                  onIntent={onUninstallIntent}
                  onClose={() => setUninstallOpen(false)}
                  onFinished={(result: UninstallFinished) => {
                    // Re-resolve BOTH sources, for the same reason the install path does:
                    // they are independent and both stale after a removal. `provenance`
                    // drives the affordances, `substratePresent` drives the status line —
                    // refreshing only one was the shipped WP3.5a bug.
                    refreshProvenance();
                    refreshSubstratePresent();
                    void result;
                  }}
                />
              ) : provenance === "managed" ? (
                /* The visible PAIR of [Install…] (operator, verify-human 2026-07-31). Only
                   `managed` gets it — the provenance rule: Claudesk offers to remove only
                   what it recorded installing, so `developer` (the operator's live repo, a
                   hand-clone, or a damaged record) never sees this button, and `absent` has
                   nothing to remove. Same slot as the dialog it opens, so the affordance and
                   its expanded form occupy one position. */
                <button
                  type="button"
                  className="substrate-install-button"
                  data-testid="substrate-uninstall-button"
                  onClick={() => {
                    setUninstallTrigger("button");
                    setUninstallOpen(true);
                  }}
                >
                  {UNINSTALL_BUTTON_LABEL}
                </button>
              ) : undefined
            }
            installAction={
              wizardOpen ? (
                <WorkflowInstallWizard
                  onClose={() => setWizardOpen(false)}
                  onFinished={(result) => {
                    // Re-resolve BOTH substrate state sources. They are independent and both
                    // stale after an install: `provenance` drives the affordance,
                    // `substratePresent` drives the "installed ✓ / not installed" line.
                    //
                    // Refreshing only provenance (the shipped bug, caught at verify-human)
                    // made the button correctly disappear while the line still read "not
                    // installed" after a successful install — violating the spec criterion
                    // that the block re-resolves without a relaunch. Two sources, one event:
                    // both must be refreshed or the surface contradicts itself.
                    refreshProvenance();
                    refreshSubstratePresent();
                    // Honor the pure reducer's gate decision. Never re-derived here — the
                    // decision came from Rust's terminal-state table.
                    if (result.revert_gate && workflowFeatures.value) {
                      workflowFeatures.set(false);
                    }
                  }}
                  onEnableAndClose={() => {
                    // Goes through the panel's existing `useSettingControl` seam, so the flip
                    // keeps the optimistic-set + revert-on-IPC-failure discipline every other
                    // control here uses. The wizard does not own settings state.
                    workflowFeatures.set(true);
                    setWizardOpen(false);
                  }}
                />
              ) : offersInstallWizard(provenance) ? (
                <button
                  type="button"
                  className="substrate-install-button"
                  data-testid="substrate-install-button"
                  onClick={() => setWizardOpen(true)}
                >
                  Install with the wizard&hellip;
                </button>
              ) : undefined
            }
          />
        </SettingsGroup>

        <SettingsGroup
          id="analytics"
          title="Analytics"
          hint="Time tracking for your Claude Code sessions. Fully offline — nothing is uploaded; sessions are stored in a local database on this Mac. While on, it records Claude Code activity across the whole Mac, not just projects open in Claudesk. Off means zero storage and zero IO."
        >
          <label className="settings-row settings-row-check">
            <input
              type="checkbox"
              data-testid="picker-time-tracking"
              checked={timeTracking.value}
              onChange={(e) => timeTracking.set(e.target.checked)}
            />
            <span className="settings-row-label">Time tracking</span>
          </label>
        </SettingsGroup>

        <SettingsGroup
          id="updates"
          title="Updates"
          hint="How Claudesk tells you about new versions."
        >
          <label className="settings-row settings-row-check">
            <input
              type="checkbox"
              data-testid="picker-update-notifications"
              checked={updateNotifications.value}
              onChange={(e) => updateNotifications.set(e.target.checked)}
            />
            <span className="settings-row-label">Update notifications</span>
          </label>
          {onCheckForUpdates && (
            <button
              type="button"
              className="settings-check-updates"
              data-testid="picker-check-updates"
              onClick={onCheckForUpdates}
            >
              Check for updates
            </button>
          )}
        </SettingsGroup>
      </div>
      {error !== null && (
        <div
          className="settings-panel-error"
          role="alert"
          data-testid="settings-panel-error"
        >
          <span>{error}</span>
          <button
            type="button"
            className="settings-panel-error-dismiss"
            aria-label="Dismiss"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
