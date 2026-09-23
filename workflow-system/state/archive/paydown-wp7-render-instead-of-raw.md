---
workflow: feature
state: finalize (complete)
ship_commit: a26b514
created: 2026-09-23
completed: 2026-09-23
drive_mode: autopilot
parent-wbs: workflow-system/product/backlog-paydown-wbs.md (WP7)
---

# Feature: Paydown WP7 — render instead of `?raw`; tests that re-implement production

**Workflow:** feature
**State:** Completed 2026-09-23. Ship `a26b514` plus the finalize commit, both local only, not pushed.
**Created:** 2026-09-23

## Problem Statement

Five tests prove a **copy** or the **source text** of the code, not the code itself.
- `turnNavControls.test.ts` (**I1**) greps `Workspace.tsx` for DOM-at-rest questions.
- `workspaceDriveModeRender.test.tsx` (**H4**) regexes `persist` / `e.payload.path`.
- `promptSendWiring.test.tsx` (**AH1**) re-implements the panel's send in `performSend`.
- The `requestCloseWithIntent` / Filmstrip × wiring (**AA1**) has no test at all.
- The adjudicator tests (**E2**) re-implement the production wait/kill loop.

Each item **replaces** a test with one that drives the real code, so production behavior must not change. The one exception is E2's behavior-neutral seam extraction.

⚠️ **The WP's central rule is closure by named mutant.** For every replaced guard:
1. Apply the mutant the OLD guard claimed to kill.
2. Confirm the NEW test fails on it, and that the mutant landed in executable code.
3. Restore from a `cp` backup and verify with `shasum`. Never use `git checkout`.
4. Only then delete the old guard.

Each `**Backlog resolved:**` line names the mutant that now dies.

⚠️ **A replacement can be WEAKER than what it replaces.** Two cases here:
- `performSend` captured `body` before the clear, and so does the panel. That makes "clear before archive" an **equivalent mutant** in the real panel. The old test's claim that the clear would wipe the body is false for the panel. Record this; do not fake a kill for it (`[[behavioral-test-can-still-be-an-equivalent-mutant]]`).
- A value test on an extracted predicate cannot see that a CALLER stopped calling it (`[[extracted-machine-needs-a-live-caller-guard]]`). So H4 goes through a live mount, not a bare extraction.

**No 3rd-party dependency.** Probe check skipped.

Problem statement unchanged (2026-09-23, Phase 1 F9b re-check). The back-loop was a missing consuming-surface outcome, not a wrong problem; the test seam and its mutants stand.

**No export is deleted by plan.** If one is, run `pnpm check:link` before trusting any observation (the `SURFACE-2026-08-25-A-DELETED-EXPORT…` high item).

## Work Tree

