// @vitest-environment jsdom
//
// M11 WP3 Phase 3 — the "webview must never navigate" invariant, proved BEHAVIORALLY.
//
// ── Why this file exists ────────────────────────────────────────────────────────
// A `?raw` source-order guard claimed to pin this invariant and PASSED while the invariant
// was violated. It compared the source positions of `preventDefault()` and the `external`
// branch — an ordering check against one named downstream branch, structurally blind to an
// `if (kind === "empty") return;` that sat ABOVE the call. Markdown `[click]()` renders a
// live `<a href="">` (measured: it survives the sanitizer), which took that early return
// with the click still cancelable. In a WKWebView an empty href navigates to the current
// URL — an app-shell reload, and Claudesk's window has no back button.
//
// A source guard can only compare the positions you thought to name; it cannot see a third
// statement you did not. So the invariant is asserted here the only way that is honest:
// dispatch a REAL click at a REAL anchor and read `defaultPrevented` off the event.
//
// ⚠️ This deliberately re-implements the handler's GUARD ORDER rather than importing the
// component (no component-render harness in this repo — SURFACE-2026-07-31). That is a
// known limitation: the copy could drift from `DocsPanel`. The companion structural arm in
// `docsPanelWiring.test.ts` is what catches drift — it asserts no `return` precedes
// `preventDefault` in the real handler. Neither test is sufficient alone; together they
// cover order-in-source and behavior-on-click.

import { describe, expect, it } from "vitest";
import { classifyHref } from "../docs/classifyHref";

/**
 * The handler's guard order, mirroring `DocsPanel.onContentClick`'s opening.
 *
 * The property under test is that `preventDefault()` runs for EVERY anchor click,
 * regardless of how the href classifies — including classes that are then ignored.
 */
function handleClick(e: Event): { classified: string | null } {
  // Typed `Event`, not `MouseEvent`: the handler reads only `target` and `preventDefault`,
  // which both live on `Event`. Narrowing to MouseEvent would need a cast at every
  // addEventListener site and would overstate what the guard order depends on.
  const anchor = (e.target as HTMLElement).closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return { classified: null };

  const href = anchor.getAttribute("href") ?? "";
  e.preventDefault(); // FIRST — before classification, before any early return.
  const kind = classifyHref(href);
  if (kind === "empty") return { classified: kind };
  return { classified: kind };
}

/** Render an anchor into a container and click it, returning the dispatched event. */
function clickAnchor(hrefAttr: string | null): MouseEvent {
  const container = document.createElement("div");
  const a = document.createElement("a");
  if (hrefAttr !== null) a.setAttribute("href", hrefAttr);
  a.textContent = "click";
  container.append(a);
  document.body.append(container);
  container.addEventListener("click", handleClick);

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
    container.addEventListener("click", handleClick);

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
