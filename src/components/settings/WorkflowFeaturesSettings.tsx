// M10.9 WP3 / WP3.5a / WP3.5b — the "Workflow features" settings group's body: the gate
// checkbox, its help line, and the substrate block with its install and uninstall affordances.
//
// The group shell (id, title, hint, highlight) stays in SettingsPanel.tsx. ⚠️ So does the
// gate's `useSettingControl`: the panel owns it because the hotkey group reads the same live
// value (see HotkeySettings.tsx), and offInvariantGuard's ALLOWED_GETTER exempts exactly the
// file that owns the gate's read+write pair. This module receives the control; it never reads
// the gate.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SettingControl } from "./useSettingControl";
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

export function WorkflowFeaturesSettings({
  workflowFeatures,
}: {
  /** The panel's gate control (seed → listen → optimistic set → revert). */
  workflowFeatures: SettingControl<boolean>;
}) {
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
  // ⚠️ ONE fetch body, not two. The mount effect used to duplicate `refreshProvenance`'s
  // `invoke().then().catch()` verbatim, differing only by a `cancelled` guard — so a change to
  // the read (a new command name, a different fallback, an added state write) had to be made
  // twice, and making it once would have left the two paths silently disagreeing.
  // (`SURFACE-2026-07-29-QUALITY-WP3.5A-PROVENANCE-FETCH-DUPLICATED`.)
  //
  // The guard is a PARAMETER rather than dropped: the mount path must not write state after
  // unmount, while the manual refresh has no unmount to race and passes a permanently-live
  // predicate.
  const refreshProvenanceIf = useCallback((isLive: () => boolean) => {
    invoke<string>("workflow_install_state")
      .then((s) => {
        if (isLive()) setProvenance(s as Exclude<InstallProvenance, null>);
      })
      .catch(() => {
        if (isLive()) setProvenance(null);
      });
  }, []);
  const refreshProvenance = useCallback(
    () => refreshProvenanceIf(() => true),
    [refreshProvenanceIf],
  );
  useEffect(() => {
    let cancelled = false;
    refreshProvenanceIf(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [refreshProvenanceIf]);

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
    <>
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
    </>
  );
}