- [x] Phase 1: E2 — the adjudicator tests drive the real spawn/wait/kill loop  <!-- status: done 2026-09-23 -->
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml adjudicator` exits 0.
  - CLI: `grep -c "fn run_program_with_timeout\|fn run_adjudicator_with_program" src-tauri/src/adjudicator/mod.rs` → `0`. Both hand copies are gone.
  - CLI: named mutants, each applied alone; the named test fails, and after restore `shasum` matches.
    - Drop `child.kill()` in the timeout arm → the timeout test fails. It fails on elapsed time, because `wait()` then blocks ~30s.
    - Map `ErrorKind::NotFound` to `Spawn` → the missing-binary test fails.
    - Drop the stdin `write_all` → the echo test fails.
    - Return `Ok` on a non-zero exit → the exit-code test fails.
  - CLI: `pnpm verify:auto` exits 0.
  - IPC (consuming surface — added at the F9b back-loop, integration-boundary rule 1): the existing `supervisor_adjudicate` Tauri command, called on a running `pnpm tauri:dev` build via the MCP bridge `ipc_execute_command`:
    - `{model:"claude-haiku-4-5", prompt:"Reply with exactly the word: ok", timeout_ms:60000}` → resolves to a non-empty string containing `ok`. This proves the refactored path spawns `claude -p --model`, delivers stdin, and returns stdout.
    - `{…, timeout_ms:1}` → rejects with a message matching `/timed out/`. This proves the timeout arm is reached through the command.
  - [x] P1.4 (F9b back-loop) Add the consuming-surface outcome above to the plan.  <!-- status: done -->
  - [x] P1.1 Extract `run_command(cmd: Command, prompt, timeout_ms)`, which holds the spawn, the stdin write, and the wait/kill loop. `run_adjudicator` then builds `claude -p --model <m>` and delegates to it. Behavior-neutral.  <!-- status: done -->
    - ⚠️ Keep `stderr: String::new()` as it is. **E3** (pass stderr through) is routed to WP8. Note that the new seam makes E3 testable: `sh -c 'echo boom >&2; exit 3'`.
  - [x] P1.2 Rewrite the tests against `run_command` using real `sh -c` children:
    - `cat` echoes the prompt back, which proves stdin is delivered and stdout returned.
    - `exit 3` → `Failed { code: Some(3) }`.
    - `exec sleep 30` under a 300ms timeout → `TimedOut`, with an elapsed-time bound.
    - A nonexistent program → `NotFound`.
    - Delete both helper copies.  <!-- status: done -->
  - [x] P1.3 Mutation-prove each mutant above, one at a time.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; pnpm verify:auto exit 0 in 37s — 220 files / 2973 tests, Rust 903 lib incl. 6 adjudicator; only the known XtermPane.tsx:895 lint warning. Post-F9b re-check: only .md files changed; cargo fmt --check OK; adjudicator 6/6 -->
  - [x] verify-self  <!-- status: done; subagent 8/8 PASS (4 mutants each killed only its named test, final shasum 7f3cee6a… matches baseline; verify:auto exit 0); the supervisor_adjudicate IPC outcome was orchestrator-observed at the F9b re-verify -->
  - [x] verify-human  <!-- status: done — operator WAIVED review 2026-09-23 ("skip. I don't care"); the boundary-required capture was agent-run (see "Phase 1 F9b re-verify"), so F13 rather than the forbidden F11 -->
    - [x] P1.verify-human.1 Accept the captured `supervisor_adjudicate` round-trip as proof that the command behaves as before (the agent ran it on a dev build).  <!-- status: waived by operator -->
    - [x] P1.verify-human.2 Accept the production diff as behavior-neutral: `run_adjudicator` now builds the command and delegates to `run_command`, with the body moved verbatim.  <!-- status: waived by operator -->
  - [x] verify-codify  <!-- status: done; added `the_adjudicator_invokes_claude_print_mode_with_the_pinned_model` (it pins the `supervisor_adjudicate` argv via an extracted `adjudicator_command`; mutant: drop `-p` → this test fails, 6 pass); full verify:auto exit 0 (2973 / Rust 904 lib) -->

- [x] Phase 2: AH1 — drive the PromptPanel's REAL send closure  <!-- status: done 2026-09-23 -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The operator started WP7 today.
  - Requirements unchanged: yes. Phase 1 surfaced nothing touching the prompt panel.
  - Solution still feasible: yes. CM6 already mounts under jsdom (`dictationProbeArms.test.tsx`).
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/prompt/__tests__/promptSendWiring.test.tsx` exits 0.
  - CLI: `grep -c performSend src/components/workspace/prompt/__tests__/promptSendWiring.test.tsx` → `0`.
  - CLI: named mutants in `PromptPanel.tsx`, each applied alone; a named test fails:
    - `planSend(body, mode)` → `planSend(body, "auto-submit")`: the stage-only no-CR test fails.
    - `plan.label` → `undefined`: the staging-label test fails.
    - Delete `clearDraft(path)`: the clears-draft test fails.
    - `appendToHistory(path, body)` → `appendToHistory(path, "")`: the archive test fails.
    - Read `ccSessionId` from the closure instead of `ccSessionIdRef`: the send-after-rerender test fails (see P2.2).
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Build a live-mount harness in the same file: jsdom, `createRoot` + `act` (precedent: `dictationProbeArms.test.tsx`), and `IS_REACT_ACT_ENVIRONMENT`.
    - Mount the real `PromptPanel` with the real CM6 host, seeded from `localStorage`.
    - Capture the closure it hands to `onRegisterSend`.
    - Keep the existing `invoke` mock, since it is the Tauri edge.
    - Tap `window` `error` (`[[jsdom-listener-throw-is-silent-in-vitest]]`).  <!-- status: done -->
  - [x] P2.2 Port each surviving arm to invoke the captured closure:
    - The envelope, with and without the CR.
    - The `cc_input` command.
    - Clear and archive, in both modes.
    - Newest-first stacking.
    - The staging-label diagnostic.
    - A failed send still clears.
    - The storage-key prefix.
    - ADD: re-render with a new `ccSessionId`, then send. `invoke` must receive the NEW id. This is the recycle case, which the ref exists for.
    - ADD: the rendered DOM reflects the clear (the buffer is empty, and the recover list holds the entry).  <!-- status: done -->
  - [x] P2.3 Rewrite the file header. It now drives the panel. It also must state honestly that archive-before-clear is an EQUIVALENT mutant in the panel, because `body` is captured first. The source-order guard in `promptDraftSync.test.ts` stays as the order pin and is not claimed here.  <!-- status: done -->
  - [x] P2.4 Mutation-prove each mutant above, one at a time.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; first run exit 1 (Prettier on the new test file) → prettier --write → exit 0 in 27s, 220 files / 2974 tests, Rust 904 lib -->
  - [x] verify-self  <!-- status: done; subagent 8/9 PASS, then the `grep -c performSend` outcome FAILED (a header comment named it) → in-place SHORTCUT (see Discoveries) → a fresh subagent re-verified 3/3 PASS -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) per drive_mode=autopilot. No integration boundary; the only artifact is the test file; PromptPanel.tsx was mutated transiently and restored (shasum 1cd14662…) -->
  - [x] verify-codify  <!-- status: done; nothing new to codify (this phase IS the codification, and all verified behaviors are in promptSendWiring.test.tsx); no integration boundary; full verify:auto exit 0 (2974 / Rust 904 lib) -->

