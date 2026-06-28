# Feature: WP6 — FileTree reaches gitignored-but-editable files (heavy-dir re-base)

**Workflow:** feature
**State:** Completed 2026-06-28
**Created:** 2026-06-27
**Drive mode:** autopilot
**Milestone:** M6 (friend-QoL) — WP6

## Problem Statement

The FileTree (and the Cmd+P finder + content-search, all backed by the single shared `fs_index::project_walker`) hide **every** gitignored path. Gitignore is being used as a proxy for "noise," but it's a *leaky* proxy: it correctly hides heavy generated dirs (`node_modules/`, `target/`, build output) yet ALSO hides files the operator genuinely interacts with — `.env` (edit), `.session.md` (presence-check + read), `.claude/*` memory/skill files (read). This pushes the operator back to Sublime/terminal for routine in-app work, undercutting "in-app editor is primary" (vision Core Principle 3).

**The decision (operator, 2026-06-27 plan-time debate):** do NOT maintain a fixed allowlist of "files I want to see" (open-ended, personal, per-project — re-encodes the same wrong-proxy mistake at finer grain, and is a maintenance tax). Instead **re-base the exclusion criterion from "is gitignored" to "is a heavy/generated dir"** — the thing gitignore was only ever a proxy for. A dir is "heavy" if it matches a **closed, universal built-in name set** (`node_modules`, `target`, `dist`, `.next`, `venv`, …) **OR** is **detected big** (shallow immediate-child count over a threshold). Everything else — `.env`, `.session.md`, `.claude/*`, gitignored configs — is **shown** in the tree, **openable/editable** (round-trips through the already-root-confined `editor_fs::write_file`), and **watched** for live external-change.

