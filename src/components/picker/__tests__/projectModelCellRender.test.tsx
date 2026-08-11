// @vitest-environment jsdom
//
// ⚠️ Needed because the component reads browser globals through its hooks. Scoped per-file
// rather than flipping the project default — same reasoning as `docsRender.test.tsx`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ProjectModelCell } from "../ProjectModelCell";

// M12 WP4c Phase 4 — the cell's DOM, pinned as a PARSED VALUE.
//
// ── Why this file exists, and why it is not another source-text guard ───────────────
// `projectModelCellStructure.test.ts` asserts the component's SOURCE (that it calls
// `cellLines`, routes both writes through one writer, carries the keyboard mirror). Those are
// structural and honest, but they cannot see what the browser actually produces.
//
// ⚠️ **This repo's standing note says there is no component-render harness
// (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`) — that is only half true, and
// acting on the half-truth costs real coverage.** M11 WP3 established the missing half:
// `renderToStaticMarkup` ships with the installed `react-dom`, so a component's markup can be
// rendered and PARSED with jsdom without adopting `@testing-library/react`. Verified for THIS
// component before writing these tests: it renders server-side cleanly.
//
// ── ⚠️ What server rendering can and cannot prove here ─────────────────────────────
// CAN: the resting DOM — element types, roles, `tabindex`, testids, the rendered label text,
//      and (the valuable one) that the gated line is ABSENT rather than hidden.
// CANNOT: anything requiring an event or a state transition. `useWorkflowFeaturesEnabled`
//      seeds asynchronously from IPC and returns its restrictive pre-seed default (`false`)
//      in this environment, so **only the gate-OFF shape is reachable here**. The gate-ON
//      two-line shape, the click disambiguation, and the hit-testing were verified LIVE via
//      the MCP bridge (recorded in the WIP) — that is the real evidence and this does not
//      replace it.
//
// The gate-OFF shape being the reachable one is a happy accident worth exploiting: it is the
// single most important property of the whole feature (a non-workflow user must see a cell
// byte-identical to the pre-M12 build), and it was otherwise pinned only by a pure-function
// test plus a live run.

