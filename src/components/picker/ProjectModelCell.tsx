// M11.5 WP1 — the per-project CC model override, as a picker-row cell.
// M12 WP4c — the same cell now stacks a second line: the per-project workflow drive mode.
//
// ## Why it lives HERE and not on the workspace header
// The first build put the model control in the workspace header; the operator rejected that at
// verify-human (2026-07-31) and moved it to the picker row, right-aligned. The placement
// is better on its own terms: the value applies **at spawn**, so the picker row is the
// moment of use — you choose it as part of choosing the project, and every project's
// value is visible at once instead of one-at-a-time on whichever workspace is centre-stage.
// See design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`. The drive mode is
// read at spawn too, so it belongs on the same surface for the same reason — and it was put
// here rather than in BOTH places deliberately: two homes for one per-project value would
// need a sync path that does not exist.
//
// ## Why a label that becomes an editor, rather than a permanent editor
// Operator's call, same review. With 20+ rotating projects, an input box on every row is
// visual noise on the app's most-glanced surface; a compact label keeps the list quiet and
// costs one click to edit. `[[explicit-selectable-mode-over-inferred-mode]]` is still
// honored — the active value is *readable without interaction* on every row, which is the
// part of that prior that governs here; only the *edit affordance* is behind a click.
//
// ## ⚠️ TWO EDIT TARGETS IN ONE COLUMN — the structural risk of M12 WP4c
// The cell renders two stacked lines, each independently editable. The previous
// implementation put a single cell-wide click handler on the whole cell, which would now be
// **ambiguous**: a click meant for the mode would open the model editor. That failure
// presents to the user as *"the control does nothing"* and **no unit test can see it**
// (`pickerRowOrder.ts` says so explicitly). So each line owns its own hit region, and each
// copies WP3's `⊘` discipline verbatim: `stopPropagation` on **both** pointerdown and click,
// plus an explicit Enter/Space mirror (a `<span role="button">` has no implicit activation).
// Verified live by clicking each line and by an `elementFromPoint` hit-test — asserting the
// element resolves to *itself*, rather than assuming.
//
// ## Structural constraint (load-bearing, unchanged from M11.5)
// The picker row's open-project area is a `<button>`. This cell MUST be a sibling of it,
// never inside it, or a click intended for the cell would open the project. The cell also
// stops propagation so a click here never reaches the row.
//
// ## Where the displayed values come from (M11.5 repair (B), extended at M12 WP4c)
// Both seeds arrive as PROPS, from the `recents` array the picker already holds. This cell
// used to fetch the model itself on mount via `project_get_default_model` — one IPC read per
// row, each re-reading + re-parsing + re-sorting the whole `projects.json` for a field
// `list_projects` had ALREADY returned on the wire. Because filtered-out rows unmount,
// clearing the filter box re-fired all N. So there is deliberately no mount-time read here
// for EITHER value, and `driveModeIpc.ts` deliberately ships no getter at all
// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
//
// The writes still go out per-commit — one IPC per user action, not per render.
// `onCommitted` / `onDriveModeCommitted` report new values up so the parent's array stays
// truthful; without that, a commit followed by a filter round-trip would re-seed from a stale
// snapshot. See `applyCommittedModel.ts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { setProjectDefaultModel } from "../../cc/modelOverrideIpc";
import {
  setProjectDefaultDriveMode,
  type DriveMode,
} from "../../cc/driveModeIpc";
import {
  MODEL_ALIAS_HINTS,
  MODEL_UNSET_LABEL,
  MODEL_UNSET_PLACEHOLDER,
  displayModelValue,
  normalizeModelValue,
  modelValueChanged,
} from "../../cc/modelOverride";
import {
  DRIVE_MODES,
  DRIVE_MODE_UNSET_PLACEHOLDER,
  cellLines,
  driveModeChanged,
} from "../../cc/driveMode";
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
import { commitCellValue } from "./commitCellValue";

/**
 * ⚠️ EXECUTABLE seam reference for the M10.9 workflow gate — do not delete as unused.
 *
 * The OFF-invariant guard (`src/state/__tests__/offInvariantGuard.test.ts`) **strips comments
 * before matching**, so a comment-only mention of the gate was MEASURED at M11 not to satisfy
 * it. A type alias is executable source: it survives the strip, and it breaks the build if the
 * hook is ever renamed or removed — which is exactly the coupling the guard wants provable.
 */
type WorkflowGateValue = ReturnType<typeof useWorkflowFeaturesEnabled>;

