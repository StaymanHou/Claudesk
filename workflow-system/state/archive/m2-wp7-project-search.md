---
drive_mode: autopilot
---

# Feature: WP7 — Project-wide find/replace (app-layer)

**Workflow:** feature
**State:** finalize (complete) — commit `8a788bf` on `main` (local, unpushed; no remote). All 3 phases shipped; review-quality 0C/2M/2m auto-backlogged; archived.
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

- [x] Phase 2: ⌘⇧F query overlay + results in a WP12 "Find Results" tab  <!-- status: done — REDEFINED 2026-06-21 (F23 re-plan after the F26 UX redirect); WP12 shipped → UNBLOCKED. All impl + 4 verify nodes complete (verify-human 7/7 incl. an F12 fix for font-size+highlight). The open-at-match highlight seam (P2.1/P2.2/P2.3) reused as-is; the floating-overlay result LIST replaced by the Find Results tab. -->
  <!-- RE-PLAN NOTE (2026-06-21, F23): At Phase-2 verify-human the operator redirected the result UX from a floating overlay result-list to the Sublime "Find Results" model — results render into a read-only TAB in the editor you click through. That tab is now provided by WP12 (SHIPPED, commit f2c86d7): the EditorSplit synthetic-tab seam `addSynthetic(id, label, onLineClick)` + `setSyntheticContent(id, text)` + the `SyntheticView` click-line→callback (1-based buffer line). Operator decisions (2026-06-21): (a) results render as a Sublime-style TEXT BUFFER (file-path header lines + `   <line>:  <match text>` rows); (b) the ⌘⇧F overlay shrinks to QUERY-INPUT-ONLY (field + regex/case/whole-word toggles + Search button) — no result list in the overlay. REUSED AS-IS (no rework): the Phase-1 backend `project_search` (17 tests), `searchModel.ts` (`FileMatches`/`LineMatch`/`matchTargetFor`/`byteOffsetToCharIndex`/`totalMatchCount`), `searchChord.ts` (⌘⇧F), and the EditorPanel open-at-match highlight effect (old P2.3). SUPERSEDED: the `ProjectSearch` overlay's grouped result list + flat-row keyboard nav + lifted `searchResults` state — replaced by the formatter + the tab. -->
  **Observable outcomes:**
  - Browser: in the dev seed harness (`?ws=<dir>` + `window.__editorSynthetic`/native backend), pressing ⌘⇧F opens a SMALL query overlay (input + regex/case/whole-word toggles + Search button) — NO result list in the overlay (Playwright snapshot: the overlay has the input + 3 toggles + button, and contains no `project-search-match` rows).
  - Browser: typing a known string + Enter (or Search) opens/activates a read-only "Find Results" tab in the editor whose buffer text is the Sublime-style layout — a `Searching … for "<pattern>"` header, then per file a `<rel/posix/path>:` header line followed by `   <line>:  <match line text>` rows, then a `N matches across M files` footer (snapshot: the editor's active tab label is "Find Results" and the synthetic buffer contains the path header + the numbered match rows).
  - Browser: clicking a MATCH row in the Find Results tab opens that file into the editor (a real file tab), switches focus to it, scrolls to the match line, and selects/highlights the match range (snapshot: the file's tab is active; the target line is in view + selected). Clicking a non-match line (header/footer/blank) is a no-op.
  - Browser: re-running a search REPLACES the Find Results tab's content in place (does not spawn a second Find Results tab); the tab persists across opening a result file (click-through-many-matches — the tab is still there to return to). Re-pressing ⌘⇧F re-opens the query overlay with the last query intact.
  - Browser: an invalid regex shows an inline error in the QUERY OVERLAY (not a crash, not an empty tab); a no-match query writes a clear "No matches" body into the Find Results tab; a backend error surfaces the IPC string in the overlay. No JS console errors.
  - CLI: `pnpm test` exits 0 — pure helpers tested: the ⌘⇧F chord predicate (still green), and the NEW `formatFindResults(results, query)` → `{ text, lineMap }` formatter (buffer text layout + the buffer-line→{file,match} map; header/footer/blank lines map to null; multi-file + no-match cases).
  - CLI: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --check` exit 0.
  - [x] P2.1 Pure `searchChord.ts` (`isSearchChord`: ⌘⇧F, Shift REQUIRED, exclusive vs the existing chords) + chord-ownership map + exclusivity matrix in `paletteCommands.ts`.  <!-- status: done (REUSED AS-IS) — searchChord.ts + paletteCommands chord-map; 9-case exclusivity test -->
  - [x] P2.2 Open seam extended: `RightPanelHost.openFile(path, target?)` threads an optional `highlightTarget` to the editor. Backward-compatible (finder/tree/diff pass no target).  <!-- status: done (REUSED AS-IS) — openFile(path, target=null); highlightTarget threaded; plain opens clear prior highlight -->
  - [x] P2.3 `EditorPanel` open-at-match highlight: on a new `highlightTarget` (after load) dispatch a selection at the byte→char-converted range + scrollIntoView; clears on next plain open.  <!-- status: done (REUSED AS-IS) — viewsRef per pane; clamps line/col; the Find Results click drives this same path via openFile(path, matchTargetFor(match)) -->
  - [x] P2.4 NEW pure `findResultsBuffer.ts` — `formatFindResults(results: FileMatches[], query: SearchQuery) → { text: string; lineMap: (FlatMatch | null)[] }` where `lineMap[bufferLine-1]` is the `{ file, match }` for a match row or `null` for a header/footer/blank line. Sublime-style layout (header `Searching … for "<pattern>"`, per-file `<path>:` header + `   <line>:  <line_text>` rows, blank between files, `N matches across M files` footer). Pure → vitest.  <!-- status: done — formatFindResults + FlatMatch/FindResultsBuffer types; 4 tests (single/multi-file layout, lineMap match-rows→{file,match} + non-rows→null, empty→"No matches") -->
  - **P2.4 build note:** `plural()` is a 2-noun helper (file→files, match→matches) — not a general pluralizer (avoids "matchs"). Header echoes the pattern; empty results still render a valid header + "No matches" buffer (the tab never goes blank).
  - [x] P2.5 Shrink `ProjectSearch` to QUERY-INPUT-ONLY: keep the input + regex/case/whole-word toggles + Search button + the inline error/searching states; REMOVE the grouped result list, the flat-row keyboard nav, and the results-in-overlay render. On submit it calls `invoke("project_search")` and hands the results to a callback (RightPanelHost) instead of rendering them.  <!-- status: done — ProjectSearch now props {projectPath, query, onQueryChange, error, onError, onResults(results,query), onClose}; dropped flatten/FlatRow/groupStarts/activeIndex/openRow + the result <ul>; Enter submits (no arrow-nav); error row kept inline. +CSS: `.project-search-query-only` (max-height:none), removed dead result-list rules. -->
  - [x] P2.6 Wire the Find Results tab in `RightPanelHost`: on search results, `editorSplitRef.current.addSynthetic("find-results", "Find Results", onLineClick)` + `setSyntheticContent("find-results", formatFindResults(...).text)`; the `onLineClick(bufferLine)` looks up `lineMap[bufferLine-1]` and, if a match, calls `openFile(file, matchTargetFor(match))`. Re-search replaces the content of the same `"find-results"` id (no duplicate tab). Drop the lifted `searchResults`/overlay-persistence state that the overlay no longer renders.  <!-- status: done — handleSearchResults: formatFindResults → setSyntheticContent; addSynthetic called ONCE (findResultsAdded ref guard) with a click cb reading findResultsLineMap.current[line-1] (ref, not state, so re-search updates the map without re-registering); flips panel to editor + closes overlay; dropped searchResults state. -->
  - [x] P2.7 Frontend unit tests: keep the `searchChord` exclusivity test; ADD `formatFindResults` tests (layout + lineMap: single file, multi-file, no-match, header/footer→null, a match row→{file,match}); update/remove the superseded `ProjectSearch` overlay-result-list tests.  <!-- status: done — searchChord (9) + searchModel (12) + findResultsBuffer (4 NEW) = 25 search tests green. No `ProjectSearch` component test existed to remove (repo posture: pure-helper tests only; the overlay was verify-self/human-covered) — the result-list logic that WAS testable now lives in findResultsBuffer + is covered. -->
  - [x] verify-auto  <!-- status: done — scoped: vitest search dir 25 pass (searchChord 9 + searchModel 12 + findResultsBuffer 4); tsc clean; eslint on search/ + RightPanelHost clean. -->
  - [x] verify-self  <!-- status: done — subagent (plain Vite + ?ws= seed + window.__editorSynthetic hook): 5/5 verifiable outcomes PASS, 0 BLOCKING, no white-screen, no app console errors. CONFIRMED: ⌘⇧F opens query-input-ONLY overlay (no result list); the "Find Results" synthetic tab renders the Sublime-style buffer; click-line→callback records the 1-based line; synthetic tab de-dupes by id (no duplicate tab on re-add); Escape closes; an IPC failure surfaces inline (project-search-error) with NO crash. UNVERIFIED (needs native backend → verify-human): real project_search results→tab render, openFile-at-match resolution from a click, re-search-replaces-content + last-query-restore, and the invalid-regex backend-validation message. -->
  - [x] verify-human  <!-- status: done — first run 5/5 happy+edge PASS; 2 rendering leaves (font-size, highlight) FAILED → F12 fix → re-test PASS. All 7 leaves [x]. Operator confirmed in native app. -->
    <!-- F12 FIX (2026-06-21, re-test PASS): (P2.vh.6 font) SyntheticView now applies fontSizeTheme(loadFontSize()) — the same persisted global zoom a file editor seeds from, so the result tab matches the current zoom. (P2.vh.7 highlight) formatFindResults now also returns `highlights` (absolute char-offset spans = rowStart + prefix.len + byteOffsetToCharIndex(line_text, match.start/end)); threaded setSyntheticContent(id, text, highlights) → EditorSplit syntheticHighlights state → PaneTabs → SyntheticView, which marks them via Decoration.mark(.cm-synthetic-hit) [amber #613a00/#ffd596, same as the old overlay hit]. Unit-verified: 2 new formatter tests assert the buffer slice at the highlight span == the matched text, incl. a multi-byte (→) case proving byte→char. -->
    - [x] P2.verify-human.1 ⌘⇧F → small query overlay only (no result list); type a string present in the project + Enter/Search → a "Find Results" tab opens in the editor with grouped matches (file-path headers + `   <line>:  <text>` rows + footer count).  <!-- status: done — operator PASS -->
    - [x] P2.verify-human.2 Click a match row in the Find Results tab → that file opens (its own tab), scrolls to + highlights the matched line/range.  <!-- status: done — operator PASS (open-at-match highlight works in the OPENED FILE) -->
    - [x] P2.verify-human.3 Run a SECOND search (different pattern) → the SAME "Find Results" tab's content is replaced (NOT a second Find Results tab); re-pressing ⌘⇧F shows the overlay with the last query still in the input.  <!-- status: done — operator PASS -->
    - [x] P2.verify-human.4 Edge: a no-match query → the Find Results tab shows the header + "No matches" body (not blank). An invalid regex (regex toggle ON, e.g. `foo(`) → inline error row in the overlay (testid project-search-error), no crash, tab not corrupted.  <!-- status: done — operator PASS -->
    - [x] P2.verify-human.5 Edge: .gitignore honored — a string that only appears in an ignored dir (e.g. node_modules/target) yields no matches (same exclusion contract as Cmd+P / the file tree).  <!-- status: done — operator PASS -->
    - [x] P2.verify-human.6 The Find Results TAB's font size matches the editor's CURRENT font-size setting (the persisted zoom — Cmd+=/Cmd+-/Cmd+0), not a hardcoded default.  <!-- status: done — operator PASS after F12 fix (fontSizeTheme(loadFontSize())) -->
    - [x] P2.verify-human.7 In the Find Results tab BUFFER, the matched text within each match row is HIGHLIGHTED (a mark on the matched span), like Sublime's Find Results.  <!-- status: done — operator PASS after F12 fix (.cm-synthetic-hit marks) -->
  - [x] verify-codify  <!-- status: done — codified the Find-Results-tab PURE contract: findResultsBuffer.test.ts now 7 tests (layout single/multi-file, lineMap match-rows→{file,match}/non-rows→null, empty→"No matches", highlight-span==matched-text incl. multi-byte →, AND a NEW click→open composition test: clicked buffer line N → lineMap[N-1] → matchTargetFor → correct open-at-match target; non-match line → null no-op). Integration boundary (RightPanelHost ⌘⇧F + synthetic-tab DOM/CM6 wiring) is verified end-to-end by operator verify-human per repo posture (pure-fn→vitest, live DOM→operator; no Playwright-in-CI harness). Full suite green: vitest 304, tsc/eslint/prettier; cargo 111, clippy/fmt. -->

  - **Phase 2 cosmetic note for human (from verify-self, NOT a blocker):** none — verify-self found 0 cosmetic issues. The only verify-self gaps were backend-dependent items, which were P2.verify-human.1–5 (all PASS) + the 2 F12-fixed rendering leaves (.6/.7, re-test PASS).

- [x] Phase 3: Replace — project-wide Replace All (overlay)  <!-- status: done — all impl (P3.1–P3.4) + 4 verify nodes [x]; operator PASS on Replace All / regex $1 / open-file-reflects / gitignore. REVISED 2026-06-21 (F23) — narrowed v1 to overlay Replace field + project-wide Replace All; per-result/per-file deferred (SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE). -->
  <!-- TITLE NOTE: originally "per-result / per-file / project-wide replace-all"; narrowed to project-wide-only at the Phase-3 relevance gate after the Phase-2 read-only-tab redirect removed the clickable result rows the per-result/per-file affordances needed. -->
  **Relevance check (before Phase 3, 2026-06-21):**
  - Requester still needs this: yes — project-wide replace is the WP7 spec's full-depth requirement (per-result / per-file / replace-all).
  - Requirements unchanged: PARTIALLY — replace *depth* unchanged (full); replace *UX surface* must be re-decided because Phase 2 moved results from a floating overlay list into a read-only Find Results tab. Per-result/per-file "click an affordance on a result row" no longer has a writable row to attach to.
  - Solution still feasible: yes — backend `project_replace` (reuse `build_regex` + walk + `Regex::replace_all` for `$1`/`${1}`) is clean and TempDir-testable; the open question is purely where the replace controls live in the redefined UI.
  - No superior alternative discovered: pending the UX decision.
  **Verdict:** pause-and-reassess → RESOLVED 2026-06-21 (F23 plan revision). Operator decision: **Overlay Replace field + project-wide Replace All ONLY for v1**; per-result + per-file replace DEFERRED to a backlog item (the read-only Find Results tab can't cleanly host per-row replace affordances). Phase 3 tasks rewritten below to the narrowed scope.

  **Observable outcomes (REVISED 2026-06-21 — overlay Replace All only):**
  - Browser: the ⌘⇧F overlay shows a Replace input (below the Find input) + a "Replace All" button. The button is disabled until both a non-empty pattern and a search-having-run exist (so the match/file count is known).
  - Browser: clicking "Replace All" opens a confirm dialog showing the total match + file count ("Replace N matches in M files?"); confirming rewrites every matching file; cancelling makes no change. After a confirmed replace, the Find Results tab refreshes to the post-replace search (the replaced matches are gone / the count drops).
  - Browser: a per-file write failure surfaces inline in the overlay (not silently swallowed) — the WP6 IPC-error-surfacing lesson.
  - Browser: with regex mode on, `$1`/`${1}` capture-group references work in the replacement (verify-human against a capture-group fixture).
  - CLI: `cargo test` (replace core: per-file rewrite, regex capture-group substitution via `Regex::replace_all`, count summary, write-error path, no-op when no matches) + `pnpm test` exit 0; all gates (clippy/fmt/tsc/lint/prettier) clean.
  - [x] P3.1 Backend replace core + command: `project_replace(root, query, replacement) → {files_changed, matches_replaced}` reusing `build_regex` + the shared `project_walker`; per matching file `re.replace_all` (regex mode expands `$1`/`${1}`; substring mode literal via `regex::NoExpand`), write via `editor_fs::write_file_core` (atomic, root-confined). No-op replacement counts matches but skips the rewrite. Write failure → typed `WriteFailed`. Command registered in `lib.rs`.  <!-- status: done — replace_core + ReplaceSummary + project_replace command; 9 cargo tests -->
  - [x] P3.2 Overlay Replace UI: added a Replace input + "Replace All" button to `ProjectSearch` (still query-input otherwise). Counts lifted to RightPanelHost (`lastCounts` from the last search) gate the button (`canReplace`) + fill the confirm. Reused `ConfirmModal` via a new pure `replaceAllSpec` (blast-radius message). On confirm → `invoke("project_replace")` → re-run search → refresh the Find Results tab; on error → inline error row. Overlay now STAYS open after a search so Replace All is reachable (supersedes the Phase-2 close-on-search detail).  <!-- status: done -->
  - [x] P3.3 Replaced-file-open reflects new content — COVERED by the existing WP12 disk-change machinery (no new code): replace writes via `editor_fs`, changing mtime/size; the editor's on-activate `stat_file` check (`onActivated`→`checkDisk`→`diskDecision`) reloads a clean buffer silently / prompts a dirty buffer. Known limit (acceptable, = the documented synchronous-check design): an ALREADY-active tab refreshes on next activation, not live (no watcher — the deferred watcher backlog item).  <!-- status: done — verified the onActivated→checkDisk wiring exists; reused as-is -->
  - [x] P3.4 Unit tests: `replace_core` cargo (9: rewrite+counts, gitignore-skip, regex `$1`, substring-literal `$1`, no-match→0, no-op-counts-no-rewrite, invalid-regex error, bad-root error, replace-count==search-count). Frontend: `replaceConfirm.test.ts` (4: blast-radius message, singular phrasing, empty-replacement-deletes, cancel-primary/esc-cancel).  <!-- status: done — 1 test-bug fixed via triage (assertion overreach, not code) -->
  - **DEFERRED to backlog (operator 2026-06-21):** per-result single-match replace + per-file replace. The Find Results tab is read-only (no per-row affordance); these need either a writable result surface or per-file markers in the tab. Logged as SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE.
  - [x] verify-auto  <!-- status: done — scoped: vitest search 32 pass (+replaceConfirm 4), cargo project_search 26 pass (+replace_core 9), tsc clean, eslint on search/+RightPanelHost clean. -->
  - [x] verify-self  <!-- status: done — subagent (plain Vite + ?ws= seed): 4/4 verifiable outcomes PASS, 1 UNVERIFIED (needs native backend), 0 BLOCKING, no white-screen, no app console errors. CONFIRMED: the overlay now has the Replace input (project-search-replace) + Replace All button (project-search-replace-all); Replace All is DISABLED before a search + STAYS disabled with replace-text-but-no-search (the gate works); the replace input is controlled; clicking the disabled button doesn't crash; a Search IPC-rejection surfaces inline (project-search-error) with no white-screen. UNVERIFIED → verify-human: real confirm-with-counts, the actual file rewrite, and the post-replace tab refresh (all need the native project_replace backend). -->
  - [x] verify-human  <!-- status: done — operator PASS on all 4 leaves in the native app (real project_replace). Integration boundary satisfied. -->
    - [x] P3.verify-human.1 Replace All + confirm-with-counts + file rewrite + Find Results tab refresh (+ Cancel = no change).  <!-- status: done — operator PASS -->
    - [x] P3.verify-human.2 Regex capture-group replace (`bar[$1]`) substitutes correctly.  <!-- status: done — operator PASS -->
    - [x] P3.verify-human.3 An open replaced file reflects the new content on re-activation (disk-change machinery).  <!-- status: done — operator PASS -->
    - [x] P3.verify-human.4 gitignore honored (no replace in ignored dirs / no-match changes nothing).  <!-- status: done — operator PASS -->
  - [x] verify-codify  <!-- status: done — replace behavior is codified by the build-time tests (replace_core 9 cargo + replaceConfirm 4 vitest), which verify-codify confirms are sufficient: per-file rewrite + counts, regex $1, substring-literal, gitignore-skip, no-match, no-op, errors, the replace_count==search_count invariant, + the confirm-spec counts/phrasing/cancel-default. The integration boundary (overlay Replace flow + project_replace IPC) was operator-verified end-to-end at verify-human (repo posture: pure→vitest/cargo, live DOM→operator; no Playwright-in-CI). The `canReplace` gate + open-file-reflects-replace (WP12 disk-change) are covered by verify-human + existing WP12 tests — not duplicated. Full suite green: vitest 308, cargo 120, all gates clean. No new tests warranted. -->


  - **Phase 3 build notes:** (1) replace reuses the SAME `build_regex` + walk as search — a `replace_count == search_count` test pins "no second match definition". (2) substring-mode replacement is LITERAL (`regex::NoExpand`) so a typed `$1` isn't a capture ref; regex mode expands `$1`/`${name}`. (3) writes go through `editor_fs::write_file_core` (atomic tmp+rename, root-confined) — replace inherits the editor's write discipline + path guard. (4) the overlay now stays open post-search (Phase-3 need: Replace All lives in it); editing the query clears `lastCounts` so Replace All re-gates to a fresh search. Gates: cargo 120 (+9), vitest 308 (+5), clippy/fmt/tsc/eslint/prettier clean.

**Relevance check (before Phase 2 resume, 2026-06-21):**
- Requester still needs this: yes — project-wide content search is the unchanged operator must-have; the redirect is to the result *UX*, not the goal.
- Requirements unchanged: yes for search depth; the result-surface requirement CHANGED (floating overlay list → Sublime "Find Results" tab), which is exactly what this re-plan encodes. Replace (Phase 3) untouched.
- Solution still feasible: yes — the WP12 synthetic-tab seam ships exactly the surface the operator wanted (`addSynthetic`/`setSyntheticContent` + click-line→callback, verified in code); the Phase-1 backend + highlight seam are reused unchanged.
- No superior alternative discovered: yes — the tab model is the operator's chosen Sublime-parity surface; no better option surfaced.
**Verdict:** proceed

## Current Node
- **Path:** Feature > finalize
- **Active scope:** review-quality COMPLETE — 0 CRITICAL / 2 MAJOR / 2 MINOR, all auto-backlogged (Mode 3, Case B: MAJORs auto-backlog with chat surface; MINORs auto-backlog). No refactor warranted. Ready for `/feature-finalize` (the WP7 close = the WBS-WP boundary the standing autopilot directive halts at).
- **Blocked:** none.
- **Unvisited:** finalize (WP7 close).
- **Open discoveries:** SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE (deferred replace scopes — logged to backlog).
- **Blocked:** none.
- **Unvisited:** Phase 3 verify-auto → verify-self → verify-human → verify-codify → ship → finalize (the WP7 close = the WBS-WP boundary the standing directive halts at).
- **Open discoveries:** SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE (deferred replace scopes).
- **Blocked:** none.
- **Unvisited:** Phase 2 verify-auto → verify-self → verify-human → verify-codify; then Phase 3 (replace: per-result / per-file / project-wide replace-all).
- **Open discoveries:** none

- **Phase 2 (redefined) build notes:** (1) NEW pure `findResultsBuffer.ts` (`formatFindResults` → `{text, lineMap}`) is the testable core that replaced the overlay's grouped-render logic; the synthetic tab's click reports a 1-based buffer line → `lineMap[line-1]` → `openFile(file, matchTargetFor(match))`. (2) The synthetic-tab click callback is registered ONCE (`findResultsAdded` ref guard, since `EditorSplit.addSynthetic` only stores the cb on first add) and reads the LATEST map from `findResultsLineMap` (a ref, not state) so a re-search updates the map without re-registering. (3) `ProjectSearch` shrank to a query box (input + 3 toggles + Search + inline error); dropped the result `<ul>`, flat-row nav, and `searchResults` lifted state. (4) Dead result-list CSS removed; `.project-search-query-only` hugs the controls. Gates: vitest 301 (+4 formatter), tsc/eslint/prettier clean. Real-backend results-render + click-to-open need native `pnpm tauri dev` (verify-human).
- **Phase 1 build notes:** Two as-built deltas, both improvements: (1) used `regex = "1"` directly rather than the `grep-searcher` sink API; (2) the Tauri command takes a single `SearchQuery` object instead of 4 positional args. Fixture gotcha: the `ignore` crate applies `.gitignore` only inside a git repo, so the test fixture creates a `.git/` dir (mirrors `fs_index`).
- **Phase 2 build notes:** (1) Naming gotcha: the helper module was renamed `projectSearch.ts` → `searchModel.ts` because it collided (case-insensitive macOS FS) with the `ProjectSearch.tsx` component — tsc flagged it. (2) Search is explicit-submit (Enter / Search button), NOT as-you-type — project-wide content search is heavier than the in-memory fuzzy finder. (3) `byteOffsetToCharIndex` (TextEncoder) bridges the backend's `regex`-crate BYTE match offsets to CM6's UTF-16 positions, so highlight is exact for multi-byte lines (é/→/emoji), no-op for ASCII. (4) The open-with-highlight seam is additive: `openFile(path, target=null)` — finder/tree/diff pass nothing and behave as before. Gates: vitest 225 (206+19), tsc/eslint/prettier clean.

## Retrospect
- **What changed in our understanding:** The Phase-1 backend + the open-at-match highlight seam carried forward into the redefined UX with ZERO rework — the F26 redirect (overlay → Find Results tab) only touched the result-rendering layer, never the search engine or the highlight machinery. The WP12 synthetic-tab seam (`addSynthetic`/`setSyntheticContent` + click-line→callback) was exactly the right shape; the Find Results tab needed only a pure formatter (`formatFindResults` → text + lineMap + highlights) on top of it.
- **Assumptions that held:** the pure-fn/vitest + operator-verify-human split scaled cleanly across both phases; the synthetic-tab click-line→callback resolved to file/match via a plain index map; `editor_fs::write_file_core` was the right write seam for replace (inherited atomicity + root-confinement); the WP12 disk-change check covered "open file reflects replace" with no new code.
- **Assumptions that were wrong:** (1) Phase 3's original plan (per-result/per-file/replace-all on clickable result rows) was stale the moment Phase 2 made the result surface a READ-ONLY tab — the relevance gate caught it and the operator narrowed v1 to Replace All. (2) The font-size + match-highlight in the tab weren't free — verify-human rejected the first Phase-2 cut (static font, plain text) and an F12 fix added `fontSizeTheme(loadFontSize())` + `Decoration.mark` highlights. (3) Keeping the overlay open after search (needed so Replace All is reachable) superseded the Phase-2 close-on-search behavior.
- **Approach delta:** Two operator-driven scope changes mid-feature — the Phase-2 F23 re-plan (overlay→tab) on resume, and the Phase-3 F23 narrowing (full-depth→Replace-All-only). One F12 verify-human back-loop (font/highlight). One test-bug triage (an over-broad assertion, not a code fault). Otherwise the build matched the revised plans.

## Code-Quality Review — m2-wp7-project-search (Find Results tab + Replace All)

_From `feature-review-quality` (code-quality-reviewer) on ship commit `8a788bf`. 0 CRITICAL, 2 MAJOR, 2 MINOR. Verdict: well-built, advances the codebase more than it accrues debt; no refactor pass warranted. MAJORs are latent design seams for a single-user app → auto-backlogged (Mode 3); MINORs → auto-backlogged. To dismiss a finding, mark it `[DISMISSED]` here before finalize archives the WIP._

### Strengths
- `replace_core` reuses the exact composed regex + `project_walker` as `search_core` (one match definition), pinned by `replace_count_equals_search_count_for_same_query`.
- Regex-mode `$1` expansion vs substring-mode literal (`regex::NoExpand`), with paired tests — the subtle bug most implementations miss.
- Disciplined pure/impure split matching repo posture; highlight offset math co-located with the buffer layout (single source of truth for the row prefix).
- Destructive Replace All gated behind a blast-radius confirm (reused `ConfirmModal`); empty-replacement-deletes called out.
- IPC errors surfaced inline (replace failure → `setSearchError`), never swallowed; `WriteFailed` names the first failing file.

### Issues
**CRITICAL** — (none)

**MAJOR**
- [src-tauri/src/project_search/mod.rs `replace_core` + RightPanelHost.tsx `onReplaceConfirm`] Replace All runs `project_replace` then a SEPARATE `project_search` to refresh — two unsynchronized full-tree walks. A file changing on disk between them can make the refreshed tab / `lastCounts` disagree with what was written. The `ReplaceSummary` the backend already returns is discarded in favor of the second walk. Low-probability single-user, but the read-after-write assumption across two walks is unrecorded. → SURFACE-2026-06-21-QUALITY-WP7-REPLACE-THEN-RESEARCH-TWO-WALKS
- [src-tauri/src/project_search/mod.rs:246-262] `matches_replaced` is a per-line `re.find_iter().count()` sum, but the mutation is whole-file `re.replace_all`. A cross-line regex (`(?s)…`, explicit `\n`) would have `replace_all` mutate spans the per-line counter never counted → the confirm's count under-reports vs the on-disk effect. Search shares the per-line limit (so the tab stays self-consistent), but count vs effect can diverge once multiline regex is allowed; no guard/test covers it. → SURFACE-2026-06-21-QUALITY-WP7-PERLINE-COUNT-VS-MULTILINE-REPLACE

**MINOR**
- [SyntheticView.tsx:60-78] `loadFontSize()` captured once in a `useMemo` keyed on `[onLineClick, highlights]` — the Find Results tab picks up zoom at (re)render of those deps, not live like `EditorPanel`'s compartment. Zooming the editor while the tab is active (no re-search) won't follow until the next search. Verify-human targeted open-time parity, so likely acceptable; the divergence is undocumented at the call site. → SURFACE-2026-06-21-QUALITY-WP7-SYNTHETIC-FONT-NOT-LIVE
- [findResultsBuffer.ts:96 & replaceConfirm.ts:14] The two-noun `plural()` helper is duplicated verbatim across both modules; a shared one-liner in `searchModel` (where `totalMatchCount` lives) would remove the copy. → SURFACE-2026-06-21-QUALITY-WP7-PLURAL-DUP

### Assessment
Well-built feature that advances the codebase more than it accrues debt. The Rust replace core is the standout — genuine reuse of the search machinery (not re-derived), tests pinning the reuse + regex-vs-literal + no-op-skip + gitignore edges. The frontend cleanly collapses the old in-overlay result list into a thin query box + synthetic-tab renderer; the pure-formatter split keeps testable logic out of React. Doc comments are load-bearing (the buffer-layout diagram, the offset-tracking rationale, the ref-vs-state explanation). The two MAJORs are design seams (latent for a single-user app), not bugs the green baseline missed — backlog so the assumption is recorded. Nothing warrants a refactor pass.

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Test Triage — replaceAllSpec "singularizes 1 match / 1 file"
Classification: Incorrect test assertion (the test, not the code, is wrong) — an obsolete-test case.
Confidence: high
Evidence: the assertion `expect(message).not.toContain("files")` fails because the static sentence "This rewrites **files** on disk…" legitimately contains "files"; the count phrasing ("1 match in 1 file") is correct. The assertion overreached — it should check the count phrase, not the whole message.
Action: auto-fixed the test to assert the singular COUNT phrasing ("1 match in 1 file") and not assert absence of the substring "files"/"matches" against the whole static message. Code unchanged.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-21] feature-spec — arch.md exceeds size guard (352 lines); read first 100 lines + `^#+ ` headings only per the GLOBAL entry-skill product-context size guard.
