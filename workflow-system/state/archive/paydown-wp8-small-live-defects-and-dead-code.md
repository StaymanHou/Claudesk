---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP8 — small live defects and dead code

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23

## Problem Statement
Close the 11 WP8 items of the 2026-09-23 backlog-paydown sweep (`workflow-system/product/backlog-paydown-wbs.md` §WP8). Each one is a small live defect, a piece of dead code, or a doc fix, and each closure names the mutant that now dies (or states why none exists).

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` §WP8, plus §"The sweep's central risk" and §Rulings R1.
- Finding bodies are in `workflow-system/state/backlog-quality-findings.md`; the pointer stubs are in `backlog.md`.
- Harness: `src/components/workspace/__tests__/liveWorkspace.tsx` (`statusState: "running"` holds an apply in the queue).
- Gate: `pnpm verify:auto` (timeout 216000). Run `prettier --write` + `eslint` on touched files first.
- Mutation pattern: `cp` backup → `perl -0pi -e` → `grep -cF` to confirm it landed → run → `cp` restore → `shasum`.

### Per-item findings from plan-time reading (each re-anchored by symbol)
- **H1:** `Workspace.tsx`, the drive-mode readout `<span role="button">`. `onClick`/`onKeyDown` always call `setEditingDriveMode(true)`, and `respawnWanted` gates only `resolveDriveMode`. The fix follows Option A: while `respawnWanted`, set `aria-disabled`, open no editor, name the queued mode (`storedDriveMode`, already optimistically written) in the tooltip, and add an `.is-queued` class plus CSS (`cssModifierAudit` requires a rule).
- **I6:** `Workspace.tsx`, `workspace-turn-readout`, which is mounted only under `turnNav.total > 0`. Render it unconditionally and gate only its text and `title`. `:empty` drops the padding so zero turns reserve no space.
- **AE2:** `state/workspace.ts`, `WorkspaceStatus` plus `Workspace.status`. Its only readers are `workspace.test.ts:15,30`. Its writers are `makeWorkspace` and 3 test fixtures (`workspaceDriveModeRender`, `supervisorSuppressedRender`, `liveWorkspace`). `workspaceStatus.ts:18` has a comment that references it. The deletion and its migration go in one commit, then `check:link`.
- **E3:** `adjudicator/mod.rs`, `run_command`. `wait_with_output()` already holds stderr, and `.map(|o| o.stdout)` discards it. Pass it through. The test `a_non_zero_exit_is_failed_with_its_code` is extended with `sh -c 'echo boom >&2; exit 3'`.
  - The pipes-not-drained MINOR (`SURFACE-2026-09-23-QUALITY-RUN-COMMAND-PIPES-NOT-DRAINED`) is **left with WP9**. Draining needs reader threads and a deadline that starts before the write, which is the same restructure as WP9's async move. Doing it here would build it twice.
- **U1:** `cc_session/mod.rs`, `KillStep::ReapLeader`, `let _ = self.poll_reaped(..)?`. Log on `Ok(false)` using `eprintln!("[claudesk] …")`, the crate idiom.
- **M2.2:** `cc_spawn_env`, `if let Ok(wire)`. Make the can't-happen arm loud with `eprintln!` rather than `expect`: CLAUDE.md says "no unwrap outside tests", and a panic in the spawn path would be worse than the dropped var.
- **M2.1:** `claudesk-hook.pl` `%KNOWN`. ⚠️ **A hoist would change nothing.** The script is one process per event, so the hash is already built once per process. Hoisting it to file scope would build it for all 10 events instead of just `UserPromptSubmit`. The finding's real complaint is "the question the comments invite is left unanswered", so answer it with one comment line at the site. The line shape `my %KNOWN = map … qw(…)` stays, because `config_store` `drive_mode_serializes…` greps for it.
- **T2:** `editor_fs::validate_root` returns `OutsideWorkspace { root: "<no known project>" }`. Add an `UnknownRoot(String)` variant and update the 2 `validate_root_*` rejection tests plus the `commands.rs` module doc. The frontend matches no error string (grepped).
- **T3:** `resolve_within`, `exists()` → `canonicalize()`. Add a one-line note that the window is re-validated.
- **D1:** `verdict.ts`, `tokens: input.contextTokens as number`. Replace `shouldRecycle(): boolean` with `recycleTokens(): number | null`, which narrows by type, so the cast is deleted. The comment at `verdict.test.ts:513` names `shouldRecycle` and is updated with it.
- **A2:** `draftHistory.ts`, `appendToHistory`. ⚠️ **Plan-time reading refutes it.** Both the blank arm and the no-storage arm return `loadHistory(projectPath)`, and `loadHistory` runs its own `safeStorage()` guard first. Reordering would therefore remove no storage read. Close as **no-change-needed with evidence**, with no edit.
- **H5c:** `App.css`, `.workspace-header-drivemode` is declared twice (`flex-shrink…` and `cursor: pointer`). Merge them.
- **K1:** `archive/m13-wp4-milestone-exit-verify.md`. Move "Phase 2 — pre-read" to directly before "Phase 2 — live observation results", and "Phase 4 — pre-read" to directly before "Phase 4 — doc resync". Prove the move changed nothing else by comparing the sorted line multiset before and after.

## Work Tree

- [x] T1 AE2 — delete `WorkspaceStatus` + `Workspace.status`, migrate factory/fixtures/tests/comment; `check:link`
- [x] T2 H1 — disable the drive-mode readout while `respawnWanted` (+ `.is-queued` CSS, tooltip); live-mount test + mutant
- [x] T3 H5c — merge the two `.workspace-header-drivemode` rules
- [x] T4 I6 — mount the turn readout unconditionally, gate text only; test + mutant
- [x] T5 D1 — `recycleTokens()` narrows by type; delete the cast; mutant
- [x] T6 E3 — pass captured stderr into `Failed`; test + mutant
- [x] T7 U1 + M2.2 — log a failed reap; make the can't-happen serde arm loud
- [x] T8 T2 + T3 — `EditorFsError::UnknownRoot`; tests + mutant; TOCTOU note
- [x] T9 M2.1 — answer the per-call-cost question at `%KNOWN` (no hoist; see Context)
- [x] T10 K1 — reorder the archived WIP's phase sections by move; multiset-verified
- [x] T11 A2 — record no-change-needed with evidence
- [x] T12 gate — `pnpm verify:auto` green

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Build evidence (act, 2026-09-23)

Every mutant was run INDIVIDUALLY: `cp` backup, `perl -0pi`, a `grep -c` check that it landed, then the run, then a `cp` restore checked with `shasum`. Every restore matched.

| Item | Change | Mutant → result |
|---|---|---|
| AE2 | Deleted `WorkspaceStatus`, `Workspace.status`, the `makeWorkspace` default, 3 fixture lines and 2 test reads. The `workspaceStatus.ts` comment now says the wire type is the only status vocabulary. | This is a deletion, so there is no mutant. `tsc` is clean and `check:link` reports "every entry linked cleanly (main, pip)". It is one commit with its consumer migration. |
| H1 | While `respawnWanted`, the readout gets `aria-disabled`, `.is-queued`, and a queued-mode tooltip (`queuedDriveModeTitle`), and click/Enter open nothing. New CSS for `.is-queued`: no pointer, no hover lift. | M1 drops the click gate → the new test **fails**. M2 drops the keyboard gate → **fails**. The positive control is `choose()` opening the editor before the queue exists. |
| H5c | Merged the two `.workspace-header-drivemode` rules and kept the affordance comment. `grep -c` of the base selector is 1. | CSS only, no mutant. |
| I6 | The readout `<span aria-live>` is always mounted, with its text and `title` gated. `:empty` drops the padding. | Restoring the `{turnNav.total > 0 && (…)}` mount → **2 tests fail**: the at-rest EMPTY-readout test, and the new node-IDENTITY test (the same node at rest and at "1/1"). |
| D1 | `shouldRecycle(): boolean` became `recycleTokens(): number \| null`, and the `as number` cast is gone. | `? tokens` → `? 0` → **fails** (`r.tokens` = OVER). Dropping `isFeatureWorkflow` → **fails**. |
| E3 | `wait_with_output()`'s stderr is passed into `Failed`. New test `a_non_zero_exit_carries_the_captured_stderr` checks `sh -c 'echo boom >&2; exit 3'` and the `Display`. | Restoring `String::new()` → the new test **FAILED**. |
| U1 | `ReapLeader` `eprintln!`s on `Ok(false)`. | No test mutant: this only adds observability through `eprintln!`, the crate idiom. The bounded-wait contract is unchanged. |
| M2.2 | `if let Ok` became a `match`, and `Err` now `eprintln!`s. It is not an `expect`, per CLAUDE.md's no-unwrap rule. | No mutant: the arm cannot be reached for a fieldless enum. |
| M2.1 | A comment at `%KNOWN` answers the per-call-cost question. **No hoist**: one process per event, so hoisting would build it for all 10 events instead of 1. | The line shape is kept, so `config_store`'s allowlist-extraction test still finds it. The suite is green. `perl -c` reports OK. |
| T2 | New `EditorFsError::UnknownRoot(String)`, used by `validate_root`. 2 tests and 2 doc links updated. | Restoring `OutsideWorkspace{root:"<no known project>"}` → **2 tests FAILED**. |
| T3 | A one-line note at `resolve_within`'s `exists()` explains why the window is re-validated. | Comment only. |
| K1 | Moved "Phase 2 — pre-read" to before "Phase 2 — live observation", and "Phase 4 — pre-read" to before "Phase 4 — doc resync". | The Python move asserted `Counter(lines)` identical before and after (52 +/52 −). The "(recorded before observing/editing)" markers are kept in the titles. |
| A2 | **No change needed.** Both the blank arm and the no-storage arm return `loadHistory(projectPath)`, and `loadHistory` runs `safeStorage()` first. Reordering would remove zero storage reads, so the finding's premise does not hold. | n/a: nothing was edited. |

**Gate:** `pnpm verify:auto` EXIT 0 in 38s. Frontend: 222 files / **2985** tests (+3). Rust: 905 + 19 + 1 (+1). The only lint warning is the known `XtermPane.tsx:895`.

**Deliberately NOT folded in:** `SURFACE-2026-09-23-QUALITY-RUN-COMMAND-PIPES-NOT-DRAINED` stays with WP9. Draining needs reader threads and a deadline that starts before the write, which is the same restructure as WP9's async move.

## Verification Observable

**Observable:** Each WP8 behavior change holds on its consuming surface. H1 and I6 are checked on a live `Workspace` mount, and D1 through the real `decide`. E3 and T2 are checked against a real `sh` child and a real temp-dir `validate_root`. The AE2 deletion has to leave the app booting and every entry linking, and K1's archived file has to hold exactly HEAD's line multiset.
**Verification command:** `vitest run workspaceDriveModeLive turnNavControls verdict workspace.test appBoot` + `cargo test --lib -- adjudicator:: editor_fs::` + `pnpm check:link` + a `Counter(git show HEAD:<k1>) == Counter(<k1>)` check.
**Expected result:** Every vitest file and test passes with a non-zero count. Both cargo filters report `ok` with a non-zero `passed`. `check:link` reports "every entry linked cleanly". The K1 check prints `K1 multiset identical`.

## Verification Result

**Status:** PASS
**Date:** 2026-09-23
**Evidence:** vitest `Test Files  5 passed (5)` / `Tests  81 passed (81)`; cargo `adjudicator::` → `ok. 8 passed`, `editor_fs::` → `ok. 42 passed`; `check:link — every entry linked cleanly (main, pip)`; `K1 multiset identical` (against `git show HEAD:`, and the file differs from HEAD, so the check is not vacuous).
**Notes:** Every behavior change holds on its consuming surface, and each one's mutant was shown to die at act (see Build evidence). The AE2 deletion leaves boot and linking intact.

## Retrospect
- **What changed in our understanding:**
  - Two of the 11 findings were wrong about what they claimed. A2's premise fails: both arms call `loadHistory`, which guards itself, so there was no read to save. M2.1's own suggested fix (hoist) would have made things slightly worse, because the hook is one process per event.
  - Reading a finding's mechanism against live code before acting is what separated "fix it" from "refute it". The WBS text alone said to fix both.
- **Assumptions that held:**
  - `liveWorkspace.tsx`'s `statusState: "running"` holds an apply in the queue with no fake timers. The WP7 harness carried two new behavioral tests (H1, I6) unmodified.
  - E3 was a one-line change, because `wait_with_output()` already held the stderr.
- **Assumptions that were wrong:**
  - The arch doc `arch/session-resumption.md` still described H1 as a "known open defect". The backlog was not the only live record of it, so it was updated at close.
- **Approach delta:**
  - A2 closed as no-change-needed and M2.1 as a comment rather than a hoist, both disclosed.
  - E3 got a new test rather than an extension of the existing exit-code test.
  - Otherwise the work matched the plan.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
