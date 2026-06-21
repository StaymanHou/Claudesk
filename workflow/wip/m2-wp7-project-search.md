---
drive_mode: autopilot
---

# Feature: WP7 — Project-wide find/replace (app-layer)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-21
**Entry:** spec (complex feature)
**Milestone:** Milestone 2 (Lite Editor + Diff Viewer)
**WBS:** `docs/product/wbs.md` → `### WP7`

## Problem Statement

The in-app editor (WP2/3) and the Cmd+P fuzzy file finder (WP6) let the operator open and edit files by *name*, but there is no way to find files by *content* — Sublime's "Find in Files" (⌘⇧F) workflow. With the in-app editor now the primary routine-editing surface, the absence of project-wide content search is a daily-parity gap: locating every call-site of a symbol, or renaming a string across the project, currently requires popping out to Sublime Text.

WP7 closes that gap with an **app-layer** subsystem (the load-bearing `research.md` correction — `@codemirror/search` is single-document only; multi-file search is a backend + overlay subsystem, NOT editor config). A backend `project_search` module does ripgrep-style content search over the workspace project dir (honoring `.gitignore`, reusing WP6's shared `ignore` walker), and a React ⌘⇧F overlay renders grouped-by-file results; clicking a result opens the file into the EditorPanel and highlights the match. Project-wide **replace** is in scope to full depth: per-result, per-file, and a confirmed replace-all-across-project.

Problem statement unchanged (F12 re-entry 2026-06-21) — the root problem (project-wide content search) holds; the verify-human failure was a narrow frontend↔backend DTO field-name drift (`lineText` vs serde `line_text`), a fix within the existing design, not a shifted root cause.

## User Stories

- As the operator, I want to press ⌘⇧F and search the whole project for a string or regex so that I can find every occurrence without leaving Claudesk for Sublime Text.
- As the operator, I want results grouped by file with line numbers and a match preview so that I can scan hits the way Sublime's Find-in-Files panel shows them.
- As the operator, I want to click a result and land on that exact line in the editor with the match highlighted so that I move from "found it" to "editing it" in one click.
- As the operator, I want to replace matches — one at a time, all in a file, or all across the project (with a confirm) — so that a project-wide rename is one operation instead of opening N files.
- As the operator, I want search to honor `.gitignore` (no `node_modules`/`target/` noise) so that results are the files I actually edit — the same set Cmd+P and the file tree show.

## Acceptance Criteria

**Search (the must-have):**
- ⌘⇧F (active-gated to the focused workspace, WP1 capture-phase pattern; coexists with CM6 focus and does not collide with ⌘P / ⌘⇧P / ⌘⇧E·D·T / ⌘F) opens a search overlay over the RightPanelHost.
- A query field supports **plain substring** and **regex** modes, plus **case-sensitive** and **whole-word** toggles.
- Results are **grouped by file** (file header + project-relative POSIX path), each match showing **line number** + the **match line text** with the matched span marked.
- Search honors `.gitignore` / `.ignore` / global gitignore and excludes `.git/` — the **same** exclusion contract as `fs_index` (proven by sharing `check_root`/`project_walker`/`rel_posix`). Binary files are skipped (no match output for non-UTF-8 content).
- An empty result set shows a clear "No matches" state; an invalid regex shows an inline error (not a silent empty list); a non-existent/unreadable root surfaces the typed error string (the WP6 IPC-error-surfacing lesson).
- Clicking a result **opens the file into the EditorPanel and scrolls to + highlights** the match's line/range via `@codemirror/search` `SearchQuery` (or an equivalent selection+scroll). The active panel switches to Editor.
- The overlay **stays usable for click-through-many-matches**: opening a result does NOT lose the result set — either the overlay remains open beside/over the editor, or ⌘⇧F re-summons with the last query + results intact. (This is the explicit mitigation for the overlay-vs-panel tradeoff: an overlay that vanished on select would make iterating over many hits awkward.)

**Replace (full depth):**
- A **Replace** field (toggleable / always-present below the query) with three apply scopes:
  1. **Per-result:** replace this single match.
  2. **Per-file:** replace all matches in one file.
  3. **Replace-all-across-project:** replace every match in every file — gated behind an explicit confirm showing the total match + file count.
- Replace writes via the existing `editor_fs::write_file` path (or a dedicated backend replace that reuses the same write discipline); write failures surface per-file, never silently swallowed.
- After a replace, results refresh (or the replaced entries are visibly marked done) so the operator sees the effect.
- Regex replace supports capture-group references (`$1`/`${1}`) when regex mode is on.

**Engineering:**
- Backend `project_search` module: a **pure-fn core** (injected `root: &Path`, `TempDir`-testable, no Tauri runtime) returning structured results (file path + per-match line number + byte/char match range + match line text), plus thin Tauri command wrapper(s) mapping a typed error to `String` — the established `command → pure-fn → typed-error → String` shape.
- Search is **in-process**: reuse WP6's `ignore` walker (`project_walker`/`check_root`/`rel_posix`) for the file set; match with the `grep`/`regex` crates. No `ripgrep` binary dependency; one shared gitignore contract with finder + tree.
- Unit tests on the search core (TempDir fixture with known matches across files: substring, regex, case-sensitivity, whole-word, .gitignore-excluded files not searched, binary-file skip, no-match, invalid-regex). Frontend tests on any pure result-grouping/highlight-mapping helpers and the ⌘⇧F chord predicate.
- Gates green: `cargo test` + `cargo clippy -- -D warnings` + `cargo fmt`; `pnpm test` (vitest) + tsc + eslint + prettier.

## Out of Scope

- **Incremental / as-you-type background indexing.** v1 re-walks on each search (lazy, like `fs_index` does for the finder) — no persistent inverted index, no file-watcher-driven live results. (A live `notify` watcher is the Phase-2 watcher milestone.)
- **Search scope filters** beyond the gitignore-honored project root (e.g. include/exclude globs, "search only open files", per-folder scoping). Whole-project only in v1; glob filtering is a backlog candidate if the operator wants it.
- **Search history / saved searches.**
- **Undo of a replace-all as a single atomic operation.** Replace writes files directly; undo is per-file via the editor (or git). A transactional multi-file undo is out of scope.
- **Multi-line / cross-line regex matching.** v1 matches per-line (ripgrep's default model). Multi-line patterns are out of scope.
- Any change to the diff viewer, file tree, finder, or editor feature set beyond the open-with-highlight seam extension this WP needs.

## Technical Constraints

- **Reuse `fs_index` walker helpers (WP6, ✅ shipped).** `check_root` / `project_walker` / `rel_posix` in `src-tauri/src/fs_index/mod.rs` are the shared exclusion contract (gitignore on, `.git/` excluded, dotfiles shown). WP7's walk MUST go through `project_walker` so search, Cmd+P, and the file tree provably agree on the project's file set. These helpers are currently private to `fs_index` — exposing them to `project_search` (pub(crate), a shared `walk` submodule, or a thin re-export) is a build decision; do NOT fork a second walker.
- **In-process engine:** add the `grep`/`regex` crates to `src-tauri/Cargo.toml` (both are pure-Rust and already transitive deps of `ignore`, so the bundle cost is near-zero). No new external binary; no new Tauri plugin; no new capability surface.
- **Open-with-highlight seam extension (architectural — flagged).** The current open seam is `openFile(path: string)` in `RightPanelHost.tsx`, threaded to `EditorPanel`'s `openPath` prop (shared by the finder, tree, and diff `onOpenInEditor`). It carries **no line/match target**. WP7 needs open-at-line-N-with-match-highlighted, so the seam must be extended to carry an **optional** target (e.g. `openFile(path, target?: { line; from; to })`) and `EditorPanel` must scroll-to + select/highlight that range on open via `@codemirror/search` `SearchQuery` (or `EditorView` dispatch with a selection + `scrollIntoView`). The extension must be **backward-compatible** — finder/tree/diff callers pass no target and behave exactly as today. This touches WP2/WP6 wiring; keep the change additive.
- **WP1 capture-phase hotkey pattern** governs ⌘⇧F so it fires while focus is inside CM6; the chord-ownership map in `paletteCommands.ts` must be updated to add ⌘⇧F and prove no collision (the existing chord-exclusivity matrix test pattern).
- **Dark-only UI.** Overlay + results styling use the existing dark tokens (`src/App.css`); no light variant (project is dark-mode-only).
- **No 3rd-party service / external API.** In-process Rust crates only — no probe required (the 3rd-party-probe check is N/A).

## Build-time decisions (settled at spec)

1. **Replace depth = FULL** — per-result + per-file + confirmed replace-all-across-project. (Operator-chosen 2026-06-21.)
2. **Results placement = ⌘⇧F overlay** (transient, like the Cmd+P finder) — NOT a new RightPanelHost tab. With the click-through-many-matches mitigation above so the overlay isn't lossy. (Operator-chosen 2026-06-21.)
3. **Search engine = in-process** (`ignore` walker + `grep`/`regex` crates) — not shelling to `rg`. Chosen for: no user-install burden, one shared gitignore contract with finder/tree, pure-fn testability, shared walk+match data with replace-all, and identical real-world perf on single-project trees (rg *is* grep+regex underneath). (Operator-chosen 2026-06-21 after weighing the tradeoff.)

## Open Questions

- [ ] None blocking. The remaining choices are plan/build-time mechanics, not unknowns: (a) how to expose `fs_index`'s walker helpers to `project_search` (pub(crate) vs a shared `walk` submodule); (b) whether replace is one combined `project_search`+`project_replace` command pair or replace reuses `editor_fs::write_file` from the frontend; (c) the exact `EditorView` dispatch for scroll-to-highlight. All are settled in `feature-plan`.

## Work Tree

- [x] Phase 1: Backend `project_search` core + command (search-only)  <!-- status: done — all impl + 4 verify nodes complete; 107 Rust tests green -->
  **Observable outcomes:**
  - CLI: `cargo test project_search` exits 0 — the pure-fn core finds known matches in a `TempDir` fixture across multiple files (substring + regex + case-sensitive + whole-word), returns per-match `{file, line, col/range, line_text}`, skips `.gitignore`-excluded files, skips binary/non-UTF-8 files, returns empty for no-match, and returns a typed error for invalid-regex and for a bad root.
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` exit 0 for the new module.
  - CLI: the new `project_search` command is registered in `tauri::generate_handler!` (grep `src-tauri/src/lib.rs` shows `project_search::commands::project_search`).
  - CLI: the shared walker contract is provably reused — `project_search` walks via `fs_index`'s `project_walker`/`check_root`/`rel_posix` (now exposed `pub(crate)` or via a shared `walk` submodule), NOT a forked walker (grep shows no second `WalkBuilder::new`).
  - [x] P1.1 Expose `fs_index`'s `check_root` / `project_walker` / `rel_posix` to sibling modules — `pub(crate)` (or extract a shared `crate::fs_walk` submodule). No behavior change to `fs_index`; its tests stay green.  <!-- status: done — marked pub(crate) with reuse-rationale doc comments; fs_index tests still green -->
  - [x] P1.2 Add `grep` (`grep-matcher`/`grep-searcher`/`grep-regex`) + ensure `regex` available in `src-tauri/Cargo.toml`; pin versions, `cargo build` clean.  <!-- status: done — chose `regex = "1"` directly (line-oriented core, simpler+testable) over the grep-searcher sink API; rationale in Cargo.toml -->
  - [x] P1.3 `project_search` module: pure-fn core `search_core(root, query: SearchQuery)` → `Result<Vec<FileMatches>, ProjectSearchError>` where `SearchQuery{ pattern, regex: bool, case_sensitive: bool, whole_word: bool }` and results carry `{file (rel POSIX), matches: Vec<{line, start, end, line_text}>}`. Walk via the shared walker; match per-line with `grep`/`regex`; skip non-UTF-8/binary; map invalid-regex + bad-root to typed `ProjectSearchError`.  <!-- status: done -->
  - [x] P1.4 Thin Tauri command wrapper `project_search(root, query)` mapping `ProjectSearchError` → `String`; register in `lib.rs` `generate_handler!`.  <!-- status: done — query passed as a single SearchQuery object (cleaner than 4 positional args) -->
  - [x] P1.5 Unit tests on the core (TempDir fixture: substring, regex, case-sensitivity, whole-word, gitignore-excluded-not-searched, binary-skip, no-match, invalid-regex error, bad-root error).  <!-- status: done — 15 tests, all pass -->
  - [x] verify-auto  <!-- status: done — 15/15 project_search tests pass; clippy --lib clean -->
  - [x] verify-self  <!-- status: done — subagent verified all 4 CLI outcomes PASS (15 tests, clippy/fmt clean, command registered, shared walker provably reused). No integration boundary (isolated new artifacts). -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) — drive_mode=autopilot, no integration boundary, verify-self all-PASS; affirmation printed for read-time veto -->
  - [x] verify-codify  <!-- status: done — behavior codified TDD-style in build (15 tests); codify added 2 error-Display contract tests (the commands.rs error→String seam, WP6 IPC-error lesson). Full Rust suite 107 pass; clippy/fmt clean. No integration boundary. -->

  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP7 search is unchanged operator must-have; Phase 1 backend is the foundation for the Phase 2 overlay.
  - Requirements unchanged: yes — three build-time decisions (full replace / overlay / in-process) settled at spec, untouched.
  - Solution still feasible: yes — backend core works (107 tests green); the open-with-highlight seam extension is the next planned step, no new blocker surfaced.
  - No superior alternative discovered: yes — in-process engine validated (regex crate works cleanly; shared walker reused).
  **Verdict:** proceed

- [ ] Phase 2: ⌘⇧F search overlay + open-with-highlight seam  <!-- status: BLOCKED: depends on the new editor multi-file tab-strip WP (SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP). Backend + overlay + highlight seam BUILT & WORKING; the UX is being redefined from overlay → Sublime "Find Results" tab, which requires the tab strip first. PAUSED mid-Phase-2 per operator (F26 escalation 2026-06-21). -->
  <!-- PAUSE NOTE (2026-06-21, F26): operator confirmed search WORKS (backend finds matches, highlight-on-open functions) but wants the Sublime "Find Results" model — results in a temp result TAB in the editor you click through — instead of the floating overlay. That UX depends on an editor multi-file tab strip (open-file tabs like `wbs.md | roadmap.md | Find Results`) that DOES NOT EXIST and is NOT in the WBS (today's editor opens one file; WP3c panes are viewports onto the SAME file). Surfaced as SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP (high). REUSABLE forward (no waste): the whole Phase-1 backend (project_search), searchModel (incl. byte→char), the ⌘⇧F chord, and the open-at-match highlight seam (EditorPanel scroll+select). CHANGES on resume: P2.4/P2.5 (the overlay result list) get redefined to render into a Find Results tab; the small query input may stay as an overlay (operator: "keep small input overlay → results to buffer"). -->
  **Observable outcomes:**
  - Browser: in the dev seed harness (`?ws=<dir>`), pressing ⌘⇧F opens a search overlay; typing a known string + Enter shows results grouped by file (file header + path, each row = line number + match line text with the matched span marked); Playwright snapshot contains the grouped result rows.
  - Browser: clicking a result row opens that file into the EditorPanel, switches the active panel to Editor, scrolls to the match line, and selects/highlights the match range (snapshot: editor shows the file; the target line is in view + selected).
  - Browser: the overlay is NOT lossy on select — after opening a result, re-pressing ⌘⇧F re-summons the overlay with the last query + results intact (snapshot shows the prior results), so click-through-many-matches works.
  - Browser: an invalid regex shows an inline error in the overlay (not an empty list); a no-match query shows a "No matches" state; a backend error surfaces the IPC string inline. No JS console errors.
  - CLI: `pnpm test` exits 0 — pure helpers tested: the ⌘⇧F chord predicate (exclusive vs ⌘P / ⌘⇧P / ⌘⇧E·D·T / ⌘F), result-grouping/coalescing helper, and the match→selection-range mapping helper.
  - CLI: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --check` exit 0.
  - [x] P2.1 Pure `searchChord.ts` (`isSearchChord`: ⌘⇧F, Shift REQUIRED, exclusive vs the existing chords) + update the chord-ownership map + exclusivity matrix in `paletteCommands.ts` (+ its test) to add ⌘⇧F.  <!-- status: done — searchChord.ts + paletteCommands chord-map updated; 9-case exclusivity test (vs ⌘F/⌘P/⌘⇧P/⌘⇧E·D·T) -->
  - [x] P2.2 Extend the open seam: `RightPanelHost.openFile(path, target?)`; thread an optional `highlightTarget` to `EditorPanel`'s props. Backward-compatible — finder/tree/diff callers pass no target and behave exactly as today.  <!-- status: done — openFile(path, target=null); highlightTarget threaded; plain opens clear prior highlight -->
  - [x] P2.3 `EditorPanel`: capture the active pane's `EditorView` (via `@uiw/react-codemirror` `onCreateEditor`); on a new `highlightTarget` (after the file loads), dispatch a selection at `{from,to}` + `scrollIntoView`. Clears on next plain open.  <!-- status: done — viewsRef Map per pane; effect converts 1-based line+char-cols → abs doc pos, dispatches EditorSelection.range + scrollIntoView(center) + focus; clamps line/col defensively; view cleaned on pane close -->
  - [x] P2.4 `ProjectSearch` overlay component (Cmd+P-style chrome, dark tokens): query field + regex/case/whole-word toggles; calls `invoke("project_search", …)`; renders grouped-by-file results; keyboard nav (↓/↑/Enter/Esc); open-on-click/Enter → `openFile(path, target)`. Registered via the WP1 capture-phase document listener in `RightPanelHost`, active-gated.  <!-- status: done — explicit-submit search (not as-you-type, heavier op); grouped render with byte→char-converted highlight marks; flat-index nav; +CSS in App.css -->
  - [x] P2.5 Overlay persistence: keep the last query + result set in `RightPanelHost` state (not overlay-local) so re-opening ⌘⇧F restores them; opening a result does not clear results.  <!-- status: done — query/results/error lifted to RightPanelHost props; overlay stays open on result-open (Esc/backdrop closes) -->
  - [x] P2.6 Frontend unit tests (chord predicate, grouping helper, match→range mapper) + inline error/no-match/IPC-error states.  <!-- status: done — 9 searchChord + 10 searchModel (incl. byte→char conversion for é/→/emoji) = 19; overlay error/no-match/hint states are rendered+testid'd for verify-self -->
  - [x] verify-auto  <!-- status: done (re-run after F12 fix) — 21 search tests pass (incl. 2 IPC wire-shape regression tests); eslint clean; tsc clean -->

  - [x] verify-self  <!-- status: done (re-run after F12 fix) — subagent in plain-Vite browser confirmed the previously-crashing path now renders the inline error row cleanly: NO white-screen, NO lineText/line_text TypeError, overlay stays mounted, 0 uncaught console errors. Overlay mechanics (⌘⇧F open, toggles, hint, Escape) all PASS. Results-render+highlight still UNVERIFIED (needs native backend) → verify-human. 0 BLOCKING. -->
  - [~] verify-human  <!-- status: PAUSED — functional re-test PASSED (the line_text fix works: search finds matches + renders, no crash), but the operator redirected the UX (overlay → Sublime "Find Results" tab) which blocks Phase 2 on the new tab-strip WP. NOT a rejection of the fix; a scope/UX redirect. F26 escalation. -->
    - [x] P2.verify-human.1 (fix re-test) the line_text crash is fixed — search runs, results render, no white-screen. <!-- status: done — operator confirmed "the search box works" in the native app post-fix -->
    - [ ] P2.verify-human.2 Sublime "Find Results" tab UX — DEFERRED to WP7 resume after the tab-strip WP lands (SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP). <!-- status: BLOCKED: depends on editor multi-file tab strip -->
  - [ ] verify-codify  <!-- status: NOT-STARTED (Phase 2 paused) -->

- [ ] Phase 3: Replace — per-result / per-file / project-wide replace-all  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - Browser: the overlay shows a Replace field; entering a replacement enables three apply affordances — per-result "replace this match", per-file "replace all in file", and a project-wide "Replace all" button.
  - Browser: per-result and per-file replace rewrite the affected file(s) and the results refresh (replaced entries marked done / removed); Playwright drives a replace against a seeded fixture and a follow-up search confirms the match is gone.
  - Browser: "Replace all across project" is gated behind an explicit confirm showing the total match + file count; confirming rewrites all files; cancelling makes no change. A per-file write failure surfaces inline (not silently swallowed).
  - Browser: with regex mode on, `$1`/`${1}` capture-group references work in the replacement (snapshot/assertion on a capture-group replace fixture).
  - CLI: `cargo test` (replace core: per-file rewrite, regex capture-group substitution, write-error path, count summary) + `pnpm test` exit 0; all gates (clippy/fmt/tsc/lint/prettier) clean.
  - [ ] P3.1 Backend replace core + command: `project_replace(root, query, replacement, scope)` reusing `search_core`'s walk+match data; per-file rewrite via the `editor_fs::write_file` write discipline; regex capture-group substitution when regex mode is on; return a `{files_changed, matches_replaced}` summary; per-file write errors surfaced. Pure-fn core, TempDir-testable. (Decide at build: one combined command vs reuse-`write_file`-from-frontend — spec Open Question (b).)  <!-- status: NOT-STARTED -->
  - [ ] P3.2 Overlay Replace UI: Replace field + the three apply scopes; project-wide replace-all behind a confirm dialog showing match/file counts; post-replace results refresh; inline per-file error rows.  <!-- status: NOT-STARTED -->
  - [ ] P3.3 If an open file is replaced, the EditorPanel reflects the new content (re-read on the open path) so the editor and disk don't diverge.  <!-- status: NOT-STARTED -->
  - [ ] P3.4 Unit tests: replace core (per-file, capture-group, write-error, count summary) + any pure frontend scope/confirm helper.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 2 > PAUSED (F26 architectural escalation, 2026-06-21)
- **Active scope:** none — WP7 is PAUSED. Phase 1 (backend) COMPLETE + shipped-quality. Phase 2 (overlay) BUILT, the line_text crash FIXED + re-verified, and the operator confirmed search works — but the operator redirected the result UX from the floating overlay to the Sublime "Find Results" TAB model, which depends on an editor multi-file tab strip that doesn't exist.
- **Blocked:** Phase 2 + Phase 3 BLOCKED on SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP (new high-pri WP, not yet decomposed). Operator decision (2026-06-21): build the tab strip first (its own spec→build cycle), then resume WP7 to redefine Phase 2 (overlay → Find Results tab).
- **Resume plan:** after the tab-strip WP ships → resume WP7 Phase 2: keep the small ⌘⇧F query input as an overlay, render RESULTS into a Find Results tab (redefine P2.4/P2.5), click-a-result → open file at match in the editor (the highlight seam already works), keep results tab persistent. Then Phase 3 (replace) layers on. REUSABLE NOW (no rework): project_search backend, searchModel (byte→char), searchChord, the open-at-match EditorPanel highlight effect.
- **Next session:** decompose SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP via /product-wbs (or /feature-spec if treating it as a standalone feature), build it, then resume this WIP.
- **Blocked:** none
- **Unvisited:** Phase 2 verify-self → verify-human → verify-codify; Phase 3 (replace: per-result / per-file / project-wide)
- **Open discoveries:** none
- **Phase 1 build notes:** Two as-built deltas, both improvements: (1) used `regex = "1"` directly rather than the `grep-searcher` sink API; (2) the Tauri command takes a single `SearchQuery` object instead of 4 positional args. Fixture gotcha: the `ignore` crate applies `.gitignore` only inside a git repo, so the test fixture creates a `.git/` dir (mirrors `fs_index`).
- **Phase 2 build notes:** (1) Naming gotcha: the helper module was renamed `projectSearch.ts` → `searchModel.ts` because it collided (case-insensitive macOS FS) with the `ProjectSearch.tsx` component — tsc flagged it. (2) Search is explicit-submit (Enter / Search button), NOT as-you-type — project-wide content search is heavier than the in-memory fuzzy finder. (3) `byteOffsetToCharIndex` (TextEncoder) bridges the backend's `regex`-crate BYTE match offsets to CM6's UTF-16 positions, so highlight is exact for multi-byte lines (é/→/emoji), no-op for ASCII. (4) The open-with-highlight seam is additive: `openFile(path, target=null)` — finder/tree/diff pass nothing and behave as before. Gates: vitest 225 (206+19), tsc/eslint/prettier clean.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-21] feature-spec — arch.md exceeds size guard (352 lines); read first 100 lines + `^#+ ` headings only per the GLOBAL entry-skill product-context size guard.