interface ProjectModelCellProps {
  projectPath: string;
  /** Human label for this project, used only in the a11y names. */
  projectLabel: string;
  /**
   * This project's persisted model override, from the picker's `recents` array — `null` = no
   * override (inherit CC's own default). Supplied rather than fetched; see the header note.
   */
  seedModel: string | null;
  /**
   * This project's persisted drive mode, from the same array — `null` = unset, meaning
   * Claudesk sets no env var and the workflow skills ask as they always have.
   */
  seedDriveMode?: DriveMode | null;
  /**
   * Report a successfully-persisted model so the parent can fold it into `recents`,
   * keeping the seed truthful across an unmount (filter in/out). Success path only — a
   * failed write reverts locally and must NOT be written back.
   */
  onCommitted?: (projectPath: string, model: string | null) => void;
  /** Same contract as {@link onCommitted}, for the drive mode. */
  onDriveModeCommitted?: (projectPath: string, mode: DriveMode | null) => void;
}

const HINTS_ID = "picker-model-hints";

export function ProjectModelCell({
  projectPath,
  projectLabel,
  seedModel,
  seedDriveMode = null,
  onCommitted,
  onDriveModeCommitted,
}: ProjectModelCellProps) {
  const gateEnabled: WorkflowGateValue = useWorkflowFeaturesEnabled();

  const [model, setModel] = useState<string | null>(seedModel);
  const [draft, setDraft] = useState(() => displayModelValue(seedModel));
  const [editingModel, setEditingModel] = useState(false);
  const [mode, setMode] = useState<DriveMode | null>(seedDriveMode);
  const [editingMode, setEditingMode] = useState(false);
  // ⚠️ ONE FLAG PER VALUE, deliberately. A single shared `failed` was the first shape and it
  // was wrong in a way that lies to the user: a failed drive-mode write turned the whole cell
  // red AND rewrote the MODEL line's tooltip to "the previous value was restored" — false for
  // a value nobody touched. `commitCellValue`'s `setFailed` is already per-call-site, so
  // keeping them separate costs one `useState`. (Code review, 2026-08-10.)
  const [modelFailed, setModelFailed] = useState(false);
  const [modeFailed, setModeFailed] = useState(false);

  // Latest persisted values, readable OUTSIDE a state updater. React StrictMode
  // double-invokes updater callbacks, so a `persist()` called inside one fires TWO IPC
  // writes per user action — the exact defect that shipped in M10.9 WP2's
  // `useSettingControl` and was caught at code review, not by tests.
  const modelRef = useRef<string | null>(seedModel);
  const modeRef = useRef<DriveMode | null>(seedDriveMode);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // NO mount-time IPC read for either value, deliberately — both seeds carry them.

  // Focus on entering edit mode, so the control is immediately usable.
  useEffect(() => {
    if (editingModel) inputRef.current?.select();
  }, [editingModel]);
  useEffect(() => {
    if (editingMode) selectRef.current?.focus();
  }, [editingMode]);

  // ── The two commits. Both go through commitCellValue (P4.4) ────────────────
  const commitModel = useCallback(() => {
    setEditingModel(false);
    void commitCellValue<string | null>({
      next: normalizeModelValue(draft),
      persisted: modelRef.current,
      changed: (next, persisted) => modelValueChanged(next ?? "", persisted),
      persist: (value) => setProjectDefaultModel(projectPath, value),
      apply: (value) => {
        setModel(value);
        setDraft(displayModelValue(value));
      },
      setRef: (value) => {
        modelRef.current = value;
      },
      setFailed: setModelFailed,
      notifyCommitted: (value) => onCommitted?.(projectPath, value),
      what: "model override",
    });
  }, [draft, projectPath, onCommitted]);

  const commitMode = useCallback(
    (next: DriveMode | null) => {
      setEditingMode(false);
      void commitCellValue<DriveMode | null>({
        next,
        persisted: modeRef.current,
        changed: driveModeChanged,
        persist: (value) => setProjectDefaultDriveMode(projectPath, value),
        apply: setMode,
        setRef: (value) => {
          modeRef.current = value;
        },
        setFailed: setModeFailed,
        notifyCommitted: (value) => onDriveModeCommitted?.(projectPath, value),
        what: "drive mode",
      });
    },
    [projectPath, onDriveModeCommitted],
  );

  const cancelModel = useCallback(() => {
    setDraft(displayModelValue(modelRef.current));
    setEditingModel(false);
  }, []);

  // Each line reports only ITS OWN write failure — see the two flags above.
  const modelTitle = modelFailed
    ? "Could not save the model — the previous value was restored."
    : `Claude Code model for ${projectLabel}. Blank = inherit CC's own default. Applied when this project's session starts.`;
  const modeTitle = modeFailed
    ? "Could not save the drive mode — the previous value was restored."
    : `Workflow drive mode for ${projectLabel}. None = the workflow skills ask, as usual. Applied when this project's session starts.`;

  // The RENDERED TEXT comes from the pure module, never re-derived here (the whole reason
  // `cellLines` exists — a proven pure module behind a caller that ignores it is this
  // milestone's most-repeated defect).
  const lines = cellLines(model, mode, gateEnabled, MODEL_UNSET_LABEL);
  const modelLine = lines.find((l) => l.kind === "model");
  const modeLine = lines.find((l) => l.kind === "driveMode");

  return (
    <div
      className={`picker-recent-model${editingModel ? " is-editing" : ""}`}
      data-testid="picker-recent-model"
      // A click anywhere in the cell must never reach the row's open-project button.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {editingModel ? (
        <input
          ref={inputRef}
          className="picker-recent-model-input"
          data-testid="picker-recent-model-input"
          type="text"
          list={HINTS_ID}
          value={draft}
          placeholder={MODEL_UNSET_PLACEHOLDER}
          aria-label={`Claude Code model for ${projectLabel}`}
          title={modelTitle}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitModel}
          onKeyDown={(e) => {
            // Keep Enter/Escape/typing away from the picker's filter + row handlers.
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitModel();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelModel();
            }
          }}
        />
      ) : (
        modelLine && (
          <CellValueLine
            testId="picker-recent-model-line"
            className={`picker-recent-cell-line${model ? " is-set" : ""}${modelFailed ? " is-failed" : ""}`}
            label={`Claude Code model for ${projectLabel}: ${model ?? "default"}. Click to change.`}
            title={modelTitle}
            text={modelLine.text}
            onActivate={() => setEditingModel(true)}
          />
        )
      )}

      {/* ⚠️ GATED: with the workflow gate OFF this line does not exist in the DOM at all —
          not hidden, not disabled, not an empty reserved row (operator decision 2026-08-10,
          and the `useWorkflowFeaturesEnabled` seam contract). `cellLines` already omits it
          from `lines`, so the gate decision lives in ONE place and this render simply
          follows the data. */}
      {modeLine &&
        (editingMode ? (
          <select
            ref={selectRef}
            className="picker-recent-mode-select"
            data-testid="picker-recent-mode-select"
            value={mode ?? ""}
            aria-label={`Workflow drive mode for ${projectLabel}`}
            title={modeTitle}
            onChange={(e) =>
              commitMode(
                e.target.value === "" ? null : (e.target.value as DriveMode),
              )
            }
            onBlur={() => setEditingMode(false)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                setEditingMode(false);
              }
            }}
          >
            <option value="">{DRIVE_MODE_UNSET_PLACEHOLDER}</option>
            {DRIVE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <CellValueLine
            testId="picker-recent-mode-line"
            className={`picker-recent-cell-line${mode ? " is-set" : ""}${modeFailed ? " is-failed" : ""}`}
            label={`Workflow drive mode for ${projectLabel}: ${mode ?? "none"}. Click to change.`}
            title={modeTitle}
            text={modeLine.text}
            onActivate={() => setEditingMode(true)}
          />
        ))}
    </div>
  );
}

