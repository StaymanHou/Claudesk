// @vitest-environment jsdom
//
// ⚠️ Needed because `RightPanelHost` reads browser globals through its hooks. Scoped per-file
// rather than flipping the project default — the convention `workspaceDriveModeRender.test.tsx`
// and `projectModelCellRender.test.tsx` established.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { RightPanelHost } from "../../RightPanelHost";
import { DRAFT_KEY_PREFIX } from "../../draftStore";

// F-a WP3 P3.4 verify-codify (REWRITTEN after code review) — the Prompt tab's draft indicator,
// asserted against a PARSED DOM rather than source text.
//
// ── ⚠️ WHY THIS FILE REPLACED A `?raw` GUARD ──────────────────────────────────────
// The first version of this coverage grepped three source files for the three links of the
// indicator chain (panel reports → host holds state → tab renders the attribute). It justified
// that choice with "this project configures no DOM environment, so the component cannot be
// rendered under vitest" — a claim `docs/lessons/source-text-guards.md` explicitly corrects:
//
//   *"'This repo has no component-render harness' is HALF TRUE, and the discouraging half has
//   been steering work toward the guard style that failed the nine ways above."*
//
// `renderToStaticMarkup` ships with the installed `react-dom` and `jsdom` is already a
// devDependency. The lesson's rule is unambiguous and this file follows it: **when the question
// is "what does the DOM look like at rest", render it; when it is "what does the source say",
// guard the source.** "Does the Prompt tab carry `data-has-draft`?" is the former.
//
// ⚠️ The replaced guard was also brittle in the specific way the lesson predicts — it matched
// the literal string `presenceRef.current?.(plan.write.text !== "")`, so any refactor of that
// expression broke the test without breaking the behavior, while a *relocation* of the same
// expression into a render path (the thing its own comment forbade) would have kept it green.
//
// ── THE BOUNDARY, stated because a reader who does not know it will misread a pass ──
// Server rendering cannot dispatch events or transition state, so this file asserts the
// **resting** DOM only: what the tab looks like on first paint given what is in storage. The
// edit → debounce → report → re-render sequence stays covered by the pure-function tests in
// `promptDraftSync.test.ts` and by the live MCP-bridge verify-self run.

const PROJECT = "/tmp/scratch/indicator-fixture";

function renderHost(): Document {
  const html = renderToStaticMarkup(
    <RightPanelHost
      workspaceId="ws-test"
      projectPath={PROJECT}
      visible={true}
      collapsed={false}
    />,
  );
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

function promptTab(doc: Document): Element | null {
  return doc.querySelector('[data-testid="panel-tab-prompt"]');
}

describe("the Prompt tab's draft indicator renders from stored state", () => {
  it('reads data-has-draft="false" when the project has NO stored draft', () => {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${PROJECT}`);
    const tab = promptTab(renderHost());

    // Non-vacuity first: if the tab were absent, every assertion below would be trivially
    // satisfiable by `null` and the file would guard nothing.
    expect(tab, "the Prompt tab must render at all").not.toBeNull();
    expect(tab?.getAttribute("data-has-draft")).toBe("false");
    expect(tab?.className).not.toContain("has-draft");
  });

  it("⚠️ is a REAL attribute, not a hardcoded string — the two states differ", () => {
    // The single most valuable assertion here, and the one the `?raw` version could only
    // approximate by matching the ternary's source text. A `data-has-draft="true"` literal in
    // the JSX would satisfy "the attribute exists" and even "it says true"; it CANNOT satisfy
    // two renders disagreeing.
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${PROJECT}`);
    const without = promptTab(renderHost())?.getAttribute("data-has-draft");

    localStorage.setItem(`${DRAFT_KEY_PREFIX}${PROJECT}`, "unsent text");
    const with_ = promptTab(renderHost())?.getAttribute("data-has-draft");

    expect(without).toBe("false");
    expect(with_).toBe("true");
    expect(without).not.toBe(with_);
  });

  it("marks the tab with the has-draft class so the CSS dot can attach", () => {
    // The attribute is the test handle; the CLASS is what `.panel-tab.has-draft::after`
    // actually keys on. Asserting only the attribute would let the visible dot break silently.
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${PROJECT}`, "unsent text");
    const tab = promptTab(renderHost());
    expect(tab?.className).toContain("has-draft");
  });

  it("leaves the SIBLING tabs unmarked — the indicator is Prompt-scoped", () => {
    // A `has-draft` class applied to every `.panel-tab` would pass all three tests above.
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${PROJECT}`, "unsent text");
    const doc = renderHost();
    for (const name of ["editor", "diff", "terminal"]) {
      const sibling = doc.querySelector(`[data-testid="panel-tab-${name}"]`);
      expect(sibling, `the ${name} tab must render`).not.toBeNull();
      expect(
        sibling?.className,
        `the ${name} tab must not carry the draft indicator`,
      ).not.toContain("has-draft");
    }
  });
});
