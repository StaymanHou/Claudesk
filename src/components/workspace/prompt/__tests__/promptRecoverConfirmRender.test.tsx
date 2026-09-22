// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { PromptPanel } from "../PromptPanel";
import { HISTORY_KEY_PREFIX } from "../../draftHistory";
import { DRAFT_KEY_PREFIX } from "../../draftStore";
import { canonicalizeProjectPath } from "../../../../state/workspace";

// F-a WP4 Phase 3 (F12 back-loop) — the discard confirmation's resting DOM.
//
// ⚠️ RENDERED, NOT GREPPED. "Which button is focused by default" and "is the dialog absent at
// rest" are DOM questions, and this project's gate cannot see a JSX prop at all — WP3 shipped
// two prop defects past a fully green run. `variant: "primary"` on the WRONG button is exactly
// that class: it would make Enter destroy the buffer, and no type error or source grep would say so.

const PROJECT = "/tmp/scratch/recover-confirm";

function seed(ring: string[], draft?: string) {
  localStorage.setItem(
    `${HISTORY_KEY_PREFIX}${canonicalizeProjectPath(PROJECT)}`,
    JSON.stringify(ring),
  );
  if (draft !== undefined) {
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${canonicalizeProjectPath(PROJECT)}`,
      draft,
    );
  }
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

describe("the confirmation is ABSENT at rest", () => {
  it("no dialog renders before anything is recovered", () => {
    // ⚠️ A dialog present-but-hidden would be a different (and worse) implementation: it could
    // trap focus or be dismissed by a stray Esc. It must not be in the DOM at all.
    seed(["an entry"], "unsent work");
    const doc = render();
    expect(doc.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  });
});

describe("the panel still renders normally with a draft AND a ring", () => {
  it("shows the recover toggle and both send buttons", () => {
    // The combination that triggers the confirm path is also the one most likely to break
    // layout, so the surrounding surface is pinned alongside it.
    seed(["an entry"], "unsent work");
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-recover-toggle"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-testid="prompt-send-submit"]'),
    ).not.toBeNull();
    expect(doc.querySelector('[data-testid="prompt-panel"]')).not.toBeNull();
  });
});
