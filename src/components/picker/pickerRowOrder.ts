// M11.5 WP1 — the picker row's cell order, as data.
//
// ## Why this module exists (it is not ceremony)
// The row's load-bearing structural rule is a NESTING one: the open-project area is a
// `<button>`, so the model cell must be its SIBLING. Nested, every click meant for the
// model would open the project instead — a silent, 100%-reproducible defect that presents
// as "the control does nothing."
//
// A source-text guard for that rule was written first and **provably did not work**: it
// located "the first `</button>` in the file", which is a different button in the picker
// header, so a deliberately nested cell passed the check 5/5. That is the positional
// `?raw`-slicing failure this repo has now been bitten by three times
// (`SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`,
// `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`).
//
// So the order is declared here as a value the component MAPS OVER. The component cannot
// disagree with it — it is the single source of the row's cell sequence — and the test
// asserts the value, not a substring. That is the standing lesson: extract the decision,
// assert the value.

/** The cells of one picker row, in left-to-right order. */
export const PICKER_ROW_CELLS = [
  /** The project name + path; clicking it opens the project. Flexes to fill. */
  "open",
  /** M11.5 WP1 — the per-project CC model override. Right-aligned, fixed width. */
  "model",
  /** The per-row × that removes the project from recents. */
  "remove",
] as const;

export type PickerRowCell = (typeof PICKER_ROW_CELLS)[number];

/**
 * Whether `cell` is a sibling of the row's open-project button rather than nested inside it.
 *
 * Every cell in {@link PICKER_ROW_CELLS} other than `"open"` itself is a sibling by
 * construction — the row renders them as a flat sequence. This function exists so the
 * property is *named and asserted* rather than left implicit in JSX indentation.
 */
export function isSiblingOfOpenButton(cell: PickerRowCell): boolean {
  return cell !== "open";
}

/** The model cell must come after the open area and before the remove button. */
export function modelCellPosition(): {
  index: number;
  afterOpen: boolean;
  beforeRemove: boolean;
} {
  const index = PICKER_ROW_CELLS.indexOf("model");
  return {
    index,
    afterOpen: index > PICKER_ROW_CELLS.indexOf("open"),
    beforeRemove: index < PICKER_ROW_CELLS.indexOf("remove"),
  };
}
