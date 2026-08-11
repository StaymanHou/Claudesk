// @vitest-environment jsdom
//
// ⚠️ Needed because the component reads browser globals through its hooks. Scoped per-file
// rather than flipping the project default — same reasoning as `docsRender.test.tsx`.
import { describe, expect, it } from "vitest";
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
