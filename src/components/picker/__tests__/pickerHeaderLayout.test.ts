import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// M10.9 WP3 (operator correction, 2026-07-29) — the picker header's action buttons must read
// as ONE cluster, not two controls drifting apart.
//
// ## The bug this pins
// `.picker-header` was `display: flex` + `justify-content: space-between` with THREE children
// (<h1>, Analytics, Settings). `space-between` distributes free space BETWEEN each adjacent
// pair — correct for two children, wrong for three: the wider the window, the further Analytics
// and Settings separated from each other. At the operator's window width the gap was ~68px, and
// it grew without bound.
//
// The fix: drop `space-between`, give the <h1> `margin-right: auto` so it absorbs ALL the slack,
// and set the row gap to 8px to match `.filmstrip`'s action-button gap (the surface the operator
// pointed at as the reference).
//
// ## Why a CSS source-text guard rather than a computed-layout test
// The defect is purely declarative — there is no pure function to extract and no runtime
// behavior to assert. The live proof was done at verify-self via the MCP bridge (gap measured
// at 8px across window widths 475→1600px, confirming it no longer scales with width); this test
// is the standing guard that the three declarations survive a future edit.
//
// Read via `node:fs` rather than `?raw` — per memory `[[vitest-raw-import-css-returns-processed-
// not-text]]`, a `?raw` import of a .css file is intercepted by Vite's CSS plugin and does NOT
// yield the raw source text. Each assertion below matches a SINGLE declaration, never a
// formatted multi-line block (the shape that silently stopped matching after a Prettier reflow
// twice in WP2).

const css = readFileSync(
  fileURLToPath(new URL("../../../App.css", import.meta.url)),
  "utf8",
);

/** The `.picker-header { … }` rule body, isolated so sibling rules can't satisfy an assertion. */
function pickerHeaderRule(): string {
  const start = css.indexOf(".picker-header {");
  expect(start).toBeGreaterThan(-1); // the rule must exist at all
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

/** The `.picker-header h1 { … }` rule body. */
function pickerHeaderH1Rule(): string {
  const start = css.indexOf(".picker-header h1 {");
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

describe("picker header keeps its action buttons clustered", () => {
  it("does NOT use justify-content: space-between (the 3-child trap)", () => {
    // The single most important assertion here: re-adding `space-between` silently restores
    // the drift, and it is the "obvious" declaration someone reaches for when centering a
    // header row.
    expect(pickerHeaderRule()).not.toContain("space-between");
  });

  it("gives the title margin-right: auto so it absorbs the row's slack", () => {
    // This is what replaces `space-between`: the <h1> eats the free space, so the two buttons
    // stay adjacent at the row's right edge regardless of window width.
    expect(pickerHeaderH1Rule()).toContain("margin-right: auto");
  });

  it("uses the same 8px gap as the filmstrip's action buttons", () => {
    // The operator's reference surface. `.filmstrip` uses `gap: 8px` for its "+"/analytics
    // cluster; the picker header now matches it, so the two surfaces read consistently.
    expect(pickerHeaderRule()).toContain("gap: 8px");
  });

  it("keeps .filmstrip's gap at 8px — the value this header is matched TO", () => {
    // Guards the reference itself: if the filmstrip's gap changes, this header silently stops
    // matching the surface it was deliberately aligned with. Failing here is a prompt to
    // decide consciously, not necessarily a bug.
    const start = css.indexOf(".filmstrip {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("gap: 8px");
  });
});
