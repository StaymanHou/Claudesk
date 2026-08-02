// @vitest-environment jsdom
//
// ⚠️ This file needs a DOM environment for ONE reason: `anchorSelector` calls `CSS.escape`,
// a browser global that does not exist in Vitest's default `node` environment (the
// assertions failed with `ReferenceError: CSS is not defined` before this line). Scoped to
// this file with the per-file pragma rather than flipping the project-wide default, which
// would slow all 136 test files to serve one. jsdom is already a dev dependency (added for
// the render tests), so this costs no new package.
import { describe, expect, it } from "vitest";
import { anchorSelector, classifyHref } from "../docs/classifyHref";
import { normalizePath, resolveDocLink } from "../docs/resolveDocLink";
import type { DocEntry } from "../docsOrder";

// M11 WP3 P2.3/P2.4 — link classification + cross-doc resolution.
//
// The classifier's ordering was validated at WP1 against 8 real link shapes. The case
// worth reading before touching it is the protocol-relative one (`//host`): it is EXTERNAL
// but has no scheme, so the obvious `startsWith("http")` predicate routes it into the
// local-file path. That has its own named test below.

const doc = (rel_path: string, kind: string): DocEntry => ({
  rel_path,
  kind,
  file_name: rel_path.slice(rel_path.lastIndexOf("/") + 1),
  mtime_ms: 0,
});

const SET: DocEntry[] = [
  doc("workflow-system/product/vision.md", "vision"),
  doc("workflow-system/product/wbs.md", "wbs"),
  doc("workflow-system/product/roadmap.md", "roadmap"),
  doc("workflow-system/state/backlog.md", "backlog"),
  doc("workflow-system/state/wip/feature-a.md", "wip"),
];

describe("classifyHref — WP1's 8 validated shapes", () => {
  it("classifies in-doc anchors", () => {
    expect(classifyHref("#heading")).toBe("anchor");
    expect(classifyHref("#probe-outcomes")).toBe("anchor");
  });

  it("classifies relative paths as cross-doc", () => {
    expect(classifyHref("wbs.md")).toBe("cross-doc");
    expect(classifyHref("workflow-system/product/roadmap.md")).toBe(
      "cross-doc",
    );
    expect(classifyHref("wbs.md#frag")).toBe("cross-doc");
    expect(classifyHref("../state/backlog.md")).toBe("cross-doc");
  });

  it("classifies absolute schemes as external", () => {
    expect(classifyHref("https://example.com")).toBe("external");
    expect(classifyHref("http://example.com")).toBe("external");
    expect(classifyHref("mailto:someone@example.com")).toBe("external");
  });

  it("⚠️ classifies PROTOCOL-RELATIVE `//host` as external", () => {
    // The trap. It has no scheme, so it looks relative to a naive check — but it is a real
    // external URL. Misrouting it means asking the backend to read `//evil.example.com` as
    // a local path.
    expect(classifyHref("//evil.example.com")).toBe("external");
    expect(classifyHref("//example.com/path")).toBe("external");
  });

  it('REGRESSION: the predicate is NOT `startsWith("http")`', () => {
    // Naming the wrong implementation in a test, so a "simplification" back to it fails
    // here rather than shipping. Both of these break under the naive check: the first is
    // external without starting with http, the second STARTS with "http" but is a
    // perfectly ordinary relative filename.
    expect(classifyHref("//evil.example.com")).toBe("external");
    expect(classifyHref("http-notes.md")).toBe("cross-doc");
  });

  it("does not mistake a colon inside a relative path for a scheme", () => {
    // RFC 3986: a scheme's colon must precede any `/`. `docs/a:b.md` is a legal filename.
    expect(classifyHref("docs/a:b.md")).toBe("cross-doc");
    expect(classifyHref("notes/12:30-standup.md")).toBe("cross-doc");
  });

  it("treats empty/whitespace hrefs as not actionable", () => {
    expect(classifyHref("")).toBe("empty");
    expect(classifyHref("   ")).toBe("empty");
  });

  it("routes `javascript:` to external — never to the webview", () => {
    // Belt-and-braces: the renderer already strips these before they reach the DOM
    // (docsRender.test.tsx). If one ever survived, `external` means "hand to openUrl",
    // which is still not "navigate this webview".
    expect(classifyHref("javascript:alert(1)")).toBe("external");
  });
});