function renderCell(
  props: {
    seedModel?: string | null;
    seedDriveMode?: null;
  } = {},
) {
  const html = renderToStaticMarkup(
    <ProjectModelCell
      projectPath="/tmp/proj"
      projectLabel="proj"
      seedModel={props.seedModel ?? null}
      seedDriveMode={props.seedDriveMode ?? null}
    />,
  );
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe("the cell's resting DOM with the workflow gate OFF", () => {
  // `useWorkflowFeaturesEnabled` returns its pre-seed default (false) in this environment, so
  // every test below is the OFF shape. That default is itself deliberate: defaulting true
  // would flash a gated surface on during startup for every user.

  it("renders exactly ONE line — the mode line does not exist", () => {
    const doc = renderCell();
    // The seam contract, as a parsed DOM value rather than a source-text search: "a gated
    // surface must not exist when the gate is off" — not hidden, not disabled, not an empty
    // reserved row.
    expect(doc.querySelectorAll(".picker-recent-cell-line")).toHaveLength(1);
    expect(
      doc.querySelector('[data-testid="picker-recent-mode-line"]'),
    ).toBeNull();
    expect(
      doc.querySelector('[data-testid="picker-recent-mode-select"]'),
    ).toBeNull();
  });

  it("emits NO drive-mode vocabulary anywhere in the markup", () => {
    // Stronger than checking for the element: not even the words may leak, since a
    // stale-but-present string would tell a non-workflow user the feature exists.
    const doc = renderCell();
    const text = doc.body.textContent ?? "";
    for (const word of [
      "Drive Mode",
      "stepping",
      "orchestrated",
      "autopilot",
      "fsd",
    ]) {
      expect(text, `"${word}" must not appear with the gate off`).not.toContain(
        word,
      );
    }
    // …and not in attributes either (aria-label / title are user-visible too).
    expect(doc.body.innerHTML).not.toContain("Drive Mode");
  });

  it("shows the model label UNPREFIXED, exactly as the pre-M12 cell did", () => {
    // With one value there is nothing to disambiguate, so the `Model: ` prefix must drop out.
    // This is the byte-identical-to-before property, asserted on real markup.
    const doc = renderCell({ seedModel: null });
    const line = doc.querySelector('[data-testid="picker-recent-model-line"]');
    expect(line?.textContent).toBe("Default");
    expect(line?.textContent).not.toContain("Model:");
  });

  it("shows a set model bare, with the is-set class", () => {
    const doc = renderCell({ seedModel: "opus" });
    const line = doc.querySelector('[data-testid="picker-recent-model-line"]');
    expect(line?.textContent).toBe("opus");
    expect(line?.className).toContain("is-set");
  });

  it("gives the line its own hit region: role, tabindex, and an accessible name", () => {
    // The three properties that make a <span> a usable control. A `<span>` without them is
    // the mouse-only, screen-reader-invisible failure the WP3 `⊘` precedent exists to avoid.
    const doc = renderCell();
    const line = doc.querySelector('[data-testid="picker-recent-model-line"]');
    expect(line?.getAttribute("role")).toBe("button");
    expect(line?.getAttribute("tabindex")).toBe("0");
    expect(line?.getAttribute("aria-label")).toMatch(
      /Claude Code model for proj/,
    );
    expect(line?.getAttribute("title")).toBeTruthy();
  });

  it("keeps the cell a DIV, so it can never be a button inside the row's button", () => {
    // `pickerRowOrder.ts` pins that the cell is a SIBLING of the open-project <button>; this
    // pins the complementary half — the cell itself is not a <button>, so even if the nesting
    // rule were ever violated there would be no button-in-button ambiguity.
    const doc = renderCell();
    const cell = doc.querySelector('[data-testid="picker-recent-model"]');
    expect(cell?.tagName).toBe("DIV");
    expect(doc.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("every CSS class this cell's stylesheet styles is actually emitted", () => {
  // ⚠️ This guard exists because its absence let a LIVE LAYOUT REGRESSION ship for one commit.
  //
  // Converting the cell from a `<button>` to a `<div>` of per-line spans moved three style
  // hooks (`is-set`, `:hover`, `is-failed`) onto the line and **silently orphaned
  // `.picker-recent-model.is-editing`** — the rule that zeroes the cell's padding while the
  // model input is open. The component simply stopped emitting the class, so the input began
  // rendering inside `padding: 0 0.6em`, eating ~15px of the very content box this WP had just
  // widened by 29px to buy.
  //
  // **Nothing caught it**, and the reason is structural rather than an oversight: every guard
  // in this repo reads ONE side of the CSS/component contract. `pickerModelColumnWidth.test.ts`
  // reads the `.picker-recent-model` rule body and never asks which classes the component
  // emits; the structure guards read the component and never ask which classes the stylesheet
  // styles. A class can therefore be styled-but-never-emitted (dead CSS carrying real
  // behavior) or emitted-but-never-styled (the eleven-undefined-classes CRITICAL of M10.9
  // WP3.5a) with both sides individually green.
  //
  // This closes the styled-but-never-emitted direction for this cell. The inverse direction is
  // covered by verify-auto's className→CSS sweep.
  // (`SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`)

  /** Modifier classes the stylesheet defines on the cell or its lines. */
  function styledModifiers(): string[] {
    const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
    const out = new Set<string>();
    for (const m of css.matchAll(
      /\.(picker-recent-model|picker-recent-cell-line)\.([a-z-]+)/g,
    )) {
      out.add(m[2]);
    }
    return [...out];
  }

  it("emits every modifier class the stylesheet defines, across all cell states", () => {
    // Render every state the OFF-gate shape can reach and collect the classes actually used.
    // ⚠️ `is-editing` is reachable only mid-edit, which server rendering cannot drive — so it
    // is asserted against the SOURCE below rather than skipped, which is what a green here
    // would otherwise quietly mean.
    const emitted = new Set<string>();
    for (const seedModel of [null, "opus"]) {
      const doc = renderCell({ seedModel });
      for (const el of doc.querySelectorAll("[class]")) {
        for (const c of el.className.split(/\s+/))
          if (c.startsWith("is-")) emitted.add(c);
      }
    }
    const src = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "picker",
        "ProjectModelCell.tsx",
      ),
      "utf8",
    );

    for (const mod of styledModifiers()) {
      const isEmitted = emitted.has(mod) || src.includes(`" ${mod}"`);
      expect(
        isEmitted,
        `App.css styles ".${mod}" on the picker cell, but ProjectModelCell.tsx never emits it. ` +
          `Either the component stopped applying it (a dead rule that may be carrying real ` +
          `behavior — this is exactly how the is-editing padding reset was lost) or the rule ` +
          `is stale and should be deleted. Do not "fix" this by deleting the assertion.`,
      ).toBe(true);
    }
  });

  it("emits is-editing, the class whose loss was the regression", () => {
    // Named separately from the sweep above so the failure message points straight at the
    // specific defect rather than at a generic modifier mismatch.
    const src = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "picker",
        "ProjectModelCell.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/editingModel \? " is-editing" : ""/);
  });
});
