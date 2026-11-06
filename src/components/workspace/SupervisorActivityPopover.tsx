// The supervisor activity popover: this project's recent turn-end decisions, opened from the
// trigger beside the `⚙ supervised` badge.
//
// ⚠️ It reads the DURABLE file (`supervisor_activity_read`), not the live feed, so the list spans
// app relaunches. It is only ever rendered inside the gated readout block, so with the workflow
// gate OFF it cannot exist.
//
// ⚠️ IT TAKES FOCUS, AND ITS ESC IS SCOPED TO IT (paydown 2026-11-04 WP8). WebKit does not focus a
// button on click, so after `▾` the focus is still in the terminal. With Esc on a `document`
// listener, the key that closed this list ALSO reached CC through xterm's textarea and could
// interrupt a running turn. Now the popover focuses itself on open, handles Esc on its own
// element without letting it bubble, and hands focus back to the terminal when it closes.

import { useEffect, useRef, useState } from "react";
import {
  describeDecision,
  recentForProject,
  type ActivityRecord,
} from "../../state/supervisor/activityRecord";
import {
  ACTIVITY_READ_LINE_LIMIT,
  readActivityLines,
} from "../../state/supervisor/activityRecorder";
import { relativeTime } from "../../state/timeFormat";

/** How many decisions the popover lists. */
export const POPOVER_RECORD_LIMIT = 20;

export function SupervisorActivityPopover({
  projectPath,
  onClose,
}: {
  projectPath: string;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<ActivityRecord[] | null>(null);
  const [nowMs] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readActivityLines(ACTIVITY_READ_LINE_LIMIT).then((lines) => {
      if (!cancelled)
        setRecords(recentForProject(lines, projectPath, POPOVER_RECORD_LIMIT));
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  // Take focus on open; give it back on close. Restored only if the focus is still ours (or was
  // lost with our node), so a click that moved it elsewhere is not overridden.
  useEffect(() => {
    const node = ref.current;
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    node?.focus();
    return () => {
      const now = document.activeElement;
      if (now === null || now === document.body || node?.contains(now)) {
        before?.focus();
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className="supervisor-activity-popover"
      data-testid="supervisor-activity-popover"
      role="dialog"
      aria-label="Supervisor activity"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="supervisor-activity-title">Supervisor activity</div>
      {records === null ? (
        <div className="supervisor-activity-empty">Loading…</div>
      ) : records.length === 0 ? (
        <div className="supervisor-activity-empty">
          No decisions recorded for this project yet.
        </div>
      ) : (
        <ul className="supervisor-activity-list">
          {records.map((r, i) => (
            <li
              key={`${r.ts}-${i}`}
              className={`supervisor-activity-row is-${r.outcome}`}
              data-testid="supervisor-activity-row"
              title={r.detail ?? undefined}
            >
              <span className="supervisor-activity-when">
                {relativeTime(r.ts / 1000, nowMs / 1000)}
              </span>
              <span className="supervisor-activity-what">
                {describeDecision(r)}
              </span>
              {r.edgeId && (
                <span className="supervisor-activity-edge">{r.edgeId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
