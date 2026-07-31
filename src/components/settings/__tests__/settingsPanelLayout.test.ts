// The Settings-panel horizontal-overflow guard (M10.9 WP3.5a refactor, 2026-07-29).
//
// ## Why this file exists — it was CLAIMED to exist for a week and did not
// `App.css`'s `.substrate-info` comment ends "Pinned by settingsPanelLayout.test.ts". That file did
// not exist. Code review caught it, and the miss was load-bearing rather than clerical: WP3
// diagnosed a live bug where an unconstrained `<pre>` inside `.settings-group-body` (which is
// `display: flex` with `align-items: flex-start`, so children size to CONTENT) grew to 859px inside
// a 511px group and put the **entire Settings panel** into horizontal overflow. It was fixed with
// `align-self: stretch; min-width: 0`, documented in a 12-line comment — and left unpinned while
// everyone believed it was pinned.
//
// WP3.5a then re-introduced the same class of bug one file away: eleven undefined CSS classes,
// including two more `<pre>` elements carrying `git clone` output into that same flex parent. A
// false pin reference is worse than none, because it tells the next reader the regression is
// guarded.
//
// ## What this can and cannot prove
// It is a **source-level** guard over `App.css`, so it proves the required declarations are PRESENT.
// It cannot prove the rendered layout — no DOM/layout engine here (this repo's split is: pure logic
// → vitest, live layout → the MCP bridge against the real WKWebView). Per the repo rule that a
// source guard must assert single identifiers rather than formatted multi-line expressions, every
// assertion below looks for one declaration inside one rule block, and each carries a positive
// counterpart so it cannot pass vacuously.
//
// The live check stays on the verify-human list. This exists so the *mandatory declarations* cannot
// be silently deleted, which is exactly how the WP3 bug would return.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Read via `node:fs`, NOT a `?raw` import: Vite's CSS plugin intercepts `?raw` on `.css` and
// returns processed output rather than the file's text (memory: the .tsx `?raw` convention does not
// extend to .css).
const CSS = readFileSync(
  fileURLToPath(new URL("../../../App.css", import.meta.url)),
  "utf8",
);

/** Extract one rule block's body by selector, so assertions are scoped to that rule. */
function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  if (at === -1) return "";
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

/**
 * Every flex child of `.settings-group-body` that can contain wide content.
 *
 * `align-items: flex-start` on the parent means each of these sizes to its content unless it opts
 * out with BOTH declarations — that pair is the entire fix, and dropping either one reproduces the
 * bug.
 */
const WIDE_FLEX_CHILDREN = [".substrate-info", ".install-wizard"];

