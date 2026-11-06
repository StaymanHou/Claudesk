---
workflow: task
state: close (complete)
completed: 2026-11-06
created: 2026-11-06
docs-only: false
drive_mode: autopilot
---

# Task: Sweep WP7 — Find and replace rule

**Workflow:** task
**State:** Completed 2026-11-06
**Created:** 2026-11-06

## Problem Statement
Replace All runs its regex over the whole file using the live query field, while search (and the per-row and per-file buttons) match per line using the query that produced the shown results. So `^foo` / `foo$` replace fewer matches than the confirm promised, and the two replace paths can answer "which query?" differently. Ruling **R1** settles it: Replace only ever touches what search could show.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` → WP7 + §Rulings R1 + §"Read before any WP that touches a test or a guard".
- Backlog entries closed by this WP:
  - `SURFACE-2026-11-02-REPLACE-ALL-MATCHES-WHOLE-FILE-WHILE-SEARCH-MATCHES-PER-LINE` (`backlog.md`, medium)
  - `SURFACE-2026-11-02-QUALITY-WP6-REPLACE-ALL-USES-LIVE-QUERY` (`backlog-quality-findings.md`)
  - `SURFACE-2026-11-02-QUALITY-WP6-WIRE-QUERY-CONVERSION-REPEATED` (`backlog-quality-findings.md`)
  - Their pointer `## Code-quality findings — m16-5-wp6-per-result-replace` in `backlog.md` (its last 2 MINORs, so the pointer and the `# m16-5-wp6-per-result-replace` findings section go too).
- Rust: `src-tauri/src/project_search/mod.rs`
  - `replace_core` (whole-file `re.find_iter(&contents).count()` + `replace_all_in`) and its doc comment.
  - `replace_every_match_per_line` (the per-line helper the `file` scope already uses).
  - `ReplaceScope::All` doc + `replace_in_scope` doc.
  - Tests: `replace_count_matches_whole_file_effect_under_multiline_regex` (retire), `replace_count_equals_search_count_for_same_query` (substring only), `scope_all_is_replace_all`.
- Frontend:
  - `src/components/workspace/search/searchModel.ts` → `SearchQuery`.
  - `src/components/workspace/RightPanelHost.tsx` → `replaceFromResults` (1 wire site), `onReplaceConfirm` (2 wire sites, both on the live `searchQuery`), `findResultsShown` ref.
  - `src/components/workspace/search/ProjectSearch.tsx` → `runSearch` (1 wire site).
  - Live harness test: `src/components/workspace/__tests__/findResultsReplaceLive.test.tsx`.
- Docs naming the old rule: `workflow-system/product/arch/right-panel-surfaces.md` (ProjectSearch row: "Replace All is still whole-file (open: …)"), root `CLAUDE.md` (M16.5 WP6 bullet: "Replace All is still whole-file — open SURFACE").

**The discriminating scenario for the query swap (T2).** Editing the query field nulls `lastCounts`, which disables Replace All, so the live/shown split looks unreachable. It is NOT: a ROW replace re-searches with the SHOWN query and calls `handleSearchResults`, which sets `lastCounts` again. So: search `foo` → edit the field to `bar` → click a row Replace → Replace All is enabled with the field still reading `bar`. On HEAD, Replace All then sends `bar`. That is the test, and the mutant that restores `searchQuery` must fail it.

## Work Tree