- [x] Phase 3: I1 + H4 — a live `Workspace` mount replaces the source guards  <!-- status: done 2026-09-23 -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes.
  - Requirements unchanged: yes.
  - Solution still feasible: yes. The spike (P3.1) mounts the real `Workspace` live.
  - No superior alternative discovered: yes. The spike removes the need for the extraction fallback.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/` exits 0.
  - CLI: `grep -c "Workspace.tsx?raw" src/components/workspace/__tests__/turnNavControls.test.tsx` → `0` (the file was renamed `.ts` → `.tsx` at build).
  - CLI: `grep -c "readFileSync" src/components/workspace/__tests__/workspaceDriveModeRender.test.tsx` → `0` (both H4 source guards are gone).
    - ⚠️ This holds only if the P3.1 spike succeeds. The fallback states its own count.
  - CLI: named mutants in `Workspace.tsx`, each applied alone; a named test fails:
    - prev `disabled={!turnNav.canNext}` (crossed wiring): the disabled-flag test fails on a `{canPrev:true, canNext:false}` push.
    - Drop `turnNav.total > 0 &&`: the zero-turn test fails, because `0/0` is rendered.
    - Drop `if (next) setTurnNav(next)` from the next handler: the step-refreshes test fails.
    - `onTurnStartRecorded={() => {}}`: the AC-6 push test fails.
    - Delete `e.payload.path !== workspace.project_path`: a foreign-path broadcast changes the readout, and the cross-project test fails.
    - Delete `|| !persist` in `resolveDriveMode`: Cancel issues the drive-mode write IPC, and the Cancel test fails.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P3.1 SPIKE (the known unknown): can the real `Workspace` mount live under jsdom?
    - Harness: `mockIPC` with `shouldMockEvents`, `mockWindows`, and `vi.mock("../XtermPane")`.
    - The stub exposes the `stepTurn` / `turnNavState` handle and captures `onTurnStartRecorded`. It stubs a CHILD component, not the unit under test.
    - Gate ON comes from the mocked settings IPC.
    - Stub other heavy children only if they throw.
    - Record which children needed stubbing, and why.  <!-- status: done -->
    - **Fallback, if the spike fails:**
      - Extract `TurnNavControls` (presentational; it takes a `nav` plus a pane handle) and `shouldApplyBroadcast(payloadPath, myPath)`.
      - Render and value-test those instead.
      - KEEP one narrowed, comment-stripped caller guard per extraction. Each guard asserts the CALL shape (`shouldApplyBroadcast(`) and states that it cannot see arguments.
      - The existing gate-OFF render test already proves `Workspace` renders the controls inside the split control.
  - [x] P3.2 I1: port `turnNavControls.test.ts` to the rendered DOM.
    - Both buttons render, as `<button>` elements.
    - `disabled` tracks each flag across pushed states.
    - At rest the readout is absent. After a push it reads `ordinal/total`.
    - A click calls `stepTurn(dir)` and stores the re-read state.
    - ADD: the controls render, and work, with the gate OFF. The grep could not reach this case.
    - Keep the CSS emitted↔styled and deleted-class checks. Read the emitted classes off the DOM, and the CSS via `node:fs`, because "does App.css carry the rule" IS a source question.  <!-- status: done -->
  - [x] P3.3 H4: replace both regexes.
    - The broadcast test emits `PROJECT_DRIVE_MODE_EVENT` for a FOREIGN path (the readout is unchanged) and for OWN path (the readout changes). The own-path case is the positive control.
    - The persist test opens the confirm, then:
      - Cancel → no write IPC.
      - Apply → the write IPC carries the chosen mode. This is the positive control.  <!-- status: done -->
  - [x] P3.4 Mutation-prove each mutant above, one at a time. Delete the old guards only after each mutant is proven killed.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done after two fixes. (1) lint: react-hooks rejected the stub writing `pane.props` during render, so it moved into an effect. (2) offInvariantGuard: the harness named the raw gate command (triaged; the harness now stubs the `useWorkflowFeaturesEnabled` seam). Final: exit 0 in 31s, 221 files / 2974 tests, Rust 904 lib -->
  - [x] verify-self  <!-- status: done; subagent 5/5 PASS on the post-fix harness. All 8 Workspace.tsx mutants (6 named + 2 regex-shaped) each fail their named test; final shasum 46303f50… matches baseline; verify:auto exit 0 (221 files / 2974, Rust 904+19+1) -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) per drive_mode=autopilot. No integration boundary; test-only artifacts; Workspace.tsx mutated transiently and restored (shasum 46303f50…) -->
  - [x] verify-codify  <!-- status: done; nothing new to codify (the phase IS the codification); no integration boundary; the full suite is the verify-self subagent's verify:auto on the identical tree (221 / 2974, Rust 904+19+1) -->

- [x] Phase 4: AA1 — the × / ⏸ close wiring, Filmstrip through App  <!-- status: done 2026-09-23 -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes.
  - Requirements unchanged: yes.
  - Solution still feasible: yes. The Phase 3 stubs plus App's DEV `__seedWorkspace` seam open workspaces without the picker dialog.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/__tests__/` exits 0, including a new close-wiring test file.
  - CLI: named mutants, each applied alone; a named test fails:
    - `requestPauseClose` passes `false`, so ⏸ becomes a clean close: the busy-⏸-then-Close test fails, because the mark-clean IPC is issued.
    - `resolveClose` stops calling `setPendingClose(null)`: the dialog-dismisses test fails.
    - Drop `|| active` in `requestCloseWithIntent`: the busy-× test fails, because the workspace closes without a confirm.
    - Remove the tile control's CLICK `stopPropagation` (`TileActionButton`): the ×-does-not-promote test fails. [Revised at build: the pointerdown path needs `setPointerCapture`, which jsdom lacks. The click leak into a collapsed pill's `onPromote` is the jsdom-reachable form of the same leak.]
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P4.1 Harness: boot the REAL `App` (the `appBoot.test.tsx` shape), plus the Phase 3 XtermPane stub.
    - Open two workspaces through the picker.
    - Drive status through a mocked hook-status event, to reach the `active` state.
    - ⚠️ If opening a workspace through the picker is unreachable in jsdom, record why. The fallback is to mount `Filmstrip` alone (× routing) and to test App wiring only as far as it is reachable, stated as a limit.  <!-- status: done -->
  - [x] P4.2 Tests:
    - Idle × → the workspace is removed, the mark-clean IPC is issued, and the other workspace stays focused.
    - Busy × → the confirm opens. Cancel keeps the workspace and the dialog goes away. Close removes it.
    - Busy ⏸ → confirm → Close removes it with NO mark-clean IPC. This is the intent-preservation property.
    - × pointerdown/click does not promote.
    - Keyboard Enter / Space on × closes.  <!-- status: done -->
  - [x] P4.3 Mutation-prove each mutant above, one at a time.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; exit 0 in 30s, 222 files / 2982 tests (+8), Rust 904 lib; the only lint warning is the known XtermPane.tsx:895 -->
  - [x] verify-self  <!-- status: done; subagent 3/3 PASS. All 6 mutants failed their named tests (M4 fails ONLY the busy-⏸ test); both files restored by shasum; verify:auto exit 0 (222 / 2982, Rust 904+19+1) -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) per drive_mode=autopilot. No integration boundary; one new test file; App.tsx / TileActionButton.tsx mutated transiently and restored -->
  - [x] verify-codify  <!-- status: done; nothing new to codify (the phase IS the codification); no integration boundary; the full suite is verify-self's verify:auto on the identical tree (222 / 2982, Rust 904+19+1) -->

