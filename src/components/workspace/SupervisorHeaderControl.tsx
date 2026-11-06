// The workspace header's supervisor control: the `⚙` toggle badge, its alarm and suppressed
// markers, the `▾` activity trigger and popover, the hover-refreshed hint clock, and the seed that
// replays the durable activity file on mount. Extracted from `Workspace.tsx` at paydown
// 2026-11-04 WP12, so the surface's state and both of its gates sit in one place.
//
// The toggle's VALUE stays in `Workspace` (with its ref): `useSupervisor` reads it at fire time,
// and the toggle action writes it there. This component only renders it and calls `onToggle`.

import { useCallback, useEffect, useState } from "react";
import {
  isSeeded,
  SEED_REPLAY_LIMIT,
  seedActivity,
  useActivityAlarm,
  useLatestActivity,
} from "../../state/supervisor/activityFeed";
import { recentForProject } from "../../state/supervisor/activityRecord";
import {
  ACTIVITY_READ_LINE_LIMIT,
  tryReadActivityLines,
} from "../../state/supervisor/activityRecorder";
import { SupervisorActivityPopover } from "./SupervisorActivityPopover";
import {
  SUPERVISOR_SUPPRESSED_GLYPH,
  workspaceSupervisorReadout,
} from "../../cc/workspaceSupervisor";

export interface SupervisorHeaderControlProps {
  projectPath: string;
  displayName: string;
  /** The per-workspace workflow gate. OFF: no read, no seed, and nothing in the DOM. */
  workflowEnabled: boolean;
  /** Whether this workspace is centre stage. The badge renders only while it is. */
  visible: boolean;
  /** The project's supervisor toggle, with a not-yet-loaded value already collapsed to ON. */
  enabled: boolean;
  /** Whether a half-typed line is holding the supervisor back (the render signal only). */
  unsentInput: boolean;
  onToggle: () => void;
}

