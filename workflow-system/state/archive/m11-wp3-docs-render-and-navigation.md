# Feature: M11 WP3 — Docs read-only formatted render + auto-select-on-open + link navigation

**Workflow:** feature
**State:** COMPLETE — finalized 2026-08-02
**Created:** 2026-08-02
**Drive mode:** autopilot
**WBS:** `workflow-system/product/wbs.md` → WP3 (M11)

## Problem Statement

The Docs panel exists (M11 WP2) as a gated 4th `RightPanelHost` panel listing a project's
workflow docs in re-orientation order — but selecting a row does nothing visible. `docs_read`
is registered in `lib.rs` with **zero callers**. This WP makes the panel *do its job*: render
the selected doc as formatted, read-only markdown; land on the right doc automatically when
the panel opens (the panel is a **re-orientation surface**, so ceremony to reach the relevant
doc defeats its purpose — `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]`); and make
links navigate sensibly rather than hijacking the webview. WP1's completed probe supplies the
renderer verdict, the frontmatter strategy, the link classifier, and the testability posture,
so this is a build against a known shape — not a discovery exercise. Two scheduled MAJOR
review findings from WP2 ride along because they land on this component: the missing wiring
test (folded in per its own pickup shape) and the fetch-latch entanglement (fixed **here**
rather than at WP4, because this WP restructures the component's state anyway and WP4's live
reload is where the latch becomes a loop).

**Completed probe WP covering the 3rd-party dependency:** WP1 (`wbs.md` → "Probe outcomes" →
WP1 verdict, 2026-08-01). `react-markdown@10` + `remark-gfm@4` + `rehype-sanitize@6` chosen on
a measured security axis under `csp: null`; **`rehype-raw` must never be added** — that one
invariant is what makes the safety structural rather than configured.

## Work Tree

