# Feature: M11 WP1 — Probe: markdown render approach (fidelity, links, live-region, CSP)

**Workflow:** feature
**State:** **COMPLETED 2026-08-01** — shipped `d467877`, review pass `e971d22`, finalized + archived. Not pushed (operator's call).
**Created:** 2026-08-01
**Drive mode:** autopilot
**WBS:** `workflow-system/product/wbs.md` → WP1 (M11: Workflow-docs markdown viewer)
**Type:** probe (knowledge-producing; the deliverable is a written verdict, not shipped UI)

## Problem Statement

M11 renders the conventional workflow docs as **formatted, read-only** markdown in a 4th `RightPanelHost` panel. No markdown *renderer* exists in this repo today (`@codemirror/lang-markdown` is editor syntax-highlighting, not a formatted renderer), so WP3 would otherwise be built against an assumed renderer API, an assumed link model, and an assumed re-render contract. WP1 settles those cheaply first: pick the renderer + dependency, determine how in-doc / cross-doc / external links are intercepted, decide how YAML frontmatter renders, and confirm the render is a pure content→DOM function that can be re-rendered in place with a preserved scroll offset (which is what WP4 depends on). The deliverable is a verdict written into `wbs.md` → "Probe outcomes" — **no production UI ships in this WP**.

**Timebox:** half-day. **Gates:** WP3.

### Scope corrections found at plan time (read before Phase 1)

Audited the WBS's WP1 task list against the tree rather than trusting it — the method that caught three mis-specified tasks in M11.5 and two in M11's own activation audit. **Three corrections; the WP's shape and size stand.**

1. **⚠️ `"csp": null` — the app ships with NO Content-Security-Policy.** `src-tauri/tauri.conf.json:21-23` sets `"security": { "csp": null }`. Task 1.3's "confirm the renderer runs under Claudesk's webview CSP" is therefore **not the real question** — there is no CSP to run under, and no CSP violation can occur. The question **inverts** into the one that actually carries risk: with no CSP backstop, **sanitization is the only line of defense**, so the renderer choice must be evaluated on what it does with hostile markdown (raw `<script>`, `<img onerror>`, `javascript:` hrefs) *on its own*. Reframed as task 1.3. Do **not** report "CSP OK" — that would be a vacuous pass over an absent control, the same failure class as `[[verify-the-mutation-landed]]`.
   - **Threat model, stated honestly so the probe isn't security theater:** the docs rendered are the operator's own workflow files, which CC itself writes. This is not untrusted input in the web sense. But (a) Claudesk opens 20+ rotating projects including ones it did not author, (b) `xss`-shaped content can arrive in a doc innocently (a `backlog.md` quoting an HTML snippet in a finding), and (c) with no CSP a rendered `<script>` executes **with full `__TAURI_INTERNALS__` access** — i.e. the app's whole IPC surface. So: sanitize, and prove it with a hostile fixture. The verdict must state the residual risk in one line, not claim safety it hasn't shown.
2. **The external-link seam already EXISTS and is granted — it is not an open question.** `tauri-plugin-opener` is in `Cargo.toml:35`, registered at `lib.rs:152`, and `opener:default` is granted in **both** `capabilities/default.json:8` and the `tauri.dev.json` inline dev capability (which, per its own comment, must re-list base perms or it suppresses them). **It has zero frontend callers today** — `@tauri-apps/plugin-opener` is in `package.json` dependencies but never imported in `src/`. So task 1.2's external-link half is **confirm the call shape of an available seam**, not evaluate options. Narrowed accordingly.
3. **⚠️ No React component-render harness exists** (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`): `@testing-library/react` is not a dependency and **not one of ~127 test files renders a component**. Every frontend test is a pure-function test or a source-text guard. This is a **selection criterion WP1 must weigh, not a WP3 surprise**: a renderer whose output can be asserted as a **string** (parse → HTML string → assert) is pinnable under the current posture; one that only produces a React element tree is not, and would either ride live-MCP-verification only (not a regression gate) or force the harness decision that backlog item deliberately left open. WP1 reports this per option; it does **not** decide whether to adopt a harness (that is the backlog item's call, and out of this WP's scope).

### Not in scope (guarding the timebox)

- **No panel, no tab, no chord, no `"docs"` identity anywhere.** That is WP2, and adding `"docs"` to the `RightPanel` union *alone* fails the OFF-invariant guard (measured at activation). This WP must not touch `panelHost.ts`, `RightPanelHost.tsx`, or the `RightPanel` type. **Probe artifacts live under `src/probe/`** (the repo's existing dev-only harness dir) — never in `components/workspace/`.
- **No dependency is added to `package.json` in this WP.** The verdict *names* the dep; WP3 task 3.1 installs it. Spiking may install into a throwaway dir under `tmp/`, which is gitignored — if a dep must be installed in-repo to spike honestly, it is **reverted before Phase 3 closes** and the verdict says so.
- **No auto-select rule, no doc discovery, no `docs_list`/`docs_read`.** WP2/WP3.
- **The renderer is not integrated with anything.** Fidelity is judged against real doc content in a standalone harness.

## Work Tree

- [x] Phase 1: Renderer fidelity spike — the two realistic options against real docs  <!-- status: COMPLETE 2026-08-01 — all impl tasks + all 4 verification nodes [x]. Headline: fidelity is a DEAD HEAT, so the verdict now rests on Phase 2. -->
  **Observable outcomes:**
  - CLI: a standalone node script per option (`tmp/mdprobe/<option>.mjs`) parses this repo's real `workflow-system/product/wbs.md` **and** a real Work-Tree WIP file, writes HTML to `tmp/mdprobe/out-<option>.html`, and exits 0.
  - CLI: `grep -c 'type="checkbox"' tmp/mdprobe/out-<option>.html` returns **≥ 20** for the WIP file — GFM task-list checkboxes render as real checkbox inputs, not literal `- [ ]` text. (The Work-Tree WIP files carry dozens; a single-digit count means the GFM task-list extension is not active.)
  - CLI: `grep -c '<table' tmp/mdprobe/out-<option>.html` ≥ 1 and `grep -c '<pre' ...` ≥ 1 for a fixture containing a GFM table + a fenced code block — tables and fenced code both render as structural HTML.
  - CLI: the YAML frontmatter block (`---`…`---` at file head) does **not** appear as a broken `<table>` or `<hr>`-mangled text; the script prints the first 200 chars of rendered output for eyeball confirmation, recorded in the WIP.
  - Console: each script runs with no unhandled exception on either real doc.
  - [x] P1.1 Create the spike dir and install both option sets — option A `marked` + `dompurify`, option B `react-markdown` + `remark-gfm` + `rehype-sanitize`. Record installed versions + transitive dep count + size per option.  <!-- status: done — A=5 pkgs/4.4M, B=107 pkgs/43M. NOTE: dir relocated OUT of the repo (scratchpad) after an in-repo `tmp/` install modified the tracked pnpm-lock.yaml; see "Footprint incident" in Probe notes -->
  - [x] P1.2 Write one render script per option against the two real docs (`workflow-system/product/wbs.md` + archived `m5-wp5-…md`, 78 checkbox items). Emit HTML to disk.  <!-- status: done — optA.mjs / optB.mjs, 4 HTML outputs -->
  - [x] P1.3 Measure the fidelity outcomes above (checkbox count, table, fenced code, frontmatter treatment) per option; record the numbers in `## Probe notes` in this WIP.  <!-- status: done — DEAD HEAT on every metric; checkbox 78/78 matches source truth exactly -->
  - [x] P1.4 Decide frontmatter treatment based on what each renderer actually emits for a leading `---` fence.  <!-- status: done — both MANGLE it identically (opening fence → <hr>, closing → setext <h2>); DECIDED: shared pre-strip regex, renderer-agnostic, validated on 6 edge cases -->
  - [x] verify-auto  <!-- status: done 2026-08-01 — all 4 gates UNCHANGED vs the handoff baseline (127 files/1470 tests, tsc 0, eslint 0 errors + the 1 pre-existing XtermPane warning, format:check clean); dependency manifests provably untouched -->
  - [x] verify-self  <!-- status: done 2026-08-01 — 8/8 PASS, 0 BLOCKING, 0 COSMETIC; subagent RE-DERIVED every number from its own commands (fresh renders to new filenames), did not read claimed values back. See "Phase 1 verify-self" in Probe notes -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED 2026-08-01 (F11) — drive_mode=autopilot; all 4 auto-skip gates clean (autopilot + verify-self 8/8 PASS + no integration boundary + no outcome cites a consuming surface). ⚠️ Flagged in chat as the skill's documented decision-artifact false-positive shape (a probe's deliverable IS measurements), with the full decision-input summary printed for operator read-time veto. No renderer chosen yet — that verdict is P3.3. -->
  - [x] verify-codify  <!-- status: done 2026-08-01 — DELIBERATELY CODIFIED NOTHING (0 tests added; suite stays 127 files/1470). Rationale in "Phase 1 verify-codify" under Probe notes: every verified behavior is either third-party-library behavior against libs NOT installed here (a test importing `marked` would fail at collection — package.json is deliberately clean) or a property of a transient spike. The one honest candidate — the frontmatter pre-strip regex — is DEFERRED to WP3's verify-codify, because codifying it now would require inventing the production module + its API shape before WP2 decides where the docs panel lives. -->

- [x] Phase 2: Sanitization under no-CSP + link-model determination  <!-- status: COMPLETE 2026-08-01 — all impl tasks + all 4 verification nodes [x]. Headline: THE TIE IS BROKEN — A=4 live vectors on defaults needing 3 individually-necessary options + a hook to reach 0; B=0 with no configuration. -->
  **Observable outcomes:**
  - CLI: a hostile-markdown fixture (`tmp/mdprobe/hostile.md`) containing at minimum a raw `<script>alert(1)</script>`, an `<img src=x onerror=alert(1)>`, a `[link](javascript:alert(1))`, and a raw `<iframe>`, rendered through each option's **sanitizing configuration**, produces HTML where `grep -ci '<script\|onerror=\|javascript:\|<iframe' out-hostile-<option>.html` returns **0**.
  - CLI: the same fixture rendered through each option **without** its sanitizer returns a **non-zero** count for that same grep — proving the sanitizer is what removed them, not the parser incidentally. (This is the `[[verify-the-mutation-landed]]` discipline: a passing sanitization check that would pass identically with the sanitizer removed proves nothing.)
  - CLI: for a fixture containing an in-doc anchor `[a](#heading)`, a cross-doc link `[b](wbs.md)`, and an external `[c](https://example.com)`, the rendered HTML retains all three hrefs in a form a click handler can read — `grep -o 'href="[^"]*"' out-links-<option>.html` prints exactly `#heading`, `wbs.md`, `https://example.com` (order-insensitive). Confirms the sanitizer does not strip the relative/anchor hrefs the panel needs to intercept.
  - CLI: `grep -rn "plugin-opener" src-tauri/capabilities/default.json src-tauri/tauri.dev.json` exits 0 for both files — the external-open seam's grant is confirmed present in prod **and** dev capability sets (already true; this pins it as a recorded fact, since the dev overlay suppresses base perms if not re-listed).
  - [x] P2.1 Build the hostile fixture and run it through both options **with** their sanitizer; record the counts.  <!-- status: done — 8-vector hostile.md + a benign section; measured via LIVE-DOM predicate after the source-text regex proved to false-positive. A-sanitized=2 live vectors (NOT zero), B-default=0, B-raw-sanitized=0 -->
  - [x] P2.2 Run the same fixture through both options **without** the sanitizer; confirm non-zero counts (the negative control). If an option is safe-by-default with no sanitizer, that is a genuine finding — record it as such rather than forcing a control that cannot exist.  <!-- status: NOT-STARTED -->
    **⚠️ Phase 1 verify-self already established the expected asymmetry here.** CONFIRMED: B escapes raw HTML by default, so its honest control required opting into `rehype-raw` — `B-default` is **safe-by-default** and `rehype-sanitize` is defense-in-depth there. A's control fired loudly (8 live vectors).  <!-- status: done — A-unsanitized=8 live vectors incl. IMG@onerror + DIV@onclick (enumerated); B-raw-unsanitized=3. Neither sanitized pass is vacuous. -->
  - [x] P2.3 Build the three-link fixture; confirm each option's sanitizer preserves anchor + relative hrefs.  <!-- status: done — the realistic failure did NOT materialize: relDoc/anchor/external/checkbox/table/code all survive identically in ALL SIX variants -->
  - [x] P2.4 Determine the **interception mechanism** per option + confirm the `openUrl` signature.  <!-- status: done — delegated click handler (`closest("a[href]")` + preventDefault) works identically for BOTH options, so this axis does NOT discriminate. Classifier validated on 8 link shapes incl. the protocol-relative `//host` trap. openUrl(url: string|URL, openWith?) confirmed from index.d.ts -->
  - [x] verify-auto  <!-- status: done 2026-08-01 — all 4 gates UNCHANGED vs baseline (127 files/1470 tests, tsc 0, format:check clean); dependency manifests untouched with all 8 spike deps absent incl. this phase's rehype-raw -->
  - [x] verify-self  <!-- status: done 2026-08-01 — run 1: 9 PASS + 1 BLOCKING (predicate missed the style-ATTRIBUTE vector, making the hardened "0" under-determined). Fixed in place via the shortcut (3 gates held); run 2 (FRESH subagent): 6/6 PASS, mutation-proof attributed per-probe, 15-class adversarial pass found no BLOCKING gap. 2 COSMETIC latent gaps logged (img[srcset], track[src]). -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED 2026-08-01 (F11) — drive_mode=autopilot; all 4 gates clean (autopilot + verify-self all-PASS after the in-place fix + no integration boundary + no outcome cites a consuming surface). ⚠️ Flagged in chat AGAIN as the documented decision-artifact false-positive shape — and more consequentially than Phase 1, since this phase BROKE THE TIE. The full A-vs-B tradeoff table + the honest counter-argument for A (20× lighter deps; B's zero is structural avoidance contingent on never enabling rehype-raw) were printed for operator read-time veto. Verdict remains formally P3.3. -->
  - [x] verify-codify  <!-- status: done 2026-08-01 — DELIBERATELY CODIFIED NOTHING (0 tests; suite stays 127/1470). Rationale in "Phase 2 verify-codify" under Probe notes. The link classifier is the one honest candidate and is DEFERRED to WP3 — no home exists (zero link-class/docs modules, zero openUrl call sites), AND its shape depends on the P3.3 renderer verdict (B may route via a components={{a}} override rather than a delegated handler). -->

- [x] Phase 3: Re-render-in-place safety + verdict  <!-- status: COMPLETE 2026-08-01 — all impl tasks + all 4 verification nodes [x]. VERDICT DELIVERED to wbs.md → "Probe outcomes": Option B (react-markdown + remark-gfm + rehype-sanitize). -->
  **Observable outcomes:**
  - CLI: for the chosen option, a script renders content A, captures the output, renders content B into the same target, and re-renders A — the final HTML string is **byte-identical** to the first render of A. Proves the render is a pure content→DOM function with no accumulated internal state (the property WP4's scroll-preserve depends on).
  - CLI: the chosen renderer exposes no internal scroll container — verified by asserting the rendered output contains no element with an inline `overflow`/`scroll` style and no renderer-owned wrapper that would own scroll instead of the panel. Recorded as an explicit statement in the verdict, since WP4 restores `scrollTop` on a container **the panel owns**, not one the renderer created.
  - CLI: `pnpm test` exits 0 and `./node_modules/.bin/tsc --noEmit` exits 0 — the repo's gates are unaffected (this WP ships no production code, so the gates must be **unchanged**, not merely passing).
  - CLI: `git status --short` shows no modification to `package.json`, `pnpm-lock.yaml`, or anything under `src/components/workspace/` — the probe left no production footprint.
  - CLI: `wbs.md` "Probe outcomes" section contains the verdict — `grep -c "WP1 verdict" workflow-system/product/wbs.md` ≥ 1.
  - [x] P3.1 Run the render-idempotence check (A → B → A byte-identical) on the chosen option.  <!-- status: done — BOTH options byte-identical (A 31367B, B 32523B) AND stable across 5 alternating cycles; tested with a single REUSED DOMPurify instance (the realistic component shape, where hidden state would accumulate) -->
  - [x] P3.2 Confirm the scroll-ownership property.  <!-- status: done — neither renderer emits an inline overflow/scroll/height style or a wrapper root; both produce a FLAT SIBLING LIST (54 top-level nodes), so the PANEL owns scroll. WP4's scrollTop restore is safe. -->
  - [x] P3.3 Write the **verdict** into `wbs.md` → "Probe outcomes".  <!-- status: done — VERDICT: Option B (react-markdown + remark-gfm + rehype-sanitize). Full verdict incl. the never-add-rehype-raw rule, frontmatter pre-strip, link model, openUrl signature, testability finding, and 2 method notes. -->
  - [x] P3.4 Tear down + confirm the four no-footprint outcomes.  <!-- status: done — manifests CLEAN, all 8 spike deps absent, src/ untouched, verdict present in wbs.md; gates unchanged (1470 tests, tsc 0) -->
  - [x] verify-auto  <!-- status: done 2026-08-01 — all 4 gates UNCHANGED vs baseline (127 files/1470 tests, tsc 0, format:check clean, eslint 0 errors + the 1 pre-existing XtermPane warning); manifests untouched with all 8 spike deps absent. PLUS a verdict-consistency check specific to this phase: the 3 packages named for WP3 to install (react-markdown@10 / remark-gfm@4 / rehype-sanitize@6) match exactly what was installed and measured, and the never-add-rehype-raw rule is stated unambiguously. -->
  - [x] verify-self  <!-- status: done 2026-08-01 — run 1: 5 PASS + 1 BLOCKING (the VERDICT's counter-argument measured node_modules size, not bundle cost; 43M contaminated by React). Corrected in place via the shortcut (3 gates held); run 2 (FRESH subagent): 6/6 PASS, bundle figures reproduced within 0.1 KB with its own esbuild invocation, externals verified honored, no stale framing survives. Both subagents independently concurred with Option B on the corrected numbers. -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED 2026-08-01 (F11) — drive_mode=autopilot; all 4 gates clean (autopilot + verify-self all-PASS after the in-place verdict correction + no integration boundary + no outcome cites a consuming surface). ⚠️ THIRD and STRONGEST instance of the documented decision-artifact false-positive shape — this phase's deliverable IS the verdict WP3 builds against. Full decision table + the corrected bundle figures + the honest supply-chain reservation printed in chat for operator read-time veto, explicitly framed as "the cheap moment to object, before WP3 installs anything." -->
  - [x] verify-codify  <!-- status: done 2026-08-01 — DELIBERATELY CODIFIED NOTHING (0 tests; suite stays 127/1470). Structural reason now absolute: ZERO WP1 code exists in the repo (src/ untouched), no docs module, react-markdown not installed — nothing to test against. Scroll-ownership + link-classifier tests DEFERRED to WP3/WP4 where their module will exist. -->

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** none — **all 3 phases complete**, every impl task and every verification node `[x]`. WP1's deliverable (the renderer verdict) is written to `wbs.md` → "Probe outcomes". Ready to ship.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 5 — (1) pnpm install inside gitignored `tmp/` writes the repo lockfile; (2) A vs B tied on fidelity; (3) A passes raw HTML verbatim / B escapes it; (4) **the app ships with `csp: null` and no second line of defense** (logged, arch-level); (5) **DOMPurify defaults leave a live `<style>` + an executable `data:image/svg`** — closeable only with a hand-written hook (logged, conditional on the verdict)

## Probe notes
<!-- P1.3 / P2.x measurements land here as they are taken; the distilled verdict goes to wbs.md at P3.3. -->

### Phase 1 — fidelity (measured 2026-08-01)

**Spike location:** the scratchpad (`…/scratchpad/mdprobe/`), **not** `tmp/` in-repo — see the footprint incident below. Fixtures: the live `workflow-system/product/wbs.md` and the archived `m5-wp5-pip-toggle-lifecycle-autosummon.md` (78 checkbox items — the richest Work Tree in the archive).

**Versions installed:** A = `marked@18.0.7` + `dompurify@3.4.12`; B = `react-markdown@10.1.0` + `remark-gfm@4.0.1` + `rehype-sanitize@6.0.0` (+ `remark-frontmatter@5.0.0` for the P1.4 test). `jsdom@30.0.1` is probe-only (Phase 2 needs a DOM for DOMPurify in node) and would **not** ship.

**Dependency footprint — the one axis with a decisive spread.** Measured via isolated installs in two clean dirs:

| | transitive packages | node_modules size | own package size |
|---|---|---|---|
| **A** `marked` + `dompurify` | **5** | **4.4M** | marked 464K · dompurify 1.7M |
| **B** `react-markdown` + `remark-gfm` + `rehype-sanitize` | **107** | **43M** | 80K · 44K · 44K |

B's own packages are tiny (168K combined); the weight is the transitive unified/remark/mdast/hast/micromark chain. B's 43M includes React itself (already in the app), but the ~100-package remark chain is net-new regardless.

**Fidelity — a dead heat.** Identical on every metric, both docs:

| metric | A-wbs | B-wbs | A-wip | B-wip |
|---|---|---|---|---|
| `type="checkbox"` | 21 | 21 | **78** | **78** |
| `<table` | 0 | 0 | 1 | 1 |
| `<pre` | 2 | 2 | 0 | 0 |
| `<h2` | 9 | 9 | 13 | 13 |

- **Checkbox count matches source truth exactly** (`grep -c '^\s*- \[[ x]\]'` on the WIP fixture = **78**). Both clear the plan's ≥20 bar; GFM task-lists are active in both.
- **Both emit `<input type="checkbox" disabled>`** — non-interactive by default, which is what the read-only viewer wants (WP3 task 3.2 gets this free).
- **One real difference:** B adds `class="task-list-item"` to the `<li>`; A emits a bare `<li>`. B therefore hands WP3 a free styling hook; under A, styling task rows needs a CSS `li:has(input[type=checkbox])` selector or a custom `marked` renderer. Minor, but it is the *only* fidelity-adjacent asymmetry found.
- Tables, fenced code, headings, inline code all render structurally in both.

**P1.4 — frontmatter treatment. DECIDED: pre-strip, shared by both options.**

Baseline (both options, unfixed) **mangles** the leading YAML block, exactly as suspected: the opening `---` becomes `<hr>` and the closing `---` turns the YAML body into a **setext `<h2>`** — so `stage: wbs / state: complete / …` renders as one giant heading. Confirmed identically in A and B.

Three fixes tested, all three work:
1. **Pre-strip** (`/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`, split before the renderer sees the text) — works for **both** options, and **returns the YAML as a value**.
2. **B + `remark-frontmatter`** — consumes the fence correctly (verified: no leading `<hr>` survives) but **renders nothing**, so the panel would still need its own copy of the YAML to display it.
3. (A has no frontmatter plugin in scope; pre-strip is its only route.)

**Recommendation: pre-strip**, because the WBS wants frontmatter as *a legible styled header block* — that needs the YAML text in hand, which only route 1 provides. It is also renderer-agnostic, so it does not bind WP3 to whichever option wins.

Regex validated against six edge cases drawn from the real doc set — correct on all: no-frontmatter (`backlog.md` style) → no match; **leading thematic break → correctly NOT treated as frontmatter**; a later `---` in the body → untouched; CRLF → matches; empty `---\n---` → no match (harmless; no real doc has one).

### Phase 1 verify-self (2026-08-01) — 8/8 PASS, independently re-derived

Subagent was instructed to **re-derive every number from its own commands** (fresh renders to new filenames) rather than read the claimed values back — a verification that confirms my arithmetic is worthless. All 5 observable outcomes PASS, plus 3 additional checks. **0 BLOCKING, 0 COSMETIC.**

**Confirmed independently:** all four render combinations exit 0 with non-empty output; checkbox counts **78 (A) = 78 (B) = 78 source items**, and — stronger than my own check — **checked-state also matches exactly, 58/58**; zero literal `- [ ]` leaked into either output. Table/fenced-code counts identical across options and correctly routed (wbs → 2 `<pre>`, 0 tables; WIP → 1 table + 5 `<th>`, 0 `<pre>`). Frontmatter mangling confirmed identical in both baselines (A `<hr>`, B `<hr/>` — void-tag style is the only difference); pre-strip fix restores the document's real `<h1>` (verified as source line 8). Edge-case regex supports all three claims. Repo dependency footprint clean (exit 0; all 7 packages absent from `package.json`).

**Two things the subagent caught that I had not:**

1. **⚠️ Option A passes raw HTML through VERBATIM — 60 HTML comments emitted into the output**, including the Work Tree's own `[SURFACED-<date>] <target node> — <summary>` template line (which is why `<target>`/`<date>`/`<summary>` showed up as apparent "tags" in A's element histogram). **B escapes all 60** to `&lt;!--`. This is direct evidence *from real project docs, before Phase 2 tests hostile input*, that **A's DOMPurify step is load-bearing, not belt-and-braces** — under `csp: null`, an unsanitized A would inject whatever raw HTML a doc contains. Feeds P2.2's negative control directly (the control will not be vacuous for A).
2. **B's class hooks quantified:** B emits `class="task-list-item"` (78×) inside `class="contains-task-list"` (18×) — **96 class attributes** in the WIP output, 26 in wbs. **A emits literally ZERO class attributes** in either output. So styling task rows under A needs custom renderer overrides or `:has()`/attribute-selector CSS.

**Two self-corrections in the subagent's own work, resolved rather than reported as failures** (recorded because they are the discipline working): an initial fence count of 2 undercounted an **indented** fence at wbs.md L23-26 — re-grepping with leading-whitespace tolerance gave 4 fence lines = 2 blocks, reconciling exactly with the 2 rendered `<pre>`; and four `MODULE_NOT_FOUND` stack traces traced to its own shell word-splitting the space-containing fixture paths (`set -- $combo`), not a script fault — re-ran clean with correct quoting.

**One noted non-issue:** the pre-strip regex does not match an *empty* frontmatter block (`---\n---`), which would fall through to the mangling path. The subagent checked the repo: **0 of 54 frontmatter-bearing docs** use an empty block. Recorded as a known boundary, not a defect.

### Phase 1 verify-codify (2026-08-01) — codified NOTHING, deliberately

**0 tests added. Suite unchanged at 127 files / 1470 tests.** This is a decision, not an omission — recorded so a later reader doesn't read the empty result as a skipped step.

Each verified behavior was checked for a durable home:

| Verified behavior | Codified? | Why |
|---|---|---|
| A/B fidelity parity (78/78 checkboxes, tables, fenced code) | **No** | Asserts *third-party library* behavior against libraries **not installed in this repo** — a test importing `marked` or `react-markdown` would fail at collection, since `package.json` is deliberately clean (that cleanliness is itself a WP1 outcome). |
| Both baselines mangle frontmatter | **No** | Same collection problem, and it is a finding *about libraries*, not a behavior of our code. |
| No dependency footprint | **No** | A property of a transient spike, not of the shipped system. Nothing to regress against. |
| **Frontmatter pre-strip regex** | **Deferred to WP3** | The one honest candidate — pure, dependency-free, validated on 6 real edge cases. |

**Why the regex is deferred rather than written now.** There is **zero** frontmatter handling in `src/` today (`grep -rn "frontmatter" src/` → no matches) and no docs/markdown module (WP2/WP3 create it). Codifying it here would mean inventing `src/components/workspace/docs/frontmatter.ts` — creating the production module *and fixing its API shape* before WP2 has decided where the docs panel lives and before WP3 has designed the render path. That is a plan violation (this WP's "Not in scope" explicitly forbids production code) dressed up as diligence, and it would pre-commit WP3's design from a probe.

**What carries forward instead:** the regex + its 6 validated edge cases are preserved as a *decision* in the P1.4 notes above — precisely the input WP3 task 3.2 consumes. **The test belongs in WP3's verify-codify**, where the module it lives in will actually exist.

**No integration boundary** — phase adds isolated new artifacts only.

### Phase 2 — sanitization + link model (measured 2026-08-01)

**⚠️ First predicate was WRONG and produced false positives — recorded because it is the same failure `CLAUDE.md` warns about.** The initial matrix counted danger with **source-text regexes** and reported that *no* variant reached zero. Two of the three "surviving" vector classes were artifacts: it was matching (a) the fixture's own **heading prose** ("3. `javascript:` URL in a markdown link") and (b) `&lt;`-**escaped, inert** text in B's output. This is precisely the "`?raw` source-text guards verify STRUCTURE, never RUNTIME" trap. **Corrected predicate: parse the output with JSDOM and interrogate the LIVE DOM** — a vector counts only if it would actually execute. All numbers below use the corrected predicate (`sanitize2.mjs`).

**LIVE DANGER matrix** (parsed DOM; a shipping config must be 0):

| variant | TOTAL | script | iframe | style | eventAttr | jsUrl | dataSvg |
|---|---|---|---|---|---|---|---|
| `A-unsanitized` *(control)* | **8** | 1 | 1 | 1 | 2 | 2 | 1 |
| `A-sanitized` (DOMPurify defaults) | **2** | 0 | 0 | **1** | 0 | 0 | **1** |
| `A-sanitized-hardened` (+FORBID_TAGS/URI regexp) | **1** | 0 | 0 | 0 | 0 | 0 | **1** |
| `A + afterSanitizeAttributes hook` | **0** | 0 | 0 | 0 | 0 | 0 | 0 |
| `B-default` | **0** | 0 | 0 | 0 | 0 | 0 | 0 |
| `B-raw-unsanitized` *(control)* | **3** | 1 | 1 | 1 | 0 | 0 | 0 |
| `B-raw-sanitized` | **0** | 0 | 0 | 0 | 0 | 0 | 0 |

**P2.2 negative controls FIRE — the sanitizers are provably load-bearing.** `A-unsanitized` leaks 8 live vectors including `IMG@onerror` and `DIV@onclick` (enumerated, not inferred); `B-raw-unsanitized` leaks 3. So neither sanitized result is a vacuous pass. As Phase 1's verify-self predicted, **B's control required opting into `rehype-raw`** — B escapes raw HTML by default, so `B-default` is genuinely **safe-by-default** and its sanitizer is defense-in-depth rather than load-bearing.

**⚠️ The finding that discriminates A from B: DOMPurify's DEFAULTS are not sufficient here.** `A-sanitized` leaves two live vectors:
1. a live `<style>` tag (can hide/reposition UI), and
2. **`<img src="data:image/svg+xml;base64,…">` whose payload decodes to `<svg onload="alert(1)"></svg>`** (verified by `base64 -d`).

**Neither `FORBID_TAGS` nor even the strictest `ALLOWED_URI_REGEXP` removes the `data:` URI** — DOMPurify treats `data:` on `<img>` as an allowed-data-URI tag and bypasses the URI regexp for it (probed three configs; all three left it intact). The gap **is** closeable, but only with a hand-written `afterSanitizeAttributes` hook stripping `data:` from `src` — verified to reach **0/0 while preserving a benign `./local.png`**. **Under `csp: null` there is no second line of defense**, so this is a real obligation, not a theoretical one: choosing A means writing and maintaining that hook plus a `FORBID_TAGS: ["style"]` config, and the failure mode is silent.

**P2.3 — benign content survives in EVERY variant** (the realistic failure did not materialize): `href="wbs.md"` 1, `href="#heading"` 1, `href="https://example.com"` 1, checkboxes 2, table 1, code 2 — identical across all six variants. **No sanitizer ate the relative/anchor hrefs cross-doc navigation depends on.**

**P2.4 — link model.** Interception is the **same delegated-click mechanism for both options** (`container.addEventListener("click", e => { const a = e.target.closest("a[href]"); … preventDefault() })`), so this axis does **not** discriminate. B additionally offers a `components={{a: …}}` override; A would use `marked`'s renderer — neither is needed if the delegated handler owns it, and the delegated handler is simpler and renderer-agnostic.

Classifier validated against 8 real link shapes, all correct:

| href | class |
|---|---|
| `#some-heading` | in-doc anchor → scroll within panel |
| `wbs.md`, `workflow-system/product/roadmap.md`, `wbs.md#a-heading` | cross-doc (relative) → switch selected doc |
| `https://…`, `http://…`, `mailto:…` | external (absolute scheme) → `openUrl` |
| `//evil.example.com` | **external (protocol-relative)** → `openUrl` |

⚠️ **The `//evil.example.com` case is why the classifier must not be `startsWith("http")`** — a protocol-relative URL is *external* but has no scheme, and a naive test misroutes it as a relative doc path. Order matters: test `#` first, then any `scheme:`, then `//`, then treat the rest as relative.

**External-open seam confirmed** (`@tauri-apps/plugin-opener`, already a dependency, `opener:default` granted in both prod + dev capability sets, **zero frontend callers today**): exact signature is `openUrl(url: string | URL, openWith?: 'inAppBrowser' | string): Promise<void>` — also exports `openPath` and `revealItemInDir`.

### Phase 2 verify-self (2026-08-01) — a BLOCKING finding, fixed in place, re-verified fresh

**Run 1: 9 numeric claims PASS, 1 BLOCKING FAIL.** The subagent was explicitly invited to *attack* the corrected predicate rather than confirm it — and that is what produced the finding.

**⚠️ The finding: `liveDanger()` had NO probe for the `style` ATTRIBUTE, and that vector genuinely survives DOMPurify's defaults.** Demonstrated concretely, then reproduced independently by me:

```
A-sanitized:  <div style="background:url(javascript:alert(1))">x</div>
              <div style="width:expression(alert(1))">y</div>
liveDanger(): TOTAL = 0        ← calls it CLEAN
```

DOMPurify's default `ALLOWED_ATTR` includes `style` and it does not parse CSS content. **Consequence: the earlier "0 live danger" for the hardened config was UNDER-DETERMINED** — safe only because it happened to pass `FORBID_ATTR:["style"]`, which the predicate could not have detected. Remove that option and the predicate would still have reported 0. That is exactly the `[[verify-the-mutation-landed]]` failure mode, found *inside the phase whose job was to avoid it.* Secondary gap: `getAttribute("href") ?? getAttribute("src")` short-circuits, so `href=""` masks a malicious `src` — "href OR src", not "href AND src".

**In-place fix** (verify-self shortcut; all three gates held — see the `[SHORTCUT-…]` entry in Discoveries): added `styleAttr` / `otherTags` / `srcdoc` probes, replaced the short-circuit with a check across `href·src·action·formaction·data·xlink:href`, and expanded `hostile.md` with sections 9–11 carrying those vectors. **I also caught a false positive in my own new probe** — a bare `object,embed,form,base,meta` tag query counted an *inert* `<form>` (action already stripped), inflating A's score; narrowed to require the dangerous attribute.

**Post-fix matrix (the numbers that decide the verdict):**

| variant | TOTAL | script | iframe | style | **styleAttr** | otherTags | srcdoc | eventAttr | jsUrl | dataSvg |
|---|---|---|---|---|---|---|---|---|---|---|
| `A-unsanitized` *(control)* | **20** | 1 | 2 | 1 | 2 | 5 | 1 | 2 | 5 | 1 |
| `A-sanitized` (defaults) | **4** | 0 | 0 | 1 | **2** | 0 | 0 | 0 | 0 | 1 |
| `A-sanitized-hardened` | **1** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| **`A` + FULL recipe** | **0** | — | — | — | — | — | — | — | — | — |
| `B-default` | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `B-raw-unsanitized` *(control)* | **10** | 1 | 2 | 1 | 2 | 3 | 1 | 0 | 0 | 0 |
| `B-raw-sanitized` | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**⚠️ MUTATION PROOF — every guard option in A's recipe is independently load-bearing** (`sanitize4.mjs`); this is what makes A's 0 trustworthy rather than accidental:

| config | score | which probe fires |
|---|---|---|
| FULL (hook + `FORBID_TAGS:["style"]` + `FORBID_ATTR:["style"]`) | **0** | — |
| drop the hook | **1** | `dataSvg=1` |
| drop `FORBID_ATTR:["style"]` | **2** | `styleAttr=2` |
| drop `FORBID_TAGS:["style"]` | **1** | `style=1` |
| drop everything (defaults) | **4** | `style=1 + styleAttr=2 + dataSvg=1` |

**Run 2 (fresh subagent, shortcut gate 2): 6/6 PASS, no BLOCKING.** It re-derived every number, **attributed each mutant to its specific probe** rather than trusting aggregates, confirmed the `otherTags` narrowing excludes 0 inert elements, verified benign content survives all six columns in every variant, and ran a **15-class adversarial pass** on the *strengthened* predicate (svg>script, `animate onbegin`, MathML, `<template>`, `<noscript>`, `link rel=stylesheet`, `video/audio src=javascript:`, `details ontoggle`, `marquee onstart`, CSS `@import`, `input/button formaction`, entity/space-obfuscated schemes). **No BLOCKING gap** — all three shipping configs score 0, and it adjudicated each of its oracle's 5 flags against the real DOM rather than trusting the zero.

**Two LATENT gaps recorded (COSMETIC, not blocking):** `img[srcset]` and `track[src]` pointing at an external host survive A's full recipe and the predicate models neither. These are **outbound network/beacon references, not script execution** — low priority for a viewer rendering local files, but they matter *only* because `csp: null` means nothing else blocks the request. Logged to backlog.

**What this changes about the verdict:** A's path to safety is now **three separate, individually-necessary guard options plus a hand-written hook** — each one proven load-bearing, and the failure mode of forgetting any of them is silent. B reaches 0 with no configuration at all.

### Phase 2 verify-codify (2026-08-01) — codified NOTHING, deliberately (again)

**0 tests added. Suite unchanged at 127 files / 1470 tests.** Same verdict as Phase 1, reached by re-running the same check rather than by inheriting the earlier answer.

| Verified behavior | Codified? | Why |
|---|---|---|
| Danger matrix (A=4 / B=0; both controls fire) | **No** | Asserts behavior of libraries **not installed in this repo** — a test importing `marked` or `react-markdown` fails at collection. |
| DOMPurify config gap + the 3-option mutation proof | **No** | Same collection problem, **and** conditional on a verdict not yet made. Captured instead in `SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-…`, which carries the exact recipe + the mutation table for whoever implements it. |
| Benign content survives all six variants | **No** | Property of those same uninstalled libraries. |
| `openUrl` signature | **No** | Third-party type surface; `tsc` catches drift at the real call site in WP3. |
| **Link classifier** (8 shapes incl. the protocol-relative trap) | **Deferred to WP3** | Pure and dependency-free — the one honest candidate. |

**Why the classifier is deferred, with one reason beyond Phase 1's.** Confirmed absent from the tree: no link-classification module, no docs/markdown module, **zero `openUrl` call sites**. So a test would require inventing `src/components/workspace/docs/linkClass.ts` and fixing its API before WP2 decides where the docs panel lives — production code this WP's plan forbids. **The additional reason, specific to this phase: the classifier's shape depends on the renderer verdict, which is not made until P3.3.** Under Option B, interception may route through a `components={{a: …}}` override rather than the delegated handler, changing what the classifier receives. Codifying now would pin an interface to a decision not yet taken.

**What carries forward instead:** the classifier logic + its 8 validated shapes (especially `//evil.example.com` → external, which a naive `startsWith("http")` misroutes into the local-file path) live as a *decision* in the P2.4 notes — the input WP3 task 3.4 consumes. **The test belongs in WP3's verify-codify.**

**No integration boundary** — phase adds isolated new artifacts only.

### Phase 3 — re-render safety + THE VERDICT (2026-08-01)

**P3.1 render idempotence — PASS for both options** (so this axis did not discriminate either). Render `wbs.md` → render a *different* doc → render `wbs.md` again is **byte-identical** (A 31367B, B 32523B), and stable across **5 alternating cycles**. Tested with a **single reused DOMPurify instance**, not a fresh one per render — the realistic component shape, and the one place hidden state would actually accumulate. The check reports the first diverging byte on failure, so a future regression is actionable rather than just "differs".

**P3.2 scroll ownership — PASS for both.** Neither renderer emits an inline `overflow`/`scroll`/`height` style, and neither wraps output in a root container — both produce a **flat sibling list** (54 top-level nodes). **The panel owns the scroll container**, which is exactly what WP4's `scrollTop` capture/restore requires. Recorded explicitly because WP4's whole deliverable depends on it.

**P3.3 — VERDICT: Option B** (`react-markdown` + `remark-gfm` + `rehype-sanitize`). Written to `wbs.md` → "Probe outcomes". Deciding axis was **security posture under `csp: null`**, since fidelity, link-interception mechanism, and re-render safety all tied. One new finding at verdict time: **`react-dom/server` already ships with the installed `react-dom`** (verified resolvable), so **B's output is string-assertable in Vitest with no new dependency and no render harness** — which settles the plan's open testability question in B's favour and avoids re-opening `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`.

**The honest counter-argument is recorded in the verdict, not buried:** ⚠️ **[RETRACTED — this paragraph originally read "A is 20× lighter (5 transitive packages / 4.4M vs 107 / 43M)". That number was WRONG](#phase-3-verify-self)** — it measured `node_modules` size where the WBS asked for **bundle cost**, and the 43M was contaminated by React (already in the app). **Corrected figure: A = 68.5 KB / B = 157.3 KB minified (22.7 vs 48.0 KB gzipped) — a 2.3× delta, ~25 KB gzipped**, plus ~100 net-new transitive packages, which is the genuine supply-chain concern. See "Phase 3 verify-self" below for how it was caught. B's zero is *structural avoidance* rather than sanitization — contingent on never enabling `rehype-raw`. B won because a silent, three-part configuration obligation on the app's **only** line of defense is a worse recurring risk than ~25 KB gzipped in a local desktop tool.

**P3.4 no-footprint — all four confirmed:** dependency manifests byte-identical to HEAD, all 8 spike deps absent from `package.json`, `src/` untouched, verdict present in `wbs.md`. Gates unchanged (127 files / 1470 tests, `tsc` 0). The spike dir stays in the scratchpad until verify-self has re-derived from it.

### Phase 3 verify-self (2026-08-01) — a BLOCKING defect IN THE VERDICT, corrected

**Run 1: outcomes 1/2/3/5/6 PASS, outcome 4 (the verdict audit) FAIL/BLOCKING.** The subagent was pointed at the verdict as the highest-value target and invited to argue the verdict chose the *wrong* option. It did neither uncritically: it confirmed the security evidence re-derives exactly, then found the **counter-argument** was wrong.

**⚠️ The defect: "A is 20× lighter — 4.4M vs 43M" measured the wrong quantity.** The WBS's WP1 learning objective asked for **bundle cost**; I reported `node_modules` size. DOMPurify is 1.7M on disk and **28.5 KB minified**. Worse, **I dropped a caveat that was in my own WIP notes** — that the 43M included React, already in the app. The verdict presented the bare number.

**Measured shipped cost** (esbuild, minified, `react`/`react-dom` external — reproduced by me, then re-reproduced independently by a fresh subagent within 0.1 KB):

| | minified | gzipped | transitive pkgs (clean isolated install) |
|---|---|---|---|
| A | 68.5 KB | 22.7 KB | 3 |
| B | 157.3 KB | 48.0 KB | 105 |

**The real delta is ~89 KB minified / ~25 KB gzipped — a 2.30× ratio, not 20×.** The package count (~100 net-new) is the genuine supply-chain concern; the size figure was the overstatement.

**Why this mattered enough to be BLOCKING rather than cosmetic:** the verdict is the document WP3 builds against. A reader either believes the verdict knowingly accepted a huge cost, or checks it and distrusts the whole document — and the security half, which is the strongest and most load-bearing part, would be discredited by association.

**Corrected in place** (shortcut gates all held — see the `[SHORTCUT-…]` entry in Discoveries): replaced the paragraph with the measured bundle table, kept the package-count contrast, added an explicit **"an earlier draft said 20× — that was wrong, do not resurrect it"** warning so the bad framing cannot creep back, and added the Tauri-over-Electron scale comparison (~93 MB vs ~89 KB — three orders of magnitude apart, so "lite over featureful" is not in tension). **Also fixed a second finding:** the idempotence byte-counts are **not pinnable constants** — the fixture was `wbs.md` itself, which grew *while the probe ran*; the verdict now tells WP3/WP4 to assert the property, never a literal byte count.

**Run 2 (fresh subagent, gate 2): 6/6 PASS.** Reproduced every bundle figure with its own esbuild invocation, **verified the externals were genuinely honored** (B's bundle retains bare `from"react"` / `from"react/jsx-runtime"` imports and inlines zero `react-dom` — the exact contamination that broke the old figure), confirmed no stale `20×`/`4.4M`/`43M` framing survives except the deliberate warning, and re-derived the danger + mutation tables intact after the edit.

**Both subagents independently concurred with Option B on the corrected numbers** — the second noting the asymmetry precisely: A's failure mode is *four silent config obligations* on every future maintainer of the render path, while B's is *one reviewable invariant with a loud diff* (never add `rehype-raw`). **The verdict reached the right answer partly via a wrong number; it now reaches it via the right one.**

**One clarification the second run surfaced, worth keeping:** `sanitize2.mjs`'s `A-sanitized-hardened` row scores **1**, not 0, because it carries the three config options *without* the hook — which corroborates the verdict's "3 options **+ a hand-written hook**" wording rather than contradicting it.

### Phase 3 verify-codify (2026-08-01) — codified NOTHING, deliberately (third time)

**0 tests added. Suite unchanged at 127 files / 1470 tests.** Re-ran the check rather than inheriting Phases 1–2's answer; it landed the same way, and the *structural* reason is now confirmed absolute: **zero WP1 code exists in the repo** (`git status --porcelain src/` empty), no docs/markdown module exists, and `react-markdown` is not installed. There is literally nothing in the repo to write a test against.

| Verified behavior | Codified? | Why |
|---|---|---|
| Render idempotence (A→B→A byte-identical, 5 cycles) | **No** | Property of the uninstalled candidate libraries. **And verify-self proved the byte-counts are not pinnable** — the fixture was `wbs.md` itself, which grew during the probe. |
| **Scroll ownership** (flat sibling list, no wrapper root) | **Deferred to WP3/WP4** | A genuinely durable property — but it belongs to the *shipped* renderer inside the *real* panel. Asserting it now would require installing `react-markdown` **and** inventing the render module: doing WP3's job from a probe. |
| Bundle sizes (68.5 / 157.3 KB) | **No** | A one-time **decision input**, not an invariant. Pinning it would fail on any upstream release while testing nothing about our code — a maintenance tax masquerading as coverage. |
| The verdict document's contents | **No** | That is a `?raw` guard over prose — exactly the reflow-fragile pattern `CLAUDE.md` warns against, and `[[raw-guard-jsx-prose-needs-flattened-haystack]]` documents. |

**What carries forward instead:** the verdict in `wbs.md` names the exact packages + versions, the never-add-`rehype-raw` rule, the frontmatter pre-strip regex, the link classifier with its 8 validated shapes, and **two explicit method notes for WP3's own tests** (assert the parsed live DOM never source text; a security guard must be mutation-proven, not merely present). **The scroll-ownership and link-classifier tests belong in WP3/WP4's verify-codify**, where the module they describe will exist.

**Pattern across all three phases:** every phase produced knowledge, and knowledge's durable home is the verdict document, not a test file. Writing tests for library behavior in a probe would have meant importing candidate dependencies into `package.json` — destroying the no-footprint property that was itself one of this WP's outcomes.

**No integration boundary** — phase adds isolated new artifacts only.

### ⚠️ Footprint incident (P1.1) — recorded, not hidden

The first spike attempt created `tmp/mdprobe/` **inside the repo**. `pnpm add` there resolved to the **repo workspace root** (visible as `../..` in its output) and **modified the tracked `pnpm-lock.yaml`** — `package.json` was untouched, so a `package.json`-only check would have missed it. Caught by `git status`, reverted with `git checkout pnpm-lock.yaml`, and the spike was relocated entirely outside the repo to the scratchpad.

**Consequence for the plan:** Phase 3's "no production footprint" outcome is doing real work — it just fired in Phase 1. **Lesson worth carrying: `tmp/` being gitignored does NOT isolate a pnpm install** — pnpm walks up to the workspace root regardless of ignore rules. A dependency spike must live outside the repo tree entirely.

## Retrospect

- **What changed in our understanding:** Three things the WBS did not know. (1) **The app ships with no CSP** (`"csp": null`) — the plan's task 1.3 asked to "confirm the renderer runs under Claudesk's CSP," a question with no answer; the real question inverted into *"with no backstop, what does each renderer do with hostile markdown on its own."* That inversion is what made this WP decidable. (2) **Fidelity does not discriminate** — the WBS framed WP1 as primarily a fidelity comparison, and both options rendered real docs identically on every metric. The WP's stated axis was the wrong axis. (3) **`react-dom/server` already ships with `react-dom`**, so Option B's output is string-assertable with no new dependency and no render harness — which quietly settled the testability worry that `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` had left open for this decision.

- **Assumptions that held:** The plan's three-phase shape (fidelity → safety+links → re-render+verdict) survived intact, each phase failing independently as intended. The half-day timebox held. The "no dependency added to `package.json`" constraint held end-to-end and was worth its verification cost. The two candidate renderers were the right two — no third option surfaced.

- **Assumptions that were wrong:**
  - **The plan's own instruction was wrong:** it said spiking "may install into a throwaway dir under `tmp/`, which is gitignored." Following it dirtied the tracked `pnpm-lock.yaml` — pnpm walks to the workspace root regardless of gitignore, and `package.json` stays clean, so the usual check misses it. Fixed by moving the spike outside the repo entirely.
  - **I assumed my measurement predicate was sound. Twice.** The first (source-text regexes) false-positived on the fixture's own heading prose and on `&lt;`-escaped inert text. The corrected one (live DOM) still missed the `style`-attribute vector — which made a "0 danger" result *under-determined*, passing only because the config happened to include `FORBID_ATTR:["style"]`. Both were caught by verify-self subagents, not by me.
  - **I assumed reporting `node_modules` size answered "bundle cost."** It does not — DOMPurify is 1.7M on disk and 28.5 KB minified. The real delta is 2.3×, not 20×, and I dropped a React-contamination caveat that was in my own notes when writing the verdict.
  - **I assumed a done phase's Work Tree was clean.** Review-quality found duplicate verify nodes under a `[x]` parent; auditing for that class then found a ticked-in-comment-but-unticked-in-box task (`P2.2`) and four `SURFACED:` pseudo-leaves that never belonged in the tree.

- **Approach delta:** The plan was followed phase-for-phase, but the *weight* shifted: Phase 2 was written as confirmatory and became the deciding phase once fidelity tied. Three verify-self passes each produced a substantive finding rather than a rubber stamp, and two required in-place fixes under the shortcut clause — both re-verified by fresh subagents. **The single highest-leverage move was instructing each subagent to *attack* my work rather than confirm it** (re-derive every number independently; "argue the other side"); every one of the three real defects came from that framing, and the third was found only because I told the reviewer to assume a third existed. Three consecutive verify-codify passes wrote zero tests — deliberate, re-decided each time, and recorded with rationale rather than inherited.

## Communicate

> **Feature complete:** M11 WP1 (markdown render approach probe) has shipped. It settles which markdown renderer M11's Docs viewer will use — **Option B: `react-markdown@10` + `remark-gfm@4` + `rehype-sanitize@6`** — chosen on security posture under the app's `csp: null`, since render fidelity between the candidates was a measured tie. The verdict lives in `workflow-system/product/wbs.md` → "Probe outcomes" and names the exact packages, the frontmatter pre-strip regex, the link-classification model, and the one invariant the decision rests on (**never add `rehype-raw`**). WP3 can install three packages and start building without re-deriving anything.

Requester = operator — closure notice for self-record.

## Code-Quality Review — m11-wp1-markdown-render-probe

Reviewer: `code-quality-reviewer` subagent against ship baseline `d467877` (2026-08-01). **0 CRITICAL / 4 MAJOR / 5 MINOR.** The reviewer was explicitly told two overstated claims had already been found and corrected, and invited to assume a third — it found one (the `[[slug]]` gap) plus three defects in the evidence trail.

**⚠️ Deviation from autopilot's auto-backlog default, recorded deliberately:** Mode 3 auto-backlogs MAJORs. **Five findings were FIXED IN PLACE instead** (3 MAJOR + 2 MINOR), because each is a one-line factual correction to a document shipped minutes earlier, and *leaving a known-wrong number in the evidence trail is exactly the failure this WP twice flagged as BLOCKING*. Backlogging a document defect I can fix in one line — in the document whose credibility with WP3 rests on its numbers being checkable — would have shipped known-wrong work. The remaining 1 MAJOR + 3 MINOR are genuinely deferrable and are backlogged.

### Strengths
- The security argument is genuinely mutation-proven, not asserted: both negative controls fire (A=20, B+raw=10), and each of A's three guard options is dropped individually and attributed to a specific probe.
- The no-footprint property was treated as a real deliverable and verified adversarially (`pnpm-lock.yaml` checked, not just `package.json`) — which is how the pnpm workspace-root footgun was caught at all.
- The two self-corrections preserve the *wrong* number plus an explicit "do not resurrect" warning — materially more useful than a silent fix.
- The verdict discharges the downstream contract concretely: exact packages + versions, the pre-strip regex verbatim, the `openUrl` signature, the classifier ordering rule, the non-pinnable-constants warning for WP4.
- Scope discipline held: three consecutive verify-codify passes each re-ran the check rather than inheriting the prior answer, and each declined to create a production module from a probe.

### Issues

**CRITICAL** — none.

**MAJOR**
- ✅ **[FIXED IN PLACE]** `[wip:47-49]` **Duplicate verification nodes** — three `NOT-STARTED` verify leaves sat above the three `[x]` ones under a `[x]` parent, violating the global Work Tree parent-completion rule. My own error: when correcting Phase 1 (I had wrongly marked verify nodes that belong to their own skills), I reinserted the reverted leaves *above* instead of replacing in place. Duplicates removed.
  - **Auditing the whole tree for the same class then caught two more, which the reviewer had not flagged:** (a) **`P2.2` was never ticked** — the work was done and its result recorded in the leaf's own comment, but the checkbox stayed `[ ]`, so a mechanical reader would have seen the negative-control task as outstanding; (b) **four `SURFACED:` pseudo-leaves were sitting in the Work Tree**, which `[[feedback_surfaced_in_discoveries_not_worktree]]` explicitly forbids — SURFACED items are *notices*, not units of work, and putting them in the tree is what creates parent-completion violations. All four were already recorded in `## Discoveries`; removed from the tree. **The tree now has 0 unchecked leaves.**
- ✅ **[FIXED IN PLACE]** `[wip:286]` **The retracted "20× lighter" claim was still stated as fact** in Phase 3's narrative, un-annotated — in the very evidence trail the verdict cites. The verdict was scrubbed; the trail was not. Same defect class this WP flagged as BLOCKING. Now carries an inline `[RETRACTED]` marker with the corrected figures.
- ✅ **[FIXED IN PLACE]** `[wbs:206-207]` **Package counts inconsistent across three recordings** (5/107, 3/105, ~5/~104) — and the count is the one number the counter-argument actually leans on. Verdict now states the **clean isolated-install** figures (3 / 105) and explicitly supersedes the shared-`node_modules` numbers with a note on why they differed.
- ✅ **[FIXED IN PLACE]** `[wbs:189-243]` **`[[slug]]` memory-style links were left undischarged** — named in WP1's own learning objective, absent from the verdict, and common in this repo's real docs (7 occurrences). **Measured rather than merely noted:** they render as *literal text* with **no `<a>` emitted**, so the delegated handler structurally cannot see them. Verdict now records the measurement + two options for WP3 at task 3.4.

**MINOR**
- ✅ **[FIXED IN PLACE]** `[wbs:189]` "11-section hostile fixture" read as designed-up-front; it was 8, expanded to 11 at verify-self. Clause added — the one place the document flattered its own process.
- ✅ **[FIXED IN PLACE]** `[wbs:212]` The `never add rehype-raw` invariant lived **only** in the verdict, not in WP3's task 3.1 where the change would actually be made. Now stated in task 3.1 too.
- ✅ **[FIXED IN PLACE]** `[backlog.md]` `SURFACE-…-DOMPURIFY-DEFAULTS-…` was `Status: pending` while the verdict declared it moot — forcing the next sweep to re-derive that it is dead. Now `deferred — MOOT under the WP1 verdict`, with why it is kept rather than deleted.
- ⏳ **[BACKLOGGED]** `[wbs:214]` The `rehype-sanitize` strictness parenthetical (dropped a `<form>`, flattened `<svg><a>`) has no counterpart in the WIP's Probe notes — the one verdict claim that doesn't trace to a recorded measurement.
- ⏳ **[BACKLOGGED]** `[runtimes.md:80-83]` History bullet says "P1 verify-auto" where the suite ran three times (once per phase). Not wrong — results were identical — but under-describes the observation.

### Assessment
Reviewer's verdict: *"a well-built knowledge artifact… the verdict is correct, its deciding argument is measured rather than reasoned, and it is actionable enough that WP3 can install three packages and start writing the render path without re-opening anything — which is the entire point of a probe WP."* Debt was small and **entirely in the evidence trail rather than the contract**; the `[[slug]]` omission was the one item flagged as costing real WP3 time, and it is now discharged with a measurement.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-01] Phase 1 / P1.1 — **A `pnpm add` inside the gitignored `tmp/` still mutates the repo's tracked `pnpm-lock.yaml`.** pnpm walks up to the workspace root and ignores gitignore rules; `package.json` stays clean, so a `package.json`-only check misses it. Caught by `git status`, reverted, spike relocated outside the repo. Logged to backlog (tooling/convention note — dependency spikes must live outside the repo tree).

[SHORTCUT-2026-08-01] P2.1 (`liveDanger()` predicate) — verify-self found a BLOCKING defect: the predicate had no `style`-ATTRIBUTE probe, so `<div style="background:url(javascript:alert(1))">` scored 0/"clean" while surviving DOMPurify defaults, leaving the hardened config's "0 danger" under-determined. **Fixed in place** rather than via F9b, all three gates held: (1) *trivial extension of the just-completed leaf* — added `styleAttr`/`otherTags`/`srcdoc` probes and replaced the short-circuiting `href ?? src` with a check across 6 attributes, inside the same `liveDanger()` written in P2.1; no new file, no cross-module change; (2) *fresh model invocation re-verified* — a newly-spawned `feature-verify-self-runner` returned 6/6 PASS, attributed each mutant to its specific probe, and ran a 15-class adversarial pass finding no BLOCKING gap; (3) this entry. Also self-caught a false positive in the new probe (a bare tag query counted an inert action-less `<form>`) and narrowed it.

[SHORTCUT-2026-08-01] P3.3 (the verdict document) — verify-self found a BLOCKING defect in the verdict's counter-argument: *"A is 20× lighter — 4.4M vs 43M"* measured `node_modules` size when the WBS asked for **bundle cost**, and the 43M was contaminated by React (already in the app) — a caveat present in my own WIP notes that I dropped when writing the verdict. Real measured delta: **~89 KB minified / ~25 KB gzipped, a 2.30× ratio**. **Fixed in place** rather than via F9b, all three gates held: (1) *trivial extension of the just-completed leaf* — one paragraph in the document written at P3.3, plus a two-line note that the idempotence byte-counts aren't pinnable; no code, no re-plan, and the verdict's **conclusion is unchanged**; (2) *fresh model invocation re-verified* — a newly-spawned runner returned 6/6 PASS, reproduced every bundle figure with its own esbuild invocation, confirmed externals were honored, and verified no stale framing survives; (3) this entry. I independently reproduced the bundle numbers before editing.

[SURFACED-2026-08-01] Phase 3 / verify-self — **The idempotence byte-counts are NOT pinnable constants.** The probe's fixture was `workflow-system/product/wbs.md` — the very file the verdict was being written into — so it grew *during* the probe (26215 → 34542 bytes) and the absolute byte/node counts are irreproducible. The *property* (two renders of identical input are byte-identical) holds and is what matters. Recorded in the verdict so WP3/WP4 assert the property, never a literal count. **Transferable lesson: do not use a live working document as a measurement fixture when the measurement will be quoted as a constant.**

[SURFACED-2026-08-01] Phase 2 / verify-self — **Two LATENT predicate gaps, COSMETIC:** `img[srcset]` and `track[src]` referencing an external host survive Option A's full recipe, and `liveDanger()` models neither. Outbound network/beacon references rather than script execution — low priority for a viewer rendering local trusted files, but they matter *because* the app ships `csp: null`, so nothing else blocks the request. Logged to backlog; would be worth adding as probe columns if this predicate becomes the security measurement of record.

[SURFACED-2026-08-01] Phase 1 / P1.3 — **Options A and B are indistinguishable on render fidelity** (every metric tied across both real docs; checkbox count 78/78 exactly matches source truth). The WBS framed WP1 as primarily a fidelity comparison; fidelity turns out not to discriminate. The decision therefore rests entirely on Phase 2's axes (sanitization behavior under `csp: null`, link-interception mechanism) plus dependency footprint (5 pkgs/4.4M vs 107 pkgs/43M) and string-assertability under the no-render-harness posture. **Not a plan defect** — Phase 2 already exists to answer exactly these; this records that Phase 2 is now load-bearing for the verdict rather than confirmatory.
