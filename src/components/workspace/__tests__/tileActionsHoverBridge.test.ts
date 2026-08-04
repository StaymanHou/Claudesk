import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// M12 WP2 — REGRESSION GUARD for the hover-bridge defect found by the operator at
// verify-human (2026-08-03).
//
// ## The defect, stated so it cannot be re-introduced by accident
// The ⏸ (pause-close) is revealed on hover directly BELOW the ×, so the pointer must travel
// from one to the other. A `::after` pseudo-element bridges the gap between them.
//
// The bug: that bridge was `display: none`, promoted to `display: block` **only while
// `.tile-actions:hover`** — which is circular. `:hover` on the cluster is true only while the
// pointer is inside the cluster's own ~15px box (the ×). Leaving the × heading downward made
// `:hover` false → removed the bridge → destroyed the very thing meant to keep hover alive.
//
// Symptom, exactly as the operator reported it: **the ⏸ survived FAST pointer travel but
// vanished on SLOW travel.** Fast movement crossed the dead band between two pointer samples
// and landed on the ⏸ (whose own hover, as a DOM child, re-satisfies the ancestor's `:hover`);
// slow movement landed *in* the band and lost the reveal.
//
// The fix: the bridge is ALWAYS laid out, and `pointer-events` gates it instead of `display`.
//
// ## ⚠️ What this guard can and cannot prove
// It asserts DECLARATIONS EXIST in the rule — not rendered behavior. A CSS hover path across
// a pointer trajectory needs a real browser with a real pointer; that proof is the operator's
// re-verification at verify-human, recorded in the WIP. What this guard buys is narrower and
// still worth having: the specific edit that caused the bug (gating the bridge's existence on
// `:hover`) fails loudly instead of silently regressing a defect a human had to find by hand.
//
// Read via `node:fs`, NOT `?raw` — Vitest's Vite CSS plugin intercepts `?raw` on a `.css`
// file and returns processed output rather than source text
// (`[[vitest-raw-import-css-returns-processed-not-text]]`). This mirrors the existing
// convention in `projectModelCell.test.ts` / `settingsPanelWiring.test.ts`.

const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");

/** Extract a single rule body by selector, so assertions are scoped to it. */
function ruleFor(selector: string): string {
  const start = css.indexOf(selector + " {");
  expect(
    start,
    `selector ${selector} not found in App.css — if it was renamed, this guard is now vacuous and must be updated, not deleted`,
  ).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("the ⏸ hover bridge survives slow pointer travel", () => {
  it("the bridge is always laid out — its EXISTENCE is not gated on :hover", () => {
    const bridge = ruleFor(".tile-actions::after");

    // The regression, precisely: `display: none` in the base rule is what made the bridge
    // disappear the moment the pointer left the ×. Any `display` declaration here is
    // suspicious enough to fail — the base rule has no legitimate reason to carry one.
    expect(
      bridge,
      "the bridge must not gate its own existence on display — that was the circular bug",
    ).not.toMatch(/display:\s*none/);

    // It must occupy real space below the cluster to be crossable at all.
    expect(bridge).toMatch(/position:\s*absolute/);
    expect(bridge).toMatch(/top:\s*100%/);
    expect(bridge).toMatch(/height:/);
  });

  it("the bridge is gated on pointer-events instead, and starts inert", () => {
    const bridge = ruleFor(".tile-actions::after");
    // Inert by default so it cannot swallow clicks on the tile behind it during the ~99% of
    // the time the ⏸ is hidden. This is the property that makes "always laid out" safe.
    expect(bridge).toMatch(/pointer-events:\s*none/);
  });

  it("hover/focus-within activates the bridge via pointer-events, not display", () => {
    const start = css.indexOf(".tile-actions:hover::after");
    expect(start).toBeGreaterThan(-1);
    const activation = css.slice(start, css.indexOf("}", start));

    expect(activation).toMatch(/pointer-events:\s*auto/);
    // If someone "restores" display gating here, the circular bug is back.
    expect(
      activation,
      "activating via display re-introduces the slow-travel defect",
    ).not.toMatch(/display:\s*block/);

    // Keyboard parity: focus-within must be on the same activation rule, or the ⏸ is
    // pointer-only and unreachable by Tab.
    expect(css.slice(start, start + 120)).toContain("focus-within");
  });

  it("the bridge is tall enough to span the gap AND the ⏸ it leads to", () => {
    const bridge = ruleFor(".tile-actions::after");
    const pause = ruleFor(".tile-action--pause");

    // The ⏸ sits at `top: calc(100% + Npx)`; the bridge must cover that offset plus the
    // control's own height, or a dead band reappears at the bottom of the descent.
    const gapMatch = pause.match(/top:\s*calc\(100%\s*\+\s*(\d+)px\)/);
    expect(
      gapMatch,
      "pause control must be offset below the cluster",
    ).toBeTruthy();
    const gap = Number(gapMatch![1]);

    const heightMatch = bridge.match(/height:\s*(\d+)px/);
    expect(heightMatch).toBeTruthy();
    const bridgeHeight = Number(heightMatch![1]);

    // Control height is 14-15px depending on render mode (the expanded tile overrides to
    // 15px); require the bridge to clear the larger of the two plus the gap.
    expect(
      bridgeHeight,
      `bridge height ${bridgeHeight}px must cover the ${gap}px gap plus the ~15px control`,
    ).toBeGreaterThanOrEqual(gap + 15);
  });

  it("meta: the guard is not vacuous — App.css actually loaded", () => {
    // An empty read would let every `.not.toMatch` above pass while asserting nothing.
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toContain(".tile-actions");
  });
});
