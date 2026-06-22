# Feature: WP11 — Tree/editor density polish + Sublime-style git-change indicators

**Workflow:** feature
**State:** COMPLETED
**Created:** 2026-06-21
**Completed:** 2026-06-21
**Shipped:** commit 6bcbe1f (local main, not pushed)
**Entry:** spec (complex feature)
**drive_mode:** autopilot

## Plan-time decisions (the 4 spec open questions, resolved)

1. **Module placement (B):** **new `src-tauri/src/git_status/` module** (`mod.rs` pure core + `commands.rs` thin wrapper), mirroring `git_diff`'s layout. The shared `git2` primitives (`open_repo`, `StatusOptions` config, the `Status`→kind mapping) are **lifted/reused, not duplicated** — `git_status` re-exports or calls `git_diff`'s `staged_status`/`unstaged_status` (made `pub(crate)`). Rationale: keeps `git_diff`'s doc-scope ("view-only diff data") clean while a *path-keyed status map* is a distinct concern; one new tiny module beats bloating a 32 KB file.
2. **Non-git dir (B):** **all-clean / silent.** The `git_status` command returns an **empty map** (not an error) when `root` is not a git repo — a workspace need not be a repo, and the tree must still render. (Distinct from `git_changed_files`, which surfaces "not a git repository" — there the diff panel *is* git-only; here the tree is not.) Implemented by catching the `NotARepo` discover error in the core and returning `Ok(empty)`.
3. **Dir roll-up (B):** **file-rows only for v1.** No aggregate directory indicators. (The status map is path-keyed at file granularity; a roll-up would need a separate ancestor-walk — out of scope, noted as a possible future SURFACE if the operator wants it at verify-human.)
4. **Indicator visual form (B):** **a colored leading status glyph** in `TreeRow` — a single-char mark before the filename (Sublime-sidebar convention): **M** = modified (amber `#e2c08d`), **A**/untracked = added/new (green `#73c991`), **D** = deleted (red `#f48771`), **R** = renamed (amber), clean = no glyph. Dark-only palette (VS Code/Sublime-derived). Proposed to the operator at **P3 verify-human** against the Sublime reference image; the glyph-vs-colored-filename-vs-dot choice is the operator's call there (the form is trivially swappable — it's one span + CSS).

## Problem Statement

Two operator requests captured during M2 verify-human sessions, promoted to WP11:

- **Part A (density/scoping polish — S-sized):** The file-tree rail currently renders on *every* right panel (Editor, Diff, Terminal), but it's only an editor-navigation affordance — it steals width from the Diff viewer and second Terminal where it's irrelevant. The rail is also narrow (200px) with low-density rows, and the editor minimap is wider than the operator wants.
- **Part C (drag-to-resize rail — S-sized, added at WP11 verify-human 2026-06-21):** Part A sets a fixed rail width (299px). The operator wants the rail width to be **user-adjustable** via a drag handle, with the chosen width persisted across sessions (the 299px becomes the default, not a hard value).
- **Part B (git-change indicators — M-sized, the substantive piece):** The file tree shows no git status. Sublime Text's sidebar marks each file with a colored status indicator (modified / added / untracked / etc.) so you can see what's changed at a glance. Claudesk's tree should do the same. The backend has no per-path git-status source today (WP4's `git_diff` produces a *changed-file list* + diff hunks, but not a path-keyed status map the tree can index).

This is **net-new capability + UI polish**, not a bug fix.

## User Stories

- As the operator, I want the file-tree rail to appear **only when the Editor panel is front**, so the Diff viewer and second Terminal get the full panel width.
- As the operator, I want a **wider, denser file tree**, so more files are visible without scrolling.
- As the operator, I want a **narrower editor minimap**, so it reclaims editor width.
- As the operator, I want each file row in the tree to carry a **Sublime-style colored git-status indicator** (modified / added / untracked / clean), so I can see at a glance what's changed in the working tree without opening the diff viewer or Sublime Merge.

## Acceptance Criteria

The feature is done when:

### Part A
- The `.file-tree-rail` is **visible only when `panel === "editor"`** and hidden (CSS, not unmount) for Diff and Terminal. The Diff/Terminal panel main area expands to full panel width when the rail is hidden.
- The rail's expanded-dir state and the loaded `fs_tree` walk **survive an Editor→Diff→Editor round-trip** (the rail stays MOUNTED — scoped by CSS/visibility, per the "all panels stay mounted" rule).
- The `.file-tree-rail` width is **~332px** (200 × 1.66) when expanded.
- Tree rows are **~2/3 their current height** (padding/line-height) with a **proportionally smaller font** — denser, more files visible.
- The editor minimap is **~75% of its current width**.
- A vitest assertion confirms the rail is present for the editor panel and absent (hidden) for diff/terminal.

