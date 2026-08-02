import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import docsPanelSource from "../docs/DocsPanel.tsx?raw";
import hostSource from "../RightPanelHost.tsx?raw";

// M11 WP3 verify-codify — the WIRING invariants behind the two behaviors the operator
// approved manually that no other test covers: the panel's LAYOUT contract (which WP4
// depends on) and its LAZY mount (the bundle-size win).
//
// This also discharges SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-HAS-NO-WIRING-TEST, whose
// pickup shape said "fold into WP3, which touches this component anyway".
//
// ── Why `?raw` here, when this repo keeps warning about `?raw` guards ───────────
// The behaviors below are STRUCTURAL (which module is imported, which command name crosses
// IPC, which element owns the scroll box). There is no component-render harness in this
// repo (SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS, 133 test files, none renders
// a component), and the live proof is Phase 3's MCP-bridge pass. So `?raw` is the right
// tier — but it is used under this WP's hard-won rules:
//
//   1. COMMENTS ARE STRIPPED before matching. A guard asserting a bare identifier is
//      otherwise satisfied by the module's own prose, so it passes exactly when the code
//      it names has been deleted ([[raw-guard-identifier-satisfied-by-own-comments]]).
//      This file's own header would satisfy half these assertions unstripped.
//   2. Assert CALL SHAPES (`invoke("docs_read"`), never bare identifiers.
//   3. Anything involving ordering, async, or React lifecycle is NOT tested here — it is
//      a pure function elsewhere (`fetchLatch.ts`, `panelHost.ts`, `docsOrder.ts`). That
//      split is exactly what the StrictMode blank-panel bug taught: a source-text guard
//      cannot see execution order.

/** Source with comments removed — see rule 1 above.
 *
 * ⚠️ The line-comment pattern is `\/\/.*$` and NOT `^\s*\/\/.*$`. The anchored version
 * only strips comments that BEGIN a line, so a trailing `const x = 1; // docs_read` keeps
 * its prose — which silently defeats the whole point of stripping. That was the first
 * draft here, and its own meta-test caught it.
 *
 * A URL's `//` is not a concern in these two files (no string literals contain one), and
 * the meta-test below pins that the stripper actually strips rather than no-op'ing.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments (incl. JSX /* */ bodies)
    .replace(/\/\/.*$/gm, " "); // line comments, including trailing ones
}

/** CSS with block comments removed.
 *
 * Needed for the same reason: `.docs-panel`'s rule carries a comment WARNING against
 * `overflow-y: auto`, so a naive substring check on the rule text finds the very string
 * the rule exists to forbid and reports the opposite of the truth.
 */
function stripCssComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

const panel = stripComments(docsPanelSource);
const host = stripComments(hostSource);

const css = stripCssComments(
  readFileSync(
    join(fileURLToPath(new URL("../../../", import.meta.url)), "App.css"),
    "utf8",
  ),
);

describe("anti-vacuity — the sources and stripper actually work", () => {
  it("loaded non-empty sources", () => {
    // An empty `?raw` import makes every `toContain` below fail loudly rather than pass,
    // but an empty string would make the NEGATIVE assertions pass trivially. Pin both.
    expect(docsPanelSource.length).toBeGreaterThan(1000);
    expect(hostSource.length).toBeGreaterThan(1000);
    expect(css.length).toBeGreaterThan(1000);
    // And the CSS stripper must not have eaten the rules themselves.
    expect(css).toContain(".docs-content");
  });

  it("stripComments removes prose but keeps code", () => {
    // Proves rule 1 is in force. If the stripper silently no-op'd, assertions that are
    // supposed to prove CODE exists would be satisfiable by comments mentioning it.
    const sample =
      "const a = 1; // docs_read mentioned only in a trailing comment\n";
    expect(stripComments(sample)).toContain("const a = 1;");
    expect(stripComments(sample)).not.toContain("docs_read");
    // And on the real file: the word appears in prose AND in code, so after stripping the
    // CALL must survive.
    expect(panel).toContain('invoke<string>("docs_read"');
  });
});