## Current Node
- **Path:** Feature > done (archived)
- **Active scope:** finalize (review-quality done: 0 CRITICAL / 1 MAJOR / 6 MINOR; MAJOR + 5 MINOR auto-backlogged, 1 MINOR fixed in place)
- **Blocked:** none
- **Unvisited:** none after Phase 4
- **Open discoveries:** `supervisor_adjudicate` is a sync command that blocks the main thread → WP9

## Phase 1 build evidence (2026-09-23)
- `run_adjudicator` now builds `claude -p --model <m>` and delegates to the private `run_command(cmd, prompt, timeout_ms)`, which is the unchanged spawn, stdin write, and wait/kill body. Both hand copies are gone (`grep -c` → 0). The tests went from 4 to 6 (2 display + 4 driving `run_command` via `sh -c`).
- Each mutant was applied alone. Each one landed (verified by `cmp`), and each killed exactly its own test (5 passed, 1 failed):
  - Drop `child.kill()` → `a_slow_child_times_out_and_is_reaped` fails (finished in 30.01s; the elapsed bound tripped).
  - `NotFound` → `Spawn` → `a_missing_binary_errors_rather_than_returning_empty_output` fails.
  - Drop the stdin `write_all` → `the_prompt_reaches_stdin_and_stdout_comes_back` fails.
  - `if false && !status.success()` → `a_non_zero_exit_is_failed_with_its_code` fails.
