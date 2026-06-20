# Feature: WP4 Diff-Viewer Polish Follow-up

**Workflow:** feature
**State:** COMPLETED 2026-06-20 (shipped 5051bd4, review-quality clean, finalized)
**Created:** 2026-06-20
**Drive mode:** autopilot (standing directive: halt at WBS-level WP boundaries; this is a follow-up to the shipped WP4, not a new WBS WP)

## Problem Statement

The WP4 Sublime-Merge-style git diff viewer shipped + was operator-approved (commits `4e2d742`/`0e0d501`), with four enhancements explicitly deferred to keep WP4 shippable (`SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS`). This feature lands all four — none is a UX redesign, all are additive to the existing `DiffPanel`/`HunkView`/`FileDiffSection` + `App.css`: **(4, highest priority)** changed +/- lines read as a faint full-width wash that makes the change hard to see — bump the line-background opacity (`.16`→`~.24`) and add a saturated 3px left accent bar per add/remove line; **(2)** a collapse-all/expand-all control over the file sections (the `collapsed` Set model already supports bulk — needs pure `collapseAll`/`expandAll` helpers + a button that works in both working-dir and commit views); **(1)** pin the Commits header (`.diff-commits-header`) and the commit banner (`.diff-commit-banner`) sticky within `.diff-scroll` so they don't scroll away (the `.diff-statusbar` is already a non-scrolling flex sibling above `.diff-scroll` — verify live, extend only if it actually scrolls); **(3)** an "Open in editor" affordance per file row that sets the workspace's `openPath` + flips the right panel to the editor tab (working-tree content via existing `read_file`; opening a commit-row file *at that commit* — blob-at-rev — is **deferred to WP5**, noted in code + a new SURFACE). Plus an opportunistic 2-line doc-drift fix in `git_diff/mod.rs` (stale `[file_base_core]` doc-link; wrong `diff_*` API name in `file_hunks_core` doc).

**[Back-loop re-check 2026-06-20 (F12)]** Problem statement unchanged — still the same two polish items (legibility of changes; sticky commit history). What shifted is the *symptom diagnosis*, surfaced at operator verify-human: item 4's accent-bar+wash actually works; the apparent "grey highlight" was a per-line horizontal scrollbar → real fix is word-wrapping diff lines (editor stays wrap:false). Item 1's sticky scope is wider than first built → pin the whole `.diff-commits` section, not just its header row. Both are refinements within the same root problem.

## Work Tree

