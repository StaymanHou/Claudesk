---
workflow: feature
state: completed
completed: 2026-09-29
created: 2026-09-28
drive_mode: autopilot
entry: plan (small/simple — decisions taken with the operator before planning)
---

# Feature: Analytics — faster queries, resumed-session fix, Week default, `export-week` CLI

**Workflow:** feature
**State:** Completed 2026-09-29 (ship `c7042af`, review-quality `519bd81`)
**Created:** 2026-09-28

## Problem Statement

Four asks against time analytics, gathered in one session.

**1. Slowness (operator).** The analytics UI "has been a bit slow lately". Measured on a snapshot of the real DB (782K events, 172 MB, release build):
- The Day view's default 14-day window reads 123K rows in 97 ms, then **builds for 602 ms** and ships 2.2 MB of JSON with 36,680 segments.
- A full week builds in 344 ms.
- `sample` puts **85% of build time in `reclassify::ai_segments_for_window`**. `query::segments_for_window` calls it once per AI-busy span, and every call re-derives `tool_intervals` and the subagent pairing from **all** of the session's events, re-parsing each tool row's `meta` JSON (`EventRow::meta_str`). The cost is spans × events.
- Those intervals do not depend on the window, so deriving them once per session gives the same output.

**2. Week as default (operator).** The dashboard opens on Week, not Day.

