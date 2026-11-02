import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// M16.5 WP6 Phase 1 — app overlays must draw above CodeMirror's find/replace bar.
//
// CM6's base theme sets `.cm-panels { z-index: 300 }` (gutters 200, tooltips 500). With no
// stacking context around the editor those values competed with `.command-palette-backdrop`
// (z-index 20) and the find bar drew over the ⌘P palette. `isolation: isolate` on
// `.editor-split` contains them. jsdom does not compute stacking, so the live check is
// verify-self's `elementFromPoint` probe; this pins the rule that makes it pass.
//
// App.css is read via fs: a `.css?raw` import is not the raw text under Vitest.
const appCss = readFileSync(
  fileURLToPath(new URL("../../../../App.css", import.meta.url)),
  "utf8",
);

/** The body of the one rule whose selector is exactly `selector`, comments stripped. */
function ruleBody(selector: string): string {
  const anchor = `\n${selector} {`;
  const i = appCss.indexOf(anchor);
  expect(i, `rule "${selector}" not found in App.css`).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    appCss.indexOf(anchor, i + 1),
    `rule "${selector}" is defined more than once`,
  ).toBe(-1);
  const open = appCss.indexOf("{", i);
  const close = appCss.indexOf("}", open);
  return appCss.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the editor is its own stacking context (M16.5 WP6)", () => {
  it(".editor-split isolates CodeMirror's z-indexes", () => {
    expect(ruleBody(".editor-split")).toMatch(
      /(^|[;\s])isolation:\s*isolate\s*;/,
    );
  });

  it("the app overlay keeps a positive z-index to win at the outer level", () => {
    expect(ruleBody(".command-palette-backdrop")).toMatch(
      /z-index:\s*[1-9]\d*\s*;/,
    );
  });
});
