import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import docsPanelSource from "../docs/DocsPanel.tsx?raw";
import hostSource from "../RightPanelHost.tsx?raw";

// M11 WP2 — every CSS class the Docs panel references must actually be DEFINED.
//
// ⚠️ This guards a failure class that is invisible to every other gate: `tsc`, `eslint`,
// vitest and `cargo` all pass while a component references classes that do not exist —
// the UI just renders unstyled. It shipped once already (M10.9 WP3.5a: eleven referenced
// classes, zero defined, re-introducing a layout bug diagnosed one file away), and the
// test that WP's comment named as its pin did not exist at the time. This is that pin,
// for this panel.
//
// ⚠️ CSS is read with node:fs, NOT a `?raw` import: Vite's CSS plugin intercepts `?raw`
// on a .css file and returns PROCESSED output rather than the source text, so the
// `.tsx`/`.ts` `?raw` convention does not extend to stylesheets
// ([[vitest-raw-import-css-returns-processed-not-text]]).
//
// ⚠️ SCOPE, measured rather than assumed: this catches a WHOLE class with no rule (the
// WP3.5a failure — mutation-proved by deleting `.docs-panel-empty`, which fails with the
// class named). It does NOT catch a missing MODIFIER: deleting `.docs-list-row.is-selected`
// leaves the suite green, because the extractor collects the base class from the template
// literal's static head and `.docs-list-row` still has a rule. Stated plainly so the guard
// is not mistaken for more than it is — a missing modifier degrades styling silently and
// is caught at verify-human, not here.

const cssPath = join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "App.css",
);
const css = readFileSync(cssPath, "utf8");

/** Class names referenced in a component's JSX `className` strings. */
function referencedClasses(src: string): string[] {
  const found = new Set<string>();
  // Matches both `className="a b"` and the static head of a template literal
  // (`className={`docs-list-row${...}`}`), which is how the conditional rows are built.
  const pattern = new RegExp('className=(?:"([^"]*)"|\\{`([^`$]*))', "g");
  for (const m of src.matchAll(pattern)) {
    for (const cls of (m[1] ?? m[2] ?? "").split(/\s+/)) {
      if (cls.startsWith("docs-") || cls.endsWith("--docs")) found.add(cls);
    }
  }
  return [...found];
}

describe("Docs panel CSS classes are all defined", () => {
  it("the stylesheet was actually loaded (anti-vacuity)", () => {
    // If the read silently returned "" every assertion below would pass trivially —
    // the same emptiness trap the `?raw` guards elsewhere in this repo guard against.
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toContain(".panel-tab");
  });

  it("finds a non-trivial set of docs-* classes to check (anti-vacuity)", () => {
    const referenced = [
      ...referencedClasses(docsPanelSource),
      ...referencedClasses(hostSource),
    ];
    expect(
      referenced.length,
      "the extractor found no docs-* classes — it has drifted from the JSX",
    ).toBeGreaterThanOrEqual(5);
  });

  it("every docs-* class referenced by DocsPanel or the host slot has a rule", () => {
    const referenced = [
      ...new Set([
        ...referencedClasses(docsPanelSource),
        ...referencedClasses(hostSource),
      ]),
    ];
    const undefinedClasses = referenced.filter(
      (cls) => !css.includes(`.${cls}`),
    );

    expect(
      undefinedClasses,
      "these classes are referenced in JSX but have no rule in App.css — the component " +
        "will render unstyled, and no other gate catches it",
    ).toEqual([]);
  });
});
