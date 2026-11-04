---
drive_mode: autopilot
---

# Feature: Paydown 2026-11-04 WP4: the single-run lock, main-thread commands and the sync guard

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-04
**Source:** `workflow-system/product/backlog-paydown-wbs.md` → WP4 (M16.5 WP8, a WBS 8.2 priority input)

## Problem Statement

The workflow-install wizard serializes every substrate touch behind one `InstallControl.running`
flag. `run_streaming` (`workflow_install::runner`) reads stdout to EOF with no deadline, so a child
that never exits, or a grandchild that keeps the stdout pipe open after the child exits, hangs the
run forever. The flag never clears, and every later install, uninstall and dry run returns "already
running" until the app is relaunched. The dry run makes it worse: it is a `#[tauri::command(async)]`
sync body, so the hang also occupies an async-runtime worker for good
(`09-23-QUALITY-DRY-RUN-ASYNC-ATTR-STILL-BLOCKS-A-RUNTIME-WORKER`). Separately, `trash_path` is a sync
command whose `trash::delete` shells out to `osascript`, which froze the UI for over 7 s
(`11-02-TRASH-PATH-BLOCKS-THE-MAIN-THREAD`). And `tests/sync_commands_do_not_block.rs`, the guard
that should catch both, is blind to them: it exempts every async command unconditionally
(`GUARD-EXEMPTS-EVERY-ASYNC-COMMAND-UNLISTED`), drops `cfg(not(test))` production items
(`GUARD-CFG-TEST-MATCH-DROPS-NOT-TEST-ITEMS`), never registers fns nested in impl methods or trait
default bodies, and cuts every argument of any call named `spawn` (`WP9-MINOR-BATCH` #2, #3). Two
adjudicator tests are environment-dependent or approximate (#4, #5).

## Decisions taken at plan time (autopilot: no plan-review pause, so they are disclosed here)

- **D-1: `workflow_uninstall_dry_run` becomes `pub async fn`, and the source guard's anchor moves
  with it.** The handoff said to keep the `pub fn workflow_uninstall_dry_run` text, but the anchor
  cannot survive the fix. A `(async)` sync body runs ON a runtime worker and has no way to `.await`
  a `spawn_blocking` handle. `block_on` inside a runtime worker panics, and `block_in_place` is an
  obscure tokio-only escape. The finding itself allows "or update that guard in the same change".
  So `every_substrate_touching_command_takes_the_single_run_lock` will anchor on
  `pub async fn workflow_uninstall_dry_run`, which keeps what it protects (the lock is taken in the
  body's first lines). This change is mutation-proven: deleting the `running.swap(true` makes it fail.
- **D-2: the timeout is reported as a non-zero exit, not a new error variant.** On the deadline,
  `run_streaming` returns `Ok((-1, output + "\n[timed out after Ns; process group killed]"))`. Every
  caller already maps a non-zero code to `CloneFailed` / `InstallFailed` / `ScriptFailed`, which
  carry the output verbatim, so `terminal.rs`'s reducer and the TS mirror stay unchanged.
- **D-3: per-call deadlines.** Clone 10 min, `install.sh` 10 min, real `uninstall.sh` 5 min, dry run
  60 s. These are generous because a deadline exists only to end a true hang. `(decision)` →
  Alignment question in Phase 1.
- **D-4: when the grace expires after the child exits, the group is killed too.** If the child
  has exited but a grandchild still holds a pipe after `DRAIN_GRACE`, the process group is SIGKILLed
  before returning, so nothing the installer started outlives the run. The adjudicator only kills on
  timeout. `(decision)` → Alignment question in Phase 1.
- **D-5: one `ASYNC_COMMANDS` table replaces `MUST_STAY_ASYNC`.** The WBS says to add `trash_path`
  to `MUST_STAY_ASYNC` AND to add an allowlist with reasons for async commands. Two tables would
  list the same names twice. So one table holds every async command, each with its reason, and it
  is guarded both ways:
  - an unlisted async command fails (new);
  - a listed command that is sync again, or names nothing, fails (what `MUST_STAY_ASYNC` did).
- **D-6: the stdout/stderr ordering is unchanged.** stdout streams live and stderr is replayed after
  the exit. That is the documented behaviour, and `stderr_and_stdout_both_reach_the_sink` /
  `output_arrives_in_order_line_by_line` pin it. Only the transport changes: the readers move to
  threads feeding one unbounded channel, so a reader never stops draining while the main loop polls
  `try_wait` and the deadline.

## Work Tree

- [x] Phase 1: A deadline and a group kill in `run_streaming`, and the dry run off the runtime worker
  **Observable outcomes:**
  - CLI: `cargo test --lib workflow_install::runner` passes and reports a non-zero `passed` count
    that includes these four new tests:
    - `a_child_that_never_exits_is_group_killed_at_the_deadline`: a script that `exec sleep 600`s
      with a grandchild writes the grandchild's PID to a temp file. `run_streaming` with a 1 s
      deadline returns within 5 s with code `-1`, the output contains `timed out`, and
      `kill(pid, 0)` on the grandchild fails (ESRCH).
    - `a_grandchild_holding_stdout_after_the_child_exits_does_not_wedge_the_run`: `sleep 600 &`
      then `exit 0`. Returns within 2 s with code `0`, and the grandchild is dead (D-4).
    - The run is driven on a thread with an outer `recv_timeout` watchdog, so a regression FAILS
      the test rather than hanging the suite.
    - `output_produced_before_the_deadline_is_kept`: lines printed before the kill are in the
      sink and in `combined`.
  - CLI (mutation, each individually, restored via `cp` + `shasum`):
    - remove the group kill on the deadline path → the grandchild-dead assertion FAILS;
    - remove the deadline check → the watchdog FAILS the test;
    - remove the grace-expiry kill → the D-4 test FAILS;
    - delete the dry run's lock-guard `Drop` body → the lock-release test FAILS.
  - CLI: `cargo test --lib workflow_install::commands` passes, including:
    - a test that the dry-run lock guard releases `running` on drop, both on a normal return and on
      an unwinding panic (`catch_unwind`);
    - `every_substrate_touching_command_takes_the_single_run_lock` anchored on
      `pub async fn workflow_uninstall_dry_run` (D-1). Mutation: delete that command's
      `running.swap(true` → it FAILS.
  - CLI: `tests/sync_commands_do_not_block.rs` passes, with `workflow_uninstall_dry_run` counted as
    async.
  - Live (MCP bridge, dev build; read-only): two back-to-back `ipc_execute_command`
    `workflow_uninstall_dry_run` calls both return within 60 s, and neither returns
    `already running`. A managed record gives the preview text; a developer/absent install gives the
    refusal message. Either way the second call matches the first.
  - CLI: `pnpm verify:auto` exits 0 (timeout 207000).
  **Alignment questions:**
  - (decision) D-3: deadlines of clone 10 min, `install.sh` 10 min, real uninstall 5 min, dry run
    60 s. Are any too tight for your network or machine?
  - (decision) D-4: when the child exits but a process it left behind still holds the output pipe,
    Claudesk kills that process group after 250 ms rather than leaving it running. Is that right for
    `install.sh`, which is not expected to leave a daemon behind?
  - [x] P1.1 `run_streaming(program, args, cwd, sink, deadline)`:
    - `process_group(0)`;
    - stdout/stderr reader threads feeding one unbounded `mpsc` channel tagged by stream;
    - the main loop does `recv_timeout` → forward stdout lines live and buffer stderr, then
      `try_wait`, then the deadline;
    - deadline → group kill + reap + `(-1, output + note)` (D-2);
    - after the child exits, wait up to `DRAIN_GRACE` for both readers' EOF; on expiry, group kill
      (D-4);
    - a stop flag on drop ends the readers.
    Reuse the adjudicator's `kill_tree` shape. Name crate-local helpers so that none is called
    `spawn` (the guard resolves calls by bare name).  <!-- status: done -->
  - [x] P1.2 Deadline constants per call site (D-3), passed from `run_install` / `run_dry_run` /
    `run_uninstall`. Rewrite the `run_streaming` doc: drop "reads until EOF" and state the deadline,
    the grace kill and the unchanged ordering (D-6).  <!-- status: done -->
  - [x] P1.3 The new runner tests and the watchdog harness from the outcomes above. Remove each test
    script's grandchild in teardown even when the test fails.  <!-- status: done -->
  - [x] P1.4 `workflow_uninstall_dry_run`:
    - `pub async fn`;
    - `running.swap(true` stays inline in its first lines;
    - a small RAII lock guard releases `running` on drop and is moved into the
      `tauri::async_runtime::spawn_blocking` closure, so the lock lives exactly as long as the
      blocking work, even if the IPC future is dropped;
    - map a `JoinError` to an honest string.
    Update its doc comment: the `(async)` paragraph and "no timeout on the wait" are now false.  <!-- status: done -->
  - [x] P1.5 Re-anchor `every_substrate_touching_command_takes_the_single_run_lock` (D-1). Check that
    the `worker_bodies` split on `std::thread::spawn` still counts exactly 2 (`spawn_blocking` is
    not that token). Add the lock-guard drop test.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → exit 0 in 54s. Vitest 282 files / 3680 tests; `cargo test` lib 1059 passed (includes the 3 new runner tests + the lock test); `sync_commands_do_not_block` 10 passed; clippy `--all-targets -D warnings` clean; `cargo fmt --check` clean. One pre-existing ESLint warning (`XtermPane.tsx:932`, untouched by this phase).
  - [x] verify-self  <!-- status: done -->
    Integration boundary: yes. `workflow_uninstall_dry_run` is an existing IPC command that the uninstall wizard consumes, and the live outcome drives it by name.
    - [x] runner tests — evidence: `cargo test --lib workflow_install::runner` → exit 0, "31 passed; 0 failed". The three new tests are ok, run behind `run_script_with_watchdog` / `recv_timeout`, and assert <5s / code -1 / "timed out" / PIDs dead, and <2s / code 3 / grandchild dead. `pgrep -fl "sleep 600"` was empty before and after. (Runner subagent.)
    - [x] commands tests — evidence: `cargo test --lib workflow_install::commands` → exit 0, "9 passed". The anchor is `pub async fn workflow_uninstall_dry_run`; the body does `running.swap(true` first, then moves `HeldRunLock` into `spawn_blocking`. (Runner subagent.)
    - [x] sync guard — evidence: `cargo test --test sync_commands_do_not_block -- --nocapture` → exit 0, "scanned 95 commands (87 sync, 8 async)", "10 passed". (Runner subagent.)
    - [x] mutations — evidence (run at build, each mutant individually, restored by `cp` and checked with `shasum`):
      - deadline kill removed → `a_child_that_never_exits…` FAILED;
      - deadline check disabled → that test and `output_produced_before…` FAILED;
      - grace kill removed → `a_grandchild_holding_stdout…` FAILED;
      - `HeldRunLock` Drop body emptied → `the_dry_runs_held_lock…` FAILED;
      - dry-run `running.swap` deleted → `every_substrate_touching_command…` FAILED.
    - [x] live (MCP bridge, agent-launched `pnpm tauri:dev`, read-only) — evidence: two sequential `invoke('workflow_uninstall_dry_run')` calls from the webview both returned the same refusal ("Claudesk has no record of installing this workflow system, so it will not remove it. … Nothing was changed.") in 1 ms each. Neither returned `already running`, so the lock was released through the real async command + `spawn_blocking` + `HeldRunLock`. ⚠️ This machine has no managed record, so the refuse-guard path ran and `run_streaming` was NOT reached live; the runner tests are what cover the deadline. The dev build was torn down by PID (exit 143 = the SIGTERM sent), and the bridge port 9223 was confirmed closed.
    - [x] verify:auto — evidence: `pnpm verify:auto` → exit 0, 54s (recorded under verify-auto).
    - [x] align: D-3 deadlines — evidence: `runner.rs` `CLONE_DEADLINE = from_secs(600)` (clone in `run_install`), `INSTALL_DEADLINE = from_secs(600)` (`install.sh` in `run_install`), `UNINSTALL_DEADLINE = from_secs(300)` (`run_uninstall`), `DRY_RUN_DEADLINE = from_secs(60)` (`run_dry_run`).
    - [x] align: D-4 grace kill — evidence: `DRAIN_GRACE = from_millis(250)`. The child-exit arm sets `grace_end = now + DRAIN_GRACE`, and the arm `Some((status, grace_end)) if Instant::now() >= grace_end => { kill_group(child.id()); break Some(status); }` follows; `kill_group` = `libc::kill(-pgid, SIGKILL)`.
  - [x] verify-human  <!-- status: done — operator approved both 2026-11-04 -->
    - [x] P1.verify-human.1 (decision) D-3 deadlines: clone 10 min, install.sh 10 min, real uninstall 5 min, dry run 60 s  <!-- status: done (approved) -->
    - [x] P1.verify-human.2 (decision) D-4 kill a left-behind pipe holder after 250 ms  <!-- status: done (approved) -->
  - [x] verify-codify  <!-- status: done -->
    Integration boundary: yes (`workflow_uninstall_dry_run`). The crate has no Tauri test harness, so the command's own worker step was extracted into `finish_on_worker(HeldRunLock, work)`, which the command calls and `the_dry_run_holds_the_lock_until_its_worker_finishes` drives. The test asserts the lock stays held WHILE the worker runs, is released after, and is released on a panic (which comes back as "stopped unexpectedly"). Mutants: `drop(lock)` at the start of the worker → FAILED; empty `HeldRunLock::drop` → FAILED. Both restored and checked with `shasum`. The earlier `the_dry_runs_held_lock_is_released_on_return_and_on_panic` was deleted as a strict subset (no failure involved, so no triage entry was needed). The runner's deadline, grace and kill tests were written and mutation-proven at build, so no duplicates were added. — evidence: `pnpm verify:auto` → exit 0, 51s; Vitest 3680 passed; cargo lib 1059 passed; `pgrep -fl "sleep 600"` empty.

- [x] Phase 2: `trash_path` off the main thread, the guard made honest, and the adjudicator test pins
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP4 is a WBS 8.2 priority input, and the four findings are still pending in the backlog.
  - Requirements unchanged: yes — Phase 1 changed only `workflow_install`; Phase 2's targets (`trash_path`, the guard, the adjudicator tests) are untouched.
  - Solution still feasible: yes — `trash::delete` on macOS shells out to `osascript` (trash 5.2.6 `delete_using_finder`), so it is safe off the main thread.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --test sync_commands_do_not_block` passes with a non-zero `passed` count, and
    its `scanned N commands (S sync, A async)` line shows `A` equal to the `ASYNC_COMMANDS` length
    (9 expected: the 7 existing async commands, `workflow_uninstall_dry_run` and `trash_path`).
    Use `--nocapture`.
  - CLI: these new analyzer fixture tests pass, and each one's mutant individually makes it FAIL:
    - `a_cfg_not_test_item_is_production_and_is_scanned`: a `#[cfg(not(test))]` blocking helper
      called by a sync command flags. Mutant: the old any-token `is_cfg_test` → FAILS.
    - `a_cfg_any_test_or_feature_item_is_production` flags too. `#[cfg(test)]` and
      `#[cfg(all(test, unix))]` stay test-only, and the existing `test_only_code_is_not_part_of_the_graph`
      still passes.
    - `a_fn_nested_in_an_impl_method_or_trait_default_body_is_registered`: a sync command calling
      a method whose body declares and calls a nested blocking fn flags. Mutant: drop the new
      `add_nested` calls → FAILS.
    - `only_closure_arguments_of_spawn_are_cut`: `Helper::spawn(slow())` with a non-closure
      blocking argument flags, while `thread::spawn(move || slow())` still does not. Mutant: the
      old skip-all-args rule → FAILS.
    - `an_unlisted_async_command_fails_the_async_ledger` and
      `a_listed_command_that_is_sync_or_missing_fails_the_async_ledger`: run the extracted ledger
      check over fixtures. Mutant: drop either direction → its test FAILS.
  - CLI: deleting `async` from `trash_path` (making it sync again) FAILS the live guard with
    "is SYNC again".
  - CLI: `cargo test --lib adjudicator` passes:
    - the timeout-phrase test now uses the `regex` crate pattern `(?i)timed? ?out`, the exact
      port of the TS classifier. It also asserts that `OutputTooLarge`'s message does NOT match.
      Mutant: reword `TimedOut` to "deadline passed" → FAILS.
    - the worker-hop test is deterministic: it drives the command's real `spawn_blocking` hop
      against a program path that cannot exist, and asserts the not-found branch only.
  - Live (MCP bridge + `sample`, dev build; state-changing, declared: creates and then trashes
    `tmp/scratch/wp4-trash-probe/` with a nested file):
    - while `ipc_execute_command trash_path` runs, a concurrent `webview_execute_js` returns in
      under 1 s;
    - a `sample` of the dev PID during the trash shows no main-thread frame under `trash_path`,
      `trash::` or `wait`;
    - positive control: the same probe against the pre-change sync `trash_path` (HEAD copy swapped
      in under `tauri:dev`, then restored with `shasum`) shows the stall
      (`[[verify-main-thread-freeze-via-sample]]`);
    - Finder's Trash lists `wp4-trash-probe` (an `osascript` Finder query, never `ls ~/.Trash`).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none
  - [x] P2.1 `editor_fs::commands::trash_path` becomes `pub async fn` with `spawn_blocking`, moving
    the `AppHandle` and the owned strings in. Update its doc: why async, and why the guard cannot
    see `trash::delete` (an `osascript` subprocess inside an external crate).  <!-- status: done -->
  - [x] P2.2 `ASYNC_COMMANDS` (D-5): every async command, with a reason. Extract the two-way check
    into a pure fn the fixture tests can call. Replace `MUST_STAY_ASYNC`, and rewrite
    `async_commands_are_exempt_in_both_spellings` to match.  <!-- status: done -->
  - [x] P2.3 `is_cfg_test`: parse the cfg meta with `syn`. Test-only means exactly `test`, or
    `all(…)` containing `test`. Add the fixtures.  <!-- status: done -->
  - [x] P2.4 `add_nested` for `ImplItem::Fn` bodies and trait default bodies. In both
    `visit_expr_call` and `visit_expr_method_call`, cut only `Expr::Closure` / `Expr::Async`
    arguments of a `SPAWN_BOUNDARIES` call, and walk the receiver and every other argument. Keep the
    `cc_kill` cut: `the_pre_fix_cc_kill_shape…` and `work_handed_to_a_worker…` still pass. Run the
    live guard and triage anything the widened graph newly flags: fix it, or ledger it with a reason.  <!-- status: done -->
  - [x] P2.5 Docs:
    - the guard's module doc "What this does NOT cover" names the remaining async gap (an async
      command's body is reviewed through its `ASYNC_COMMANDS` reason, not scanned, so a blocking
      call later added to a listed async command is not seen);
    - "What is cut" says closure/async arguments only;
    - `docs/lessons/pip-nspanel-main-thread.md` → "What it cannot see" names the same gap as a
      pointer to the guard doc, not a restatement.  <!-- status: done -->
  - [x] P2.6 Adjudicator #5: the regex port + the negative `OutputTooLarge` assertion, and fix the
    Display comment's "must not contain 'timed out'" to the real rule. #4: factor the command's
    `spawn_blocking` hop into a helper both the command and the test drive, then pin the not-found
    branch against a nonexistent program.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (run 2) -->
    — evidence (run 1): `pnpm verify:auto` → exit 101 at the clippy step: "the following explicit lifetimes could be elided: 'ast" in `tests/sync_commands_do_not_block.rs` `visit_spawn_args`. A code bug (lint), back to build (F9). Vitest 3680 passed before that step.
    — fix: dropped the elidable `'ast` lifetime from `visit_spawn_args`. `cargo clippy --all-targets -D warnings` → exit 0 after a `touch` forced a re-check.
    — evidence (run 2): `pnpm verify:auto` → exit 0 in 51s. Vitest 282 files / 3680 tests; cargo lib 1060 passed; `sync_commands_do_not_block` 16 passed; clippy `--all-targets -D warnings` and `cargo fmt --check` clean. The one pre-existing ESLint warning (`XtermPane.tsx:932`) is untouched.
  - [x] verify-self  <!-- status: done -->
    Integration boundary: yes. `trash_path` is an existing IPC command that the file tree's folder-delete calls; the live outcome drives it by name.
    - [x] guard live run — evidence: `cargo test --test sync_commands_do_not_block -- --nocapture` → exit 0, "16 passed", "scanned 95 commands (86 sync, 9 async)". The `ASYNC_COMMANDS` table has 9 entries, matching a grep of `#[tauri::command]`+`async fn` (9) and `tauri::command(async)` (0). (Runner subagent.)
    - [x] fixture tests — evidence: all 6 new tests and the 3 pre-existing anchors are ok in the same run, and each one's assertions match its name. (Runner subagent.)
    - [x] trash_path shape — evidence: `pub async fn trash_path`, with `validate_frontend_root` + `trash_path_core` inside `spawn_blocking` (editor_fs/commands.rs:107-111). (Runner subagent.)
    - [x] adjudicator — evidence: `cargo test --lib adjudicator` → "25 passed". `ts_classifies_as_timeout` = `(?i)timed? ?out`, matching `adjudicator.ts:267`. The worker-hop test uses a nonexistent binary and `/bin/sleep 5`@50ms. (Runner subagent.)
    - [x] docs — evidence: the guard's "What this does NOT cover" names the async-body gap; "What is cut" says closure/async args only; the lesson's "What it cannot see" points to the guard doc as canonical. (Runner subagent.)
    - [x] mutations — evidence: run at build, each individually (see the Phase 2 build notes in Current Node).
    - [x] live, no main-thread freeze (MCP bridge + `sample`, agent-launched `pnpm tauri:dev`, declared state change: probe dirs under `tmp/scratch/scratch-a/` trashed):
      - Post-fix: a chain of 80 sequential `invoke('trash_path')` calls (`wp4-new-1..80`) ran 11.9 s, 80/80 ok, 0 errors. A `sample 91181 3` taken mid-chain (19 dirs still left at its end) shows `trash_path_core → trash::delete → delete_using_finder` on a `tokio-rt-worker` thread in 2578/2597 samples, with **0** trash frames under the main thread (its only `claudesk_lib` frame is `claudesk_lib::run`).
      - Positive control: `editor_fs/commands.rs` was swapped to `git show HEAD:` (sync `trash_path`) under tauri:dev's hot rebuild. The log shows "Finished … Running"; the new PID is 98570, and `cargo run` exec-replaces, which is why its start time predates the build. The same 80-trash chain (`wp4-head-*`, 11.8 s, 80/80) gave `trash_path_core` frames under `com.apple.main-thread` in **2110/2491** samples and **0** on tokio workers. Restored via `cp` + `shasum -c` → OK.
      - The bridge's own "Script execution timeout" on the firing call is the known invoke-script artifact, not a freeze signal.
    - [x] trash landed — evidence: `osascript … count items of trash` went 12 → 173 (+161 = 1 single-probe + 80 + 80, all `wp4-*`), and `wp4-trash-probe-new` is listed. The leftover untrashed `wp4-trash-probe-head` was removed. Teardown was by PID (exit 143 = SIGTERM sent), and ports 9223/1420 were confirmed closed.
    - [x] verify:auto — evidence: `pnpm verify:auto` → exit 0, 51s (run 2, recorded under verify-auto).
  - [x] verify-human  <!-- status: done — operator approved 2026-11-04 -->
    - [x] P2.verify-human.1 (b) D-5 in action: one `ASYNC_COMMANDS` table (9 entries, guarded both ways) replaces `MUST_STAY_ASYNC` — still what you want?  <!-- status: done (approved) -->
  - [x] verify-codify  <!-- status: done -->
    Integration boundary: yes (`trash_path`). Coverage review: every guard behaviour already has a fixture test written and individually mutation-proven at build. `trash_path` staying async is pinned by `ASYNC_COMMANDS` (mutant "sync again" → the live guard FAILED). The adjudicator pins each had their mutant die. No duplicate tests were added. The real `trash_path` command (and its AppHandle) cannot be driven from a test, because the crate has no Tauri test harness. The no-freeze property is observable only live, and is recorded under verify-self with a positive control. The static half is the guard. — evidence: `pnpm verify:auto` → exit 0, 46s; Vitest 3680; cargo lib 1060; `sync_commands_do_not_block` 16 passed; no leftover `sleep` processes.

## Closes on ship (CHANGELOG `**Backlog resolved:**` + delete-on-resolve, both backlog files)

- `SURFACE-2026-09-23-QUALITY-DRY-RUN-ASYNC-ATTR-STILL-BLOCKS-A-RUNTIME-WORKER` (Phase 1)
- `SURFACE-2026-11-02-TRASH-PATH-BLOCKS-THE-MAIN-THREAD` (Phase 2)
- `SURFACE-2026-09-23-QUALITY-GUARD-EXEMPTS-EVERY-ASYNC-COMMAND-UNLISTED` (Phase 2)
- `SURFACE-2026-09-23-QUALITY-GUARD-CFG-TEST-MATCH-DROPS-NOT-TEST-ITEMS` (Phase 2)
- `SURFACE-2026-09-23-QUALITY-WP9-MINOR-BATCH`: **partial**. Items #2–#5 close here. #1 (the
  lesson doc as a pointer) is not in WP4's list, so rewrite the entry to #1 only, unless P2.5's doc
  edit fully satisfies it. Re-check at finalize.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality
- **Build notes (Phase 2):** each mutant was run individually and restored with `cp` + `shasum`. Results:
  - the tokenized `is_cfg_test` (the original code) → `only_cfg_test_and_cfg_all_test…` FAILED;
  - a substring `.contains("test")` matcher → both cfg tests FAILED;
  - `add_nested` dropped for impl and for trait default bodies, each → the nested test FAILED;
  - the spawn arg cut reverted, for the call form and the method form, each → the spawn test FAILED;
  - each direction of the async ledger dropped → its test FAILED;
  - `trash_path` sync again → the live guard FAILED with "trash_path is SYNC again";
  - `TimedOut` reworded → both timeout tests FAILED;
  - `OutputTooLarge` saying "timeout" → FAILED;
  - the worker hop swallowing the error → FAILED.
  The first cfg mutant attempt did not compile (an invalid probe); it was redone with the original code verbatim. The widened graph: 31 → 32 crate fns reach a seed, with no new flagged command. Live guard: "scanned 95 commands (86 sync, 9 async)".
- **Build notes (Phase 1):** all five runner/lock mutants were run individually and each made its test FAIL (deadline kill, deadline check, grace kill, `HeldRunLock` Drop body, dry-run `running.swap`); the file was restored by `cp` and checked with `shasum`. A watchdog-failed mutant leaked two `sleep 600` processes (they were killed). `output_produced_before_the_deadline_is_kept` now records its PID, so a failure cannot leak again. The sync guard now reports 8 async commands.
- **Blocked:** none
- **Unvisited:** review-quality, finalize
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-04] feature-plan — wbs.md exceeds size guard (483 lines), read headings only; this WP's source is `backlog-paydown-wbs.md` → WP4, read in full.
- [SURFACED-2026-11-04] P2.3 — `GUARD-CFG-TEST-MATCH-DROPS-NOT-TEST-ITEMS`'s stated failure case did NOT reproduce. proc_macro2 renders `not(test)` as `not (test)`, so the whitespace token is `(test)`, never `test`, and the original matcher kept `cfg(not(test))` items. The real latent defect pointed the other way: `cfg(all(test, …))` items were treated as PRODUCTION code (false positives, visible), and correctness rested on Display formatting. The parsed `cfg_is_test_only` fixes both. The mutant that now dies is the original tokenized matcher (via the `all(test, unix)` fixture); the `not(test)` fixture kills a plain substring matcher. Closure note for finalize; nothing new for the backlog.
- [SURFACED-2026-11-04] P2.6 — the old Rust copy of the TS `/timed? ?out/i` classifier missed `timeout` (no space, no d), and the negative `OutputTooLarge` test missed `time out` / `timedout`. Both now use one exact `regex` port, pinned by `the_ported_classifier_matches_every_spelling_the_ts_one_does`. Closure note; nothing new for the backlog.
