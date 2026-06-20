# Feature: M2 WP4 — Git diff viewer (Sublime-Merge-style)

**Workflow:** feature
**State:** verify-codify (all phases complete — ready to ship)
**Created:** 2026-06-20 (spec); originally planned 2026-06-20, redesigned after verify-human rejection
**Entry:** spec (complex feature — redesign after verify-human F12 reject)
**Drive mode:** autopilot (PAUSE for operator spec sign-off — this entry IS the pause)
**WBS:** Milestone 2, WP4 (expanded M→L by the commit-log addition; SURFACE to product:wbs below)

## Problem Statement

The right half of a workspace can edit files (WP2/WP3*) but can't show what changed in git — the operator still reaches for **Sublime Merge** to review changes before committing. WP4's first attempt (a file-list + single-file `@codemirror/merge` diff) was **rejected at verify-human 2026-06-20**: it's the wrong mental model. The operator wants the Sublime Merge "Working Directory" experience — a scrolling column where every changed file is a collapsible section showing its hunks inline (+/- lines with surrounding context), plus a recent-commits list to review past commits' diffs. **View-only** (no staging/discard) — that honors the M2 "view-only diff" decision.

**Process note (why this is a spec, not a plan revision):** the first attempt went down the lightweight `feature-plan` path and, in autopilot, plan→build auto-chained with no plan-review pause, so the UX was never confirmed before ~700 LOC were written. A UX-heavy feature is `feature-spec`-worthy regardless of drive mode. This spec corrects that: operator signs off on the UX before any rebuild.

## User Stories