- Restored from the `cp` backup; `shasum` equals the pre-mutation hash.
- The OLD tests could not see any of these four: the kill and NotFound tests exercised test-local copies, and nothing tested stdin or the exit-code arm.

## Phase 1 F9b re-verify (2026-09-23)
Ran against `pnpm tauri:dev` (PID 68940, launched and killed by the agent). The bridge's `ipc_execute_command` rejects app commands ("Unsupported Tauri command"), so each call went through `window.__TAURI_INTERNALS__.invoke` in `webview_execute_js`. Results were stored on `window` and read back by a second script.
- Positive control: `list_projects` → 7 projects.
- `supervisor_adjudicate {model:"claude-haiku-4-5", prompt:"Reply with exactly the word: ok", timeoutMs:60000}` → **RESOLVED `"ok\n"` in 4173ms**. So the refactored path spawns `claude -p --model`, delivers stdin, and returns stdout.
- The same call with `timeoutMs:1` → **REJECTED `claude -p timed out after 1ms`** in 54ms. So the timeout arm is reached through the command.
- ⚠️ Bridge caveat, and NOT evidence: every script that called `invoke` came back "Script execution timeout", including a `list_projects`-only control. That timeout says nothing about `supervisor_adjudicate` blocking the main thread. That question stays with WP9 and needs `sample`.

## Phase 2 build evidence (2026-09-23)
- `promptSendWiring.test.tsx` was rebuilt as a live mount: `createRoot` + `act`, the real `PromptPanel` with its real CM6 host, the `invoke` mock only at the Tauri edge, and a `window` `error` tap asserted empty in `afterEach`. It captures the `send` the panel registers via `onRegisterSend`. It has 12 tests, up from 11. `performSend` is gone (`grep -c` → 0).
  - New: a positive control (the seed reaches `.cm-content`).
  - New: the rendered buffer empties and the recover list updates.
  - New: the Stage BUTTON reaches the same send as the chord.
  - New: a re-render with a new `ccSessionId` is honored at send time.
- Each mutant was applied alone in `PromptPanel.tsx` and run against the NEW file and a `zz` copy of the HEAD file. The new file kills all five; the old file passed every one, 11/11.

  | mutant | new file | old file |
  |---|---|---|
  | `planSend(body, "auto-submit")` | 2 fail: stage-only no-CR, and the Stage button | 11/11 pass |
  | label → `undefined` | 1 fails: the staging-label diagnostic | 11/11 pass |
  | delete `clearDraft(path)` | 3 fail: clear, stage clears, failed-send clears | 11/11 pass |
  | `appendToHistory(path, "")` | 4 fail: archive, stage archives, newest-first, … | 11/11 pass |
  | `ccSessionId` read from the closure, not the ref | 1 fails: the re-render test | 11/11 pass |
  | swap archive/clear (EQUIVALENT, as disclosed) | 12/12 pass | 11/11 pass |

  - The swap mutant is equivalent in the panel because `send` reads `body` first. It IS killed by `promptDraftSync.test.ts` → "archives to the history ring BEFORE clearing the draft" (1 failed / 24), so the header's claim was checked, not assumed.
- `PromptPanel.tsx` was restored from its `cp` backup, and `shasum` matches. The `zz` copy was deleted, and `find src tooling -name 'zz*'` is empty.
- There are no references to `performSend` anywhere else.

## Phase 3 build evidence (2026-09-23)
- **The P3.1 spike SUCCEEDED, so the fallback was not used.** The real `Workspace` mounts live under jsdom with `createRoot` + `act`, `mockIPC({shouldMockEvents:true})`, and `mockWindows`.
  - The spike stubbed two children: `XtermPane` (xterm cannot measure in jsdom; the stub exposes the handle and captures the props) and `RightPanelHost` (a separate surface with its own IPC).
  - It answered the gate as `workflow_get_features_enabled → true`, and the readout, skill row, and recycle all rendered.
  - ⚠️ **SUPERSEDED at verify-auto (see Test Triage below).** Answering the raw command is a second door to the gate setting, so the OFF-invariant guard rejects it. The shipped harness stubs the `useWorkflowFeaturesEnabled` SEAM as its third mock. Do not bring the raw-IPC answer back. [corrected at review-quality, finding MINOR-5] The one error came from spike teardown ordering: `clearMocks` ran before the async unlisten. The harness now settles before `clearMocks`.
