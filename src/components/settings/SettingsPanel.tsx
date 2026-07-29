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
import {
  WorkflowSubstrateInfo,
  type SubstratePresence,
} from "./WorkflowSubstrateInfo";
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
              onChange={(e) => workflowFeatures.set(e.target.checked)}
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
              enabling CAN trigger an install, so this sentence will need to change.) */}
          <p className="settings-row-help">
            Turning this on only shows the features — it doesn&rsquo;t install
            anything.
          </p>
          <WorkflowSubstrateInfo present={substratePresent} />
        </SettingsGroup>

        <SettingsGroup
          id="analytics"
          title="Analytics"
          hint="Local time tracking for your Claude Code sessions. Off means zero storage and zero IO."
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
