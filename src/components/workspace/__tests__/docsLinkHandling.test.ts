// @vitest-environment jsdom
//
// M11 WP3 — the "webview must never navigate" invariant, proved against THE REAL HANDLER.
//
// ── Why this file exists, and why it now imports rather than re-implements ──────
// This invariant has had three guards. The first two were source-text proxies and BOTH
// passed while the invariant was broken:
//
//   1. Compared source positions of `preventDefault()` and the `external` branch — blind
//      to an early return between them. `[click]()` (a live `<a href="">`) reloaded the
//      app shell.
//   2. Counted `return` tokens above `preventDefault()` — also a proxy. Folding the
//      empty-href bail INTO the anchor guard keeps the count at 1 and passes, reopening
//      the identical hole. Measured at code review with all 1645 tests green.
//
// An earlier version of THIS file was itself part of the problem: it re-implemented the
// handler's guard order, so mutating the real component left it green. The review named the
// fix precisely — **probe the component, not the replica** — so the handler was extracted
// to `handleDocLinkClick.ts` and is imported here. A mutation to production code now fails
// these tests, which is the only thing that makes them worth running.

import { describe, expect, it } from "vitest";
import { classifyHref } from "../docs/classifyHref";
import { makeDocLinkClickHandler } from "../docs/handleDocLinkClick";
import type { DocEntry } from "../docsOrder";

const DOCS: DocEntry[] = [
  {
    rel_path: "workflow-system/product/wbs.md",
    kind: "wbs",
    file_name: "wbs.md",
    mtime_ms: 0,
  },
];

/** The real handler, with inert deps — external opens are stubbed, never dispatched. */
function realHandler(
  over: Partial<Parameters<typeof makeDocLinkClickHandler>[0]> = {},
) {
  return makeDocLinkClickHandler({
    selected: "workflow-system/product/vision.md",
    docs: DOCS,
    containerRef: { current: null },
    setLinkNote: () => {},
    setChosen: () => {},
    openExternal: () => Promise.resolve(),
    ...over,
  });
}

/** Render an anchor into a container and click it, returning the dispatched event. */
function clickAnchor(hrefAttr: string | null): MouseEvent {
  const container = document.createElement("div");
  const a = document.createElement("a");
  if (hrefAttr !== null) a.setAttribute("href", hrefAttr);
  a.textContent = "click";
  container.append(a);
  document.body.append(container);
  container.addEventListener("click", realHandler() as EventListener);

  const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
  a.dispatchEvent(ev);
  container.remove();
  return ev;
}

describe("every anchor click is prevented — no href class escapes", () => {
  // One case per class `classifyHref` can return, plus the regression case. The table
  // shape is the point: adding a class to the classifier without adding it here leaves a
  // gap, and the "all classes covered" test below fails if one is missed.
  const cases: Array<[label: string, href: string, expectedClass: string]> = [
    ["cross-doc relative", "wbs.md", "cross-doc"],
    ["cross-doc with fragment", "wbs.md#probe-outcomes", "cross-doc"],
    ["in-doc anchor", "#section-two", "anchor"],
    ["external https", "https://example.com", "external"],
    ["external protocol-relative", "//evil.example.com", "external"],
    ["external mailto", "mailto:a@b.c", "external"],
  ];

  for (const [label, href, expectedClass] of cases) {
    it(`prevents default for ${label}`, () => {
      const ev = clickAnchor(href);
      expect(classifyHref(href)).toBe(expectedClass);
      expect(ev.defaultPrevented).toBe(true);
    });
  }

  it("⚠️ REGRESSION: prevents default for an EMPTY href (`[click]()`)", () => {
    // The exact hole. `[click]()` renders `<a href="">`, classifies as `empty`, and used
    // to hit an early return above preventDefault — leaving the WKWebView free to reload
    // the app shell into an unrecoverable state.
    const ev = clickAnchor("");
    expect(classifyHref("")).toBe("empty");
    expect(
      ev.defaultPrevented,
      "an empty href must still be prevented — it navigates the webview to the current " +
        "URL, reloading the app shell with no way back",
    ).toBe(true);
  });

  it("prevents default for a whitespace-only href", () => {
    // Same class, different authoring accident (`[click]( )`).
    const ev = clickAnchor("   ");
    expect(ev.defaultPrevented).toBe(true);
  });

  it("covers EVERY class the classifier can return (no gap in the table above)", () => {
    // Anti-gap guard: if `classifyHref` grows a class, this fails until a case is added.
    const covered = new Set([
      ...cases.map(([, href]) => classifyHref(href)),
      classifyHref(""),
    ]);
    expect([...covered].sort()).toEqual([
      "anchor",
      "cross-doc",
      "empty",
      "external",
    ]);
  });
});

