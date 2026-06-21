# Feature: M2 WP10 — File-tree navigator (app-layer)

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready for ship
**Created:** 2026-06-20
**Entry:** spec (complex feature)
**Drive mode:** autopilot (standing directive: halt at WBS-WP boundaries; operator confirms the spec before plan)
**WBS:** Milestone 2 → WP10 (`docs/product/wbs.md`)

## Problem Statement

WP6 gave the workspace a **Cmd+P fuzzy file finder** — great when you know roughly what file you want. But the operator flagged at WP2 verify-human (and it's a WBS-designated **must-have**) that Cmd+P alone doesn't cover **browsing an unfamiliar tree**: you can't fuzzy-find a file whose name you don't know, and the path-input stopgap is gone. WP10 adds a **persistent file-tree navigator** — a VS Code / Sublime-sidebar-style collapsible directory tree of the workspace's project dir. Clicking a file opens it into the EditorPanel (the same `openFile` seam the finder + diff use); the tree honors `.gitignore`.

WP10 is an **app-layer subsystem** (the load-bearing `research.md` correction, same as WP6/WP7): the editor edits a *document*, the project tree is ours. It **reuses WP6's `fs_index` gitignore-walk infrastructure** — that's why WP6 shipped first (the WBS dependency). WP10 either consumes `fs_index`'s output to build a tree frontend-side, or extends the backend with directory structure / a lazy `list_dir` — decided at build.

## User Stories

- As the operator, I want a **collapsible file-tree** of my project's dir in the workspace, so I can browse and open files I can't fuzzy-find by name.
- As the operator, I want **clicking a file in the tree to open it in the editor** (same as Cmd+P), so the tree and the finder share one open-into-editor path.
- As the operator, I want the tree to **honor `.gitignore`** (no `node_modules`/`target`/`.git`; dotfiles shown — consistent with WP6's finder), so it shows the files I actually work with.
- As the operator, I want the tree to be **collapsible / reclaimable** so it doesn't permanently eat the horizontal budget of the 50/50 workspace split.
- As the operator, I want the tree to **reflect the currently-open file** (highlight it), so I keep my bearings while editing.

## Acceptance Criteria

**Backend (tree data)**
1. The tree's directory structure is sourced from a `.gitignore`-honoring walk **reusing WP6's `ignore`-crate infrastructure** — same exclusions as `fs_index` (`.git/` out, dotfiles shown, gitignore honored). The exact shape is a build decision (see Open Questions): (a) build the tree frontend-side from `fs_index`'s flat path list, (b) extend `fs_index` to emit directories too, or (c) a lazy `list_dir(path)` Tauri command. Whichever is chosen mirrors the established `command → pure-fn → typed-error → String` shape and **surfaces errors, never swallows them**.
2. Pure-fn core(s) are `TempDir`-testable (no Tauri runtime), mirroring `fs_index`/`editor_fs`.

**Frontend (FileTree component)**
3. A `FileTree` React component renders a **collapsible directory tree** of the project dir: directories expand/collapse; files are leaves. Dark-only, styled consistently with the existing panel chrome.
4. **Clicking a file opens it in the editor** via the existing `openFile(path)` seam in `RightPanelHost` (same path the finder + diff "Open" use → `setOpenPath` + flip to editor, active-pane). No new open-file plumbing.
5. The tree **honors `.gitignore`** (verified: a gitignored dir/file does not appear; dotfiles like `.gitignore` do).
6. Keyboard navigation: arrow keys move/expand/collapse, Enter opens (Sublime/VS Code sidebar parity — depth of keyboard support decided at build; click-to-open is the must-have, keyboard is the stretch).
7. The tree **highlights / reflects the currently-open file** (the `openPath` in RightPanelHost).
8. **Placement + collapse** (build decision, see Open Questions): the tree lives in the right-half chrome (it browses *into* the editor). It is **collapsible to reclaim width** — given the 50/50 workspace split, it must not permanently consume horizontal space when not needed.

**Verify-self-ability (free from WP6)**
9. The tree is **verify-self-able via the WP6 seed seam** (`?ws=<path>`): a stub-browser Playwright run can seed a workspace, render the tree, expand a dir, click a file, and assert it opened — without the Tauri folder dialog. (The real `fs_index`/`list_dir` IPC may reject in plain Vite with no backend → that surfaces as an inline error, same pattern as the finder; the real-data tree is confirmed in verify-human via `pnpm tauri dev`.)

**Gates (all green before ship)**
10. `cargo test` (any new backend core + existing), clippy `-D warnings`, fmt clean.
11. `pnpm test` (new tree-building / tree-state pure tests + existing), tsc, eslint (0), prettier clean.
12. verify-self drives the seeded tree→open-file flow; verify-human confirms the real tree against this repo in `pnpm tauri dev`.

## Out of Scope

- **File operations** (create / rename / delete / move via the tree) — WP10 is browse-and-open only. Mutating the tree is future work (a later editor-polish milestone), not M2.
- **Drag-and-drop, multi-select, cut/paste** — not in scope.
- **File-watching to auto-refresh the tree on external changes** — WP10 reads the tree on open / on demand; a `notify`-backed live tree is future work (Phase 2's file-watcher milestone is a *different* concern). A manual refresh affordance is acceptable if cheap; live-watch is not in scope.
- **Project-wide content search (WP7)** — separate WP; WP10 is navigation only.
- **Replacing Cmd+P** — the finder (WP6) stays; the tree is the *complementary* browse surface (the operator wanted both).
- **Independent per-pane files** — clicking a tree node opens into the shared editor document / active pane (the WP3c shared-doc model), same as the finder. Not reopening that decision.

## Technical Constraints

- **Reuse WP6's `ignore`-crate walk** — do NOT add a second walker or re-implement gitignore handling. Whatever the tree-data approach, the exclusion rules must match `fs_index` exactly (gitignore + `.ignore` honored, `.git/` excluded, dotfiles shown via `hidden(false)`). Reference: `src-tauri/src/fs_index/mod.rs`.
- **`fs_index` is currently files-only + flat** (`walk_index_core` skips directories, returns sorted relative POSIX paths). A tree needs directory structure. Three viable approaches (Open Question): (a) **frontend tree-build from the flat `fs_index` list** — split each path on `/`, synthesize the dir nodes; zero new backend, reuses `fs_index` exactly as shipped (but a truly-empty dir wouldn't appear since `fs_index` is files-only — acceptable for a code project). (b) **extend `fs_index`** with a dirs-included variant or flag. (c) **lazy `list_dir(path)`** command — better for very large trees (load children on expand). Decide at build mindful of the operator's repo sizes (≤ moderate; eager is likely fine).
- **Open-into-editor seam exists** — `RightPanelHost.openFile(path)` (added in WP6) is `setOpenPath` + flip to editor (active-pane). The tree calls it; no new plumbing.
- **Placement within the 50/50 split** — the right half is already a column (SublimeToolbar + tabs + panel slot). The tree must fit without permanently stealing the editor's horizontal budget. Options (Open Question): a collapsible **left rail inside the right half**, a **togglable panel** (its own tab like Editor/Diff), or an **overlay**. The 50/50 split's horizontal budget is the live constraint — a left rail eats editor width; a tab/overlay doesn't but isn't always-visible.
- **Dark-mode only** (project convention).
- **No 3rd-party probe** — the only backend dep is the already-present `ignore` crate; no external service/API. CM6/Tauri already integrated.
- **All-workspaces-stay-mounted rule** — if the tree holds expansion state, it persists across center-stage switches (like the editor/diff panels), per the mounted-not-remounted convention.

## Carried-forward / related backlog

- WP6's `fs_index` is the reuse foundation (shipped `fc77ad4`). If approach (b)/(c) extends the backend, keep the errors-surfaced-not-swallowed discipline (the wp6 picker IPC MAJORs lesson).
- The dotfile-visibility decision (`hidden(false)`) is settled and must stay consistent between the finder and the tree.

## Verify pattern (this WP class)

- **verify-self IS now reachable** (WP6's seed seam) — drive the tree in a stub browser via `?ws=<path>`: render, expand, click-to-open. This is the first WP10-class feature to inherit that capability.
- **verify-human** confirms the real `.gitignore`-honoring tree against this repo in `pnpm tauri dev` (the real walk vs a real project; kill `:1420` first; warm rebuild ~15s).

## Plan decisions (resolving the spec's open questions, 2026-06-20)

- **Backend return shape → flat list of tagged entries, nested frontend-side.** The new backend walk returns `Vec<TreeEntry>` where `TreeEntry { path: String, is_dir: bool }` (a `#[derive(Serialize)]` struct → JSON `[{path, is_dir}]`). Rationale: keeps the Rust core dead-simple (one walk, no recursive struct to serialize), and the **nester becomes a pure frontend fn** (flat tagged entries → nested tree) that's vitest-testable — the repo's strong suit. Empty dirs are included (the operator's reason for choosing (b)): we emit dir entries, not just files. Mirrors `walk_index_core` exactly otherwise (sorted, relative POSIX, `ignore` walk, `.git/` excluded, dotfiles via `hidden(false)`, errors surfaced).
- **Tree-state is a pure reducer.** Expand/collapse + which file is active = a pure `treeState` module (vitest), separate from the React `FileTree` component (live DOM → Playwright). Same pure-logic/live-DOM split as `editorPanes.ts` / `panelHost.ts`.
- **Layout: the right-half becomes a horizontal flex row** — `[ FileTree rail | panel-column ]`. `.workspace-right` is currently a flex *column* (toolbar/tabs/slot stacked); WP10 wraps the tabs+slots in an inner column and puts the rail beside it, with the toolbar staying on top. The rail collapses to a thin strip (a toggle button) to reclaim width — collapse state persists (mounted-not-remounted rule).
- **Keyboard nav scope → click-to-open is the must-have; arrow-key tree nav is IN scope as a stretch** but gets its own leaf so it can be dropped if it fights the build without blocking the WP. Click + expand/collapse-toggle are non-negotiable.
- **Open-into-editor reuses `RightPanelHost.openFile`** (setOpenPath + flip-to-editor, active-pane) — no new plumbing, same seam as finder + diff.
- No 3rd-party dep (only the already-present `ignore` crate); no probe needed.

## Work Tree

- [x] Phase 1: Backend — `fs_index` dirs-included tree walk  <!-- status: COMPLETE — impl + all 5 verify nodes done; 8 walk_tree_core tests, backend suite 90/90 -->
  **Observable outcomes:**
  - CLI: `cargo test fs_index` exits 0 — new `walk_tree_core` tests pass against a TempDir fixture: returns BOTH files and directories (incl. an empty dir) as tagged `TreeEntry{path,is_dir}`; honors `.gitignore` (ignored dir/file absent); `.git/` absent; dotfiles present; sorted; relative POSIX paths. ✅ 17 fs_index tests (9 finder + 8 tree).
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` exit 0 with the new code. ✅ clean.
  - CLI: `grep -q "fs_index::commands::fs_tree" src-tauri/src/lib.rs` → the new command is registered. ✅ registered.
  - [x] P1.1 In `fs_index/mod.rs`: added `TreeEntry { path, is_dir }` (`#[derive(Debug, Serialize, PartialEq, Eq)]`) + pure `walk_tree_core` (emits files+dirs incl. empty dirs, tagged; skips root; sorted; relative POSIX). Factored shared `check_root`/`project_walker`/`rel_posix` helpers; `walk_index_core` rewritten to use them — behavior preserved (still files-only; finder's 9 tests still green)  <!-- status: COMPLETE -->
  - [x] P1.2 In `fs_index/commands.rs`: added `fs_tree(root) -> Result<Vec<TreeEntry>, String>` mapping the error to String (never empty-on-error)  <!-- status: COMPLETE -->
  - [x] P1.3 Registered `fs_index::commands::fs_tree` in `lib.rs`  <!-- status: COMPLETE -->
  - [x] P1.4 8 `walk_tree_core` tests (files+dirs+empty-dir tagged, gitignore + .git exclusion, dotfiles present, sorted, nested relative-path + root-skipped, non-existent root → BadRoot)  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — fs_index 17/17, clippy 0, fmt clean, fs_tree registered -->
  - [x] verify-self  <!-- status: COMPLETE — backend-only, NO integration boundary (fs_tree is a new unwired command; walk_index_core refactor is behavior-preserving + guarded by 9 unchanged finder tests). All CLI outcomes confirmed: fs_index 17/17 (incl. 8 walk_tree_core tests against real TempDir fs fixtures = live filesystem observation), clippy 0, fmt clean, fs_tree registered. PASS-via-unit-coverage per the WP6-Phase-1 precedent (module is private `mod fs_index;` like editor_fs; the TempDir tests are the live-fs coverage). -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) — drive_mode=autopilot, verify-self all-PASS, no integration boundary (fs_tree is a new unwired command; walk_index_core refactor behavior-preserving + finder tests green); affirmation printed for read-time veto -->
  - [x] verify-codify  <!-- status: COMPLETE — behavior codified by 8 walk_tree_core tests + 9 unchanged finder tests (guard the refactor); no new tests warranted (no DOM/integration surface); backend suite 90/90, no regressions -->

- [x] Phase 2: Frontend — FileTree collapsible left rail (nester + tree-state + component + wiring)  <!-- status: COMPLETE — impl + all 5 verify nodes done; 15 filetree tests, suites 90/90 + 211/211; operator approved real-backend end-to-end (P2.6 arrow-key nav deferred → backlog) -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the FileTree is the WP10 deliverable (operator-designated must-have).
  - Requirements unchanged: yes — placement (left rail) + tree-data (dirs-included backend, ✅ shipped) locked at spec.
  - Solution still feasible: yes — fs_tree command ships TreeEntry[]; openFile seam + RightPanelHost layout + seed seam (verify-self) all confirmed.
  - No superior alternative discovered: yes — Phase 1 surfaced nothing changing the frontend approach.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (verify-self via seed seam): navigate `/?ws=<repo>` → a file-tree rail renders in the right half (`[data-testid="file-tree"]`); a directory node toggles expand/collapse on click (children show/hide); clicking a file node opens it in the editor (`[data-testid="editor-status-path"]` shows that path); the open file's node is highlighted; gitignored entries (e.g. `node_modules`, `target`) are absent.
  - Browser: a collapse toggle (`[data-testid="file-tree-collapse"]`) hides the rail to a strip and restores it; the editor panel widens when collapsed.
  - Browser: an `fs_tree` IPC failure surfaces an inline error (`[data-testid="file-tree-error"]`), not a silently-empty rail.
  - CLI: `pnpm test` exits 0 — pure `buildTree` nester tests (flat tagged entries → nested nodes; dirs sort before/with files; nesting depth) + `treeState` reducer tests (expand/collapse toggle, collapse-all, active-file set).
  - [x] P2.1 Pure `filetree/buildTree.ts`: `TreeEntry[]` → nested `TreeNode[]` ({name,path,isDir,children}); dirs-first then files, each alpha (case-insensitive); implied-parent creation; root/empty-path defensive  <!-- status: COMPLETE -->
  - [x] P2.2 Pure `filetree/treeState.ts`: expanded-dir `Set<string>` + `treeReducer` (toggle/expand/collapse/collapse-all, same-ref no-ops); default collapsed; `isExpanded` helper  <!-- status: COMPLETE -->
  - [x] P2.3 `FileTree.tsx`: lazy `invoke<TreeEntry[]>("fs_tree",{root})` → buildTree → recursive `TreeRow` (dir click=toggle, file click=onOpen; chevron; active-file highlight via openPath); inline error row `[data-testid=file-tree-error]` (not swallowed); loading + empty states; dark styling. testids file-tree/-dir/-file  <!-- status: COMPLETE -->
  - [x] P2.4 Wired into `RightPanelHost`: right-half restructured into `.right-panel-body` row = `[ .file-tree-rail | .right-panel-main(tabs+slots) ]` under the toolbar; FileTree gets projectPath/openPath/onOpen=openFile; collapse toggle `[data-testid=file-tree-collapse]` with `treeCollapsed` state held in the host (persists across center-stage switches)  <!-- status: COMPLETE -->
  - [x] P2.5 CSS: `.right-panel-body` (row, flex:1/min-height:0), `.right-panel-main` (column, preserves the editor height chain), `.file-tree-rail` (200px, collapsible), `.file-tree-collapse`, `.file-tree-body` (scroll), rows/chevron/active/error — dark-only, reusing tokens  <!-- status: COMPLETE -->
  - [~] P2.6 (stretch) Arrow-key tree nav — DEFERRED (click-to-open + click-toggle are the must-haves and work; arrow-key nav not built to keep the WP boundary clean). Surface as a low-pri follow-up.  <!-- status: SURFACED: arrow-key tree nav deferred (stretch) -->
  - [x] P2.7 Unit tests: `buildTree` (7 — nesting, empty-dir, dirs-first order, deep, implied-parent, empty, stray-root) + `treeState` (8 — toggle/expand/collapse/collapse-all, same-ref no-ops, multi-dir, no-mutation). 15 pass.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — filetree 15/15, tsc clean, eslint clean (scoped) -->
  - [x] verify-self  <!-- status: COMPLETE — subagent 5/5 PASS at :1420 via seed seam: FileTree rail renders; collapse toggle hides/restores both directions (editor stays); fs_tree IPC error surfaced inline [file-tree-error] (not swallowed); console clean (rejections handled in-UI, no crash); editor/diff tabs intact after restructure. Real tree data + click-to-open deferred to verify-human (need backend). -->
  - [x] verify-human  <!-- status: COMPLETE — operator APPROVED all 5 in pnpm tauri dev 2026-06-20. Real tree flow confirmed. Operator also requested a NEW follow-up WP (tree/editor polish: wider rail, denser rows + smaller font, narrower minimap, Sublime-style file-change indicators) → logged SURFACE-2026-06-20-WP10-FOLLOWUP-TREE-EDITOR-POLISH; NOT part of WP10. -->
    - [x] P2.verify-human.1 Real tree populates (gitignore honored, dotfiles + empty dirs shown) — PASS  <!-- status: COMPLETE -->
    - [x] P2.verify-human.2 Dir expand/collapse reveals/hides real children — PASS  <!-- status: COMPLETE -->
    - [x] P2.verify-human.3 File click opens in editor (statusbar + content) — PASS  <!-- status: COMPLETE -->
    - [x] P2.verify-human.4 Open file highlighted in tree — PASS  <!-- status: COMPLETE -->
    - [x] P2.verify-human.5 Collapse reclaims width + layout right in 50/50 — PASS  <!-- status: COMPLETE -->
  - [x] verify-codify  <!-- status: COMPLETE — nester + reducer codified by 15 filetree tests; component/wiring codified by verify-self Playwright (5/5) + verify-human (5/5); no DOM test env by design; suites 90/90 + 211/211, no regressions; no new tests warranted -->

## Current Node
- **Path:** Feature > WP10 COMPLETE → WP boundary (ship/finalize)
- **Active scope:** none — both phases done; WP10 feature-complete. HALT at WP boundary per standing directive (operator picks /feature-ship).
- **Follow-up logged:** SURFACE-2026-06-20-WP10-FOLLOWUP-TREE-EDITOR-POLISH (operator-requested next WP — wider rail, denser rows, narrower minimap, Sublime git-change indicators; NOT part of WP10)
- **Blocked:** none
- **Unvisited:** Phase 2 verify (auto → self → human → codify) → then WP10 ship/finalize (WP boundary — HALT per standing directive)
- **Phase 1:** ✅ COMPLETE (backend fs_tree — 8 tests, suite 90/90)
- **Open discoveries:** none

## Spec review decisions (operator, 2026-06-20)

- **Spec approved** → proceed to `/feature-plan` (F4).
- **Placement = collapsible LEFT RAIL inside the right half** (not a tab, not an overlay). VS Code / Sublime sidebar feel — tree on the left of the right-half panel, always at hand, **collapsible to a thin strip/toggle to reclaim width** (the 50/50 horizontal budget is the live constraint, so collapse is required, not optional). Layout shape:
  ```
  CC term │ tree │ editor / diff      (tree ◂ collapses to a strip)
  ```
- **Tree data = (b) EXTEND `fs_index` WITH DIRECTORIES** — add a dirs-included Rust variant/core to the existing `fs_index` module so the tree gets full directory structure (empty dirs included), one walk, reusing WP6's `ignore`-crate walk + exclusion rules exactly (gitignore + `.ignore`, `.git/` out, dotfiles shown). Pure-fn core, TempDir-testable, errors surfaced not swallowed — mirrors `walk_index_core`. NOT frontend-build-from-flat (operator wants empty dirs shown) and NOT lazy `list_dir` (overkill at repo sizes; can upgrade later behind the same component if a huge-tree wall ever appears).
- **Keyboard-nav depth:** decide at plan — click-to-open is the must-have; arrow-key tree nav is a stretch within the same WP.

> No 3rd-party probe required. No research unknowns — build/UX decisions resolved above. **F4 → `/feature-plan`.**

## Discoveries
<!-- [SURFACED-<date>] <target node> — <summary> -->
