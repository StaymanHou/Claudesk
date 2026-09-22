// @vitest-environment jsdom
//
// ⚠️ Needed because `PromptPanel` reads browser globals through its hooks and its store.
import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { PromptPanel } from "../PromptPanel";
import { HISTORY_KEY_PREFIX } from "../../draftHistory";
import { canonicalizeProjectPath } from "../../../../state/workspace";

// F-a WP4 Phase 3 (P3.3) — the recover affordance's resting DOM, from a PARSED render.
//
// ⚠️ RENDERED, NOT GREPPED. The question is "what does the DOM look like at rest" — which
// `docs/lessons/source-text-guards.md` answers unambiguously: render it. And this project's gate
// CANNOT see a JSX prop at all (WP3 shipped two prop defects past a fully green 2859-test run),
// which is exactly what a conditional render is.

const PROJECT = "/tmp/scratch/recover-render";

/** Seed the ring directly, the way a send would have left it. */
function seedRing(entries: string[]) {
  localStorage.setItem(
    `${HISTORY_KEY_PREFIX}${canonicalizeProjectPath(PROJECT)}`,
    JSON.stringify(entries),
  );
}

function render() {
  const html = renderToStaticMarkup(
    <PromptPanel
      projectPath={PROJECT}
      visible
      panelFront
      ccSessionId="sess-1"
    />,
  );
  return new JSDOM(`<body>${html}</body>`).window.document;
}

beforeEach(() => {
  localStorage.clear();
});

describe("resting state: EMPTY ring", () => {
  it("shows no recover affordance at all", () => {
    // ⚠️ The affordance is absent, not merely empty. A "Recent (0)" toggle on a fresh project
    // would be a dead control advertising a feature with nothing behind it.
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-recover-toggle"]'),
    ).toBeNull();
    expect(doc.querySelector('[data-testid="prompt-recover-list"]')).toBeNull();
  });
});

describe("resting state: POPULATED ring", () => {
  it("shows the toggle with the entry count", () => {
    seedRing(["first sent", "second sent"]);
    const doc = render();
    const toggle = doc.querySelector('[data-testid="prompt-recover-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toContain("2");
  });

  it("starts COLLAPSED — the list is not in the DOM at rest", () => {
    // ⚠️ The panel's job is composing. A permanently-open history list would crowd the buffer it
    // exists to protect, and on a project with ten long dictations it would dominate the panel.
    seedRing(["a", "b", "c"]);
    const doc = render();
    expect(doc.querySelector('[data-testid="prompt-recover-list"]')).toBeNull();
    expect(
      doc
        .querySelector('[data-testid="prompt-recover-toggle"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("the count reflects the real ring size", () => {
    // Guards the "length-only assertion standing in for an identity one" trap in reverse: a
    // fixture of 2 and a fixture of 5 must give different counts, or the assertion is vacuous.
    seedRing(["a", "b", "c", "d", "e"]);
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-recover-toggle"]')?.textContent,
    ).toContain("5");
  });
});

describe("the ring is read PER PROJECT", () => {
  it("another project's ring does not appear", () => {
    // ⚠️ The failure this prevents is not cosmetic: recovering an entry from the wrong project
    // would paste another project's prompt into this buffer and, from there, into its CC session.
    localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${canonicalizeProjectPath("/tmp/scratch/some-other-project")}`,
      JSON.stringify(["belongs to another project"]),
    );
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-recover-toggle"]'),
    ).toBeNull();
  });
});

describe("the send controls still render alongside the recover strip", () => {
  it("both send buttons survive", () => {
    // Cheap regression net: inserting a strip between the buffer and the action row is exactly
    // the kind of change that displaces them.
    seedRing(["x"]);
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-send-submit"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-testid="prompt-send-stage"]'),
    ).not.toBeNull();
    expect(doc.querySelector('[data-testid="prompt-panel"]')).not.toBeNull();
  });
});
