import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_UNSET_LABEL } from "../../../cc/modelOverride";

// M12 WP4c Phase 1 — guards for the picker model/drive-mode column's WIDTH.
//
// ## What this file exists to stop
// `.picker-recent-model` is `width: 9.8em`, and that number is not arbitrary: the cell
// carries TWO stacked lines whose unset labels are `Model: Default` (84.6px of rendered
// ink) and `Drive Mode: None` (105px). At the previous `7.5em` BOTH clipped, rendering as
// `Model: Def…` / `Drive Mod…` — the second losing the word that carries its meaning.
// So the width and the label strings are COUPLED, and the failure mode of breaking that
// coupling is silent: the labels just quietly truncate. Nothing in this repo caught it
// before (the value shipped for months at a width that could not fit its own planned
// labels), which is why it is worth pinning.
//
// ## ⚠️ What these tests CANNOT do, stated up front
// **jsdom has no layout engine.** `getBoundingClientRect()` returns zeros, `getComputedStyle`
// does not resolve `em`, and there is no text shaping — so a REAL px-fit assertion is
// impossible here. That boundary is why the live evidence is the primary record (the WIP's
// "Phase 1 measured results": `getBoundingClientRect` + `Range`-over-text-node ink widths +
// two screenshots, all against the running WKWebView). These tests are the CHEAP regression
// tripwire for that finding, not a substitute for it.
//
// Concretely: they assert the width is declared, is in the unit the measurement assumed,
// and has not been reduced below the measured requirement. They do NOT prove any string
// fits — only the browser can prove that.
//
// ## ⚠️ Two traps deliberately NOT used here
// 1. **`scrollWidth > clientWidth` is unsound for this class of check.** Both properties are
//    integer-rounded, so they are blind to the sub-pixel overflow that actually triggers an
//    ellipsis. Measured live: that check reported "not ellipsised" at EVERY rung of a
//    9.61/9.8/10/10.2em ladder, including one that visibly clipped.
//    (`SURFACE-2026-08-10-SCROLLWIDTH-IS-BLIND-TO-SUBPIXEL-TEXT-CLIPPING`)
// 2. **`?raw` import of a `.css` file does NOT return source text** — Vite's CSS plugin
//    intercepts it and returns processed output. Read via `node:fs`, as the sibling
//    `projectModelCell.test.ts` does for the same reason.
//    (`[[vitest-raw-import-css-returns-processed-not-text]]`)

