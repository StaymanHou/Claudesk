// M11.5 WP1 — the per-project CC model override, as a picker-row cell.
//
// ## Why it lives HERE and not on the workspace header
// The first build put this control in the workspace header; the operator rejected that at
// verify-human (2026-07-31) and moved it to the picker row, right-aligned. The placement
// is better on its own terms: the model applies **at spawn**, so the picker row is the
// moment of use — you choose the model as part of choosing the project, and the value is
// visible across ALL projects at once instead of one-at-a-time on whichever workspace is
// centre-stage. It is also the surface where the value is actionable rather than
// after-the-fact. See design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`.
//
// ## Why a label that becomes an input, rather than a permanent input
// Operator's call, same review. With 20+ rotating projects, an input box on every row is
// visual noise on the app's most-glanced surface; a compact label keeps the list quiet and
// costs one click to edit. `[[explicit-selectable-mode-over-inferred-mode]]` is still
// honored — the active value is *readable without interaction* on every row, which is the
// part of that prior that governs here; only the *edit affordance* is behind a click.
//
// ## Structural constraint (load-bearing)
// The picker row's open-project area is a `<button>`. This cell MUST be a sibling of it,
// never inside it, or a click intended for the model would open the project. It also stops
// propagation so a click here never reaches the row.

// ## Where the displayed value comes from (M11.5 repair (B))
// The seed arrives as a PROP, from the `recents` array the picker already holds. This cell
// used to fetch it itself on mount via `project_get_default_model` — one IPC read per row,
// each one re-reading + re-parsing + re-sorting the whole `projects.json` to keep a single
// field that `list_projects` had ALREADY returned on the wire. Because filtered-out rows
// unmount, clearing the filter box re-fired all N. So there is deliberately no mount-time
// read here; adding one back would restore the N+1
// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
//
// The write still goes out per-commit (`setProjectDefaultModel`) — that is one IPC per user
// action, not per render, and it stays. `onCommitted` reports the new value up so the
// parent's array stays truthful; without it, a commit followed by a filter round-trip would
// re-seed this cell from a stale snapshot. See `applyCommittedModel.ts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { setProjectDefaultModel } from "../../cc/modelOverrideIpc";
import {
  MODEL_ALIAS_HINTS,
  MODEL_UNSET_LABEL,
  MODEL_UNSET_PLACEHOLDER,
  displayModelValue,
  normalizeModelValue,
  modelValueChanged,
} from "../../cc/modelOverride";

interface ProjectModelCellProps {
  projectPath: string;
  /** Human label for this project, used only in the a11y names. */
  projectLabel: string;
  /**
   * This project's persisted override, from the picker's `recents` array — `null` = no
   * override (inherit CC's own default). Supplied rather than fetched; see the header note.
   */
  seedModel: string | null;
  /**
   * Report a successfully-persisted value so the parent can fold it into `recents`,
   * keeping the seed truthful across an unmount (filter in/out). Success path only — a
   * failed write reverts locally and must NOT be written back.
   */
  onCommitted?: (projectPath: string, model: string | null) => void;
}

const HINTS_ID = "picker-model-hints";

export function ProjectModelCell({
  projectPath,
  projectLabel,
  seedModel,
  onCommitted,
}: ProjectModelCellProps) {
  const [value, setValue] = useState<string | null>(seedModel);
  const [draft, setDraft] = useState(() => displayModelValue(seedModel));
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Latest persisted value, readable OUTSIDE a state updater. React StrictMode
  // double-invokes updater callbacks, so a `persist()` called inside one fires TWO IPC
  // writes per user action — the exact defect that shipped in M10.9 WP2's
  // `useSettingControl` and was caught at code review, not by tests.
  const valueRef = useRef<string | null>(seedModel);
  const inputRef = useRef<HTMLInputElement>(null);

  // NO mount-time IPC read here, deliberately — `seedModel` already carries the value.
  // Re-adding one would restore the per-row N+1 this repair removed.

  // Focus + select on entering edit mode, so typing replaces rather than appends.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const prev = valueRef.current;
    if (!modelValueChanged(draft, prev)) {
      // Normalize the visible text even when not persisting, so a padded no-op edit
      // snaps back to canonical form rather than lingering.
      setDraft(displayModelValue(prev));
      return;
    }
    const next = normalizeModelValue(draft);
    valueRef.current = next;
    setValue(next);
    setDraft(displayModelValue(next));
    setFailed(false);
    void setProjectDefaultModel(projectPath, next)
      .then(() => {
        // Persisted — tell the parent so its `recents` copy (this cell's seed on the next
        // mount) matches disk. Only on success: the catch below reverts to `prev`, and
        // writing back a value that failed to persist would make the array lie.
        onCommitted?.(projectPath, next);
      })
      .catch((err: unknown) => {
        valueRef.current = prev;
        setValue(prev);
        setDraft(displayModelValue(prev));
        setFailed(true);
        console.error("[claudesk] model override write failed:", err);
      });
  }, [draft, projectPath, onCommitted]);

  const cancel = useCallback(() => {
    setDraft(displayModelValue(valueRef.current));
    setEditing(false);
  }, []);

  const title = failed
    ? "Could not save the model override — the previous value was restored."
    : `Claude Code model for ${projectLabel}. Blank = inherit CC's own default. Applied when this project's session starts.`;

  if (editing) {
    return (
      <div
        className="picker-recent-model is-editing"
        // A click inside the editor must never reach the row's open-project button.
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="picker-recent-model-input"
          data-testid="picker-recent-model-input"
          type="text"
          list={HINTS_ID}
          value={draft}
          placeholder={MODEL_UNSET_PLACEHOLDER}
          aria-label={`Claude Code model for ${projectLabel}`}
          title={title}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Keep Enter/Escape/typing away from the picker's own filter + row handlers.
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`picker-recent-model${value ? " is-set" : ""}${failed ? " is-failed" : ""}`}
      data-testid="picker-recent-model"
      aria-label={`Claude Code model for ${projectLabel}: ${value ?? "default"}. Click to change.`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value ?? MODEL_UNSET_LABEL}
    </button>
  );
}

/**
 * The shared `<datalist>` of alias hints, rendered ONCE per picker rather than per row.
 *
 * ⚠️ Hints, never a validation allowlist — the value set is open (`claude --help`: an alias
 * or a full model ID), and CC itself reports an unusable model precisely. See
 * `cc/modelOverride.ts`'s header.
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