- New shared harness `__tests__/liveWorkspace.tsx`. It is not a test file, and each test file registers the two `vi.mock`s itself.
- **I1:** `git mv turnNavControls.test.ts → .tsx`, then rewritten on the live mount. It has 9 tests:
  - paired buttons inside the split control;
  - at-rest disabled with no readout and no `0/0`;
  - `disabled` tracks each flag across two ASYMMETRIC pushes;
  - the AC-6 push updates the readout (`2/2`, title) with no click;
  - prev/next click steps the pane and stores the re-read state;
  - NEW: the controls render AND work with the gate OFF;
  - emitted↔styled, with classes read off the DOM and CSS via `node:fs`;
  - the deleted class is absent from the DOM and CSS.
  - The `jumpInert`/`inertAfter` identifier-absence arm was dropped; it was source-only, don't-re-add polarity. The DOM/CSS absence of the deleted class is kept.
  - `grep -c "Workspace.tsx?raw"` → 0.
- **H4:** new `workspaceDriveModeLive.test.tsx`, 3 tests:
  - a foreign-path broadcast is ignored and an own-path one applied (positive control);
  - Cancel writes nothing (no `project_set_default_drive_mode`);
  - Apply writes `{path, mode:"fsd"}` (positive control).
  - Both source-guard blocks were deleted from `workspaceDriveModeRender.test.tsx`, leaving 4 static tests. `grep -c readFileSync` → 0.
- Each mutant was applied alone to `Workspace.tsx`. It ran against the new files AND `zz` HEAD copies of the old guards.

  | mutant | new | old |
  |---|---|---|
  | prev `disabled={!turnNav.canNext}` | turnNav 3 fail | 1 fail |
  | `{true && (` readout | turnNav 1 fail | 1 fail |
  | next handler drops `setTurnNav(next)` | turnNav 1 fail | 1 fail |
  | `onTurnStartRecorded={() => {}}` | turnNav 6 fail | 1 fail |
  | drop the path check | live 1 fail | 1 fail |
  | drop `!persist` | live 1 fail | 1 fail |
  | **path check kept but neutralized** (`… && false`) | live 1 fail | **6/6 PASS** |
  | **`!persist` kept but ANDed with `respawnWanted`** | live 1 fail | **6/6 PASS** |

  - The literal-deletion mutants were also caught by the old guards (the regexes match the literal text). The last two rows confirm the finding: a wrong edit that keeps the regex shape passed the old guards and is killed now.
- `Workspace.tsx` was restored from its `cp` backup, and `shasum` matches. The `zz` copies were deleted, and `find src tooling -name 'zz*'` is empty.