**3. Resumed sessions are truncated.** This is an accuracy bug, found while checking Neo's "scripture-reading had no row".
- `reclassify::authoritative_end` returns the **earliest** `SessionEnd`/`WorkspaceClose`, and `build_viz_session` drops every event after it.
- A CC session resumed under the same id (`--continue` / `--resume`, including Claudesk's own M12 auto-resume) loses everything after its first exit.
- Example: scripture-reading 2026-09-25. 1 prompt came before the first `SessionEnd`; 26 prompts and 129 tool calls came after it. The row showed 0 AI minutes and sorted below `scratch-*`, just past the edge of Neo's screenshot.
- Corpus-wide: **104 sessions, 39,461 hook events, 17,206 tool calls dropped.**
- ⚠️ **Operator ruling:** split one session id into **lives** at each end marker followed by a later `SessionStart`. The exit→resume gap counts as nothing. The idle cap applies per life.

**4. Neo's weekly export** (a 2026-09-28 handoff from Neo; deleted from this repo 2026-09-29 because it names private projects). Neo needs the Week view's data as a machine-readable file so it can draft the Monday report without a screenshot.
- ⚠️ **Operator rulings:** a CLI subcommand on the app binary, `claudesk export-week --monday YYYY-MM-DD`, writing JSON to **stdout**. It is **UNFILTERED**: no exclude flag and no stored list; Neo filters on its side.
- It must run without the operator (no GUI), open the DB **read-only**, and be safe while the app is running.

Problem statement unchanged. The F9b back-loop was a missing consuming-surface outcome (the integration-boundary rule), not a code defect. The root causes and rulings above still stand. [2026-09-28]

## Design notes (decided at plan time)

- **Perf (P1.1).** Split `ai_segments_for_window` into two steps:
  1. A once-per-session precompute: the labeled subagent pairs and the per-tool intervals, both unclipped.
  2. A per-window clip over that precompute.
  `ai_segments_for_window(events, ws, we)` stays as a thin wrapper, so its tests and callers are unchanged. `query::segments_for_window` computes the precompute once and loops over the spans. The within-window order must be preserved exactly: subagent segments are pushed before tool segments, and `sort_by_key` is stable. Equal-(start,end) ties must keep today's order.
- **Lives (P1.2).** Add one pure primitive, `reclassify::split_lives`.
  - A new life starts at a `SessionStart` that comes after an end marker (`SessionEnd` or `WorkspaceClose`) in the current life.
  - Rows between an end marker and the next `SessionStart` stay in the earlier life and are dropped by its end clip, which keeps the existing semantics inside a life.
  - `query::group_events_by_sid` expands each sid into its lives, so `build_day`, `capped_events` and `human_kind_ms` all inherit the split.
  - The session payload `id` must stay **unique** per day, because the frontend keys selection on `${session.id}:${segIndex}` (`sidePanelMath.ts`). Life 1 keeps its 8-char id; life N≥2 becomes `<8-char>~N`. The id must never contain `:`.
  - `dangling_sessions` checks the **last** life for an end marker. A resumed-then-crashed session is otherwise never reconciled.
- **Default view (P2.1).** Change `useState<DashboardView>("day")` to `"week"`. `mondayIso` already defaults to this week. The mount fetch reads `navRef.current.view`, so opening fetches **only** Week. The source guards in `dashboardWiring.test.ts` / `toolbarViewModes.test.ts` must be checked. `setView("day")` there is the Day-tab reset, which stays.
- **Export CLI (P2.2–P2.4).**
  - `run()` intercepts `std::env::args()` **after** `tauri::generate_context!()` is built once (to read `config().identifier`, so a dev build reads `com.claudesk.app.dev`) and **before** `Builder`. On `export-week` it never starts a GUI; it prints and exits.
  - The DB path is `$HOME/Library/Application Support/<identifier>/time-analytics.sqlite`, opened `SQLITE_OPEN_READ_ONLY` with a busy_timeout, and never bootstrapped.
  - `--monday` accepts any date and snaps it to its Monday, the same rule as `resolve_window`. With no `--monday` it exports the current week. `--json` is accepted as a no-op so Neo's suggested shape works.
  - Exit codes: 0 on success; 2 on a usage error (stderr, empty stdout); 1 on a missing or unreadable DB (stderr).
  - The payload refactors `build_week` into an ms-precision core that also carries `path`. `WeekPayload`'s wire shape to the frontend is **unchanged**.
  - The export adds:
    - `schema: "claudesk.week-export/1"` and `generated_at`
    - `tz` (IANA name via `iana-time-zone`, already a transitive dependency, plus `utc_offset`)
    - `days` as ISO dates alongside the labels
    - per project: `id`, `alias`, `path`, and 7 cells carrying both the `*_ms` and the minute fields plus `prompts`
    - per-project `ai_family_ms` (= the `WEEK TOTAL` badge) and `painted_non_away_ms` (= the day label). These two answer Neo's "two figures computed differently" without anyone reading `weekMath.ts`
    - a window-level `engaged` block (`wallclock_ms` / `effort_ms` / `multiplier`) from `build_metrics` over the same 7 days.
- ⚠️ **Neo can only run it after a release.** The installed binary is `/Applications/Claudesk.app/Contents/MacOS/claudesk`. Whether and when to `/release` is the operator's call.

## Work Tree

- [x] Phase 1: Backend — hoist the per-session interval derivation, then split resumed sessions into lives
  **Observable outcomes:**
  - CLI (equivalence, after P1.1 and before P1.2): a throwaway harness over the DB snapshot serializes `build_range` (last 14 days) and `build_week` (weeks of 2026-09-21 and 2026-09-28) at HEAD and after P1.1. The **key-sorted** JSON (`jq -S`) is identical (`cmp` exits 0). [Corrected at build: raw bytes differ between two HEAD runs, because `SessionPayload.tools` / `hour_range_by_day` are HashMaps, so a raw `cmp` is noise.]
  - CLI (speed): the same harness, release build, shows the 14-day `build_range` at **≤ 150 ms** (was 602 ms) and the full week of 2026-09-21 at **≤ 100 ms** (was 344 ms).
  - CLI (red→green): a new `reclassify`/`query` test builds a session `SessionStart → UPS → tools → Stop → SessionEnd → SessionStart(resume) → UPS → tools → Stop → SessionEnd`. It **fails on HEAD** (1 session, no AI time after the resume) and passes after P1.2 (2 sessions with distinct ids, AI time in both, and the exit→resume gap in neither).
  - CLI: `cargo test --lib` has a test proving `dangling_sessions` flags a session whose **last** life has no end marker, even though an earlier life has one.
  - CLI (real data): the harness's 2026-09-21 week shows `scripture-reading` with `ai_doing + subagent > 0` (was 0) and more than one session on 2026-09-25.
  - CLI: `pnpm verify:auto` exits 0.
  - IPC + Browser (consuming surface; added at verify-self F9b because the integration-boundary rule found no outcome naming it): the DB snapshot is copied into the **dev** app-data dir (the dev DB is backed up first and restored after), and `pnpm tauri:dev` is launched. Then:
    - `time_analytics_query {scope:"global", window:{kind:"week", monday:"2026-09-21"}}`, invoked over the MCP bridge, returns a `week` payload whose `scripture-reading` row sums to **27 prompts** on its 5th cell (2026-09-25).
    - The Day view, jumped to 2026-09-25 with scripture-reading expanded, renders the resumed session's two lives as two rows with `data-session-id` values `44f2c736` and `44f2c736~2`.
    - Clicking a segment of the `~2` row opens the SidePanel for that segment, which proves the `${id}:${i}` seg-id split survives the `~`.
    - No JS error is observed on a self-tested `window` error tap.
  - [x] P1.1 Split `ai_segments_for_window` into a once-per-session precompute + a per-window clip, and make `query::segments_for_window` precompute once. Capture the equivalence + speed readings.
    - Readings (release build, snapshot): RANGE14 557 → **97 ms**; WEEK 09-21 324 → **57 ms**; WEEK 09-28 72 → 13 ms. All 5 payloads identical to HEAD under `jq -S`. The HEAD-vs-HEAD run confirmed the method is stable, and the P1.2 change was the positive control (it made the same diff report CHANGED).
  - [x] P1.2 Red test first. Then add `reclassify::split_lives`, expand lives in `query::group_events_by_sid` with unique `~N` ids, and switch `dangling_sessions` to the last life.
    - Red on HEAD: 1 session ending at 606; dangling = 0. Green after the fix. 4 mutants (no split / whole-session dangling / no id suffix / `:` separator) each landed and each was killed.
    - Real data after the fix: RANGE14 **123 ms**, WEEK 09-21 **82 ms** (more events now tiled). scripture-reading 09-25: prompts 1 → **27**, ai_doing 0 → 3, ai_reasoning 0 → 18. The low ai_doing is quick tool calls, not truncation.
  - [x] P1.3 Update the doc comments on `authoritative_end` / `resolve_session_end` (the "a session ends once" rationale is now per life), and add a load-bearing bullet to `arch/time-analytics.md`.
  - [x] verify-auto — `pnpm verify:auto` EXIT=0 in 45s (frontend 3217, Rust 994 lib; 1 lint warning, pre-existing in untouched `XtermPane.tsx`)
    - Re-run after F9b: no code changed (only WIP/backlog prose). Scoped `cargo test --lib -- reclassify time_store` 202 passed; `cargo fmt --check` ok.
  - [x] verify-self — all 7 outcomes PASS.
    - A `feature-verify-self-runner` subagent ran the 6 CLI outcomes:
      - Equivalence: 5/5 identical under `jq -S`, with the positive control detecting the difference.
      - Speed: RANGE14 105/106 ms and WEEK 09-21 61/61 ms over two runs.
      - Red→green: both new tests FAIL on a HEAD worktree carrying only the tests, and PASS on the current tree.
      - The dangling test asserts the last-life claim.
      - scripture-reading cell 5: prompts 1 → 27.
      - `pnpm verify:auto` EXIT=0 (3217 frontend / 994 Rust).
    - The orchestrator ran the IPC + Browser outcome (subagents lack the MCP bridge), fresh on the relaunched build: ids `44f2c736` + `44f2c736~2` rendered, and the `~2` seg click opened the SidePanel (Session ID `44f2c736~2`, 26 prompts, 129 tools). Positive control caught, 0 errors.
    - ⚠️ Process note: the subagent's temporary harness edit to `src-tauri/src/time_store/query/` made `tauri dev`'s watcher rebuild and RELAUNCH the app twice mid-check, wiping the orchestrator's error tap. A live-app check must not run concurrently with any Rust edit.
    - Re-verify gate (build F9b, 2026-09-28), run on a dev build with the snapshot loaded into the dev app-data dir. All PASS:
      - `time_analytics_query` week 2026-09-21, called via the app's own `queryTimeAnalytics`, took 476 ms (debug build). scripture-reading's cell 5 has **prompts 27**, ai 3, reasoning 18.
      - The Day view, with scripture-reading expanded, renders `data-session-id` values `44f2c736` and `44f2c736~2`, with no duplicate id within a day.
      - Clicking an ai-doing seg on the `~2` row opened the SidePanel for 09:28 → 11:40: 129 tool calls, 26 prompts, Session ID `44f2c736~2`.
      - The self-tested `window` error tap (positive control caught) recorded 0 errors.
  - [x] verify-human — operator approved 2026-09-28
    - [x] P1.verify-human.1 Consuming-surface capture (`time_analytics_query` week 2026-09-21) — agent-run, output shown in chat: scripture-reading cell 5 prompts 1 → 27, ai 0 → 3, reasoning 0 → 18
    - [x] P1.verify-human.2 Speed feel: open Analytics in the **Claudesk Dev** window → Day view appears noticeably faster than in your installed app — operator: "I don't notice a major difference, but that's ok" (accepted; debug build). Operator also reported a ~0.5 s "tracking is off" flash on open → see Discoveries; folded into Phase 2.
    - [x] P1.verify-human.3 Representation: in Day view, expand scripture-reading → Fri 09-25 shows the resumed session as TWO rows (08:31→09:24, 09:28→11:40) with nothing drawn in the exit→resume gap — acceptable? — operator: ok
  - [x] verify-codify — 4 new tests.
    - The consuming-surface integration test `time_store::commands::tests::a_resumed_session_counts_its_post_resume_work_in_the_week_and_metrics_payloads` runs hook events → real `write_gated` → `query_window` → `build_week` + `build_metrics`, the command body minus the `AppHandle` hop, since the repo has no mock-app precedent. It asserts prompts 2, ai_doing 21 min and tool effort 21 min.
    - 3 `split_lives` edge cases: a leading or no-restart marker doesn't split; a `WorkspaceClose` does; three lives with unsorted input.
    - 2 mutants (no split / no WorkspaceClose marker) each landed and each was killed.
    - `pnpm verify:auto` EXIT=0 in 41s (3217 frontend / 998 Rust lib).
    - Not codified: the speed win (no perf-test harness exists; the hoist's output-identity is carried by the existing tiler tests, which now run through `AiIntervals`).

- [x] Phase 2: Surfaces — Week as the default view + `claudesk export-week` CLI
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The operator asked for the Week default this session; Neo's export request is standing.
  - Requirements unchanged: yes, with two additions from the operator's verify-human feedback (P2.1b / P2.1c, same surface), plus the path fix that Phase 1 exposed (P2.2).
  - Solution still feasible: yes. Phase 1 confirmed `build_week` is fast (61 ms release on a full week) and correct across resumed sessions.
  - No superior alternative discovered: yes. The export reuses the Week builder; no new computation.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (MCP bridge): opening Analytics with tracking ON never renders the "Time tracking is off" text. A `MutationObserver` installed before the click records no node containing it, and a positive control (tracking OFF) does record it.
  - CLI: `time_analytics_query` is declared `async` and its body runs under `spawn_blocking` (grep). `src-tauri/tests/sync_commands_do_not_block.rs` still passes.
  - Browser (MCP bridge, `pnpm tauri:dev`): opening the analytics dashboard shows the **Week** tab as active and the week grid rendered. An IPC tap on open records exactly one `time_analytics_query`, with `window.kind === "week"` (no Day query).
  - CLI: `src-tauri/target/debug/claudesk export-week --monday 2026-09-21` (prod identifier, so it reads the real DB read-only) exits 0 in under 3 s with no window appearing. `jq` confirms all of these:
    - `.schema == "claudesk.week-export/1"`
    - `.days | length == 7`, and `.days[0] == "2026-09-21"`
    - every project has `.path` and 7 `.cells`, each carrying `ai_doing_ms` and `prompts`
    - `.projects[] | select(.alias == "scripture-reading")` exists
    - `.tz.name` is non-empty
    - `.engaged.wallclock_ms > 0`
  - CLI: `export-week --monday 2026-09-24` (a Thursday) produces the same `.days[0] == "2026-09-21"` (snap-to-Monday).
  - CLI: `export-week --monday nonsense` exits 2, prints to stderr, and leaves stdout empty. With a missing DB it exits 1 with a stderr message.
  - CLI: run while the operator's installed Claudesk is open, it exits 0, and the prod `time-analytics.sqlite` main-file `shasum` is unchanged across the run. [Refined at build: the running app's own WAL writes make the mtime and `-wal` meaningless to compare, so the read-only guarantee is carried by `SQLITE_OPEN_READ_ONLY`, proven by the export tests' writing mutant.]
  - CLI: each project's `week_total_min` equals the Week view's `WEEK TOTAL`, i.e. `projectWeekActive` = Σ over the rounded cells of `ai_doing + subagent + ai_reasoning` (⚠️ three kinds, corrected at build), computed from the `WeekPayload` that `time_analytics_query` returns for the same week.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Make Week the default view and update any source guard that pins the old default. No source guard pinned the default. Covered instead by the live render test `dashboardOpenLive.test.tsx`, which was red on HEAD (the open fetched `['custom']`).
  - [x] P2.1b Tri-state the dashboard's tracking seed (`null` = not yet known) so an unresolved seed never renders the "Time tracking is off" empty state. Red render test first. The pure `dashboardMode` gained `pending`, and the render gained an explicit pending branch. Without it, pending falls through to the "No activity recorded" fallback, a second false claim. Red on HEAD; the tracking-OFF positive control passes.
  - [x] P2.1c Make `time_analytics_query` an `async` command that runs the read + build on `spawn_blocking`, so a query never freezes the main thread (all workspaces). The body was extracted to `run_analytics_query`, and the Phase 1 integration test now drives it. The guard scans 91 commands (8 async).
  - [x] P2.2 Refactor `build_week` into an ms-precision core that carries `path`; `WeekPayload` stays wire-identical. **Also fix the project `path` derivation** (see Discoveries, 2026-09-28): derive it from the sessions' **modal** cwds, not from every event's cwd. A red test comes first. Red confirmed (`/a/other-proj`). Now the heaviest modal cwd by row count, ties alphabetical. `build_week` = `build_week_ms` rounded, same order.
  - [x] P2.3 Add a new `time_store::export` module: arg parsing, read-only open, the export payload (schema/tz/days/cells/totals/engaged), and exit codes. 8 tests, including one with a live writer open.
    - The read-only assertion was positive-controlled: a READ_WRITE + INSERT mutant fails both tests.
    - ⚠️ Found at build: a read-only open of a WAL DB with no sidecars CREATES `-shm` and an empty `-wal`. The tested property is therefore "no DATA changed" (DB + non-empty `-wal`), not "no file changed".
  - [x] P2.4 Wire the `export-week` intercept into `run()` before `Builder`, with the identifier taken from the single `generate_context!()`. Smoke run against the real prod DB, with the installed app running: EXIT=0 in 1.64 s (debug), 17 projects, tz `America/New_York` / `-04:00`, scripture-reading path correct. The main-file shasum was unchanged across a run.
  - [x] P2.5 Document the command (arch/time-analytics.md) and write `HANDOFF-to-neo-<date>-weekly-export.md` with the path, schema, field meanings and the release caveat. Written to this repo's root at first; per the operator, deleted from this repo before the v0.7.1 push (it names private projects and weekly hours). It lives only in Neo's repo.
  - [x] verify-auto — `pnpm verify:auto` EXIT=0 in 46s (frontend 3221, Rust 1007 lib; only the pre-existing XtermPane warning)
    - First run failed: `pnpm verify:auto` EXIT=1 at `prettier --check` because the P2.1b edit in `GlobalDashboard.tsx` wasn't formatted. F9 → build ran `prettier --write` on that file (formatting only: `useState<boolean | null>(null)` collapsed to one line). `prettier --check .` is clean.
  - [x] verify-self — every outcome PASS.
    - CLI outcomes, via a `feature-verify-self-runner` subagent on a copied prod-identifier binary:
      - Real DB: EXIT 0 in 0.82 s, 17 projects, all jq checks true, no process left behind.
      - Snap-to-Monday works in both flag forms.
      - `nonsense` → exit 2 with 0 bytes on stdout; a missing DB → exit 1 with 0 bytes and nothing created.
      - With the installed app running (PID 1897), the main-file shasum was unchanged.
      - Internal consistency across 17 projects / 119 cells: 0 mismatches.
    - Browser outcomes, by the orchestrator over the MCP bridge on the relaunched dev build, reading the snapshot:
      - (a) A MutationObserver installed before the click saw "Time tracking is off" **0 times** with tracking ON. Positive control: tracking OFF → seen 1 time.
      - (c) Opened on **Week** (the active tab), 11 week rows, 0 Day rows mounted. The "exactly one query" part is carried by `dashboardOpenLive.test.tsx`, because the bridge cannot tap IPC (caveat l).
      - (d) All **17** DOM `WEEK TOTAL` badges for week 39 equal the export's `week_total_min` on the same snapshot (via a fake `$HOME`, `diff` empty), and the row order is identical.
      - Error tap: positive control caught, 0 errors.
    - (b) Grep confirms `pub async fn time_analytics_query` with a `spawn_blocking` body; `sync_commands_do_not_block` passed.
    - Dev tracking was turned back ON for verify-human; teardown restores it to OFF.
  - Teardown DONE 2026-09-29: dev tracking set OFF (read back `false`), dev build stopped by PID, dev DB restored from `tmp/devdb-backup-2026-09-28/` (`shasum -c SHA`: 3× OK).
  - [x] verify-human — operator approved 2026-09-29
    - [x] P2.verify-human.1 Consuming-surface capture: `claudesk export-week --monday 2026-09-21`, agent-run against the REAL DB with the installed app running. Exit 0; trimmed output shown in chat.
    - [x] P2.verify-human.2 Open Analytics in **Claudesk Dev** a few times → lands on Week, with no "Time tracking is off" flash — operator: pass (dev build relaunched; boot smoke `#root` mounted)
    - [x] P2.verify-human.3 The export's shape and field meanings suit Neo (the handoff reply to Neo), and where that reply should live — operator: shape ok; reply copied to `~/Work/Kenosis/neo/`. The operator later (2026-09-29, before the v0.7.1 push) had BOTH handoff files untracked and deleted here, rewriting the unpushed finalize commit so they never reached origin.
  - [x] verify-codify — 2 new guards (5 test cases).
    - Integration boundary: the `export-week` CLI dispatch in `run()` and the `time_analytics_query` command. Consuming-surface test: `src-tauri/tests/export_week_cli.rs` runs the REAL built `claudesk` binary under a fake `$HOME` with a 20 s kill deadline. It checks a usage error → exit 2, empty stdout, nothing written; a valid week with no DB → exit 1, stderr naming `$HOME/Library/Application Support/<tauri.conf identifier>/time-analytics.sqlite`, nothing created; and `--help` → exit 0 with usage on stdout.
      - Mutants each landed and were killed: `argv[1..]` (off by one) killed 2 of 3; a wrong identifier killed the path test.
      - ⚠️ NOT mutation-proven: the "intercept moved below the Builder" arm, because that mutant launches a real app window on the operator's screen. It is carried by the kill deadline alone.
      - Export CONTENT stays owned by `time_store::export::tests` (the lib's `time_store` is private, so an integration test cannot seed a DB).
    - `tests/sync_commands_do_not_block.rs` gained a two-directional `MUST_STAY_ASYNC` table (the guard now records async command NAMES, not just a count). A real revert of `time_analytics_query` to its sync form (it compiles) fails with "is SYNC again"; an entry naming no command fails with "names no command". Both mutants landed and were killed, and both files were restored by shasum.
    - Already covered, not duplicated: Week default + one week-only fetch + no false "off" flash (`dashboardOpenLive.test.tsx`, 3 cases incl. the OFF positive control); `dashboardMode` pending (`dashboardState.test.ts`); modal-cwd `path` (P2.2 red test); export figures, read-only, snap-to-Monday, exit codes (`time_store::export::tests`, 8).
    - `pnpm verify:auto` EXIT=0 in 54s (3221 frontend / 1007 Rust lib + integration suites; only the pre-existing XtermPane warning).

## Current Node
- **Path:** Feature > complete
- **Active scope:** none (finalized 2026-09-29; review-quality 0 CRITICAL / 2 MAJOR / 4 MINOR auto-backlogged; nothing pushed)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** all 3 folded into Phase 2 and implemented. `SURFACE-2026-09-28-ANALYTICS-PROJECT-PATH-FROM-STRAY-CWDS` is to be deleted at finalize with its CHANGELOG line. Teardown done.

## Code-Quality Review — analytics-week-export

*(feature-review-quality on ship commit `c7042af`, window `c7042af^..c7042af`; drive_mode=autopilot. 0 CRITICAL / 2 MAJOR / 4 MINOR. All auto-backlogged to `backlog-quality-findings.md` under `# analytics-week-export — 2026-09-29`.)*

### Strengths
- `AiIntervals` computes the window-independent part once per session and clips per window, and `ai_segments_for_window` stays a thin wrapper. The speedup changes no callers or tests, and the measured reason is recorded next to the code.
- `life_starts` is the only place the life rule is written down. `split_lives` and `dangling_sessions` both read it, so the two cannot drift. The separator comment names the frontend contract that depends on it.
- `time_analytics_query` is a thin `async` shell over `spawn_blocking` around a testable `run_analytics_query`. `MUST_STAY_ASYNC` works in both directions.
- The export CLI is cleanly layered (`parse_args` → `export_json` → `run_cli` with injected writers → `main`). `ExportError` maps to exit codes, stdout stays empty on failure, and there is a real-binary guard with a kill deadline.
- `dashboardOpenLive.test.tsx` renders the real component under jsdom and `mockIPC` rather than grepping the source, and has a tracking-OFF positive control.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`src-tauri/src/time_store/query.rs` `week_ai_minutes` doc] It says the sort figure (`ai_doing + subagent`) is "the `WEEK TOTAL` badge's figure". That is false: the badge is `projectWeekActive`, which sums three kinds including `ai_reasoning`. "AI family" therefore means two kinds in `query.rs` and three in `export.rs`. The three-kind correction never reached this comment. A maintainer who trusts it will "fix" the sort or the badge and silently change Neo's contract. Rename (e.g. `week_exec_minutes`) and correct the comment.
- [`src-tauri/src/time_store/export.rs` `week_total_min` / `painted_min`; `arch/time-analytics.md`] Both figures are Rust copies of the `weekMath.ts` formulas (`AI_KINDS` / `RENDER_ORDER` minus away), each written twice (minutes and ms). The test checks them against a third inline copy, which is circular and never touches `AI_KINDS`, yet the arch doc says the export and view "cannot drift". Put the family sums on `RollupCellMs` / `RollupCell` and anchor a test to the TS kind lists, or at least soften the arch claim.

**MINOR**
- [`query.rs` `WeekProjectMs.path`] The doc says "heaviest modal cwd", but `build_range` keeps the first non-empty per-day `path`, i.e. the earliest day's winner, not the week's heaviest.
- [`query.rs` life key] The life index is encoded as `{sid}~{N}` and re-parsed by `session_display_id` (`rsplit_once` plus a numeric check). This is a stringly-typed round trip; carry `(sid, life)` instead.
- [`export.rs` `ExportError::Db`] It also carries `build_week_ms` and serde failures, but is documented as "DB missing or unreadable". Add an `Internal` variant.
- [`dashboardState.ts` header] It still says "three mutually-exclusive display modes"; there are four now (`pending`). The JSDoc paragraph was not rewrapped.

### Assessment
The implementation is careful and leaves the code better. The speedup is output-identical by construction. The resumed-session fix is one pure primitive reached through a single grouping point. The main-thread freeze is fixed and pinned, and the CLI is a small testable surface with a real-binary guard. The debt is in cross-layer wording, not logic:
- The three-kind "AI family" correction didn't reach the `query.rs` sort key's doc.
- The "cannot drift" claim rests on a test that re-derives its own formula.

Both are cheap to fix, and both touch the surface an outside consumer now reads. Process note: four asks landed in one commit, so reverting any one of them on its own is harder.

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-09-28] Phase 2 > P2.2 — Pre-existing: a project's `path` is the alphabetically-first cwd of EVERY event in its bucket (`build_day`: `bucket.cwds.insert(e.cwd)` for every event, then `.iter().next()`). Native `cc-N` session ids are reused across workspaces and launches, so one native session carries stray rows from other projects' cwds. On 2026-09-25, `cc-10` had 3,484 scripture-reading rows and 6 `claudesk` rows, so scripture-reading's SidePanel shows `/Users/stayman/Personal/projects/claudesk`. This matters to Neo's export, which carries `path`. Folded into P2.2; logged as `SURFACE-2026-09-28-ANALYTICS-PROJECT-PATH-FROM-STRAY-CWDS`.
[SURFACED-2026-09-28] Phase 2 > P2.1b — The operator saw a ~0.5 s "Time tracking is off" flash on opening Analytics while tracking was ON. Cause: `GlobalDashboard` seeds `trackingEnabled` with `useState(false)`, and `dashboardMode` puts OFF first, so until the async `time_get_tracking_enabled` seed resolves the view asserts tracking is off. Folded into P2.1b.
[SURFACED-2026-09-28] Phase 2 > P2.1c — `time_analytics_query` is a SYNC `#[tauri::command]`, and those run on the main thread (CLAUDE.md, PiP/main-thread rule), so every analytics query freezes the whole app for its duration. `sync_commands_do_not_block.rs` sees only sleeps and blocking polls, not CPU-bound work. Folded into P2.1c.
[NOTE-2026-09-28] Teardown owed at the end of verification: set dev tracking back to `false` (it was `false` before), stop the dev build, and restore the dev DB from `tmp/devdb-backup-2026-09-28/` (sha-listed in `SHA`). — DONE 2026-09-29.

## Retrospect
- **What changed in our understanding:**
  - "Analytics is slow" was not the query. The 14-day window read in 97 ms; the Day **build** took 600 ms, because every day re-derived every session's intervals.
  - The missing scripture-reading row was not a capture gap. Its events were recorded, and the analytics dropped everything after a resumed session's first `SessionEnd` (104 sessions / 17,206 tool calls DB-wide).
  - A sync command's CPU-bound work freezes the main thread just as a sleep does, and the main-thread guard is structurally blind to it.
  - A read-only open of a WAL DB with no sidecars still creates `-shm` and an empty `-wal`, so the testable read-only property is "no data changed", not "no file changed".
- **Assumptions that held:** the export could reuse the Week builder with no new computation (the ms core is shared), and `build_week` was already fast enough across resumed sessions.
- **Assumptions that were wrong:**
  - "AI family" / `WEEK TOTAL` was assumed to be `ai_doing + subagent`. It is three kinds, including `ai_reasoning` (corrected at build; review-quality found the correction didn't reach the `query.rs` sort-key doc).
  - A project's `path` was assumed trustworthy. It was the alphabetically-first cwd of every event, stray rows included.
- **Approach delta:**
  - Phase 2 grew three leaves from verify-human and discoveries: P2.1b (the tri-state seed that kills the false "off" flash), P2.1c (async + `spawn_blocking`) and P2.2 (modal-cwd `path`).
  - verify-codify added a real-binary CLI test and a `MUST_STAY_ASYNC` table to the main-thread guard.
  - The Neo reply lives in both repos, per the operator.

