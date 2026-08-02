import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import docsPanelSource from "../docs/DocsPanel.tsx?raw";
import linkHandlerSource from "../docs/handleDocLinkClick.ts?raw";
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
const linkHandler = stripComments(linkHandlerSource);
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

  it("passes all four props down from the host to the panel", () => {
    // ⚠️ REWRITTEN at WP4 (2026-08-02). This previously asserted the single-line string
    // `"<DocsPanel projectPath={projectPath}"`, which broke the moment WP4 added two props
    // and Prettier reflowed the element to multi-line — while the prop was still passed
    // correctly. That is the exact trap CLAUDE.md names: "another silently stopped matching
    // after Prettier reflowed the file… never assert formatted multi-line expressions."
    // (This file had already paid for it once at WP2.)
    //
    // Fix: flatten whitespace before matching, so the assertion is about the CODE rather
    // than about where Prettier chose to wrap.
    const flat = host.replace(/\s+/g, " ");
    // Emptiness meta-guard: `flat` of an empty import would be "", and every `toContain`
    // below would then... still fail, but for the wrong reason. Assert the haystack is real.
    expect(flat.length).toBeGreaterThan(1000);

    const mount = /<DocsPanel\b([^>]*)\/>/.exec(flat)?.[1] ?? "";
    expect(mount).not.toBe("");
    // All four props the panel requires. `workspaceId` and `panelFront` are WP4's:
    // the first scopes the `fs-change` subscription to this workspace, the second is the
    // retry trigger for a scroll restore deferred while the panel was display:none.
    expect(mount).toContain("projectPath={projectPath}");
    expect(mount).toContain("visible={visible}");
    expect(mount).toContain("workspaceId={workspaceId}");
    expect(mount).toContain('panelFront={panel === "docs"}');
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

describe("WP4 — the live-reload wiring", () => {
  // Reuses this file's existing `panel` (already comment-stripped by `stripComments`) rather
  // than building a second stripper — the rule-1 rationale in the header applies verbatim,
  // and two strippers would be two things to keep correct. It matters especially here: this
  // panel's own header discusses every identifier asserted below in prose, so an un-stripped
  // haystack would make these guards vacuous in the most literal way
  // (`raw-guard-identifier-satisfied-by-own-comments`).
  const stripped = panel;

  it("the haystack is real after stripping (emptiness meta-guard)", () => {
    // Without this, a stripping regex that ate the whole file would make every `not.toContain`
    // below pass trivially.
    expect(stripped.length).toBeGreaterThan(1000);
    expect(stripped).toContain("export function DocsPanel");
  });

  it("subscribes to the fs-change event, filtered to THIS workspace", () => {
    // One broadcast channel serves every workspace; a consumer that forgets the filter
    // re-lists on unrelated projects' writes.
    expect(stripped).toContain("listen<FsChange>(FS_CHANGE_EVENT");
    expect(stripped).toContain(
      "appliesToWorkspace(event.payload, workspaceId)",
    );
  });

  it("decides what changed by DIFFING the re-listed set, not by reading FsChange.kind", () => {
    // `kind` is documented as "a hint only" and the backend folds a mixed 200ms batch to
    // `Other`, so it cannot classify appear-vs-change-vs-disappear. Diffing the list is
    // correct regardless of what the debouncer coalesced.
    expect(stripped).toContain("decideReload({");
    expect(stripped).not.toMatch(/\bevent\.payload\.kind\b/);
    expect(stripped).not.toMatch(/\bkind\s*===\s*["']created["']/);
  });

  it("consumes the scroll-restore seam by CALL, not by re-implementing it", () => {
    expect(stripped).toContain("captureScroll(");
    expect(stripped).toContain("planRestore(");
    expect(stripped).toContain("readGeometry(");
    // The pending machine drives the hold/retry — not an ad-hoc boolean pair.
    expect(stripped).toContain("pendingNext(");
    expect(stripped).toContain("hasPending(");
  });

  it("gates a jump on shouldJump so an explicit pick is never overridden", () => {
    expect(stripped).toContain("shouldJump(");
  });

  it("⚠️ re-reads a changed doc via the nonce, NEVER by clearing `loaded`", () => {
    // THE regression this WP shipped for one live probe (2026-08-02) and that every
    // structural gate missed: the reload path called `setLoaded(null)` to "re-trigger" the
    // content fetch. It cannot — that effect keys on `selected`, which is unchanged on a
    // content edit — so `.docs-content` went permanently EMPTY (measured live: scrollHeight
    // 3034 → 433, no markdown node, no error) while the list and selection stayed correct.
    // tsc, lint, 1716 tests, a clean build and seven mutation-proven arms were all green.
    //
    // Two assertions, because only the pair is meaningful: the broken shape must be ABSENT
    // and the working one PRESENT. Absence alone would pass if the reload were deleted.
    expect(stripped).not.toContain("setLoaded(null)");
    expect(stripped).toContain("setReloadNonce((n) => n + 1)");
    // And the nonce must actually be in the content effect's deps, or it re-renders without
    // re-reading — the same class of silent no-op in a new costume.
    const contentEffect =
      /invoke<string>\("docs_read"[^]*?\}, \[([^\]]*)\]\)/.exec(stripped);
    expect(contentEffect).not.toBeNull();
    expect(contentEffect?.[1] ?? "").toContain("reloadNonce");
  });

  it("⚠️ never resets `docs` to null on a refresh — that would re-arm the fetch latch", () => {
    // The latch is `fetchLatch`'s state machine; `setDocs(null)` would re-arm the effect and,
    // against a persistently failing `docs_list`, loop. The reload path must only ever write
    // a real list.
    expect(stripped).not.toContain("setDocs(null)");
  });

  it("re-applies a deferred restore when the panel becomes measurable again", () => {
    // `panelFront`/`visible` in the retry effect's deps is what closes the hidden-reload
    // case: a reload landing on a display:none panel holds its offset and applies it when
    // the panel is re-fronted. Without these deps the offset is held forever and the reader
    // still lands at the top.
    const retryEffect =
      /useEffect\(\(\) => \{[^]*?hasPending\(pendingRef\.current\)[^]*?\}, \[([^\]]*)\]\)/.exec(
        stripped,
      );
    expect(retryEffect).not.toBeNull();
    const deps = retryEffect?.[1] ?? "";
    expect(deps).toContain("panelFront");
    expect(deps).toContain("visible");
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
    // ⚠️ `export?` is load-bearing. The predicate was `/^(const|let|var)\s/`, which an
    // `export const sharedCache = new Map()` at module scope walks straight past —
    // measured at code review. That is not a hypothetical: a shared cache is the single
    // most likely way someone would actually break per-instance isolation, so the guard
    // was missing the realistic regression while catching the unrealistic one.
    const moduleLevelBindings = panel
      .split("\n")
      .filter((l) => /^(export\s+)?(const|let|var)\s/.test(l));
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

describe("link navigation — wiring, now that the handler is its own module", () => {
  // ⚠️ These assertions moved from `DocsPanel.tsx` to `handleDocLinkClick.ts` at code
  // review, when the handler was extracted so tests could drive THE REAL CODE. The
  // `preventDefault`-ordering arm that used to live here is GONE, not relocated: it was a
  // proxy (first source positions, then a `return` count) and BOTH versions passed while
  // the invariant was broken. Its replacement is behavioral — `docsLinkHandling.test.ts`
  // imports this handler and asserts `defaultPrevented` on a real event, so a mutation to
  // production code fails it. Do not re-add a source-order arm here; that shape has now
  // failed twice for the same structural reason.

  it("the component delegates to the extracted handler, not an inline closure", () => {
    expect(panel).toContain("makeDocLinkClickHandler({");
    expect(panel).toContain("onClick={onContentClick}");
    // ...and the handler logic is not duplicated back into the component.
    expect(panel).not.toContain("classifyHref(");
  });

  it("matches links by delegation from the container", () => {
    expect(linkHandler).toContain('closest?.("a[href]")');
  });

  it("reads the AUTHORED href attribute, not the resolved .href property", () => {
    // `anchor.href` resolves against the page origin, turning `wbs.md` into
    // `http://localhost:1420/wbs.md` — which would classify every cross-doc link as
    // external and hand it to the OS browser.
    expect(linkHandler).toContain('anchor.getAttribute("href")');
    expect(linkHandler).not.toMatch(/const href = anchor\.href/);
  });

  it("hands external links to an opener seam — the app's first call site", () => {
    expect(linkHandler).toContain('from "@tauri-apps/plugin-opener"');
    expect(linkHandler).toContain("openExternal(href)");
  });

  it("routes cross-doc links through the resolver, not a raw path match", () => {
    expect(linkHandler).toContain(
      "resolveDocLink(href, deps.selected, deps.docs)",
    );
  });

  it("surfaces a link that resolves outside the curated doc set", () => {
    expect(linkHandler).toContain('resolved.kind === "not-in-set"');
    expect(panel).toContain('data-testid="docs-link-note"');
  });

  it("USES the fragment of a cross-doc link, rather than dropping it", () => {
    // `resolveDocLink` always split `wbs.md#probe-outcomes` into path + fragment, and the
    // caller always discarded the fragment — so such links landed at the TOP of the target
    // while the resolver's own comment said they would land on the section. Caught at code
    // review; a comment promising behavior the code does not perform is worse than an
    // unimplemented feature.
    expect(linkHandler).toContain("resolved.fragment");
  });
});