/** Read the `.picker-recent-model` rule body out of the real stylesheet. */
function modelCellRule(): string {
  const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
  const start = css.indexOf(".picker-recent-model {");
  expect(
    start,
    "the .picker-recent-model rule must exist in App.css",
  ).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

/**
 * The width below which the widest resting label is known to break, in `em` at the cell's
 * own font-size.
 *
 * **Empirical, not derived** — and it is stated that way deliberately, because two successive
 * attempts to *derive* this number were wrong. What is actually known from measuring the
 * running app:
 *   - the widest resting label (`Drive Mode: None`) renders ~**105px** of ink;
 *   - at **9.61em** it visibly ELLIPSISED (`Drive Mode: No…`) — a sub-pixel overage WebKit
 *     resolves by clipping;
 *   - at **9.8em** (the shipped value) it renders in full, with ~**17px** of real headroom.
 *
 * ⚠️ **Do not "correct" this constant by recomputing it from ink + padding.** The cell is
 * `content-box`, so `width` IS the content area and the padding sits outside it — an earlier
 * derivation subtracted the padding anyway and recorded the headroom as 2.4px instead of
 * ~17px. It was wrong in the safe direction, which is exactly why it survived. The box math
 * for this one column has now been wrong three separate ways (root-vs-own `em`, a
 * zero-tolerance exact fit, and border-box-vs-content-box), so the honest form of this
 * constant is *"9.61em is measured to fail; the shipped 9.8em is measured to work."*
 * (`SURFACE-2026-08-10-CSS-BOX-MATH-WAS-WRONG-THREE-TIMES-IN-ONE-COLUMN`)
 *
 * ⚠️ This is a FLOOR, not the shipped value. A future change may widen the column freely;
 * only narrowing toward the known-broken width is the regression. The floor stays at the
 * known-broken figure rather than the shipped one so a deliberate, re-measured tightening
 * is still possible without editing this test.
 */
const MEASURED_MINIMUM_EM = 9.61;

describe("picker model/drive-mode column width — the width/label coupling", () => {
  it("declares the width in em, so it scales with the cell's own font-size", () => {
    const rule = modelCellRule();
    // The unit is load-bearing, not incidental. `em` on a non-`font-size` property resolves
    // against the ELEMENT'S OWN computed font-size (0.78rem = 12.48px here), not the root
    // 16px — the exact trap that made three separate docs record this column as "~101px
    // usable" when the real figure was 78.62px, a ~22px optimistic error that invalidated a
    // shipped product decision about the labels.
    // (`SURFACE-2026-08-10-PICKER-MODEL-COLUMN-WIDTH-MEASURED-AGAINST-THE-WRONG-EM`)
    expect(rule).toMatch(/width:\s*[\d.]+em\s*;/);
  });

  it("keeps the width at or above the width the LIVE measurement required", () => {
    const rule = modelCellRule();
    const match = /width:\s*([\d.]+)em\s*;/.exec(rule);
    expect(match, "width must be declared in em").not.toBeNull();
    const em = Number.parseFloat(match![1]);

    // The regression this catches: someone reclaims path width by shrinking this column
    // (an 8.6% path cost is a real, recurring temptation — WP3 P3.9 already paid a defect
    // on this row's space competition) without re-measuring the two labels that the width
    // exists to fit. The labels would silently truncate.
    expect(
      em,
      `The column is ${em}em but the live measurement requires >= ${MEASURED_MINIMUM_EM}em ` +
        `for "Drive Mode: None" (~105px of ink; 9.61em was MEASURED to ellipsise) to fit. ` +
        `Shrinking this ` +
        `column and the two stacked unset labels are COUPLED: re-measure both together ` +
        `(getBoundingClientRect + a Range over the text node — NOT scrollWidth), or shorten ` +
        `the labels instead. Four measured shorter alternatives are recorded in ` +
        `SURFACE-2026-08-10-VERDICT-F-LABEL-SCHEME-DOES-NOT-FIT-THE-REAL-COLUMN.`,
    ).toBeGreaterThanOrEqual(MEASURED_MINIMUM_EM);
  });

  it("keeps the padding the width budget was computed against", () => {
    // The required width was derived as `label ink + 0.6em x 2`. If the padding grows, the
    // usable box shrinks and the floor above silently stops being sufficient — so the
    // padding is part of the same coupling, not an independent style choice.
    expect(modelCellRule()).toMatch(/padding:\s*0\s+0\.6em\s*;/);
  });

  it("keeps the ellipsis machinery that makes an overflow visible rather than clipped", () => {
    const rule = modelCellRule();
    // If the labels ever DO overflow, they must degrade to an ellipsis (a visible,
    // diagnosable symptom) rather than being hard-clipped mid-glyph. This is also what made
    // the original defect legible in a screenshot at all.
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it("still renders the model line's unset label the row actually shows", () => {
    // Ties this width guard to the string it is sized for. `MODEL_UNSET_LABEL` is derived
    // from `MODEL_UNSET_PLACEHOLDER` (guarded in cc/__tests__/modelOverride.test.ts), so
    // asserting its VALUE here would duplicate that; assert only the property the width
    // depends on — that it is short enough for the measured budget to hold.
    //
    // ⚠️ Honest about the boundary: this is a CHARACTER-COUNT proxy, not a px measurement.
    // `Model: Default` was measured at ~85px of ink in the real font, inside a 122.3px content
    // box — comfortable. A future label long enough to matter would trip this well before it
    // silently clipped. (The px figures are recorded at `.picker-recent-model` in App.css;
    // deliberately not restated as arithmetic here — see MEASURED_MINIMUM_EM's warning.)
    expect(`Model: ${MODEL_UNSET_LABEL}`.length).toBeLessThanOrEqual(20);
  });
});
