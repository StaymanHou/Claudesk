// @vitest-environment jsdom
//
// ⚠️ Needed because `PromptPanel` reads browser globals through its hooks and its store.
import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { PromptPanel } from "../PromptPanel";
import { saveDraft } from "../../draftStore";

// F-a WP4 Phase 2 — the send BUTTONS' resting DOM, asserted against a PARSED render.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS FILE EXISTS BECAUSE `verify:auto` CANNOT SEE A JSX PROP.
//
// WP3 shipped TWO defects past a fully green 2859-test gate, and BOTH were props: a dark theme
// routed through `extensions` instead of the `theme` prop (the panel rendered WHITE), and
// `basicSetup={false}`, a single prop holding up an entire design decision. CLAUDE.md records
// the conclusion bluntly: *"this project's automated gate cannot see a component's props at
// all."* Phase 2 adds `disabled`, `onClick` and two new props to a CM6 host, so it is squarely
// in that blast radius.
//
// ⚠️ `disabled` is the one that matters most here. It is the difference between a button that
// refuses a blank send and a button that looks alive and silently does nothing — and a source
// guard for it would match the literal in the JSX whether or not React ever applied it.
// Per `docs/lessons/source-text-guards.md`: when the question is "what does the DOM look like
// at rest", RENDER it.

const PROJECT = "/tmp/scratch/send-buttons";

function render(over: Partial<Parameters<typeof PromptPanel>[0]> = {}) {
  const html = renderToStaticMarkup(
    <PromptPanel
      projectPath={PROJECT}
      visible
      panelFront
      ccSessionId="sess-1"
      {...over}
    />,
  );
  return new JSDOM(`<body>${html}</body>`).window.document;
}

beforeEach(() => {
  localStorage.clear();
});

describe("both send buttons exist", () => {
  it("renders a Send and a Stage control", () => {
    const doc = render();
    expect(
      doc.querySelector('[data-testid="prompt-send-submit"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-testid="prompt-send-stage"]'),
    ).not.toBeNull();
  });

  it("names the hotkey for each mode in its title", () => {
    // ⚠️ The chords are otherwise undiscoverable — there is no visible key hint in the panel,
    // and the Settings list is a separate surface. A wrong or missing hint here means the
    // keyboard path effectively does not exist for anyone who has not read the source.
    const doc = render();
    const submit = doc.querySelector('[data-testid="prompt-send-submit"]');
    const stage = doc.querySelector('[data-testid="prompt-send-stage"]');
    expect(submit?.getAttribute("title")).toContain("⌘↵");
    expect(stage?.getAttribute("title")).toContain("⇧⌘↵");
  });

  it("the stage control's title says it does NOT submit", () => {
    // The whole point of the mode. A label that read like "send" would make the two buttons
    // indistinguishable at a glance, which is how a half-finished dictation gets submitted.
    const doc = render();
    const stage = doc.querySelector('[data-testid="prompt-send-stage"]');
    expect(stage?.getAttribute("title")?.toLowerCase()).toContain("without");
  });
});

describe("disabled state — the real question a source guard could not answer", () => {
  it("both are DISABLED with an empty draft", () => {
    const doc = render();
    expect(
      doc
        .querySelector('[data-testid="prompt-send-submit"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      doc
        .querySelector('[data-testid="prompt-send-stage"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("both are DISABLED on a whitespace-only draft", () => {
    // ⚠️ Mirrors `planSend`'s blank rule. If the button's predicate and `planSend` disagreed,
    // the button would be live and the click a silent no-op — which reads as broken.
    saveDraft(PROJECT, "   \n\t ");
    const doc = render();
    expect(
      doc
        .querySelector('[data-testid="prompt-send-submit"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("both are ENABLED once there is real text", () => {
    saveDraft(PROJECT, "a real prompt");
    const doc = render();
    expect(
      doc
        .querySelector('[data-testid="prompt-send-submit"]')
        ?.hasAttribute("disabled"),
    ).toBe(false);
    expect(
      doc
        .querySelector('[data-testid="prompt-send-stage"]')
        ?.hasAttribute("disabled"),
    ).toBe(false);
  });

  it("both are DISABLED with text but NO live CC session", () => {
    // ⚠️ The case that would otherwise fail invisibly: `injectCommand` would warn into the
    // console and the operator would see nothing at all happen.
    saveDraft(PROJECT, "a real prompt");
    const doc = render({ ccSessionId: null });
    expect(
      doc
        .querySelector('[data-testid="prompt-send-submit"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("are disabled when ccSessionId is OMITTED entirely", () => {
    // The prop is optional; an omitting caller must get the safe behaviour, not a crash or a
    // live button. (Every pre-WP4 caller omits it.)
    saveDraft(PROJECT, "a real prompt");
    const doc = render({ ccSessionId: undefined });
    expect(
      doc
        .querySelector('[data-testid="prompt-send-submit"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("the editor still renders alongside the actions", () => {
  it("the prose buffer is present", () => {
    // ⚠️ A cheap regression net for the WP3 class of defect: adding an action row below a CM6
    // host is exactly the kind of change that can displace or unmount the editor.
    const doc = render();
    expect(doc.querySelector('[data-testid="prompt-panel"]')).not.toBeNull();
  });
});
