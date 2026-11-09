---
drive_mode: autopilot
---

# Feature: Paydown 2026-11-08 WP6 — shared subprocess primitives

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-09

## Problem Statement
`workflow_install::runner` and `adjudicator` each carry their own copy of the process-group primitives (`StopOnDrop`, a 250 ms `DRAIN_GRACE`, group-SIGKILL → kill → reap), and only the adjudicator documents what the group kill cannot reach. The runner also learned none of the adjudicator's lessons: it has no output cap (a pipe flood was measured at 1.9 GB next door) and its grace-expiry exit drops lines still queued in the channel. Separately, `workflow_install/commands.rs` releases its single-run lock three different ways (four manual `running.store(false)` on early returns), and the `spawn_blocking(...).await.map_err(...)` hop is hand-written at every async command. Consolidate each into one shared implementation without changing any command's observable behavior, keep `sync_commands_do_not_block.rs` green for the right reason, and close the five WP4 code-quality findings.

Problem statement unchanged (2026-11-09, F12 back-loop, ruling C): the ruling refines WHAT the cap keeps; bounded memory without throttling the pipe is still the goal.
Problem statement unchanged (2026-11-09, F9b back-loop): the gap was missing consuming-surface outcomes, not the design.
Problem statement unchanged (2026-11-09, F9 back-loop): the failure was `cargo fmt` formatting only, and the design is untouched.

**Source:** `workflow-system/product/backlog-paydown-wbs.md` → "WP6" (feature path, D5). Findings: `backlog-quality-findings.md` → `# paydown-2026-11-04-wp4-run-lock-and-sync-guard — 2026-11-04` (1 MAJOR + 4 MINOR) and the BL pointer stub. No 3rd-party dependency.

