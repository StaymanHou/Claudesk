---
workflow: task
state: close (complete)
completed: 2026-11-09
created: 2026-11-09
docs-only: false
---

# Task: Bound `run_streaming`'s kill-exit drain

**Workflow:** task
**State:** Completed 2026-11-09
**Created:** 2026-11-09

## Problem Statement
Both kill exits of `run_streaming` (`src-tauri/src/workflow_install/runner.rs`) drain the channel
with `while let Ok(..) = rx.try_recv()` before the readers' stop flag is set. A writer outside the
process group (a `setsid` grandchild that survives `kill_group`) can keep that loop fed. The run
then overruns `deadline` and keeps holding the install lock, which breaks the function's headline
promise ("It always returns by `deadline`").
(`SURFACE-2026-11-09-QUALITY-WP6-KILL-EXIT-DRAIN-UNBOUNDED-BEFORE-STOP`, MAJOR.)

## Context
- `run_streaming`, its two kill-exit arms, and `start_line_reader`, which checks `stop` at the top of each line: `src-tauri/src/workflow_install/runner.rs`.
- `StopOnDrop`, `DRAIN_GRACE` (250 ms) and `MAX_OUTPUT` (4 MiB): `src-tauri/src/subprocess/mod.rs`.
- ⚠️ **The finding's first suggestion ("set stop before draining") is necessary but NOT sufficient.**
  Under a slow sink, the queue a flooder built up during the grace window is itself thousands of
  lines, and each one costs a `sink.line` emit until the 4 MiB budget is spent. So the drain also
  needs a **time cap**. Drain until the queue is empty or `max(started + deadline, now) + DRAIN_GRACE`.
  Past the cap, count the lines still queued (a cheap `try_recv` loop, finite once `stop` is set)
  and append one note, so the sink and the result still agree.
- Existing tests that must stay green: `a_burst_still_queued_when_the_drain_grace_ends_is_kept`
  (deadline 60 s, about 1 s of drain, so the cap does not touch it), plus the deadline and grandchild tests.

## Work Tree

- [x] T1 `StopOnDrop::stop_now()` (Drop calls it) in `subprocess/mod.rs`.
- [x] T2 In `run_streaming`, one helper drains both kill exits: `stop_now()`, then `try_recv` into `take` until the queue is empty or the cap is reached, then count what is left and add a `[N queued lines dropped …]` note through the sink. Update the `## It always returns by deadline` doc.
- [x] T3 Tests: a `setsid` perl flooder that outlives the child, with a 1 ms-per-line sink, at BOTH exits (grace arm: the child exits 0; deadline arm: the child `exec sleep`s). Each run must return within `deadline + DRAIN_GRACE + margin` and kill the flooder at teardown.
- [x] T4 Mutation-prove each test INDIVIDUALLY against its arm (restore the old drain on that arm; the test must fail through its watchdog), with `cp` backup + `shasum` restore.
- [x] T5 `pnpm verify:auto` (timeout 263000).

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (Completed 2026-11-09)
- **Blocked:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Scope note
Only the MAJOR is fixed here. The 4 WP6 MINORs stay open: the backlog pointer is rewritten to them at close.

## Act evidence
- T3: the 2 new tests passed in 3 of 3 runs (each about 2.25 s).
- T4 mutants, each run alone, the file restored and shasum-verified afterwards:
  A (grace arm back to the old drain) → only the grace test fails ("did not return", watchdog 12 s).
  B (deadline arm back to the old drain) → only the deadline test fails (watchdog 11 s).
  D (cap removed, stop kept) → both fail ("returned only after 5.27 s" / "10.40 s"). This proves that
  the finding's "set stop first" alone does not hold the deadline under a slow sink.
  Not proven: removing `stop_now` alone (keeping the cap) survives, because the post-cap count loop outpaces
  any pipe producer. The stop is belt-and-braces for the count loop's termination, not the deadline.
- T5: `pnpm verify:auto` EXIT=0 (vitest 3856; cargo lib 1104 = 1102 + 2), after `cargo fmt` and an
  unused-binding fix flagged by the first two runs.

## Verification Observable
**Observable:** a run whose output is flooded by a `setsid` writer that survives the group kill returns
within `deadline + DRAIN_GRACE + 1 s` at both kill exits, and the old drain does not.
**Verification command:** `cargo test --lib setsid_flooder`, plus the mutants above and `pnpm verify:auto`.
**Expected result:** 2 passed; each old-drain mutant fails its own arm's test.

## Verification Result
**Status:** PASS
**Date:** 2026-11-09
**Evidence:** `test result: ok. 2 passed` (×3). Mutants A, B and D each fail as listed. verify:auto `EXIT=0`.
**Notes:** each test asserts a recorded PID (written after `setsid` succeeds), flood lines reaching the sink, and the drop note, so it cannot pass unflooded.

## Retrospect
- **What changed in our understanding:** the finding's first suggested fix (stop the readers before draining) does not hold the deadline by itself. Under a slow sink, the queue a flooder builds during the grace window costs seconds to drain. Mutant D measured 5.3 s and 10.4 s. The time cap is the part that keeps the promise.
- **Assumptions that held:** the existing burst test (2,000 lines kept at 0.5 ms a line) stays green under the cap, because its 60 s deadline leaves the drain room.
- **Assumptions that were wrong:** the first positive control ("the flooder is still alive after the run") was racy. Once the run returns, the readers close the pipe and the flooder dies of SIGPIPE. It was replaced with recorded PID + flood lines + drop note.
- **Approach delta:** a time cap and a drop note were added beyond the plan's literal fix (both planned in Context). Only the MAJOR was fixed; the 4 MINORs stay, with the pointer rewritten.

## Closure
> **Closure notice:** the WP6 MAJOR is fixed. A `setsid` writer can no longer hold `run_streaming` (and the install lock) past its deadline, and each kill exit has a test that fails on the old drain. Requester = operator. This is the closure notice for the operator's own record.
