---
stage: wbs
state: complete — ALL 5 WPs SHIPPED; M11 exit verdict GO (WP5, 2026-08-02). Ready for `/product-finalize`.
milestone: "Milestone 11: Workflow-docs markdown viewer"
updated: 2026-08-02  # ✅ WP5 SHIPPED (`0951d2d` + review `8cda041`) — **M11 EXIT VERDICT: GO**, all 5 WPs closed; see "Probe outcomes" → WP5 verdict for the 12-clause evidence table. WP5 was planned verification-only but also shipped the `settled` fourth precedence tier (operator decision at P3.2, against a live reproduction), fixing the sibling-edit auto-selection defect — incl. a fifth-path regression caught at verify-self. Two WP4 evidence claims RETRACTED (the browser supplies the answer unaided for both the deferred restore and the shrink clamp). PRIOR NOTE: WP4 ✅ SHIPPED (`480052e`) + code-review refactor (`966dca5`) — the Docs panel now LIVE-RELOADS on `fs-change`: content changes re-render in place with scroll preserved, an appearing doc jumps, a vanishing doc falls back. Resolves SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL. Three pure modules (`docsReloadDecision` / `docsScrollRestore` / `pendingRestore`) so tests drive real code; 25 mutations proven. ⚠️ Classify by DIFFING the re-listed doc set, never `FsChange.kind` (backend folds a mixed 200ms batch to `Other`). ⚠️ jsdom reports `clientHeight === 0` for VISIBLE elements too, so scroll geometry is an injected VALUE, not read off an element. ⚠️ Phase 4 was DISSOLVED into Phase 3 at an integration-boundary back-loop (a phase whose only content is another phase's verification has no independent deliverable) — WP4 shipped as 3 phases. Review: 1 CRITICAL + 2 MAJOR fixed in place (the jump arm latched the machine's answer into `chosen`, self-disabling jump-on-appear after ONE firing), 1 MAJOR + 4 MINOR backlogged. Durable lesson → root CLAUDE.md: extracting a pure state machine proves the MACHINE, not its CALLER.
---

# WBS — Milestone 11: Workflow-docs markdown viewer

> **▶ ACTIVE 2026-08-01** — unparked from `m11-wbs-parked.md` into the cycle slot when M11.5 closed (`bc46e7e`). M11.5's WP4 discharged this milestone's one hard dependency: the OFF-invariant guard's chord arm now sees `panelHost.ts`, which is exactly the module M11's Docs tab and chord live in.
>
> **Two corrections applied while parked (operator-settled 2026-07-28, resolving `SURFACE-2026-07-28-M11-DOCS-LIST-PATHS-STALE`):** the doc-discovery paths were migrated to the unified `workflow-system/` layout, and the flat-glob-vs-curated + archive-discoverability questions were decided. See "Doc-discovery decisions" below and task 2.1.
>
> **One dependency added:** M11's Docs tab is **gated behind M10.9's `workflow_features_enabled`**. WP2 must register the panel conditionally — see task 2.3.

## ⚠️ Activation audit (2026-08-01) — read before starting WP2

This file was written 2026-07-28; **M10.9 and M11.5 both closed after it was parked.** Re-audited against the tree at activation rather than trusted (the method that caught three mis-specified tasks in M11.5). **All five load-bearing claims HOLD** — `useWorkflowFeaturesEnabled` exists (zero consumers, as designed), `RightPanel`/`AVAILABLE_PANELS` are the assumed shape, `⌘⇧K` **and** `⌘⇧G` are both genuinely unclaimed, the `fs-change` seam (`FS_CHANGE_EVENT` + `appliesToWorkspace`) exists, and `validate_root` is `pub`.

**Two corrections, both fallout from M11.5 WP4 landing after this file was written:**

