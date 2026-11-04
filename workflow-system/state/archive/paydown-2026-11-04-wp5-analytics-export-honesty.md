---
workflow: task
state: close (complete)
completed: 2026-11-04
created: 2026-11-04
docs-only: false
drive_mode: autopilot
---

# Task: Paydown sweep WP5: analytics export honesty

**Workflow:** task
**State:** Completed 2026-11-04
**Created:** 2026-11-04
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` → WP5 (M16.5 WP8, a WBS 8.2 priority input)

## Problem Statement
The figures `export-week` gives Neo, and the docs about them, claim more than the code guarantees:
- the view-matching family sums are unguarded Rust copies of `kinds.ts`, checked by a circular test, while the docs say they "cannot drift"
- the week sort key's doc calls it the `WEEK TOTAL` figure, but it sums two kinds, not the badge's three
- the life key is a stringly-typed round trip
- `ExportError::Db` also carries failures that have nothing to do with the DB

## Context
Findings swept (bodies in `backlog-quality-findings.md` → `# analytics-week-export — 2026-09-29`; pointer in `backlog.md` → `## Code-quality findings — analytics-week-export (2026-09-29)`):
- `09-29-QUALITY-EXPORT-VIEW-FIGURES-ARE-UNGUARDED-RUST-COPIES-OF-WEEKMATH` (MAJOR)
- `09-29-QUALITY-WEEK-SORT-KEY-DOC-CLAIMS-IT-IS-THE-WEEK-TOTAL` (MAJOR)
- `09-29-QUALITY-ANALYTICS-WEEK-EXPORT-MINOR-BATCH` #2 (life key) and #3 (`ExportError::Internal`). #1 was resolved at WP2.
- ⚠️ **Folded in: batch #4** (`dashboardState.ts` header says "three" modes; there are four). The WBS routes it to no WP, it is XS and safe (Rule 1), and it is the batch's last open item. Closing it lets the whole batch AND its `backlog.md` pointer be deleted instead of rewritten to a one-item residual.

Code (re-anchored by symbol, 2026-11-04):
- `src-tauri/src/time_store/query.rs`:
  - `RollupCell` / `RollupCellMs` (+ `into_rollup_cell`)
  - `week_ai_minutes` (sums `ai_doing + subagent`; doc wrongly says it is the `WEEK TOTAL` figure)
  - `WeekMs.projects` doc ("AI-family minutes desc", also wrong)
  - `group_events_by_sid` → `HashMap<String, …>` keyed `{sid}~{N}`
  - `LIFE_SEP`, `session_display_id` (`rsplit_once` plus a numeric check)
  - `build_viz_session(sid: &str, …)`
  - `capped_events` and `human_kind_ms`: both read the grouping
  - `project_ai_minutes`: its doc says "AI-execution + subagent", but the code sums THREE kinds
- `src-tauri/src/time_store/export.rs`:
  - `cell_export` (`painted_min` inline)
  - `build_export`: `week_total_min`, `ai_family_ms` and `painted_non_away_ms` are inline
  - `ExportError` (Usage / Db), `export_json` (`build_export` and serde errors are mapped to `Db`)
  - the module doc's exit-code line
- `src-tauri/src/time_store/export/tests.rs` → `the_export_is_read_only_and_carries_the_week_view_figures`. This is the circular test: it re-sums three inline kind names.
- `src/components/workspace/dashboard/kinds.ts`: the TS authority, `AI_KINDS` (3) and `RENDER_ORDER` (6, incl. `away`). `weekMath.ts` → `cellTotal` = `RENDER_ORDER` minus `away`, and `projectWeekActive` = `AI_KINDS`.
- `src-tauri/src/reclassify/mod.rs` → `Kind::as_str` (the kebab tags that `kinds.ts` uses)
- `workflow-system/product/arch/time-analytics.md` → the `export-week` bullet ("cannot drift"; "Exit codes: 1 = DB missing or unreadable")
- `src/components/workspace/dashboard/dashboardState.ts` header