- [x] Phase 1: Diff-viewer polish — four enhancements + doc-drift fix  <!-- status: done — all impl + all 4 verify nodes complete; operator-approved 2026-06-20 -->

  **Observable outcomes:**
  - Browser (item 4): in `pnpm tauri dev` on this repo, the Diff panel's add/remove lines show a clearly-saturated left accent bar (green `#3fb950` / red `#f85149`) AND a more-visible row background; verifiable via Playwright/devtools that `.diff-line.is-add` computed style has a non-transparent `border-left-color` and a background-alpha ≥ `.24`. (Live human read on actual legibility; the computed-style check is the mechanical floor.)
  - Browser (item 2): a "Collapse all"/"Expand all" control is present in the diff panel chrome (`[data-testid="diff-collapse-all"]`); clicking "Collapse all" collapses every file section (no `.diff-file-body` rendered); clicking again ("Expand all") re-renders them. Works identically in the working-dir view and a selected-commit view.
  - Browser (item 1): with enough files to overflow `.diff-scroll`, scrolling the files area keeps `.diff-commits-header` (and, in commit view, `.diff-commit-banner`) pinned at the top — computed style `position: sticky`, and the element stays visible at scrollTop > 0.
  - Browser (item 3): each `.diff-file-header` has an "open in editor" control (`[data-testid="diff-open-in-editor"]`); clicking it sets the editor's open file to that path AND switches the right panel to the Editor tab (`panel-tab-editor` becomes `aria-selected=true`, the editor shows that file); clicking it does NOT toggle the file's collapse state (event propagation stopped).
  - CLI (item 2 + helpers): `pnpm vitest run` passes incl. new `collapseAll`/`expandAll` tests in `diffModel` test file; exits 0.
  - CLI (verify-auto gate): `pnpm tsc --noEmit`, `pnpm lint` (eslint), `pnpm format --check` (prettier) all exit 0; `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` all exit 0 (the doc-fix touches `git_diff/mod.rs` so the Rust gate must stay green).
  - CLI (item 4, no-regression): `cargo test` backend 67/67 still green; `pnpm vitest run` frontend count ≥ prior 145 (new tests added, none removed).
  - [x] P1.1 **Item 4 (highest priority) — changed-line highlight legibility.** `App.css`: `.diff-line.is-add`/`.is-remove` bg `.16`→`.24` + saturated 3px `border-left` (`#3fb950`/`#f85149`); transparent `border-left` on base `.diff-line` so context rows don't shift. No `::selection` rule exists. CSS-only.  <!-- status: done -->
  - [x] P1.2 **Item 2 — collapse-all / expand-all.** `diffModel.ts`: pure `collapseAll(keys)`/`expandAll()` + `allCollapsed(collapsed, keys)` (label/action driver; empty view ≠ all-collapsed). `DiffPanel.tsx`: `visibleKeys` computed for both views (working-dir `fileKey` / commit `commit:${path}`); `toggleAllCollapsed` button (`data-testid="diff-collapse-all"`) in the statusbar actions, gated on `visibleKeys.length > 0`. +6 vitest cases (19 total, green).  <!-- status: done -->
  - [x] P1.3 **Item 1 — sticky Commits header + commit banner.** `App.css`: `position:sticky;top:0;z-index:2` on `.diff-commits-header` + `.diff-commit-banner`; file headers kept sticky at `z-index:1` so they tuck under. `.diff-statusbar` is a flex sibling OUTSIDE `.diff-scroll` — already non-scrolling (confirm live at verify-human). CSS-only.  <!-- status: done -->
  - [x] P1.4 **Item 3 — "Open in editor" per file row.** `onOpenInEditor?` added to `DiffPanelProps` + threaded into `FileDiffSection`/`CommitFiles`. **Restructured `.diff-file-header` from a `<button>` to a flex `<div>`** (was nesting a button-in-button) → toggle is now `.diff-file-toggle` (carries `data-testid="diff-file-header"` moved to the wrapper, toggle gets `diff-file-toggle`) + a sibling `.diff-open-in-editor` button (`data-testid="diff-open-in-editor"`, `stopPropagation()` → never toggles collapse). `Workspace.tsx` wires `setOpenPath(p)` + `setRightPanel("editor")`. Working-tree `read_file` only; blob-at-rev deferred → SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV (logged + code note).  <!-- status: done -->
  - [x] P1.5 **Opportunistic doc-drift fix.** `git_diff/mod.rs`: stale `[file_base_core]`→`[file_hunks_core]` (line 49); `file_hunks_core` doc corrected to `diff_index_to_workdir` (unstaged) / `diff_tree_to_index` (staged) — code verified at lines 349/352. Doc-only. Resolves 2 of 4 m2-wp4 MINORs.  <!-- status: done -->
  <!-- NOTE (testid move for verify): the per-file header WRAPPER now carries data-testid="diff-file-header"; the clickable toggle is data-testid="diff-file-toggle". The open-in-editor button is data-testid="diff-open-in-editor". Existing DiffPanel tests target the panel-level testids, not the header internals; confirm no test referenced diff-file-header as a button at verify-auto. -->

  - [x] verify-auto  <!-- status: done; tsc✓ eslint✓(0) prettier✓ vitest 151/151(+6) cargo test 67/67 clippy✓ fmt✓. One eslint warning surfaced (visibleKeys useCallback dep) → fixed in-build via useMemo, re-ran clean. -->  
  - [x] verify-self  <!-- status: done — CLI outcomes PASS; Browser outcomes UNVERIFIED-via-stub (Tauri-dialog wedge), surfaced to verify-human -->
    <!-- Integration boundary: YES (edits to existing DiffPanel/FileDiffSection/Workspace UI surfaces). The Browser outcomes DO cite the consuming surface (DiffPanel). NO subagent spawn: the stubbed/Playwright mount WEDGES on plugin:dialog|open for workspace-level UI (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE, 3× incl. MCP kill). Treated under the skill's "Playwright unavailable" clause — browser surface unavailable in-harness.
         CLI outcomes (mechanical floor) PASS, confirmed at verify-auto + re-confirmed here:
           - vitest diffModel 19/19 incl. new collapseAll/expandAll/allCollapsed; full suite 151/151
           - tsc clean, eslint 0, prettier clean, cargo test 67/67, clippy/fmt clean
         Browser outcomes (UNVERIFIED-via-stub → operator verify-human in real `pnpm tauri dev`):
           - item 1 sticky Commits header + commit banner while scrolling
           - item 2 collapse-all/expand-all (working-dir AND commit views)
           - item 3 "Edit" opens file in editor tab + does NOT toggle collapse
           - item 4 add/remove accent bar + stronger wash legibility -->

  - [x] verify-human  <!-- status: done — operator approved all leaves (2,3,5 first pass; 6,7 after the word-wrap + whole-commits-sticky back-loop fix) 2026-06-20 -->
    - [ ] P1.verify-human.1: Item 4 — changed lines legible (accent bar + stronger wash)  <!-- status: FAILED — accent bar + wash DO work, but each line shows a per-line horizontal SCROLLBAR (the grey full-width bars in the screenshot) because .diff-line-content is white-space:pre + overflow-x:auto. Operator: diff view should WORD-WRAP (white-space:pre-wrap, no per-line scrollbar). Editor stays wrap:false (unchanged). -->
    - [x] P1.verify-human.2: Item 2 — collapse-all/expand-all in BOTH working-dir and a selected commit  <!-- status: done — operator approved -->
    - [ ] P1.verify-human.3: Item 1 — Commits header + commit banner stay pinned while scrolling  <!-- status: FAILED — only the "COMMITS" header ROW is sticky. Operator wants the WHOLE Commits section (the commit list) to stay sticky above the files area, not just its header. -->
    - [x] P1.verify-human.4: Item 3 — "Edit" opens file in editor tab + does NOT toggle collapse  <!-- status: done — operator approved -->
    - [x] P1.verify-human.5: No regression in existing diff viewing  <!-- status: done — implied by operator exercising the panel in the screenshot (commits list + hunks render) -->
    - [x] P1.verify-human.6: Item 4b — diff lines word-wrap, no per-line horizontal scrollbar; editor still wrap:false  <!-- status: done — operator re-confirmed: wrapping works, scrollbars gone, accent bar/wash intact, editor unchanged -->
    - [x] P1.verify-human.7: Item 1b — whole Commits section pinned, not just the header row  <!-- status: done — operator re-confirmed: whole commits section stays pinned -->
  - [x] verify-codify  <!-- status: done — codify-worthy logic (collapseAll/expandAll/allCollapsed) already covered by 6 build-added vitest cases (real behavioral assertions incl. empty-view & stale-key edges); CSS (accent bar/word-wrap/sticky) + item-3 prop-wiring are non-logic, verified live by operator (no CSS/component-test harness in repo — matches WP4's own posture). Integration boundary (existing UI surfaces) verified end-to-end by operator in the real app; no render-test harness introduced for a polish WP. Full suites green: frontend 151/151, backend 67/67. No F14 issues. -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** none — shipped (5051bd4), review-quality clean (3 MINOR auto-backlogged); ready for /feature-finalize
- **Blocked:** none
- **Unvisited:** finalize
- **Operator verdict (2026-06-20):** items 2 & 3 APPROVED. Item 4's accent-bar+wash WORKS, but the "grey highlighting" is actually a per-line horizontal scrollbar → fix = word-wrap diff lines. Item 1 sticky is too narrow → pin the whole Commits section. Editor must remain wrap:false (diff-only change).
- **Open discoveries:** SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV (low)
- **Open discoveries:** SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV (low; commit-row open-in-editor opens working-tree content, not blob-at-rev — deferred to WP5)

## Verification notes (read by verify-self / verify-human)
- **NO stubbed-browser mount.** The Playwright/stubbed-browser path WEDGES on the Tauri dialog plugin for workspace-level UI (`SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE`, reproduced 3×). verify-self's mechanical checks run via `cargo test`/`pnpm vitest`/tsc/lint; the live-observation outcomes are confirmed at **verify-human in the real `pnpm tauri dev` app opened on THIS repo** (gives real changes + commits to exercise the diff panel). Kill any lingering `:1420` process before relaunching; warm rebuild ~15s.

## Code-Quality Review — m2-wp4-diff-viewer-polish

### Strengths
- Pure-fn extraction (`collapseAll`/`expandAll`/`allCollapsed` in `diffModel.ts`) keeps the bulk-collapse logic testable and out of the component, matching the repo's pure-fn vitest posture exactly.
- New vitest cases assert the genuinely tricky edges (empty-view ≠ all-collapsed, stale-key carryover) rather than just the happy path.
- The button-in-button HTML-validity fix (`.diff-file-header` `<button>` → flex `<div>` wrapper) is the correct structural resolution, with `stopPropagation()` on the nested action and a clear inline comment.
- Every non-obvious CSS choice carries a WHY comment grounded in a real observation (transparent base `border-left` to prevent context-row shift; word-wrap to kill the per-line scrollbar).
- The deferred-scope boundary (commit-row open-in-editor opens working-tree content, not blob-at-rev) is documented at the prop docstring, the panel docstring, and a logged SURFACE.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [DiffPanel.tsx:~340-355] `toggleAllCollapsed` recomputes `allCollapsed(prev, visibleKeys)` in the setter while `everyCollapsed` holds an independent eval of the same predicate — both correct (setter reads fresh `prev`), but two call sites could drift.
- [DiffPanel.tsx:~347] `visibleKeys` useMemo deps on the whole `list` reducer object rather than `list.kind`/`list.files` — correct (new object per dispatch) but re-derives on list-state transitions that don't change the key set.
- [App.css:~629-639] Whole-commits-sticky relies on z-index ordering (2 vs 2 vs 1) across `.diff-commits` / `.diff-commit-banner` / `.diff-file-header` all at `top:0`; no mechanical guard (no CSS/visual-regression harness per repo posture) — a future top/z-index edit could silently restack. Comments document the coupling.

### Assessment
Well-built, appropriately-scoped polish. Pure-model-helpers (tested) vs presentational CSS/prop-wiring (operator-verified live) matches the repo's verification posture. The button-in-button restructure is the right fix, documented at every layer. No meaningful debt; findings are micro-readability + the inherent fragility of sticky-layout invariants no test harness in this repo can pin. **No refactor warranted.**

### If you disagree
Dismiss any finding by marking the line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** Item 4 ("faint highlight") had a second, misdiagnosed cause: the grey full-width bars the operator saw weren't weak highlighting at all — they were per-line horizontal scrollbars from `white-space:pre` + `overflow-x:auto`. The accent-bar + wash fix was correct but invisible behind the scrollbars. The real fix was word-wrapping diff lines. Lesson: a CSS "it looks wrong" report needs a live look before assuming the diagnosis in the ticket — the operator's screenshot reframed the whole item.
- **Assumptions that held:** The collapse-set model already supported bulk ops (only needed pure helpers); the open-in-editor plumbing (openPath + rightPanel in Workspace) was exactly the seam expected; CSS-only changes needed no new test type (repo posture: pure-fn vitest + live verify-human).
- **Assumptions that were wrong:** (1) The item-4 highlight diagnosis (see above). (2) Item 1's sticky scope — I first pinned only `.diff-commits-header`; the operator wanted the WHOLE `.diff-commits` section pinned. Both surfaced at verify-human, both cheap CSS fixes. (3) Item 3 forced an unplanned structural change: `.diff-file-header` had to go from `<button>` to a flex `<div>` because a button can't legally nest the open-in-editor button.
- **Approach delta:** Plan was one phase, five tasks; executed as planned, with one verify-human back-loop (items 4b word-wrap + 1b whole-commits-sticky) that the spec hadn't anticipated. The back-loop was the load-bearing value of verify-human here — verify-self couldn't reach the UI (Tauri dialog stub-wedge), so the operator's live look was the only place those two issues could surface. Validates the "diff/editor WPs verify in the real app" pattern.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-20] Phase 1 verify-self — Browser outcomes intentionally NOT subagent-verified: the stubbed/Playwright mount wedges on plugin:dialog|open for workspace-level UI (existing SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE). Routed straight to verify-human in the real Tauri app per that item's documented disposition. Not a new backlog entry (the SURFACE already exists).
- [SURFACED-2026-06-20] product:wbs — SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV (low): commit-row "Open in editor" opens working-tree content, not blob-at-rev; deferred to WP5 RightPanelHost. Logged to backlog.md.