1. **⚠️ MEASURED, not predicted — the guard bites at the TYPE DECLARATION, not at panel registration.** Adding `"docs"` to the `RightPanel` union alone (one word; no `AVAILABLE_PANELS` entry, no chord, no tab) **already fails** the OFF-invariant guard's chord arm:
   ```
   × matches no workflow chord (no chord predicate module is workflow-coupled)
     → src/components/workspace/panelHost.ts
   ```
   Cause: M11.5 WP4 changed the chord arm to select by **exported identifier**, so `panelHost.ts` (which exports `panelForChord` + `PanelChordEvent`) is now in scope, and the arm matches the workflow term anywhere in the module's non-comment source. **The guard is correct** — it is demanding exactly what M10.9's contract requires (*a gated surface must not exist when off*). But task 2.3 assumed the gating problem was "register the panel conditionally," and the real problem is **where the `"docs"` string may live at all**. `panelForChord`'s mnemonic map is in the same file.
   **Consequence:** WP2 must decide its gating *shape* before writing code — a `"docs"` member in the static union/array is not merely un-gated, it is a build failure. Options to weigh at WP2 (do NOT pre-decide here): make `AVAILABLE_PANELS`/`RightPanel` gate-derived rather than static (the guard's own header anticipates this: *"If M11 makes AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that computation"*), or hold the Docs panel's identity in a separate gated module that `panelHost.ts` never names. **WP2 re-sized M → M/L.**
2. **Task 2.2's named reuse target does not exist as written.** `resolve_within` is **private** (`fn`, not `pub fn`, `editor_fs/mod.rs:96`). The public reuse surface is **`read_file_core`** (`:263`), which wraps `resolve_within` — a better fit for `docs_read` regardless, since it *is* a read. Task 2.2 updated.

**Also note for WP5:** the guard now additionally pins its own reach and its offender predicate as a value (M11.5 WP4), so an M11 change that narrows the chord arm to dodge this will fail those meta-tests too. That is deliberate.

Decomposes **only** M11. Future milestones (M12 auto-resume → M13 skill-orchestration → M14 polish) stay tracked in `roadmap.md` — not re-listed here; they decompose just-in-time when reached.

## Doc-discovery decisions (settled 2026-07-28)

The 2026-07-20 spec named pre-migration paths that no longer exist in this repo (migrated to `workflow-system/` at commit `aacc687`). Building task 2.1 as originally written would have produced a `docs_list` that finds nothing. Corrected, plus the two attached UX calls decided rather than left open:

1. **Curated ordered set, NOT a flat glob.** `workflow-system/product/*.md` would now also sweep in `transitions.md` and `design-priors.md`, and would grow unpredictably as new doc kinds appear. M11 is an *attention/re-orientation* surface (see "Milestone intent") — an unbounded list dilutes exactly the glance it exists to serve, and the "workflow-ordered list" intent (decision 2 below) presumes a known set to order. So discovery enumerates named docs + the deliberate `*wbs*.md` glob. **Cost accepted:** a new doc kind needs a one-line spec edit to appear. `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` — the curated set is one of the three properties that earn the tab against the Editor (which already opens any `.md` by hand); a flat glob would erode it toward "a file tree that renders markdown."
2. **`design-priors.md` and `transitions.md` ARE included**, at the tail of the order with arch·research·context. They're durable strategic docs an operator re-orienting genuinely reads; excluding them would be an omission, not a decision.
3. **`archive/<cycle-name>/` is NOT discoverable.** Closed cycles are history, not re-orientation material, and one entry per past milestone would swamp the list. Reachable via the Editor/file-tree when actually wanted. *(Explicitly decided, not overlooked.)*
4. **Two properties preserved** (flagged by the companion repo): `.session.md` is **gitignored but present on disk**, so discovery must not assume git-tracked ⇒ discoverable (M6 WP6 already re-based the walker on heavy-dir rather than gitignore, so `fs_index`/`fs_watch` see it); and `*wbs*.md` stays a **glob**, not a literal, so `shape: temporary-wbs` scratch files and this parked `m11-wbs-parked.md` surface alongside the canonical `wbs.md`.

## Milestone intent (read before scoping any WP)

M11 is an **attention-routing / re-orientation feature wearing a "viewer" costume** — not a generic markdown preview (memory `[[m7-docs-viewer-intent]]`). When the operator context-switches *into* a cold project across 20+ rotating projects, the first question is **"where was I in the workflow, and what's next?"** — an answer that lives in `roadmap → wbs → wip → backlog → .session.md`. M11 makes that re-orientation a single glance in the right half, per-workspace, instead of popping Sublime or reading raw markdown in the Editor. Read-only is correct (editing stays in Editor/CC).

**Operator decisions locked at this WBS (2026-07-20):**
1. **Auto-select the most-relevant doc on open** — `.session.md` if present → else active `workflow-system/state/wip/*.md` → else `roadmap.md`. The file list is still there to switch. Resolves the intent memory's explicit open question.
2. **Workflow-ordered doc list** — vision → roadmap → wbs (+ `*wbs*.md` scratch/parked) → wip → backlog → `.session.md` → (arch · research · context · design-priors · transitions), grouped, in that sequence; not alphabetical. *(Tail expanded 2026-07-28 — see "Doc-discovery decisions" §2.)*

## Design-prior consult (fired at WP-boundary decisions)

- **`[[new-surface-must-earn-its-place-against-existing-ones]]`** — the Docs tab overlaps the **Editor** tab, which already opens `.md` files. Decision-rule run: the Docs tab's *irreducible non-overlap* is (a) **formatted** render (Editor shows raw CM6 source), (b) an **auto-discovered curated doc set** (no hunting through the file tree), (c) **auto-select re-orientation** (lands on "where was I"). All three are genuine non-overlap → the surface earns its place; it is not a subset of Editor. **Rule 2 (prior agrees with the common-sense default)** — no override flag; scope stays as the roadmap framed it. The prior *did* trim one thing: the viewer must **never write** — any "edit this doc" affordance would re-implement the Editor and is cut.
- **`[[primary-surface-is-zero-ceremony-not-a-mode]]`** — fired on the auto-select decision. The operator chose auto-select over "pick a file from a list," i.e. the doc you want is already open with zero ceremony; the list is a switch, not a gate. `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` leaning auto-select — **operator confirmed at this WBS**, so this is a taken-with-confidence, not a tie-break.

No new design prior proposed — the two decisions above are applications of existing priors + a scope choice, not a new transferable lean.

---

## Work Packages

### WP1: Probe — markdown render approach (fidelity, links, live-region, CSP) — ✅ SHIPPED 2026-08-01 (commit `d467877`, review pass `e971d22`)
**Type:** probe
**Milestone:** M11 (must precede WP3, the render build)
**Dependencies:** none
**Size:** S
**Learning objective:** What is the right way to render the conventional docs as **formatted, read-only** markdown inside the WKWebView, given Claudesk's constraints? Specifically answer:
- **Renderer + dependency choice.** No markdown *renderer* is a dep today (`@codemirror/lang-markdown` is editor syntax-highlight only, NOT a formatted renderer). Compare the realistic options on bundle cost, security, and fit: a lightweight parser + sanitizer (e.g. `marked` + `DOMPurify`) rendered to HTML, vs a React renderer (`react-markdown` + `remark-gfm` + `rehype-sanitize`). Pick the one that renders **GFM task-list checkboxes** (the WIP Work-Tree `- [ ]`/`- [x]`), tables, and fenced code legibly with the least surface.
- **YAML frontmatter.** The docs open with `---`-fenced frontmatter (`stage:`, `drive_mode:`, Work-Tree status comments). Decide: render it as a small styled header block, or strip-and-show-raw. It must render *legibly*, not as a broken table.
- **Link behavior.** In-doc anchors (`[x](#heading)`) must scroll within the panel; cross-doc links (`[wbs](wbs.md)` / `[[slug]]` memory-style) must resolve to another doc in the set (switch the panel) — and external `http(s)` links must NOT navigate the webview (open in the default browser via the existing shell/`open` seam, or be inert). Confirm what the chosen renderer emits for each and how to intercept.
- **Live-reload seam confirmation.** Confirm the render target can be re-rendered in place from new file content while a scroll offset is captured/restored (feeds WP4) — i.e. the render is a pure content→DOM function with no hidden internal scroll reset.
- **CSP.** Confirm the chosen renderer runs under Claudesk's webview CSP (no remote fetch; inline styles acceptable) — the same self-contained constraint the app already lives under.
**Timebox:** half-day
**Success criterion:** A short written verdict in this file's "Probe outcomes" (added at WP1 close): the chosen renderer + dep, how task-lists/tables/code/frontmatter render, the link-intercept mechanism (in-doc vs cross-doc vs external), and a one-line confirmation the render is re-render-in-place-safe under CSP. Enough that WP3 builds against a known shape, not an assumed one.
**Tasks:**
- [x] 1.1 Spike both realistic renderer options against a real doc (this `wbs.md` + a live `workflow-system/state/wip/*.md` with a Work-Tree) — eyeball task-list/table/code/frontmatter fidelity.
- [x] 1.2 Determine the link-intercept mechanism for in-doc / cross-doc / external, and how the renderer exposes hrefs.
- [x] 1.3 Confirm CSP compatibility + re-render-in-place safety (no internal scroll reset).
- [x] 1.4 Write the verdict to "Probe outcomes" (renderer + dep + link model + frontmatter treatment).

**WP1 → WP2 rationale:** Resolve the render-approach + dependency unknown *first*, cheaply, before building either the panel plumbing or the render — so WP3 isn't designed around an assumed renderer API or a dep that fails CSP/GFM. Standard 3rd-party-probe-before-build ordering (§4).

---

### WP2: Docs panel plumbing — 4th `RightPanelHost` panel + auto-discovered, workflow-ordered doc list — ✅ SHIPPED 2026-08-01 (commit `6632f59`)
**Description:** Add **Docs** as the fourth panel in the per-workspace `RightPanelHost`, alongside Editor / Diff / Terminal — a new clickable tab in the `right-panel-toggle` tab row **and** a direct-select `⌘⇧`-chord (next free chord, disjoint from `⌘⇧E` Editor / `⌘⇧D` Diff / `⌘⇧T` Terminal, the freed `⌘⇧O`, and the reserved `⌘⇧+digit` workspace switch — likely `⌘⇧K` or `⌘⇧G`; pick and pin in-build). The panel body is a **workflow-ordered file list** of the auto-discovered conventional doc set, scoped to the workspace's project. No render yet (WP3) — this WP is the tab, the chord, the discovery, and the list. Per-workspace panel state (which doc is selected, scroll) lives alongside the existing per-workspace Editor/Diff/Terminal state, mirroring "all workspaces stay mounted."
**Milestone:** M11
**Dependencies:** none (parallel-able with WP1; the render (WP3) needs both)
**Size:** **M/L** *(re-sized from M at activation — task 2.3 now carries a gating-shape decision that the guard forces up-front; see the Activation audit.)*
**Tasks:**
- [x] 2.1 Backend: a `docs_list` command (new small `docs` module, or fold into an existing fs command surface) that, given a workspace project root, returns the present conventional docs. **Paths corrected 2026-07-28 for the unified `workflow-system/` layout — the pre-migration `docs/product/` + `workflow/` roots are GONE from this repo; the old spec would have found nothing.** Enumerate (curated, per "Doc-discovery decisions" — not a flat glob):
  - `workflow-system/product/`: `vision.md`, `roadmap.md`, `research.md`, `arch.md`, `context.md`, `design-priors.md`, `transitions.md` + **glob `*wbs*.md`** (canonical `wbs.md`, `shape: temporary-wbs` scratch files, and any parked `*-wbs-parked.md`)
  - `workflow-system/state/`: `wip/*.md`, `backlog.md`, `backlog-quality-findings.md`, `.session.md`
  - **NOT** `workflow-system/product/archive/**` (decided: closed cycles aren't re-orientation material) and **NOT** `CHANGELOG.md` (unchanged from the original spec).

  Absent files are silent no-ops. `.session.md` is gitignored-but-present — do not filter on git-tracked. Root authenticated via the WP7 `validate_root` seam (reuse — do not re-trust a frontend root). ~~**Also: tolerate the legacy layout.**~~ **REVERSED at Phase 1 verify-human (2026-08-01, operator decision): legacy-layout support is OUT.** The original spec said to probe `docs/product/` + `workflow/` too, since not all of the 20+ rotating projects have migrated. Built, then removed on operator review: carrying a second set of roots forever to serve a shrinking set of stale projects is not worth the permanent complexity, and migrating the project is the real fix. An un-migrated project shows **no docs** rather than a partial list — asserted by `ignores_the_legacy_pre_migration_layout` so a future re-add is a deliberate act.
- [x] 2.2 Backend: a `docs_read` command returning a single doc's raw text (read-only). **Corrected at activation:** reuse **`editor_fs::read_file_core`** (`mod.rs:263`) + `validate_root` (`:175`) — **not** `resolve_within`, which is **private** (`fn`, not `pub fn`, `:96`) and cannot be called from a sibling module. `read_file_core` wraps it and is the right fit anyway, since `docs_read` *is* a read. The doc set is a strict subset of the project tree, so no new trust surface.
- [x] 2.3 Frontend: register the Docs panel in `RightPanelHost` — tab button, the `⌘⇧`-chord (`⌘⇧K` and `⌘⇧G` both **verified free** at activation; pick one and pin it in-build), and the panel container. All workspaces stay mounted; switching is display toggling, not remount. **Gated behind M10.9:** with the gate off there must be no tab, no chord, and no `"docs"` member (OFF=byte-identical). Consume the gate **only** via `useWorkflowFeaturesEnabled()` (`src/state/useWorkflowFeaturesEnabled.ts` — M11's Docs tab is its first consumer, by design); never `invoke("workflow_get_features_enabled")` ad hoc and never import the raw `getWorkflowFeaturesEnabled()` wrapper — the guard scans for both bypass shapes.

  **⚠️ REWRITTEN at activation — the gating problem is not where this task assumed.** Measured, not predicted: adding `"docs"` to the **`RightPanel` type union alone** — one word, no `AVAILABLE_PANELS` entry, no chord, no tab — **already fails the guard's chord arm**, because M11.5 WP4 put `panelHost.ts` in that arm's scope (it exports `panelForChord` + `PanelChordEvent`). So this is not "register conditionally"; it is **"decide where the `"docs"` identity may live at all,"** and `panelForChord`'s mnemonic map is in the same file. **Settle the gating shape before writing code.** Two candidate shapes, deliberately NOT pre-decided here:
  - make `AVAILABLE_PANELS` / `RightPanel` **gate-derived** rather than static — the guard's own header anticipates exactly this (*"If M11 makes AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that computation rather than deleting the assertion"*), so this path is sanctioned but requires a deliberate guard extension, **not** a weakening;
  - or hold the Docs panel's identity in a **separate gated module** that `panelHost.ts` never names.

  Whichever is chosen: **do not narrow the chord arm to make the error go away.** WP4 pinned the arm's reach and its offender predicate as standing tests precisely so that dodge fails loudly.
- [x] 2.4 Frontend: render the **workflow-ordered** list — pure ordering function `vision → roadmap → wbs (+ *wbs* scratch/parked) → wip/* → backlog (+ quality-findings) → .session.md → arch · research · context · design-priors · transitions`; unit-test the ordering derivation over a synthetic file set (present/absent mixes, both the `workflow-system/` and legacy layouts).
- [x] 2.5 Verify (self, via MCP bridge on a scratch workspace): the Docs tab appears, the chord + click select it, the list shows the right files in the right order for a real project.

**WP2 → WP3 rationale:** Stand up the panel + doc discovery (a pure, testable data path) before the render, so WP3 plugs a renderer into a known list + a known `docs_read` shape rather than co-mingling discovery bugs with render bugs.

---

### WP3: Read-only formatted render + auto-select-on-open + link navigation — ✅ SHIPPED 2026-08-02 (commit `6f6df23`)
**Description:** Render the selected doc as **formatted, read-only** markdown (per WP1's verdict) in the Docs panel: headings, tables, fenced code, and the WIP Work-Tree **task-list checkboxes + frontmatter** all render legibly. Wire the **auto-select-on-open** relevance rule and **link navigation**. The viewer never writes to disk.
**Milestone:** M11
**Dependencies:** WP1 (renderer verdict), WP2 (panel + list + `docs_read`)
**Size:** M
**Tasks:**
- [x] 3.1 Add the chosen renderer dependency (WP1 verdict: `react-markdown@10` + `remark-gfm@4` + `rehype-sanitize@6`) and render `docs_read` content → formatted read-only DOM in the panel; style for the dark-only theme (no light tokens — project convention). **⚠️ Do NOT add `rehype-raw`** — WP1's entire security verdict rests on that one invariant (it is what makes the renderer safe *by default* under the app's `csp: null`); nothing in code enforces it. Wanting inline HTML means **re-opening the WP1 verdict**, not adding a plugin. See "Probe outcomes" → WP1 verdict.
- [x] 3.2 Frontmatter renders as a legible styled header block (per WP1); task-list `- [ ]`/`- [x]` render as (non-interactive) checkboxes; tables + fenced code legible.
- [x] 3.3 **Auto-select-on-open** relevance rule — pure function `pickInitialDoc(docSet)`: `.session.md` if present → else the active `workflow-system/state/wip/*.md` (if one, else most-recently-modified wip) → else `roadmap.md` → else first in workflow order. Unit-test the ranking over synthetic doc sets. `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` — zero-ceremony landing, operator-confirmed.

  ✅ **`mtime_ms` ADDED to `DocEntry` 2026-08-02 — the "most-recently-modified wip" rule is IMPLEMENTED as written**, after an interim build shipped an alphabetical fallback (the DTO carried no timestamp). Reversed when the operator asked whether *created* time could serve: both cost the same to add — one field, one serde-shape test, one `metadata()` call in a fn that already stats the file — so the choice is correctness, not price. **Modification time wins:** measured on a live WIP, birth 08:48 vs mtime 09:28; creation time favors the newest-*started* item over the currently-active one, and this workflow `git mv`s WIP files to `archive/` and creates new ones, so birthtime tracks phase starts rather than where work is. Ties (incl. the `0.0` stat-failure fallback) fall through to the deterministic `file_name` order. ⚠️ Adding the field forced `Eq` off `DocEntry`'s derive (`f64`).

  ✅ **Direction RE-CONFIRMED 2026-08-02** (operator, WP3 verify-human): **the MOST DOWNSTREAM artifact wins** — `.session.md` first, `vision.md` last. Worth stating twice because the operator's own phrasing of the chain (*"vision > roadmap > wbs > wip > session pointer"*) reads as the literal opposite; `>` there means *"flows toward"*, not *"outranks"*. Both notations describe the same ranking. A reader who takes the arrow literally would invert the rule and land every project on `vision.md` (which nearly always exists, so the fallback tail would be dead code) — the exact failure this note prevents.
- [x] 3.4 **Link navigation:** in-doc anchors scroll within the panel; cross-doc links (`wbs.md`, another doc in the set) switch the selected doc; external `http(s)` links open in the default browser (existing `open`/shell seam) or are inert — never navigate the webview. (Mechanism per WP1.)
- [x] 3.5 Confirm read-only: no edit affordance, no write path (design-prior `new-surface-must-earn-its-place` — editing stays in Editor/CC).
- [x] 3.6 Verify (self, MCP bridge, scratch workspace): open Docs → lands on the re-orientation doc; task-lists/tables/frontmatter legible; click a cross-doc link → switches doc; external link doesn't hijack the webview.

**WP3 → WP4 rationale:** Get a correct static render + navigation working before adding the live-reload dynamics — WP4's scroll-preserve only matters once there is a rendered, scrolled doc to preserve.

---

### WP4: Scroll-preserving live reload (on `fs-change`) — ✅ SHIPPED 2026-08-02 (commit `480052e`, code-review refactor `966dca5`)
**Description:** When a rendered doc changes on disk, re-render its content **in place without resetting scroll to the top** — the common case being watching a `workflow-system/state/wip/*.md` update live while CC edits it (exactly this session's flow). Rides the existing QoL-WP0 `fs-change` watcher (`fs_watch` backend + `fsChange.ts` + `changeAppliesToWorkspace`) that `RightPanelHost` already consumes for editor reload — no new watcher.
**Milestone:** M11
**Dependencies:** WP3 (a rendered, scrollable doc to preserve)
**Size:** S
**Tasks:**
- [x] 4.1 Subscribe the Docs panel to `fs-change` (via the existing `RightPanelHost` fs-change handling): when the currently-rendered doc's path matches a change for this workspace, re-read (`docs_read`) + re-render.
- [x] 4.2 **Scroll-preserve:** capture `scrollTop` (or a stable anchor — nearest heading/line) before replacing content; restore it after the re-render. Resolves `SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`.
- [x] 4.3 Also re-derive the doc **list** on `fs-change` (a new `*wbs*.md` scratch file or a new `wip/*.md` appearing/disappearing updates the list).

  ⚠️ **AMENDED 2026-08-02 (operator decision at WP3 verify-human).** This task previously said the list re-derivation must happen *"without disturbing the current selection"*. That is now **half wrong**, and the distinction is the whole point:

  | fs-change event | Behavior |
  |---|---|
  | A doc **APPEARS** (new `wip/*.md`, `.session.md` created, new `*wbs*.md`) | **Re-run `pickInitialDoc` and JUMP to its answer** — this is the "a new phase started" signal, and landing on it is the re-orientation the panel exists for. |
  | A doc's **CONTENT** changes | Re-render in place (task 4.1), **selection untouched**. |
  | A doc **disappears** | Update the list; if it was selected, fall back to `pickInitialDoc`. |

  ⚠️ **The disappear row is NOT a rare edge case — `.session.md` is deleted routinely.** `/session-restore` deletes it at its step 7, every restore. So the common sequence is: open a workspace (panel lands on `.session.md`, the top-ranked doc) → restore the session → the file is gone while the panel is still showing it. **Confirmed absent in WP3** (operator question, 2026-08-02): the panel has no `fs-change` listener, so it keeps rendering *stale text from a deleted file* until something else is clicked. The ranking itself already handles the fall-through correctly — measured: dropping the `session` entry makes `pickInitialDoc` return the wip file — so WP4 needs only to *re-run* it, not to change it.

  **Two things this row must get right, both easy to miss:**
  1. **The fall-back applies even to an EXPLICIT user pick.** Everywhere else in this table an explicit selection is sacred; here it cannot be, because the doc it names no longer exists. Deleting the `chosen` sentinel (returning to "unchosen") is the correct move — NOT re-pointing it at whatever `pickInitialDoc` returns, which would silently convert an auto-selection into a fake "user choice" and suppress the next legitimate jump-on-appear.
  2. **A deleted-and-recreated file is an APPEAR, not a content change** — `.session.md` is written fresh by `/session-handoff` after being deleted by a restore. Whether the watcher coalesces delete+create into one event is a `notify` behavior WP4 must check empirically rather than assume.

  **The load-bearing constraint: an EXPLICIT user selection is never overridden.** CC rewrites WIP files many times per turn, so a jump-on-any-update would yank the doc out from under a reader mid-sentence — which is why create-only is the trigger. Track "has the user chosen?" the same way WP3 tracks it for the panel default (a `null`-means-unchosen sentinel, not a boolean flag bolted on). ⚠️ Note WP3 already reuses `pickInitialDoc` for first-load; this makes it fire on a second trigger, so it must stay a **pure function of the doc set** with no first-load-only assumptions baked in.
- [x] 4.4 Verify (self, MCP bridge, scratch workspace): render a wip doc, scroll mid-file, mutate the file on disk → content updates in place, scroll stays put (does not jump to top).

⚠️ **CORRECTION applied at WP5 P2 (2026-08-02, revised at that phase's verify-self audit) — WP4's
outcome 5 (hidden-panel deferred restore) was VACUOUS, and so was WP5's own attempt to settle it.
BOTH of WP5's carry experiments turned out non-decisive; the honest verdict is that neither the
deferred restore NOR the shrink clamp has ever been proven live.**

**Carry (a) — the browser supplied the answer, AND the arm under test was never the one running.**
*(These are causally chained, not two independent legs: the skip gate means nothing is captured while
hidden, so the catch-up capture reads the **live** `scrollTop` — which is 1200 only because WebKit
retained it. Retention is the supplier of the answer; the gate finding changes which arm ran.)* WP5 mutated
`pendingNext`'s `"deferred"` arm to `NO_PENDING` (discarding the held offset) and the panel *still*
returned to exactly 1200. The mutation was proven live four ways (executable-line `sed`, `git diff`,
3 named unit-test failures, and the **Vite-transformed module read over HTTP** — confirmed
`Cache-Control: no-cache`, i.e. the artifact the webview actually imports) after a full
`location.reload()`. Why it proved nothing:
1. **WebKit retains `scrollTop`** across a content swap on a `display:none`-but-never-unmounted node.
   Measured in isolation at WP5's verify-self, in a standalone `WKWebView` fixture containing **zero
   restore code**: hide → swap-while-hidden (scrollHeight 5700→5820) → reveal ⇒ returns to exactly
   **1200**. *(This also dissolves the apparent tension with `scrollTop: 0` while hidden — a
   zero-layout box reports zero offset while retaining scroll state internally.)*
2. **⚠️ The `"deferred"` arm never ran at all.** `DocsPanel.tsx:436` skips the reload entirely while
   the panel is not front (`if (!visibleRef.current) { staleRef.current = true; return; }`), and the
   catch-up effect at `:462` re-lists only **after** re-fronting — by which time the box is
   measurable, so `planRestore` returns `apply: true` and the **`"applied"`** arm runs. So the
   "mutate the file while the panel is hidden" recipe does **not** exercise the deferred path.
   **Do not retry that recipe believing it does.** The arm is still reachable, but only by a **race**:
   a reload that passes the `:436` gate while front, then a panel switch *during* the
   `docs_list`→`docs_read` round trip. **No experiment has ever exercised it.**

**Carry (b) — the doc-shrink clamp is vacuous for the SAME reason (this reverses WP5's first
write-up of it).** The earlier version of this block claimed (b) "PASSED genuinely … because the
clamp had to move the offset, so the browser could not supply the right answer on its own."
**Measured false.** The browser clamps `scrollTop` writes itself: in the live Claudesk webview,
writing `999999` or `max + 500` both land at exactly `scrollHeight − clientHeight`, and `-300` lands
at `0`. P2.2's recorded 533 is precisely `956 − 423` — the browser's own maximum. So a clamp-free
implementation is observationally identical to `planRestore`'s clamp.

**Neither finding is a defect in `pendingRestore.ts` or `docsScrollRestore.ts`** — both are
mutation-proven pure functions (20 + 22 tests), and both remain the only protection wherever the
browser does *not* volunteer the answer (a genuine unmount/remount, a different hiding strategy, a
non-WebKit engine, or a caller that compares the returned value back). The *behaviors* the operator
approved are real; only their **live proofs** were weaker than the records claimed.

**⚠️ The durable rule this whole episode exists to teach — and which WP5's own first write-up
violated while stating it: an observation is only decisive when a broken implementation would give a
different answer.** Both carries failed that test, and the second one failed it *in the very sentence
that asserted it*. Before spending a live run, ask what the browser (or any other layer) would do on
its own. Filed as `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`. See the
WP5 WIP → P2.1/P2.2/P2.3 and its Phase 2 verify-self audit.

---

### WP5: Milestone-exit verify — ✅ SHIPPED 2026-08-02 (commit `0951d2d`, review pass `8cda041`)
**Type:** probe (verification-only; produces the M11 exit verdict, no new software)
**Milestone:** M11
**Dependencies:** WP2, WP3, WP4
**Size:** XS
**Learning objective:** Does M11 meet its exit criterion end-to-end on a real project (and, for the parts that need it, the installed `.app`)?
**Success criterion:** A recorded PASS of the roadmap exit criterion: *From any workspace, the `Docs` tab renders that project's conventional product/workflow docs as formatted, scrollable, link-navigable markdown, read-only, with no external editor pop — and a live on-disk change re-renders in place without jumping scroll to the top.* Plus the auto-select-on-open + workflow-ordered-list operator decisions verified. Any installed-`.app`-only checks carried to the next `/release` gate per `[[installed-build-verify-deferred-to-release]]`.
**Tasks:**
- [x] 5.1 Drive the full exit criterion on a scratch workspace via the MCP bridge (open → auto-select → render fidelity → link nav → live-reload scroll-preserve).
- [x] 5.2 Record the M11 exit verdict (GO / issues) in "Probe outcomes"; carry any installed-`.app`-only items to the release gate.

---

## Dependency map

```
WP1 (render probe) ─┐
                    ├─→ WP3 (render + auto-select + links) ─→ WP4 (live reload) ─→ WP5 (exit verify)
WP2 (panel + list) ─┘
```

- **Critical path:** WP1 → WP3 → WP4 → WP5 (WP2 is on the path into WP3 but can run in parallel with WP1).
- **Parallel track:** WP1 (probe, knowledge) ∥ WP2 (panel plumbing, pure data path) — both must land before WP3. Everything reuses existing seams (`RightPanelHost`, `fs-change` watcher, `validate_root`/`resolve_within`), so there is no environment/infra WP and no orchestration/async layer.

## Architecture check

M11 adds **one new frontend panel** to an existing per-workspace host and **two small read-only backend commands** (`docs_list` / `docs_read`) reusing the `validate_root` + `read_file_core` trust seams *(corrected at activation — `resolve_within` is private)* and the existing `fs-change` watcher. The **one net-new dependency** is a markdown renderer (decided at WP1). No new webview, no new data store, no new native surface, no async/orchestration layer. **No architectural gap → no P8 back-loop to `/product-arch`.**

**One architectural question is in-scope but bounded, and belongs to WP2, not to `/product-arch`:** whether `AVAILABLE_PANELS` / the `RightPanel` union become **gate-derived** rather than static (see the Activation audit + task 2.3). This changes the *shape* of an existing registry rather than adding a component, the guard's own header explicitly sanctions and anticipates it, and the decision needs the panel in hand to make well — so it is a build-time call inside WP2 with the alternative recorded, not a milestone-blocking architecture gap. If WP2 finds the choice has consequences beyond `panelHost.ts` + the guard, *that* would justify a P8 back-loop; nothing seen at activation suggests it will.

Arch gets an as-built resync at `/product-finalize` (the `RightPanelHost` row grows Editor/Diff/Terminal → +Docs; the renderer dep, the two commands, and whichever gating shape WP2 chose recorded then).

## Probe outcomes

### WP5 verdict (2026-08-02) — **M11 MILESTONE EXIT: GO**

Driven live on the real WKWebView via the MCP bridge against a purpose-built 11-file scratch fixture,
with the gate ON. Verdict per exit-criterion clause, quoting `roadmap.md`:

> *"From any workspace, the `Docs` tab renders that project's conventional product/workflow docs as
> formatted, scrollable, link-navigable markdown, read-only, with no external editor pop — and a live
> on-disk change re-renders in place without jumping scroll to the top."*

| Clause | Verdict | Evidence |
|---|---|---|
| `Docs` tab exists, is reachable | **PASS** | `panel-tab-docs` present; tab row `"DocsEditorDiffTerminal"` (Docs **first**, per the WP3 operator call); click **and** `⌘⇧K` both select it — the chord proven by a **positive control** (Editor → Docs on the same dispatch that is inert with the gate off) |
| "that project's conventional docs" | **PASS** | 11/11 fixture docs discovered; absent `research.md`/`context.md` **structurally** omitted, not rendered as empty rows |
| **workflow-ordered** | **PASS (mechanical)** | live order captured verbatim from `data-rel-path` **and** independently re-derived from `KIND_ORDER`, shuffle-invariant over 200 permutations |
| **formatted** markdown | **PASS** | parsed-DOM counts vs. source truth: **11 task-list checkboxes / 2 checked / all `disabled`**; 1 table, 1 `pre code`, h1/h2×4/h3; frontmatter as **1 styled block with 0 `<hr>`** (not the WP1-measured mangling shape) |
| **scrollable** | **PASS** | panel owns the scroll container — anchor scroll moved `.docs-content` 0 → 881 with `window.scrollY` unchanged at 0 |
| **link-navigable** | **PASS** | all four `classifyHref` classes: in-doc anchor scrolls within the panel; cross-doc switches doc **two-sidedly** (new text present, old text gone); `https://` **and** protocol-relative `//host` leave `location.href` unchanged with no `beforeunload` — no hijack; `[[slug]]` inert with **no `<a>` emitted** |
| **read-only** | **PASS** | 0 `textarea`, 0 `[contenteditable]`, 0 non-checkbox `input`; Rust registers exactly `docs_list` + `docs_read`, both reads. ⚠️ Scoped claim: this is a property of the **panel**, not of the webview (which under `csp: null` still reaches `editor_fs::write_file` et al.) — operator-accepted |
| **no external editor pop** | **PASS** | `pgrep` for Sublime Text/Merge: none at baseline, none after the full sequence. *(A clause no prior WP had ever checked.)* |
| **live change re-renders in place, no jump to top** | **PASS** | scrolled to 1200 (of `scrollHeight` 5662 / `clientHeight` 423), appended on disk → new text rendered, `scrollHeight` 5662 → 5754, and a **no-dedup 4ms sampler** shows **17 samples, `distinctTops: [1200]`**, straddling the swap frame-by-frame. Not a single post-hoc read. |
| **Gate OFF ⇒ the surface does not exist** | **PASS** | zero `docs`-bearing testids anywhere, tab row back to `"EditorDiffTerminal"`, chord inert — then toggled back ON and the surface returned (15 testids), which is what makes the absence meaningful |
| Auto-select-on-open (operator decision 1) | **PASS** | lands on `.session.md` with no click, positively identified by a distinctive marker; remove it → lands on the newest **wip**, not `vision.md` |
| Workflow-ordered list (operator decision 2) | **PASS** | see the ordering row |

**Static gate at exit:** `tsc` 0 · `pnpm lint` 0 errors (1 pre-existing `XtermPane` warning) ·
`format:check` clean · **1733 tests / 140 files** · `vite build` clean with `DocsPanel` still its own
**171 kB lazy chunk** (`main` 440 kB, not ~606 kB) · the **OFF-invariant guard 14/14** including the
M11.5 WP4 meta-tests — so M11 landed its Docs surface **without narrowing the guard to fit**, which is
the property M11.5 was paid to protect.

**Three things this WP changed beyond verifying:**

1. **A REPRODUCED defect was found and FIXED** (`…QUALITY-WP4-SIBLING-EDIT-MOVES-AUTOSELECTION`).
   Editing a wip file the reader was **not** looking at moved the auto-selection — measured live as
   reading `older-feature.md` at `scrollTop` 600 and landing at `scrollTop` 0 of `newer-feature.md`,
   with no reload arm running. **Operator chose "pin once resolved"**: a fourth precedence tier
   (`chosen` > `jumpedTo` > `settled` > live `pickInitialDoc`), latched where the list arrives.
   ⚠️ This is a **deliberate scope extension** of a WP the WBS sized as verification-only — the
   operator's call, made against a live reproduction, and it grew to 5 source files.

   ⚠️ **The first version of this fix shipped a FIFTH selection-change path, caught at verify-self.**
   The `"refallback"` arm cleared the latch and wrote nothing, dropping the panel permanently onto the
   live-compute tier — so after `/session-restore` deletes `.session.md` (**every** restore), a sibling
   edit reproduced the original defect. Fixed by having that arm **re-latch** onto `decision.selected`.
   Two wiring-guard bypasses were found in the same audit (a count-based guard accepted a one-line edit
   that made the whole fix inert); the guard now pins release **sites**, not a count. **7 mutants bite.**

   ⚠️ **The post-fix behavior is NOT live-verified, by informed operator decision.** The live table
   above was recorded *before* the fifth path was found, so it exercised the **broken** version; the fix
   rests on 1734 tests + 7 mutants, which do not prove React re-renders with the latched value through a
   real `fs-change` cycle. The operator was shown the 5-step re-drive sequence and chose to skip it
   (failure mode is visible-but-harmless: the selection moves, nothing is lost). **Do not read the
   sibling-edit row as covering the shipped fix.** The declined sequence is recorded in the WP5 WIP →
   "Phase 3 verify-human".
2. **Two WP4 evidence claims were RETRACTED** — see the ⚠️ CORRECTION under WP4 task 4.4. Neither the
   deferred restore nor the doc-shrink clamp has ever been proven live, because **the browser supplies
   the correct answer unaided in both cases**. No code defect; both pure modules remain mutation-proven.
3. **Carry (d) (comment density, flagged a third consecutive WP) was PAID** — 50 comment lines cut from
   the two named offenders with all four ⚠️ invariants preserved in tighter form, plus the
   **prose-vs-code disagreement** that had cost a whole live experiment.

**Carried to the next `/release` gate** per `[[installed-build-verify-deferred-to-release]]`: nothing
Docs-specific requires the installed `.app` (no PATH/env/external-spawn surface), so the standing
carry is only the general first-run check already queued from M10.9. **One clause is
operator-accepted-as-asserted rather than observed:** *"from any workspace"* was driven on **one**
scratch workspace (the per-workspace architecture is unchanged from M4).

**Open, filed, not blocking:** `…BROWSER-SUPPLIES-THE-ANSWER…` (low — the race path is the one method
that would genuinely reach the deferred arm; operator's binding decision was **not** to drive it during
M11) · `…RAF-DOES-NOT-TICK-IN-MCP-BRIDGE-EVAL-CONTEXT` (medium, candidate bridge caveat (h)) ·
`…JSDOM-CLIENTHEIGHT-IS-ZERO…` (medium) · `…SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE` (medium, app-wide).

### WP1 verdict (2026-08-01) — markdown render approach

**CHOSEN: Option B — `react-markdown` + `remark-gfm` + `rehype-sanitize`.**

Add at WP3 task 3.1: `react-markdown@10`, `remark-gfm@4`, `rehype-sanitize@6`. **Do NOT add `rehype-raw`** — see "the one rule" below. No other new dependency; `react-dom/server` (needed only by tests) already ships with the existing `react-dom`.

**Why — the deciding axis was security posture under `csp: null`, not fidelity.**

Fidelity was a **dead heat** and decided nothing: both options rendered the real `wbs.md` and a real 78-item Work-Tree WIP identically — GFM task-list checkboxes **78 = 78 = 78** against source truth (checked-state 58/58 too), tables, fenced code, headings all structurally identical. The WBS framed WP1 as primarily a fidelity comparison; it isn't one.

**⚠️ The app ships with `"security": { "csp": null }`** (`tauri.conf.json:21-23`) — there is **no CSP**, so the sanitizer is the *only* line of defense, and anything that executes gets full `__TAURI_INTERNALS__` (whole IPC surface) access. Measured against an 11-section hostile fixture (8 sections initially; **expanded to 11 at verify-self** when the predicate was found to miss the style-attribute class), scoring the **parsed live DOM** (not source text):

| config | live vectors | what it takes to get there |
|---|---|---|
| A unsanitized *(control)* | **20** | — |
| **A + DOMPurify defaults** | **4** | ⚠️ defaults are NOT safe here |
| A + full recipe | **0** | 3 individually-necessary options **+ a hand-written hook** |
| **B default** | **0** | **nothing** |
| B + `rehype-raw`, unsanitized *(control)* | **10** | — |
| B + `rehype-raw` + `rehype-sanitize` | **0** | — |

Both negative controls fire, so neither zero is vacuous. A's four survivors on defaults are a live `<style>`, **two `style`-ATTRIBUTE vectors** (`background:url(javascript:…)`, `width:expression(…)` — DOMPurify's default `ALLOWED_ATTR` includes `style` and it does not parse CSS), and an `<img src="data:image/svg+xml;base64,…">` decoding to `<svg onload="alert(1)">`. **Neither `FORBID_TAGS` nor the strictest `ALLOWED_URI_REGEXP` removes that `data:` URI** (three configs probed); it needs an `afterSanitizeAttributes` hook. Each of A's three guard options is **mutation-proven load-bearing** — dropping the hook → 1, dropping `FORBID_ATTR` → 2, dropping `FORBID_TAGS` → 1, dropping all → 4. **The failure mode of forgetting any one is silent.** B needs none of it.

**The honest counter-argument, recorded because it is real — with its cost stated correctly.** B's zero is *structural avoidance*, not sanitization: it escapes raw HTML wholesale, so the guarantee holds only while `rehype-raw` stays off (measured, not assumed — with `rehype-raw` on and no sanitizer, B leaks **10** live vectors). And A is genuinely lighter. **Measured as actual shipped bundle** (esbuild, minified, React external as in the app):

| | minified | gzipped | transitive packages |
|---|---|---|---|
| **A** (`marked` + `dompurify`) | **68.5 KB** | **22.7 KB** | **3** |
| **B** (`react-markdown` + `remark-gfm` + `rehype-sanitize`) | **157.3 KB** | **48.0 KB** | **105** |

So the real cost of B is **~89 KB minified / ~25 KB gzipped (a 2.3× delta) and ~100 net-new transitive packages** — the package count being the genuine supply-chain concern, not the size.

*Package counts are from **clean isolated installs**, one throwaway dir per option (independently reproduced at verify-self). Earlier notes in the WIP's evidence trail cite 5 / 107 — those came from the **shared** spike `node_modules`, which contained both options plus probe-only `jsdom`, and are superseded by the isolated figures here. Bundle sizes are esbuild, minified, ESM, with `react`/`react-dom` external (they already ship with the app).*

⚠️ **An earlier draft of this verdict said "20× lighter — 4.4M vs 43M." That was wrong and is corrected above.** It reported `node_modules` size, which is not bundle cost (DOMPurify is 1.7M on disk and 28.5 KB minified), and the 43M figure was contaminated — it included React, which the app already ships. **Do not resurrect that framing**; the WBS asked for *bundle cost* (this file, WP1 learning objective) and the numbers above are it.

**B was chosen anyway**, and the corrected numbers strengthen rather than weaken that: ~25 KB gzipped buys the removal of a standing, silent, three-part configuration obligation on the app's **only** line of defense under `csp: null`. For scale against this project's own precedent — Tauri-over-Electron was a ~93 **MB** shipped difference; this is ~89 **KB**, roughly a thousandth of it, so "lite over featureful" (a principle about product surface and runtime footprint) is not in tension here. `rehype-sanitize` is retained as defense-in-depth so the posture degrades safely if raw HTML is ever enabled.

**⚠️ THE ONE RULE THIS VERDICT DEPENDS ON: never add `rehype-raw`.** It is what makes B's safety structural. If a future doc genuinely needs inline HTML, B collapses to A's situation and needs the same sanitizer discipline — treat that as a decision to re-open this verdict, not a config tweak. *(Note `rehype-sanitize` is stricter than DOMPurify in places — dropping a `<form>` wrapper and flattening `<svg><a>` were **reported at verify-self and never independently re-measured**, so treat them as indicative rather than pinned; the fixture and before/after were not recorded. Harmless for workflow docs either way; worth knowing if benign content ever disappears. Softened at the 2026-08-12 paydown sweep — SURFACE-2026-08-01-QUALITY-WP1-SANITIZE-STRICTNESS-UNTRACED.)*

**Frontmatter — DECIDED: shared pre-strip, renderer-agnostic.** Both options **mangle** a leading YAML block identically (opening `---` → `<hr>`, closing `---` turns the YAML into a setext `<h2>`). Split it off before the renderer, then render the frontmatter yourself as the styled header block.

⚠️ **CORRECTED at WP3 (2026-08-02) — the pattern originally recorded here was `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`, and it does NOT satisfy the "leading thematic break" case listed among the 6 validated edge cases below.** Measured, not inferred: against `---\n\nProse.\n\n---\n` it matches and captures `\nProse.\n` as frontmatter, **deleting a real paragraph from the rendered body**. The shipped pattern adds a non-blank-first-line guard — `/^---\r?\n(?![\r\n])([\s\S]*?)\r?\n---\r?\n?/` — on the grounds that YAML frontmatter opens with a `key:` line and never a blank one. Mutation-proven load-bearing (removing `(?![\r\n])` fails exactly that case) and pinned by `src/components/workspace/__tests__/frontmatter.test.ts`. **Use the corrected pattern; do not copy the one from the original verdict text.** Chosen over `remark-frontmatter` (which correctly consumes the fence but **renders nothing**, leaving the panel without the YAML it needs to display). Validated on 6 real edge cases: no-frontmatter → no match; **a leading thematic break is correctly NOT treated as frontmatter**; a later `---` in the body is untouched; CRLF matches. Known boundary: an *empty* `---\n---` block falls through to the mangling path — **0 of 54** frontmatter-bearing docs have one.

**Link model — the interception mechanism does not discriminate.** Use a **delegated click handler** on the panel container (`e.target.closest("a[href]")` → `preventDefault()`), which is renderer-agnostic and simpler than B's `components={{a}}` override. Classifier validated on 8 real shapes — **order matters**: test `#` first, then any `scheme:`, then `//`, then treat the rest as relative.

| href shape | class | action |
|---|---|---|
| `#heading` | in-doc anchor | scroll within panel |
| `wbs.md`, `workflow-system/product/roadmap.md`, `wbs.md#frag` | cross-doc relative | switch selected doc |
| `https:`, `http:`, `mailto:` | external (absolute scheme) | `openUrl` |
| **`//evil.example.com`** | **external (protocol-relative)** | `openUrl` |

⚠️ **The protocol-relative case is why the test must not be `startsWith("http")`** — it is *external* but carries no scheme, and a naive check misroutes it into the local-file path. **P2.3's realistic failure did not materialize:** no sanitizer in any variant stripped `href="wbs.md"`, `href="#heading"`, or the external href — cross-doc navigation is safe in every candidate config.

⚠️ **`[[slug]]` memory-style links are NOT handled — measured, and out of scope for the delegated handler.** WP1's learning objective (this file, "Link behavior") named them alongside markdown links. Measured against the chosen renderer: **`[[slug]]` renders as literal text and emits NO `<a>` element at all** (`See [[verify-the-mutation-landed]]` → `<p>See [[verify-the-mutation-landed]] …</p>`). So the delegated click handler **structurally cannot see them** — this is not a classifier gap that a better predicate would fix. They are common in this repo's real docs (7 occurrences across `backlog.md` + `CLAUDE.md`), so WP3 will meet them immediately. **Options for WP3, deliberately not pre-decided:** accept them as inert plain text (cheapest; they still *read* fine), or add a small `remark` plugin that rewrites `[[slug]]` → a real link node before render (which then flows through the same delegated handler as any cross-doc link). **Do not discover this mid-build** — decide it at task 3.4.

**External-open seam — available and granted, but uncalled.** `@tauri-apps/plugin-opener` is already in `package.json`, registered at `lib.rs:152`, with `opener:default` granted in **both** `capabilities/default.json:8` and the `tauri.dev.json` inline dev capability. **Zero call sites in `src/` today** — WP3 writes the first. Exact signature: `openUrl(url: string | URL, openWith?: 'inAppBrowser' | string): Promise<void>`.

**Re-render-in-place: SAFE for WP4** (both options, so this did not discriminate either). Render A → render a *different* doc → render A again is **byte-identical**, and stable across **5 alternating cycles** (tested with a single reused DOMPurify instance — the realistic component shape, and the only place hook/config state could accumulate; verify-self additionally confirmed shared-instance output is byte-identical to fresh-instance, so nothing accumulates at all). Neither renderer emits **any** inline `style` attribute or a wrapper root; both produce a **flat sibling list**, so **the panel owns the scroll container** — exactly what WP4's `scrollTop` restore requires.

⚠️ **The idempotence byte-counts and node-counts are NOT pinnable constants** — the fixture was this very file, which grew while the probe ran. WP3/WP4 should assert the *property* (two renders of the same input are identical) and never a literal byte count.

**Testability under the no-render-harness posture** (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` — 127 test files, none renders a component): **B's output is string-assertable with no new dependency**, via `renderToStaticMarkup` from `react-dom/server`, which already ships with the installed `react-dom` (verified resolvable). So WP3 can pin render output as a value without adopting `@testing-library/react` and without re-opening that deferred decision.

**⚠️ Two method notes for WP3, both learned the hard way here:**
1. **Assert the parsed live DOM, never source text.** The first danger predicate used source-text regexes and produced false positives — it counted the fixture's own *heading prose* ("3. `javascript:` URL in a markdown link") and `&lt;`-escaped **inert** text as live vectors. Same class as the `?raw`-guard trap in `CLAUDE.md`.
2. **A security guard must be mutation-proven, not merely present.** The *corrected* predicate still had a hole — no `style`-attribute probe — which made a "0 danger" result **under-determined**: it passed only because the config happened to include `FORBID_ATTR:["style"]`, which the predicate could not detect. Found by inviting a verify-self subagent to *attack* the predicate rather than confirm it. Any WP3 sanitization test must include a style-attribute probe and a mutation check.

**Known latent gaps (COSMETIC, logged):** `img[srcset]` and `track[src]` referencing an external host survive even A's full recipe and are unmodeled — outbound network/beacon references, not script execution, and relevant only because `csp: null` means nothing else blocks the request.

**Backlog items raised:** `SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE` (medium, arch — decide and record the CSP posture) and `SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE` (low — **moot under this verdict; close it**).
