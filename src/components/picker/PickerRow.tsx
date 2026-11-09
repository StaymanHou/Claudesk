// One project row of the picker (extracted from ProjectPicker.tsx at paydown 2026-11-04 WP13).
//
// The row is presentation plus its two doors. Every decision with state behind it stays in
// ProjectPicker: the open path (`handleOpenRecent`, which re-derives the action at click time and
// refuses a missing profile BEFORE `record_open`), remove, and the three commit reducers. The row
// receives them as callbacks.
//
// ⚠️ The row receives the gate decision as `workflowApplicable`, already computed per row by the
// picker through `isWorkflowApplicable(<gate>, profile)`. It never sees the raw gate, so
// `workflowApplicableGuard.test.ts` keeps exactly one file to watch for a bare gate read.
//
// ⚠️ The drive-mode `<select>` is NOT here: it lives in `ProjectModelCell.tsx` (the CLAUDE.md
// exception to "never a live <select> on every row"), which this row renders unchanged.

import type { DriveMode } from "../../cc/driveMode";
import type { Profile } from "../../state/profiles";
import type { AnnounceMap } from "../../state/predictAction";
import { ProjectModelCell } from "./ProjectModelCell";
import { PICKER_ROW_CELLS } from "./pickerRowOrder";
import { rowAffordances, type OpenIntent } from "./announceRow";
import type { RecentProject } from "./ProjectPicker";

// Label shown for a project row: prefer the display name, fall back to the path.
function labelFor(project: RecentProject): string {
  return project.display_name ?? project.project_path;
}

export interface PickerRowProps {
  r: RecentProject;
  /** M16.5 WP5 (5.7) — the row sits in the "Open" group: no announcement, no no-fire door. */
  isOpen: boolean;
  announceMap: AnnounceMap;
  /** The per-row gate decision, computed by the picker (see the header). */
  workflowApplicable: boolean;
  profiles: Profile[];
  /** The picker's single open path; both doors funnel through it. */
  onOpenRecent: (projectPath: string, intent?: OpenIntent) => Promise<void>;
  onRemove: (projectPath: string) => Promise<void>;
  onModelCommitted: (projectPath: string, model: string | null) => void;
  onProfileCommitted: (projectPath: string, profile: string | null) => void;
  onDriveModeCommitted: (projectPath: string, mode: DriveMode | null) => void;
}