describe("IPC wiring — stringly-typed across the boundary, invisible to tsc", () => {
  // The failure class is [[tauri-command-removal-needs-invoke-sweep]]: renaming a command
  // or an argument key type-checks fine on both sides and fails only at runtime.

  it("invokes docs_list with `root` bound to the workspace's projectPath", () => {
    expect(panel).toContain('invoke<DocEntry[]>("docs_list"');
    expect(panel).toContain("{ root: projectPath }");
  });

  it("invokes docs_read with BOTH `root` and `path`", () => {
    // `path` is the rel_path handed out by docs_list; dropping either key is a runtime
    // error the compiler cannot see.
    expect(panel).toContain('invoke<string>("docs_read"');
    expect(panel).toContain("{ root: projectPath, path: selected }");
  });

  it("passes projectPath down from the host to the panel", () => {
    expect(host).toContain("<DocsPanel projectPath={projectPath}");
  });
});

describe("the LAZY mount (bundle-size win, operator-verified as flash-free)", () => {
  it("imports DocsPanel via lazy(), not statically", () => {
    // A static import puts ~165 KB of markdown renderer in the eagerly-loaded `main`
    // chunk — for a panel behind a DEFAULT-OFF gate that most users never open.
    expect(host).toContain("const DocsPanel = lazy(");
    expect(host).toContain('import("./docs/DocsPanel")');
    // The regression this guards: someone "tidying" the lazy call back to a plain import.
    expect(host).not.toMatch(/^import \{ DocsPanel \}/m);
  });

  it("wraps the lazy panel in Suspense — a lazy component without one throws", () => {
    expect(host).toMatch(/<Suspense[^>]*>\s*<DocsPanel/);
  });
});

describe("the LAYOUT contract (WP4's scroll-restore depends on it)", () => {
  it("renders the doc list and the content pane as SIBLINGS", () => {
    // The approved layout: list strip on top, document below. Not list-replaced-by-content.
    expect(panel).toContain('data-testid="docs-list"');
    expect(panel).toContain('data-testid="docs-content"');
  });

  it("⚠️ .docs-content — NOT .docs-panel — owns the scroll box", () => {
    // WP4 captures and restores `scrollTop` on `.docs-content`. If `overflow-y` moves up
    // to `.docs-panel`, the list scrolls away with the prose AND WP4's restore target
    // becomes wrong — silently, since nothing else would fail. This is the single most
    // load-bearing CSS assertion in the panel.
    const contentRule = /\.docs-content\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(contentRule).toContain("overflow-y: auto");

    const panelRule = /\.docs-panel\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(panelRule).not.toContain("overflow-y: auto");
    expect(panelRule).toContain("overflow: hidden");
  });

  it("bounds the list strip so a long doc set cannot push the document off-panel", () => {
    const listRule = /\.docs-list\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(listRule).toContain("max-height");
    expect(listRule).toContain("overflow-y: auto");
  });
});

