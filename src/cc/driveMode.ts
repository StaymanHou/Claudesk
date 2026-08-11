// M12 WP4c — per-project workflow drive mode (the pure core).
//
// A project may pin the drive mode its CC session runs under; unset means Claudesk says
// nothing and the workflow skills ask as they always have. This module is the pure (no
// React / no Tauri IPC) core — the vocabulary and the display rules — so both are
// vitest-pinnable without a running app. The wire call lives in `driveModeIpc.ts`, which
// re-exports the vocabulary for callers already importing from it.
//
// Same split as `modelOverride.ts` / `modelOverrideIpc.ts`, and the split direction is
// load-bearing: the PURE module owns the values, the IPC module owns `invoke`. (Phase 2
// briefly put the vocabulary in the IPC module, which would have forced this pure module to
// import from an `invoke`-carrying one — inverting the contract. Corrected in Phase 3.)
//
// ## ⚠️ The one rule that does NOT carry over from `modelOverride.ts`
//
// Its header says, emphatically, "this module does NOT validate … do NOT add a validator."
// **That rule is about the model override and must not be generalized to here.** The two
// look like siblings and are opposites on exactly this axis:
//
//   | | model override | drive mode |
//   |---|---|---|
//   | value set | OPEN (`claude --help`) | CLOSED (4 modes) |
//   | a bad value is caught by | CC itself, in the pane | serde, on read |
//   | blast radius of a bad value | that row's argv | the WHOLE project list fails to load |
//
// So `DriveMode` is a union, not `string`, and the Rust command takes `Option<DriveMode>`.
// Rejecting an unknown value here is correct; rejecting an unknown *model* would not be.

/**
 * The four workflow drive modes, as the **exact wire strings** Rust's `DriveMode` enum
 * serializes to — which are in turn the vocabulary the workflow skills themselves read.
 *
 * ⚠️ `fsd` and `stepping` are the load-bearing spellings. The Rust variants are named
 * `FullAutopilot` and `StepByStep`, so the obvious guesses (`full-autopilot`,
 * `step-by-step`) are **wrong** and would fail to parse on the way back in — taking the
 * whole project list with them. Rust pins these literals in
 * `tests::drive_mode_serializes_to_these_literal_strings`; `__tests__/driveModeIpc.test.ts`
 * pins the frontend half against the Rust source.
 */
export type DriveMode = "stepping" | "orchestrated" | "autopilot" | "fsd";

/**
 * Every valid mode, ordered from most supervision to least.
 *
 * Exported for the picker cell's `<select>`, so the option list cannot drift from the type
 * above. ⚠️ Unlike `MODEL_ALIAS_HINTS` — which is explicitly "hints, never a validation
 * allowlist" — this IS an allowlist, and that framing is correct here (see the header).
 */
export const DRIVE_MODES: readonly DriveMode[] = [
  "stepping",
  "orchestrated",
  "autopilot",
  "fsd",
];

/**
 * Label shown in the EDIT control's "no override" option.
 *
 * The mode line's counterpart to {@link MODEL_UNSET_PLACEHOLDER}: explicit about what
 * "unset" means, because the editor has room to be.
 */
export const DRIVE_MODE_UNSET_PLACEHOLDER = "None (skills will ask)";

/**
 * Compact label shown on the picker ROW when a project has no drive mode set.
 *
 * **Derived from the placeholder rather than written out again**, exactly as
 * `MODEL_UNSET_LABEL` is derived from `MODEL_UNSET_PLACEHOLDER` — that indirection exists
 * because those two were independent hardcoded strings until code review caught it, and
 * duplicating the mistake here would be a strange thing to do deliberately.
 */
export const DRIVE_MODE_UNSET_LABEL =
  DRIVE_MODE_UNSET_PLACEHOLDER.split(" (")[0];