**Decisions taken at plan time (no spec):**
- **D-a. `Drain` (the adjudicator's capped byte buffer) and `run_streaming`'s live line sink stay SEPARATE.** The finding itself justifies it: one is a bounded buffer read after exit, the other delivers each line live. Only the primitives beneath them are shared.
- **D-b. The runner's cap reuses the adjudicator's 4 MiB, applied to the accumulated `combined` output (stdout + stderr), by DISCARDING past the cap and appending one truncation note, never by backpressure on the pipe.** The sink keeps receiving lines live up to the cap; past it, lines are dropped from both the sink and the result. ⚠️ The adjudicator keeps its own semantics (an over-cap stdout is an `Err`, never a truncated `Ok`), because a verdict cut off would look complete.
- **D-c. The `spawn_blocking` helper is generic over the work's `Result<T, String>`** and maps a join error to `"<what> stopped unexpectedly: <e>"`, with one wording for every site.

## Work Tree

- [x] Phase 1: one `subprocess` module; the runner gains the cap and the grace drain
  **Observable outcomes:**
  - CLI: `grep -rn "struct StopOnDrop\|const DRAIN_GRACE\|fn kill_tree\|fn kill_group\|fn kill_and_reap" src-tauri/src` lists each name exactly ONCE, all in `src-tauri/src/subprocess/mod.rs`.
  - CLI: `cargo test --lib subprocess::` exits 0 with ≥1 test per primitive (group kill reaches a grandchild; `kill_and_reap` leaves no zombie; `StopOnDrop` sets on every drop). The run must print a non-zero `N passed` (a filtered run printing `0 passed` exits 0 too).
  - CLI: `cargo test --lib workflow_install::runner::` and `cargo test --lib adjudicator::` exit 0 with the same test count as at HEAD (55 between them) PLUS the new ones.
  - CLI: a new runner test emits a burst of lines, then backgrounds a pipe holder and exits; the result carries EVERY burst line (it fails at HEAD's grace-expiry arm, proven by running HEAD's code with the new test).
  - CLI: a new runner test floods stdout past the cap; it returns within its deadline, `combined.len()` stays ≤ cap + note, and the output ends with the truncation note.
  - CLI: `cargo test --test sync_commands_do_not_block` exits 0, and its `LEDGER` / `ASYNC_COMMANDS` entries are re-read by name after the move (the guard is transitive; a helper that moved must not take a blocking call out of its view).
  - CLI (consuming surface — the install commands' worker bodies): `cargo test --lib -- workflow_install::runner::tests::a_successful_run_clones_installs_and_records workflow_install::runner::tests::a_successful_uninstall_runs_the_script_removes_the_clone_and_deletes_the_record_last --exact` reports `2 passed`. `run_install` / `run_uninstall` are what the `workflow_install_start` / `workflow_uninstall_start` workers call, run end to end against a real fixture git repo and its `install.sh` / `uninstall.sh` in a temp sandbox, through the reworked `run_streaming`.
  - Browser (consuming surface, dev app via the `tauri` MCP bridge; state-changing: launches `pnpm tauri:dev`): `ipc_execute_command supervisor_adjudicate {model:"zz-not-a-model", prompt:"x", timeoutMs:30000}` returns an error string starting `claude -p exited`. That is `run_command` spawning the real `claude` in its own group in the running app and returning the failure through the shared primitives. ⚠️ It may make one tiny paid request.
  **Alignment questions:**
  - (decision) The runner's truncation: a 4 MiB cap on accumulated install/uninstall output, past which lines are dropped and one note `[output truncated at 4 MiB; later lines were dropped]` is appended. Is dropping the TAIL right (you'd keep the start of a failing `install.sh`'s output, not its end)?
  - [x] P1.1 `src-tauri/src/subprocess/mod.rs`: `spawn_in_group(cmd)` (sets `process_group(0)`), `kill_group(pgid)`, `kill_and_reap(&mut Child)`, `StopOnDrop`, `DRAIN_GRACE`, `MAX_OUTPUT`, and the "what this does NOT do" doc moved from the adjudicator (generalized to both callers); register in `lib.rs`
  - [x] P1.2 Point `adjudicator` at it (delete its `StopOnDrop`, `DRAIN_GRACE`, `kill_tree`, `MAX_OUTPUT`; `Drain` stays)
  - [x] P1.3 Point `workflow_install::runner` at it (delete its copies); add the `try_recv` drain to the grace-expiry arm
  - [x] P1.4 Cap `run_streaming`'s accumulated output per D-b
  - [x] P1.5 Tests: the primitives' own; the burst-then-background test; the flood test
  - [x] verify-auto
    - FAILED first run 2026-11-09: `cargo fmt --check` (formatting only) → F9 → `cargo fmt` → re-run below.
    — evidence: `pnpm verify:auto` → exit 0 (50 s): lint 0 errors (the pre-existing XtermPane warning), format:check clean, tsc clean, check:link ok, vitest `295 files / 3825 passed`, `cargo fmt --check` clean, `cargo clippy --all-targets -D warnings` clean, cargo test `1123 passed, 0 failed`.
    — evidence: `tests/sync_commands_do_not_block.rs` → `16 passed`; `git diff --stat` on it is empty (LEDGER and ASYNC_COMMANDS unchanged, and none of their entries names a moved primitive).
    — evidence (after ruling C, F12): `pnpm verify:auto` → exit 0 (53 s): vitest `295 / 3825 passed`, fmt + clippy clean, cargo test `1126 passed, 0 failed` (+3 net tests), `sync_commands_do_not_block` `16 passed`.
    — evidence (after the F9b outcome amendment): `find src src-tauri/src src-tauri/tests src-tauri/Cargo.toml package.json -newer verify6b.log` → 0 files, so the green gate above still stands for the unchanged code; the new consuming-surface CLI outcome was pre-run in build → `2 passed`.
    — evidence: `grep -rn "struct StopOnDrop|const DRAIN_GRACE|fn kill_tree|fn kill_group|fn kill_and_reap|const MAX_OUTPUT" src-tauri/src` → each defined once, in `src-tauri/src/subprocess/mod.rs` (`kill_tree` gone).
  - [x] verify-self
    - (first attempt FAILED on the integration-boundary rule → F9b added the consuming-surface outcomes; no code change)
    - [x] primitives defined once — evidence: grep → `subprocess/mod.rs:33 DRAIN_GRACE`, `:49 kill_group`, `:61 kill_and_reap`, `:70 StopOnDrop`; no `fn kill_tree` anywhere (runner subagent)
    - [x] `cargo test --lib subprocess::` — evidence: `5 passed; 0 failed`
    - [x] runner + adjudicator groups — evidence: `cargo test --lib -- workflow_install::runner:: adjudicator::` → `60 passed` (HEAD 56 + 4)
    - [x] burst kept through the drain-grace exit — evidence: exact-name run → `1 passed` (and in build: FAILS 3/3 with the drain removed)
    - [x] flood truncated with one note — evidence: exact-name run → `1 passed`
    - [x] sync guard — evidence: `cargo test --test sync_commands_do_not_block` → `16 passed`; `git diff --stat` on it empty; no LEDGER/ASYNC entry names a moved primitive
    - [x] consuming surface, install workers — evidence: `run_install` + `run_uninstall` end-to-end tests by exact name → `2 passed`
    - [x] consuming surface, `supervisor_adjudicate` in the running dev app (orchestrator-driven; the MCP bridge is not exposed to subagents) — evidence: `pnpm tauri:dev` launched with the Claude-marker `env -u` strip; `ipc_execute_command` refused the command ("Unsupported Tauri command"), so it was invoked via `window.__TAURI_INTERNALS__.invoke('supervisor_adjudicate', {model:'zz-not-a-model', prompt:'x', timeoutMs:30000})` → rejected in 2501 ms with `claude -p exited 1 ([claude-code:unrecognized_model] {"model":"zz-not-a-model","query_source":"sdk"})`. The real `claude` was spawned, exited non-zero, and its stderr came back through `Failed` (a broken spawn reads "not found" / "timed out"). Dev build stopped afterwards (own PID only).
    - **Re-check after ruling C (runner subagent, 2026-11-09):**
      - [x] runner + adjudicator + subprocess — evidence: `68 passed; 0 failed`
      - [x] flood keeps start + note + last lines — evidence: exact-name run → `1 passed` (prefix 1,2,3… gap-free; one note `[output truncated at 4 MiB; <dropped> later lines were dropped, the last <shown> follow]`; tail 699801…700000)
      - [x] flooding script that fails still shows why it died — evidence: exact-name run → `1 passed` (`seq 1 700000; echo '…permission denied' >&2; exit 1` → exit 1, error is the last line)
      - [x] tail bounded per stream; nothing dropped → no note — evidence: `2 passed`
      - [x] burst test still passes — evidence: `1 passed`
      - [x] consuming surface, install workers — evidence: `run_install` + `run_uninstall` → `2 passed`
      - [x] sync guard — evidence: `16 passed`
      - side note from the runner: on a TIMEOUT, the `timed out` note follows the tail, so it (not stderr's error) is the last line. Intended: the timeout is then why the run ended, and the script's last words sit just above it.
      - [x] align: (decision, re-presented) per-stream tails (200 lines / 64 KB EACH, worst case ≈128 KB) instead of one shared 64 KB tail — evidence: the `struct OutputBudget` doc comment explains the measured eviction; `TAIL_LINES = 200`, `TAIL_BYTES = 64 * 1024`, both per stream
    - [x] align: (decision) runner truncation keeps the HEAD, drops the TAIL — evidence: note text `[output truncated at 4 MiB; later lines were dropped]` (`truncation_note`, built from `MAX_OUTPUT`); `OutputBudget::admit` stops at the first line that does not fit and admits nothing after, so a clean prefix is kept.
  - [x] verify-human
    - [x] P1.verify-human.1: (decision) the runner's 4 MiB truncation — RESOLVED: ruling C (start + note + last lines), then A on the re-presentation: per-stream tails (200 lines / 64 KB each) accepted 2026-11-09
      - Operator ruling 2026-11-09: **C — keep the start AND a short tail.** Keep A's clean 4 MiB prefix; also keep a rolling buffer of the last ~200 dropped lines (capped at 64 KB); after the budget runs out, append one note giving the dropped-line count, then the tail. Live log and result must stay identical (the tail is sent to the sink at the end, with the stderr batch). Memory stays bounded at ~4 MiB + 64 KB. Why: a flooded AND failing `install.sh` must still show why it died (`set -e`'s error comes last).
      - Built 2026-11-09: `OutputBudget` keeps the clean prefix plus a rolling tail; `finish()` returns the note `[output truncated at 4 MiB; N later lines were dropped, the last M follow]` and then the tail, sent to the sink AND the result. ⚠️ **Deviation found by test, to confirm with the operator:** a SINGLE shared tail failed `a_flooding_script_that_fails_still_shows_why_it_died`. Lines arrive in reader-thread delivery order, so the stderr error (delivered at once) entered the tail early and was evicted by megabytes of earlier stdout the other reader was still delivering. So the tail is **per stream** (200 lines / 64 KB EACH; stdout's tail, then stderr's), which puts stderr last, as on an untruncated run. Worst-case tail ≈ 128 KB, not 64 KB. Tests: `a_flood_past_the_cap_keeps_the_start_a_note_and_the_last_lines` (seq 1..700000: clean prefix 1,2,3…, exactly one note with the right counts, tail = 699801…700000, sink == result), `a_flooding_script_that_fails_still_shows_why_it_died` (flood, stderr error, exit 1 → the error is the last line; FAILED on the shared-tail version), `the_tail_is_bounded_in_lines_and_in_bytes_per_stream`, `nothing_dropped_means_no_note_and_no_tail`. 68 passed ×3; clippy clean.
  - [x] verify-codify
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 44 s, history ≤ 135 s, under 300 s); not the last phase (Phase 2 NOT-STARTED)
    — evidence: `pnpm verify:auto` → exit 0 (55 s): vitest `295 / 3825 passed`, cargo `1126 passed, 0 failed`, fmt + clippy clean.
    — no new tests needed: every verified behavior already has a discriminating test written in build (subprocess ×5; burst [FAILS without the grace drain]; flood + failing-flood [FAILED on the shared-tail version]; tail bounds ×2; long line; invalid UTF-8 [FAILS with stop-on-invalid-UTF-8: `left: []`, checked here]); the consuming surface is covered by the `run_install` / `run_uninstall` end-to-end tests and the adjudicator's `on_worker` command-hop test.

- [x] Phase 2: one way to take and release the run lock; one `spawn_blocking` hop
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP6 resolves all 5 WP4 findings; 3 of them are this phase
  - Requirements unchanged: yes — ruling C touched only Phase 1's runner cap
  - Solution still feasible: yes — no dependency on Phase 1's open items
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `grep -n "running.store(false" src-tauri/src/workflow_install/commands.rs` (production code, tests excluded) returns exactly ONE line, inside `HeldRunLock`'s `Drop`.
  - CLI: `grep -n "running.swap(true" src-tauri/src/workflow_install/commands.rs` (production code) returns exactly ONE line, inside `HeldRunLock::try_acquire`.
  - CLI: the moved run-lock guard (formerly `every_substrate_touching_command_takes_the_single_run_lock`) passes, and FAILS on each of three individually applied mutants: one per command, with its `HeldRunLock::try_acquire` call removed (landing confirmed).
  - CLI: an existing-behavior test: a second `workflow_install_start` while one runs is refused with "an install is already running", and the lock is free again after an early error return (a relative `dest`), exercised through the commands' own code, not a re-implementation.
  - CLI: `grep -rn "spawn_blocking(" src-tauri/src` (production code) returns exactly ONE call, inside the shared helper; every former site calls the helper.
  - CLI: `cargo test --test sync_commands_do_not_block` exits 0; `ASYNC_COMMANDS` still lists the same commands.
  - Browser (dev app via the `tauri` MCP bridge): with `pnpm tauri:dev` running, `ipc_execute_command supervisor_adjudicate {model:"zz-not-a-model", prompt:"x", timeoutMs:30000}` returns an error string starting `claude -p exited`. This proves the real command still crosses the helper hop and spawns `claude` through the shared primitives in the running app. ⚠️ It may make one tiny paid `claude -p` request.
  **Alignment questions:**
  - none
  - [x] P2.1 `HeldRunLock::try_acquire(&Arc<InstallControl>) -> Option<HeldRunLock>`; `RunGuard` holds a `HeldRunLock` instead of releasing in its own `Drop`; the three commands take it once; the four manual releases go
  - [x] P2.2 Move the run-lock guard to assert `HeldRunLock::try_acquire` (and keep the "release only in `HeldRunLock`'s Drop" guard), then mutation-prove it per command
  - [x] P2.3 The shared blocking-worker helper; migrate every same-shape site (`trash_path`, `on_worker`, `finish_on_worker`, and `config_store` / `time_store` if they match)
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 0 (52 s): vitest `295 / 3825 passed`, fmt + clippy clean, cargo `1131 passed, 0 failed` (+5), `sync_commands_do_not_block` `16 passed`, its file unchanged (`git diff --stat` empty).
    — evidence: in production `commands.rs`, `running.swap(true` → 1 (in `try_acquire`) and `running.store(false` → 1 (in `HeldRunLock`'s Drop); `spawn_blocking(` across `src-tauri/src` → 1 (in `blocking.rs`).
  - [x] verify-self
    - [x] one release site — evidence: production `commands.rs` (before `#[cfg(test)]`, comments excluded) → `running.store(false` ×1, line 366 in `impl Drop for HeldRunLock` (runner subagent)
    - [x] one take site — evidence: `running.swap(true` ×1, line 357 in `fn try_acquire`
    - [x] the moved run-lock guard passes — evidence: exact-name run → `1 passed`; table install→`begin_install(`, uninstall→`begin_uninstall(`, dry-run→`HeldRunLock::try_acquire(`, `begin_*`→`try_acquire(`, plus the exactly-one counts (mutation-proven per command in build)
    - [x] consuming surface, the commands' synchronous half — evidence: `a_second_run_is_refused…` + `an_early_refusal…` → `2 passed`; `workflow_install_start` calls `begin_install(control.inner(), &dest)?` (l.276), `workflow_uninstall_start` calls `begin_uninstall(control.inner())?` (l.454)
    - [x] one `spawn_blocking` — evidence: the only call is `blocking.rs:16`; all 5 callers (`trash_path`, `profile_delete`, `time_analytics_query`, `on_worker`, `finish_on_worker`) call `crate::blocking::on_blocking_worker(`
    - [x] `blocking::` — evidence: `3 passed`
    - [x] sync guard — evidence: `16 passed`, file unchanged, ASYNC_COMMANDS still lists all 5
    - [x] affected modules — evidence: `454 passed; 0 failed`
    - [x] consuming surface, `supervisor_adjudicate` live (orchestrator; dev build launched with the marker strip, PID 83873 started after a fresh build) — evidence: `invoke('supervisor_adjudicate', {model:'zz-not-a-model', …})` → rejected in 2553 ms with `claude -p exited 1 ([claude-code:unrecognized_model] {"model":"zz-not-a-model","query_source":"sdk"})`, now via `on_blocking_worker`
    - [x] extra consuming surface, `time_analytics_query` live (read-only) — evidence: bad scope `"all"` → `time_analytics_query: unsupported scope "all" (only "global" is implemented in v1)` (the work's own error passes through the helper unchanged); `{scope:'global', window:{kind:'day'}}` → OK in 2 ms, payload keys `kind,label,projects,meta,hour_range_by_day,day_window,iso,hour_range`. Dev build stopped (own PID).
    - `trash_path` / `profile_delete` were not driven live (they move things to the Trash, which the plan did not declare); their hop is the same helper, covered by `blocking::` and the live calls above.
  - [x] verify-human — zero admissible leaves (F11); feature floor met by P1.verify-human.1
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → exit 0 (50 s): vitest `295 / 3825 passed`, cargo `1131 passed, 0 failed`, fmt + clippy clean.
    — no new tests needed: every Phase 2 behavior has a mutation-proven test from build (refusal + early release through `begin_*`; exactly-one take/release counts; release-before-emit order; `blocking::` ×3; the dry run's panic-releases-the-lock test now crosses the helper).

## Ship notes
- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` exit 0, 3825 vitest / 1131 cargo); nothing changed since. Fast checks re-run at ship: `cargo fmt --check` clean, `pnpm lint` 0 errors (the XtermPane warning is pre-existing), `pnpm format:check` clean.
- Committed locally on `main`, not pushed (pushing is the operator's call).
- ⚠️ **GUI-PATH smoke owed at the next `/release`:** the adjudicator's `claude -p` spawn is install-sensitive, and the suite cannot see a GUI-PATH regression. The installed build's `supervisor-activity.log` must show at least one `adjudicator (model): …` verdict. Carry this into the relevant backlog entry at fold-back.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality against the ship commit
- **Blocked:** none
- **Unvisited:** none (Phase 2 is the last)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Build notes — Phase 1
- `src-tauri/src/subprocess/mod.rs`: `in_own_group`, `kill_group`, `kill_and_reap`, `StopOnDrop` (+ `flag()`), `DRAIN_GRACE`, `MAX_OUTPUT`, and the group-kill limits doc moved from the adjudicator. 5 tests: leads a new group; the grandchild dies with the child; no zombie; group kill after the leader was reaped; StopOnDrop sets on drop. ⚠️ My first `gone_within(pid, ZERO)` checked NOTHING (the loop never ran), so the "control: alive" asserts were vacuous. Caught when the no-zombie test failed; it now checks at least once.
- Adjudicator: its copies deleted (`kill_tree` → `kill_and_reap`); `Drain` unchanged (D-a); the adjudicator-specific limits stay at `run_command`.
- Runner: its copies deleted; the grace-expiry arm drains `rx` with `try_recv`; the output budget (D-b) is shared by both streams, clean-prefix, one note. **Beyond the finding's letter, same root:** the reader replaced `BufRead::lines()` with `read_bounded_line`: one line is bounded at `MAX_OUTPUT` (the rest dropped to its newline), and invalid UTF-8 is decoded lossily instead of ENDING the read, which had left the pipe unemptied for the rest of the run. The terminator is stripped exactly as `lines()` does (one `\n`, then one `\r`).
- Tests: 4 new runner tests. ⚠️ The burst test as first written (300k lines, fast sink) PASSED with the grace drain removed 3/3: the loop empties the channel inside the grace. Rewritten with a 0.5 ms/line sink and 2,000 lines, it passes on the fix 2/2 and FAILS on the no-drain mutant 3/3 ("the sink lost queued lines").
- `cargo test --lib -- subprocess:: workflow_install::runner:: adjudicator::` → 65 passed (HEAD's 56 = 55 + `adjudicator/commands.rs`'s 1, plus 9 new).

## Build notes — Phase 2
- `HeldRunLock::try_acquire(&Arc<InstallControl>) -> Option<Self>` is the ONE place the lock is taken; `HeldRunLock`'s `Drop` is the ONE release. `RunGuard` holds `lock: Option<HeldRunLock>` and drops it FIRST in its `Drop`, before the panic-fallback emit, which keeps today's release-then-emit order. The `ctl` field is gone.
- The commands' synchronous halves are extracted as `begin_install(control, dest)` / `begin_uninstall(control)`: take the lock, then validate. An early `?` releases by drop, so all 4 manual `running.store(false)` releases are gone. **Why extract:** there is no Tauri test harness (`tauri` has no `test` feature here, and adding it is a new dependency), so this is what lets a test drive the commands' own refusal and early-error paths.
- `src-tauri/src/blocking.rs` → `on_blocking_worker(what, work)`. **All 5** same-shape hops migrated: `trash_path`, `profile_delete`, `time_analytics_query`, `on_worker` (`supervisor_adjudicate`), `finish_on_worker` (dry run). The finding named 3. Errors read `<what> stopped unexpectedly: …` everywhere; no frontend code matches the old wordings (grep).
- Tests: the run-lock guard now asserts each command reaches `try_acquire` (directly or via its `begin_*`), plus exactly one `running.swap(true` (inside `try_acquire`) and exactly one `running.store(false` (inside `HeldRunLock`'s Drop). The `RunGuard` Drop test asserts `self.lock.take()` comes BEFORE `self.terminal_event`. New: `a_second_run_is_refused_while_the_lock_is_held_and_allowed_after` and `an_early_refusal_after_taking_the_lock_releases_it` (through `begin_*`); `blocking::tests` ×3.
- ⚠️ My first edit generalized the worker-closure check to `running.store(false`. That FAILED legitimately: the guard splits on `std::thread::spawn`, so the first "body" runs on into `HeldRunLock`'s Drop. Restored to `ctl.running.store(false`; the exact-one count covers stray releases anywhere.
- **Mutants (each individually, landing confirmed, restored via cp and checked with shasum):** install `try_acquire` → `HeldRunLock(Arc::clone(..))` ⇒ guard + refusal test FAIL; dry-run same ⇒ guard FAILS; uninstall same (first attempt did not land, since `cargo fmt` had reflowed the signature; re-run landed) ⇒ guard + refusal test FAIL; a stray `running.store(false)` in `begin_uninstall` ⇒ count guard + refusal test FAIL; RunGuard release moved AFTER the emit ⇒ ordering test FAILS.
- `cargo test --lib -- workflow_install:: blocking:: adjudicator:: editor_fs:: config_store:: time_store::` → 454 passed; fmt and clippy clean.