- [x] Phase 1: Render the selected doc (deps + state restructure + frontmatter + GFM)  <!-- status: DONE (2026-08-02) -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run` exits 0; a new `docsRender.test.ts` asserts, via
    `renderToStaticMarkup` (from the already-installed `react-dom/server` — no new test dep),
    that a fixture containing a GFM table, a fenced code block, `- [ ]`/`- [x]` task items and
    a leading `---` YAML block produces: `<table>`, `<code>`, exactly two
    `input[type=checkbox]` (one `checked`), and **no** `<hr>` immediately preceding a
    setext-`<h2>` made of YAML keys (the WP1-measured frontmatter mangling).
  - CLI: `pnpm vitest run` — a **hostile-fixture** test asserts the parsed **live DOM** (via
    `DOMParser`, never source-text regex) contains 0 live vectors across the WP1 vector
    classes, and **includes a `style`-ATTRIBUTE probe** (the class WP1's first predicate
    missed). Paired with a **mutation check** proving the assertion is not vacuous.
  - CLI: `grep -c "rehype-raw" package.json` → 0, pinned by a test asserting the dependency
    is absent (the WP1 invariant, which nothing in code otherwise enforces).
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 (NOT `pnpm exec tsc` —
    `[[pnpm-exec-shadows-local-binaries]]`); `pnpm lint` 0 errors; `pnpm format:check` clean.
  - Browser (deferred to Phase 3's live pass): selecting a row renders formatted content.
  - [x] P1.1 Add `react-markdown@10`, `remark-gfm@4`, `rehype-sanitize@6` to `package.json`.
        ⚠️ **Do NOT add `rehype-raw`** — see Problem Statement + `wbs.md` WP1 verdict. Verify
        the install left `pnpm-lock.yaml` coherent and `package.json` carrying exactly the
        three new entries (`[[pnpm spike mutates lockfile]]` is about spikes, but the
        lockfile is still the thing to read).  <!-- status: DONE -->
  - [x] P1.2 **Fix the fetch-latch entanglement FIRST, before adding render state**
        (`SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-FETCH-LATCH-ENTANGLED-WITH-DATA`): replace
        `docs !== null` as the has-fetched latch with an explicit `fetched` ref or a
        discriminated `status` union, so fetch-once is *stated* rather than emergent. Doing
        this before the render state lands means the new content-fetch effect is written
        against a clean pattern instead of copying the entangled one.  <!-- status: DONE -->
  - [x] P1.3 Extract a **pure** `stripFrontmatter(src)` → `{ frontmatter: string | null, body: string }`
        using WP1's validated regex `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`. Unit-test WP1's 6
        validated edge cases: no frontmatter; **a leading thematic break is NOT frontmatter**;
        a later `---` in the body is untouched; CRLF; and record the known boundary (an empty
        `---\n---` block falls through — 0 of 54 real docs have one).  <!-- status: DONE -->
  - [x] P1.4 Add the content fetch: on selection change, `invoke<string>("docs_read", { root: projectPath, path: relPath })`
        → render `body` through `react-markdown` with `remarkPlugins=[remarkGfm]` and
        `rehypePlugins=[rehypeSanitize]`; render `frontmatter` as a styled header block.
        Fetch state must distinguish loading / error / loaded (mirror `docsView`'s
        exclusive-view discipline with a sibling pure function — an error must never read as
        an empty doc).  <!-- status: DONE -->
  - [x] P1.5 Style for the **dark-only** theme (project convention — no light tokens, no
        `prefers-color-scheme` block). Every new class must have a rule: `docsPanelStyles.test.ts`
        already guards whole-class absence for this panel, so **extend its extractor coverage
        to the new markdown-body classes** rather than assuming it reaches them.  <!-- status: DONE -->
  - [x] P1.6 Layout decision, made in-build and recorded: the panel must now show **both** the
        list and the rendered doc. Decide list-above-content vs. back-navigation vs. a split,
        and record the choice + the rejected alternative in this file. Constraint: WP4 requires
        **the panel owns one scroll container** for the rendered body (WP1 measured a flat
        sibling list with no wrapper root), so whatever the layout, the body's scroll parent
        must be identifiable and stable.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE — approved 2026-08-02, round 2 -->
    - [x] P1.verify-human.1 Docs panel renders a selected doc (live app)  <!-- status: DONE (round 2, 2026-08-02) — FAILED round 1 (blank panel, StrictMode latch deadlock); fixed + regression-tested, operator re-verified -->
    - [x] P1.verify-human.2 Frontmatter header block reads well, no mangling  <!-- status: DONE (2026-08-02) -->
    - [x] P1.verify-human.3 Work-Tree task lists / tables / code legible  <!-- status: DONE (2026-08-02) -->
    - [x] P1.verify-human.4 Layout call: list strip above content (P1.6 decision)  <!-- status: DONE (2026-08-02) -->
    - [x] P1.verify-human.5 Lazy-load introduces no visible flash/jank  <!-- status: DONE (2026-08-02) -->
  - [x] verify-codify  <!-- status: DONE (2026-08-02) -->

- [x] Phase 2: Auto-select-on-open + link navigation  <!-- status: DONE (2026-08-02) -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run` — `pickInitialDoc(docSet)` unit tests over synthetic doc sets prove
    the ranking `.session.md` → active `wip/*.md` → `roadmap.md` → first-in-workflow-order,
    **including** the empty-set case (returns null, no crash) and the multi-wip tiebreak.
  - CLI: `pnpm vitest run` — `classifyHref(href)` unit tests over WP1's 8 real shapes in
    WP1's proven order (`#` → any `scheme:` → `//` → else relative). ⚠️ Must include
    `//evil.example.com` → **external**, and a test asserting the classifier is **not**
    `startsWith("http")` (that naive check misroutes the protocol-relative case into the
    local-file path).
  - CLI: `pnpm vitest run` — a wiring test pins that the panel invokes `docs_list` with
    `root: projectPath` **and** `docs_read` with `{ root, path }` (stringly-typed across IPC,
    invisible to `tsc` — `[[tauri-command-removal-needs-invoke-sweep]]`), that `selected` is
    per-instance, and that `visible` defers the first fetch. Resolves
    `SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-HAS-NO-WIRING-TEST`. ⚠️ Any `?raw` arm must
    strip comments before asserting and assert the **call shape** (`invoke("docs_read"`), not
    a bare identifier — `[[raw-guard-identifier-satisfied-by-own-comments]]`.
  - Browser (Phase 3 live pass): opening Docs lands on the re-orientation doc with no click;
    a cross-doc link switches the selected doc; an external link does not navigate the webview.
  - [x] P2.1 Pure `pickInitialDoc(docs)` per the WBS ranking. ⚠️ **Known WBS gap, decide here:**
        the rule says "most-recently-modified wip" but `DocEntry` carries **no mtime**
        (`rel_path`/`kind`/`file_name` only). Options: (a) add `mtime_ms` to the backend
        `DocEntry` — the seam exists (`editor_fs::FileMarker` already computes it) but it is a
        backend DTO change with a serde-shape test to update; (b) fall back to the existing
        deterministic `file_name` tiebreak `orderDocs` already applies. **Prefer (b) unless the
        multi-wip case is real in practice** — a single active wip file is the overwhelming
        norm, and (a) adds a DTO field to serve a tiebreak. Record the choice.  <!-- status: DONE -->
  - [x] P2.2 Wire auto-select: when the doc list first loads and nothing is selected, select
        `pickInitialDoc`'s answer. Must **not** clobber an existing user selection on a later
        list refresh (WP4 re-derives the list on `fs-change`) — the write is once, on first
        load, not on every list change.  <!-- status: DONE -->
  - [x] P2.3 Pure `classifyHref(href)` → `"anchor" | "cross-doc" | "external"` per WP1's
        table and order.  <!-- status: DONE -->
  - [x] P2.4 Delegated click handler on the panel container (`e.target.closest("a[href]")` →
        `preventDefault()`), renderer-agnostic per WP1 (chosen over `components={{a}}`):
        anchor → scroll within the panel; cross-doc → switch selected doc if the target is in
        the discovered set (and a **visible, non-silent** outcome if it is not); external →
        `openUrl(href)` from `@tauri-apps/plugin-opener` (already installed + granted in both
        capability sets; **this is the app's first call site**).  <!-- status: DONE -->
  - [x] P2.5 **Decide `[[slug]]` handling — do not discover it mid-build** (WBS task 3.4;
        WP1 measured that `[[slug]]` emits **no `<a>` at all**, so the delegated handler
        structurally cannot see it). Options: leave inert as plain text (cheapest, still reads
        fine), or a small remark plugin rewriting `[[slug]]` → a link node that then flows
        through the same handler. **Lean: leave inert for this WP** — the slugs resolve to
        `.claude/memory/` files that are **not in the discovered doc set**, so a link would
        navigate nowhere; record the decision and the reasoning either way.  <!-- status: DONE -->
  - [x] P2.6 Confirm read-only (WBS 3.5): no edit affordance, no write path, no `contentEditable`
        — editing stays in Editor/CC (`[PRIOR: new-surface-must-earn-its-place-against-existing-ones]`).
        Assert as a test, not a claim.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE — approved 2026-08-02 -->
    - [x] P2.verify-human.1 Panel opens on a rendered doc, no click  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.2 Landing doc is the right one (ranking)  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.3 Cross-doc link switches the selected doc  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.4 External link opens browser, webview unchanged  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.5 In-doc anchor scrolls within the panel  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.6 Explicit pick is never overridden  <!-- status: DONE (2026-08-02) -->
    - [x] P2.verify-human.7 [[slug]] links inert — accept or reject  <!-- status: DONE (2026-08-02) -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [x] Phase 3: Live verification + CSP posture decision  <!-- status: DONE (2026-08-02) -->
  **Observable outcomes:**
  - Browser (MCP bridge, live `pnpm tauri:dev`, **scratch workspace** `tmp/scratch/scratch-a`):
    with the gate ON, `⌘⇧K` → the Docs panel opens **already showing a rendered doc** (not an
    empty pane) — asserted by reading the live DOM for rendered markdown elements, not a
    screenshot alone.
  - Browser (bridge): the rendered body contains real `<table>` / `<code>` /
    `input[type=checkbox]` nodes for a doc that has them; a frontmatter-bearing doc shows the
    styled header block and **no** mangled setext heading.
  - Browser (bridge): clicking a cross-doc link switches the selected doc (the selected row's
    `aria-selected` moves); the webview `location.href` is **unchanged** after clicking an
    external link (proving no hijack).
  - Console (bridge): zero JS errors across the open → render → navigate sequence.
  - CLI: full gates green — `pnpm vitest run`, `./node_modules/.bin/tsc --noEmit`, `pnpm lint`,
    `pnpm format:check`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`,
    `cargo test`.
  - CLI: the OFF-invariant guard still passes with the gate OFF, and is **mutation-probed
    individually** (not one composite bypass) to confirm it still bites after this WP's
    changes to `DocsPanel`/`panelHost` neighbourhood.
  - [x] P3.1 Live verify-self via the MCP bridge against a scratch workspace. Follow the known
        caveats: `el.click()` inside `webview_execute_js` rather than `webview_interact{click}`
        (caveat g); fire-then-poll for any `invoke` (caveat d); teardown with
        `driver_session{stop}` + `TaskStop` + **PID-scoped** port cleanup — never a blanket
        kill (`[[verify-self-dev-vs-prod-process-name-collision]]`, `[[lsof-ti-tcp-misses-ipv6-vite]]`;
        the operator may have their own app open).  <!-- status: DONE -->
  - [x] P3.2 **Settle `SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE`**
        (medium, arch) — it becomes load-bearing the moment this WP ships, which is now. The
        item's own suggested action is a choice between (a) set a CSP appropriate to an app
        that loads no remote content, or (b) record `csp: null` in `arch.md` as an accepted
        decision with its rationale + the compensating control each HTML-rendering feature
        must implement. **This is an operator call, surfaced at verify-human** — WP3's job is
        to present the decision with the evidence, not to unilaterally change the app's
        security posture. Whichever is chosen, record it in `arch.md` and resolve or re-scope
        the backlog item.  <!-- status: DONE -->
  - [x] P3.3 Close out the two folded-in WP2 MAJORs in this file's `## Retrospect

- **What changed in our understanding:** The gap between *"the gates are green"* and *"the code is
  correct"* is much wider than this project had been treating it. Six defects surfaced in this WP;
  **not one was caught by `tsc`, lint, the 1600-test suite, or a clean production build.** Every one
  came from actively attacking the work — mutation testing, adversarial subagents, or driving the
  real app. The blank panel is the clearest case: 1538 tests passed while the feature displayed
  nothing at all.

  The sharper lesson, which took three iterations to see: **a `?raw` source-text guard cannot
  express a behavioral property, and writing a *better* predicate does not fix that.** I replaced a
  source-order guard with a `return`-counting guard, and both passed while the same webview-hijack
  hole was open. The code reviewer named the actual remedy — *probe the component, not a copy of
  it* — which meant extracting the handler so a test could import the real code. That is a
  structural answer to a structural problem, and it is the durable takeaway.

- **Assumptions that held:** WP1's probe paid for itself. The renderer verdict, the security
  posture, the link classifier's ordering, and `renderToStaticMarkup`-as-harness were all correct
  and saved real time — WP3 built against a known shape rather than discovering one. The
  pure-function-plus-thin-component architecture also held: every property that turned out to
  matter (latch ordering, ranking, href classification, selection precedence) was testable as a
  value precisely because it had been extracted.

- **Assumptions that were wrong:**
  - **That WP1's recorded frontmatter regex worked.** It failed the exact edge case its own verdict
    listed as validated, and would have deleted a paragraph from any doc opening with a thematic
    break. Corrected at source so the next reader doesn't copy it.
  - **That a fix makes things safer.** The blank panel was caused by the P1.2 "improvement" to the
    fetch latch — the old entangled version survived StrictMode *by accident*, and cleaning it up
    removed the accident without replacing it.
  - **That comment-recorded reasoning is durable.** Three files reasoned from "the app has no CSP"
    with nothing asserting it; a `?raw` guard was satisfied by a module's own comments; and
    `resolveDocLink`'s comment promised fragment-scrolling the caller never performed. **A comment
    that states a fact the code does not enforce is a liability, not documentation.**
  - **That verifying the slice I built is verifying the feature.** `anchorSelector`'s tests proved
    the selector was well-formed; nothing checked a target existed. Every in-doc anchor was dead.

- **Approach delta:** The plan's three phases held, but roughly a third of the work was unplanned
  and reactive — the StrictMode latch machine, the heading-id fix, the handler extraction, and six
  guard rewrites all came from findings rather than the plan. Two planned decisions were reversed
  by the operator on better reasoning: the multi-WIP tiebreak (alphabetical → `mtime_ms`, once it
  emerged that created-time and modified-time cost the same and only one answers *"where am I
  working?"*), and the CSP framing (a cost/benefit tradeoff → a flat rule, *"I want raw HTML to be
  blocked"*, which is stronger and needs no threat model). Docs-first tab ordering was a pure
  operator addition. **The plan was a good scaffold and a poor predictor** — which is the expected
  shape for a WP whose real content was verification quality.

## Communicate

> **Feature complete:** M11 WP3 — the Docs panel now renders. Selecting a workflow doc shows it as
> formatted, read-only markdown (tables, fenced code, Work-Tree checkboxes, frontmatter), the panel
> auto-opens on the most relevant doc with no click, and links navigate — in-doc anchors scroll
> within the panel, cross-doc links switch documents, external links open in the real browser, and
> the webview never navigates away. With workflow features enabled, Docs is now the first tab and
> the default panel.
>
> **To see it:** `pnpm tauri:dev`, open a project with a `workflow-system/` directory, press `⌘⇧K`.
>
> *Requester = operator — closure notice for self-record.*

## Code-Quality Review`
        section (latch → fixed at P1.2; wiring test → added at Phase 2), so the backlog
        entries can be deleted at finalize with the CHANGELOG record written first
        (delete-on-resolve invariant).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE — approved 2026-08-02 -->
    - [x] P3.verify-human.1 CSP posture: pick (a) set a CSP or (b) record csp:null  <!-- status: DONE (2026-08-02) -->
    - [x] P3.verify-human.2 Heading anchors work on a real doc's TOC  <!-- status: DONE (2026-08-02) -->
    - [x] P3.verify-human.3 Accept the WP as shippable  <!-- status: DONE (2026-08-02) -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Phase 1 build record (2026-08-02)

**Decisions made in-build, with their rejected alternatives:**

1. **Layout (P1.6) — list strip above, rendered doc below.** The list is a fixed-height
   (`max-height: 11rem`) scrollable strip; `.docs-content` fills the rest and owns its own
   scroll box. Rejected: *list-replaced-by-content + back button* (re-introduces the ceremony
   `primary-surface-is-zero-ceremony-not-a-mode` argues against, and leaves cross-doc links
   with no visible destination context) and *a left/right split* (the panel is already the
   right half of a workspace; splitting again leaves the prose column too narrow for the
   tables and code blocks that dominate these docs). ⚠️ `overflow-y` deliberately does NOT
   live on `.docs-panel` — WP4 restores `scrollTop` on `.docs-content`, which must stay the
   single stable scrolling box.

2. **Content state is DERIVED, not reset in an effect.** The fetch result is stored with the
   path it belongs to (`{path, text, error}`) and the render derives currency via
   `loaded.path === selected`. Rejected: `setContent(null)` at the top of the effect — which
   `react-hooks/set-state-in-effect` fails, *and* which leaves a frame where the new doc is
   selected while the old doc's text is still rendered. Same shape as WP2's
   `reconcilePanel(storedPanel, gate)` derivation. **Do not "simplify" this back to a reset.**

3. **`DocsPanel` is now LAZY-loaded** (`React.lazy` + `Suspense`, matching `DiffPanel` /
   `ProjectSearch` and `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`). Not in the plan —
   added because WP3 gave the panel a markdown renderer. **Measured:** `main` chunk
   606 KB → 440 KB (gzip 167 KB → 116 KB); the renderer moved into its own 165 KB / 50.6 KB-gzipped
   `DocsPanel` chunk, closely matching WP1's predicted ~157 KB / ~48 KB. This matters more here
   than for its siblings: the panel is behind a **default-OFF** gate, so a static import made
   every user download a renderer they may never open.

**Three findings the plan did not predict — each measured, not inferred:**

1. **⚠️ WP1's frontmatter regex does NOT handle the leading-thematic-break case it claims to.**
   The verdict lists "a leading thematic break is correctly NOT treated as frontmatter" among
   6 validated cases, and gives the pattern `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`. That pattern
   **fails** that case: against `---\n\nProse.\n\n---\n` it matches and captures `\nProse.\n`
   as YAML, deleting a real paragraph from the body. Caught by writing the test first; fixed
   with a non-blank-first-line guard `(?![\r\n])` (YAML frontmatter opens with a `key:` line,
   never a blank one) and **mutation-proven** — removing the guard fails exactly that one test,
   with the mutation confirmed landed in executable code first.

2. **⚠️ `docsPanelStyles.test.ts` was passing while failing to protect anything new — twice
   over.** (a) Its extractor filtered to `docs-`-prefixed classes and read only `DocsPanel.tsx`,
   so WP3's `doc-markdown` / `doc-frontmatter` classes (in a new file) were invisible to it.
   (b) More seriously, its check was `css.includes('.' + cls)`, a **substring** test — so
   `.doc-frontmatter` was satisfied by `.doc-frontmatter-RENAMED`, and `.doc-markdown` by
   `.doc-markdown-body`. Fixed with a class-name-boundary matcher. **The strengthened guard
   immediately caught a real defect in this WP's own CSS:** `.doc-markdown` was referenced in
   JSX with no rule at all, hidden by `.doc-markdown-body` sharing its stem. Mutation-probed
   per-class afterward: the two single-rule classes fail when renamed; the two with multiple
   rules correctly survive a single-occurrence rename (they are still styled).

3. **`react-markdown` STRIPS raw HTML tags and keeps their inner text** — it does not escape
   them to visible source text, which is the intuitive assumption and was asserted wrongly
   here before being measured. `<script>evil()</script>` → nothing; `Inline <b>bold</b> and
   <script>x</script> text` → `Inline bold and x text`. Safe either way (no element is ever
   constructed, which is the property that matters under `csp: null`), but worth knowing that
   inline script *contents* can surface as ordinary prose.

**Security assertion is mutation-proven, not merely present** (the WP1 method note): the
hostile-fixture test scores 0 live vectors across 8 probe classes including the
style-**attribute** class WP1's own first predicate missed, with a negative control asserting
every probe class fires on the unrendered fixture. Adding `rehype-raw` — the exact prohibited
mutation — was applied, **confirmed landed in executable code**, and **fails** the zero-vectors
test; then reverted and the package removed from `package.json` entirely.

**Deviation from plan, recorded:** the plan said the DOM assertions would use `DOMParser` with
"no new test dep". Vitest here runs in the `node` environment with no DOM and no transitively-
reachable HAST parser (pnpm's strict store hides indirect deps), so `jsdom` + `@types/jsdom`
were added as **dev**-only dependencies. Asserting the security property by source-text regex
instead was rejected outright — WP1 proved twice that regexes give false results on exactly
this question.

### verify-human round 1 (2026-08-02) — REJECTED, two findings

**FINDING 1 (BLOCKING, fixed): the Docs panel rendered completely empty.** Not the list, not
the "no docs" message, not an error — nothing. **I caused this in P1.2**, the very fix that was
supposed to make the fetch-once latch safe.

*Diagnosis path (worth recording — the first two hypotheses were wrong):* the operator's project
DID have 9 discoverable docs (proved by running `discover()` against the real directory in Rust:
6 product + backlog + `.session.md` + 1 wip). The MCP bridge then showed `DocsPanel` **mounted
with correct dimensions (639×611) and an empty body** — which ruled out CSS collapse and a failed
lazy chunk, and left exactly one possible state: `docs === null`, i.e. `docsView` returning
`"loading"`, which renders nothing.

*Root cause:* the new `listFetchedRef` was set to `true` BEFORE the await and never released,
while the cleanup set `cancelled = true`. React StrictMode runs every effect mount → unmount →
remount, so: mount latches + fetches → unmount cancels → **remount sees the latch still true and
returns early** → the first response lands, sees `cancelled`, and discards its data. `docs` stays
`null` forever. ⚠️ **The predecessor `docs !== null` latch survived this by accident** — it read
from state, which the discarded write never updated, so the remount refetched. My "cleaner"
explicit latch removed the accident and exposed the bug.

*Fix:* the latch is now a pure state machine in `docs/fetchLatch.ts` (`idle`/`in-flight`/`settled`)
driven from the effect, with `in-flight` + `cancel` → **`idle`** as the load-bearing transition.
Pinned by `__tests__/fetchLatch.test.ts`, **mutation-proven**: reverting that one transition to
`settled` fails 3 of 6 tests. Also pinned in the other direction (`settled` + `cancel` → `settled`),
because a naive always-re-arm fix would refetch on every center-stage switch.

⚠️ **Why no gate caught it:** tsc, lint, 1538 tests and a clean production build were ALL green
while the panel was blank. Nothing modelled the mount/unmount/remount sequence. The proof that the
latch was correct was a *comment* asserting "the ref is never reset and that is sound" — and that
comment was wrong. This is the concrete cost of pinning effect-lifecycle behavior in prose rather
than as a value, and it is the second time this WP paid for an unverified claim in a comment.

**FINDING 2 (operator decision, implemented): Docs is now FIRST in the tab row and the DEFAULT
panel — but only when the gate is ON.** For a workflow user, "where is this project?" precedes any
editing question, so making them click past Editor on every workspace open is exactly the ceremony
`primary-surface-is-zero-ceremony-not-a-mode` argues against. Implemented as:
`AVAILABLE_PANELS_WITH_WORKFLOW` puts `"docs"` at the head (the array IS the tab order); a new
`defaultPanel(gate)` returns `"docs"`/`"editor"`; `storedPanel` became `RightPanel | null`
("unchosen") so the default is **derived once the async gate resolves** rather than fixed before
the gate is known; the Docs tab JSX moved to the head of the row. `selectPanel` now accepts a
nullable `current` and resolves it via `defaultPanel` so a rejected target can never write `null`
back to state. ⚠️ **Gate-OFF behavior is bit-for-bit unchanged** (`AVAILABLE_PANELS` untouched,
Editor first) — asserted explicitly, since that is M10.9's byte-identical-when-off contract. Six
new tests in `panelHost.test.ts`, including that an explicit user choice still wins.

**Gates after both fixes:** 1551 tests (133 files, +13), tsc 0, lint 0 errors, format clean, build
green, OFF-invariant guard still 14/14.

### Phase 1 verify-codify (2026-08-02)

**Coverage audit first — 4 of 6 approved behaviors were already covered**, so only the genuine
gaps got new tests rather than duplicating existing ones: the render/frontmatter/security
behaviors are pinned by `docsRender.test.tsx` + `frontmatter.test.ts`, the blank-panel fix by
`fetchLatch.test.ts`, and the gate-OFF tab order by `panelHost.test.ts` + the OFF-invariant guard.
The two uncovered ones were the **layout contract** and the **lazy mount** — both approved by eye
at verify-human with nothing to catch a regression.

**Integration boundary applies** (`RightPanelHost`'s Docs mount changed to lazy + `Suspense`, tab
order changed), so the new tests exercise the consuming surface's wiring, not just the new module.
The highest-level tier that runs in CI here is a wiring test: this repo has no component-render
harness (`SURFACE-2026-07-31`, 134 test files, none renders a component) and the live end-to-end
proof is Phase 3's MCP-bridge pass.

**Added `docsPanelWiring.test.ts` (11 tests)** — IPC arg shapes (`docs_list{root}`,
`docs_read{root,path}` — stringly-typed, invisible to `tsc`), the lazy+`Suspense` mount, the
layout contract, and read-only (asserting the panel invokes *only* the two read commands, rather
than claiming read-only in prose). This **resolves
`SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-HAS-NO-WIRING-TEST`**, whose pickup shape named WP3.

**Every arm mutation-proven INDIVIDUALLY** (not one composite bypass — the M10.9 WP5.2 method,
since a composite tripping one arm reports "the guard bites" while hiding a gap): moving
`overflow-y` to `.docs-panel` (the WP4-breaker) → caught; dropping the list `max-height` → caught;
removing `Suspense` → caught; renaming `docs_read`'s `path` arg → caught. Each failed exactly one
test; baseline and restore both green.

⚠️ **The `?raw` trap fired twice more, inside the very file whose header warns about it** — the
count for this WP is now five. (1) My `stripComments` used `^\s*//`, which only strips comments
that BEGIN a line, so trailing `// …` prose survived and rule 1 was not actually in force for any
assertion; caught by its own meta-test. (2) The `.docs-panel` CSS rule carries a comment *warning
against* `overflow-y: auto`, so the negative assertion matched the very string the rule exists to
forbid — reporting the opposite of the truth. Both fixed (unanchored line-comment pattern +
`stripCssComments`), and the meta-test now pins that the stripper actually strips. **The lesson
that keeps not transferring: write the stripper's own meta-test BEFORE trusting any assertion
that depends on it.**

**Gates:** 1562 frontend (134 files) / 723 backend, `tsc` 0, lint 0 errors (1 pre-existing
`XtermPane` warning), `format:check` clean, `cargo fmt` + `clippy --all-targets -D warnings` clean,
no probe residue in `docs/mod.rs`.

### Phase 2 build record (2026-08-02)

**P2.1 — the mtime gap: REVERSED at operator ask, `mtime_ms` ADDED to the DTO.** The interim
build shipped an alphabetical `file_name` fallback on the reasoning that a DTO change was too
expensive for a rare tiebreak. The operator then asked whether **created time** could serve as the
fallback — and interrogating that question invalidated the original reasoning:

- **The blocker was never "mtime is unavailable".** `DocEntry` carried **no timestamp of any
  kind**, so created-time and modification-time cost *exactly the same* to add: one field, one
  serde-shape test, one `metadata()` call inside a `push_if_present` that already stats the file
  for `is_file()`. Once cost is equal, "cheap route" stops being an argument and the only question
  left is which timestamp is *correct*.
- **Measured, not reasoned:** this very WIP file mid-session had birth **08:48** and mtime
  **09:28** — a 40-minute gap. Given `feature-a` (created Monday, edited this minute) and
  `feature-b` (created an hour ago, untouched), **created-time picks `feature-b`, the file you are
  NOT in.** Creation time systematically favors the newest-*started* item over the
  currently-active one, which is backwards for a surface answering "where is this project right
  now?". It is additionally misleading in this workflow, where WIP files are `git mv`'d to
  `archive/` and new ones created — birthtime tracks phase starts, not where the work is.
- **So the answer to the operator's question is "same price, and mtime is the right one"** — which
  restores exactly what WBS task 3.3 asked for originally.

Backend: `DocEntry.mtime_ms: f64` (ms since epoch, `0.0` on stat failure so an unreadable mtime
never makes a doc vanish), mirroring `editor_fs::FileMarker::mtime_ms` in unit, type and serde
shape so the two DTOs cannot drift. ⚠️ `Eq` had to be dropped from the derive (`f64` has no `Eq`);
`PartialEq` is what the tests use. Pinned by three tests: the updated serde-shape test (now also
asserting `mtime_ms` crosses as a **JSON number**, since a stringified value would compile on both
sides and silently make the tiebreak compare lexically), plus two behavioral tests proving
`discover` populates the field from the real file and that two files written 20ms apart carry
genuinely different mtimes.

Frontend: `pickInitialDoc` reduces over same-kind matches taking the greatest `mtime_ms`, with
`>` (not `>=`) so ties — including two `0` stat failures — fall through to `orderDocs`'
deterministic `file_name` order rather than input order. ⚠️ The test fixtures are named so
**alphabetical and mtime order DISAGREE** (`a-stale` older, `z-active` newer); a fixture where
they agree would pass under either implementation and prove nothing. **Both mutations caught:**
reverting to the alphabetical shortcut fails 2 tests, inverting to oldest-wins (created-time-like
semantics) fails 3.

**P2.5 — `[[slug]]` links: LEFT INERT, deliberately.** WP1 measured that the renderer emits them
as literal text with **no `<a>` element at all**, so the delegated handler structurally cannot see
them — this is not a classifier gap a better predicate would close. The alternative was a remark
plugin rewriting `[[slug]]` → a link node. **Declined because the destination does not exist in
this panel:** these slugs resolve to `.claude/memory/*.md`, which is **not** in the curated doc set
(`docs/mod.rs` discovers only `workflow-system/product` + `state`). A plugin would therefore
manufacture links that all resolve to "not one of this project's workflow docs" — strictly worse
than plain text, which at least reads correctly. **Revisit only if memory files ever become
discoverable**; until then the cheap option is also the correct one.

**Selection is DERIVED (`chosen ?? pickInitialDoc(docs)`), not written by an effect.** Third time
this WP that deriving beat syncing: an effect writing `setSelected` when the fetch lands is both a
cascading render (`react-hooks/set-state-in-effect`) and a one-frame flash of "doc list with no
document". Storing the user's *intent* (`chosen`) separately from the *computed* selection is also
what lets WP4 re-run `pickInitialDoc` on a new file without overriding an explicit pick — that
becomes a fact in state rather than something WP4 infers by comparing paths.

**Link handling — three notes worth keeping:**
- `preventDefault()` fires for **every** classified href before any dispatch. Claudesk's window has
  no back button, so a navigated-away webview is unrecoverable; "block first, then decide" is the
  only safe order, and the wiring test asserts the **order**, not just the presence.
- The handler reads `anchor.getAttribute("href")`, **not** `anchor.href` — the DOM property
  resolves against the page origin, turning `wbs.md` into `http://localhost:1420/wbs.md` and
  making every cross-doc link classify as external. Mutation-proven.
- A link resolving outside the curated set (`CHANGELOG.md`, `README.md` — real files deliberately
  excluded from discovery) shows a visible note rather than doing nothing, because a dead click is
  indistinguishable from a broken panel.

**`resolveDocLink` clamps root-escaping paths** (`../../../../etc/passwd` → `etc/passwd` →
not-in-set) so the escaped string is never produced or handed onward. Defense in depth — the
backend re-validates every read against the project root regardless.

**All 5 new wiring arms mutation-proven individually** (resolved `.href`, raw path match instead of
the resolver, `openUrl` removed, auto-select removed, handler unwired) — each failed exactly one
test, baseline and restore green. **Gates:** 1592 frontend tests (136 files), `tsc` 0, lint 0
errors, format clean.

### Phase 2 verify-human (2026-08-02) — APPROVED 7/7, one gap surfaced

**Operator question: "when `.session.md` gets deleted, would it auto-open the next most downstream
md file?"** Investigated rather than answered from the design — and the answer splits:

| When the deletion happens | Behavior today |
|---|---|
| **Before** the workspace is opened | ✅ Correct — lands on the wip file |
| **While the panel is open** | ❌ Panel keeps rendering the deleted doc |

The **ranking is already right** (measured: dropping the `session` entry makes `pickInitialDoc`
return the wip file), but WP3 has no `fs-change` listener, so nothing re-runs it. The panel keeps
showing **stale text from a file that no longer exists** until something else is clicked.

⚠️ **This is routine, not an edge case: `/session-restore` deletes `.session.md` at its step 7,
every restore** — and `.session.md` is the top-ranked doc, so it is exactly what the panel will be
showing. It happened in this very session.

**Correctly scheduled for WP4** (task 4.3's "disappear" row already covers it — added when we
amended that task for jump-on-new-file), so no new backlog item. The row was **sharpened** with two
things its one-line form glossed: (1) the fall-back must fire **even for an explicit user pick** —
uniquely, since the doc it names is gone — and the right move is deleting the `chosen` sentinel,
NOT re-pointing it at `pickInitialDoc`'s answer, which would forge a fake "user choice" and
suppress the next legitimate jump-on-appear; (2) a **deleted-and-recreated** `.session.md` (restore
then handoff) is an APPEAR, and whether `notify` coalesces delete+create is a watcher behavior WP4
must check empirically.

**Pinned now so WP4 inherits a test, not a claim:** three tests in `pickInitialDoc.test.ts` covering
the single deletion, the full cascade through all five ranks, and `null` at the end.

### Phase 2 verify-codify (2026-08-02)

**Audited first — 4 of 7 approved behaviors were already covered**, so only the real gaps got new
tests. Three were genuinely uncovered: in-doc anchor scrolling, `[[slug]]` inertness, and the
explicit-pick-beats-auto **precedence** (pinned only as source text, never as a value).

**Two extractions, both so behavior could be asserted as a VALUE rather than by `?raw`:**
- **`anchorSelector(href)`** — the testable half of anchor scrolling. ⚠️ `CSS.escape` turns out to
  be load-bearing, not decoration: a heading like `## 3. The path` yields an id starting with a
  DIGIT, and `#3-the-path` is an invalid selector that makes `querySelector` **throw** — taking the
  whole delegated click handler down, not merely failing to scroll. Mutation-proven (2 tests fail
  without it).
- **`selectedDoc(chosen, docs)`** — the precedence. A source guard could confirm the expression
  existed but not that explicit-beats-auto holds across inputs, including the case that matters
  (a pick auto-selection would never make) and WP4's constraint (the pick survives a doc set that
  grows or shrinks). Mutation-proven (4 tests fail when the `chosen` branch is skipped).

**`[[slug]]` inertness pinned** — the operator accepted it, so it must not change silently. If
someone adds a remark plugin, three tests now fail and force the decision (and the doc-set question
behind it) to be re-opened deliberately.

⚠️ **A mutation can probe the wrong axis and look like a guard hole.** My first slug probe removed
`rehype-sanitize` — the tests correctly survived, because `[[slug]]` is plain text and never
touches the sanitizer. That result says nothing about the guard. The right mutation *simulates the
change being guarded against* (a plugin rewriting `[[slug]]` into a link), and all three fail under
it. **Match the mutation to the claim, not to whatever is convenient to break.**

**One environment note:** `docLinks.test.ts` now carries `// @vitest-environment jsdom` — scoped
per-file rather than flipping the project default, because `CSS.escape` is a browser global absent
from Vitest's `node` environment (the assertions failed with `ReferenceError: CSS is not defined`
first). jsdom was already a dev dependency, so no new package.

**Gates:** 1624 frontend (136 files) / 725 backend, tsc 0, lint 0 errors, format clean, `cargo fmt`
+ `clippy --all-targets -D warnings` clean.

### Phase 3 build record (2026-08-02)

**P3.1 — live verify via the MCP bridge against a seeded scratch workspace. Found and fixed a
real bug that every unit test missed.**

Seeded `tmp/scratch/scratch-a` with a realistic doc set (5 docs, all four link shapes, a GFM
table, fenced code, a Work Tree, YAML frontmatter) and **deliberately NO `.session.md`** — so the
landing doc is the WIP file, which distinguishes real ranking from "picks the first row."

Verified live, all passing: Docs is the **first tab and active**; 5 rows in re-orientation order;
auto-select landed on `wip/scratch-feature.md` (**not** the first row — the ranking genuinely
fired); frontmatter rendered as its own block with no setext mangling; table (3 headers / 3 rows),
fenced code, and 3 task-list checkboxes with correct checked states, **all `disabled`** (read-only
proven, not asserted); `.docs-content` is `overflow-y: auto` while `.docs-panel` is `hidden`
(WP4's restore target confirmed); cross-doc link moved the selection and re-rendered with
`location.href` **unchanged**; an out-of-set link (`CHANGELOG.md`) showed a clear note instead of
silently doing nothing; `[[slug]]` inert as text with no anchor; external link did **not** hijack
the webview.

⚠️ **THE BUG: `react-markdown` emits NO heading `id`s by default, so every in-doc `#anchor` link
was a dead click.** Long WBS/WIP docs lean on their tables of contents, so this is the common case,
not an edge one. **Unit tests could not catch it** — `anchorSelector`'s tests proved the SELECTOR
was well-formed and never that anything existed to select. *Testing one half of a lookup proves
nothing about the lookup.* Fixed with a `headingSlug` (GitHub's algorithm, six lines, **no new
dependency** — `rehype-slug` deliberately not added) plus a module-scope `components` override, and
re-verified LIVE: the panel scrolled 0 → 85px with the app shell unmoved. Mutation-proven (3 tests
fail without the override). The new test asserts the **round trip** — build the selector the click
handler builds, require it to match a real element.

**Also fixed live:** a stale link-note persisted through a later successful navigation, making a
working click look failed. Cleared on the anchor and external paths too.

**Second `// @vitest-environment jsdom` pragma needed** (`docsRender.test.tsx`) for `CSS.escape`.
⚠️ Worth knowing: that file already builds JSDOM instances via `renderDom`, but that only parses
HTML strings — it does **not** install browser globals. Constructing a JSDOM ≠ running in a DOM
environment.

**P3.2 — CSP posture: evidence gathered, DECISION CARRIED TO VERIFY-HUMAN** (operator call, not
mine). Full table + both options + a recommendation in the "CSP posture decision" section above.
Short version: nothing loads remote content and there is no `eval`, so a CSP is viable — but it
would need `style-src 'unsafe-inline'` (14 inline-style files + CodeMirror/xterm runtime
injection), so it would **not** close the `style`-attribute vector class. Recommendation is to
record `csp: null` as an accepted decision with its compensating controls, and treat setting a
real CSP as a separate hardening task. **Either way `arch.md` must not be left silent** — that
unrecorded posture is the actual defect the SURFACE item names.

**P3.3 — both WP2 MAJORs discharged, and the OFF-invariant guard re-proven.** The fetch-latch
entanglement was fixed at P1.2 (and the StrictMode deadlock it exposed is now pinned by
`fetchLatch.test.ts`); the missing wiring test landed at Phase 1 verify-codify as
`docsPanelWiring.test.ts` (20 tests, every arm mutation-proven individually). The OFF-invariant
guard still passes 14/14 after all of WP3's changes to the `panelHost`/`DocsPanel` neighbourhood,
and **still bites** — probed by making `availablePanels` ignore the gate, which fails 2 arms.

### Phase 3 verify-human (2026-08-02) — APPROVED 3/3; the CSP question resolved into a STRONGER rule

**The operator's answer reframed the question.** I presented a two-option CSP choice (set one vs.
record `csp: null`). The operator asked what CSP even was, then challenged the premise: *"why would
a .md doc have any executable `<script>` other than a genuine code block wrapped in backticks? The
`<script>` tag shouldn't even be working in the first place."* — and concluded **"I want raw HTML to
be blocked."**

**They were right about the format's *intent* and wrong about its *behavior*, and the gap is the
whole point.** Markdown deliberately permits raw HTML (CommonMark — it is why GitHub renders
`<img>`/`<details>` in READMEs). **Measured both directions rather than argued:** with `rehype-raw`,
a plain `.md` containing a bare `<script>` yields a **live script element with executable content**;
without it, **zero**. A fenced code block containing the same text renders as inert `<pre><code>` in
both cases — so the operator's instinct about backticks was exactly correct.

**The requirement was already met — but only incidentally, and that was the real gap.** Verified
against the real shipping component: `script`/`img`/`iframe`/`details` all yield **0 elements**.
What was missing was a test stating the RULE. The hostile-fixture test asserts *"0 live vectors"* and
**would still pass if raw HTML were enabled and only benign tags survived** — so it does not express
"no raw HTML." Added `docsRender.test.tsx` → **"RAW HTML IS BLOCKED"**, which fails for **benign tags
too** (`<details>`, `<b>`). Mutation-proven against the realistic bad change: adding `rehype-raw`
**with the sanitizer still in place** — the shape of a one-line PR adding `<details>` support — fails
it. That mutation is what the old test could not distinguish.

**Recorded in `arch.md`** → "Webview HTML-rendering posture — raw HTML is BLOCKED", with the rule
stated bluntly (any tags, not just dangerous ones) so it needs no threat model to apply, plus its
three independent pins. **This resolves the unrecorded-posture half of
`SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE`** — the defect that item names
is that every feature re-derives the threat model, and now they inherit a written rule.

**CSP itself: agreed as desirable, deliberately NOT set here**, filed as
`SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE` (medium) with a proposed policy and the
surface list. Two reasons, both disclosed to the operator: it needs `style-src 'unsafe-inline'` (14
inline-style files + CodeMirror/xterm runtime injection) so it would **not** close the CSS vector
class; and it is app-wide, where a too-strict policy fails **silently** (blank panel, unpainted
terminal) — needing a full-surface live pass a docs-viewer WP has no reason to run. Offered to do it
immediately; the operator accepted the deferral.

### Phase 3 verify-codify (2026-08-02) — WP COMPLETE

**Audited first; coverage was nearly complete**, because verify-self and verify-human had each
already produced their own pins (the empty-href behavioral + structural arms; the no-raw-HTML
rule). Writing more of the same would have been duplication.

**One genuine gap found, and it is the same class this WP kept paying for.** Three files reason
from *"the app ships with no CSP"* — `docsRenderDeps.test.ts`'s header, `DocMarkdown.tsx`'s, and
`arch.md`'s posture decision — but that premise lived **only in comments**. Nothing asserted
`tauri.conf.json`'s `csp` value, so setting a CSP (or a Tauri default changing) would have
silently invalidated the reasoning in all three without failing anything.

Added a two-test block pinning the premise. ⚠️ **It does not assert `csp: null` is correct** —
the operator has agreed a CSP *should* be set. It asserts the premise is still TRUE, so that
setting one **trips the test and forces the compensating-control comments to be revisited in the
same change**. Mutation-proven: setting `"csp": "default-src 'self'"` fails it, with a message
naming the three files to update. Paired with an anti-vacuity test so a path typo cannot make it
pass against `undefined`.

**Final gates:** 1645 frontend (137 files) / 732 Rust, `tsc` 0, lint 0 errors (1 pre-existing
`XtermPane` warning), `format:check` clean, `cargo fmt` + `clippy --all-targets -D warnings` clean.

---

## WP3 CLOSE SUMMARY

**Shipped:** the Docs panel renders. Read-only formatted markdown, auto-select-on-open, link
navigation, Docs-first tab ordering. `docs_read` went from zero callers to the panel's content path.

**Six defects found across the three phases, four of them in my own work, none by the automated
gates:**
1. **Blank panel** (BLOCKING, verify-human) — a StrictMode latch deadlock I introduced in the fix
   that was supposed to make the latch safer. tsc + lint + 1538 tests + a clean build were all
   green while the panel showed nothing.
2. **Empty-href webview hijack** (BLOCKING, verify-self) — `preventDefault()` below an early
   return; `[click]()` could reload the app shell with no back button.
3. **Dead in-doc anchors** (verify-self, live) — `react-markdown` emits no heading ids, so every
   TOC link was inert. Only findable by driving the real app.
4. **WP1's frontmatter regex** was wrong for a case its own verdict listed as validated.
5. **A CSS guard passing while protecting nothing** — which then exposed a real missing rule.
6. **Six `?raw` vacuities**, the worst being a guard whose *shape* could not express the property
   it was named for.

**The through-line worth carrying:** every one of these was caught by *attacking* the work —
mutation testing, adversarial subagents, driving the live app — and none by running the gates.
Green gates proved the code compiled and the tests ran; they never proved the tests would notice.

## CSP posture decision (P3.2) — EVIDENCE FOR THE OPERATOR CALL

`SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE` (medium, arch) becomes
load-bearing with this WP: WP3 is the first surface to render **untrusted markdown** from 20+
rotating projects, including repos Claudesk did not author. The item's own suggested action is a
choice between two defensible options, and it is **an operator call** — WP3's job is to present
the evidence, not to change the app's security posture unilaterally.

**What is measured today:**

| Fact | Value |
|---|---|
| `tauri.conf.json` → `app.security.csp` | `null` (no CSP at all) |
| Remote content loaded into the webview | **none** — no CDN scripts, fonts, or stylesheets |
| Known outbound endpoint | the updater's `github.com/.../latest.json` (Rust-side, not webview `fetch`) |
| `eval` / `new Function` in `src/` | **none** |
| Files using inline `style={{...}}` props | **14** |
| Runtime `<style>` injection | yes — CodeMirror's `style-mod` and xterm both inject stylesheets |
| Live vectors from the Docs render today | **0** (hostile fixture, 16 probe classes, parsed DOM) |

**Option (a) — set a CSP.** Viable: nothing loads remote content and there is no `eval`, so
`default-src 'self'` + `script-src 'self'` would hold. ⚠️ It would need **`style-src 'self'
'unsafe-inline'`** because of the 14 inline-style files plus CodeMirror/xterm runtime injection —
which means the CSP would NOT block the `style`-attribute vector class WP1 measured. So a CSP
here buys real protection against script/frame/object injection, but **not** against the CSS
vector, and it is not a substitute for the renderer's escaping.

**Option (b) — record `csp: null` as accepted, with compensating controls.** Write it into
`arch.md` as a deliberate decision plus the rule each HTML-rendering feature must follow (what
WP3 already does: `react-markdown`'s default escaping + `rehype-sanitize`, never `rehype-raw`,
pinned by `docsRenderDeps.test.ts` and a 16-class hostile-fixture test).

**Recommendation: (b) now, (a) as a separate hardening task if wanted.** Reasons: WP3's exposure
is already 0 by two independent controls (measured, mutation-proven); a CSP requiring
`unsafe-inline` for styles does not close the one vector class that the sanitizer closes; and
changing app-wide security posture inside a docs-viewer WP couples an arch decision to a feature
ship, with a real regression surface (14 files + two libraries) that this WP has no reason to
test. **What must NOT happen is the status quo — `csp: null` unrecorded, so every future feature
re-derives the threat model from scratch.** That is the actual defect the SURFACE item names.

**Either way this WP must leave `arch.md` with the posture written down.** Carried to verify-human
as the decision point.

## Code-Quality Review — m11-wp3-docs-render-and-navigation

*Reviewer: `code-quality-reviewer` against ship baseline `6f6df23`. **0 CRITICAL / 4 MAJOR / 3
MINOR.** ⚠️ **All 4 MAJOR were FIXED IN PLACE, not backlogged** — a deliberate deviation from
autopilot's auto-backlog default, recorded rather than silent. Three of the four were **verified by
reproducing the reviewer's mutations myself** before acting; each was a test asserting a PROXY for
the property it named, and one of them (MAJOR-2a) **passed the full 1645-test suite while
re-opening the `[click]()` webview-hijack hole this WP had just fixed**. Backlogging a guard known
to be decorative on an invariant whose failure is unrecoverable would have shipped known-broken
verification. The 3 MINOR are backlogged.*

### Strengths (reviewer's)
- Extraction discipline traceable to specific failures rather than style preference —
  `fetchLatch.ts` exists *because* an in-effect latch deadlocked under StrictMode.
- Pairing fetched content with its key makes "one doc's text under another doc's row"
  structurally unrepresentable rather than merely brief.
- The security fixture scores the **parsed DOM** with a negative control requiring every vector
  class to fire — the correct shape, and it answers WP1's false-positive trap directly.
- The `rehype-raw` prohibition pinned at three independent layers, with the header comment
  correcting its own earlier wrong claim about which control is load-bearing.
- The `csp: null` arm converts a premise that lived only in comments into something that trips.

### MAJOR-1 — `resolveDocLink`'s `fragment` was computed, documented, and DISCARDED ✅ FIXED
The module's own doc comment said the fragment is split off *"so the caller can scroll to it —
`wbs.md#probe-outcomes` should land on the section, not just the file"*. The only caller never read
it. **A comment promising behavior the code does not perform is worse than an unimplemented
feature**, because it stops the next reader from noticing the gap. Implemented: the handler now
polls briefly for the target (the doc has not rendered at click time — `setChosen` only schedules
the switch and content arrives after an async read), bounded at 20 attempts so a missing heading
gives up quietly rather than spinning. Three behavioral tests; mutation-proven.

### MAJOR-2 — the `preventDefault` guard was STILL a proxy ✅ FIXED (the important one)
The arm I had *just* rewritten to replace a proven-vacuous predecessor counted `return` tokens above
`preventDefault()`. **Reproduced the reviewer's mutation: folding the empty-href bail into the
anchor guard keeps the count at 1 and the ENTIRE 1645-test suite passes — while re-opening the
exact `[click]()` app-shell-reload hole.** A second mutation (`const later = () => e.preventDefault()`,
never invoked) also passed.

⚠️ **The pattern, now three iterations deep: I kept writing better `?raw` predicates when the
problem is that `?raw` cannot express a behavioral property at all.** A source-text predicate
encodes only the shapes you thought of.

### MAJOR-3 — the behavioral test tested a COPY, not the code ✅ FIXED (the root cause)
`docsLinkHandling.test.ts` re-implemented the handler's guard order, so mutating the real component
left it green — the two guards shared a blind spot rather than covering complementary halves. The
reviewer named the fix exactly: **probe the component, not the replica.** The handler was extracted
to `handleDocLinkClick.ts` as a factory over its dependencies and is now **imported** by the test.
**Re-ran MUT-A against production code: it now FAILS.** The source-order arm was deleted outright
rather than re-patched, with a comment saying not to re-add that shape.

### MAJOR-4 — the per-instance guard missed `export const` ✅ FIXED
Predicate `/^(const|let|var)\s/` walked straight past `export const sharedCache = new Map()` at
module scope — **the single most likely way someone would actually break per-instance isolation**.
One missing token. Widened and mutation-proven in isolation.

### MINOR (backlogged)
- **Comment density has tipped past useful** — 80% comment lines in `frontmatter.ts`, 69% in
  `pickInitialDoc.ts`, 68% in `classifyHref.ts`. The *measurements* earn their place; the process
  narration (which phase found what, what a prior draft claimed) does not. The reviewer's
  discriminator is good: **does the sentence survive once the WIP is archived?**
- `selected` is recomputed each render and feeds the content effect — harmless today (a string),
  worth a note before WP4 re-runs discovery against it.
- `headingSlug` does not de-duplicate colliding ids; GitHub appends `-1`, so "mirrors GitHub's
  algorithm" overstates by one rule. Long WBS docs with repeated section names are the likeliest
  corpus to hit it.

### Assessment (reviewer's)
> *"Well-built work whose engineering judgment is consistently better than its verification claims…
> three of the four MAJORs are tests that assert a proxy for the property they name and pass under
> mutations a reviewer can construct in minutes — which matters here more than usual, because this
> WP's own history is six vacuous guards found and replaced, and the replacements inherit the same
> shape. The remedy is not more `?raw` arms but mutation-probing the component rather than the copy
> of it."*

**That diagnosis is correct and is now acted on.** Gates after the fixes: **1649 frontend (137
files) / 732 Rust**, tsc 0, lint 0 errors, format clean.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`/feature-finalize` archives this file.

## Current Node
- **Path:** Feature > review-quality (complete) > finalize
- **Active scope:** none — review-quality complete (0 CRITICAL / 4 MAJOR fixed in place / 3 MINOR backlogged). Next: `/feature-finalize`.
- **Push state:** 37 commits unpushed on `main` (was 36 at session start). Deliberate — no close skill auto-pushes and publishing is the operator's standing call.
- **Blocked:** none
- **Unvisited:** none
- **Phase 1 codified:** 1562 frontend / 723 backend tests green; `docsPanelWiring.test.ts` added (11 tests, every arm mutation-proven individually), resolving `SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-HAS-NO-WIRING-TEST`
- **Open discoveries:** one logged below (the WP1 frontmatter-regex correction) — belongs in
  `wbs.md`'s WP1 verdict so a future reader does not copy the broken pattern

## Method notes carried from WP1 (do not re-derive)

1. **Assert the parsed live DOM, never source text** for anything security-shaped. WP1's first
   danger predicate counted the fixture's own heading prose and `&lt;`-escaped inert text as
   live vectors. Same class as the `?raw`-guard trap in `CLAUDE.md`.
2. **A security guard must be mutation-proven, not merely present.** WP1's *corrected* predicate
   still had a hole (no `style`-attribute probe), which made its "0 danger" result
   under-determined. Any sanitization test here includes a style-attribute probe **and** a
   mutation check — and `[[verify-the-mutation-landed]]`: confirm the mutation changed
   *executable code* before believing a pass.
3. **Idempotence is a property, not a byte count.** WP1's fixture grew while the probe ran;
   assert "two renders of the same input are identical", never a literal size.
4. **`renderToStaticMarkup` from `react-dom/server`** makes render output string-assertable with
   no new test dependency — this is what lets WP3 pin the render as a value without adopting
   RTL or re-opening `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`.
5. **The guard-vacuity class recurred three times in one WP2 session**, twice in guards written
   minutes after fixing the same hole elsewhere. Assume every new `?raw` guard in this WP has
   it until proven otherwise.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-08-02] Phase 3 verify-self — **a BLOCKING defect in the invariant this WP treated