/**
 * The prefixes that disambiguate the two stacked lines when a value is UNSET.
 *
 * ⚠️ **Label only when unset** (WBS Verdict (f), operator refinement). Two bare stacked
 * values read as `Default` over `None` with nothing saying which line is which — a problem
 * the single-value cell never had. Once a value IS set, the bare value is self-describing
 * (`opus` / `autopilot`) and a prefix is noise.
 *
 * ⚠️ These live in ONE place rather than being inlined at two render sites — same reason
 * the two `*_UNSET_LABEL` constants are derived rather than duplicated.
 *
 * ⚠️ The fully-labelled form was **measured not to fit** at the old `7.5em` column
 * (`Drive Mode: orchestrated` ≈ 146px into a 79px box). Phase 1 widened the column to
 * `9.8em` so the two UNSET labels fit at full size — measured live, `Drive Mode: None` is
 * ~105px of ink in a **122.3px** content box (the cell is `content-box`, so the declared
 * width IS the content area), i.e. **~17px of headroom**. If either prefix grows, re-measure;
 * the width and these strings are coupled and `pickerModelColumnWidth.test.ts` guards the
 * pairing. ⚠️ A 2.4px figure appears in earlier notes — that subtracted padding from a box
 * that never included it. See `App.css`'s `.picker-recent-model` comment.
 */
export const MODEL_LINE_PREFIX = "Model: ";
export const DRIVE_MODE_LINE_PREFIX = "Drive Mode: ";

/** One rendered line of the stacked cell. */
export interface CellLine {
  /** Which value this line edits — the two lines have independent hit regions. */
  readonly kind: "model" | "driveMode";
  /** The text to render. */
  readonly text: string;
  /** True when showing the unset placeholder rather than a real value. */
  readonly isUnset: boolean;
}

/**
 * The lines the picker's model/drive-mode cell should render.
 *
 * This is the single source of truth for BOTH the resting-label rule and the gate collapse,
 * as a **value** rather than a nest of JSX conditionals — so the whole table below is one
 * assertion in a test rather than four render paths a reader has to simulate.
 *
 * | state | line 1 | line 2 |
 * |---|---|---|
 * | gate OFF | `Default` / `opus` | *(absent)* |
 * | neither set | `Model: Default` | `Drive Mode: None` |
 * | both set | `opus` | `autopilot` |
 * | mixed | `opus` | `Drive Mode: None` |
 *
 * ⚠️ **Gate OFF returns ONE line and it carries NO prefix** — the cell must be
 * byte-identical to the pre-M12 build for a user who never enabled workflow features
 * (operator decision, 2026-08-10). Not a reserved empty second line, not a disabled mode
 * line: absent, per the `useWorkflowFeaturesEnabled` seam contract ("a gated surface must
 * not exist when the gate is off"). The prefix drops out too, because with one value there
 * is nothing to disambiguate — which is precisely the context `MODEL_UNSET_LABEL`'s original
 * brevity rationale was written for.
 *
 * @param model the persisted model override, or `null` when unset
 * @param mode the persisted drive mode, or `null` when unset
 * @param gateEnabled `workflow_features_enabled` — when false, the mode line does not exist
 * @param modelUnsetLabel the model's unset label, injected so this module does not import
 *   `modelOverride.ts` merely to read one constant (keeps the two features decoupled; the
 *   caller already imports both)
 */
export function cellLines(
  model: string | null,
  mode: DriveMode | null,
  gateEnabled: boolean,
  modelUnsetLabel: string,
): readonly CellLine[] {
  const modelUnset = model === null;

  if (!gateEnabled) {
    // Single-line, unprefixed — exactly what the cell rendered before M12.
    return [
      {
        kind: "model",
        text: modelUnset ? modelUnsetLabel : model,
        isUnset: modelUnset,
      },
    ];
  }

  const modeUnset = mode === null;
  return [
    {
      kind: "model",
      text: modelUnset ? `${MODEL_LINE_PREFIX}${modelUnsetLabel}` : model,
      isUnset: modelUnset,
    },
    {
      kind: "driveMode",
      text: modeUnset
        ? `${DRIVE_MODE_LINE_PREFIX}${DRIVE_MODE_UNSET_LABEL}`
        : mode,
      isUnset: modeUnset,
    },
  ];
}

/**
 * Whether committing `next` would actually change the persisted mode.
 *
 * Suppresses a redundant IPC write when the operator opens the editor and picks the value
 * already stored — a whole-file read-modify-write of `projects.json` for no change
 * (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`). Mirrors
 * `modelValueChanged`.
 */
export function driveModeChanged(
  next: DriveMode | null,
  persisted: DriveMode | null,
): boolean {
  return next !== persisted;
}