export function SupervisorHeaderControl({
  projectPath,
  displayName,
  workflowEnabled,
  visible,
  enabled,
  unsentInput,
  onToggle,
}: SupervisorHeaderControlProps) {
  // The supervisor activity record's in-UI half: the project's newest decision (the badge's
  // "last action" hint) and the popover listing recent ones.
  const lastActivity = useLatestActivity(projectPath);
  const supervisorAlarm = useActivityAlarm(projectPath);
  // ⚠️ The hint's clock is refreshed on HOVER, when the tooltip is actually read, rather than on a
  // timer: a ticking timer would re-render a component hosting a live terminal every few seconds
  // for a label nobody is looking at.
  const [hintNowMs, setHintNowMs] = useState(() => Date.now());
  const [activityOpen, setActivityOpen] = useState(false);
  const closeActivity = useCallback(() => setActivityOpen(false), []);
  useEffect(() => {
    // Seed the hint from the durable file once per project, so it survives a relaunch. ⚠️ Gated:
    // with workflow features OFF this reads nothing, and nothing ever writes the file.
    // M16.5 WP3: the project's newest 50 records are replayed oldest-first, so the failure alarm
    // (`failureAlarm.ts`) also survives a relaunch instead of silently resetting. `seedActivity`
    // folds them IN FRONT of any live decision that beat this async read (paydown WP8).
    // A project already seeded this run skips the read entirely; its records are all folded.
    if (!workflowEnabled || isSeeded(projectPath)) return;
    let cancelled = false;
    void tryReadActivityLines(ACTIVITY_READ_LINE_LIMIT).then((lines) => {
      // ⚠️ A FAILED read is not an empty log: seeding on it would mark the project seeded and
      // disable the relaunch replay for the rest of the run. Leave it unseeded so the next mount
      // retries.
      if (cancelled || lines === null) return;
      const recent = recentForProject(lines, projectPath, SEED_REPLAY_LIMIT);
      // `recentForProject` is newest first; the seed folds oldest first.
      seedActivity(projectPath, recent.reverse());
    });
    return () => {
      cancelled = true;
    };
  }, [workflowEnabled, projectPath]);

  const supervisorReadout = workspaceSupervisorReadout(
    enabled,
    workflowEnabled && visible,
    displayName,
    {
      unsentInput,
      last: lastActivity ? { record: lastActivity, nowMs: hintNowMs } : null,
      failure: supervisorAlarm,
    },
  );
  if (!supervisorReadout) return null;

  // M14 WP0 P2.4 — the per-workspace SUPERVISOR toggle. ⚠️ GATED the same way as the
  // drive-mode readout beside it: `workspaceSupervisorReadout` returns null when the gate
  // is off, so with workflow features disabled this element does not exist in the DOM at
  // all — not hidden, not disabled, not an empty reserved slot.
  // ⚠️ THE HIT-REGION DEFENCES ARE COPIED FROM `CellValueLine`, NOT decoration: this
  // header now carries several adjacent clickable affordances, and M12 hit exactly this
  // in the picker cell — a click meant for one control routing into another "presents as
  // 'the control does nothing' and no unit test can see it". stopPropagation on BOTH
  // pointerdown and click, plus an explicit Enter/Space mirror (a <span role="button">
  // has no implicit keyboard activation) and tabIndex.
  // ⚠️ A SPAN, NOT A <select>: the picker-row drive-mode cell uses a native <select>
  // because its four values are a closed set whose bad string fails serde. This is a
  // BOOLEAN — there is nothing to mistype — so the closed-set argument does not transfer
  // and a two-state click target is the lighter surface.
  return (
    <span className="workspace-header-supervisor-group">
      <span
        role="button"
        tabIndex={0}
        className={`workspace-header-supervisor${supervisorReadout.enabled ? "" : " is-off"}`}
        data-testid="workspace-header-supervisor"
        aria-label={supervisorReadout.label}
        aria-pressed={supervisorReadout.enabled}
        title={supervisorReadout.title}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={() => setHintNowMs(Date.now())}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }
        }}
      >
        ⚙ {supervisorReadout.text}
        {/* M14 WP0 Phase 3 (D-5) — the SUPPRESSED marker. ⚠️ A passive, READ-ONLY badge: it
          reflects the operator's own unsent input and clears when they submit or abandon
          the line. It has NO click handler of its own — the parent span's toggle is the
          only action here, and a click-to-clear affordance was considered and declined at
          spec review (a second control whose effect is invisible until the next turn end).
          ⚠️ Mirrors the drive-mode readout's ⚠-stale / ⏳-pending marker shape, which is
          the established precedent for a derived badge in this exact element. */}
        {/* M16.5 WP3 — the structural-failure ALARM. Unlike the suppressed marker, this one
          is meant to be noticed: the supervisor has failed the same way several turns in a
          row and will keep withholding until something outside it changes. */}
        {supervisorReadout.alarm && (
          <span
            className="workspace-header-supervisor-alarm"
            data-testid="workspace-header-supervisor-alarm"
            title={supervisorReadout.alarm.title}
          >
            {" "}
            {supervisorReadout.alarm.text}
          </span>
        )}
        {supervisorReadout.suppressed && (
          <span
            className="workspace-header-supervisor-suppressed"
            data-testid="workspace-header-supervisor-suppressed"
            title={supervisorReadout.title}
          >
            {" "}
            {SUPERVISOR_SUPPRESSED_GLYPH}
          </span>
        )}
      </span>
      {/* The supervisor activity trigger. ⚠️ A SEPARATE control, because a click on the badge
        is the toggle (today the only way to un-supervise a workspace). Rendered only inside
        this gated block, so it cannot exist with the workflow gate OFF. */}
      <button
        type="button"
        className="workspace-header-supervisor-activity"
        data-testid="workspace-header-supervisor-activity"
        aria-label={`Show supervisor activity for ${displayName}`}
        aria-expanded={activityOpen}
        title={
          supervisorReadout.lastAction
            ? `Supervisor activity. Last: ${supervisorReadout.lastAction}`
            : "Supervisor activity"
        }
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={() => setHintNowMs(Date.now())}
        onClick={(e) => {
          e.stopPropagation();
          setActivityOpen((open) => !open);
        }}
      >
        ▾
      </button>
      {activityOpen && (
        <SupervisorActivityPopover
          projectPath={projectPath}
          onClose={closeActivity}
        />
      )}
    </span>
  );
}