Facts that bound the design (do not change them; Neo consumes all of it):
- **The Week view renders `data.projects` in BACKEND order.** So `week_ai_minutes` IS the view's row-order key, and its two-kind sum is the contract (`definitions()["row_order"]` already says `ai_doing + subagent`). **Rename and re-doc only; do not change the weighting.** The Day view's three-kind `project_ai_minutes` differing from it is pre-existing and not in scope.
- **The exit-code contract stays 0 / 1 / 2.** `Internal` exits **1**. The split is a stderr category plus an honest doc, not a new exit code.
- The `export-week` JSON shape and values must be byte-identical before and after for the same DB. This is a refactor of how the figures are computed, not of what they are.
- ⚠️ "`node:fs`-anchored kinds test" (the WBS wording) is implemented **Rust-side** as a runtime `std::fs::read_to_string` of `kinds.ts` via `CARGO_MANIFEST_DIR`. It is the Rust analogue of `node:fs`: no bundler interception, read when the test runs, not `include_str!`. It goes Rust-side because the Rust sums are what can drift. A Vitest test cannot call them.
- `pnpm check:link`: **not needed.** Every renamed binding (`week_ai_minutes`, the life key, `session_display_id`) is Rust-private, and none crosses into TS. Still runs inside `verify:auto`.

Gate: `pnpm verify:auto`, timeout **207000** (`runtimes.md`). Mutation discipline per WBS §"Read before any WP that touches a test or a guard":
- one mutant per probe
- `perl -pi -e` for each mutation, then confirm with `sed -n '<line>p'` that it landed
- restore with a `cp` backup plus `shasum`, never `git checkout`

## Work Tree

- [x] T1 **Family sums written once, in `query.rs`.**
  - [x] T1.1 Add `const AI_FAMILY: [Kind; 3]` (ai-doing, subagent, ai-reasoning) and `const PAINTED: [Kind; 5]` (every kind except `away`) next to `RollupCell`. Doc both as mirrors of `kinds.ts` `AI_KINDS` and `RENDER_ORDER` minus `away`, guarded by T3.
  - [x] T1.2 Add per-kind accessors: `RollupCell::minutes_of(Kind)` and `RollupCellMs::ms_of(Kind)`. Then add the family sums driven by the consts: `RollupCell::ai_family()` / `painted()` and `RollupCellMs::ai_family_ms()` / `painted_ms()`. Each is a `.iter().map(of).sum()` over its const, so the kind list is written exactly once.
  - [x] T1.3 Replace the four inline sums in `export.rs` with the methods: `cell_export`'s `painted_min`, plus `week_total_min`, `ai_family_ms` and `painted_non_away_ms` in `build_export`.
- [x] T2 **Sort key: rename and re-doc**
  - [x] T2.1 Rename `week_ai_minutes` → `week_exec_minutes`. The doc becomes: *the Week view's ROW-ORDER key: `ai_doing + subagent` over the rounded cells. NOT the `WEEK TOTAL` badge, which also counts `ai_reasoning` (`RollupCell::ai_family`). Neo reads this order (`definitions()["row_order"]`), so changing the weighting is a contract change.* Give it its own `const EXEC: [Kind; 2]` if that reads cleaner than an inline sum.
  - [x] T2.2 Correct the `WeekMs.projects` doc ("AI-family minutes desc" → exec minutes). Correct `project_ai_minutes`'s doc too: it says "AI-execution + subagent", but the code sums all three AI kinds. Same claim class, one line each, no code change.