- As the operator, I want to see **all my working-tree changes at once** — a scrolling list of collapsible file sections, each showing its diff hunks inline — so I can review everything before committing without clicking file-by-file (the Sublime Merge "Working Directory" view).
- As the operator, I want each file section to show the **+/- changed lines with a little surrounding context**, color-coded, so a diff reads at a glance.
- As the operator, I want to **collapse/expand** individual file sections (and collapse the whole commits area) so a large change set or a long history stays navigable in the half-width panel.
- As the operator, I want a **recent-commits list** at the top; clicking a commit shows **that commit's diff** (vs its parent) in the same hunk view, so I can review history, not just the working tree.
- As the operator, I want the diff viewer to clearly show **staged vs unstaged** changes (Sublime Merge's "Working Directory" groups them), so I know what's about to be committed.

## Acceptance Criteria

The feature is done when, in the real Tauri app against a real repo:

**Working-directory view (the default):**
- The diff panel shows a **collapsible "Commits" section at the top** (~top third, collapsible to a header) and a **changed-files area below** in one scrolling column.
- The changed-files area lists **every changed file** as a collapsible section: a header row (status badge A/M/D/R/?, path, staged/unstaged indicator) + the file's **hunks rendered inline** — each hunk shows its `@@ -a,b +c,d @@` header and the hunk's lines, context lines plain, added lines green, removed lines red (the screenshot's look).
- Each file section **collapses/expands** on its header click; default expanded.
- **Staged and unstaged** changes are both shown and visually distinguished (a file with both appears with its staged and unstaged hunks distinguishable).
- A **clean tree** shows an explicit "No changes" empty state; a **non-git dir** shows an inline error (never a blank panel — the WP6/WP7 error-surfacing lesson).
- Binary / non-UTF-8 files show a "binary file (N bytes changed)" notice instead of garbage.

**Commit-history view:**
- The **Commits** section lists recent commits (subject line, author, relative date, short SHA; HEAD/branch marker on the tip), most-recent first, loaded in **pages** with a **"Load more" affordance** at the bottom (e.g. 50 per page; clicking fetches the next page and appends). NOT a hard cap — the operator can page back through history. (CONFIRMED with operator 2026-06-20.)
- Clicking a commit renders **that commit's diff** (commit vs its first parent) in the same collapsible-files + inline-hunks view, replacing the working-dir files area; a way back to the working-dir view is obvious.
- The initial/root commit (no parent) renders as all-added against the empty tree (no crash).

**Quality gates:** `cargo test` green (new `git_diff` hunk + log tests), `cargo clippy -- -D warnings` + `cargo fmt --check` clean; `pnpm tsc`/`lint`/`test`/`format` clean; operator verify-human PASS in the real app.

## Out of Scope

- **Staging / unstaging / discard / commit** — explicitly OUT (M2 "view-only diff" decision; `arch.md` + `wbs.md`). No index mutation. (A future milestone may add interactive staging.)
- **Rebase, blame, conflict resolution, branch/tag management, push/pull** — out (M2 scope).
- **Diff *between arbitrary* commits / branches, or a file's full history** — only working-tree and single-commit-vs-parent for WP4. (Range/compare-arbitrary is a future possibility.)
- **Syntax highlighting inside diff hunks** — v1 renders plain colored +/- lines (the screenshot is unhighlighted too). Syntax-highlighted hunks = a deferrable polish, logged to backlog, not WP4.
- **Word-level / intra-line diff highlighting** — line-level only for v1.
- **The Editor↔Diff panel-switch hotkey + RightPanelHost** — that's WP5. WP4 keeps the WP2-style stopgap toggle in `Workspace.tsx`.

## Technical Constraints

- **No 3rd-party API** — `git2` (libgit2, already added at v0.21) and React are the only deps; both documented, versions verified. No probe needed. `@codemirror/merge` is **dropped** from the diff render (see below); it stays in `package.json` only if something else uses it (nothing does → remove from the diff path, leave the dep for now/clean up at ship).
- **Rendering = git2-computed hunks → plain styled lines (CONFIRMED with operator).** The backend computes the real git diff (`git2::Diff` deltas → hunks → lines) and ships **structured hunk data** over IPC; the frontend renders each line as a styled `<div>` (context/add/remove). This drops the per-file `@codemirror/merge` MergeView — lighter (no N mounted editors, which the WP1 probe flagged), and it's exactly the flat +/- look the operator wants. Trade-off: no syntax highlighting in hunks (accepted, see Out of Scope).
- **Backend carries forward + extends** the Phase-1 `git_diff` module (60/60 tests; `git_changed_files` + `git_file_base`). New backend surface:
  - `git_changed_files` — **kept** (the file list + status), feeds the file-section headers.
  - **NEW `git_file_hunks(root, path, staged)`** → structured hunks for one file (`Vec<Hunk{ header, lines: Vec<DiffLine{ origin: context|add|remove, content, old_lineno?, new_lineno? }> }>`), from `diff_tree_to_workdir_with_index` (unstaged) / `diff_tree_to_index` (staged), filtered to `path`. Binary → a `binary: true` marker, no line spam.
  - **NEW `git_recent_commits(root, offset, limit)`** → `Vec<CommitSummary{ sha, short_sha, subject, author, time, is_head }>` via `git2` **revwalk** from HEAD, **paginated** (skip `offset`, take `limit`) to back the "Load more" affordance. Returns fewer than `limit` (or empty) at history end — the frontend hides "Load more" when a short page comes back.
  - **NEW `git_commit_diff(root, sha)`** → the same hunk shape, per changed file, for `commit vs first-parent` (`diff_tree_to_tree`); root commit → vs empty tree.
  - `git_file_base` — **likely removed** (the frontend no longer needs base blobs once hunks come pre-computed); confirm at plan time and delete if orphaned (the tauri-command-removal-needs-invoke-sweep lesson applies).
  - All follow the established `command → pure-fn (injected &Path, TempDir-testable) → typed GitDiffError → String` shape.
- **Frontend** replaces `DiffPanel`'s file-list+`unifiedMergeView` internals with: a collapsible `CommitList` (top), a `ChangedFilesView` (collapsible `FileDiffSection`s rendering `HunkView`s). Pure model/reducers (`diffModel.ts` extended) stay vitest-tested; the live DOM is verify-human'd in the real app (the stubbed-browser path wedges on the dialog plugin — SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE).
- **WBS scope expansion → SURFACE to product:wbs.** The commit-history view (revwalk + per-commit diff) is genuinely new work beyond WP4's "working-tree diff" headline. WP4 grows M→L. Logged to backlog as a SURFACE; the WBS WP4 entry should be annotated. (No `arch.md` back-loop: view-only honors the existing M2 decision; the component table already lists a DiffPanel — this refines its internals.)
- **Half-width panel** — all layout must work in a ~50%-window-width column (the commits section is a collapsible top region, NOT a left rail; confirmed with operator).
- **Dark-mode only** — diff line colors are dark-theme tokens (green/red on #1e1e1e), no light variant.

## Open Questions

- [ ] None blocking. Two design forks already resolved with the operator (2026-06-20): **(a)** render = git2 hunks → plain styled lines (not CM6 per-file); **(b)** commits = collapsible top section (not left rail / not a separate History tab). Plan can proceed.

## Carried context / discoveries

- **Phase-1 backend** (`git_diff` mod, `git_changed_files`/`git_file_base`, 60/60 tests) is committed-quality and carries forward; the rebuild extends it (hunks + log) and may retire `git_file_base`.
- **SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE** (backlog, low) — stubbed-browser verify-self wedges on the dialog plugin; real-Tauri-app verify-human is the path for this WP.
- **SURFACE (this spec) → product:wbs:** commit-history view expands WP4 scope (revwalk + per-commit diff). To be logged at plan time / SURFACED now.
- **No git remote** — all M2 commits local on `main`.
- **Standing operator directive:** autopilot, halt at WBS-level WP boundaries.

## Work Tree

> **Phasing rationale:** Phase A = new backend (hunks + paginated commit log + commit diff), all `git2`, fully TDD-testable against TempDir repos before any UI consumes it — mirrors the original WP4 backend-first split. Phase B = the Sublime-Merge frontend rebuild consuming that backend. The carried-forward Phase-1 backend (`git_changed_files`, 60/60 tests) is kept; `git_file_base` is retired in Phase A if orphaned. The old `DiffPanel` file-list+`unifiedMergeView` internals are replaced in Phase B.

- [x] Phase A: Backend — diff hunks + commit log + commit diff (`git2`)  <!-- status: done -->
  **Codify note:** 12 new git_diff tests (TDD during build) codify every Phase-A Observable Outcome (hunks ×4, commit-log ×4, commit-diff ×4) — no gap, nothing to duplicate. The pure-fn cores ARE the unit the commands delegate to (wrappers are 1-line `.map_err`); no Tauri-runtime harness for in-`cargo-test` IPC e2e. No integration boundary — isolated new artifacts only. 72/72 suite green.
  **Observable outcomes:**
  - CLI: `cargo test` green; new `git_diff` hunk/log tests land; total backend tests > 60 (Phase-1 baseline).
  - CLI: `cargo clippy --all-targets -- -D warnings` clean; `cargo fmt --check` clean.
  - CLI (behavioral, via test): in a TempDir repo with a modified file, `file_hunks_core(root, path, staged=false)` returns ≥1 `Hunk` whose `lines` include `add`+`remove`+`context` origins with correct content and a `@@`-style header; a staged edit → `staged=true` returns the staged hunks; a binary file → a `binary: true` marker (no line spam).
  - CLI (behavioral, via test): `recent_commits_core(root, offset, limit)` returns commits newest-first with `{short_sha, subject, author, time, is_head}`; pagination — `(offset=0,limit=2)` then `(offset=2,limit=2)` return disjoint, contiguous pages; end-of-history returns a short/empty page. `is_head` true only on the tip.
  - CLI (behavioral, via test): `commit_diff_core(root, sha)` returns per-file hunks for `commit vs first-parent`; the **root commit** (no parent) returns all-added vs the empty tree (no panic/error).
  - CLI (edge, via test): non-git dir → `GitDiffError::NotARepo`; unknown sha → a typed error (not panic); empty repo (unborn HEAD) → `recent_commits_core` returns empty, no panic.
  - [x] PA.1 Extend `git_diff/mod.rs`: `DiffLine { origin: LineOrigin(context|add|remove), content, old_lineno, new_lineno }`, `Hunk { header, lines }`, `FileDiff { path, status, staged, binary, hunks }`, `CommitSummary { sha, short_sha, subject, author, time, is_head }` — all Serialize, serde-lowercased enums  <!-- status: done -->
  - [x] PA.2 Pure `file_hunks_core(root, path, staged)`: `diff_index_to_workdir` (unstaged) / `diff_tree_to_index` (staged), pathspec+`show_untracked_content`; shared `diff_to_file_diffs`→`patch_to_hunks` walk (`git2::Patch`); binary = content-change with no text patch → `binary:true`, empty hunks  <!-- status: done -->
  - [x] PA.3 Pure `recent_commits_core(root, offset, limit)`: revwalk from HEAD, `Sort::TOPOLOGICAL|TIME` (deterministic newest-first vs same-second ties), skip/take pagination; `summary_bytes` lossy subject; unborn HEAD → empty vec  <!-- status: done -->
  - [x] PA.4 Pure `commit_diff_core(root, sha)`: `Oid::from_str`→commit (bad/unknown sha → `GitDiffError::BadCommit`), `diff_tree_to_tree` vs first-parent (root commit → vs None/empty tree), reuses `diff_to_file_diffs`  <!-- status: done -->
  - [x] PA.5 `commands.rs`: `git_file_hunks`/`git_recent_commits`/`git_commit_diff` wrappers + registered in `lib.rs`. `git_file_base` + `file_base_core`/helpers KEPT (marked superseded) — old DiffPanel still calls it; PB.7 deletes both together (tauri-command-removal-needs-invoke-sweep honored: removal deferred to when the caller dies)  <!-- status: done -->
  - [x] PA.6 Unit tests (+12, 72/72 total): hunks (unstaged add/remove/context + lineno, staged side, binary-flagged, untracked all-added); commit log (newest-first+is_head, pagination disjoint/contiguous, end-of-history short page, unborn-HEAD empty); commit diff (vs-parent, root-commit all-added, unknown+malformed sha → BadCommit)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; git_diff 25/25 scoped tests pass, clippy + fmt clean -->
  - [x] verify-self  <!-- status: done; runner confirmed all 6 Observable Outcomes PASS (72/72, clippy+fmt clean, hunks/commit-log/commit-diff/edge tests all green). No integration boundary — isolated new functions+commands, no caller until Phase B. -->
  - [x] verify-human  <!-- status: done; AUTO-SKIPPED per drive_mode=autopilot — no integration boundary (isolated new backend functions+commands, no frontend caller until Phase B), verify-self all-PASS. The real UI verify-human is Phase B. Operator read-time veto stands. -->
  - [x] verify-codify  <!-- status: done; 12 git_diff tests codify all Phase-A outcomes, 72/72 suite green, no regressions -->

  **Relevance check (before Phase B):**
  - Requester still needs this: yes — operator explicitly redesigned to this Sublime-Merge model + approved the spec
  - Requirements unchanged: yes — backend landed exactly to spec (hunks/commit-log/commit-diff shapes); Phase B consumes them as designed
  - Solution still feasible: yes — git2 hunk data confirmed available + tested; frontend render = plain styled lines (no new dep)
  - No superior alternative discovered: yes — git2-hunks→styled-lines + collapsible-top-commits decisions hold
  **Verdict:** proceed

- [x] Phase B: Frontend — Sublime-Merge diff viewer (collapsible commits + stacked file hunks)  <!-- status: done -->
  **Codify note:** the 13 diffModel unit tests (PB.1) codify the pure logic behind every verified interaction — collapse (`toggleCollapsed`/`isCollapsed`), view-switch (`diffViewReducer`), load-more (`hasMore`/`appendPage`), time (`relativeTime`), identity/badge (`fileKey`/`statusMeta`). Components are presentation over those. Integration boundary applies (DiffPanel backs the Workspace UI) but the consuming surface is a live Tauri-webview that vitest/cargo can't exercise (the dialog-stub path wedges); the operator verified it live at verify-human (approved). No automated consuming-surface test written — would require the broken stub harness; the live operator check is the coverage. Frontend 145/145, backend 67/67.
  **Observable outcomes:**
  - CLI: `pnpm tsc --noEmit` + `pnpm lint` + `pnpm format --check` clean; `pnpm test` green with new diff-model tests; total frontend tests > 132 (old diffModel's 13 are revised/superseded, net new ones added).
  - Browser (operator verify-human in the REAL Tauri app — stubbed-browser wedges on the dialog plugin, SURFACE-2026-06-20-…-DIALOG-STUB-WEDGE): opening this repo → Diff panel shows a collapsible **Commits** top section (recent commits, newest-first, HEAD-marked) + a **changed-files** area below where each changed file is a collapsible section (status badge + path + staged/unstaged marker) showing its hunks inline (`@@` header, context plain, **+ green / − red**).
  - Browser (verify-human): clicking a file header collapses/expands its hunks; clicking a commit in the Commits list renders that commit's per-file hunks (vs parent) in place; a **"Load more"** at the bottom of the commit list fetches+appends the next page and hides itself at history end.
  - Browser (verify-human): clean tree → "No changes"; non-git dir → inline error (not blank); binary file → "binary file" notice. No console errors on mount / toggle / commit-select / load-more.
  - [x] PB.1 `diffModel.ts` rework: new TS types (`DiffLine`/`LineOrigin`/`Hunk`/`FileDiff`/`CommitSummary`/`ChangedFile`) mirroring the Rust serde shapes; `statusMeta`/`fileKey`/`relativeTime` helpers; `diffViewReducer` (working↔commit), `toggleCollapsed`/`isCollapsed`, `appendPage`/`hasMore` pagination; old selection reducer superseded; vitest rewritten (all green)  <!-- status: done -->
  - [x] PB.2 `HunkView.tsx` (memo): renders one `Hunk` — header row + `<div>` per `DiffLine` with origin class (is-context/add/remove), old+new line-number gutters + sign; no editor  <!-- status: done -->
  - [x] PB.3 `FileDiffSection.tsx` (memo): collapsible per-file section (chevron + badge + path + staged tag header) over its `HunkView`s; takes a `HunkLoad` (idle/loading/loaded/error); binary→notice, empty-hunks→"No textual changes"; pure presentation + onToggle  <!-- status: done -->
  - [x] PB.4 `CommitList.tsx` (memo): collapsible top section; commit rows (subject/HEAD/sha/author/relative-time), selected highlight; "Load more" (hidden at end) + loading line; onSelect/onLoadMore/onToggleCollapsed callbacks  <!-- status: done -->
  - [x] PB.5 Rebuilt `DiffPanel.tsx`: CommitList (top) + files area (working-dir changed-files OR selected-commit files via `CommitFiles`); list/commits/hunkLoads as reducers (effect-dispatch pattern); lazy per-file `git_file_hunks` on expand + eager-load-on-list-arrival; commit select→`git_commit_diff`; back-to-working banner; empty/error/Refresh; no CM6 in the diff path  <!-- status: done -->
  - [x] PB.6 `App.css`: reworked `.diff-*` — `.diff-scroll` (one column), `.diff-commits`/`.diff-commit-row`/`.diff-load-more`/`.diff-commit-head`, `.diff-file-section`/`.diff-file-header` (sticky), `.diff-hunk`/`.diff-hunk-header`/`.diff-line.is-add|is-remove` + line-number gutters + sign; `.diff-commit-banner`/`.diff-back-btn`; dark-only green/red on #1e1e1e  <!-- status: done -->
  - [x] PB.7 Removed dead `git_file_base` (command + `file_base_core` + 2 blob helpers + `NotUtf8` variant + 5 tests) now that the old DiffPanel caller is gone (grep-confirmed no frontend ref) + dropped its `lib.rs` registration; the old file-list/`unifiedMergeView` DiffPanel + old selection reducer fully replaced. tsc/lint/prettier/rustfmt clean; backend 67/67 (was 72, −5 file_base tests), frontend 145/145  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; diffModel 13/13 scoped, eslint clean on all diff/ files, tsc clean -->
  - [x] verify-self  <!-- status: done-with-UNVERIFIED; the browser Observable Outcomes are UNVERIFIED — stubbed-browser verify-self is env-blocked by the Tauri dialog-plugin wedge (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE; reproduced 3× incl. a reboot, wedges the tab). Did NOT re-attempt (would re-crash the env). Integration boundary APPLIES (DiffPanel backs the Workspace right-half) → browser outcomes surfaced to verify-human, the load-bearing operator gate in the real Tauri app (the gate that rejected the first attempt). All mechanical checks green: tsc/lint/prettier/rustfmt clean, frontend 145/145, backend 67/67. -->
  - [x] verify-human  <!-- status: done; operator APPROVED ("all good") in the real Tauri app 2026-06-20 — the Sublime-Merge layout, inline +/- hunks, commit history, load-more, collapse, non-git error all confirmed. 4 additive polish items DEFERRED to a follow-up WP (operator: "can be in another WP") → SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS (collapse-all btn; sticky WD+Commits headers; open-file-in-editor badge; faint changed-line highlight = highest pri). The browser-UNVERIFIED verify-self outcomes are now operator-confirmed here. -->
  - [x] verify-codify  <!-- status: done; 13 diffModel tests codify the pure interaction logic; frontend 145/145 + backend 67/67 green, no regressions. Live UI is operator-verified (consuming surface unautomatable via the wedging stub path). -->

## Current Node
- **Path:** Feature > (all phases complete) → ship
- **Active scope:** WP4 COMPLETE — Phase A (backend) + Phase B (frontend) both shipped + verified + codified. Next = `/feature-ship`.
- **Blocked:** none
- **Open discoveries:** WP4-DIFF-VIEWER-POLISH-FOLLOWUPS (4 deferred items, backlog); WP4-COMMIT-LOG-SCOPE-EXPANSION + DIALOG-STUB-WEDGE (logged earlier)
- **Unvisited:** Phase B verify group. NOTE: Phase B's verify-human is the REAL operator UI check (the WP's load-bearing gate, the one that rejected the first attempt) — autopilot PAUSES there.
- **Open discoveries:** commit-log = WBS expansion (SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION, logged); dialog-stub verify-self wedge (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE, logged)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-20] product:wbs — commit-history view expands WP4 M→L (SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION in backlog.md).
- [SURFACED-2026-06-20] (tooling) — stubbed-browser verify-self wedges on the Tauri dialog plugin; real-app verify-human is the path (SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE in backlog.md).