describe("resolveDocLink — relative to the doc it appears in", () => {
  it("resolves a sibling link against the source doc's directory", () => {
    // `wbs.md` inside product/vision.md means product/wbs.md, not root-level wbs.md.
    expect(
      resolveDocLink("wbs.md", "workflow-system/product/vision.md", SET),
    ).toEqual({
      kind: "found",
      relPath: "workflow-system/product/wbs.md",
      fragment: null,
    });
  });

  it("resolves a `../` link across directories", () => {
    expect(
      resolveDocLink(
        "../state/backlog.md",
        "workflow-system/product/vision.md",
        SET,
      ),
    ).toEqual({
      kind: "found",
      relPath: "workflow-system/state/backlog.md",
      fragment: null,
    });
  });

  it("splits a #fragment off so the caller can scroll after switching", () => {
    // `wbs.md#probe-outcomes` should land on the section, not merely open the file.
    expect(
      resolveDocLink(
        "wbs.md#probe-outcomes",
        "workflow-system/product/vision.md",
        SET,
      ),
    ).toEqual({
      kind: "found",
      relPath: "workflow-system/product/wbs.md",
      fragment: "probe-outcomes",
    });
  });

  it("falls back to a ROOT-relative reading when source-relative misses", () => {
    // Real docs are inconsistent about this; trying both is what makes real links work.
    // Here the source doc is at the root, so only the root reading can hit.
    expect(
      resolveDocLink("workflow-system/product/wbs.md", "CLAUDE.md", SET),
    ).toEqual({
      kind: "found",
      relPath: "workflow-system/product/wbs.md",
      fragment: null,
    });
  });

  it("reports not-in-set for a real file that is not a discovered doc", () => {
    // `CHANGELOG.md` exists on disk but is deliberately excluded from discovery. The
    // caller must be able to say so rather than silently doing nothing on click.
    const r = resolveDocLink(
      "../../CHANGELOG.md",
      "workflow-system/product/vision.md",
      SET,
    );
    expect(r.kind).toBe("not-in-set");
  });

  it("never SURFACES a root-escaping path — the lookup fails closed", () => {
    // What is observable from out here: the escaped string never appears in `attempted`,
    // and the link resolves to nothing. ⚠️ This does NOT prove the clamp — see the
    // dedicated `normalizePath` block below for why, and for the test that does.
    const r = resolveDocLink("../../etc/passwd", "CLAUDE.md", SET);
    expect(r.kind).toBe("not-in-set");
    if (r.kind === "not-in-set") {
      expect(r.attempted).not.toContain("..");
    }
  });

  it("CLAMPS from a nested source doc too (surplus `..` beyond the prefix)", () => {
    // The original scenario, kept — but it is only meaningful ALONGSIDE the root-level
    // case above, which is what actually distinguishes clamped from unclamped.
    const r = resolveDocLink(
      "../../../../../../etc/passwd",
      "workflow-system/product/vision.md",
      SET,
    );
    expect(r.kind).toBe("not-in-set");
    if (r.kind === "not-in-set") {
      expect(r.attempted).toBe("etc/passwd");
    }
  });

  it("collapses `./` segments", () => {
    expect(
      resolveDocLink("./wbs.md", "workflow-system/product/vision.md", SET),
    ).toEqual({
      kind: "found",
      relPath: "workflow-system/product/wbs.md",
      fragment: null,
    });
  });

  it("does not mutate the doc set", () => {
    const snapshot = JSON.stringify(SET);
    resolveDocLink("wbs.md", "workflow-system/product/vision.md", SET);
    expect(JSON.stringify(SET)).toBe(snapshot);
  });
});

describe("normalizePath — the root-escape CLAMP, tested directly", () => {
  // ⚠️ WHY THIS IS TESTED AGAINST THE PRIVATE HELPER RATHER THAN `resolveDocLink`.
  //
  // The clamp is UNOBSERVABLE through the public function. `resolveDocLink` normalizes
  // BOTH candidates and reports `attempted` from a normalized value, so clamped and
  // unclamped builds produce identical output for every input. A test that drove the
  // outer function and asserted `attempted` contained no `..` therefore passed with the
  // clamp deleted — measured, with the mutation verified landed, at Phase 2 verify-self.
  // That test was named for the clamp and did not test it.
  //
  // The lesson generalizes: when a guard's effect is swallowed by a later stage of the
  // same pipeline, the only honest test is one that calls the guard directly. Widening
  // the outer test's inputs cannot fix an output that is invariant by construction.

  it("clamps leading `..` that would escape the root", () => {
    // Unclamped these would yield `../etc/passwd` and `../../etc/passwd`.
    expect(normalizePath("../etc/passwd")).toBe("etc/passwd");
    expect(normalizePath("../../etc/passwd")).toBe("etc/passwd");
    expect(normalizePath("../../../../../../etc/passwd")).toBe("etc/passwd");
  });

  it("still resolves `..` that stays WITHIN the tree", () => {
    // The clamp must not break legitimate upward navigation, which is what real
    // cross-directory doc links use.
    expect(normalizePath("workflow-system/product/../state/backlog.md")).toBe(
      "workflow-system/state/backlog.md",
    );
  });

  it("collapses `.` and empty segments", () => {
    expect(normalizePath("./a//b/./c.md")).toBe("a/b/c.md");
  });
});

describe("anchorSelector — in-doc anchor targeting (operator-verified live)", () => {
  // The scroll itself needs a live DOM (operator confirmed it at Phase 2 verify-human:
  // scrolls WITHIN the panel, app shell unmoved). What IS unit-testable, and where the
  // real bug hides, is the SELECTOR this builds from a fragment.

  it("builds a plain id selector for a simple fragment", () => {
    expect(anchorSelector("#probe-outcomes")).toBe("#probe-outcomes");
  });

  it("⚠️ escapes a LEADING DIGIT — an unescaped one makes querySelector THROW", () => {
    // Not a formatting nicety. `## 3. The path` yields id "3-the-path"; `#3-the-path` is
    // an invalid CSS selector, and querySelector raises SyntaxError rather than returning
    // null — which would take down the whole delegated click handler, not just the scroll.
    const sel = anchorSelector("#3-the-path");
    expect(sel).not.toBe("#3-the-path");
    expect(() => document.querySelector(sel)).not.toThrow();
  });

  it("escapes characters that markdown headings genuinely produce", () => {
    // Dots, colons and parentheses all survive slugification in real docs and are all
    // selector metacharacters. Each must resolve to a literal match, not a combinator.
    for (const frag of ["#a.b", "#a:b", "#a(b)", "#a>b", "#a b"]) {
      expect(() => document.querySelector(anchorSelector(frag))).not.toThrow();
    }
  });

  it("tolerates a fragment passed without its leading `#`", () => {
    // The handler strips `#` before calling, but the function must not silently produce
    // `##foo` if a future caller passes the bare slug.
    expect(anchorSelector("probe-outcomes")).toBe("#probe-outcomes");
  });
});