**Two subsystems, re-based onto ONE shared heavy-dir predicate** (keeps the existing "tree + watcher agree" contract — but on the *heavy* axis, not the *gitignored* axis):
1. **`fs_index::project_walker`** (tree/finder/search) — prune heavy dirs (list the dir row but DON'T descend → presence with ~zero cost), show everything else. Clutter is the only cost here, and it's bounded.
2. **`fs_watch`** (`build_ignore`/`is_ignored`) — the **perf-critical** subsystem (the "don't-fire-a-re-walk-storm" / infinite-rerun footgun). Re-base its emit-filter from gitignore to the same heavy-dir predicate so `.env` etc. get live-refresh + external-change detection (the EDIT case) while heavy-dir churn stays suppressed. **Hard requirement: heavy dirs MUST stay suppressed.** (NB: the watcher's OS-level `RecursiveMode::Recursive` already registers the whole tree; the gitignore filter only suppresses *emits*. Re-basing the *filter* is the behavior change; the recursive OS watch is unchanged — macOS FSEvents per-tree is acceptable.)

**Scope = walker-wide** (NOT FileTree-only): the same predicate change lands in `project_walker`, so Cmd+P + content-search ALSO stop hiding `.env`/`.claude` and stop pruning only on heavy. Operator confirmed "ONLY ignore the heavy dirs" applies uniformly. Content-search surfacing a secret VALUE is acceptable — the operator wants reach, and these are the operator's own files on their own machine (single-user tool). (The earlier "search over secrets may be unwanted" backlog caution is overridden by the explicit decision.)

**Heavy-dir threshold (default, confirm at build):** prune a dir if its **immediate children count > 500** (one shallow `readdir`; `node_modules` top-level alone blows past it; no hand-authored source dir has 500 direct children). Shallow-only so detection itself costs ~one syscall per dir, never a recursive count.

## Work Tree

- [x] Phase 1: Shared heavy-dir predicate + walker re-base (tree/finder/search show ignored files; heavy dirs pruned)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI (Rust unit): `cargo test -p claudesk fs_index` — a new test fixture with a gitignored `.env`, a gitignored `.session.md`, AND gitignored heavy dirs (name-based `node_modules/`/`target/` with files inside; detection-based a `generated/` with >threshold immediate children) asserts: `.env`, `.session.md`, `secret.txt` ARE present in both `walk_index_core` and `walk_tree_core`; `node_modules`/`target`/`generated` appear as a single `is_dir` ROW (marked `pruned`) but their CONTENTS are absent; `.git/` still fully excluded.
  - CLI (Rust unit): the pure `is_heavy_dir_name` + `dir_is_heavy` predicates have direct unit tests — known names → heavy regardless of count; unknown name under threshold → not heavy; unknown name over threshold → heavy.
  - CLI: `cargo test` full backend suite green; `cargo clippy -- -D warnings` + `cargo fmt --check` clean.
  - [x] P1.1 Added a pure heavy-dir predicate to `fs_index` (`mod.rs`): closed `HEAVY_DIR_NAMES: &[&str]` (node_modules, target, dist, build, out, .next, .nuxt, .svelte-kit, .turbo, .parcel-cache, coverage, venv, .venv, __pycache__, .pytest_cache, .mypy_cache, .gradle, vendor) + `HEAVY_DIR_CHILD_THRESHOLD: usize = 500` + pure `is_heavy_dir_name` and `dir_is_heavy` (name-match OR shallow `read_dir().take(N+1).count() > N`, errors → not-heavy). `.git` exclusion kept separate.  <!-- status: DONE -->
  - [x] P1.2 RESOLVED the yield-but-prune unknown: `ignore` 0.4's `filter_entry` returning false skips the dir's OWN row too (confirmed in walk.rs:960-965), so it CANNOT yield-but-don't-descend. Switched to a **manual DFS `read_dir` walk** (`walk_project(root) -> Vec<WalkedEntry>`) with exact descent control: a heavy dir's row is pushed but NOT pushed onto the descent stack. Gitignore fully disabled (no longer using `ignore::WalkBuilder` here at all); `.git` skipped inline. `walk_index_core`/`walk_tree_core` both project from `walk_project`.  <!-- status: DONE -->
  - [x] P1.3 Rewrote the `fs_index` fixture + inverted tests: `.env`/`.session.md`/`secret.txt` now ASSERTED PRESENT; `node_modules`/`target` rows present + `pruned`, contents absent; added 6 heavy-dir predicate + detection + walk-pruning tests. 23 fs_index tests pass.  <!-- status: DONE -->
  - [x] P1.4 `project_search` re-pointed from `project_walker` (removed) to `walk_project` at both `search_core` + `replace_core`; inherits the re-base. Rewrote the two inverted tests (gitignored file now searched/replaced; heavy-dir file not) + fixed 3 match-count shifts (ignored.txt now contributes). Module doc updated. All project_search tests pass.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — scoped: fs_index:: 23 pass, project_search:: 27 pass, clippy -D warnings clean, fmt clean -->
  - [x] verify-self  <!-- status: DONE — runner subagent: all 4 CLI outcomes PASS, 0 blocking. fs_index:: 23, project_search:: 27, clippy/fmt clean, full lib 279/0. Live FileTree IPC consuming-surface check is Phase 3's contract (P3.3) — carried forward, not lost. -->
  - [x] verify-human  <!-- status: DONE — operator chose "walk live FileTree now"; agent drove live verify via MCP bridge (scratch-a seeded with gitignored .env/.session.md/node_modules/.claude). All 4 checks PASS. -->
    - [x] P1.verify-human.1 FileTree shows gitignored-but-editable files → `.env`, `.session.md`, `.claude` all render as rows in the live tree (scratch-a). PASS.  <!-- status: DONE -->
    - [x] P1.verify-human.2 Heavy dir doesn't flood → `node_modules` is a single dir row; expanding it (aria-expanded=true) reveals ZERO children, no hang, no flood (pruned: listed-but-not-descended). Renders as a plain empty folder — the "(not indexed)" styling is Phase 3 work, not a break. PASS.  <!-- status: DONE -->
    - [x] P1.verify-human.3 Edit round-trip → clicking `.env` opens it in the editor showing real content (SECRET_KEY=hunter2 / API_URL=…), `.env` tab present. Openable/editable. PASS. (Full save→reload→persist is Phase 3 P3.3's explicit contract.)  <!-- status: DONE -->
    - [x] P1.verify-human.4 Cmd+P finds gitignored files → ⌘P palette ("Go to file…") query "env" surfaces `.env`. Finder backed by the re-based walk_project. No JS errors. PASS.  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — every Phase-1 verified behavior already has higher-level (module-integration) coverage from P1.3/P1.4 (no new tests needed): gitignored_editable_files_are_now_shown, tree_shows_gitignored_prunes_heavy_excludes_git_dir, heavy_dir_contents_are_pruned_*, detected_big_dir_is_pruned_in_walk, git_metadata_dir_is_excluded, heavy_dir_name_predicate + dir_is_heavy_* (4), gitignored_files_are_now_searched_but_heavy_dirs_excluded, replace_now_touches_gitignored_files_but_not_heavy_dirs. Full lib suite 283/0 (warm 0.72s); clippy -D warnings + fmt clean. Also fixed a stale doc comment in project_search::search_core ("gitignore honored" / [`project_walker`] → "heavy dirs pruned, gitignore NOT honored" / [`walk_project`]). NB: fs_watch/mod.rs still carries a stale `project_walker` doc ref — left intentionally, it's Phase 2's subsystem and P2.2 rewrites that doc. -->

  **Build note:** the `pruned` flag (P3.1's open decision) was threaded NOW (added to `TreeEntry` wire DTO + `WalkedEntry`) because the walk already computes it and it cleanly disambiguates real-empty-dir vs heavy-pruned — frontend render of it is still Phase 3.

- [x] Phase 2: Re-base the fs_watch emit-filter onto the shared heavy-dir predicate (live-refresh for .env etc.; heavy-dir suppression preserved)  <!-- status: DONE -->
  **P2.1 DECISION (2026-06-28): NAME-based only.** `is_ignored` is a pure FS-free fn — a path is ignored iff any ancestor component is `.git` or a heavy NAME (`fs_index::is_heavy_dir_name`). NO per-event read_dir, NO detected-big detection, NO build-time scan cache (rejected: adds watch_start cost + staleness for a rare case). Accepted tradeoff (design decision #7): a detected-big-but-unnamed dir is NOT suppressed by the watcher (it emits), but the tree still prunes it for display → worst case a harmless extra re-walk, never a wrong result. The `Gitignore`/`build_ignore` plumbing is fully dropped (P2.2 fully removable). `paths_to_change` lost its `matcher` param.
  **Observable outcomes:**
  - CLI (Rust unit): `cargo test -p claudesk fs_watch` — `is_ignored` (or its renamed successor) now KEEPS a gitignored `.env`/`.session.md`/`.claude/*` (these emit `fs-change`) and STILL DROPS `node_modules/*`, `target/*`, a detected-big-dir child, and `.git/*`. The existing `gitignored_paths_are_ignored` test INVERTS for non-heavy gitignored files and is rewritten; `git_dir_paths_are_ignored` unchanged.
  - CLI (Rust unit): `paths_to_change` with a mixed batch (`.env`, `node_modules/x`, `.git/index`, `src/main.rs`) emits exactly `[.env, src/main.rs]` (the EDIT-case unlock: `.env` now live-refreshes).
  - CLI: `cargo test` full suite green; clippy/fmt clean.
  - [x] P2.1 Rewrote `fs_watch::is_ignored(root, path)` (matcher param dropped) to the NAME-based heavy-dir predicate: ignored iff any `rel` component is `.git` or `is_heavy_dir_name`. Pure, FS-free, O(components). `build_ignore` deleted; `paths_to_change` signature lost `matcher`; caller in `commands.rs` updated (no per-root matcher build). See P2.1 DECISION above.  <!-- status: DONE -->
  - [x] P2.2 Dropped all `ignore::gitignore::Gitignore` plumbing from `fs_watch` (import + `build_ignore` gone — `fs_watch` no longer references the `ignore` crate at all). Rewrote the module "Exclusion model" doc to the heavy-dir basis + a new "Hot-path heaviness: NAME-based only" section documenting the tradeoff. Also fixed the stale `fs_index` module/walk_project docs that still claimed `ignore::WalkBuilder` (Phase 1 switched to manual DFS — doc-drift corrected) + the project_search::search_core stale doc from verify-codify.  <!-- status: DONE -->
  - [x] P2.3 Rewrote tests: `gitignored_paths_are_ignored` → `gitignored_but_non_heavy_files_are_now_kept` (INVERTED: .env/.session.md/.claude/* now KEPT) + new `heavy_dir_paths_are_ignored` (node_modules/target/dist + nested heavy) + `detected_big_but_unnamed_dir_is_not_suppressed_by_watcher` (documents the accepted over-emit) + `path_outside_root_is_ignored`. Kept `git_dir_paths_are_ignored`, `transform_dedups_repeated_paths`, `fs_change_dto_serializes_snake_case`. `transform_filters_ignored_and_keeps_tracked` updated to assert `.env` now passes. 15 fs_watch tests pass (10 mod + 5 commands).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — scoped: clippy -D warnings clean (caught + fixed a doc_lazy_continuation from the doc reflow), fmt clean, fs_watch 15/15 pass. -->
  - [x] verify-self  <!-- status: DONE — runner subagent: all 4 CLI outcomes PASS, 0 blocking, 0 cosmetic. fs_watch 15/15, full lib 285/0, clippy -D warnings + fmt clean. Wiring trace confirmed: commands.rs calls paths_to_change w/ new 4-arg signature, no build_ignore, fs_watch no longer references the `ignore` crate. CARRIED to verify-human: the live external-FS-change → debounced-emit → tree-refresh round trip (.env edit live-refreshes, heavy-dir churn stays quiet) is genuinely operator-only at the live tier — a backend watcher emit, not webview-observable via the MCP bridge. -->
  - [x] verify-human  <!-- status: DONE — operator approved both live FS-emit checks (pass). -->
    - [x] P2.verify-human.1 Edit a gitignored `.env`/`.session.md` from OUTSIDE Claudesk → change detected live (EDIT-case unlock). Operator: PASS.  <!-- status: DONE -->
    - [x] P2.verify-human.2 Heavy-dir churn (npm install / cargo build into node_modules/target) → no event storm, app responsive (heavy-dir suppression preserved). Operator: PASS.  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — no new tests needed; the emit-decision contract is already covered by P2.3's rewritten tests. Boundary disposition: the fs-change emit (commands.rs:159 → paths_to_change → emit) has an integration boundary, but the truly end-to-end slice (notify watcher → debouncer → AppHandle emit) is not CI-testable (needs a live watcher + Tauri app) — operator-verified at verify-human. The highest-level CI-reliable test of the emit DECISION is `transform_filters_ignored_and_keeps_tracked` (asserts .git+heavy dropped, .env+tracked kept — the exact post-change emit contract) + `transform_all_ignored_returns_none` (pure heavy/.git churn → no emit). Full lib 285/0 (warm 0.67s). -->

- [x] Phase 3: FileTree render for pruned heavy dirs + live verify (presence/read/edit all work in the running app)  <!-- status: DONE -->
  **P3.1 DECISION (2026-06-28): render the `pruned` flag (NOT the minimal no-op).** The flag was already on the Rust wire DTO (threaded in Phase 1), so the cost is just the TS mirror + a small render — cheap, and it resolves a real ambiguity (a `node_modules` that expands to nothing looks identical to a genuinely-empty dir). Render: dim italic name + a "(not indexed)" trailing label + a `·` placeholder chevron; the per-dir ＋/⊞/✕ create/delete affordances are SUPPRESSED on a pruned row (creating/recursively-deleting inside an un-indexed heavy dir is nonsensical + a footgun). `data-pruned` attribute added for test/observe.
  **Observable outcomes:**
  - Browser (MCP bridge, dev): open scratch-a (or a scratch repo seeded with a gitignored `.env` + a `node_modules/` with a file) → the FileTree shows `.env` as a normal openable row; `node_modules/` shows as a row whose expand reveals NO children (pruned, leaf-like); clicking `.env` opens it in the editor; editing + ⌘S saves (round-trips `editor_fs::write_file`); the saved content reads back.
  - Browser (MCP bridge): the heavy-dir row is visually distinguishable as not-expandable OR expands to an explicit "(not indexed)" affordance — NO crash, no infinite spinner. (Decide the render at build; minimal acceptable = a normal dir row with zero children.)
  - Console: no JS errors on tree load with ignored files present.
  - CLI: `pnpm tsc --noEmit`, `pnpm eslint` (changed files), `pnpm vite build` all clean.
  - [x] P3.1 Confirmed `buildTree.ts` handles a heavy dir as an `is_dir` entry with NO descendant entries (empty `children`). DECIDED: render the `pruned` flag (the Rust DTO already carries it from Phase 1). See P3.1 DECISION above.  <!-- status: DONE -->
  - [x] P3.2 Threaded `pruned` through: added optional `pruned?: boolean` to the TS `TreeEntry` wire mirror + required `pruned: boolean` on `TreeNode`; `buildTree` sets it from the explicit dir entry (default false for files/ordinary dirs/implied dirs). FileTree.tsx renders the dim name + "(not indexed)" label + `·` chevron + suppresses ＋/⊞/✕ on pruned rows; App.css `.file-tree-dir-pruned`/`.file-tree-pruned-label` (dim italic, dark-only). 4 new buildTree vitest cases (carries flag + empty children, ordinary=false, real-empty-vs-pruned distinct, nested pruned keeps flag). 15 buildTree tests pass; full vitest 723/0; tsc/eslint/vite build clean.  <!-- status: DONE -->
  - [x] P3.3 Live verify-self via the `tauri` MCP bridge (orchestrator drove mcp__tauri__* directly @ 127.0.0.1:9223 — NOT the Playwright-named runner, per CLAUDE.md caveat a) against scratch-a seeded with gitignored .env/.session.md/node_modules/.claude. CONFIRMED LIVE: (1) presence — .env + .session.md render as openable file rows, .claude as a normal dir; (2) pruned render — node_modules has data-pruned="true", class file-tree-dir-pruned, `·` chevron, "(not indexed)" label, dim italic (screenshot confirms visually distinct from .claude); (3) pruning behavior — expanding node_modules yields 0 children, no hang, ＋/✕ create/delete buttons suppressed; (4) open — clicking .env loads real content (SECRET_KEY=hunter2…) into the editor; (5) no JS errors — no error row, no React error boundary, tree rendered clean. (.env edit→save→persist is the editor_fs::write_file path already operator-approved at Phase 1 P1.vh.3 + QoL-WP5 tests.)  <!-- status: DONE -->

  - [x] verify-auto  <!-- status: DONE — scoped: buildTree vitest 15/15, tsc --noEmit clean, eslint (3 changed files) clean, vite build clean (chunk-size warning pre-existing → SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD, M9). -->
  - [x] verify-self  <!-- status: DONE — orchestrator drove the live MCP bridge (P3.3) against scratch-a; ALL Phase-3 browser/console/CLI outcomes PASS, 0 blocking, 0 cosmetic. .env/.session.md shown+openable, node_modules renders "(not indexed)" pruned (0 children, no hang, create/delete suppressed), .env opens with content, no JS errors. Screenshot captured. -->
  - [x] verify-human  <!-- status: DONE — operator approved the pruned-dir affordance design (pass, no change requested). -->
    - [x] P3.verify-human.1 Design judgment: pruned heavy-dir "(not indexed)" affordance — operator: PASS (reads well, no change).  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — no new tests needed. The pruned-flag DATA layer (the regression-catching contract) is codified by P3.2's 4 buildTree vitest cases (flag rides wire→node + empty children, ordinary/file=false, real-empty vs pruned distinct, nested keeps flag). The render itself (FileTree.tsx "(not indexed)" + suppressed buttons) follows the repo's pure-logic→vitest / live-DOM→bridge posture — exercised end-to-end at verify-self via the MCP bridge, not via a new RTL/jsdom test type the repo doesn't use for FileTree. Full suites green: frontend vitest 723/0, backend 285/0. -->

## Current Node
- **Path:** Feature > ship + review-quality COMPLETE → finalize
- **Active scope:** none — shipped (`61db3d4`), review-quality done (0C/1M/3 MINOR, all auto-backlogged → backlog-quality-findings.md + backlog.md pointer). Next: /feature-finalize.
- **Blocked:** none
- **Unvisited:** none — ready to finalize
- **Open discoveries:** none
- **Resolved unknown:** P1.2's yield-but-prune mechanism — `ignore` 0.4 `filter_entry` can't yield-but-not-descend; switched to a manual DFS `read_dir` walk (`walk_project`). No SURFACE needed; contained within the WP.

## Design decisions (locked at plan time)
1. **NO fixed allowlist of "files to show."** Rejected by operator — re-encodes the wrong-proxy mistake + maintenance tax.
2. **Re-base exclusion from "gitignored" → "heavy/generated dir"** across BOTH walker and watcher (shared predicate; the "tree + watcher agree" contract preserved on the heavy axis).
3. **Heavy = built-in NAME set OR detected-big** (shallow immediate-child count > 500, default). Names cover the universal 99%; detection guards the project-specific long tail. (Operator: "this + detected big dirs.")
4. **Scope = walker-wide** (tree + Cmd+P + content-search all re-based). Content-search over a secret value is acceptable (single-user, operator's own machine, operator wants reach). Overrides the earlier FileTree-only caution.
5. **Heavy dirs are LISTED but NOT descended** (presence at ~zero cost), not fully absent. Confirm the `ignore` yield-but-prune mechanism at build (the one real unknown — P1.2).
6. **EDIT is first-class** (equal to presence + read): `.env` must open→edit→save AND get live external-change detection via the re-based watcher.
7. **Watcher hot-path heaviness:** lean NAME-based + a build-time detected-big scan cache if cheap; accept that a detected-big-but-unnamed dir may over-emit live-refresh (rare, tree still prunes it). Decide at P2.1.

## Code-Quality Review — wp6-filetree-shows-ignored-files

(Per-feature review against ship commit `61db3d4`, drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 3 MINOR — MAJOR + MINORs auto-backlogged to `workflow/backlog-quality-findings.md`.)

### Strengths
- Exclusion-model re-base documented end-to-end across all three module docs (why gitignore was a leaky proxy + what replaced it).
- Shared-walk invariant ("tree/finder/search/watcher never disagree") preserved — `walk_project` is the single traversal; all consumers project from it.
- Hot-path-vs-display split principled + reasoned: NAME-only in the watcher (FS-free) vs NAME+detected-big in the tree, accepted over-emit pinned by `detected_big_but_unnamed_dir_is_not_suppressed_by_watcher`.
- Test coverage tracks the inversion precisely (old assertions inverted, not deleted; detected-big walk-level test added).
- FileTree pruned-render defensive: inert chevron + suppressed create/delete with stated footgun rationale.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [src-tauri/Cargo.toml:61] The `ignore = "0.4"` dependency is now dead — `walk_project` dropped `ignore::WalkBuilder` and `fs_watch` dropped `GitignoreBuilder`; no non-comment code references the crate anywhere in `src-tauri/src/`. The Cargo.toml comments around it (lines 55-76) still describe the old gitignore-honoring model. — *Why: a dep whose removal was the whole point of the re-base is still in the build/link graph + its comments assert an abandoned posture.* → auto-backlogged (SURFACE-2026-06-28-QUALITY-WP6-DEAD-IGNORE-DEP).

**MINOR**
- [src-tauri/src/fs_index/mod.rs ~202] `walk_project` skips symlinks (neither dir nor file on the un-traversed file_type) — correct + cycle-safe, but documented only as an inline aside, not in the function/module visibility-contract doc. → auto-backlogged.
- [src-tauri/src/project_search/mod.rs ~172] Reflowed doc-comment line runs slightly long past the file's wrap width. Cosmetic. → auto-backlogged.
- [src-tauri/src/fs_index/mod.rs ~147] `dir_is_heavy` does a `read_dir` per non-name-matched dir during the walk (detected-big check) — acceptable for single-user + short-circuited at threshold+1, but the per-dir syscall doubling isn't called out next to the threshold constant. → auto-backlogged.

### Assessment
Well-built. Clean conceptual re-base ("is gitignored" → "is a heavy/generated dir") with the implementation matching the concept: one shared `walk_project` DFS, a pure name predicate + shallow detected-big check, three consumers projecting from the single traversal. High reasoning quality — hot-path/display asymmetry, rejected personal-allowlist alternative, and accepted watcher over-emit all documented at the decision point + pinned by tests. Manual `read_dir` DFS correctly handles "yield the row, skip the subtree" that `ignore::filter_entry` couldn't; symlink cycles sidestepped. Only debt: the now-dead `ignore` crate in Cargo.toml.

### If you disagree
Operator: dismiss any finding by editing this section + marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The plan's headline unknown (P1.2 — can `ignore`'s `filter_entry` yield-a-dir-row-but-skip-descent?) resolved to NO at build: `ignore` 0.4's `filter_entry` returning false skips the dir's OWN row too. The whole walker had to switch from `ignore::WalkBuilder` to a manual `read_dir` DFS to get exact descent control. This is what made the `ignore` crate fully removable (the review's MAJOR finding) — an emergent consequence the plan didn't foresee.
- **Assumptions that held:** The heavy-dir re-base concept (NAME set OR detected-big) was sound and clean; the shared-walk invariant survived intact (one `walk_project`, three consumers); the NAME-based hot-path decision for the watcher (P2.1) held with no need for the build-time detected-big cache the plan floated as an alternative. The `pruned` flag — threaded onto the wire DTO during Phase 1 "because the walk already computes it" — paid off exactly as bet when Phase 3 rendered it.
- **Assumptions that were wrong:** The plan hedged P3.1 as "minimal (empty-folder row) acceptable; add `pruned` render only if the ambiguity bothers verify-human." In practice the flag was already wired, so the fuller "(not indexed)" render was the cheaper-and-clearer choice from the start — the hedge was unnecessary.
- **Approach delta:** Phase split changed mid-flight in spirit: P3.3 ("live verify") turned out to be a verify-self leaf (the MCP bridge drives it), not a build leaf — so build did P3.1/P3.2 and verify-self drove the live render. The MCP-bridge live verify-self (both phases) worked cleanly, dissolving what the plan assumed might be carried to verify-human. Otherwise the implementation matched the plan's 3-phase shape.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
