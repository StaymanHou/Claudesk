import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PICKER_ROW_CELLS,
  isSiblingOfOpenButton,
  modelCellPosition,
} from "../pickerRowOrder";

// Guards for M11.5 WP1's picker-row model cell.
//
// ## Why the structure is asserted as a VALUE, not as source text
// The load-bearing rule is a nesting one: the row's open-project area is a `<button>`, so
// the model cell must be its SIBLING — nested, every click meant for the model would open
// the project instead.
//
// A source-text guard for exactly this was written first and **provably did not work**: it
// compared the position of `<ProjectModelCell` against "the first `</button>` in the file",
// which is a different button in the picker header. A deliberately nested cell passed it
// 5/5. That is the positional-slicing failure this repo has now hit three times
// (`SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`,
// `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`).
//
// So the row's cell sequence lives in `pickerRowOrder.ts` as data that the component maps
// over — the component cannot disagree with it — and these tests assert that value. The
// only remaining source-text checks below are for *removals* (a class or identifier that
// must be absent), where a substring check is the honest tool and cannot silently pass on
// a wrong-but-present structure.

describe("picker row cell order — the model cell is a flat sibling", () => {
  it("emits exactly three cells, open → model → remove", () => {
    expect([...PICKER_ROW_CELLS]).toEqual(["open", "model", "remove"]);
  });

  it("declares the model cell a sibling of the open-project button", () => {
    // The property that matters: not nested inside "open".
    expect(isSiblingOfOpenButton("model")).toBe(true);
    expect(isSiblingOfOpenButton("remove")).toBe(true);
    expect(isSiblingOfOpenButton("open")).toBe(false);
  });

  it("places the model cell after the project name and before the remove button", () => {
    const pos = modelCellPosition();
    expect(pos.index).toBe(1);
    expect(pos.afterOpen).toBe(true);
    expect(pos.beforeRemove).toBe(true);
  });

  it("is the single source of the row's structure — the component maps over it", () => {
    // If the component stopped consuming PICKER_ROW_CELLS, the value above would become
    // decorative and these assertions would guard nothing. That is the exact
    // "guard-that-guards-nothing" failure mode; pin the consumption.
    const picker = readFileSync(
      join(process.cwd(), "src", "components/picker/ProjectPicker.tsx"),
      "utf8",
    );
    expect(picker).toContain("PICKER_ROW_CELLS.map");
  });
});

describe("ProjectModelCell — click isolation", () => {
  it("stops click propagation so a model click never opens the project", () => {
    const cellSrc = readFileSync(
      join(process.cwd(), "src", "components/picker/ProjectModelCell.tsx"),
      "utf8",
    );
    expect(cellSrc).toContain("stopPropagation");
  });

  it("renders the alias datalist once for the picker, not once per row", () => {
    const picker = readFileSync(
      join(process.cwd(), "src", "components/picker/ProjectPicker.tsx"),
      "utf8",
    );
    const hints = picker.match(/<ProjectModelHints\s*\/>/g) ?? [];
    expect(hints).toHaveLength(1);
  });
});

describe("the workspace header no longer carries the model control", () => {
  // The operator moved this control out of the workspace header at Phase 2 verify-human
  // (2026-07-31). Guard the removal so it is not reintroduced there by reflex: two surfaces
  // for one per-project value would need a sync path (there is deliberately no broadcast
  // event) and could disagree. These are absence checks, where a substring test is sound.
  it("Workspace.tsx does not reference the model override", () => {
    const ws = readFileSync(
      join(process.cwd(), "src", "components/workspace/Workspace.tsx"),
      "utf8",
    );
    expect(ws).not.toContain("modelOverride");
    expect(ws).not.toContain("useModelOverride");
    expect(ws).not.toContain("workspace-model-control");
  });

  it("codifies the chrome-less label — the defect found live at verify-human", () => {
    // WHY THIS TEST EXISTS: at Phase 2 verify-human the cell shipped visibly wrong and
    // NO gate caught it — tsc, eslint, and 1426 tests were all green while the picker row
    // rendered as three boxed tiles instead of the single row the operator asked for.
    //
    // The cause is a real, textual coupling: `App.css` has a global `input, button` rule
    // (border-radius: 8px; border: 1px solid transparent; background-color: #2a2a2a), and
    // this cell MUST be a <button> to be clickable — so it inherits that chrome unless the
    // rule below explicitly overrides all three. Dropping any one override reintroduces the
    // exact defect, which is why this is worth pinning rather than trusting to review.
    //
    // This asserts the DECLARATIONS EXIST in the rule, not a rendered pixel — computed
    // style needs a browser. It is honest about that boundary: the live check
    // (getComputedStyle on the real element → transparent background, 0px radius) is what
    // proved the fix, and it is recorded in the WIP.
    const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
    const start = css.indexOf(".picker-recent-model {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));

    // The global button rule this must defeat (kept as an assertion so that if the global
    // chrome is ever removed, this test's premise is re-examined rather than silently kept).
    expect(css).toMatch(/input,\s*\nbutton \{/);

    for (const override of ["background:", "border:", "border-radius:"]) {
      expect(rule).toContain(override);
    }
    // …and specifically to the chrome-less values, not merely "some value".
    expect(rule).toMatch(/background:\s*none/);
    expect(rule).toMatch(/border:\s*none/);
    expect(rule).toMatch(/border-radius:\s*0/);
  });

  it("retires the header CSS class and defines the row classes it replaced", () => {
    // Read via node:fs, NOT a `?raw` import — Vite's CSS plugin intercepts `?raw` for .css
    // and returns processed output rather than source text
    // ([[vitest-raw-import-css-returns-processed-not-text]]).
    const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
    expect(css).not.toContain("workspace-model-control");
    // …and the replacements ARE defined: a class referenced with zero definitions was a
    // CRITICAL review finding in M10.9 WP3.5a (eleven of them).
    expect(css).toContain(".picker-recent-model");
    expect(css).toContain(".picker-recent-model-input");
  });
});