describe("read-only — the viewer never writes to disk (WBS task 3.5)", () => {
  it("has no write command, no edit affordance, no contentEditable", () => {
    // Asserted rather than claimed. Editing stays in the Editor panel or CC
    // (`new-surface-must-earn-its-place-against-existing-ones`).
    expect(panel).not.toContain("contentEditable");
    expect(panel).not.toContain("write_file");
    expect(panel).not.toContain("save_file");
    // The only commands this panel may invoke are the two read-only docs commands.
    const invoked = [...panel.matchAll(/invoke<[^>]*>\("([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect([...new Set(invoked)].sort()).toEqual(["docs_list", "docs_read"]);
  });
});

// ── Phase 2 seams (auto-select + link navigation) ───────────────────────────────

describe("auto-select is DERIVED, not written by an effect", () => {
  it("derives the selection from the user's pick OR pickInitialDoc", () => {
    // The shape matters: the selection is COMPUTED, never written by an effect. An effect
    // that calls setSelected when the fetch lands is a cascading render AND leaves one
    // frame showing a doc list with no document — the same class of bug as the Phase 1
    // blank panel.
    //
    // The precedence itself (explicit pick beats auto) moved to the pure `selectedDoc`
    // at verify-codify and is asserted as a VALUE in pickInitialDoc.test.ts. This arm now
    // pins only that the component routes through that seam — which is the part a source
    // guard can actually see.
    expect(panel).toContain("selectedDoc(chosen, docs)");
  });

  it("holds ALL state inside the component — nothing module-level (per-instance)", () => {
    // The "selection is per-instance" property (each workspace's Docs panel keeps its own
    // selection; switching the center stage must not leak one workspace's doc into
    // another) is guaranteed BY CONSTRUCTION: React gives every mounted instance its own
    // useState/useRef cells. The only way to break it is to hoist state to module scope,
    // where every instance would share one binding.
    //
    // So the honest assertion is the structural one — no module-level mutable binding —
    // rather than a behavioral claim this tier cannot observe. A prior version of this
    // file CLAIMED per-instance-ness in prose while asserting only that `chosen` exists,
    // which is not the same thing (flagged at verify-self).
    const moduleLevelBindings = panel
      .split("\n")
      .filter((l) => /^(const|let|var)\s/.test(l));
    expect(moduleLevelBindings).toEqual([]);
    // ...and the state it does hold is hook-based, so React scopes it per instance.
    expect(panel).toMatch(/useState<[^>]*>\(/);
  });

  it("stores the user's explicit pick separately from the computed selection", () => {
    // WP4 re-runs pickInitialDoc when a doc APPEARS and must never override an explicit
    // pick. Keeping intent in its own state makes that a fact to read, not one to infer.
    expect(panel).toContain("const [chosen, setChosen]");
    // A row click records intent...
    expect(panel).toContain("setChosen(entry.rel_path)");
    // ...and there is no separate `selected` state to drift from it.
    expect(panel).not.toContain("const [selected, setSelected]");
  });
});

describe("link navigation — the webview must never navigate", () => {
  it("routes clicks through ONE delegated handler on the content container", () => {
    expect(panel).toContain("onClick={onContentClick}");
    expect(panel).toContain('closest?.("a[href]")');
  });

  it("calls preventDefault before ANY early return, not merely before a branch", () => {
    // ⚠️ REWRITTEN at Phase 3 verify-self, after the previous version of this test PASSED
    // while the invariant it names was violated. It compared source-text indices of
    // `preventDefault` vs the `external` branch — an ordering check against ONE downstream
    // branch, structurally blind to an `if (kind === "empty") return;` sitting ABOVE the
    // call. That early return was real, and `[click]()` renders a live `<a href="">` that
    // took it, leaving the click cancelable → WKWebView reload → unrecoverable (no back
    // button).
    //
    // The lesson, and why this shape: a source-order guard can only compare the two
    // positions you thought to name. It cannot see a THIRD statement you did not. The
    // behavioral proof lives in `docsLinkHandling.test.ts` (a real click, a real
    // `defaultPrevented`); this arm keeps only the structural claim a source read CAN
    // honestly make — that no `return` precedes `preventDefault` inside the handler.
    const handler = panel.slice(
      panel.indexOf("const onContentClick"),
      panel.indexOf("return (", panel.indexOf("const onContentClick")),
    );
    const pd = handler.indexOf("e.preventDefault()");
    expect(pd).toBeGreaterThan(-1);
    // The only `return` allowed above preventDefault is the not-an-anchor bail, which
    // happens before we have committed to handling the click at all.
    const beforePd = handler.slice(0, pd);
    const returnsBefore = [...beforePd.matchAll(/\breturn\b/g)].length;
    expect(
      returnsBefore,
      "a `return` above preventDefault means some link class escapes with its default " +
        "action intact — the empty-href hole found at Phase 3 verify-self",
    ).toBe(1);
  });

  it("reads the AUTHORED href attribute, not the resolved .href property", () => {
    // `anchor.href` resolves against the page origin, turning `wbs.md` into
    // `http://localhost:1420/wbs.md` — which would classify every cross-doc link as
    // external and hand it to the OS browser.
    expect(panel).toContain('anchor.getAttribute("href")');
    expect(panel).not.toMatch(/const href = anchor\.href/);
  });

  it("hands external links to openUrl — the app's first call site", () => {
    expect(panel).toContain('from "@tauri-apps/plugin-opener"');
    expect(panel).toContain("openUrl(href)");
  });

  it("routes cross-doc links through the resolver, not a raw path match", () => {
    // A raw `entries.find(e => e.rel_path === href)` would break every relative link.
    expect(panel).toContain("resolveDocLink(href, selected, docs)");
  });

  it("surfaces a link that resolves outside the curated doc set", () => {
    // CHANGELOG.md / README.md are real files deliberately excluded from discovery, so
    // this is reachable in normal use and must not be a silent no-op.
    expect(panel).toContain('resolved.kind === "not-in-set"');
    expect(panel).toContain('data-testid="docs-link-note"');
  });
});
