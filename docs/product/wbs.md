---
stage: wbs
state: complete
milestone: "Milestone 11: Workflow-docs markdown viewer"
updated: 2026-07-20
---

# WBS — Milestone 11: Workflow-docs markdown viewer

Decomposes **only** the immediate next milestone (M11). Future milestones (M12 auto-resume → M13 skill-orchestration → M14 polish) stay tracked in `roadmap.md` — not re-listed here; they decompose just-in-time when reached.

## Milestone intent (read before scoping any WP)

M11 is an **attention-routing / re-orientation feature wearing a "viewer" costume** — not a generic markdown preview (memory `[[m7-docs-viewer-intent]]`). When the operator context-switches *into* a cold project across 20+ rotating projects, the first question is **"where was I in the workflow, and what's next?"** — an answer that lives in `roadmap → wbs → wip → backlog → .session.md`. M11 makes that re-orientation a single glance in the right half, per-workspace, instead of popping Sublime or reading raw markdown in the Editor. Read-only is correct (editing stays in Editor/CC).

**Operator decisions locked at this WBS (2026-07-20):**
1. **Auto-select the most-relevant doc on open** — `.session.md` if present → else active `workflow/wip/*.md` → else `roadmap.md`. The file list is still there to switch. Resolves the intent memory's explicit open question.
2. **Workflow-ordered doc list** — vision → roadmap → wbs (+ `*wbs*.md` scratch) → wip → backlog → `.session.md` → (arch · research · context), grouped, in that sequence; not alphabetical.

## Design-prior consult (fired at WP-boundary decisions)

- **`[[new-surface-must-earn-its-place-against-existing-ones]]`** — the Docs tab overlaps the **Editor** tab, which already opens `.md` files. Decision-rule run: the Docs tab's *irreducible non-overlap* is (a) **formatted** render (Editor shows raw CM6 source), (b) an **auto-discovered curated doc set** (no hunting through the file tree), (c) **auto-select re-orientation** (lands on "where was I"). All three are genuine non-overlap → the surface earns its place; it is not a subset of Editor. **Rule 2 (prior agrees with the common-sense default)** — no override flag; scope stays as the roadmap framed it. The prior *did* trim one thing: the viewer must **never write** — any "edit this doc" affordance would re-implement the Editor and is cut.
- **`[[primary-surface-is-zero-ceremony-not-a-mode]]`** — fired on the auto-select decision. The operator chose auto-select over "pick a file from a list," i.e. the doc you want is already open with zero ceremony; the list is a switch, not a gate. `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` leaning auto-select — **operator confirmed at this WBS**, so this is a taken-with-confidence, not a tie-break.

No new design prior proposed — the two decisions above are applications of existing priors + a scope choice, not a new transferable lean.

---

## Work Packages

### WP1: Probe — markdown render approach (fidelity, links, live-region, CSP)
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
- [ ] 1.1 Spike both realistic renderer options against a real doc (this `wbs.md` + a live `workflow/wip/*.md` with a Work-Tree) — eyeball task-list/table/code/frontmatter fidelity.
- [ ] 1.2 Determine the link-intercept mechanism for in-doc / cross-doc / external, and how the renderer exposes hrefs.
- [ ] 1.3 Confirm CSP compatibility + re-render-in-place safety (no internal scroll reset).
- [ ] 1.4 Write the verdict to "Probe outcomes" (renderer + dep + link model + frontmatter treatment).

**WP1 → WP2 rationale:** Resolve the render-approach + dependency unknown *first*, cheaply, before building either the panel plumbing or the render — so WP3 isn't designed around an assumed renderer API or a dep that fails CSP/GFM. Standard 3rd-party-probe-before-build ordering (§4).

---