as its most important**, found by a subagent told to attack the claim, independently re-verified,
fixed in place with two mutation-proven guards.

**The bug:** `if (kind === "empty") return;` sat ABOVE `e.preventDefault()`. Markdown `[click]()`
renders a live `<a href="">` — **measured, it survives the sanitizer** — which classifies as
`empty` and took that early return with the click still cancelable. In a WKWebView an empty href
navigates to the **current URL**, i.e. an app-shell reload, and Claudesk's window has no back
button. The file's own comment two lines above said *"block first, then decide"* and the code did
the opposite. Fixed by moving `preventDefault()` above classification entirely.

**⚠️ The more important half: the test named for this invariant PASSED throughout.** It compared
source-text indices of `preventDefault` against the `external` branch — an ordering check between
two positions I happened to name, **structurally blind to a third statement between them**. This
is the sixth `?raw` vacuity in this WP and the most consequential, because the guard was not
merely weak: its shape *could not* express the property. **Generalizable: a source-order guard can
only compare the positions you thought of; it cannot see the statement you did not.** CLAUDE.md's
rule — `?raw` verifies STRUCTURE, never RUNTIME — names exactly this, and I wrote the guard anyway.

**Replaced with two arms that bite independently, each mutation-proven against the ORIGINAL bug:**
- `docsLinkHandling.test.ts` (new, 11 tests) — **behavioral**: dispatches a real click at a real
  anchor and reads `defaultPrevented`. One case per classifier class plus the empty-href
  regression, plus an anti-gap test that fails if `classifyHref` grows a class with no case. Under
  the restored bug: **2 fail**.
