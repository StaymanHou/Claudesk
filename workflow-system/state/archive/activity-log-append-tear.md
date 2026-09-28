---
workflow: task
state: close (complete)
completed: 2026-09-28
created: 2026-09-28
drive_mode: autopilot
docs-only: false
---

# Task: Make StatusLog appends atomic and serialize rotation

**Workflow:** task
**State:** Completed 2026-09-28
**Created:** 2026-09-28

## Problem Statement
`StatusLog::append` writes a line and its `\n` as two `write` syscalls with no lock, so concurrent appenders can merge two records into one unparseable line, and two appenders racing `rotate_at` can discard a whole rotated generation.

## Context
- Backlog: `SURFACE-2026-09-28-QUALITY-ACTIVITY-LOG-APPEND-CAN-TEAR-UNDER-CONCURRENT-WRITERS` (MAJOR, `backlog-quality-findings.md`). This is the first step of the silent-supervisor investigation (`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`, high), which reads this log.
- `src-tauri/src/status_log/mod.rs`, `StatusLog::append`: `rotate_if_oversized()` → `OpenOptions::append` → `writeln!(f, "{line}")`. `writeln!` goes through `write_fmt`, which writes the `line` argument and the `"\n"` literal as separate `write_str` calls on an unbuffered `File`.
- **Writers of `supervisor-activity.log`:** `supervisor_activity::commands::supervisor_activity_append`, which is `async`, so appends from several workspaces run concurrently on runtime workers.
- **Writers of `status-channel.log` (this answers the finding's ⚠️):** the `claudesk-status-broadcaster` drain thread (`drain_loop`) and `log_registry_mutation`, which is called from the register/deregister commands on a different thread. So this log also has concurrent writers, and the fix belongs in `StatusLog` itself, where it covers both logs.
- **Rotation race:** two appenders both stat the live file as oversized. A renames live → `.1` and appends to a fresh live file. B then renames that fresh live file (holding only A's line) → `.1`, which replaces the generation A just rotated. About 5 MiB of records is lost.
- Constraints: no `unwrap()` outside tests (so a poisoned lock is recovered with `into_inner`); logging must stay best-effort and never panic.

## Approach
1. **Atomic line:** build `format!("{line}\n")` and write it with ONE `write_all` on the `O_APPEND` file. That removes the interleave window between the body and its newline.
2. **Serialized rotate + append:** hold a module-level `static APPEND_LOCK: Mutex<()>` across `rotate_if_oversized()` and the write. A single process-wide lock is enough: the volume is about one line per CC turn event, and dev/prod are separate processes with separate data dirs. Recover a poisoned lock with `unwrap_or_else(PoisonError::into_inner)`, because a panic elsewhere must not stop logging.
3. Update the module docs: the "Append-mode" bullet now states the single-write and lock guarantees.

## Work Tree

- [x] T1 Rewrite `StatusLog::append`: take `APPEND_LOCK`, rotate, then open and do one `write_all` of the pre-composed line
- [x] T2 Add an injectable-cap inner (`append_with_cap`) so the rotation race is testable without writing 5 MiB; `append` delegates with `MAX_LOG_BYTES`
- [x] T3 Test: N threads × M appends to one log. Assert exactly N·M lines, each well-formed, with every one of the (thread, i) ids present once
- [x] T4 Test: concurrent appends under a tiny cap. Assert every line in live + `.1` is well-formed, and that the newest line always survives in live or `.1` (no generation swallowed by a double rotate)
- [x] T5 Mutation-prove the tests individually. Revert to `writeln!` (tear): T3 must fail. Drop the lock but keep `write_all` (rotation race): T4 must fail, or record that it cannot discriminate. `sed -n` each mutated line to confirm the mutant landed
- [x] T6 Update the module doc comment and the `supervisor_activity` doc where they describe the append discipline
- [x] T7 Run `pnpm verify:auto`

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** In a running dev build, 400 CONCURRENT `supervisor_activity_append` IPC calls (the real `async` command, on runtime worker threads) each land as exactly one whole line in `supervisor-activity.log`, and every line of the file still parses as JSON.
**Verification command:** launch `pnpm tauri:dev` (Claude markers stripped) → via the MCP bridge, `Promise.all` of 400 `__TAURI_INTERNALS__.invoke('supervisor_activity_append', {line: JSON.stringify({probe:"tear-verify-<run>", i})})` → `python3` over `~/Library/Application Support/com.claudesk.app.dev/supervisor-activity.log` (plus `.1` if it rotated) counting the probe records and JSON-parsing every line.
**Expected result:** all 400 invokes resolve; exactly 400 probe lines with the 400 distinct `i` values present once each; 0 lines that fail `json.loads`.

## Verification Result

**Status:** PASS
**Date:** 2026-09-28
**Evidence:** Dev build (`pnpm tauri:dev`, markers stripped, PID 61274 → rebuilt 82838), three batches of 400 concurrent `supervisor_activity_append` invokes via the MCP bridge (`Promise.allSettled`, results read back from `window.__tearProbe`):
- Fixed build, run `tear-verify-1790609426154`: `count 400 distinct 400 complete True`
- Fixed build, run `tear-verify-b-…`: `{"ok":400,"rejected":[],"ms":45}` → `count 400 distinct 400 complete True`
- **Positive control, HEAD's `status_log/mod.rs` swapped in** (`writeln!(f, "{line}")`, no lock), run `tear-verify-CONTROL-…`: `{"ok":400}`, but `count 229 distinct 229 complete False` with **77 unparseable lines**, so 171 of 400 records were lost through the real IPC surface
- Fixed build restored (shasum `ff9d61e9…` matched) and rebuilt, run `tear-verify-FINAL-…`: `{"ok":400,"ms":56}` → `count 400 distinct 400 complete True`; `lines from first FINAL record to EOF: 400 unparseable: 0`
**Notes:** The positive control shows the observable discriminates: the pre-fix code tears on this exact surface and the fix does not. Afterwards the dev `supervisor-activity.log` was restored to its 16 pre-probe lines (a backup with the probes is in the session scratchpad), and the dev build was torn down.

## Act Notes
- **T1/T2:** `append` delegates to `append_with_cap(line, MAX_LOG_BYTES)`. That holds the process-wide `APPEND_LOCK` (a poisoned lock is recovered) across `rotate_at` and one `write_all(format!("{line}\n"))`. The now-unused `rotate_if_oversized` wrapper was deleted, and its doc was folded into `rotate_at`.
- **T3/T4:** `concurrent_appends_never_tear_a_line` (16 threads × 200 lines behind a barrier; ids set-equal, every line `<id> <payload>` exact) and `concurrent_appends_at_the_cap_rotate_exactly_once` (40 rounds; an at-cap seed plus 16 barrier-released appenders; `.1` must equal the seed and live must hold all 16 ids). The first run of T4 failed on a FIXTURE bug: the post-rotation lines went over the cap, so a second rotation was legitimate. The seed was enlarged, and a comment records that the lines must stay under the cap.
- **T5 mutation proof (each 3/3 runs, mutant lines confirmed with grep, file restored and shasum-matched):**
  - The pre-fix code (no lock + `writeln!`) → BOTH tests fail.
  - No lock, `write_all` kept → the rotation test fails; the tear test passes, as expected, because the single write alone prevents a tear.
  - Not probed as a kill: lock kept + `writeln!`. The lock also serializes the two writes within the process, so the tear test cannot see that mutant. `write_all` is defense in depth, not the only guard.
- **T6:** the module doc gained a "Concurrency-safe" bullet naming both logs' writers. The `supervisor_activity` doc already defers to `StatusLog`, so it needed no edit.
- **T7:** `pnpm verify:auto` EXIT=0 in 40s: frontend 3153, Rust 988 lib (+2). The one lint warning (`XtermPane.tsx:932`, exhaustive-deps) is pre-existing on HEAD.

## Retrospect
- **What changed in our understanding:** the finding was not only real but severe on the live surface. 400 concurrent IPC appends under the pre-fix code tore 77 lines and lost 171 of the 400 records (43%), much worse than the "loses two records" framing in the finding. `status-channel.log` also has two concurrent writers (the drain thread + the register/deregister commands), so the fix belongs in the shared `StatusLog`.
- **Assumptions that held:** a single `write_all` stops the tear, and only a lock stops the double-rotate. Each is proven by its own mutant: dropping only the lock is caught by the rotation test alone.
- **Assumptions that were wrong:** the rotation test's first fixture let the post-rotation lines go over the cap, so a legitimate second rotation read as the race. This was caught on the first run, before any mutation. The MCP bridge's `webview_execute_js` times out on any script touching `invoke` here, even a fire-and-forget IIFE, so results had to be parked on `window` and read back in a second call.
- **Approach delta:** added a live positive control (swapping HEAD's module into the running dev build) beyond the planned unit-level mutation proof. Otherwise as planned.

## Closure notice
Requester = operator — closure notice for self-record.
> **Closure notice:** The activity-log torn-append fix is complete. `StatusLog` appends now go out as one `write_all` under a process-wide lock, so neither `supervisor-activity.log` nor `status-channel.log` can merge or lose records under concurrent writers. Verify with `cargo test --lib status_log::tests::concurrent`, or see the live 400-append evidence in this file's Verification Result.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