- [x] T1 `toWireQuery(q)` in `searchModel.ts` (camelCase `SearchQuery` → the IPC `{pattern, regex, case_sensitive, whole_word}` object, with an exported wire type), unit-tested; swap all 4 hand-built sites (`replaceFromResults`, `onReplaceConfirm` ×2, `ProjectSearch.runSearch`) to it. Grep after: zero `case_sensitive:` object literals left in `src/` outside `searchModel.ts`.
- [x] T2 R1 frontend half: `onReplaceConfirm` reads `findResultsShown.current.query` for BOTH the replace and the re-search (no-op if null), and re-renders via `handleSearchResults(r, shown.query)`. Add a live test in `findResultsReplaceLive.test.tsx` using the discriminating scenario above (search `foo`, edit field to `bar`, row replace, Replace All + confirm → `project_replace` and its re-search both carry `pattern: "foo"`). Mutation-prove: restoring `searchQuery` in `onReplaceConfirm` fails it (confirm the mutant landed).
- [x] T3 R1 backend half: `replace_core` replaces per line through `replace_every_match_per_line` (count from the helper; keep the no-op-write skip and the `WriteFailed` path). Rewrite its doc comment and the `ReplaceScope::All` / `replace_in_scope` docs to the new rule. Retire `replace_count_matches_whole_file_effect_under_multiline_regex`, replacing it with a test that a `\n`-spanning regex (`(?s)foo.bar`) replaces nothing, because search shows nothing for it. Add the anchored test: fixture with several `foo`-leading lines and a `foo`-trailing line across files; for `^foo` and for `foo$`, search total == Replace All `matches_replaced`, and the file contents are exactly what was expected. Mutation-prove: restoring whole-file `re.find_iter(&contents)` + whole-file `replace_all_in` in `replace_core` fails the anchored test (confirm landed with `sed -n`; restore from `cp` + `shasum`).
- [x] T4 Docs: `arch/right-panel-surfaces.md` ProjectSearch row (Replace All now per line and on the shown query; drop the open-SURFACE pointer) and the root `CLAUDE.md` M16.5 WP6 bullet's "(Replace All is still whole-file — open SURFACE)" clause. Grep the retracted claim repo-wide first ("whole-file" / "whole file" near Replace) and treat the named sites as a floor.
- [x] T5 Gate (green 2026-11-06, 48 s; the WBS tick + delete-on-resolve are done by `/task-close`): `pnpm verify:auto` (timeout 207000). Then tick WP7 in `backlog-paydown-wbs.md`. Delete-on-resolve (3 entries + the `m16-5-wp6` pointer and its findings section) happens at close with the CHANGELOG lines, same commit.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Act notes (evidence)
- **T1:** `toWireQuery` + `WireSearchQuery` in `searchModel.ts`; 4 sites swapped; `grep case_sensitive:` in `src/` non-test now hits only `searchModel.ts`. Mutant (`case_sensitive: q.wholeWord`) killed by the new `searchModel.test.ts` case.
- **T2:** `onReplaceConfirm` reads `findResultsShown.current` (no-op if null) for the replace, the re-search and `handleSearchResults`. New live test "Replace All uses the shown results' query after a row replace re-enabled it". Mutant (`toWireQuery(searchQuery)` at the replace site, landed at line 858) killed: 1 failed / 4 passed.
- **T3:** `replace_core` → `replace_every_match_per_line`. Retired `replace_count_matches_whole_file_effect_under_multiline_regex`; replaced by `replace_all_skips_a_match_only_a_cross_line_regex_finds`. Added `replace_all_count_equals_search_count_under_anchored_regex` (`^foo` 4, `foo$` 3, incl. a `\r\n` line) and `replace_all_rewrites_exactly_the_anchored_lines`. Mutant restoring whole-file `replace_all_in` + `find_iter(&contents)` in `replace_core` (landed at line 287) killed all 3 new tests (45 passed / 3 failed). Restores verified by `shasum`.
- **T4:** `arch/right-panel-surfaces.md` ProjectSearch row and the root `CLAUDE.md` WP6 bullet rewritten. `wbs.md`'s WP6 outcome line ("Left open: Replace All's own whole-file matching … → WP8") is a dated record and was left as is.
- **T5:** `pnpm verify:auto` rc=0 in 48 s (282 files / 3677 Vitest tests; 1068 Rust lib tests). The one ESLint warning is the pre-existing `XtermPane.tsx` one. `runtimes.md` updated; timeout kept at 207000.

## Verification Observable

**Observable:** In a live dev build, the REAL `project_replace` command with no scope (Replace All) on an anchored regex replaces exactly the matches the REAL `project_search` showed: `^foo` and `foo$` each give `matches_replaced` == the search's match total, a `(?s)foo.bar` cross-line regex replaces 0, and a follow-up search finds 0.
**Verification command:** launch `pnpm tauri:dev` (full Claude-marker `env -u` strip); over the MCP bridge (port 9223) `invoke('project_search', …)` then `invoke('project_replace', …)` then `invoke('project_search', …)` against fresh copies of a fixture in the session scratchpad (outside the repo); `cat` the files afterwards.
**Expected result:** (fixture a.txt + b.txt as in the Rust test, plus c.txt = `foo\nbar\nfoo\nbar\n`) `^foo`: search 6 / replaced 6 / after 0; `foo$`: search 5 / replaced 5 / after 0; `(?s)foo.bar`: search 0 / replaced 0, file byte-identical; file contents equal the Rust test's expected strings.

## Verification Result

**Status:** PASS
**Date:** 2026-11-06
**Evidence:** live dev build (`target/debug/claudesk` built 09:54:24, after the last source write at 09:52:01), real IPC over the MCP bridge:
`{"^foo":{"before":6,"replaced":6,"files_changed":3,"after":0},"foo$":{"before":5,"replaced":5,"files_changed":3,"after":0},"(?s)foo.bar":{"before":0,"replaced":0,"files_changed":0,"after":0}}`
Files after: `caret/a` = `'X one\nX two\nmid foo mid\ntwo foo\r\nX\n'`, `caret/b` = `'x\nX three\nend foo\n'`, `dollar/a` = `'foo one\nfoo two\nmid foo mid\ntwo X\r\nX\n'`, `dollar/b` = `'x\nfoo three\nend X\n'`, `c` = `'X\nbar\nX\nbar\n'` in both; all three `cross/*` files `cmp`-identical to the template.
**Notes:** Replace All now replaces exactly what search showed. The old whole-file `replace_core` would have reported 2 for `^foo` (line 1 of a.txt and c.txt), 0 for `foo$` (Rust `$` without `(?m)` misses the end-of-file `foo\n`) and 2 for `(?s)foo.bar`, so the result discriminates the new code from the old. The frontend half (R1 shown query) is covered by the live-harness test + its killed mutant (Act notes T2). Dev processes torn down by PID (47096, 46719, 46683, 46443, 46387); the installed app was not touched.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** The live/shown query split in Replace All was reachable, not just theoretical. Editing the field nulls `lastCounts`, but a ROW replace re-searches with the shown query and re-enables Replace All while the field still holds the edited pattern. That path is what made the R1 swap testable.
- **Assumptions that held:** `replace_every_match_per_line` was already the right helper, so the backend change was a one-call swap. Every new guard died to its mutant on the first probe.
- **Assumptions that were wrong:** None material. The plan's fixture arithmetic was off once (`foo$` is 3, not 4), caught on the first test run.
- **Approach delta:** None. The plan's T5 "tick WP7 in the WBS" moved to close, alongside the CHANGELOG lines and delete-on-resolve.