### WP2: Docs panel plumbing — 4th `RightPanelHost` panel + auto-discovered, workflow-ordered doc list
**Description:** Add **Docs** as the fourth panel in the per-workspace `RightPanelHost`, alongside Editor / Diff / Terminal — a new clickable tab in the `right-panel-toggle` tab row **and** a direct-select `⌘⇧`-chord (next free chord, disjoint from `⌘⇧E` Editor / `⌘⇧D` Diff / `⌘⇧T` Terminal, the freed `⌘⇧O`, and the reserved `⌘⇧+digit` workspace switch — likely `⌘⇧K` or `⌘⇧G`; pick and pin in-build). The panel body is a **workflow-ordered file list** of the auto-discovered conventional doc set, scoped to the workspace's project. No render yet (WP3) — this WP is the tab, the chord, the discovery, and the list. Per-workspace panel state (which doc is selected, scroll) lives alongside the existing per-workspace Editor/Diff/Terminal state, mirroring "all workspaces stay mounted."
**Milestone:** M11
**Dependencies:** none (parallel-able with WP1; the render (WP3) needs both)
**Size:** M
**Tasks:**
- [ ] 2.1 Backend: a `docs_list` command (new small `docs` module, or fold into an existing fs command surface) that, given a workspace project root, returns the present conventional docs — `docs/product/*.md` (vision, roadmap, research, arch, context) + **glob `*wbs*.md`** (canonical `wbs.md` **and** temporary/scratch WBS files), `workflow/wip/*.md`, `workflow/backlog.md`, `workflow/.session.md`. Absent files are silent no-ops. **CHANGELOG.md deliberately excluded.** Root authenticated via the WP7 `validate_root` seam (reuse — do not re-trust a frontend root).
- [ ] 2.2 Backend: a `docs_read` command returning a single doc's raw text (read-only; reuse `editor_fs::read_file`'s `resolve_within` + `validate_root` posture — the doc set is a strict subset of the project tree, so no new trust surface).
- [ ] 2.3 Frontend: register the Docs panel in `RightPanelHost` — tab button, the `⌘⇧`-chord (add to the chord map; confirm disjoint), and the panel container. All workspaces stay mounted; switching is display toggling, not remount.
- [ ] 2.4 Frontend: render the **workflow-ordered** list — pure ordering function `vision → roadmap → wbs (+ *wbs* scratch) → wip/* → backlog → .session.md → arch · research · context`; unit-test the ordering derivation over a synthetic file set (present/absent mixes).
- [ ] 2.5 Verify (self, via MCP bridge on a scratch workspace): the Docs tab appears, the chord + click select it, the list shows the right files in the right order for a real project.

**WP2 → WP3 rationale:** Stand up the panel + doc discovery (a pure, testable data path) before the render, so WP3 plugs a renderer into a known list + a known `docs_read` shape rather than co-mingling discovery bugs with render bugs.

---

