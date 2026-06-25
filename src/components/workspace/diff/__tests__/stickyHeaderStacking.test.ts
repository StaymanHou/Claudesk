import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// DiffPanel wiring is checked via Vite's ?raw (works for .tsx). App.css is read via
// fs instead: a `.css?raw` import resolves to an EMPTY string under Vitest (Vite
// runs CSS through its style pipeline, not the raw text loader), so the CSS
// invariants are read straight off disk. Repo posture — pure logic → vitest, live
// sticky LAYOUT → verify-human; sticky positioning + ResizeObserver geometry can't
// be computed in jsdom, so these structural assertions pin the wiring so a refactor
// can't silently revert the stack back to a top:0 collision. The live "headers
// stack instead of colliding while scrolling" check is the QoL-WP8 Phase 2
// verify-human Browser outcome (operator-approved all 3 leaves 2026-06-25).
import diffPanelSource from "../DiffPanel.tsx?raw";

const appCssPath = fileURLToPath(
  new URL("../../../../App.css", import.meta.url),
);
const appCss = readFileSync(appCssPath, "utf8");

// QoL-WP8 item 2/A — stacked sticky headers + genuinely-sticky per-file row.
//
// Root cause this fix addresses: .diff-commits, .diff-commit-banner, and
// .diff-file-header were ALL `position:sticky; top:0` in the same .diff-scroll
// container, so they collided at the top and the per-file header hid behind the z2
// Commits panel / got shoved off by the next file. The fix offsets each lower layer
// by the cumulative height of the layers above it, measured live into CSS vars.
//
// Failure modes these tests prevent:
//  1. Someone resets .diff-file-header or .diff-commit-banner back to `top: 0`,
//     re-introducing the collision.
//  2. The CSS vars (--diff-commits-h / --diff-commit-banner-h) are removed so the
//     calc() offsets resolve to nothing.
//  3. The ResizeObserver that measures the heights is dropped, so the vars go stale
//     when the Commits section collapses/expands or the banner appears (commit view).

// Extract a single CSS rule body by selector (the block between its `{` and the
// next `}`). The `selector + " {"` anchor avoids matching prefix-sibling selectors
// (e.g. .diff-commits vs .diff-commits-header). Comments are stripped so a comment
// that mentions e.g. "not top:0" doesn't trip a property-value assertion.
const ruleBody = (selector: string): string => {
  const i = appCss.indexOf(selector + " {");
  expect(i, `rule "${selector}" not found in App.css`).toBeGreaterThanOrEqual(0);
  const open = appCss.indexOf("{", i);
  const close = appCss.indexOf("}", open);
  return appCss.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
};

describe("App.css stacks the diff sticky layers (QoL-WP8 item 2/A)", () => {
  it("declares the --diff-commits-h stacking var on .diff-scroll", () => {
    expect(ruleBody(".diff-scroll")).toMatch(/--diff-commits-h:\s*2rem/);
  });

  it("pins .diff-commit-banner below the commits section (not top:0)", () => {
    const body = ruleBody(".diff-commit-banner");
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/top:\s*var\(--diff-commits-h/);
    expect(body).not.toMatch(/top:\s*0\b/);
  });

  it("pins .diff-file-header below BOTH the commits section and the banner (not top:0)", () => {
    const body = ruleBody(".diff-file-header");
    expect(body).toMatch(/position:\s*sticky/);
    // Cumulative offset: commits height + banner height (0 in working-dir view).
    expect(body).toMatch(
      /top:\s*calc\(\s*var\(--diff-commits-h[^)]*\)\s*\+\s*var\(--diff-commit-banner-h/,
    );
    expect(body).not.toMatch(/top:\s*0\b/);
  });

  it("keeps the z-index order: commits/banner (z2) above file header (z1)", () => {
    expect(ruleBody(".diff-commits")).toMatch(/z-index:\s*2/);
    expect(ruleBody(".diff-commit-banner")).toMatch(/z-index:\s*2/);
    expect(ruleBody(".diff-file-header")).toMatch(/z-index:\s*1/);
  });
});

describe("DiffPanel measures the sticky layer heights into the CSS vars (QoL-WP8 item 2/A)", () => {
  it("holds a ref on the .diff-scroll container", () => {
    expect(diffPanelSource).toMatch(/const\s+scrollRef\s*=\s*useRef</);
    expect(diffPanelSource).toMatch(/ref=\{scrollRef\}/);
  });

  it("sets BOTH stacking vars via setProperty from measured heights", () => {
    expect(diffPanelSource).toMatch(/setProperty\(\s*["']--diff-commits-h["']/);
    expect(diffPanelSource).toMatch(
      /setProperty\(\s*["']--diff-commit-banner-h["']/,
    );
    expect(diffPanelSource).toMatch(/offsetHeight/);
  });

  it("uses a guarded ResizeObserver that disconnects on cleanup", () => {
    expect(diffPanelSource).toMatch(
      /typeof\s+ResizeObserver\s*===\s*["']undefined["']/,
    );
    expect(diffPanelSource).toMatch(/new\s+ResizeObserver\(/);
    expect(diffPanelSource).toMatch(/\.disconnect\(\)/);
  });
});