describe("Settings panel — the horizontal-overflow guard WP3 paid for", () => {
  it("keeps the parent's flex-start, so the constraint below stays necessary", () => {
    // If this ever changes, the child-side fixes may become unnecessary — but silently keeping
    // them is harmless, whereas silently REMOVING them while flex-start persists is the bug. This
    // assertion documents the coupling rather than guessing at it.
    expect(ruleBody(".settings-group-body")).toContain(
      "align-items: flex-start",
    );
  });

  it.each(WIDE_FLEX_CHILDREN)(
    "%s opts out of content-sizing with BOTH required declarations",
    (selector) => {
      const body = ruleBody(selector);
      expect(body, `${selector} must exist in App.css`).not.toBe("");
      // `align-self: stretch` overrides the inherited flex-start for this child…
      expect(body).toContain("align-self: stretch");
      // …and `min-width: 0` lets it shrink below its content's intrinsic width, which is what
      // makes the inner <pre> the thing that scrolls instead of the panel.
      expect(body).toContain("min-width: 0");
    },
  );

  it("gives every <pre>-bearing block its own scroll container", () => {
    // The project rule: wide content scrolls inside its own container, never the panel body. Both
    // of these are `<pre>` elements holding lines that are long by nature — a `git clone` URL, an
    // install.sh path.
    expect(ruleBody(".substrate-cmd")).toContain("overflow-x: auto");
    expect(ruleBody(".install-wizard-log")).toContain("overflow: auto");
  });

  it("constrains the location input, which is pre-filled with a long path", () => {
    // The seeded default (`~/.claudesk/vendor/my-claude-code-customization`) is long enough to
    // widen a flex row on its own. Both the row and the input need `min-width: 0`, or the input's
    // intrinsic size wins.
    expect(ruleBody(".install-wizard-location-row")).toContain("min-width: 0");
    expect(ruleBody(".install-wizard-location-row input")).toContain(
      "min-width: 0",
    );
  });

  it("defines every class the wizard renders", () => {
    // The CRITICAL finding this refactor closed: eleven classes were referenced with zero defined.
    // Cheap to check, and it is the failure that made the layout bug possible.
    for (const cls of [
      ".install-wizard",
      ".install-wizard-intro",
      ".install-wizard-disclosures",
      ".install-wizard-location",
      ".install-wizard-location-row",
      ".install-wizard-log",
      ".install-wizard-actions",
      ".install-wizard-hint",
      ".install-wizard-warning",
      ".install-wizard-error",
      ".substrate-install-button",
      // WP3.5b: the uninstall dialog's disclosure list. Added the same day an automated
      // used-vs-defined sweep caught it undefined before it reached a browser — the exact
      // CRITICAL WP3.5a shipped eleven times over.
      ".install-wizard-list",
      ".uninstall-preview-log",
    ]) {
      expect(
        CSS,
        `${cls} is referenced by the wizard but not defined`,
      ).toContain(`${cls} {`);
    }
  });

  it("every className the substrate + uninstall components use is defined in App.css", () => {
    // The GENERAL form of the check above, and the one that would have caught WP3.5a's
    // CRITICAL without anyone maintaining a list: sweep the components' actual `className`
    // attributes and diff them against the stylesheet. A hand-maintained list only guards the
    // classes someone remembered to add to it — this guards the ones they didn't.
    const defined = new Set(
      CSS.match(/\.[a-zA-Z0-9_-]+/g)?.map((s) => s.slice(1)) ?? [],
    );
    const used = new Set<string>();
    for (const file of [
      "../WorkflowUninstallDialog.tsx",
      "../WorkflowInstallWizard.tsx",
      "../WorkflowSubstrateInfo.tsx",
    ]) {
      const src = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      );
      for (const m of src.matchAll(/className="([^"]+)"/g)) {
        for (const cls of m[1].split(/\s+/)) used.add(cls);
      }
    }
    // `substrate-steps` is a pre-existing structural wrapper with no styling of its own —
    // grandfathered explicitly rather than silently, so a NEW undefined class still fails.
    const allowedUnstyled = new Set(["substrate-steps"]);
    const missing = [...used].filter(
      (c) => !defined.has(c) && !allowedUnstyled.has(c),
    );
    expect(
      missing,
      `classNames used but never defined in App.css: ${missing.join(", ")}`,
    ).toEqual([]);
    // Positive half — a sweep that found nothing to check would pass vacuously.
    expect(used.size).toBeGreaterThan(8);
  });

  it("caps the uninstall preview well under the generic log height", () => {
    // The dialog must fit the panel body (~600px). At the generic 220px log cap it ran ~700px
    // and put its entire button row below the fold — the operator saw a click do nothing.
    // Asserted as a NUMBER, not merely as "the declaration exists": a cap that drifted back up
    // would reproduce the bug while a presence check stayed green.
    const body = ruleBody(".uninstall-preview-log");
    expect(body, ".uninstall-preview-log must exist in App.css").not.toBe("");
    const cap = Number(/max-height:\s*(\d+)px/.exec(body)?.[1]);
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(140);
    // And it must still scroll rather than clip — inherited from `.install-wizard-log`.
    expect(ruleBody(".install-wizard-log")).toContain("overflow: auto");
  });

  it("would fail if a required declaration were removed", () => {
    // Meta-test. A guard that cannot fail is decoration — and this module has already shipped two
    // guards that passed broken code. Proves the extractor actually scopes to a rule body by
    // asserting a declaration that is NOT in it.
    expect(ruleBody(".install-wizard")).not.toContain(
      "align-items: flex-start",
    );
    expect(ruleBody("no-such-selector-here")).toBe("");
  });
});
