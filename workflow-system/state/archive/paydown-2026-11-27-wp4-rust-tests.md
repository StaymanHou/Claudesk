---
workflow: task
state: close (complete)
created: 2026-11-27
completed: 2026-11-27
drive_mode: autopilot
docs-only: false
---

# Task: paydown-2026-11-27 WP4 — Rust test + guard precision

**Workflow:** task
**State:** Completed (2026-11-27)
**Created:** 2026-11-27

## Problem Statement
Close the WP4 Rust test-and-guard findings: duplicated source-guard helpers, an indent-bound
guard, a guard spelling gap, a missing spawn boundary, and four small pins/hygiene items.

## Context
- `workflow-system/product/backlog-paydown-wbs.md` §WP4, Default D9
- ⚠️ Plan written at close: executed from the WBS item list (as WP3).

## Work Tree

- [x] T1 `src/test_support.rs` (test-only): `production_text` (cut at the test module; a file with none is production to its end; a test module under another name panics), `without_comment_lines`, `dense`, `span`, `dense_production_fn`, `is_cfg_test` (+ `all(test, …)`), `item_attrs` (every variant). Adopted by `remote_link/commands.rs`, 9 sites in `cc_session/mod.rs`, `source_guard`, `remote_ops_tests`, and (by `#[path]`) `tests/sync_commands_do_not_block.rs`
- [x] T2 Spawn-permission guard anchored in the `RegisteredSession` literal
- [x] T3 Brittle pin: already gone (M17 WP5 replaced it with behavioural `FakePorts` tests, "edge Ended" counted once); closed as resolved along the way
- [x] T4 `GitClean` Command form (statement-scoped), meta cases + near-misses
- [x] T5 `on_blocking_worker` in `SPAWN_BOUNDARIES` + a meta-test
- [x] T6 `AUTH_CHECK` reads `TOKEN_FILE` (test); `DRIVE_MODES` derived from `DriveMode` (D9) + a wire-set test; resolver tests moved to `profiles.rs`; conf assert message; `src-tauri/.gitignore` `/ssh:/`
- [x] T7 `pnpm verify:auto`

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** every guard change kills its mutant, and the full gate is green.
**Verification command:** per-item mutants below; `pnpm verify:auto`
**Expected result:** each mutant FAILS its test; `verify:auto` EXIT=0.

## Verification Result

**Status:** PASS
**Date:** 2026-11-27
**Evidence:**
- `SPAWN_BOUNDARIES` without `on_blocking_worker` → `work_handed_to_on_blocking_worker_is_not_flagged` FAILED.
- Spawn literal's `permission,` → `permission: SpawnPermission::NoStart,` → `profile_spawn_caller_orders_its_profile_decisions` panicked at the new assertion.
- `GitClean`: the whole Command term zeroed → the template-spelling test FAILED; `[^;]` widened to `.` → the near-miss `Command::new("git").arg("status"); let s = "clean";` FAILED; each alternative knocked out alone (`GIT_BIN` → `GIT_BINX`, `"git"` → `"gitX"`) → exactly its own case "counted 0".
- `test_support`: cut at the first `#[cfg(test)]` → 2 meta-tests FAILED; `Item::Const` arm emptied → the variant test FAILED.
- `config_target` `Missing → Some(Default)` → the moved `profiles` test FAILED.
- First full `cargo test` after adoption: `folder_trust/commands.rs` has no test module and the first `production_text` panicked on it; the rule was refined (no test module → whole file; a differently-named one → panic), with tests for both.
- All mutants restored by `cp` + `shasum`. `pnpm verify:auto` EXIT=0 in 69 s (4199 vitest; cargo green; the one lint warning is the pre-existing `XtermPane` exhaustive-deps warning).

## Discoveries
<!-- none -->

## Retrospect
- **What changed in our understanding:** the M17WP4 pin finding had been overtaken by M17 WP5's behavioural seam; nobody had closed it. `cc_session` had nine hand-rolled production cuts, not three, so the helper adoption went wider than the finding named (same result wherever the old cut hit the test module).
- **Assumptions that held:** every change was test-side except `is_drive_mode` (a derivation, pinned) and the `.gitignore` line.
- **Assumptions that were wrong:** "every source file has a test module" — `folder_trust/commands.rs` does not; caught by the first full run.
- **Approach delta:** the WBS said "share by `#[path]` if `pub(crate)` can't reach it" — that was needed for the integration test, with an `#[allow(dead_code)]` for the helpers it does not call.

**Closure notice:** Requester = operator — closure notice for self-record. Paydown WP4 is complete: 11 findings closed.