export function PickerRow({
  r,
  isOpen,
  announceMap,
  workflowApplicable,
  profiles,
  onOpenRecent,
  onRemove,
  onModelCommitted,
  onProfileCommitted,
  onDriveModeCommitted,
}: PickerRowProps) {
  return (
    <li
      className={
        isOpen
          ? "picker-recent-row picker-recent-row--open"
          : "picker-recent-row"
      }
      data-open={isOpen ? "true" : undefined}
    >
      {/* The row's cells are emitted by mapping PICKER_ROW_CELLS, so their ORDER
         and — critically — their FLATNESS live in one asserted value rather than in
         JSX indentation. The model cell (M11.5 WP1) must be a SIBLING of the
         open-project button: nested inside it, every click meant for the model
         would open the project instead. A source-text guard for that rule was
         written first and provably failed to catch a deliberately nested cell, so
         the structure is data now. See pickerRowOrder.ts. */}
      {PICKER_ROW_CELLS.map((cell) => {
        switch (cell) {
          case "open": {
            // M12 WP3 (operator spec, 2026-08-04): the title box AUTO-FIRES by
            // default, and the no-fire escape hatch lives INSIDE it.
            //
            // ⚠️ Both M12 elements are nested in this <button>, which is NOT a
            // violation of pickerRowOrder.ts's rule — that rule forbids a nested
            // <button> (a button-in-button cannot disambiguate the click). The
            // announcement is an inert <span>; the no-fire control is a
            // <span role="button"> with stopPropagation, the same discipline
            // TileActionButton.tsx uses for this exact problem in the filmstrip.
            // M16.5 WP5 (5.7, operator decision 2026-11-02): an OPEN row neither
            // announces nor offers the no-fire door. Clicking it only switches to the
            // existing workspace, so "↻ continue" would promise an action that does
            // not happen. ⚠️ Overridden HERE, not via the gate argument: the `argv`
            // (continue) arm is shown whatever the gate says.
            const affordances = rowAffordances(
              r.project_path,
              announceMap,
              workflowApplicable,
            );
            const announcement = isOpen ? null : affordances.announcement;
            const manual = affordances.manual;
            const showNoFireDoor = isOpen ? false : affordances.showNoFireDoor;
            return (
              <button
                key={cell}
                type="button"
                className="picker-recent"
                data-testid="picker-recent"
                onClick={() => void onOpenRecent(r.project_path)}
              >
                <span className="picker-recent-text">
                  {/* The announcement sits on the NAME's line (operator decision,
                     2026-08-04), settled by measuring rather than by taste: on the
                     path's line the badge took 140px and halved the path
                     (369→184px), while names have real slack (~80-180px).
                     ⚠️ The original comment here also claimed the path then "keeps
                     its FULL width — identical on every row." That was MEASURED
                     FALSE at verify-human (2026-08-05) and is why the gutter below
                     is now reserved unconditionally: see `.picker-recent-gutter`. */}
                  <span className="picker-recent-headline">
                    <span className="picker-recent-name">{labelFor(r)}</span>
                    {isOpen && (
                      <span
                        className="picker-recent-open"
                        data-testid="picker-recent-open"
                        title="Already open — clicking switches to its workspace"
                      >
                        ● open
                      </span>
                    )}
                    {announcement !== null && (
                      <span
                        className={
                          manual
                            ? "picker-recent-announce picker-recent-announce--manual"
                            : "picker-recent-announce"
                        }
                        data-testid="picker-recent-announce"
                        data-manual={manual ? "true" : undefined}
                        title={
                          manual
                            ? `Claude Code will first ask whether to trust this folder, so Claudesk will not type ${announcement}. Trust the folder, then run it yourself.`
                            : `Opening this project will run ${announcement}`
                        }
                      >
                        {/* paydown-2026-11-08 WP5: an untrusted folder's badge carries NO glyph
                           — `↻` would promise a re-run that will not happen. The amber tone and
                           the tooltip carry the meaning. A `⌨︎` stood here at verify-human and
                           was rejected (operator, 2026-11-09): at 0.72rem it reads as a tiny
                           box, i.e. as something broken. */}
                        {manual ? announcement : `↻ ${announcement}`}
                      </span>
                    )}
                  </span>
                  <span className="picker-recent-path">{r.project_path}</span>
                </span>
                {/* ⚠️ THE GUTTER IS ALWAYS RENDERED — this is the P3.9 fix
                   (operator decision, 2026-08-05), and it is load-bearing.
                   Previously `{showNoFireDoor && <span .../>}` put the control
                   directly here as a sibling of `.picker-recent-text`, which has
                   `flex: 1 1 auto` — so on a row with NO prediction the text stack
                   ABSORBED the control's width. Measured: 369px without a badge vs
                   331px with one, meaning a 37-char name truncated mid-word while a
                   LONGER 35-char name on the adjacent row showed in full. Rows
                   disagreed about how much name you get, for a reason invisible to
                   the reader.
                   Reserving the box unconditionally makes every row share one
                   geometry, so names truncate at the same length everywhere. The
                   cost is deliberate and accepted: non-announcing rows also give up
                   the 38px.
                   Note the conditional moved INWARD rather than being deleted —
                   `showNoFireDoor` still governs whether the *control* exists (the
                   contract `announceRow.ts` pins: no prediction ⇒ no control, since
                   both doors would be identical). An empty gutter is spacing, not a
                   control: no role, no tabIndex, no handler, aria-hidden. */}
                <span
                  className="picker-recent-gutter"
                  aria-hidden={!showNoFireDoor}
                >
                  {showNoFireDoor && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="picker-recent-nofire"
                      data-testid="picker-recent-nofire"
                      aria-label={`Open ${labelFor(r)} without running ${announcement}`}
                      title={`Open without running ${announcement}`}
                      // stopPropagation on BOTH pointerdown and click: the outer
                      // <button> would otherwise fire its open-and-run handler, which
                      // is the silent "the control does the wrong thing" failure.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onOpenRecent(r.project_path, "no-fire");
                      }}
                      // Keyboard mirror — a span has no implicit Enter/Space activation,
                      // so without this the control is mouse-only.
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void onOpenRecent(r.project_path, "no-fire");
                        }
                      }}
                    >
                      {/* ⚠️ `⊘` (U+2298), NOT a play triangle. The glyph was `⏵` until the
                         operator rejected it 2026-08-05, and the objection is a real
                         semantic inversion rather than taste: a play icon promises "run
                         this", and this control's entire purpose is to open WITHOUT
                         running the announced command. It advertised the thing it
                         withholds.

                         `⊘` reads as suppression — and the row's announcement one span
                         over is `↻ <command>`, so the pair reads "would re-run X" /
                         "don't". Deliberately not `⤓`/`↴` (motion metaphors that can be
                         misread as "just go, faster") and not `↷` (too close to `↻` to
                         distinguish at 0.72rem). The ACCESSIBLE name is carried by
                         `aria-label`/`title` below, so the glyph never has to be
                         self-explanatory to a screen reader. */}
                      ⊘
                    </span>
                  )}
                </span>
              </button>
            );
          }
          case "model":
            return (
              <ProjectModelCell
                key={cell}
                projectPath={r.project_path}
                projectLabel={labelFor(r)}
                seedModel={r.default_model ?? null}
                seedDriveMode={r.default_drive_mode ?? null}
                profile={r.profile ?? null}
                profiles={profiles}
                onProfileCommitted={onProfileCommitted}
                onCommitted={onModelCommitted}
                onDriveModeCommitted={onDriveModeCommitted}
              />
            );
          case "remove":
            return (
              <button
                key={cell}
                type="button"
                className="picker-recent-remove"
                data-testid="picker-recent-remove"
                aria-label={`Remove ${labelFor(r)} from recents`}
                title="Remove from recents"
                onClick={() => void onRemove(r.project_path)}
              >
                ×
              </button>
            );
        }
      })}
    </li>
  );
}
