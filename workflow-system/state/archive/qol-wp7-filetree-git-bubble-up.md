# Feature: QoL-WP7 — FileTree git-indicator bubble-up to parents

**Workflow:** feature
**State:** Completed 2026-06-25 — commit 4d384b1
**Created:** 2026-06-25
**Drive mode:** autopilot
**Backlog:** SURFACE-2026-06-24-FILETREE-GIT-INDICATOR-BUBBLE-UP-TO-PARENTS

## Problem Statement
The FileTree rail's git-status indicators (M2 WP11 — the Sublime-sidebar M/A/U/D/R glyphs next to file rows) only decorate **leaf file rows**. A collapsed folder hiding a modified file shows nothing, so the user can't spot which directories contain changes without expanding them. WP7 bubbles those statuses up: each folder row shows a roll-up marker derived from its descendants' statuses. Frontend-only — the backend `git_file_statuses` map already carries every changed path; this is a pure aggregation + a folder-row render, recomputed on the same `gitStatusRefreshKey` save/load triggers that drive the leaf indicators.

## Design decisions (made at plan time, per the WBS design calls)
- **(1) Precedence / merge rule** — a folder folds its descendant statuses into a SINGLE dominant status (VS Code / Sublime convention: one dominant color, not a pile of glyphs). Precedence, most-attention-grabbing first: **`deleted` > `modified` ≈ `renamed` > `added` > `untracked`**. (`renamed` is treated like `modified` — it already shares the amber token in App.css.) The dominant status drives the same glyph + color token the leaf rows use, so a folder row reads with the identical visual vocabulary.
- **(2) Show on collapsed-only vs always** — **ALWAYS** (collapsed AND expanded). Matches VS Code (the folder keeps its roll-up even when open). Avoids a flicker on toggle and keeps the "this subtree has changes" cue when scrolled past the children. Leaf rows keep their own per-file indicators unchanged — a folder's roll-up does not replace them.
- **Key space** — the roll-up map is built in the SAME key space as the existing leaf lookup (`gitStatus[node.path]`, where `node.path` is the workspace-relative `fs_tree` path matched against the `git_file_statuses` keys). This inherits the known, accepted WP11 path-keying behavior (workspace == repo root in the operator's daily case); WP7 does NOT change or "fix" that keying — staying consistent is the requirement. No new backend command.

## Work Tree

- [x] Phase 1: Pure roll-up derivation (`gitRollup.ts` + precedence + dir→status map)  <!-- status: done -->
  <!-- No integration boundary — phase adds isolated new artifacts only (gitRollup.ts imported by nothing until Phase 2). Codify-grade coverage already present from build: gitRollup.test.ts 11 tests. Full suite 573 pass, no regressions. -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/filetree/__tests__/gitRollup.test.ts` exits 0 — the new pure module's unit tests pass.
  - CLI: `pnpm tsc --noEmit` exits 0 — the new module + its exports typecheck.
  - CLI: a test asserts the precedence rule: a folder with a mix of {modified, untracked} folds to `modified`; {deleted, modified} folds to `deleted`; {added, untracked} folds to `added`; a folder with no changed descendants → `undefined` (no roll-up).
  - CLI: a test asserts prefix-correctness: `dominantStatusByDir` keys a status under `src` for `src/a.ts` but NOT for a sibling `src-utils/a.ts` (prefix match on `dir + "/"`, not bare `startsWith(dir)`).
  - [x] P1.1 Add `rollupPrecedence` (ordered) + `dominantStatus(statuses)` pure fold to a new `src/components/workspace/filetree/gitRollup.ts` (no React/DOM, mirrors `gitStatus.ts` posture).  <!-- status: done -->
  - [x] P1.2 Add `dominantStatusByDir(gitStatus: GitStatusMap): Record<dir, GitFileStatus>` — for every changed path, walk its ancestor dir chain and fold each ancestor toward the dominant status (bottom-up accumulation; O(paths × depth), no full-tree walk needed since the status map only holds changed paths).  <!-- status: done -->
  - [x] P1.3 Write `gitRollup.test.ts` — precedence table (all pairs/triples), prefix-correctness (`src` vs `src-utils`), empty map → empty result, nested ancestors all get the dominant status, clean folder → undefined.  <!-- status: done; 11/11 pass -->
  - [x] verify-auto  <!-- status: done; eslint clean, tsc clean, 11/11 unit -->
  - [x] verify-self  <!-- status: done; no integration boundary (isolated new module). CLI outcomes re-confirmed: 11/11 unit, tsc 0. No live surface to drive. -->
  - [x] verify-human  <!-- status: done; AUTO-SKIP (drive_mode=autopilot, no boundary, verify-self all-PASS) — isolated pure module -->
  - [x] verify-codify  <!-- status: done; coverage already present (11 unit), full suite 573 pass, no new tests needed -->

- [x] Phase 2: Render the roll-up on folder rows in FileTree  <!-- status: done -->
  <!-- Integration boundary (FileTree.tsx UI). Static slice agent-verified (tsc/eslint/vite build/6 wiring); live render operator-verified (all 6 verify-human leaves PASS). Codify-grade coverage present. Full suite 579 pass. -->
  **Observable outcomes:**
  - Browser (verify-human, live `.app`): in a workspace whose repo has a changed file inside a COLLAPSED folder, that folder row shows the dominant-status glyph + color (e.g. an amber `M` on `src/` when `src/foo.ts` is modified) without expanding it.
  - Browser (verify-human): expanding that folder keeps the folder's roll-up glyph visible AND each changed leaf shows its own per-file indicator (roll-up does not suppress leaf indicators).
  - Browser (verify-human): a folder with NO changed descendants shows no glyph. The dominant status reflects precedence (a folder with both a deleted and a modified descendant shows `D`).
  - Browser (verify-human): saving a file (which bumps `gitStatusRefreshKey`) updates the affected ancestor folders' roll-up markers without a manual refresh.
  - CLI: `pnpm tsc --noEmit` && `pnpm eslint .` && `pnpm vite build` all exit 0 (the change compiles + wires; no broken imports/JSX across FileTree).
  - Console: no JS errors rendering the tree.
  - [x] P2.1 In `FileTree.tsx`, compute `rollupByDir = useMemo(() => dominantStatusByDir(gitStatus), [gitStatus])`; thread it into `TreeRow` (a `rollupByDir` prop alongside the existing `gitStatus`).  <!-- status: done -->
  - [x] P2.2 In the dir branch of `TreeRow`, look up `rollupByDir[node.path]`, derive `statusGlyph`/`statusClass`, render the `.file-tree-status .file-tree-dir-status` span (reuses the file-branch element + tokens; `data-testid="file-tree-dir-status"`). Placed after the name, before the hover ＋/⊞/✕ buttons; always-visible.  <!-- status: done -->
  - [x] P2.3 Added `.file-tree-dir-status { margin-left: auto }` in App.css so the always-visible glyph pins right ahead of the hover buttons; reuses existing color tokens (no new tokens). Stale leaf-row "no dir roll-up in v1" comment corrected.  <!-- status: done -->
  - [x] P2.+ Added `fileTreeGitRollup.test.ts` (`?raw` wiring assertions, 6 tests) pinning the FileTree↔gitRollup integration (import, memo-off-gitStatus, thread-into-TreeRow, lookup-by-node.path, glyph/class derivation, gated dir-status element).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; eslint clean, tsc clean, vite build 0, 6/6 wiring tests -->
  - [x] verify-self  <!-- status: done; INTEGRATION BOUNDARY (FileTree.tsx UI). Per project verify-self-tier corollary: FileTree git-status render needs the real Tauri backend (fs_tree + git_file_statuses IPC), unobservable in a bare Vite browser, and no dev URL in-session. Statically-verifiable slice PASS: tsc 0, eslint clean, vite build 0, 6/6 ?raw wiring trace. Live Browser/Console outcomes CARRIED to verify-human (operator drives the real .app). -->
  - [x] verify-human  <!-- status: done; all 6 leaves PASS (operator-verified live 2026-06-25) -->
    - [x] P2.verify-human.1 Collapsed folder containing a changed file shows the dominant-status glyph + color  <!-- status: done -->
    - [x] P2.verify-human.2 Expanding that folder keeps the roll-up glyph AND each changed leaf keeps its own indicator  <!-- status: done -->
    - [x] P2.verify-human.3 A folder with no changed descendants shows no glyph  <!-- status: done -->
    - [x] P2.verify-human.4 Precedence: a folder with both a deleted and a modified descendant shows D (red)  <!-- status: done -->
    - [x] P2.verify-human.5 Saving a file updates the affected ancestor folders' roll-up markers without a manual refresh  <!-- status: done -->
    - [x] P2.verify-human.6 No JS console errors rendering the tree; glyph sits cleanly alongside the hover ＋/⊞/✕ buttons  <!-- status: done -->
  - [x] verify-codify  <!-- status: done; integration boundary covered by fileTreeGitRollup.test.ts (6 ?raw wiring) + gitRollup.test.ts (11 derivation), already written at build. Full suite 579 pass, no regressions. -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize next
- **Active scope:** Shipped (4d384b1). Review-quality: 0C/0M/3MINOR auto-backlogged (low). Ready for finalize.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Retrospect
- **What changed in our understanding:** Nothing material — the M2 WP11 design (backend `git_file_statuses` map keyed in the same space `FileTree` looks up with `node.path`) made this a pure frontend derivation exactly as the WBS predicted. The one concrete thing confirmed during build: a folder roll-up MUST reuse the leaf lookup's key space, else a folder's marker could disagree with the rows inside it.
- **Assumptions that held:** No new backend needed; the `useMemo` off `gitStatus` rides the existing `gitStatusRefreshKey` seam for free; the `.file-tree-status` element + color tokens drop straight onto dir rows.
- **Assumptions that were wrong:** None. The only sour note was cosmetic — the added `.file-tree-dir-status { margin-left:auto }` CSS turned out redundant (the element already inherits it via `.file-tree-status`, and `.file-tree-name`'s `flex:1` does the right-push). Caught by review-quality as a MINOR, auto-backlogged.
- **Approach delta:** Implementation matched the plan exactly — 2 phases (pure module → render wiring), no back-loops, no surprises. The two plan-time design calls (precedence; show-always) held through verify-human unchanged.

## Code-Quality Review — qol-wp7-filetree-git-bubble-up

Reviewer verdict (ship commit `4d384b1`): well-built, appropriately-scoped, no debt accrued. **0 CRITICAL / 0 MAJOR / 3 MINOR.** All 3 MINOR auto-backlogged (low) per drive_mode=autopilot → `workflow/backlog-quality-findings.md` # qol-wp7-filetree-git-bubble-up — 2026-06-25.

### Strengths
- Clean pure-logic / rendering separation (`gitRollup.ts` matches the `gitStatus.ts`/`buildTree.ts` posture); reuses the existing `git_file_statuses` key space + `statusGlyph`/`statusClass` + color tokens so a folder's marker can't drift from the files inside it.
- `dominantStatus` centralizes precedence in one place, reused by `dominantStatusByDir`'s fold.
- Tests pin the two tricky edges (prefix vs `startsWith`: `src` ≠ `src-utils`; root-file → empty) and the consumption contract (`?raw` wiring), not just the happy path.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [src/App.css ~1577] `.file-tree-dir-status { margin-left: auto }` re-declares a property the element already inherits from its `file-tree-status` class; `.file-tree-name`'s `flex:1` is what actually pushes the glyph right. Dead rule + a comment that misattributes the layout mechanism.
- [gitRollup.ts ~78] `dominantStatusByDir` uses `for...in` over `gitStatus` without a `hasOwnProperty` guard. Safe for a serde-serialized record, but `Object.keys(...)` would remove the latent proto-key footgun at zero cost.
- [gitRollup.ts ~79] the `consider` closure allocates a 1–2-element array per ancestor to reuse `dominantStatus`; a direct precedence-index compare would avoid it, but the current form favors single-source-of-precedence clarity (defensible trade).

### Assessment
Well-built, right architecture for this repo: a pure tested derivation bolted onto an existing key space + render helpers, no new backend, no new visual vocabulary. The `useMemo` keyed on the same `gitStatus` source guarantees the roll-up can't go stale vs the leaf indicators. Only findings are a dead CSS rule + two micro-hygiene nits — none warrant a refactor pass; backlog-or-dismiss.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
