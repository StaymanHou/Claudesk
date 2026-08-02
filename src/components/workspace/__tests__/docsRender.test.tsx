// @vitest-environment jsdom
//
// ⚠️ Needed for `CSS.escape`, a browser global absent from Vitest's default `node`
// environment (`ReferenceError: CSS is not defined`). Note the file ALSO constructs its own
// JSDOM instances via `renderDom` — that is for parsing rendered HTML strings and does not
// install the browser globals this pragma provides. Scoped per-file rather than flipping
// the project default. Same reasoning as docLinks.test.ts.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { DocMarkdown } from "../docs/DocMarkdown";
import { anchorSelector, headingSlug } from "../docs/classifyHref";

// M11 WP3 — the markdown render, pinned as a VALUE.
//
// ── Why `renderToStaticMarkup` and not a component-render harness ───────────────
// `DocMarkdown` is a pure function of its `source` prop (no hooks, no IPC, no state), so
// its output is a string. `react-dom/server` already ships with the installed `react-dom`,
// which is what lets WP3 pin the render without adopting @testing-library/react and
// without re-opening SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS. WP1 verified
// this approach resolvable before the WP started.
//
// ── ⚠️ Why every assertion parses the DOM instead of matching source text ───────
// WP1's first danger predicate used source-text regexes and produced FALSE POSITIVES: it
// counted the fixture's own heading prose ("3. `javascript:` URL in a markdown link") and
// `&lt;`-escaped INERT text as live vectors. Escaped text is exactly what safe output
// looks like, so a substring match cannot tell success from failure here. Every check
// below therefore parses with jsdom and queries the resulting tree. This is the same
// class as the `?raw`-guard trap in CLAUDE.md, and it is why jsdom is a dev dependency.