- The rewritten structural arm in `docsPanelWiring.test.ts` — asserts **no `return` precedes
  `preventDefault`** within the handler body (the one honest structural claim), rather than
  comparing two named positions. Under the restored bug in the real component: **1 fails**.

⚠️ Recorded limitation: the behavioral test re-implements the handler's guard order rather than
importing the component (no render harness — `SURFACE-2026-07-31`), so the copy could drift. The
structural arm is what catches drift; **neither is sufficient alone**, which is why both exist.

**Everything else the subagent challenged held**, each verified by mutation rather than inspection:
heading-id override genuinely wired (removing it fails 3), `headingSlug` ↔ `anchorSelector`
genuinely coupled (mutating either half fails the round-trip), both `@vitest-environment jsdom`
pragmas empirically in effect, `.docs-content`/`.docs-panel` scroll split correct, checkboxes
`disabled`, out-of-set note wired. **The OFF-invariant guard was probed on all five arms
individually — each failed exactly one arm, so none masked another** — including a re-run of
M10.9 WP5.2's probe-5b shape in `panelHost.ts`, which now correctly fails (M11.5 WP4's fix holds).

Backend: 732 Rust tests pass. `rehype-raw` absent from `package.json` AND `pnpm-lock.yaml` — not
even transitively.

[SHORTCUT-2026-08-02] Phase 2 verify-self — THREE vacuous tests fixed in place, each
mutation-proven in ISOLATION afterward. A subagent instructed to attack the work found all three;
I re-measured each myself rather than accepting the report, and the most important one turned out
to be worse than reported.

