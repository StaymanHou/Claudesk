---
workflow: task
state: close (complete)
completed: 2026-11-17
created: 2026-11-17
docs-only: false
drive_mode: autopilot
---

# Task: M17 WP7 review — the catch-up waiter and the shared toast (2 MAJORs + 2 MINORs)

**Workflow:** task
**State:** Completed 2026-11-17
**Created:** 2026-11-17

## Problem Statement
A remote Docs catch-up can raise a false "took too long" error toast after quick tab-switching (its
waiter outlives `pause`), and the docs notice overwrites or clears whatever toast the workspace is
already showing, including a standing inject-failure error.

## Context
- Findings: `workflow-system/state/backlog-quality-findings.md` → `# m17-wp7-remote-reads — 2026-11-17`
  (`SURFACE-2026-11-17-QUALITY-CATCH-UP-WAITER-OUTLIVES-PAUSE`,
  `…-QUALITY-DOCS-NOTICE-CLOBBERS-THE-SHARED-TOAST`, `…-QUALITY-QUIT-TEARDOWN-COMMENT-ORDER`,
  `…-QUALITY-LINK-DOWN-WORDS-HAND-COPIED`); backlog pointer `## Code-quality findings — m17-wp7-remote-reads`
  says the MINORs ride along.
- Backend: `src-tauri/src/remote_fs/poller.rs` (`RemotePoller::pause`, `HostState.waiters`),
  `poller/commands.rs` (`remote_poll_catch_up`: a dropped sender → `Disconnected` → "no longer watched").
- Frontend: `src/components/workspace/docs/remoteDocsCatchUp.ts` (`useRemoteDocsPolling`),
  `src/components/workspace/Workspace.tsx` (`toast` state, `showDocsNotice`).
- Tests: `poller/tests.rs`, `__tests__/remoteDocsCatchUp.test.tsx`, `__tests__/injectFailureToast.test.tsx`
  (live Workspace mount, drives `onDocsNotice` through the stubbed right panel).
- Design:
  - `pause` drops the workspace's waiters (the receiver disconnects at once; nothing can answer them,
    since a paused workspace is in no tick).
  - The hook's effect gets a `cancelled` flag set in its cleanup: a cancelled catch-up shows no result
    toast, logs nothing on a reject, and the cleanup clears its own "Checking…" toast. A cancelled
    SUCCESS still marks `answeredRef` (the backend recorded the baseline); a cancelled reject does not.
  - The toast carries an owner (`source: "docs"` on docs notices). A docs notice replaces only an empty,
    docs-owned or info toast, never another source's error; `null` clears only a docs-owned toast.

## Work Tree

- [x] T1 Backend: `pause` drops the paused workspace's catch-up waiters; doc comments updated; a deterministic test (another workspace's exec holds the worker, w1 catches up then pauses → its receiver disconnects at once, not after a timeout), mutation-proven
- [x] T2 Frontend hook: `cancelled` flag in the effect cleanup (no result toast, no error log, clears its own "Checking…"); tests: leave before the answer → no result notice, `null` sent; a late success after leaving announces nothing; mutation-proven
- [x] T3 Workspace toast owner: `source` on the toast state; `showDocsNotice` respects it; live-mount tests (a standing inject error survives "Checking…" and `null`; an info notice is replaced; a docs toast is cleared by `null`), mutation-proven
- [x] T4 MINORs: move the WP3 comment above `links.stop_all()`; pin `LINK_DOWN_TEXT` to Rust's `LINK_DOWN` with a node:fs test
- [x] T5 `pnpm verify:auto` green

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Act notes
- T1: mutant (the `waiters.remove` line deleted) fails the new test with `Err(Timeout)` vs `Err(Disconnected)`.
- T2: 4 mutants (late success announces; cancelled reject handled; clear even when settled; no cleanup clear) each fail ≥1 test. Refinement over the plan: the cleanup clears "checking…" only while the check is still PENDING — an answer already shown stays (a failure toast is meant to stay until dismissed).
- T3: 4 mutants (null clears anything; blocks every non-docs toast; replaces errors; no owner tag) each fail ≥1 test.
- T4: the pin fails when Rust's `LINK_DOWN` wording changes.
- T5: `pnpm verify:auto` EXIT=0, 73 s (vitest 4045, cargo lib 1362). First run failed only on Prettier for the new test file; fixed with `prettier --write`.

## Verification Observable

**Observable:** Each of the three failure modes is refused by the REAL code path: (1) a paused workspace's pending catch-up ends at once on the real `RemotePoller` with a live worker thread held mid-tick (not after the timeout); (2) the real `useRemoteDocsPolling` through the IPC edge announces nothing for a catch-up that answers after its panel left, and clears its own "checking…"; (3) on a live `Workspace` mount, a standing inject-failure error survives a docs "checking…", its result and a docs `null`, while the docs toast's own `null` still clears it.
**Verification command:** `(cd src-tauri && cargo test --lib remote_fs::poller) && ./node_modules/.bin/vitest run src/components/workspace/__tests__/remoteDocsCatchUp.test.tsx src/components/workspace/__tests__/injectFailureToast.test.tsx src/components/workspace/__tests__/remoteRightPanelLive.test.tsx`
**Expected result:** exit 0; `a_pause_drops_the_workspaces_waiting_catch_up_instead_of_leaving_it_to_time_out ... ok`; vitest 3 files passed. Each assertion was mutation-proven during act (see Act notes), so a green run is not vacuous.

## Verification Result

**Status:** PASS
**Date:** 2026-11-17
**Evidence:** `test remote_fs::poller::tests::a_pause_drops_the_workspaces_waiting_catch_up_instead_of_leaving_it_to_time_out ... ok` / `test result: ok. 18 passed; 0 failed` / `Test Files  3 passed (3)` / `Tests  41 passed (41)` / `EXIT=0`. The full gate `pnpm verify:auto` also ran EXIT=0 (vitest 4045, cargo lib 1362).
**Notes:** All three failure modes are fixed on their real code paths. A LIVE remote run of the toast (quick tab-switching against the mini) is not reproduced here: it rides WP8's installed-build acceptance, which exercises the remote Docs catch-up on the mini.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** the review's "the effect sets a `cancelled` flag and skips the notice" was not the whole fix. Clearing its own "checking…" on leave also needs a `settled` flag, else leaving Docs would take down a result toast that had already landed (a failure toast is meant to stay until dismissed).
- **Assumptions that held:** both MAJORs were local to the catch-up path (one backend line, one hook effect, one `setToast` reducer). The existing live `Workspace` mount (`injectFailureToast.test.tsx`) could drive the toast-ownership cases without new harness work.
- **Assumptions that were wrong:** none of substance. The first `verify:auto` failed only on Prettier for a new test file.
- **Approach delta:** added the `settled` guard (above). The backend test made the race deterministic by holding the worker in ANOTHER workspace's exec, rather than relying on timing.

**Closure notice:** Requester = operator, so this closure notice is for the record. The WP7 review's 2 MAJORs and 2 MINORs are fixed: a quick Docs↔Prompt switch on a remote workspace no longer raises a false "took too long" toast, and the docs catch-up toast no longer overwrites or clears another notice. You'll see it live in WP8's installed-build acceptance on the mini.
