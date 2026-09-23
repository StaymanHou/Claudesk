---
workflow: feature
state: finalize (complete)
completed: 2026-09-23
created: 2026-09-23
drive_mode: autopilot
---

# Feature: Paydown WP9 — guard against blocking work in sync Tauri commands

**Workflow:** feature
**State:** Completed 2026-09-23
**Created:** 2026-09-23

## Problem Statement
Tauri 2 dispatches a synchronous `#[tauri::command]` on the **main thread**, so any blocking work reached from one freezes the whole UI. The P1 of 2026-08-25 was this class: pre-fix `cc_kill` → `reg.kill` → `PtyCcSession::kill` → `poll_reaped` → `thread::sleep`, fixed at `f998fd5`. Nothing enforces the property: 85 of the crate's 87 commands are sync, and the incident's two regression tests pin only the two sites that broke. There is one known hit, `supervisor_adjudicate`, which sleep-polls `claude -p` for up to `timeout_ms` on the main thread (`SURFACE-2026-09-23-SUPERVISOR-ADJUDICATE-BLOCKS-THE-MAIN-THREAD`). Its `run_command` also fails to drain its pipes (`SURFACE-2026-09-23-QUALITY-RUN-COMMAND-PIPES-NOT-DRAINED`).

This WP (1) builds a guard that fails on the **pre-fix `cc_kill` shape**, not merely one that passes today, (2) inventories every sync command with it, and (3) moves each real blocking site off the main thread.