1. **⚠️ `resolveDocLink`'s clamp test was structurally incapable of testing the clamp** — and my
   first fix for it was ALSO wrong. The subagent said the fixture's `..` count was absorbed by the
   source doc's 2-segment prefix; I "fixed" it with a root-level source doc, re-ran the mutation,
   and it STILL passed. Only then did I read the function properly: `resolveDocLink` normalizes
   **both** candidates *and* the reported `attempted`, so **no input distinguishes clamped from
   unclamped output**. The clamp is unobservable through the public function; the test was
   measuring normalization and would have kept passing with the guard deleted. Fixed by exporting
   `normalizePath` **solely for testing** (documented as such) and asserting the clamp directly.
   **Generalizable lesson: when a guard's effect is swallowed by a later stage of the same
   pipeline, no amount of widening the outer test's inputs can help — the output is invariant by
   construction. Test the guard directly or admit it is untested.**
2. **The creation-time regression test's fixtures AGREED with the fallback.** `long-running`
   (mtime 9000) was also alphabetically first, so it passed with the mtime logic entirely deleted.
   Renamed to `z-long-running` / `a-recently-started` so alphabetical and mtime order genuinely
   disagree — now only mtime-recency can select the right file. (The *primary* tiebreak test was
   always sound; this was the belt-and-braces one that wasn't.)
3. **"`selected` is per-instance" was claimed in prose but asserted nowhere.** Replaced with the
   structural fact that actually guarantees it: **zero module-level bindings** in `DocsPanel`, so
   React scopes every `useState`/`useRef` per instance. Mutation-proven by hoisting one `const` to
   module scope.

⚠️ **Method note that paid twice here:** mutation-prove each fixed test with a `-t` FILTER, in
isolation. A test that only fails as part of a group tells you nothing about that specific test —
and in finding 2 the isolated run is exactly what showed my first patch had silently not applied
(Prettier had reflowed the lines my matcher expected).

Gates: 1608 frontend tests (136 files), tsc 0, lint 0 errors, format clean, tree clean.

[SHORTCUT-2026-08-02] Phase 1 verify-self — the hostile-fixture test's documented CLAIM was
corrected in place (not the code). A verification subagent, instructed to attack rather than
confirm, found that the build's "adding `rehype-raw` fails the security test" claim was FALSE as
stated: my original mutation removed `rehype-sanitize` at the same time. Re-measured directly
across three configurations, each mutation confirmed landed in executable code:
`raw + sanitize -> 0` · `raw alone -> 6` (now 14, see below) · `neither -> 0`. **The two controls
are REDUNDANT, not layered** — so the hostile-fixture test does NOT catch adding `rehype-raw`
while the sanitizer stays. Fixed by correcting the overstated comments in `DocMarkdown.tsx` and
`docsRender.test.tsx` to state the measured matrix, and by pointing the `rehype-raw` guarantee at
`docsRenderDeps.test.ts` (which pins the dependency directly and IS mutation-proven on both the
`dependencies` and `devDependencies` arms). Also widened `liveVectors()` from 8 to 16 probe
classes (`svg`, `math`, `form`, `base`, `meta`, `link`, `formaction`, `xlink`) after the same
review noted the predicate could not SEE them — an unprobed class is exactly what made WP1's own
predicate under-determined. Fixture extended to carry each shape and the negative control updated
to require all 16 fire; the widened predicate now detects **14** classes under `rehype-raw` alone,
up from 6. Re-verified: 14/14 in the file, 1538/1538 suite, tsc 0, lint 0 errors, format clean.
Gates: (1) trivial extension of P1.4's just-written test scaffolding + comment accuracy; (2) fresh
model invocation (the subagent) produced the finding, and the corrected matrix was re-measured
directly by the orchestrator; (3) this entry.

[SURFACED-2026-08-02] Phase 1 > P1.5 — `docsPanelStyles.test.ts` used a SUBSTRING check
(`css.includes('.' + cls)`) for class existence, so a longer class sharing the stem satisfied
it. Fixed here with a boundary matcher, which immediately exposed a real missing `.doc-markdown`
rule in this WP's own CSS. **8 other test files read `App.css` and were NOT audited** — logged
as `SURFACE-2026-08-02-CSS-CLASS-GUARDS-MAY-USE-SUBSTRING-NOT-BOUNDARY-MATCH` (medium) in
`backlog.md`, since auditing them is cross-cutting test hygiene rather than WP3 scope.

[SURFACED-2026-08-02] Phase 1 > P1.3 — WP1's recorded frontmatter regex does not handle the
leading-thematic-break case its own verdict lists as validated; it captures a real paragraph as
YAML. Corrected in place in `wbs.md` → "Probe outcomes" (with the measurement and the
mutation-proof) rather than only here, because that verdict is the artifact future work copies
the pattern from. Not a backlog item — resolved at source.

[SURFACED-2026-08-02] Phase 2 > P2.1 — WBS task 3.3 specifies "most-recently-modified wip" for
the auto-select ranking, but the backend `DocEntry` DTO carries no mtime (`rel_path`, `kind`,
`file_name` only). `editor_fs::FileMarker` already computes `mtime_ms`, so the seam exists, but
consuming it means a backend DTO change plus its serde-shape test. Decided in-build at P2.1 with
a no-backend-change fallback (the existing deterministic `file_name` tiebreak). Not logged to
backlog.md — it is resolved within this WP, not deferred.