/**
 * One resting line of the cell, with its OWN hit region.
 *
 * ⚠️ This exists because two edit targets share one column. Every defence here is copied
 * from WP3's `⊘` no-fire door, which solved the identical problem inside the open button:
 *  - `stopPropagation` on **both** pointerdown and click — click alone is not enough; an
 *    ancestor listening on pointerdown would still fire.
 *  - an explicit **Enter/Space mirror** — a `<span role="button">` has no implicit keyboard
 *    activation, so without this the control is mouse-only.
 *  - `tabIndex={0}` so it is reachable at all.
 *
 * ⚠️ It is a `<span role="button">`, NOT a `<button>`: a `<button>` nested in the cell would
 * be fine, but the row-level rule this repo pins (`pickerRowOrder.ts`) is about button-in-
 * button ambiguity, and keeping both lines the same element type means the two hit regions
 * are symmetrical by construction rather than by review.
 */
function CellValueLine({
  testId,
  className,
  label,
  title,
  text,
  onActivate,
}: {
  testId: string;
  className: string;
  label: string;
  title: string;
  text: string;
  onActivate: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      data-testid={testId}
      aria-label={label}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }
      }}
    >
      {text}
    </span>
  );
}

/**
 * The shared `<datalist>` of alias hints, rendered ONCE per picker rather than per row.
 *
 * ⚠️ Hints, never a validation allowlist — the model value set is open (`claude --help`: an
 * alias or a full model ID), and CC itself reports an unusable model precisely. See
 * `cc/modelOverride.ts`'s header. (The drive mode's `<select>` is the opposite case and IS an
 * allowlist — see `cc/driveMode.ts`.)
 */
export function ProjectModelHints() {
  return (
    <datalist id={HINTS_ID}>
      {MODEL_ALIAS_HINTS.map((alias) => (
        <option key={alias} value={alias} />
      ))}
    </datalist>
  );
}