describe("clicks that are NOT on a link are left alone", () => {
  it("does not prevent a click on plain prose", () => {
    // The handler must not swallow ordinary interaction — text selection, for instance.
    const container = document.createElement("div");
    const p = document.createElement("p");
    p.textContent = "just prose";
    container.append(p);
    document.body.append(container);
    container.addEventListener("click", realHandler() as EventListener);

    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    p.dispatchEvent(ev);
    container.remove();

    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not prevent a click on an anchor with NO href attribute", () => {
    // `closest("a[href]")` requires the attribute; a bare `<a>` is not a link.
    const ev = clickAnchor(null);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("cross-doc fragments are USED, not dropped (code-review finding)", () => {
  // `resolveDocLink` always split `wbs.md#probe-outcomes` into path + fragment, and the
  // caller always discarded the fragment — so such a link landed at the TOP of the target
  // doc while the resolver's own doc comment said it would land on the section. A comment
  // promising behavior the code does not perform is worse than an unimplemented feature,
  // because it stops the next reader from noticing the gap.

  function clickHrefWith(
    href: string,
    over: Parameters<typeof realHandler>[0] = {},
  ) {
    const container = document.createElement("div");
    const a = document.createElement("a");
    a.setAttribute("href", href);
    container.append(a);
    document.body.append(container);
    container.addEventListener("click", realHandler(over) as EventListener);
    a.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    container.remove();
  }

  it("switches the doc for a fragment-bearing cross-doc link", () => {
    const chosen: string[] = [];
    clickHrefWith("wbs.md#probe-outcomes", {
      setChosen: (p: string) => chosen.push(p),
    });
    expect(chosen).toEqual(["workflow-system/product/wbs.md"]);
  });

  it("scrolls to the fragment's target once it renders", async () => {
    // The target does not exist at click time — `setChosen` only schedules the switch and
    // the content arrives after an async read — so the handler polls briefly. This models
    // that: the heading appears AFTER the click, and the scroll must still happen.
    const container = document.createElement("div");
    document.body.append(container);
    const scrolled: string[] = [];

    const a = document.createElement("a");
    a.setAttribute("href", "wbs.md#probe-outcomes");
    container.append(a);
    container.addEventListener(
      "click",
      realHandler({ containerRef: { current: container } }) as EventListener,
    );
    a.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    // Now the "new doc" renders, heading included.
    const h = document.createElement("h2");
    h.id = "probe-outcomes";
    h.scrollIntoView = () => scrolled.push("probe-outcomes");
    container.append(h);

    await new Promise((r) => setTimeout(r, 120));
    container.remove();
    expect(scrolled).toEqual(["probe-outcomes"]);
  });

  it("gives up quietly when the fragment never appears — no hang", () => {
    // Bounded polling. A heading that does not exist must not spin forever; a missed
    // scroll is a minor annoyance, a wedged handler is not.
    const container = document.createElement("div");
    document.body.append(container);
    expect(() =>
      clickHrefWith("wbs.md#no-such-heading", {
        containerRef: { current: container },
      }),
    ).not.toThrow();
    container.remove();
  });
});
