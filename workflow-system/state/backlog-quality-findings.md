# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# paydown-2026-11-04-wp4-run-lock-and-sync-guard — 2026-11-04

*(feature-review-quality on ship commit `190b3a2`, window `00ebf92..190b3a2`; drive_mode=autopilot. 1 MAJOR + 4 MINOR auto-backlogged.)*

## SURFACE-2026-11-04-QUALITY-WP4-PROCESS-GROUP-PRIMITIVES-DUPLICATED
- **Severity:** MAJOR
- **Location:** `src-tauri/src/workflow_install/runner.rs` (`StopOnDrop`, `DRAIN_GRACE`, `kill_group`, `kill_and_reap`) vs `src-tauri/src/adjudicator/mod.rs` (`StopOnDrop`, `DRAIN_GRACE`, `kill_tree`).
- **Finding:** The process-group primitives are copied rather than shared: an identical `StopOnDrop` struct and Drop body, the same 250 ms grace, and the same group-SIGKILL → kill → reap sequence. Not reusing `Drain` itself is justified, because `Drain` is a capped byte buffer and `run_streaming` needs live per-line delivery to a sink. The primitives beneath it are not.
- **Why it matters:** There are two kill-and-reap implementations, and only the adjudicator documents its limits. Its "does NOT do" list (a grandchild that `setsid`s or uses job control escapes the group kill) applies to the runner too, unstated. A future fix, such as descendant tracking, will land in one copy only.
- **Suggested action:** A small shared module (process-group spawn, `kill_group`, `kill_and_reap`, `StopOnDrop`, the grace constant, and the limits doc). Do it before a third subprocess runner appears.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-GRACE-PATH-DROPS-QUEUED-OUTPUT
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `run_streaming`, the grace-expiry arm.
- **Finding:** The grace-expiry arm calls `kill_group` and breaks without draining lines still queued in `rx`, while the deadline arm drains with `try_recv`. Each loop pass consumes one line, so a burst still in the channel when the grace ends is lost.
- **Why it matters:** The two kill exits handle in-flight output differently.
- **Suggested action:** The same three-line `try_recv` drain before the break, with a test that emits a burst then backgrounds a pipe holder.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-RUN-STREAMING-OUTPUT-UNCAPPED
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `run_streaming` (`combined`, `stderr`, the unbounded channel, `BufReader::lines()`).
- **Finding:** No output cap. The adjudicator added `MAX_OUTPUT` after a pipe flood produced a measured 1.9 GB allocation (paydown 2026-09-23 WP9 probe P4). The gap pre-dates WP4, but the 600 s deadline now bounds how much can pile up.
- **Why it matters:** A lesson already learned next door was not carried over. The risk is low, because the script is the managed clone's own `install.sh`.
- **Suggested action:** Cap the accumulated output (discard past N bytes and append a truncation note), never by backpressure on the pipe. Fold this into the shared module above.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-THREE-WAYS-TO-RELEASE-THE-RUN-LOCK
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/commands.rs`: `RunGuard` (the workers), `HeldRunLock` (the dry run), and manual `running.store(false)` on the early-error returns of `workflow_install_start` / `workflow_uninstall_start`.
- **Finding:** The single-run lock is released three different ways, and `HeldRunLock` can be built without acquiring the lock, so taking and releasing it are still separate statements.
- **Why it matters:** The manual releases on early returns are the shape a panic or an early `?` has wedged before.
- **Suggested action:** `HeldRunLock::try_acquire(&control) -> Option<Self>`, used by all three commands and held by `RunGuard`, removes the four manual releases. ⚠️ `every_substrate_touching_command_takes_the_single_run_lock` greps `running.swap(true` within 400 chars of each command, so it must move with this change.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-SPAWN-BLOCKING-HOP-REPEATED
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs` (`trash_path`), `src-tauri/src/adjudicator/commands.rs` (`on_worker`), `src-tauri/src/workflow_install/commands.rs` (`finish_on_worker`).
- **Finding:** `spawn_blocking(...).await.map_err(|e| format!("… stopped unexpectedly: {e}"))?` appears three times, each worded differently.
- **Why it matters:** It is the remedy `ASYNC_COMMANDS` reasons point to, so it will spread as more commands move off the main thread.
- **Suggested action:** A shared helper. Low cost either way.
- **Priority:** low
- **Status:** pending

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** gap (process)
- **Summary:** Phase 2's observable required the verdict cite `ProjectPicker.tsx:38-42` "as the precedent it **is following**." The verdict correctly *reversed* that conclusion (sibling command, not a widening) and cites the precedent as **declined**, by name rather than by line — so the literal string `ProjectPicker.tsx:38-42` appears nowhere, and a mechanical grep of the observable reports a miss on a phase marked `[x]`.
- **Context:** The reversal is the *right* outcome; the defect is that the observable was not amended when the conclusion inverted. Generalizable process point: **when a phase's finding overturns the assumption its own observable encoded, the observable must be rewritten, not silently outgrown** — otherwise a later audit reads the mismatch as an unfinished phase.
- **Suggested action:** No code change. Consider whether `feature-verify-codify` should prompt to reconcile observables that a verdict reversed. Low value alone; worth folding into a future workflow-system pass.
- **Priority:** low
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §B.6

