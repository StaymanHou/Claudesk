import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SURFACE-2026-11-18-PICKER-OVERLAY-NESTED-SCROLLBARS — the filmstrip "+" overlay must have ONE
// scroller, the project list. The fix makes the card a bounded flex column that never scrolls
// itself: the picker inside is a shrinkable flex item, so the squeeze reaches the list.
//
// ⚠️ jsdom has no layout engine, so this cannot prove "one scroller". That was measured live
// against the running WKWebView (the WIP `picker-qol-focus-and-scroll` → verify-self O5: at
// inner height 528, panel scrollHeight 358 == clientHeight 358 and `picker-recents` 624/112 the
// only overflowing scroller; at 1018 the same shape). This is the cheap tripwire for the four CSS
// declarations that result depends on, each of which, removed alone, brings the double
// scrollbar or the clipped buttons back. Read via `node:fs`: a `?raw` import of a `.css` file
// returns processed output (`[[vitest-raw-import-css-returns-processed-not-text]]`).

const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");

/** Every rule body for exactly `selector`, concatenated (the selector may appear twice). */
function rulesFor(selector: string): string {
  const bodies: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  // Strip comments from the WHOLE sheet first: a brace inside a comment (App.css has one)
  // would otherwise break the `{…}` match before any per-rule stripping could run.
  const sheet = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of sheet.matchAll(re)) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  expect(bodies.length, `a rule for ${selector} must exist`).toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("the + picker overlay has one scroller (CSS tripwire)", () => {
  it("the card is a flex column that never scrolls itself", () => {
    const panel = rulesFor(".picker-overlay-panel");
    expect(panel).toMatch(/display:\s*flex/);
    expect(panel).toMatch(/flex-direction:\s*column/);
    expect(panel).toMatch(/overflow:\s*hidden/);
    expect(panel).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    expect(panel).toMatch(/max-height:\s*80%/);
  });

  it("the picker inside is a shrinkable flex item, not the full-viewport column", () => {
    const picker = rulesFor(".picker-overlay-panel .picker");
    expect(picker).toMatch(/height:\s*auto/);
    expect(picker).toMatch(/min-height:\s*0/);
    expect(picker).toMatch(/flex:\s*1 1 auto/);
  });

  it("the list drops the standalone 60vh cap inside the overlay", () => {
    expect(rulesFor(".picker-overlay-panel .picker-recents")).toMatch(
      /max-height:\s*none/,
    );
  });

  it("the list stays the scroller (it shrinks below content and scrolls)", () => {
    const list = rulesFor(".picker-recents");
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });
});