### Part B
- A backend **`git_status` pure-fn core** returns a per-path working-tree status map for the workspace dir (status kinds: **modified / added / deleted / untracked / clean/none**), reusing `git2` (the existing WP4 dep + `git_diff` module's `Status`/`StatusOptions` walk pattern). It is **TempDir-git-fixture testable** (no Tauri runtime).
- A thin **Tauri command** wraps the core, mapping its typed error to a `String` (the WP6 error-surfacing lesson — never swallowed).
- Each file row in `FileTree`/`TreeRow` shows a **colored git-status indicator** reflecting that file's status; **dark-only palette** matching Sublime's convention (e.g. modified = amber/orange, added/untracked = green, deleted = red). Clean files show no indicator (or a neutral one).
- **Refresh policy:** the status map refreshes **on tree load and on file save** (no live `notify` watcher — that's the Phase-2 watcher milestone). A save in the editor updates the corresponding row's indicator.
- A failed `git_status` IPC surfaces inline (reuses the FileTree's existing error row); it does **not** blank the tree — a non-git dir simply yields all-clean/no-indicators rather than an error (decided at plan: see Open Questions).
- Unit tests cover the `git_status` pure core (TempDir fixture with known modified / untracked / clean files) + any pure status→indicator mapping helper.

### Part C (added 2026-06-21)
- The file-tree rail has a **drag handle** on its right edge; dragging resizes the rail live (clamped to a sane min/max).
- The chosen width **persists across app restarts** (localStorage — UI chrome, app-global, no backend command needed). 299px (Part A) is the default when no stored width exists.
- The resizer composes with Part A: the rail is still editor-only and still collapses; the handle is irrelevant/hidden when hidden or collapsed.
- A pure `clampRailWidth` (and drag-math) helper is unit-tested.

## Out of Scope

- **Live file-watcher** for git status (deferred to the Phase-2 `notify` watcher milestone). Refresh is load + save only.
- **Rolled-up directory indicators** (a dir showing the aggregate status of its children) — *optional*, decided at plan; default is **file-rows only** unless cheap.
- **Staged-vs-unstaged distinction** in the indicator. Sublime's sidebar shows working-tree status; v1 shows a single working-tree status per file (the union of staged+unstaged change-kind). Staging UI lives in Sublime Merge (kept permanently).
- **Interactive git actions** from the tree (stage, discard, etc.) — view-only, consistent with M2's view-only git posture.
- Any change to the `git_diff` module's existing commands/behavior (WP11 *adds* a sibling status source; it does not modify the diff viewer).

## Technical Constraints

- **No 3rd-party service** — `git2` (libgit2) is already a vendored Rust dep (WP4). No probe needed.
- **Reuse the established backend shape:** `command → pure-fn core → typed error (thiserror) → String` (mirrors `git_diff` and `editor_fs`). The `git_diff::mod` already imports `git2::{Status, StatusOptions}` and has `changed_files_core` doing exactly this status walk — the WP11 core is a path-keyed *map* variant of that. **Decide at plan whether to add to `git_diff/` or a new `git_status/` module** (leaning: a new small `git_status` module to keep the diff module's view-only-diff focus clean, OR a `status_map_core` fn inside `git_diff` to share `open_repo`/`StatusOptions`). Don't duplicate the status→kind mapping logic if it can be shared.
- **Rust hygiene:** no `unwrap()` outside tests; `cargo fmt` + `cargo clippy -D warnings`.
- **Frontend:** React 19 function components, TS strict, ESLint/Prettier. Dark-only — no light tokens, no `prefers-color-scheme`.
- **The rail lives in `RightPanelHost.tsx`** (the `.file-tree-rail` div, lines ~266–289). Part A's "editor-only" scoping keys off the existing `panel` state already in that component — the rail must stay mounted (gate visibility by class/CSS keyed on `panel === "editor"`, NOT a conditional unmount).
- **The git-status indicator data flows FileTree ← RightPanelHost** (RightPanelHost owns `projectPath` + the save seam, so the status fetch + refresh-on-save trigger live there or in FileTree's own effect; decide at plan). FileTree already takes `projectPath`; it can fetch its own status map in an effect (parallel to its `fs_tree` effect) and re-fetch on a save signal.
- **Minimap width** is controlled via the `@replit/codemirror-minimap` `create()` container `<div>` (in `editorExtensions.ts` `minimap()`), which has no width class today — add a class + CSS rule, or set the width on the returned `dom`.
- **`@replit/codemirror-minimap`, FileTree, `git_diff`** are all existing, shipped subsystems — WP11 extends them, introducing no new deps.

## Open Questions

- [ ] **Module placement (B):** new `src-tauri/src/git_status/` module vs. a `status_map_core` fn added to `git_diff/mod.rs`. Resolve at plan (decision: share `git2` plumbing without bloating the diff module's doc-scope). — *plan decision, not research*
- [ ] **Non-git-dir behavior (B):** all-clean (no indicators, silent) vs. an inline notice. Leaning **all-clean/silent** (a workspace need not be a git repo; the tree must still work). — *plan decision*
- [ ] **Dir roll-up (B):** include aggregate dir indicators, or file-rows only. Leaning **file-rows only** for v1 unless the status map makes roll-up trivial. — *plan decision*
- [ ] **Indicator visual form:** colored left-accent bar vs. a trailing/leading dot vs. colored filename text (Sublime uses colored text + a sidebar mark). Resolve at plan/build against the dark palette; verify at verify-human with the operator (this is the operator's reference-image request). — *plan/build + verify-human*

_None of these require a research spike — they're plan-time/build-time decisions over an already-probed dependency (`git2`, shipped in WP4). No F3→research warranted._

## Work Tree

- [x] Phase 1: Density + Editor-only scoping (Part A — CSS/visibility)  <!-- status: done — operator-approved 2026-06-21, full suite 321 pass -->
  **Observable outcomes:**
  - Browser (Playwright, `?ws=<repo>` dev seam): with the **Editor** panel front, `[data-testid="file-tree"]` (the rail body) is visible (offsetParent ≠ null / not `display:none`). Switching to the **Diff** panel (`[data-testid="panel-tab-diff"]`) hides the rail (the `.file-tree-rail` is `display:none` / not visible); the `.right-panel-main` occupies full width. Switching to **Terminal** likewise hides it. Switching back to **Editor** re-shows the rail AND its previously-expanded dirs are still expanded (state survived — not remounted).
  - Browser: the expanded `.file-tree-rail` computed `width` is ~332px (200 × 1.66) when the editor is front; `.file-tree-row` computed height/font are smaller than the pre-change baseline (denser).
  - CLI: `pnpm test` (vitest) passes, including a new RightPanelHost-level assertion that the rail is rendered+visible for `panel === "editor"` and hidden (CSS/class) for `diff`/`terminal`, AND a same-instance round-trip leaves the tree mounted.
  - Console: no JS errors on panel switch.
  - [x] P1.1 Scope the `.file-tree-rail` to the editor panel — `RightPanelHost.tsx` now appends `is-hidden` when `!railVisibleForPanel(panel)` (pure predicate in `panelHost.ts`); the rail stays MOUNTED (CSS `display:none`), so FileTree keeps its `expanded` reducer + fs_tree walk. `data-testid="file-tree-rail"` + `data-hidden` added for verify-self. `.right-panel-main` is `flex:1`, so it reflows to full width when the rail box is removed.  <!-- status: done -->
  - [x] P1.2 `.file-tree-rail` width 200px → 332px (`src/App.css`); `.is-collapsed { width:auto }` still follows + wins by source order. Added `.file-tree-rail.is-hidden { display:none }`.  <!-- status: done -->
  - [x] P1.3 `.file-tree-row` density — padding `2px 6px` → `1px 6px`, `font-size` `0.78rem` → `0.66rem`, added `line-height: 1.35`.  <!-- status: done -->
  - [x] P1.4 Minimap width 75% — `editorExtensions.ts` `minimap()` tags the `create()` container with `cm-minimap-narrow` (the package adds `.cm-minimap-gutter`+`.cm-gutters` to that same div); App.css clips `.cm-minimap-narrow.cm-minimap-gutter` to `90px !important` (0.75×120 MaxWidth) + `overflow:hidden`, and the canvas `max-width:90px`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint 0, prettier clean, vitest 17/17 -->
  - [x] verify-self  <!-- status: done — rail visibility/reflow PASS, mount-survival round-trip PASS, rail width 332px PASS, no JS errors PASS; row-density + minimap-90px UNVERIFIED (need backend/open-file → verify-human) -->
  - [x] verify-human  <!-- status: done — operator approved 2026-06-21 (all 3 leaves) -->
    - [x] P1.verify-human.1 Rail editor-only feel — rail shows for Editor, vanishes for Diff + Terminal, restores with dirs expanded  <!-- status: done -->
    - [x] P1.verify-human.2 Tree density look — rail width trimmed 332→299px (operator ×0.9 request) + denser rows; width re-verified 299px via Playwright  <!-- status: done -->
    - [x] P1.verify-human.3 Minimap width — trimmed 90→68px (operator "75% of current again"); operator approved in real app  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — rail-visibility rule covered by railVisibleForPanel tests (no gap; CSS pixel values are visual prefs, not unit-codifiable); full suite 321 pass, no regressions -->

- [x] Phase 2: `git_status` backend core + command (Part B — Rust)  <!-- status: done — full cargo 136 pass, no gap; isolated backend, verify-human auto-skipped -->
  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test git_status` passes — TempDir git-fixture tests prove: a modified tracked file → `Modified`; a new untracked file → `Untracked`; a `git add`-ed new file → `Added`; a deleted tracked file → `Deleted`; an unchanged file → absent from the map (clean = no entry); a non-git TempDir → `Ok(empty map)` (NOT an error).
  - CLI: `cargo clippy -- -D warnings` clean; `cargo fmt --check` clean; no `unwrap()` outside `#[cfg(test)]`.
  - CLI: `cargo test` full suite still green (no regression in `git_diff` after lifting `staged_status`/`unstaged_status` to `pub(crate)`).
  - [x] P2.1 `src-tauri/src/git_status/mod.rs` — `status_map_core` reuses `git_diff::open_repo` + `staged_status`/`unstaged_status` + `ChangedStatus`; NotARepo → `Ok(HashMap::new())`; per-path fold `staged_status(s).or_else(|| unstaged_status(s))` → ONE status. `GitFileStatus = ChangedStatus` (type alias — one status vocabulary shared with the diff viewer; no separate enum/error needed — reuses `GitDiffError`). 8 TempDir tests (modified/untracked/added/deleted/clean/non-git/staged-wins-fold/multi-file).  <!-- status: done -->
  - [x] P2.2 Lifted `git_diff::{open_repo, staged_status, unstaged_status}` to `pub(crate)` (`ChangedStatus` was already `pub`); NO behavior change to `git_diff` (full suite confirms — see verify-auto).  <!-- status: done -->
  - [x] P2.3 `git_status/commands.rs` — `git_file_statuses(root) -> Result<HashMap<String,GitFileStatus>, String>` (error→String; NotARepo never reaches here, it's Ok(empty)). Registered `mod git_status;` + command in `lib.rs`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — full cargo suite 136 pass (git_status 8 new + git_diff no regression from pub(crate) lift); clippy/fmt clean -->
  - [x] verify-self  <!-- status: done — NO integration boundary (isolated new artifacts: git_status module + git_file_statuses command nothing calls yet + pub(crate) visibility lift, no behavior change). All Observable Outcomes are CLI, re-confirmed: git_status 8/8 pass, clippy -D warnings clean. No live system to observe (no UI consumer until Phase 3). -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED per drive_mode=autopilot; all 4 gates clean (autopilot + verify-self all-PASS + no integration boundary + no consuming-surface outcome). Isolated new backend artifacts; git indicators become operator-visible at Phase 3. -->
  - [x] verify-codify  <!-- status: done — status_map_core comprehensively covered by 8 TempDir tests (no gap); full cargo 136 pass, no regressions -->

- [x] Phase 3: Per-row git indicators + refresh-on-save (Part B — frontend)  <!-- status: done — operator-approved (indicators right-placed, refresh + form good); full vitest 327 pass -->
  **Observable outcomes:**
  - Browser (Playwright, `?ws=<a repo with known changes>`): a modified file's row shows the modified glyph (`[data-testid="file-tree-status"]` with `data-status="modified"`); an untracked file shows `data-status="untracked"`; a clean file shows NO status element. After editing + saving a file in the editor (write_file), that file's row indicator updates without a manual reload (refresh-on-save fires a re-fetch).
  - Browser: indicators use the dark Sublime palette (computed color matches the mapped token per status); switching panels + back does not lose them.
  - CLI: `pnpm test` passes incl. a pure `statusGlyph`/`statusClass` mapping test (each `GitFileStatus` → expected glyph + class/color token; clean → none) and a FileTree-render test asserting a row with status X renders the indicator and a clean row does not.
  - Console: a `git_file_statuses` IPC failure does NOT blank the tree (clears indicators to empty, file list stands — git status is decorative); non-git dir → empty map → all rows render with no indicators (silent). (The fs_tree failure still surfaces the inline error row — losing the file list IS a real failure; only the decorative status fetch is fail-silent.)
  - [x] P3.1 FileTree fetches `git_file_statuses` in an effect parallel to `fs_tree`, keyed on `projectPath` + the new `gitStatusRefreshKey` prop; `gitStatus` state holds the path→status map. DESIGN REFINEMENT: a status-fetch failure clears to an EMPTY map (no indicators), it does NOT set the fs_tree error row — git status is decorative + a non-git dir legitimately returns empty, so an indicator-fetch failure must never blank the file list. The fs_tree error path (losing the file list = a real failure) stays surfaced as before.  <!-- status: done -->
  - [x] P3.2 `filetree/gitStatus.ts` — `GitFileStatus` type (lowercase, mirrors Rust serde) + `GitStatusMap` + `statusGlyph` (M/A/U/D/R, clean→null; untracked U distinct from added A) + `statusClass` (`file-tree-status--<status>`). 6 vitest cases.  <!-- status: done -->
  - [x] P3.3 `TreeRow` renders a leading `<span class="file-tree-status file-tree-status--<status>" data-testid="file-tree-status" data-status aria-label/title>` glyph on FILE rows only (clean→no element); dark Sublime palette tokens in App.css (modified/renamed amber #e2c08d, added/untracked green #73c991, deleted red #f48771).  <!-- status: done -->
  - [x] P3.4 `onSaved?` added to `EditorSplit` (fires after `save-ok`, in deps), threaded up: `RightPanelHost` bumps `gitStatusRefreshKey` on save → FileTree re-fetches. Tree (re)load already re-fetches via the projectPath dep.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — full vitest 327 pass (34 files; +6 gitStatus; no regression from FileTree/EditorSplit/RightPanelHost wiring); tsc/eslint/prettier clean -->
  - [x] verify-self  <!-- status: done — fail-silent PASS (no backend → 0 file-tree-status elements, tree not blanked, no JS/React errors across panel round-trip); FileTree renders w/ expected fs_tree error row. Real glyph rendering + colors + refresh-on-save are UNVERIFIED (need real Tauri backend → carried to verify-human). No blocking/cosmetic fails. -->
  - [x] verify-human  <!-- status: done — operator-approved 2026-06-21; vh.1 indicator moved to RIGHT of filename (operator request) + re-verified; vh.2 refresh-on-save good; vh.3 glyph form good -->
    - [x] P3.verify-human.1 Git indicators render — operator requested the indicator be moved to the RIGHT of the filename (was leading/left). Applied: TreeRow renders name THEN status span; `.file-tree-name { flex:1 }` + `.file-tree-status { margin-left:auto }` right-pin it. Re-verified via live-CSS DOM probe: status sits right of name (name 6–278px, glyph 283–293px in a 299px rail), amber #e2c08d. Colors/render confirmed by operator in real app.  <!-- status: done -->
    - [x] P3.verify-human.2 Refresh-on-save — operator confirmed "good" (real app).  <!-- status: done -->
    - [x] P3.verify-human.3 Indicator visual form — operator confirmed "good" (the M/A/U/D/R glyph, now right-placed).  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — pure statusGlyph/statusClass covered by gitStatus.test.ts (6 cases, no gap); render placement + refresh verified at verify-self/human (not unit-codifiable, repo posture). Full vitest 327 pass. -->

- [x] Phase 4: Drag-to-resize file-tree rail (Part C — added at WP11 verify-human, operator request)  <!-- status: done — operator-approved (drag + persist); full vitest 337 pass -->
  **Observable outcomes:**
  - Browser (Playwright, `?ws=<repo>`, Editor panel front): a resize handle `[data-testid="file-tree-resize"]` sits on the rail's right edge. Dragging it (mousedown on the handle → mousemove +120px → mouseup) increases the `.file-tree-rail` computed `width` by ~120px; dragging left decreases it. The width is clamped to [min ~160px, max ~600px] (drag past the bounds pins at the bound).
  - Browser: after a resize, reloading the page (`browser_navigate` to the same `?ws=` URL) restores the dragged width (persisted) — NOT the 299px default.
  - Browser: the rail's editor-only visibility (Phase 1) and collapse toggle still work after the resizer lands (drag handle hidden/irrelevant when collapsed).
  - CLI: `pnpm test` passes incl. a pure `clampRailWidth(px)` test (below-min → min, above-max → max, in-range → unchanged) + a `nextRailWidth(start, deltaX)` test if the drag math is extracted.
  - Console: no JS errors during a drag.
  - [x] P4.1 `filetree/railWidth.ts` — RAIL_MIN 160 / RAIL_MAX 600 / RAIL_DEFAULT 299 / RAIL_WIDTH_KEY `claudesk.fileTreeRailWidth`; `clampRailWidth` (non-finite→default, rounds), `loadRailWidth` (absent/corrupt/no-localStorage→default, clamped), `saveRailWidth` (clamps, swallows storage errors). 10 vitest cases (localStorage stubbed via vi.stubGlobal).  <!-- status: done -->
  - [x] P4.2 Resize handle + drag in `RightPanelHost` — `railWidth` state seeded from `loadRailWidth()`; rail gets inline `style={{ width }}` (skipped when collapsed). `file-tree-resize` handle's `onMouseDown` (`onRailResizeStart`) records start x+width in a ref, attaches document mousemove (clamped live setRailWidth) + mouseup (persist via saveRailWidth, removes listeners). Width state in RightPanelHost (persists across switches). React `MouseEvent` aliased to avoid shadowing the DOM `MouseEvent` used by the document listeners.  <!-- status: done -->
  - [x] P4.3 CSS — `.file-tree-rail { position:relative }`; `.file-tree-resize` absolute, right:-2px, 5px wide, full-height, `cursor:col-resize`, blue hover; hidden when rail `is-collapsed`/`is-hidden`. The 299px rule is now the documented fallback default (inline style wins).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — full vitest 337 pass (35 files; +10 railWidth; no regression from RightPanelHost drag wiring); tsc/eslint/prettier clean -->
  - [x] verify-self  <!-- status: done — handle present + right-edge (−4px, col-resize) PASS; rail 299px default PASS; editor-only visibility still works PASS; no JS/React errors PASS. Live drag/persist/clamp UNVERIFIED (React drag not synthetic-event-exercisable → carried to verify-human). No blocking/cosmetic fails. -->
  - [x] verify-human  <!-- status: done — operator approved 2026-06-21 ("all good") -->
    - [x] P4.verify-human.1 Drag-resize — operator confirmed the live drag (widen/narrow, clamped) works.  <!-- status: done -->
    - [x] P4.verify-human.2 Persist across restart — operator confirmed the width persists.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — clampRailWidth/load/save covered by railWidth.test.ts (10 cases, no gap); drag wiring verified at verify-self+human. Full vitest 337 pass. -->

- [x] Phase 5: Rail-nesting restructure — tabs outer, file-tree inside editor slot (operator request at review-quality 2026-06-21)  <!-- status: done — operator-approved across all 7 verify-human leaves; vitest 333 + cargo 136 -->
  **Why:** Phase 1 made the rail editor-only via a CSS `is-hidden` toggle, but the rail still sits as a PEER of `right-panel-main` (left of the Editor/Diff/Terminal tab row), so the tab row is pushed right by the rail's width. Operator wants the tab row to be the OUTER layer (full width on top) and the file-tree rail to live INSIDE the editor panel slot — the rail belongs to the editor, not to the whole panel column. Supersedes Phase 1's CSS-hide approach (the rail now only EXISTS in the editor slot; no `is-hidden` needed).
  **Observable outcomes:**
  - Browser (Playwright, `?ws=<repo>`): the Editor/Diff/Terminal tab row (`[role="tablist"]`) spans the FULL width of the right half (its left edge ≈ the right-half's left edge — NOT pushed right by the rail). The file-tree rail (`[data-testid="file-tree-rail"]`) sits INSIDE the editor slot, left of the EditorSplit. Switching to Diff/Terminal: the rail is absent from those slots (full width); the tab row is unchanged/full-width throughout.
  - Browser: the rail still survives an Editor→Diff→Editor round-trip mounted (expanded dirs persist) — it lives in the always-mounted editor slot. Collapse toggle + drag-resize still work.
  - CLI: `pnpm test` passes (railVisibleForPanel test updated/removed as the mechanism changed — the rail is now structurally editor-only, not class-toggled).
  - Console: no JS errors on panel switch.
  - [x] P5.1 Moved the `file-tree-rail` block into the editor `right-panel-slot` (extracted as a `fileTreeRail` JSX const, rendered before `EditorSplit` in the editor slot). Removed the `right-panel-body` horizontal wrapper; `right-panel-main` is now the direct full-width child of `.workspace-right`. Dropped `is-hidden`/`railVisibleForPanel` (structural editor-only now); kept collapse + drag-resize.  <!-- status: done -->
  - [x] P5.2 CSS — `.right-panel-slot--editor { flex-direction: row }` (rail + editor); retired `.right-panel-body` + `.file-tree-rail.is-hidden` (+ the `.is-hidden .file-tree-resize` rule); `.right-panel-main` stays vertical-flex full-width. Rail width/collapse/resize rules unchanged.  <!-- status: done -->
  - [x] P5.3 Removed `railVisibleForPanel` (predicate in panelHost.ts + its 4-case test block + the RightPanelHost import) — the mechanism is now structural, not a computed flag. vitest 337→333 (the 4 predicate cases removed).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint 0, prettier clean, full vitest 333 pass -->
  - [x] verify-self  <!-- status: done — live structural probe: railInEditorSlot=true; tab row full-width (tabLeft 601 ≈ rightLeft 600, widthFraction 1.0, NOT pushed right by rail); Diff/Terminal slots have NO rail (full width); back-to-Editor rail visible + still mounted; 0 console errors. -->
  - [x] verify-human  <!-- status: done — operator approved 2026-06-21 across all 7 leaves (layout nesting, split-button visible, palette portal + font, split-icon/overflow/2-pane, close-vs-split side-by-side) -->
    - [x] P5.verify-human.1 Layout nesting — operator confirmed "layout is now good" (tabs full-width outer, tree inside editor).  <!-- status: done -->
    - [x] P5.verify-human.2 Split button visible — `.editor-split { min-width:0 }` fix. Operator approved.  <!-- status: done -->
    - [ ] P5.verify-human.3 ⌘⇧P palette — (a) CENTERING: the first fix (`.editor-panel position:static`) was insufficient — intervening `.editor-pane`/`.editor-split-pane` boxes are `position:relative`, so the backdrop still anchored to a narrow pane. FINAL FIX (operator "make it like the global search thing"): the palette overlay is now PORTALED (`createPortal`) up to the enclosing `.workspace-right` — exactly how the ⌘⇧F ProjectSearch overlay mounts — so its `inset:0` fills the full right panel. `.editor-panel position:relative` restored (no longer load-bearing for the palette). (b) FONT: smaller overlay text across the board — palette input/item/empty 13→12px, search toggles/go 12→11px. Re-verify: ⌘⇧P centers over the whole right panel + text is smaller.  <!-- status: done — operator approved (portal-to-workspace-right + smaller overlay font) -->
    - [x] P5.verify-human.4 Split button location — moved off its dedicated full-width row (`.editor-split-bar` removed) into the tab strip. Operator confirmed.  <!-- status: done -->
    - [x] P5.verify-human.5 Tab strip height — shorter. Operator confirmed.  <!-- status: done -->
    - [ ] P5.verify-human.6 Split button — 3 follow-up fixes (operator, screenshot): (a) SVG ICON instead of "Split" text → new `SplitIcon` (VS-Code split-layout glyph, currentColor); (b) STAYED-PUT ON OVERFLOW → the strip is now `[.editor-tab-strip-tabs (overflow-x:auto)] [fixed .editor-split-btn]`; the icon is a sibling OUTSIDE the scroll container (was scrolling away with the tabs). Verified with 12 overflowing tabs: icon visible + right of tabs. (c) GONE WITH 2 PANES → root cause: split sets the NEW empty pane active, and the empty branch rendered no strip + `onSplit` was active-pane-only → no pane showed it. FIX: strip (incl. Split icon) ALWAYS renders even on an empty pane, and `onSplit` is passed to EVERY pane. Verified: after split, all panes (incl. empty/active, tabCount 0) show the Split icon.  <!-- status: done — operator approved (svg icon, overflow-safe, present in every pane) -->
    - [ ] P5.verify-human.7 Close-pane ✕ vs Split overlap — the per-pane close ✕ (an absolute top-right-corner button) nearly overlapped the Split icon. FIX: moved the close ✕ INTO the tab strip beside the Split icon (both fixed icon buttons, outside the scrolling tabs) — `[tabs…] [Split] [✕]`. Removed the absolute `.editor-split-pane > .editor-pane-close` rule; `onClosePane` passed from EditorSplit (gated on >1 pane). Verified: in a 2-pane split, every pane shows Split + Close side-by-side, no overlap (split ends 1166, close starts 1170).  <!-- status: done — operator approved -->
  - [x] verify-codify  <!-- status: done — Phase 5 is structural/CSS (rail nesting, palette portal, split-button-in-strip, close-button move, font); no new pure logic to codify (verified live per repo posture); railVisibleForPanel removed. Full vitest 333 + cargo 136, no regressions. -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** Re-shipped (amended → 6bcbe1f). Review-quality done (0 CRIT, 1 MAJOR + 3 MINOR auto-backlogged, Mode 3). Ready for finalize.
- **Blocked:** none
- **Unvisited:** finalize → [file terminal blank-cursor incident] → halt at M2/WP11 boundary
- **Open discoveries:** the WP11 review MAJOR (git-status path-keying) + 3 MINORs in backlog; terminal blank-cursor incident to file post-finalize

## Retrospect
- **What changed in our understanding:** The "editor-only file tree" wasn't a CSS-hide toggle (P1's first take) — it's a STRUCTURAL nesting question. The operator's review-quality observation forced the rail INSIDE the editor slot (P5), which is the correct model and superseded `railVisibleForPanel` entirely. Also: an overlay rendered deep in a per-pane subtree can't be centered over the right panel by CSS alone (intervening `position:relative` panes) — a React **portal** to `.workspace-right` is the clean answer, and it's how the ⌘⇧F search overlay already behaved.
- **Assumptions that held:** the backend reuse plan (lift `git_diff`'s git2 plumbing to `pub(crate)`, path-keyed map variant of `changed_files_core`) was exactly right — P2 landed first-try, 8 tests green, zero `git_diff` regression. Non-git-dir → empty map (not error) was the correct call for a decorative tree. The repo's pure-logic→vitest / live-DOM→Playwright posture held all the way (railWidth/gitStatus unit-tested; all layout verified via Playwright + operator).
- **Assumptions that were wrong:** (1) the rail-resize DRAG is not exercisable via synthetic browser events (React-controlled) — needed operator real-mouse verify. (2) The git-status path-keying assumed workspace-root == repo-root; the review caught that a NESTED workspace silently shows no indicators (the MAJOR — backlogged). (3) Moving the Split button into the SCROLLING tab strip (first take) was wrong — it scrolled away on overflow + vanished with 2 panes; the fix was a fixed icon OUTSIDE the scroll container, present on every pane.
- **Approach delta:** plan was 4 phases (A density, B backend, B frontend, C resize). Actual = 5: a whole Phase 5 (layout restructure + palette portal + split/close icon redesign + font) emerged entirely from operator verify-human feedback after the original 4 shipped. The git-indicator visual form (glyph, right-of-name) + all the density/width values were operator-tuned in-place across many verify-human rounds — heavy human-in-the-loop shaping, light initial spec.

## Code-Quality Review — m2-wp11-tree-density-git-indicators

Reviewer (code-quality-reviewer subagent) on ship commit `6bcbe1f`: **0 CRITICAL, 1 MAJOR, 3 MINOR.** Mode 3 → MAJOR + MINORs auto-backlogged (F39, no refactor pass). Rated ship-quality; backend (git_status pub(crate) reuse, non-git-dir semantics, per-path fold) the standout; Phase-5 churn well-annotated with the *why*.

### Issues (auto-backlogged → `workflow/backlog-quality-findings.md`)
**MAJOR**
- [FileTree.tsx:203] **Path-keying mismatch — silent no-indicators for a workspace nested below its git repo root.** `fs_tree` keys are workspace-root-relative (`projectPath`-stripped); `git_file_statuses` keys are git-REPO-root-relative (libgit2 `repo.statuses()` + `open_repo`'s `Repository::discover`). When `projectPath` is a subdir of the repo, the key spaces diverge → every indicator silently fails (no error, blank). Verify-human couldn't catch it — the test workspace WAS the repo root. Fix: re-base the command's paths to `root`, or document+assert a root==repo-root precondition. Graceful failure (no crash) → MAJOR not CRITICAL.

**MINOR**
- [git_status/mod.rs:68] `entry.path().unwrap_or("")`+skip silently drops non-UTF-8 paths (libgit2 returns `None`); add a one-word comment ("non-UTF-8 or empty → skip").
- [App.css/FileTree.tsx:219] right-pin uses BOTH `.file-tree-name {flex:1}` and `.file-tree-status {margin-left:auto}` — self-flagged "belt-and-suspenders"; one is redundant.
- [gitStatus.ts:16] `GitFileStatus` TS union is a prose-only mirror of the Rust serde forms — a new `ChangedStatus` variant would compile clean both sides + render no glyph (latent drift channel; no exhaustiveness test).

### If you disagree
Edit a finding line here and mark it `[DISMISSED]` before finalize archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-06-21] feature-spec — arch.md exceeds size guard (352 lines); read first 100 lines + headings only per the GLOBAL entry-skill product-context rule. Relevant M2 arch facts (CM6 editor, git2-as-data-only behind command→pure-fn→String, dark-only) captured into Technical Constraints.
[SHORTCUT-2026-06-21] P1.2/P1.3 — operator verify-human tweak (in-place, not an F12 back-loop): rail 332→299px (×0.9) + minimap 90→68px (×0.75 again). Trivial CSS-value edits to leaves just written in P1.2/P1.4. Re-verified: rail=299px via fresh Playwright eval; minimap width deferred to operator (needs an open file). prettier-clean.
[SHORTCUT-2026-06-21] P3.verify-human.1 — operator verify-human tweak (in-place): indicator moved from LEFT (leading) to RIGHT of the filename. Trivial reorder of the just-written P3.3 span + 2 CSS rules (`.file-tree-name { flex:1 }`, `.file-tree-status { margin-left:auto; text-align:right }`). Re-verified via fresh Playwright live-CSS DOM probe: glyph right of name (6–278 / 283–293px in 299px rail), amber #e2c08d. tsc/prettier/gitStatus-test clean.
[SURFACED-2026-06-21] Phase 4 verify-self — the rail-resize DRAG is React-controlled (onMouseDown → document mousemove/mouseup → setRailWidth). Synthetic-event drag simulation in a stub Chromium did NOT reliably drive the React state update (dispatchEvent doesn't reach React's synthetic onMouseDown; even fiber-prop invocation + native doc events didn't commit the width change through the artificial path). The PURE math (clamp/load/save) is unit-proven (railWidth.test.ts 10/10); the live drag is best confirmed by the operator with a real mouse → carried to verify-human as the load-bearing check. (Same class as the WP9 native-verify limitation.)
[SHORTCUT-2026-06-21] P5.verify-human.2/.3 — operator verify-human fixes (in-place): (2) split-button regression → added `.editor-split { min-width:0 }` (horizontal version of the WP3a min-height:0 height-chain lesson; re-verified split bar bounded within the editor slot via live probe). (3a) ⌘⇧P palette centering: the CSS-only first attempt (`.editor-panel position:static`) was INSUFFICIENT — inner `.editor-pane`/`.editor-split-pane` are `position:relative`, so the backdrop still anchored to a narrow pane. FINAL: portal the palette overlay (`createPortal`) up to `.workspace-right` (matching the ⌘⇧F ProjectSearch mount) → fills the full right panel. Restored `.editor-panel position:relative`. (3b) smaller overlay font across the board: palette 13→12px, search toggles/go 12→11px. Verified via live closest()+portal DOM probe (target=workspace-right, backdrop fills right-half, centered, input 12px). tsc 0, eslint 0, vitest 333, prettier clean.
[SURFACED-2026-06-21] feature:build (WP11 P5 verify-human) — TERMINAL BLANK-CURSOR REGRESSION is NOT caused by WP11/Phase 5: `git diff b3bcdb0` confirms Phase 5 touched ZERO terminal code (TerminalPane/XtermPane/cc_session/the terminal slot's display+active gating are byte-identical; only whitespace re-indent). Operator reports "blank, only a blinking cursor — exact problem like a previous session" → a recurrence of the known WP9 shell-prompt-flush / xterm fit-on-activate race (the cc_ready / rAF-fit area), timing-sensitive, reproducible only against the real PTY backend. Operator decision: handle as a SEPARATE incident (NOT folded into WP11). File `/incident-report` after WP11 finalizes; diagnose against `pnpm tauri dev` per the native-PTY verify discipline (verify-native-pty-via-ps-screencapture-stderr memory). Target level: incident (cc_session / XtermPane active-gating + prompt flush).
