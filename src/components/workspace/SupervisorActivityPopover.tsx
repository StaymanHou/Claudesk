// The supervisor activity popover: this project's recent turn-end decisions, opened from the
// trigger beside the `⚙ supervised` badge.
//
// ⚠️ It reads the DURABLE file (`supervisor_activity_read`), not the live feed, so the list spans
// app relaunches. It is only ever rendered inside the gated readout block, so with the workflow
// gate OFF it cannot exist.

import { useEffect, useRef, useState } from "react";
import {
  describeDecision,
  recentForProject,
  type ActivityRecord,
} from "../../state/supervisor/activityRecord";
import { readActivityLines } from "../../state/supervisor/activityRecorder";
import { relativeTime } from "./diff/diffModel";

/** How many decisions the popover lists. */
export const POPOVER_RECORD_LIMIT = 20;

/**
 * How many raw lines to read before filtering to this project. Records from every workspace share
 * one file, so reading only 20 lines would often find none of this project's.
 */
const READ_LINE_LIMIT = 2000;

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
    void readActivityLines(READ_LINE_LIMIT).then((lines) => {
      if (!cancelled)
        setRecords(recentForProject(lines, projectPath, POPOVER_RECORD_LIMIT));
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="supervisor-activity-popover"
      data-testid="supervisor-activity-popover"
      role="dialog"
      aria-label="Supervisor activity"
      onPointerDown={(e) => e.stopPropagation()}
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