### WP3: Read-only formatted render + auto-select-on-open + link navigation
**Description:** Render the selected doc as **formatted, read-only** markdown (per WP1's verdict) in the Docs panel: headings, tables, fenced code, and the WIP Work-Tree **task-list checkboxes + frontmatter** all render legibly. Wire the **auto-select-on-open** relevance rule and **link navigation**. The viewer never writes to disk.
**Milestone:** M11
**Dependencies:** WP1 (renderer verdict), WP2 (panel + list + `docs_read`)
**Size:** M
**Tasks:**
- [ ] 3.1 Add the chosen renderer dependency (WP1) and render `docs_read` content → formatted read-only DOM in the panel; style for the dark-only theme (no light tokens — project convention).
- [ ] 3.2 Frontmatter renders as a legible styled header block (per WP1); task-list `- [ ]`/`- [x]` render as (non-interactive) checkboxes; tables + fenced code legible.
- [ ] 3.3 **Auto-select-on-open** relevance rule — pure function `pickInitialDoc(docSet)`: `.session.md` if present → else the active `workflow/wip/*.md` (if one, else most-recently-modified wip) → else `roadmap.md` → else first in workflow order. Unit-test the ranking over synthetic doc sets. `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` — zero-ceremony landing, operator-confirmed.
- [ ] 3.4 **Link navigation:** in-doc anchors scroll within the panel; cross-doc links (`wbs.md`, another doc in the set) switch the selected doc; external `http(s)` links open in the default browser (existing `open`/shell seam) or are inert — never navigate the webview. (Mechanism per WP1.)
- [ ] 3.5 Confirm read-only: no edit affordance, no write path (design-prior `new-surface-must-earn-its-place` — editing stays in Editor/CC).
- [ ] 3.6 Verify (self, MCP bridge, scratch workspace): open Docs → lands on the re-orientation doc; task-lists/tables/frontmatter legible; click a cross-doc link → switches doc; external link doesn't hijack the webview.

**WP3 → WP4 rationale:** Get a correct static render + navigation working before adding the live-reload dynamics — WP4's scroll-preserve only matters once there is a rendered, scrolled doc to preserve.

---

### WP4: Scroll-preserving live reload (on `fs-change`)
**Description:** When a rendered doc changes on disk, re-render its content **in place without resetting scroll to the top** — the common case being watching a `workflow/wip/*.md` update live while CC edits it (exactly this session's flow). Rides the existing QoL-WP0 `fs-change` watcher (`fs_watch` backend + `fsChange.ts` + `changeAppliesToWorkspace`) that `RightPanelHost` already consumes for editor reload — no new watcher.
**Milestone:** M11
**Dependencies:** WP3 (a rendered, scrollable doc to preserve)
**Size:** S
**Tasks:**
- [ ] 4.1 Subscribe the Docs panel to `fs-change` (via the existing `RightPanelHost` fs-change handling): when the currently-rendered doc's path matches a change for this workspace, re-read (`docs_read`) + re-render.
- [ ] 4.2 **Scroll-preserve:** capture `scrollTop` (or a stable anchor — nearest heading/line) before replacing content; restore it after the re-render. Resolves `SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`.
- [ ] 4.3 Also re-derive the doc **list** on `fs-change` (a new `*wbs*.md` scratch file or a new `wip/*.md` appearing/disappearing updates the list) without disturbing the current selection/scroll.
- [ ] 4.4 Verify (self, MCP bridge, scratch workspace): render a wip doc, scroll mid-file, mutate the file on disk → content updates in place, scroll stays put (does not jump to top).

---

### WP5: Milestone-exit verify
**Type:** probe (verification-only; produces the M11 exit verdict, no new software)
**Milestone:** M11
**Dependencies:** WP2, WP3, WP4
**Size:** XS
**Learning objective:** Does M11 meet its exit criterion end-to-end on a real project (and, for the parts that need it, the installed `.app`)?
**Success criterion:** A recorded PASS of the roadmap exit criterion: *From any workspace, the `Docs` tab renders that project's conventional product/workflow docs as formatted, scrollable, link-navigable markdown, read-only, with no external editor pop — and a live on-disk change re-renders in place without jumping scroll to the top.* Plus the auto-select-on-open + workflow-ordered-list operator decisions verified. Any installed-`.app`-only checks carried to the next `/release` gate per `[[installed-build-verify-deferred-to-release]]`.
**Tasks:**
- [ ] 5.1 Drive the full exit criterion on a scratch workspace via the MCP bridge (open → auto-select → render fidelity → link nav → live-reload scroll-preserve).
- [ ] 5.2 Record the M11 exit verdict (GO / issues) in "Probe outcomes"; carry any installed-`.app`-only items to the release gate.

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

M11 adds **one new frontend panel** to an existing per-workspace host and **two small read-only backend commands** (`docs_list` / `docs_read`) reusing the `validate_root` + `resolve_within` trust seams and the existing `fs-change` watcher. The **one net-new dependency** is a markdown renderer (decided at WP1). No new webview, no new data store, no new native surface, no async/orchestration layer. **No architectural gap → no P8 back-loop to `/product-arch`.** Arch gets an as-built resync at `/product-finalize` (the `RightPanelHost` row grows Editor/Diff/Terminal → +Docs; the renderer dep + the two commands recorded then).

## Probe outcomes
*(WP1's renderer verdict + WP5's exit verdict land here at their WP closes.)*
