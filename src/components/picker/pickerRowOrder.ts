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
  /**
   * The project name + path; clicking it opens the project AND fires the announced
   * auto-resume command (M12 WP3 — operator's spec: the title box auto-fires by default).
   *
   * ⚠️ This cell CONTAINS two M12 WP3 elements, which is not a violation of the nesting
   * rule above — read that rule precisely: it forbids a nested `<button>`, because a
   * button-in-button cannot disambiguate the click. It does NOT forbid content inside the
   * box. So:
   *   • the announcement is a plain `<span>` — no click target of its own, no conflict;
   *   • the no-fire control is a `<span role="button">` with `stopPropagation`, the exact
   *     discipline `TileActionButton.tsx` uses for the same problem in the filmstrip (its
   *     header cites this file's rule, so that pattern was written knowing about it).
   */
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
 * ⚠️ **This function is TAUTOLOGICAL and cannot prove the nesting rule.** It returns
 * `cell !== "open"`, i.e. it restates the *declared* order; it never looks at the rendered
 * JSX. Read it as documentation that names the property, not as evidence the property holds.
 *
 * That limitation was noted explicitly when M12 WP3 added the `⏵` cell (the affordance most
 * at risk from the nesting trap), because the plan had cited this function as the assertion
 * protecting it — which would have been a green test standing in for a check nobody ran.
 *
 * **What actually protects the rule**, in descending order of strength:
 *  1. `PICKER_ROW_CELLS.map(...)` in the component — the cells are emitted from this array as
 *     a flat sequence, so nesting one inside `"open"` requires *deleting* the map, which the
 *     `?raw` guard in `projectModelCell.test.ts` catches.
 *  2. {@link cellsAreFlatSiblings} below, which asserts the structural property of the
 *     declared list rather than of one member.
 *  3. The operator clicking it at verify-human — the nesting defect presents as *"the control
 *     does nothing"*, which is invisible to every automated check this repo has.
 */
export function isSiblingOfOpenButton(cell: PickerRowCell): boolean {
  return cell !== "open";
}

/**
 * Whether the declared row is a FLAT sequence containing exactly one open cell.
 *
 * Stronger than {@link isSiblingOfOpenButton} because it is a property of the whole list
 * rather than a restatement of one member's name: it fails if `"open"` were duplicated, or
 * absent, or if the array were reshaped into something nested (e.g. entries carrying their
 * own children). It still cannot see the JSX — nothing in a pure module can — but it is the
 * strongest statement available at this level, and it is what the `⏵` cell's test asserts.
 */
export function cellsAreFlatSiblings(): boolean {
  const openCount = PICKER_ROW_CELLS.filter((c) => c === "open").length;
  const allStrings = PICKER_ROW_CELLS.every((c) => typeof c === "string");
  return openCount === 1 && allStrings;
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