/** Render a doc and return its parsed document body for querying. */
function renderDom(source: string): Document {
  const html = renderToStaticMarkup(<DocMarkdown source={source} />);
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe("DocMarkdown — GFM and structural fidelity", () => {
  it("renders a GFM table as a real <table>", () => {
    const doc = renderDom("| a | b |\n|---|---|\n| 1 | 2 |\n");
    const table = doc.querySelector("table");
    expect(table).not.toBeNull();
    // Header + one body row, so the pipe syntax was parsed rather than shown literally.
    expect(doc.querySelectorAll("th")).toHaveLength(2);
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("renders a fenced code block as <pre><code>, preserving its text", () => {
    const doc = renderDom("```rust\nfn main() {}\n```\n");
    const code = doc.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("fn main() {}");
  });

  it("renders Work-Tree task lists as checkboxes, with checked state preserved", () => {
    // The WIP Work-Tree format is the single most common thing this panel will show, and
    // `- [x]` vs `- [ ]` is the information a reader is actually after.
    const doc = renderDom("- [ ] P1.1 not started\n- [x] P1.2 done\n");
    const boxes = doc.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it("renders task-list checkboxes as READ-ONLY (disabled), never interactive", () => {
    // The viewer never writes to disk (WBS task 3.5). A live checkbox would imply it does.
    const box = renderDom("- [ ] a task\n").querySelector(
      'input[type="checkbox"]',
    );
    expect(box?.hasAttribute("disabled")).toBe(true);
  });

  it("renders headings as real heading elements", () => {
    const doc = renderDom("# Title\n\n## Section\n");
    expect(doc.querySelector("h1")?.textContent).toBe("Title");
    expect(doc.querySelector("h2")?.textContent).toBe("Section");
  });
});

describe("DocMarkdown — frontmatter", () => {
  const withFm =
    "---\nshape: wip\ndrive_mode: autopilot\n---\n# Title\n\nBody.\n";

  it("shows the YAML block in its own header element", () => {
    const doc = renderDom(withFm);
    const fm = doc.querySelector('[data-testid="doc-frontmatter"]');
    expect(fm).not.toBeNull();
    expect(fm?.textContent).toContain("drive_mode: autopilot");
  });

  it("does NOT mangle the block into an <hr> + setext <h2> (the WP1-measured failure)", () => {
    // Left to the renderer, `---\nkey: v\n---` becomes a horizontal rule followed by an
    // <h2> made of YAML keys. That is the entire reason `stripFrontmatter` exists, so it
    // is asserted on the rendered output rather than trusted from the unit test.
    const doc = renderDom(withFm);
    expect(doc.querySelector(".doc-markdown-body hr")).toBeNull();
    const headings = [...doc.querySelectorAll(".doc-markdown-body h2")].map(
      (h) => h.textContent ?? "",
    );
    expect(headings.some((t) => t.includes("drive_mode"))).toBe(false);
    // The real body heading still renders — the split removed the block, not the content.
    expect(doc.querySelector(".doc-markdown-body h1")?.textContent).toBe(
      "Title",
    );
  });

  it("renders no frontmatter element for a doc that has none", () => {
    const doc = renderDom("# Just a title\n");
    expect(doc.querySelector('[data-testid="doc-frontmatter"]')).toBeNull();
  });
});

// ── The security fixture ────────────────────────────────────────────────────────
//
// 11 sections, mirroring the hostile fixture WP1 measured against (expanded from 8 at
// WP1's verify-self when the predicate was found to miss the style-ATTRIBUTE class).
// Scored on the PARSED DOM, never on source text.
const HOSTILE = `# Hostile fixture

<script>window.__pwned = 1</script>

<iframe src="https://evil.example.com"></iframe>

<img src="x" onerror="window.__pwned = 1">

<div onclick="window.__pwned = 1">click me</div>

[a javascript link](javascript:window.__pwned=1)

<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=">

<style>body { display: none }</style>

<div style="background:url(javascript:alert(1))">styled</div>

<div style="width:expression(alert(1))">styled</div>

<object data="https://evil.example.com"></object>

<embed src="https://evil.example.com">

<svg><a xlink:href="javascript:alert(1)"><text>svg link</text></a></svg>

<math><mtext></mtext></math>

<form action="https://evil.example.com"><button formaction="https://evil.example.com">go</button></form>

<base href="https://evil.example.com/">

<meta http-equiv="refresh" content="0;url=https://evil.example.com">

<link rel="stylesheet" href="https://evil.example.com/x.css">

[case-mixed scheme](JaVaScRiPt:alert(1))
`;

/**
 * Count LIVE danger vectors in a rendered document.
 *
 * Deliberately probes each distinct class WP1 identified, INCLUDING the style-attribute
 * class its first corrected predicate still missed — that omission made a "0 danger"
 * result under-determined, because it passed only thanks to a config option the predicate
 * could not see. A predicate that cannot detect the thing it is claiming is absent proves
 * nothing.
 */
function liveVectors(doc: Document): string[] {
  const found: string[] = [];
  const add = (label: string, n: number) => {
    if (n > 0) found.push(`${label}:${n}`);
  };

  add("script", doc.querySelectorAll("script").length);
  add("iframe", doc.querySelectorAll("iframe").length);
  add("object", doc.querySelectorAll("object").length);
  add("embed", doc.querySelectorAll("embed").length);
  add("style-tag", doc.querySelectorAll("style").length);
  // Added at verify-self after a reviewer noted the predicate could not SEE these classes.
  // The renderer does strip them today — but an unprobed class is precisely what made
  // WP1's own predicate under-determined ("0 danger" passing only because of a config
  // option it could not detect). A probe that cannot fail proves nothing about the class.
  add("svg", doc.querySelectorAll("svg").length);
  add("math", doc.querySelectorAll("math").length);
  add("form", doc.querySelectorAll("form").length);
  add("base", doc.querySelectorAll("base").length);
  add("meta", doc.querySelectorAll("meta").length);
  add("link", doc.querySelectorAll("link").length);
  // Submission hijack + SVG's namespaced href, neither of which is an `on*` attribute.
  add("formaction", doc.querySelectorAll("[formaction]").length);
  add(
    "xlink",
    [...doc.querySelectorAll("*")].filter((el) =>
      [...el.attributes].some((a) => a.name.toLowerCase().startsWith("xlink:")),
    ).length,
  );

  // Any inline event handler on any element (onerror/onclick/onload/…).
  const handlers = [...doc.querySelectorAll("*")].filter((el) =>
    [...el.attributes].some((a) => a.name.toLowerCase().startsWith("on")),
  );
  add("event-handler", handlers.length);

  // ⚠️ The style-ATTRIBUTE probe. CSS can execute (`url(javascript:…)`,
  // `expression(…)`) and a sanitizer that allows the attribute does not parse the CSS.
  add("style-attr", doc.querySelectorAll("[style]").length);

  // `javascript:` in any href/src, and `data:` URIs (WP1: a base64 SVG payload decoding
  // to `<svg onload=…>` survives DOMPurify's defaults entirely).
  const urls = [...doc.querySelectorAll("[href],[src],[data]")].filter((el) => {
    const v = (
      el.getAttribute("href") ??
      el.getAttribute("src") ??
      el.getAttribute("data") ??
      ""
    )
      .replace(/\s+/g, "")
      .toLowerCase();
    return v.startsWith("javascript:") || v.startsWith("data:");
  });
  add("dangerous-uri", urls.length);

  return found;
}

describe("DocMarkdown — security under `csp: null` (the load-bearing tests)", () => {
  it("renders the hostile fixture with ZERO live vectors", () => {
    // ⚠️ SCOPE OF THIS TEST, measured at verify-self rather than assumed — read before
    // treating it as the `rehype-raw` guard. Three configurations were run against this
    // fixture, each mutation confirmed landed in executable code:
    //
    //   rehype-raw + rehype-sanitize → 0 vectors  ← this test PASSES
    //   rehype-raw alone             → 6 vectors  ← this test FAILS
    //   neither plugin               → 0 vectors  ← this test PASSES
    //
    // The two controls are REDUNDANT, not layered, so this assertion does NOT catch
    // someone adding `rehype-raw` while leaving the sanitizer in place. That case is
    // caught by `docsRenderDeps.test.ts`, which pins the dependency's absence directly.
    // What this test does prove: whatever the pipeline is, its OUTPUT is clean.
    expect(liveVectors(renderDom(HOSTILE))).toEqual([]);
  });

  it("NEGATIVE CONTROL — the predicate detects vectors when they are genuinely present", () => {
    // Without this, "0 vectors" is under-determined: a predicate that can never fire
    // would report a perfect score against anything. WP1 paid for this lesson twice, so
    // the control is a first-class test rather than a comment.
    const raw = new JSDOM(`<!doctype html><body>${HOSTILE}</body>`).window
      .document;
    const vectors = liveVectors(raw);
    expect(vectors.length).toBeGreaterThan(0);
    // Every class the predicate claims to cover must actually fire on the raw fixture —
    // otherwise a silently-broken probe hides inside a passing aggregate.
    const kinds = vectors.map((v) => v.split(":")[0]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "script",
        "iframe",
        "object",
        "embed",
        "style-tag",
        "event-handler",
        "style-attr",
        "dangerous-uri",
        // The classes added at verify-self. Listing them here is what keeps them honest:
        // a probe whose shape is missing from the fixture would report 0 forever and be
        // indistinguishable from a probe that works.
        "svg",
        "math",
        "form",
        "base",
        "meta",
        "link",
        "formaction",
        "xlink",
      ]),
    );
  });

  it("STRIPS raw HTML tags, keeping only their inner text (measured, not assumed)", () => {
    // ⚠️ This pins the ACTUAL behavior, which is not the one you would guess. The obvious
    // assumption — "raw HTML is escaped and shows up as visible `<script>` text" — is
    // WRONG and was measured wrong here before being corrected:
    //
    //   "<script>evil()</script>"          → ""              (block-level: gone entirely)
    //   "Inline <b>bold</b> and <script>x</script> text" → "Inline bold and x text"
    //
    // So tags are REMOVED and their text content is KEPT. Two consequences worth knowing:
    // it is safe (no element is ever constructed, which is the property that matters under
    // `csp: null`), but the *contents* of an inline <script> can surface as ordinary prose.
    // Harmless for workflow docs; surprising if you expected escaped source text.
    const blockDoc = renderDom("<script>evil()</script>\n");
    expect(blockDoc.querySelector("script")).toBeNull();
    expect(blockDoc.body.textContent?.trim()).toBe("");

    const inlineDoc = renderDom(
      "Inline <b>bold</b> and <script>x</script> text\n",
    );
    expect(inlineDoc.querySelector("script")).toBeNull();
    expect(inlineDoc.querySelector("b")).toBeNull();
    expect(inlineDoc.body.textContent).toBe("Inline bold and x text");
  });

  it("keeps a `javascript:` markdown link from becoming a live href", () => {
    const doc = renderDom("[click](javascript:alert(1))\n");
    const a = doc.querySelector("a");
    // Either the href is stripped by the sanitizer or the anchor is not emitted at all;
    // what must never happen is a live `javascript:` href.
    expect(a?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("PRESERVES benign links — safety must not cost cross-doc navigation", () => {
    // WP1 measured that no candidate config stripped these. WP3's link navigation depends
    // on them surviving, so a sanitizer tightened later must fail here rather than
    // silently breaking navigation.
    const doc = renderDom(
      "[cross](wbs.md) [anchor](#heading) [ext](https://example.com)\n",
    );
    const hrefs = [...doc.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["wbs.md", "#heading", "https://example.com"]);
  });
});

describe("DocMarkdown — re-render idempotence (WP4 depends on this)", () => {
  it("produces identical output for the same input across alternating renders", () => {
    // Asserted as a PROPERTY, never as a byte count: WP1's fixture was a live repo file
    // that grew while the probe ran, so any literal size would be a landmine.
    const a = "# Doc A\n\n- [x] done\n";
    const b = "# Doc B\n\n| x | y |\n|---|---|\n| 1 | 2 |\n";
    const first = renderToStaticMarkup(<DocMarkdown source={a} />);
    renderToStaticMarkup(<DocMarkdown source={b} />);
    const again = renderToStaticMarkup(<DocMarkdown source={a} />);
    expect(again).toBe(first);
  });
});

describe("`[[slug]]` links render as INERT TEXT (operator-accepted, WP3 P2.5)", () => {
  // WP1 measured that the chosen renderer emits `[[slug]]` as literal text with NO <a>
  // element, so the delegated click handler structurally cannot see it. WP3 decided to
  // LEAVE IT THAT WAY rather than add a remark plugin — not on cost, but because these
  // slugs resolve to `.claude/memory/*.md`, which is NOT in the curated doc set. A plugin
  // would manufacture links that all fail with "not one of this project's workflow docs",
  // which is strictly worse than plain text that at least reads correctly.
  //
  // Operator accepted this at Phase 2 verify-human (2026-08-02). Pinned here so the
  // behavior cannot change silently — if someone adds a plugin, this test fails and forces
  // the decision (and the doc-set question behind it) to be re-opened deliberately.

  it("emits no anchor for a `[[slug]]` reference", () => {
    const doc = renderDom(
      "See [[verify-the-mutation-landed]] for the method.\n",
    );
    expect(doc.querySelector("a")).toBeNull();
  });

  it("keeps the slug READABLE as text, brackets and all", () => {
    // The whole justification for leaving them inert is that they still read fine. If a
    // future change swallowed the text instead of linking it, that justification would be
    // false — and this asserts the text survives.
    const doc = renderDom(
      "See [[verify-the-mutation-landed]] for the method.\n",
    );
    expect(doc.body.textContent).toContain("[[verify-the-mutation-landed]]");
  });

  it("still renders REAL markdown links in the same document", () => {
    // Guards the obvious over-correction: suppressing `[[slug]]` must not suppress
    // ordinary links sitting beside it.
    const doc = renderDom("See [[a-memory]] and [the wbs](wbs.md).\n");
    const hrefs = [...doc.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["wbs.md"]);
    expect(doc.body.textContent).toContain("[[a-memory]]");
  });
});

describe("heading ids — in-doc anchors need a TARGET, not just a selector", () => {
  // ⚠️ THIS IS THE TEST THAT WAS MISSING. `react-markdown` emits NO heading `id`s by
  // default, so every `#anchor` link in a doc was a dead click. Found LIVE at Phase 3
  // verify-self (MCP bridge, real app) — the unit tests could not catch it because they
  // asserted `anchorSelector` produced a well-formed SELECTOR and never that the document
  // contained anything to select. Testing one half of a lookup proves nothing about the
  // lookup.
  //
  // The assertion shape below is deliberately end-to-end within the render: build the
  // selector the click handler would build, and require it to MATCH a real element in the
  // rendered output.

  it("emits an id on every heading level", () => {
    const doc = renderDom("# One\n\n## Two\n\n### Three\n\n#### Four\n");
    const ids = [...doc.querySelectorAll("h1,h2,h3,h4")].map((h) => h.id);
    expect(ids).toEqual(["one", "two", "three", "four"]);
  });

  it("⚠️ the handler's selector actually FINDS the heading (the real contract)", () => {
    // Exactly what the click handler does: classify → build selector → query. If any link
    // in that chain breaks, this fails, whereas a selector-only test would not.
    const doc = renderDom("## Probe outcomes\n\nBody.\n");
    const target = doc.querySelector(anchorSelector("#probe-outcomes"));
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("Probe outcomes");
  });

  it("matches the slug a markdown author would write by hand", () => {
    // GitHub's algorithm is what authors link against, so the slug must agree with it.
    expect(headingSlug("Probe outcomes")).toBe("probe-outcomes");
    expect(headingSlug("3. The 90% path")).toBe("3-the-90-path");
    expect(headingSlug("Work Tree")).toBe("work-tree");
  });

  it("round-trips a heading with punctuation through slug → selector → lookup", () => {
    // The leading-digit + punctuation case that makes CSS.escape load-bearing, verified
    // end-to-end rather than in two disconnected halves.
    const doc = renderDom("## 3. The 90% path\n");
    const target = doc.querySelector(anchorSelector("#3-the-90-path"));
    expect(target).not.toBeNull();
  });

  it("keeps heading TEXT unchanged — ids are additive", () => {
    const doc = renderDom("## Probe outcomes\n");
    expect(doc.querySelector("h2")?.textContent).toBe("Probe outcomes");
  });
});

describe("RAW HTML IS BLOCKED — the operator's stated rule (2026-08-02)", () => {
  // ⚠️ This is a stronger and more direct claim than the hostile-fixture test above, and
  // it is deliberately separate from it. That test asserts "0 LIVE VECTORS" — it would
  // still pass if someone enabled raw HTML but only benign tags happened to survive a
  // sanitizer. THIS test asserts the rule the operator actually stated: **no raw HTML
  // element from document content is ever constructed**, dangerous or not.
  //
  // Markdown deliberately permits raw HTML (CommonMark spec — it is why GitHub renders
  // `<details>` and `<img>` in READMEs), so this is NOT the format's default behavior. It
  // holds because `react-markdown` escapes raw HTML unless `rehype-raw` is added. Measured
  // both ways at Phase 3: with `rehype-raw` a plain `.md` yields a live `<script>` with
  // executable content; without it, zero.
  //
  // The distinction that makes this test worth having: it fails for BENIGN tags too. A
  // future change that admits `<details>` "just for collapsible sections" trips this,
  // which is the intended outcome — the operator's rule is no raw HTML, not no dangerous
  // raw HTML.

  const RAW = `# Doc

<script>evil()</script>

<img src="x" onerror="alert(1)">

<iframe src="https://evil.example.com"></iframe>

<details><summary>benign, still blocked</summary>hidden</details>

<b>bold via html</b>

\`\`\`js
const fence = "<script>display only</script>";
\`\`\`
`;

  it("constructs NO element from raw HTML — including benign tags", () => {
    const doc = renderDom(RAW);
    for (const tag of ["script", "img", "iframe", "details", "summary", "b"]) {
      expect(
        doc.querySelectorAll(tag).length,
        `<${tag}> from raw HTML must not be constructed — the rule is no raw HTML at ` +
          `all, not merely no dangerous raw HTML`,
      ).toBe(0);
    }
  });

  it("still renders a fenced code block containing HTML as TEXT", () => {
    // The complement, and the reason the rule is safe to hold: `<script>` inside a code
    // fence is display content and must survive intact. Blocking raw HTML must not cost
    // the ability to DOCUMENT html.
    const doc = renderDom(RAW);
    const code = doc.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain('"<script>display only</script>"');
  });

  it("still renders ordinary markdown around the blocked HTML", () => {
    // Guards the over-correction: blocking raw HTML must not swallow the document.
    const doc = renderDom(RAW);
    expect(doc.querySelector("h1")?.textContent).toBe("Doc");
  });
});