- [x] T3 **A non-circular kinds test anchored on `kinds.ts`** (export tests or `query/tests.rs`)
  - [x] T3.1 Write a parser helper: read `../src/components/workspace/dashboard/kinds.ts` with `std::fs` (path from `CARGO_MANIFEST_DIR`). Slice from `export const AI_KINDS` and from `export const RENDER_ORDER` up to their closing `];`, and collect the quoted strings. Positive controls: `AI_KINDS` parses to exactly 3 names and `RENDER_ORDER` to exactly 6, and every name maps to a `Kind` via `as_str`. An unknown name fails loudly; it is never skipped.
  - [x] T3.2 Write a behavioral test. Build a `RollupCellMs` with a distinct power-of-two ms value per kind, so every subset sum is unique. Assert `ai_family_ms()` == the sum over the TS-parsed `AI_KINDS`, and `painted_ms()` == the sum over TS `RENDER_ORDER` minus `"away"`. Do the same at minute precision on `RollupCell`, with `ai_family()` and `painted()`. Expected values come from the TS lists, never from a Rust list.
  - [x] T3.3 De-circularize the export test. In `the_export_is_read_only_and_carries_the_week_view_figures`, replace the inline three-name sum with a sum keyed by the TS-parsed `AI_KINDS` (snake-cased, to read the JSON `minutes` object). Also assert `painted_min` of the exercised day against TS `RENDER_ORDER` minus `away`. Keep the "fixture exercises reasoning" positive control.
  - [x] T3.4 **Mutation-prove each one individually** (record each mutant and the test that kills it in Discoveries / the close note):
    - (a) drop `Kind::AiReasoning` from `AI_FAMILY` → T3.2 dies
    - (b) add `Kind::Away` to `PAINTED` → T3.2 dies
    - (c) edit `kinds.ts` `AI_KINDS` to drop `"ai-reasoning"` (TS side drifts) → T3.2 dies. ⚠️ Restore with `cp` + `shasum`, since a `kinds.ts` edit can also break `tsc` and Vitest elsewhere.
    - (d) revert `build_export`'s `week_total_min` to an inline two-kind sum → T3.3 dies
    - (e) parser positive control: corrupt the slice anchor (`export const AI_KINDS` → a name that doesn't exist) → T3.1 fails loudly, not vacuously
- [x] T4 **Life key carries `(sid, life)`**
  - [x] T4.1 **Tests FIRST, on HEAD's code.**
    - (a) A characterization test for display ids with a `-` in the sid. A UUID-shaped sid and a native `cc-12`, each with lives 1 and 2, must render as `<first 8>` and `<first 8>~2`. These must PASS on HEAD (they pin the frontend seg-id input, `sidePanelMath.ts` `${session.id}:${segIndex}`).
    - (b) The defect test. A raw sid already ending in `~<digits>`, e.g. `abc~2` life 1 next to `abc` life 2, plus a long `abcdefghij~3` life 1, must render distinct display ids, with the long one shown as `abcdefgh`. Must FAIL on HEAD. Record the failure output.
  - [x] T4.2 Introduce `struct LifeKey { sid: String, life: usize }` (derive `Ord`). `group_events_by_sid` returns `HashMap<LifeKey, Vec<EventRow>>`. `build_viz_session` takes `&LifeKey`, and `session_display_id(&LifeKey)` formats `<first 8 of sid>` plus `~{life}` for life ≥ 2. `LIFE_SEP` stays as the DISPLAY separator only (keep its `:` warning). The `rsplit_once` parse is deleted. Update `capped_events` and `human_kind_ms`.
    - ⚠️ The sort order of the keys changes from string order to `(sid, life)` order. This feeds only `capped_events`'s concatenation (summed downstream) and `build_day`'s session iteration, which is then `sort_by_key(start)` (stable). It is visible only for two sessions sharing an exact start ms. Accepted. State it in the commit.
  - [x] T4.3 T4.1(a) still passes and (b) now passes. Mutation-prove: drop the `life ≥ 2` suffix → (a) dies.
- [x] T5 **`ExportError::Internal`**
  - [x] T5.1 Add the `Internal(String)` variant (exit **1**). `build_export` failure and serde failure map to it; `open_read_only` and `query_window` stay `Db`. Update `run_cli`'s message match.
  - [x] T5.2 Module doc's exit-code line: `1` = the DB is missing or unreadable, or the export could not be built (an internal error). The contract stays 0 / 1 / 2. Add a unit test that `ExportError::Internal(..).exit_code() == 1` and `Db` stays 1.
- [x] T6 **Docs**
  - [x] T6.1 `arch/time-analytics.md` export bullet: "cannot drift" becomes the true statement. The export shares the ms core (`build_week_ms`). Its family sums are written once on `RollupCell` / `RollupCellMs` and mirror `kinds.ts`, enforced by a test that reads `kinds.ts`. Name the test by symbol. Exit-code clause: add "or the export could not be built".
  - [x] T6.2 `dashboardState.ts` header: "three" → "four mutually-exclusive display modes", and list `pending`. Also fix the "three-way branch" phrase in the same paragraph. Comment-only. Leave it Prettier-clean: run `pnpm format:check`.
- [x] T7 **Byte-identical export check.** Run the export from a pre-change build and a post-change build against the same DB and `--monday`, and diff stdout with `generated_at` stripped. Use the operator's real DB read-only with a fixed past `--monday`, or the seeded fixture DB if a real one isn't usable. Run the pre-change binary as `cargo run -- export-week` from a HEAD worktree or from a `cp` of the binary built before T1.
- [x] T8 **Gate:** `pnpm verify:auto` (timeout 207000); record the runtime in `runtimes.md`.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** The real `claudesk export-week` CLI checked against the operator's real analytics DB (read-only):
- every project's `week_total_min` equals the sum of the kinds `kinds.ts` `AI_KINDS` names (read from the file by the script), over its rounded cells
- every cell's `painted_min` equals the sum over `RENDER_ORDER` minus `away`
- the whole document is byte-identical to HEAD's binary, `generated_at` aside
- a usage error still exits 2, and a missing DB still exits 1, each with empty stdout and nothing created

**Verification command:** `<scratchpad>/wp5/verify.sh` (six past weeks, 08-31 … 10-26; the HEAD binary's output was captured before T1)
**Expected result:** `OVERALL: PASS`, exit 0, 0 mismatches and `identical` on every week

## Verification Result

**Status:** PASS
**Date:** 2026-11-04
**Evidence:**
```
kinds.ts AI_KINDS=[ai_doing,subagent,ai_reasoning] painted=[reviewing,ai_reasoning,typing,ai_doing,subagent]
2026-08-31: 49 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
2026-09-21: 126 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
2026-09-28: 119 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
2026-10-05: 63 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
2026-10-19: 84 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
2026-10-26: 98 cells, 0 mismatches vs kinds.ts, vs HEAD: identical
usage: exit=2 stdout_bytes=0
missing DB: exit=1 stdout_bytes=0 stderr=claudesk export-week: no analytics database at …/nohome/Library/Application Support/com.claudesk.app/time-analytics.sqlite (is time tracking on?)
missing DB: nothing created
OVERALL: PASS
```
- Positive control for the mismatch count: the same jq with `AI_KINDS` minus `ai_reasoning` reports **11** mismatches on 09-21, so the zeros are not vacuous.
- Not end-to-end reachable: the `Internal` arm needs a `build_week_ms` or serde failure, which no real DB produces. It is pinned by mutant (h) instead.
- The life-key display ids are a Day-view IPC payload, with no CLI surface. They are covered by the red-first characterization and defect tests (Act evidence).

**Notes:** The export is unchanged for the consumer (Neo), and its view figures now provably follow `kinds.ts`.

## Act evidence (2026-11-04)
- **T4.1 red-first.** On HEAD's life-key code, `display_ids_of_sids_with_dashes_keep_their_shape_across_lives` PASSED and `a_raw_sid_that_already_ends_in_a_life_suffix_is_not_read_as_a_later_life` FAILED with `left: ["abcdefgh~3"] right: ["abcdefgh"]`. Both pass after T4.2.
  - Plan correction to T4.1(b): the `abc~2` life 1 vs `abc` life 2 collision CANNOT be fixed. It is inherent to the display format (first 8 chars + `~N`), which the frontend seg id depends on, so the test pins the truncation case only. Real sids are UUIDs or `cc-N` and never contain `~`, so this is not filed.
- **Mutants: each run individually, each restored from `cp` + `shasum`; all 9 die.**
  - (a) `AI_FAMILY` drops `AiReasoning` → `family_sums_match_the_kind_lists_in_kinds_ts`
  - (b) `PAINTED` gains `Away` → same test (landing confirmed with `sed`)
  - (c) `kinds.ts` `AI_KINDS` `"ai-reasoning"` → `"typing"` → same test, while the reader's count control stays green
  - (d) `week_total_min` reverts to a two-kind inline sum → `the_export_is_read_only_and_carries_the_week_view_figures`
  - (d2) `painted_min` → `ai_family()` → same test
  - (e) the reader's anchor is corrupted → `the_kinds_ts_reader_finds_the_lists_the_week_view_uses` fails loudly
  - (f) the life suffix is gated at `>= 99` → the dash characterization test plus the resumed-session test
  - (g) the `ms_of` arm is swapped → the family-sum test's accessor loop
  - (h) `Internal` exits 3 → `an_internal_error_keeps_the_db_failure_exit_code`
- **T7: byte-identical export.** A HEAD binary (saved before T1) and the new one were run against the real prod DB, read-only, and compared with `generated_at` stripped.
  - IDENTICAL for 6 past weeks (08-31, 09-21, 09-28, 10-05, 10-19, 10-26).
  - The live week 11-02 is also IDENTICAL when the two binaries run back to back. The first diff came from rows written between the captures.
- **T8:** `pnpm verify:auto` EXIT=0, 49 s (`runtimes.md` updated).
- **Key order:** `LifeKey` derives `Ord` on `(sid, life)`, which replaces string order for `capped_events`'s concatenation and `build_day`'s pre-sort iteration. It is invisible except for two sessions sharing an exact start ms (`sort_by_key(start)` is stable).
- `check:link` was not separately needed (every renamed binding is Rust-private); it ran inside `verify:auto` anyway.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:**
  - The Week view renders `data.projects` in the order the backend sends. So `week_ai_minutes` was never just a sort helper: it IS the row order Neo reads (`definitions.row_order`).
  - The Day view's own sort key (`project_ai_minutes`) sums THREE kinds while the Week's sums two, and its doc claimed two. Both are now documented; the divergence is pre-existing and left as is.
- **Assumptions that held:**
  - Every figure is byte-identical to HEAD on the real DB (6 past weeks, plus the live one run back to back).
  - Every renamed binding is Rust-private, so `check:link` was moot.
  - A `kinds.ts` read in Rust (`std::fs` at test time) gives a non-circular anchor.
  - All 9 mutants died.
- **Assumptions that were wrong:**
  - T4.1(b) planned to fix a sid that collides with another life's display id (`abc~2` vs `abc` life 2). That collision is inherent to the display format the frontend seg id depends on, so only the truncation half (`abcdefghij~3` shown as `abcdefgh~3`) was fixable. Real sids never contain `~`, so it is not filed.
- **Approach delta:**
  - Batch item #4 (the `dashboardState.ts` header) was folded in, so the whole batch and its `backlog.md` pointer could be deleted rather than rewritten to a residual.
  - The `project_ai_minutes` doc fix was added to the same claim class.
  - The "node:fs-anchored" test landed Rust-side, as planned.
  - Otherwise as planned.

**Closure notice:** Requester = operator, so this closure notice is for self-record. Paydown WP5 is complete: the `export-week` figures Neo reads now come from one Rust copy of each kind list, held to `kinds.ts` by a test that reads the file. The sort key, error variant, life key and docs now say what the code does. To see it: `claudesk export-week --monday <date>` produces output byte-identical to before. `<scratchpad>/wp5/verify.sh` reproduces the check.