## Phase 4 build evidence (2026-09-23)
- New `src/__tests__/closeWiring.test.tsx`, 8 tests, driven through the REAL `App`:
  - Setup: `createRoot` + `mockIPC({shouldMockEvents})`, workspaces opened via App's DEV-only `window.__seedWorkspace`, and "busy" delivered as a real `workspace-status` event. It reuses the `liveWorkspace.tsx` stubs (XtermPane, RightPanelHost, and the gate seam held OFF).
  - Workspace ids come from a module-level counter, so tests resolve them by display name (the close control's `aria-label`).
  - Tests:
    - idle × closes, marks clean, and keeps focus;
    - closing the focused one re-picks focus;
    - Enter and Space activate ×;
    - busy × → confirm → Cancel keeps it and dismisses the dialog;
    - busy × → Close Anyway is a clean close;
    - idle ⏸ closes without marking clean;
    - busy ⏸ → Close Anyway is STILL unclean;
    - × on a collapsed pill does not promote it.
- There was no old test, so every mutant below passed the prior suite for this wiring by construction; AA1's finding is that it had no coverage.
- Each mutant was applied alone and killed:

  | mutant | failing tests |
  |---|---|
  | `requestPauseClose` passes `false` | idle ⏸, busy ⏸ |
  | `resolveClose` stops calling `setPendingClose(null)` | Cancel, Close Anyway |
  | drop `\|\| active` | Cancel, Close Anyway, busy ⏸, collapsed pill |
  | drop `markSessionClean` from the clean close | idle ×, focused ×, Close Anyway |
  | remove the tile control's click `stopPropagation` | collapsed pill |
  | remove the Enter key branch | Enter/Space |
  | `pendingClose` stores `unclean: false` (the intent dropped IN the confirm) | ONLY busy ⏸ |

  - `App.tsx` and `TileActionButton.tsx` were restored from `cp` backups, and `shasum` matches both.
- Not reachable here, and stated in the file: the dirty-editor arm of the gate, because the editor panel is stubbed. `dirtyDocCount` / `closeWorkspaceSpec` cover it as pure functions.

## Test Triage — offInvariantGuard › "no module bypasses the seam to read the setting directly" (Phase 3 verify-auto)
Classification: Code regression. The test is correct, and the new code (the `liveWorkspace.tsx` harness) broke it.
Confidence: high
Evidence: the harness's `mockIPC` handler names `"workflow_get_features_enabled"` to answer the gate, so it is a second, unlisted door to the setting, which is exactly what the guard forbids.
Action: fix the HARNESS, not the guard. Stub the seam hook `useWorkflowFeaturesEnabled` (a partial `vi.mock` of `state/useWorkflowFeaturesEnabled`) instead of answering the raw command, as the guard's own message says. Do not add the harness to `ALLOWED`: that would widen the invariant to admit a test convenience.

## Code-Quality Review

*(feature-review-quality against ship commit `a26b514`, window `416afd0..a26b514`; drive_mode=autopilot. **0 CRITICAL / 1 MAJOR / 6 MINOR.** The MAJOR and MINORs 1–5 are auto-backlogged under `# paydown-wp7-render-instead-of-raw — 2026-09-23` in `backlog-quality-findings.md`. MINOR-6, the stale WIP evidence note, was CORRECTED in place above rather than backlogged, because the WIP is archived next.)*

### Strengths
- **The Rust split is minimal and correct.** `run_adjudicator = run_command(adjudicator_command(model), …)`, so the tests drive the real spawn/stdin/wait/kill body, and the argv is pinned separately. Each branch has a test that fails on its named mutant.
- **The new tests check the right things.**
  - Asymmetric nav pushes tell the prev/next flags apart.
  - A foreign-path broadcast followed by an own-path one proves "filtered", not "nobody listening".
  - Apply is the positive control for Cancel writing nothing.
  - A listener `error` tap is asserted in every `afterEach`.
- **The mutation evidence is honest.** It includes the two mutants that keep the old regex's text but break the logic; the old guards passed both. The equivalent archive/clear swap is disclosed rather than faked.
- **Nothing was silently dropped.** The identifier-absence arm was removed deliberately, and the gate-conditional regex became a real gate-OFF mount.
- **The OFF-invariant regression was fixed at the harness,** by stubbing the seam. The guard's allowlist was not widened.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [src/__tests__/closeWiring.test.tsx:55-94] The first App-level user of the new harness copies its lifecycle instead of reusing it:
  - its own IPC log, `uncaught` tap, `settle`/`click`, and IPC boot;
  - the settle-before-`clearMocks` teardown order, which was a real bug found in the P3.1 spike;
  - `IS_REACT_ACT_ENVIRONMENT`, set only as a side effect of a `vi.mock` factory's import.

  It also mounts TWO `Workspace`s against a stub whose `pane` is a single module-level value, so `pane.props` belongs to whichever pane rendered last. — *Two copies of the teardown rule will drift, and a future App-level `pushTurnStart` would silently reach an arbitrary workspace.* **Auto-backlogged.**

**MINOR**
1. [liveWorkspace.tsx] `MountOptions.statusState`, `projectPath` and the module-level `rerender` closure have no caller. `mountWorkspace` doesn't guard against a live previous root. **Auto-backlogged.**
2. [promptSendWiring.test.tsx] Only the Stage button is driven; a Submit button wired to `send("stage-only")` would pass. **Auto-backlogged.**
3. [promptSendWiring.test.tsx] `warn.mockRestore()` runs after the assertions, so a failed assertion leaks the `console.warn` spy. **Auto-backlogged.**
4. [turnNavControls.test.tsx] The gate-OFF test uses the absence of `workspace-skill-row` as proof, but no positive control shows the row present with `gate: true`. **Auto-backlogged.**
5. [adjudicator/mod.rs `run_command`, pre-existing] stdout and stderr are piped but not drained while polling, and `write_all` blocks before the deadline starts. A chatty child, or one that never reads stdin, can hang past the timeout. `Failed.stderr` is always empty. **Auto-backlogged; routed with E3 (WP8) and the WP9 `supervisor_adjudicate` async move.**
6. [this WIP, Phase 3 evidence] Said "exactly two children" and "gate ON via `workflow_get_features_enabled`", which the triage reversed. **FIXED in place.**

### Assessment
This is well-built paydown. Every replaced test is stronger than the one it replaced, and the evidence shows it: the regex-shaped wrong edits passed the old guards and fail the live mounts. The Rust refactor removes duplicated test code without adding another copy. The debt this WP adds is concentrated in the new shared harness. Its first App-level user forked its lifecycle, and its single-pane assumption is already broken by `closeWiring`. That is worth a small consolidation before the next render-instead-of-`?raw` WP builds on it.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` here before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:**
  - The plan assumed a live `Workspace` mount was a risky unknown (P3.1 spike + a named fallback). It worked on the first spike, stubbing only `XtermPane` and `RightPanelHost`.
  - The real App boots the same way through its DEV `__seedWorkspace` seam. So the repo's recorded "no interaction harness" was a documentation gap, not a capability gap. That half of the render-harness note was corrected in `docs/lessons/source-text-guards.md`, and CLAUDE.md now points at the harness.
  - `supervisor_adjudicate` is a SYNC Tauri command that sleep-polls `claude -p` on the main thread. Found at the Phase 1 boundary check and handed to WP9 as a known hit.
- **Assumptions that held:**
  - Every replacement is stronger than what it replaced: each named mutant dies.
  - The old source guards really could not see regex-shaped wrong edits: both H4 variants passed 6/6 on the HEAD copy.
  - archive-before-clear really is an equivalent mutant in the panel. Checked, not assumed: `promptDraftSync`'s source-order guard kills it and nothing in the live file does.
- **Assumptions that were wrong:**
  - The plan named no consuming surface for E2. The integration-boundary rule caught it, and `supervisor_adjudicate` was then exercised live on a dev build.
  - The plan named `TileActions`' POINTERDOWN `stopPropagation` as AA1's leak mutant. jsdom has no `setPointerCapture`, so the reachable form is the CLICK leak into a collapsed pill's `onPromote`.
  - The first harness answered the gate via the raw IPC command. The OFF-invariant guard correctly rejected that, and the harness now stubs the seam.
  - Two smaller misses, one each at verify-auto and verify-self: a lint rule rejected a render-time write to shared stub state, and an outcome's `grep -c` was satisfied by a comment.
- **Approach delta:**
  - The fallback (extract `TurnNavControls` / `shouldApplyBroadcast` and keep narrowed caller guards) was never needed. H4 therefore has NO remaining source guard, rather than the plan's "narrowed" one.
  - E2 gained an argv pin (`adjudicator_command`) at verify-codify.
  - AA1 was delivered through the real `App`, not a `Filmstrip`-only mount.
  - Review-quality: 0 CRITICAL / 1 MAJOR / 6 MINOR. The MAJOR (the harness lifecycle forked by `closeWiring`, and its single-instance `pane` stub) and 5 MINORs were backlogged; MINOR-6 was fixed in this file.

**Closure (Requester = operator — closure notice for self-record):**
> **Feature complete:** Paydown WP7 has shipped. Five test sites that proved a copy or the source text now drive the real code: the adjudicator's spawn loop, the Prompt panel's registered send, a live `Workspace` header, the drive-mode subscriber and confirm, and the App's × / ⏸ close. Each names the mutant it now kills. Verify with `pnpm verify:auto` (222 files / 2982 tests); the per-mutant tables are in this WIP's build-evidence sections.

## Notes for build
- ⚠️ Mutation harness:
  1. `cp` a backup.
  2. Mutate with `perl -0pi -e`, not BSD `sed`.
  3. Confirm the mutant landed with `grep -cF` / `sed -n '<line>p'`.
  4. Run the target test.
  5. Restore with `cp`, then check `shasum`.
  6. Run mutants INDIVIDUALLY.
- A `zz*` HEAD-copy can show that the OLD guard passed a mutant (`[[prove-guard-hole-via-head-test-copy]]`). Delete it afterwards, then check with `find src tooling -name 'zz*'`.
- Gate: `pnpm verify:auto` (timeout 216000 per `runtimes.md`). Use `./node_modules/.bin/vitest`, never `pnpm exec` (`[[pnpm-exec-shadows-local-binaries]]`).
- Rust: prefix `PATH="$HOME/.cargo/bin:$PATH"` (`[[bash-cargo-env]]`).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-09-23] Phase 1 verify-self → paydown WP9. `supervisor_adjudicate` is a SYNC `#[tauri::command]`, and Tauri 2 runs those on the main thread. Its body (`run_command`) sleep-polls a `claude -p` child for up to `timeout_ms`, so every adjudication likely freezes the UI for as long as `claude` runs. This is a concrete inventory hit for WP9; move it to `#[tauri::command(async)]` or a worker there. Logged as `SURFACE-2026-09-23-SUPERVISOR-ADJUDICATE-BLOCKS-THE-MAIN-THREAD`.
[SHORTCUT-2026-09-23] P2.3 — The header comment still named `performSend`, so the `grep -c performSend` outcome read 1. It was reworded to "a local helper" (a one-line extension of the P2.3 header), then re-verified by a FRESH verify-self subagent: grep → 0, the file 12/12, prettier --check OK.
