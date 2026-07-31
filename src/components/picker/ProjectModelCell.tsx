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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProjectDefaultModel,
  setProjectDefaultModel,
} from "../../cc/modelOverrideIpc";
import {
  MODEL_ALIAS_HINTS,
  MODEL_UNSET_PLACEHOLDER,
  normalizeModelValue,
  modelValueChanged,
} from "../../cc/modelOverride";

interface ProjectModelCellProps {
  projectPath: string;
  /** Human label for this project, used only in the a11y names. */
  projectLabel: string;
}

const HINTS_ID = "picker-model-hints";

export function ProjectModelCell({
  projectPath,
  projectLabel,
}: ProjectModelCellProps) {
  const [value, setValue] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Latest persisted value, readable OUTSIDE a state updater. React StrictMode
  // double-invokes updater callbacks, so a `persist()` called inside one fires TWO IPC
  // writes per user action — the exact defect that shipped in M10.9 WP2's
  // `useSettingControl` and was caught at code review, not by tests.
  const valueRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getProjectDefaultModel(projectPath)
      .then((v) => {
        if (cancelled) return;
        valueRef.current = v;
        setValue(v);
        setDraft(v ?? "");
      })
      .catch((e) => {
        // A failed READ is logged, not surfaced: it is not a user action, and the honest
        // fallback (no override → inherit CC's default) is already the initial state.
        console.error("[claudesk] model override read failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

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
      setDraft(prev ?? "");
      return;
    }
    const next = normalizeModelValue(draft);
    valueRef.current = next;
    setValue(next);
    setDraft(next ?? "");
    setFailed(false);
    void setProjectDefaultModel(projectPath, next).catch((err: unknown) => {
      valueRef.current = prev;
      setValue(prev);
      setDraft(prev ?? "");
      setFailed(true);
      console.error("[claudesk] model override write failed:", err);
    });
  }, [draft, projectPath]);

  const cancel = useCallback(() => {
    setDraft(valueRef.current ?? "");
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
      {value ?? "Default"}
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