⚠️ **Why the guard must be TRANSITIVE:** the pre-fix `cc_kill` body contains no blocking token. The sleep is three calls down. A body-scoped token scan (the SURFACE's first suggestion) would have passed the incident that motivated it, so it does not count as coverage.

**Re-check (F9b back-loop 3, 2026-09-23):** Problem statement unchanged. Back-loop 2's backpressure created a deadlock, so the bound moves from the pipe (backpressure) to the buffer (discard past the cap).

**Re-check (F9b back-loop 2, 2026-09-23):** Problem statement unchanged. The second finding is the same leaf's unbounded collection, plus a pre-existing orphan-on-timeout that the same kill site owns.

**Re-check (F9b back-loop 1, P2.verify-self.2, 2026-09-23):** Problem statement unchanged. The defect is inside the P2.2 fix itself: its drain collection, when a grandchild holds the pipes. It is not a new blocking site, and the main-thread property is proven live.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` §WP9 plus §"The sweep's central risk".
- The incident: `f998fd5` (fix). The pre-fix `cc_kill` is at `git show f998fd5^:src-tauri/src/cc_session/commands.rs`. Lesson: `docs/lessons/pip-nspanel-main-thread.md`.
- Precedents:
  - `SessionRegistry::take` + a detached `thread::spawn` (`cc_kill` today).
  - `tests/stale_dead_code_allows.rs` records that a NAME-based call match "cannot tell a call from a mention". This guard therefore parses with `syn`, which sees call EXPRESSIONS, never comments or strings. Name *identity* is still approximate, so resolution over-approximates on purpose (see the design below).
- `syn` 2.0.117 is already in `Cargo.lock` transitively. Adding it as a **dev-dependency** (`features = ["full", "visit"]`) downloads nothing new. No production dependency changes.

### Guard design (decided at plan, autopilot default — flag if wrong)
- **The command set:** every `fn` carrying `#[tauri::command…]` under `src/`, outside `mod tests`. A command is **exempt** if it is `async fn` or `#[tauri::command(async)]`: Tauri runs those on the async runtime, not the main thread.
- **Blocking seeds** (the call's final path segment or method name): `sleep`, `join` (on a thread handle), `wait`, `wait_with_output`, `wait_timeout`, `recv`, `recv_timeout`, and `output` / `status` on a process `Command`.
  - Named NON-seeds: `std::fs` IO and `git2`. Both are blocking in principle but bounded and local. They are the inventory's second question, to be measured rather than assumed. If Phase 1 finds a slow one, it gets its own SURFACE rather than silently widening the seed set.
- **Transitive closure:** parse every `fn` and `impl` method in the crate into `name → {called names}`. A fn is blocking if it calls a seed, or calls a name that resolves to ANY blocking crate fn. Name-only resolution over-approximates, so a collision shows up as a false POSITIVE (an allowlist entry with a reason), never as a silent pass.
- **Spawn boundaries are cut:** the argument closures of `thread::spawn`, `std::thread::Builder::spawn`, `async_runtime::spawn` / `spawn_blocking` and `run_on_main_thread` are not walked. Blocking work handed to a worker is the FIX shape, and the negative control is today's `cc_kill`.
- **The ledger:** a table of `(command, reason)` for sync commands the guard flags and a human accepted. It gets TWO guards (CLAUDE.md guard catalogue entry 13):
  - Forward: an unledgered blocking command fails.
  - Reverse: a ledger entry that no longer flags, or names a command that no longer exists, fails too.
- **Anti-vacuity:** the test asserts the number of commands scanned equals the number of `#[tauri::command` attribute lines (78; see the Phase 1 evidence for the 87→78 correction), and that the closure found ≥1 blocking fn.
- **Stated limit:** the lock-held-across-a-main-thread-marshal shape (`tray::reconcile`, the incident's second fault) is NOT mechanically covered. The guard's doc says so, rather than claiming it (entry 15/18 discipline).

## Work Tree

- [x] Phase 1: The transitive guard + the inventory
  **Observable outcomes:**
  - CLI: `cargo test --test sync_commands_do_not_block` exits 0 on the tree with today's offenders ledgered. Its stdout reports `scanned N commands`, where N equals the count of `#[tauri::command` ATTRIBUTE lines in `src/`, and a non-zero blocking-fn count. *(Amended 2026-09-23 at build: plan wrote 87, which counted 9 prose mentions in comments. The attribute count is **78**, and the anti-vacuity check caught the difference on its first run.)*
  - CLI: transplanting the **pre-fix `cc_kill`** body (from `git show f998fd5^`) with the pre-fix `SessionRegistry::kill` restored makes the test **FAIL**, naming `cc_kill` and a call chain that ends in `sleep`.
  - CLI: deleting `supervisor_adjudicate`'s ledger entry makes the test **FAIL**, naming `supervisor_adjudicate` → `run_adjudicator` → `run_command` → `sleep`.
  - CLI: adding a ledger entry for a non-blocking command, or for a nonexistent one, makes the test **FAIL** (reverse guard).
  - CLI (negative control): today's `cc_kill`, whose blocking work sits inside a `thread::spawn` closure, is **NOT** flagged. Moving its `session.kill()` out of the closure makes it flagged.
  - CLI: the inventory table is recorded in this WIP, one row per flagged command with its chain and a disposition (fix in Phase 2 / accepted with reason / false positive with reason).
  - [x] P1.1 Add the `syn` dev-dependency. Write `tests/sync_commands_do_not_block.rs` (command enumeration, the fn graph, seeds, spawn-boundary cut, closure, ledger forward and reverse, anti-vacuity).
  - [x] P1.2 Run it, triage every flagged command into the inventory table, and ledger today's offenders with dispositions.
  - [x] P1.3 Mutation-prove each outcome above INDIVIDUALLY: pre-fix `cc_kill`, a deleted ledger entry, a stale ledger entry, and the spawn-closure negative control.
  - [x] verify-auto
  - [x] verify-self
  - [x] verify-human  <!-- F11 auto-skip: drive_mode=autopilot, no integration boundary, verify-self all-PASS -->
  - [x] verify-codify

- [x] Phase 2: Move every real blocking site off the main thread
  **Observable outcomes:**
  - CLI: `supervisor_adjudicate` is an `async` command that runs `run_adjudicator` via `tauri::async_runtime::spawn_blocking`. Its ledger entry is **removed**, and the guard stays green, which the reverse guard forces. Every other Phase-1 "fix" row is likewise off the ledger.
  - CLI: `run_command` drains stdout and stderr on reader threads, and its deadline starts **before** the stdin write. Three new tests:
    - `sh -c 'head -c 200000 /dev/zero >&2; exit 0'` returns `Ok` within its 5s timeout. Before the fix it hangs to the timeout: the child blocks on a full stderr pipe and never exits.
    - `sh -c 'sleep 30'` fed a >1 MiB prompt returns `TimedOut` near its timeout. Before the fix it blocks in `write_all` forever.
    - E3's `echo boom >&2; exit 3` stderr test stays green.
  - CLI (live): with `pnpm tauri:dev` running and a `supervisor_adjudicate` invoke in flight (fire-then-poll through the bridge), `sample <pid> 3` shows **no** `run_command` / `run_adjudicator` / `thread::sleep` frame under `com.apple.main-thread`. A pre-fix positive control, taken with the same method, **shows** one.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Make `supervisor_adjudicate` async with `spawn_blocking`. Check its TS caller's invoke shape is unchanged (a grep plus the existing supervisor tests).
  - [x] P2.2 `run_command`: reader threads for both pipes, the deadline before the write, the stdin write on its own thread so a non-reading child cannot wedge it, and a kill+reap on timeout. Plus the three tests.
  - [x] P2.3 Fix each remaining Phase-1 "fix" row using the `take` + `thread::spawn` or `spawn_blocking` precedent. Remove its ledger entry.
  - [x] P2.4 Update `docs/lessons/pip-nspanel-main-thread.md`, which has a "What is already safe" section, to point at the guard and state its limit (lock-across-marshal).
  - [x] verify-auto
  - [x] verify-self
    - [x] P2.verify-self.1 async commands off the ledger + positive control + TS arg names
    - [x] P2.verify-self.2 run_command exit paths (after 3 back-loops + 1 shortcut; re-verify 5 PASS)
    - [x] P2.verify-self.3 live `sample`, before and after (orchestrator)
    - [x] P2.verify-self.4 `pnpm verify:auto` exit 0
  - [x] verify-human  <!-- F13: operator approved all 4 ("all good", 2026-09-23) -->
    - [x] P2.verify-human.1 Adjudicator consuming surface (`useSupervisor` → `supervisor_adjudicate`): the agent-captured live invoke + `sample` before and after. Operator accepts the evidence.
    - [x] P2.verify-human.2 Dry-run consuming surface (`WorkflowUninstallDialog` → `workflow_uninstall_dry_run`): an agent-captured IPC response in dev. Operator accepts it.
    - [x] P2.verify-human.3 Judgment: `quit_now` stays sync (LEDGER: bounded, parallel kill joins on the terminal quit path).
    - [x] P2.verify-human.4 Judgment: accept `run_command`'s documented limits.
  - [x] verify-codify

## Current Node
- **Path:** Feature > finalize (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none after finalize
- **Open discoveries:** none

## Phase 1 build evidence

**The guard:** `src-tauri/tests/sync_commands_do_not_block.rs` plus the `syn` dev-dependency (`full`, `visit`). It scanned **78 commands (76 sync, 2 async)**, and **29 crate fns reach a seed**.
- ⚠️ The plan's "87" was wrong. It counted 9 prose mentions of `#[tauri::command]` in comments. The anti-vacuity check itself caught this on its first run (78 parsed vs 87 declared), and the count now reads attribute lines only.

### Inventory (every sync command the guard flags)

| Command | Chain | Disposition |
|---|---|---|
| `supervisor_adjudicate` | → `run_adjudicator` → `run_command` → `sleep` | **FIX, Phase 2** (the known hit). |
| `workflow_uninstall_dry_run` | → `run_dry_run` → `run_streaming` → `join` | **FIX, Phase 2.** It waits on `uninstall.sh`, a script in ANOTHER repo (mccc), with no timeout. The doc's "well under a second" describes that script, not a guarantee Claudesk can make. |
| `quit_now` | → `perform_quit_teardown` → `kill_all` → `join` | **ACCEPTED.** The joins run in parallel and are bounded by one ~800ms kill window. They sit on the terminal quit path, and joining is the point: an un-joined kill could be cut short by `app.exit(0)`. |
| `git_changed_files`, `git_commit_diff`, `git_file_hunks`, `git_file_statuses` | → `…_core` → `status` (`git_commit_diff` / `git_file_hunks` pass through `diff_to_file_diffs` first) | **FALSE POSITIVE.** `status` here is git2's `StatusEntry::status()` / `DiffDelta::status()` accessor, not `Command::status()`; grepped, the crate has no `Command::status()` call at all. The git2 work itself is bounded local IO: `git status` on this 1006-file repo takes ~0.01s (3 runs). So it is not a seed, and **no SURFACE** is warranted. |

### Mutants (each run individually; `cp` restore verified by `shasum`)

| # | Mutant | Result |
|---|---|---|
| M1 | **Pre-fix `cc_kill`** (`git show f998fd5^`): an inline `reg.kill(&session_id)`, with the pre-fix `SessionRegistry::kill` restored so it compiles | **FAIL**: `cc_kill → kill → poll_reaped → sleep`, the incident chain exactly |
| M2 | Today's `cc_kill` with `session.kill()` moved out of its `thread::spawn` closure | **FAIL**: same chain |
| M3 | The `supervisor_adjudicate` ledger entry deleted | **FAIL**: `supervisor_adjudicate → run_adjudicator → run_command → sleep` |
| M4a | A ledger entry for the non-blocking `cc_ready` | **FAIL** (reverse guard): `["cc_ready"]` |
| M4b | A ledger entry for a nonexistent command | **FAIL**: listed as "not sync commands" |
| M5 | `SPAWN_BOUNDARIES` emptied | **FAIL**: `cc_kill`, `workflow_install_start` and `workflow_uninstall_start` flag. This proves the cut is what exempts the three that already run their work on a worker. |

**verify-auto:** `pnpm verify:auto` EXIT 0 in 35s. 222 files / 2985 tests, Rust 905 + 19 + 1, and the new integration test (`1 passed`, 0.36s). `Cargo.lock` gained +1 line (`syn` in claudesk's dependency list), with no new package.

The negative control: today's tree is **green** with the ledger (1 passed). Clippy `--all-targets -D warnings` is clean, and `cargo fmt` has been applied.

## Phase 1 verify-self result
- **Run 1** (subagent, an independent reproduction): all 6 observables **PASS**. It also ran two findings of its own:
  - **BLOCKING:** `run_on_main_thread` was cut as a spawn boundary, but a sync command is already ON the main thread, so a marshalled closure freezes the UI just the same. An `app.run_on_main_thread(|| thread::sleep(..))` mutant in `cc_kill` passed the guard, a real hole. No current code has that shape: the only call, in `pip/commands.rs`, is inside a `thread::spawn`.
  - **COSMETIC:** a fn passed as a VALUE (`let p: fn(Duration) = thread::sleep; p(..)`) is not seen, and the doc did not list the shape.
  - **Wording:** the git row's chain skipped `diff_to_file_diffs` for 2 of the 4 commands.
- **Fix** (in-place shortcut, see Discoveries): `run_on_main_thread` was removed from `SPAWN_BOUNDARIES`. The module doc now says why it is not a boundary, lists fn-as-value as uncovered, and the table row was corrected. The guard is still green (78 commands / 29 fns): the pip call's outer `thread::spawn` is what exempts it.
- **Run 2** (a FRESH subagent): **4/4 PASS.**
  - The `run_on_main_thread` sleep mutant now **FAILS**: `cc_kill → sleep`, and the blocking-fn count goes 29 → 30.
  - The `thread::spawn` sleep negative control stays **green**.
  - The doc claims match the code. Its one wording note ("argument closures" vs "arguments") was applied.
- No integration boundary: the phase adds a new test file and a dev-dependency only.

## Phase 1 verify-codify result
- No integration boundary: the phase adds isolated new artifacts only.
- **The mutation proofs are now permanent.** 9 analyzer self-tests run on fixture crates in a `TempDir` (the `flag_fixture` helper). This extracted `stale_entries`, and made `flagged` take its `root`, so fixture paths print relative.
- Each self-test was mutation-proven against the ANALYZER, one mutant at a time:

| Mutant | Dies on |
|---|---|
| A: spawn cut disabled | `work_handed_to_a_worker…`, live test |
| B: `run_on_main_thread` cut restored | `work_marshalled_to_the_main_thread…` |
| C1: `async fn` not exempted | `async_commands_are_exempt…` |
| C2: `(async)` attr not exempted | `async_commands_are_exempt…` |
| D: `join` at any arity | `arity_separates…`, live test |
| E: `cfg(test)` not skipped | `test_only_code…` |
| F′: no closure (seeds only) | `the_pre_fix_cc_kill_shape…` + 3 others |
| F: a SINGLE pass instead of a fixpoint | ⚠️ **SURVIVED at first.** `HashMap` order is random, so a single pass resolved the 3-hop fixture by luck. Added `a_long_chain_is_resolved_to_a_fixpoint…` (8 hops). The single-pass mutant now fails it **3/3 runs**. |
| G: reverse guard off | `the_reverse_guard_catches…` |

- ⚠️ **One invalid probe, caught and redone.** The first G mutant wrote a literal `\&\&`, so the file did not compile, and the grep showed nothing. That looks identical to a surviving mutant (`[[invalid-probe-and-real-hole-look-identical]]`). The redone G′ compiled and fails.
- The comment/string test pins a property of `syn` itself: no analyzer mutant can make it see comments. It exists so a future move to text-grep resolution fails it.
- Gate: `pnpm verify:auto` EXIT 0 in 31s. 222 / 2985 frontend; Rust 905 + 19 + 1 + **10** (the guard file).

## Phase 2 build evidence

**Relevance check (before Phase 2):**
- The requester still needs this: **yes.** `supervisor_adjudicate` is a live main-thread wait on a milestone feature.
- The requirements are unchanged: **yes.**
- The solution is still feasible: **yes.**
- No superior alternative has been discovered: **yes.** Phase 1's inventory found exactly two fix rows, both a one-attribute or one-signature change.
- **Verdict:** proceed.

- **P2.1:** `supervisor_adjudicate` is now `pub async fn` running `run_adjudicator` inside `tauri::async_runtime::spawn_blocking`. Its args are unchanged, so the TS `invoke("supervisor_adjudicate", {model, prompt, timeoutMs})` in `useSupervisor.ts` is untouched.
- **P2.3:** `workflow_uninstall_dry_run` is now `#[tauri::command(async)]`. The attribute form keeps `pub fn …` and its body byte-identical, which `every_substrate_touching_command_takes_the_single_run_lock` anchors on.
  - Both ledger rows were deleted. The guard is green at **74 sync / 4 async**, with 28 blocking fns.
  - The reverse guard would have failed had either row stayed.
  - No other Phase-1 "fix" rows exist.
- **P2.2:** `run_command` now:
  - starts the deadline before spawning;
  - writes stdin on its own thread;
  - drains stdout and stderr on reader threads into channels;
  - on timeout, kills and reaps the child without waiting on the drains, since a grandchild can hold a pipe open;
  - on exit, collects each drain within the remaining budget plus a 500ms grace.
- **Three new tests**, each red on the PRE-fix code:
  - Pre-fix run under a `perl alarm` watchdog on the test binary itself (not cargo, per `[[perl-alarm-watchdog-orphans-cargo-test-binary]]`): stderr-fill FAILED at 5s, stdout-fill FAILED at 5s, and stdin-never-read hung until the watchdog.
  - Each fix was then mutated back INDIVIDUALLY:

| Mutant | Result |
|---|---|
| Ma: stdin written on the calling thread | **FAIL**: "run_command hung past its own 1s timeout", in 4.01s. The test was moved onto a thread with `recv_timeout` because the first version died only as a HANG (SIGALRM, or 30s once `sleep` exited), which would stall the gate rather than fail it. |
| Mb: stderr drained only after exit | **FAIL**: `a_child_that_fills_its_stderr_pipe_still_completes`, 5.04s |
| Mc: stdout drained only after exit | **FAIL**: `a_child_that_fills_its_stdout_pipe_returns_all_of_it`, 5.05s |

- **P2.4:** `docs/lessons/pip-nspanel-main-thread.md` gained "The same fact cuts the other way", which points at the guard, both fixes, the ledger, and the guard's stated blind spots.
- `cargo clippy --all-targets -D warnings` is clean. `adjudicator::` has 11 tests passing, and E3's stderr test is still green.
- **verify-auto:** `pnpm verify:auto` EXIT 0 in 31s. 222 / 2985 frontend; Rust **908** (+3 drain tests) + 19 + 1 + 10.
- ⚠️ **A known residue, deliberately not fixed:** if the child's stdin is inherited by a grandchild, a timed-out run leaves the writer thread blocked until that grandchild exits. The thread is detached and bounded by the grandchild's life. The UI and the caller never wait on it.

## Phase 2 verify-self: the live observation (driven by the orchestrator)

The tauri MCP bridge is not exposed to subagents (`[[mcp-bridge-tools-not-exposed-to-subagents]]`), so the orchestrator drove this part itself.
- **Setup:** `pnpm tauri:dev` (identity `com.claudesk.app.dev`, confirmed from the bridge's init log). The operator's installed app, PID 1885, was not touched. Each `supervisor_adjudicate` invoke used `{model: "sonnet", timeoutMs: 90000}` and was fired then polled. The eval-timeout the bridge reports on any `invoke` script is expected (caveat d). `sample <pid> 3` was taken while the `claude -p --model sonnet` child was alive, and `ps` confirmed its PPID was the dev app.
- **Post-fix build (PID 91038):**
  - `supervisor_adjudicate → run_adjudicator → run_command` appear ONLY on a `tokio-rt-worker` thread, the `spawn_blocking` pool, in 799 samples. `drain` has two threads of its own (775 samples each).
  - The main-thread section (`com.apple.main-thread`) holds **zero** adjudicator frames. Its only `claudesk_lib` frame is `claudesk_lib::run`, the event-loop root, and the thread idles in `mach_msg2_trap` / `__CFRunLoopRun`.
  - The invoke resolved in **12.9s** with a 2649-char answer, so the command still WORKS through the async path.
- **Positive control, pre-fix build (PID 94691):** only `adjudicator/commands.rs` was swapped back to HEAD's sync fn (`cp` backup, then restored and checked by `shasum -c`). `supervisor_adjudicate → run_command` now sits **under `com.apple.main-thread` in all 2327 of 2327 samples**, the whole UI thread for the whole window. So the method discriminates: before is blocked, after is idle.
- **Teardown:** bridge session stopped, dev task `TaskStop`ped. `lsof` shows nothing on 1420/9223, and no `target/debug/claudesk` remains. PID 1885 is still running.
- Result: **PASS.** This closes the "unconfirmed" half of `SURFACE-2026-09-23-SUPERVISOR-ADJUDICATE-BLOCKS-THE-MAIN-THREAD`: the freeze was REAL before the fix, and it is gone after.

## Phase 2 verify-self: subagent run 1
- **PASS:** the async commands are off the ledger, and the sync positive control fails naming `supervisor_adjudicate … → recv_timeout`. The TS args `{model, prompt, timeoutMs}` match. `pnpm verify:auto` exits 0.
- **FAIL (BLOCKING): the drain-collection path.** When the child EXITS but a grandchild still holds a pipe, `recv_timeout` waits on stdout and then on stderr, each with the full remaining budget plus 500ms, SEQUENTIALLY. Then it discards everything.
  - Probe A, `echo boom >&2; sleep 6 & exit 3` at 1000ms: returned `TimedOut` after **2.95s**. Exit code 3 and stderr `boom` were LOST.
  - Probe B, `sleep 6 >/dev/null & echo answer` at 1000ms: returned `TimedOut` after 1.5s, throwing away a successful `answer`.
- Also noted, without being failed:
  - the `try_wait` error arm returns with no kill or reap (practically only after the child was reaped elsewhere);
  - a panic in a drain-thread spawn leaves the child running.
- No path hangs the caller forever, and every `Err` withholds on the TS side. So this is not a freeze regression, but it is a correctness hole in code this WP wrote.

## Phase 2 build, back-loop 1 (F9b, P2.verify-self.2)
- **The drain** now streams 8 KB chunks and disconnects at EOF. **`collect_both`** reads BOTH channels together until each disconnects or a **250ms grace from the child's exit** passes, and keeps whatever arrived. Before, it waited for EOF on each pipe in turn, with the full remaining budget each time, and discarded everything on a miss.
- **Edge exits:**
  - The `try_wait` error arm now kills and reaps the child.
  - Every thread spawn uses `thread::Builder::spawn`. A spawn failure after the child exists kills and reaps it (`reap`) before returning `Spawn`.
- **Two new tests, both red on the pre-back-loop code** (`TimedOut(1000)` after 2.96s):
  - `a_grandchild_holding_the_pipes_does_not_discard_a_failing_exit`: `echo boom >&2; sleep 6 & exit 3` → `Failed{code: 3, stderr: "boom\n"}` in under 1.4s.
  - `a_grandchild_holding_a_pipe_does_not_discard_a_successful_answer`: `sleep 6 >/dev/null & echo answer` → `Ok("answer\n")` in under 1.4s.
- **Mutants, each run individually:**

| Mutant | Result |
|---|---|
| Mx: the grace ignored (wait for EOF) | **both new tests FAIL** (6.02s) |
| My: partial output discarded | **both FAIL** |
| Mb2: stderr drain started after exit (a re-check of the earlier fix) | **FAIL** |

- `adjudicator::` has 13 passing tests. `cargo clippy --all-targets -D warnings` is clean.
- **Re-verify gate:** the failed observable is exactly probes A and B, which are now permanent tests, and both PASS.

## Phase 2 verify-self: re-verify 2 (a fresh subagent)
- **13/13 tests pass.** Probes A and B are fixed (310ms each).
- **Every exit was enumerated:** each reaps its direct child and keeps what it wrote. The exits at the deadline edge land at 1.03–1.28s, and 200 KB outputs survive intact with a grandchild present.
- **FAIL (BLOCKING), a new probe:**
  - P4, `yes zzflood & echo answer`: **1.579s**, returning an **`Ok` of 1,905,603,695 bytes**. The inner `while !done` loop in `collect_both` never checks `until` while chunks keep coming, and neither the channel nor the accumulator is bounded. That is an unbounded allocation in the app process.
  - P7, `sleep 37.7; echo x` at 300ms: `TimedOut` in 326ms, but the `sleep` **survived, reparented to PID 1**. The timeout kills the direct child only. This predates WP9.
- **Noted, not failed:** P3, a grandchild writing during the grace window, has its bytes appended to the answer. That output is outside our control.

## Phase 2 build, back-loop 2 (F9b, P2.verify-self.2)
- **The drain is bounded three ways:**
  - `sync_channel(16)`: an endless writer waits on the reader instead of queueing.
  - `MAX_OUTPUT` = 4 MiB kept per pipe.
  - The `until` check sits inside the CHUNK loop.
- **The group kill:**
  - The child spawns with `process_group(0)`.
  - `kill_tree` SIGKILLs `-pgid`, then kills and reaps the child directly. It is used on the timeout, the `try_wait` error arm and the thread-spawn failure.
  - The `libc::kill(-pgid, …)` shape copies `cc_session::signal_group`.
- **4 new tests** (17 in `adjudicator::`):
  - `a_grandchild_flooding_a_pipe_cannot_stretch_the_wait_or_the_memory` (live `yes`);
  - `a_timeout_kills_the_grandchildren_too` (pidfile, then `kill(pid, 0)`);
  - `collection_stops_at_its_deadline_even_while_chunks_keep_arriving` (deterministic);
  - `a_drain_holds_back_a_writer_that_never_stops` (deterministic).
- **Mutants (each individually):**

| Mutant | Result |
|---|---|
| N1: no `process_group(0)` | **FAIL** (orphan) |
| N2: no group kill | **FAIL** (orphan) |
| N3: no in-loop deadline | ⚠️ **SURVIVED the live `yes` test.** It passes only if the collector outruns `yes`, so a speed race. The deterministic backlog test was added, and N3 now **FAILS** it. |
| N4: no cap | **FAIL** (flood) |
| N5: unbounded channel | ⚠️ **SURVIVED at first**, because nothing observed channel occupancy. The `Endless` reader test was added, and N5 now **FAILS** it. |

- clippy is clean, and no stray `sleep`/`yes` processes remain.
- **Not fixed, recorded:** P3, a grandchild's grace-window writes appended to the answer. That output is outside our control, and it is bounded by the 250ms grace and the cap.

## Phase 2 verify-self: re-verify 3 (a fresh subagent), and back-loop 3
- **Re-verify 3 FAILED (BLOCKING): a deadlock that back-loop 2 INTRODUCED.**
  - Nothing read the `sync_channel(16)` during the `try_wait` loop. So once the child's OWN output passed the pipe (64 KB) plus 16 queued chunks, the drain blocked on `send`, the pipe filled, and the child blocked on its own write and never exited. The result was `TimedOut` with the output lost.
  - Measured limits: about 204,800 bytes in large writes, 44–89 KB in `echo` lines. It hit a 210 KB stdout, a 1 MB stderr with exit 5, 10k lines, and `cat` of a 300 KB prompt.
  - ⚠️ **The existing "200 KB" test sat 4.8 KB UNDER the limit, so it passed the deadlock by construction.** This is entry 15, the fixture that makes the right and wrong answers identical.
- **Back-loop 3, the design change:**
  - The bound moves from BACKPRESSURE on the pipe to DISCARDING past `MAX_OUTPUT` in the buffer.
  - Each `Drain` thread reads continuously from spawn into an `Arc<Mutex<Vec<u8>>>`, so the child is never blocked by us.
  - A `StopOnDrop` flag, set on every return path, ends a drain that a grandchild keeps fed, which gives it SIGPIPE.
  - `collect_both` waits for both `done` flags or the grace deadline, then takes the buffers.
- **Tests:**
  - The stdout fixture grew to **1 MiB**.
  - Added: 1 MiB stderr + exit 5; 20,000 `echo` lines; `cat` echoing a 1 MiB prompt; collection giving up at its deadline while keeping what it has (a deterministic `Drain` with no thread); an endless reader capped at `MAX_OUTPUT` that keeps reading past **3×** the cap and stops on the flag.
  - The flood test now runs on a thread with `recv_timeout`. **20 tests in `adjudicator::`.**
- **The orchestrator ran the full probe matrix before handing back** (per the build skill's handed-back-≥2× rule). All returned within the bound:

| Probe | Result |
|---|---|
| P2 | 322ms, `Ok "answer\n"` |
| P4 (flood) | 319ms, `Ok` 4 MiB (cap) starting with "answer" |
| N2 (stderr flood, exit 4) | 314ms, `Failed(4)` |
| T1 (210 KB) | 64ms, `Ok` whole |
| N3b (1 MiB) | 122ms, `Ok` whole |
| N3c (1 MiB stderr, exit 5) | 116ms, `Failed(5)` + 1 MiB |
| T6 (10k lines) | 121ms, `Ok` whole |
| T8 (`cat` 300 KB) | 67ms, `Ok` whole |
| N4a (2 MiB prompt, slow `cat`) | 388ms, `Ok` whole |
| N5 (`yes own`, 300ms) | 344ms, `TimedOut` |
| N8 (`sleep 0.28; echo late`, 300ms) | 333ms, `Ok` |
| N7 (success + background `sleep`) | 318ms, `Ok`; nothing killed |
| P7 | 330ms, `TimedOut`, grandchild gone |

- **Mutants (each individually):**

| Mutant | Result |
|---|---|
| R1: the drain quits at the cap | ⚠️ **SURVIVED** the first version's `read > MAX_OUTPUT`: one read past the cap satisfied it. The test now requires `> 3×` the cap, and R1 **FAILS** it. |
| R2: the stop flag ignored | **FAIL** |
| R3: collection ignores its deadline | **FAIL** (3 tests). It also HUNG the binary at exit on the endless `yes`, which is why the flood test is now thread-bounded. The orphan it left was killed by PID. |
| R4: the reader stalls while the child runs | **FAIL** (10 tests) |
| R5: no cap | **FAIL** (2 tests) |

- `pnpm verify:auto` EXIT 0 (38s): Rust 917 + 19 + 1 + 10. clippy is clean, and no strays remain.
- **Known, accepted limits:**
  - N1: a grandchild that `setsid`s escapes the group kill. That cannot be caught without descendant tracking.
  - N6: a grandchild flooding the SAME pipe before the child's answer can push the answer past the cap. The result is a bounded `Ok` of garbage, which the TS parse withholds.

## Phase 2 verify-self: re-verify 4, the shortcut, and re-verify 5
- **Re-verify 4 (a fresh subagent): FAIL (BLOCKING), one point.**
  - The child's OWN output past `MAX_OUTPUT` was silently cut and returned as `Ok`: 8 MiB came back as 4,194,304 bytes, and a `VERDICT` written after 4 MiB of filler was missing from the `Ok`.
  - Everything else PASSED: the worst overrun was 46ms, memory stayed capped, and 16/16 parallel timeouts killed their whole group.
  - It also measured three limits: `set -m` job control escapes like `setsid`; drains stay parked while a quiet grandchild holds a pipe (2 → 6 → 2 threads); grandchildren are not killed on a normal exit.
- **The shortcut fix:**
  - `Drain.overflowed` is set whenever bytes are discarded.
  - A successful exit with an overflowed stdout returns the new `AdjudicateError::OutputTooLarge(MAX_OUTPUT)` ("claude -p wrote more than N bytes of output", which does not match the TS `/timed? ?out/i`, and whose rejection withholds).
  - A cut stderr on a non-zero exit gets `\n[stderr truncated at N bytes]`.
  - The flood test now expects `OutputTooLarge`.
  - The accepted limits are written into `run_command`'s doc.
  - 3 new tests: cap edge (exactly MAX is Ok, MAX+1 is Err); cut-stderr marker; Display is not timeout-classifiable. 23 in `adjudicator::`.
  - Mutants: O1 (the flag is never set) FAILS 3 tests; O2 (the stdout check is dropped) FAILS 2; O3 (the stderr marker is dropped) FAILS 1.
- **Re-verify 5 (a FRESH subagent, the shortcut's gate 2): 11/12 PASS, and 1 COSMETIC.**
  - Exactly MAX: `Ok` whole, 167ms. MAX+1 and 8 MiB: `OutputTooLarge`.
  - Filler then `VERDICT`, at 5 MiB, at exactly MAX, and at 8 MiB: always `Err`, never an `Ok` without it.
  - `cat` of 6 MiB: `OutputTooLarge`. 8 MiB stderr with exit 5: `Failed(5)` plus the marker.
  - Regressions: a quiet grandchild gives `Ok` at 306ms; a `yes` flood gives `OutputTooLarge` at 306ms, and `yes` dies of SIGPIPE; 210 KB, 1 MiB and 20k lines are whole; a nested group dies on timeout (545ms at 500); a 2 MiB unread prompt gives `TimedOut` at 1.039s.
  - All four documented limits were confirmed live.
  - **The COSMETIC:** the doc said a parked thread "holds at most one capped buffer", but a parked WRITER holds an uncapped prompt copy. That wording is now fixed.
- **Verdict:** all blocking outcomes PASS.
  - The main-thread property was proven live, before and after, by `sample`.
  - The `run_command` exits were hardened across 3 back-loops, 1 shortcut and 5 fresh adversarial rounds.

## Phase 2 verify-human: agent-run captures (boundary rule)
- **`workflow_uninstall_dry_run` through IPC** (dev build PID 956, `com.claudesk.app.dev`, fired and then polled): it resolved immediately with `Err("Claudesk has no record of installing this workflow system, so it will not remove it. If you installed it yourself, remove it the same way you installed it. Nothing was changed.")`. That is the refuse guard's own user-facing message, and correct for a dev identity with no managed record. So the `(async)` command is dispatched and returns through the real IPC path the dialog uses.
- **Teardown:** the bridge was stopped, the dev task was stopped, 1420/9223 are clear, and PID 1885 was untouched.

## Phase 2 verify-codify result
- **Integration boundary: YES.** `supervisor_adjudicate` is called by `useSupervisor.ts`, and `workflow_uninstall_dry_run` by `WorkflowUninstallDialog.tsx`.
- **The consuming-surface test:** `adjudicator::commands::tests::the_async_command_resolves_to_a_rejection_through_its_worker`. It drives the REAL async command through `spawn_blocking` and its error mapping, with a 1ms timeout. A real `claude` is group-killed before doing any work, and a missing one gives NotFound. It asserts a rejection within 3s (0.06s measured).
  - Mutant: a command that swallows its error into `Ok("")` → **FAIL**.
  - No stray `claude` process is left.
- **Already covered, not duplicated:**
  - The TS `invoke` contracts are pinned by `useSupervisor.test.ts` (name plus `timeoutMs`) and `workflowUninstallCopy.test.ts` (the dry-run call).
  - The async SHAPE of both commands is pinned by the guard, whose reverse check fails if either goes back to sync (Phase 1 M3, Phase 2 positive control).
  - `run_command`'s exits are covered by 23 real-subprocess tests, each mutation-proven.
- ⚠️ **Deliberately NOT written:** an IPC-level (`tauri::test`) test of `workflow_uninstall_dry_run`. It resolves the REAL `$HOME` and the provenance record, so in a test it would read (and could spawn `uninstall.sh --dry-run` against) the operator's actual install. The live dev capture at verify-human is the end-to-end evidence for that surface.
- **Gate:** `pnpm verify:auto` EXIT 0 in 35s. 222 / 2985; Rust **921** + 19 + 1 + 10. No strays.

## Ship
- Ship commit `17f90e5` (local, NOT pushed; pushing is the operator's call). `pnpm verify:auto` EXIT 0 immediately before (35s).
- It covers 8 files: the guard, the `syn` dev-dependency plus lock, `adjudicator/{commands,mod}.rs`, `workflow_install/commands.rs`, the lesson doc, and `runtimes.md`.

## Code-Quality Review — paydown-wp9-sync-command-blocking-guard

*(Reviewer: `code-quality-reviewer` against ship `17f90e5`. drive_mode=autopilot, so 0 CRITICAL, 4 MAJOR and 5 MINOR are ALL auto-backlogged to `backlog-quality-findings.md` → `# paydown-wp9-sync-command-blocking-guard — 2026-09-23`, with a pointer in `backlog.md`.)*

### Strengths (reviewer's, abridged)
- **The guard** follows calls transitively, checks call expressions rather than text, and tests its own analyzer on fixtures, each with a positive control. Its ledger is checked both ways, and the command count is checked against the source.
- **The final `run_command`** drains each pipe continuously, bounds output by discarding rather than backpressure, returns `OutputTooLarge` instead of a cut `Ok`, and group-kills on timeout. `StopOnDrop` covers every return path, and its limits are documented honestly.
- **Tests that pin a hang are thread-bounded.** Fixture sizes are chosen well past any in-flight buffer.
- **No dead code or superseded helpers** remain from the three rebuilds.

### Issues
**CRITICAL:** none.

**MAJOR** (all auto-backlogged):
1. **`workflow_uninstall_dry_run`:** `(async)` pins a runtime WORKER on a hung `uninstall.sh`, which contradicts the commit's own "`spawn_blocking` for long waits" rule, and can leave `control.running` stuck.
2. **The guard exempts every async command.** The gap is undocumented, and it is why finding 1 passed.
3. **`is_cfg_test`** treats `cfg(not(test))` / `cfg(any(test, …))` as test-only, so production items are dropped (latent).
4. **WIP-provenance labels in comments** ("re-verify 3", "probe P4", "mutant R1", "the bounded-channel version"). They go to the T1/T2 comment pass (paydown R2).

**MINOR** (auto-backlogged):
1. The lesson doc duplicates the guard doc's rationale, and lists 2 of the 5 limits.
2. Nested fns inside impls and trait defaults are not registered.
3. The spawn cut covers all arguments, not only closures.
4. The command test forks the real `claude` and accepts either outcome.
5. The Display comment is looser than the TS `/timed? ?out/i`.

### Assessment (reviewer's)
"The two main pieces are good, maintainable work… The main debt is inconsistency between the rule the commit writes down and what it applies: `workflow_uninstall_dry_run` uses the `(async)` form that the commit's own reasoning reserves for short waits, on the one command whose wait is documented as unbounded. The guard exempts every async command, so it cannot notice."

### If you disagree
Mark a finding `[DISMISSED]` here before finalize archives this file.

## Retrospect
- **What changed in our understanding:**
  - **The guard had to be transitive.** The body-scoped scan that `SURFACE-2026-08-25` suggested would have passed the very incident that motivated it. The pre-fix `cc_kill`'s sleep was three calls down.
  - **`run_on_main_thread` looked like a spawn boundary and is the opposite for a sync command.** A fresh verify-self caught it, not the author.
  - **The hard part was not the guard but `run_command`.** Each of its first three designs traded one failure for another:
    - Serial post-exit drains lost output and overran the timeout.
    - Unbounded collection allowed a 1.9 GB `Ok`.
    - A bounded channel deadlocked the child on its own output.
    - Capping without an error silently cut a verdict.
  - Correctness came from separating the three concerns: never block the child (read continuously), bound memory by DISCARDING, and make a cut visible (`OutputTooLarge`).
- **Assumptions that held:**
  - `syn` was already in the lock, so the dev-dependency cost nothing.
  - The inventory was small: 7 flagged, 2 real.
  - The `sample` before/after method discriminates cleanly: 2327/2327 samples against 0.
  - The TS side withholds on every rejection, so a new error variant was safe.
- **Assumptions that were wrong:**
  - The plan's "87 commands" counted prose mentions; the real number is 78, caught by the anti-vacuity check.
  - "`(async)` moves the wait off the thread that matters" is only half true: it moves it onto a runtime worker (review MAJOR 1, backlogged).
  - The 200 KB fixture was "comfortably past the pipe buffer" but sat 4.8 KB under the broken version's deadlock threshold. It passed the bug by construction, which is entry 15 again.
  - Four of my own tests first shipped with assertions too weak to kill their mutant: `read > cap`, the live `yes` race, the channel occupancy, and the 3-hop fixpoint. Each was caught only because every mutant was run individually.
- **Approach delta:**
  - The plan had P2.2 as a single build step. It took 3 F9b back-loops plus 1 in-place shortcut, driven by 5 fresh adversarial verify-self rounds.
  - At the third back-loop the orchestrator ran the whole probe matrix itself before handing back (the build skill's handed-back-≥2× rule). That round's residual failure (output past the cap) was a design gap, not a regression.
  - A consuming-surface test was added at codify, driving the real async command.
  - The review's findings were auto-backlogged, not refactored.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SHORTCUT-2026-09-23] P2.2 — re-verify 4 found that the child's own output past MAX_OUTPUT was silently cut into an `Ok`. Fixed as a small extension of P2.2's `Drain`: an `overflowed` flag, then `OutputTooLarge` for stdout or a truncation marker for stderr, with 3 new tests and 3 mutants. A FRESH subagent re-verified it (re-verify 5: 11/12 PASS; the 1 COSMETIC doc phrase was fixed).
[SHORTCUT-2026-09-23] P1.1 — verify-self run 1 found that `run_on_main_thread` was cut as a spawn boundary, exempting a real main-thread freeze. The fix was one line in the file P1.1 wrote: removing it from `SPAWN_BOUNDARIES`, plus the doc. A fresh subagent then re-verified it: the mutant fails and the spawn negative control stays green.
