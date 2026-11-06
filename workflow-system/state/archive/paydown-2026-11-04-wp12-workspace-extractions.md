---
drive_mode: autopilot
---

# Feature: Paydown WP12: `Workspace.tsx` extractions

**Workflow:** feature
**State:** Completed 2026-11-06 — ship `82856a4`, local on `main` (not pushed, per the sweep's standing state)
**Created:** 2026-11-06
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` → WP12 (ruling R4 lifts the 2026-09-23 R1 deferral)

## Problem Statement

`Workspace.tsx` is the most-touched file in the app (1607 lines) and holds two surfaces inline, each
with its own state, refs and effects. The first is the drive-mode **apply chain**: stage, confirm,
persist, wait for idle, relaunch. It carries two real defects, not just bulk:
- The `turn-respawn` intent is held across the relaunch by a `RESPAWN_INTENT_HOLD_MS = 400`
  sleep, which is synchronised against the React scheduler rather than an event. If that window
  is missed, the spawn reads the ORIGINAL door and consumes the unclean-exit flag, silently
  (`08-26-…-RESPAWN-INTENT-HOLD-IS-SCHEDULER-TIMING`, medium).
- The chain does not abort on unmount. A queued apply's `waitForIdle` keeps polling for up to
  10 minutes after the workspace is gone, and the hold's `setState` can fire after a test's jsdom
  is torn down. That is why `liveWorkspace.tsx`'s `teardownIpc` waits out the hold.

The second surface is the **supervisor header control**: the badge, the `▾` trigger, the popover,
the hint clock, the popover state and the activity seed effect. It has two separate gates
(`09-28-…-SUPERVISOR-ACTIVITY-MINOR-BATCH` #7). Its seed has a narrow silent loss: one failed
first read marks the project seeded, so the relaunch replay is disabled for the rest of the app
run (`11-06-…-WP8-SEED-ONCE-SWALLOWS-A-FAILED-READ`).

This WP moves both surfaces out and fixes the two defects. The resting DOM stays unchanged, and
R1 ("the drive-mode editor is disabled while an apply is queued") stays byte-identical.

**No 3rd-party dependency** (step 3 skipped). **Exports move**, so every phase runs `pnpm check:link`
and the boot test before any live observation is trusted (the high backlog item
`…-DELETED-EXPORT…`: the deletion and its consumer migration land in the SAME phase).

### Design decisions taken at plan time (flag any that are wrong)

- **D-a: the intent ref is consumed at spawn, not cleared by a timer.**
  - `XtermPane` gains one optional prop, `spawnIntentRef?: { current: OpenIntent | null }`.
  - Its spawn reads `spawnIntentRef.current`, nulls it, and sends `override ?? openIntent`. This
    happens at the top of `spawn()`, for `cc_spawn` only.
  - `useDriveModeApply` sets the ref to `"turn-respawn"` immediately before `relaunch()`.
  - The `spawnAsTurnRespawn` state, the `await Promise.resolve()` and the 400 ms sleep are deleted,
    along with `RESPAWN_INTENT_HOLD_MS` (an export deletion). The `openIntent` prop goes back to
    being `workspace.open_intent` unconditionally.
  - Why consume-on-read over "clear when a fresh session id arrives": it needs no new wait, and
    the only reader is the spawn itself. A spawn that FAILS after consuming leaves a later Retry
    on the original door, which is exactly today's behaviour once the 400 ms has elapsed, so this
    is no regression.
  - `XtermPane`'s comment that excludes `openIntent` from the effect's deps is rewritten to match:
    the prop is now immutable, and the override travels by ref.
- **D-b: `respawnWanted` clears right after `relaunch()`, not 400 ms later.** R1's RULE is
  untouched: the editor is disabled iff `respawnWanted`, using the same JSX, title, aria and ⏳.
  Only the hold's tail goes away, so the ⏳ disappears up to 400 ms sooner. A second apply during a
  respawn was already possible once the 400 ms had elapsed, so no new window opens. → Phase 1
  Alignment question `(decision)`.
- **D-c: the abort.** `useDriveModeApply` owns an `AbortController` ref, aborted in an unmount
  cleanup. This mirrors `recycleAbortRef` in the same file, and is a ref for the same reason.
  - `waitForIdle` gains an optional `signal` and returns `false` as soon as it is aborted. Its
    poll sleep must wake on abort, so it cannot wait out the 250 ms.
  - After an abort the chain does no `setState`, no `relaunch()` and no `console.warn`. An
    aborted apply is the operator closing the workspace, the same reasoning as Recycle's
    unwarned `aborted`.
  - The persist that has already landed stays persisted. That is correct, because the mode then
    applies at the next natural spawn, as the timeout arm already documents.
- **D-d: the hook boundary.** `useDriveModeApply({ projectPath, workflowEnabled, statusState, sessionLive, ccPaneRef })`.
  - **It owns:** `storedDriveMode` and its ref, the broadcast re-sync listener, `pendingDriveMode`,
    `respawnWanted`, `statusStateRef`, `sessionLiveRef`, `chooseDriveMode` (stage only),
    `resolveDriveMode`, `startApply`, the intent ref and the abort.
  - **It returns:** `storedDriveMode`, `setStoredDriveMode` (for the shared reveal read),
    `storedDriveModeRef` (for `useSupervisor`), `pendingDriveMode`, `respawnWanted`,
    `chooseDriveMode`, `resolveDriveMode` and `spawnIntentRef`.
  - **Stays in `Workspace`:** `runningDriveMode`, `editingDriveMode` with its select ref (the
    caller wraps `chooseDriveMode` to close the editor), and the reveal-read effect. That effect
    is shared with the supervisor toggle, and splitting it would change IPC timing for no gain.
    The JSX stays inline.
- **D-e: `SupervisorHeaderControl`.** Props: `projectPath`, `displayName`, `workflowEnabled`,
  `visible`, `enabled` (`supervisorEnabled ?? true`), `unsentInput`, `turnOrigin`, `onToggle`.
  - **It owns:** `useLatestActivity`, `useActivityAlarm`, `hintNowMs`, `activityOpen`,
    `closeActivity`, the seed effect, the `workspaceSupervisorReadout` call and the whole
    `workspace-header-supervisor-group` JSX, including the popover.
  - It is **always mounted** and gates internally. The seed is gated on `workflowEnabled` and the
    readout on `workflowEnabled && visible`, the same two gates as today, now in one component.
    Mounting it only behind the gate would reset `activityOpen` across a gate flip, which is a
    behaviour change this WP does not make.
  - `supervisorEnabled`, its ref, the toggle and the unsent-input watermark stay in `Workspace`,
    because `useSupervisor` reads them at fire time.
- **D-f: the seed-once fix.**
  - `activityRecorder.ts` gains `tryReadActivityLines(limit): Promise<string[] | null>`, where
    `null` means the read failed. `readActivityLines` becomes `(await tryReadActivityLines(limit)) ?? []`,
    so the popover's caller is unchanged.
  - `activityFeed.ts` exports `isSeeded(projectPath)`.
  - The seed effect skips the read when `isSeeded`, and does not call `seedActivity` on `null`,
    so the next mount retries.
  - An EMPTY successful read still marks the project seeded. A project with no records must not
    re-read on every mount.

## Work Tree

- [x] Phase 1: `useDriveModeApply`, the spawn-intent ref, and abort on unmount  <!-- status: done -->
  **Observable outcomes:**
  - CLI (gate): `pnpm verify:auto` (timeout 207000) exits 0, and its `check:link` step reports no
    missing binding, after `RESPAWN_INTENT_HOLD_MS` is deleted. `pnpm vitest run src/__tests__/appBoot.test.tsx`
    exits 0 with a `Tests N passed` line (N ≥ 1).
  - CLI: `grep -rn "RESPAWN_INTENT_HOLD_MS\|spawnAsTurnRespawn" src` prints nothing. `grep -c "setTimeout(r, RESPAWN" src/components/workspace/__tests__/liveWorkspace.tsx`
    prints 0, which means `teardownIpc` has no relaunch wait.
  - CLI (live harness, `workspaceDriveModeLive.test.tsx`): Apply, with the agent idle, calls
    `relaunch()` once. The stub pane's relaunch reads `props.spawnIntentRef.current` the way the
    real spawn does and sees `"turn-respawn"`. Mutant: delete the ref assignment in the hook, and
    the stub sees `null`, so the test fails. An ordinary relaunch (no apply) sees `null`, so the
    pane falls back to `openIntent` (positive control).
  - CLI (unit, `XtermPane` spawn seam or the extracted read): with `spawnIntentRef.current = "turn-respawn"`,
    the `cc_spawn` args carry `intent: "turn-respawn"` and the ref reads `null` afterwards; with it
    `null`, the args carry the `openIntent` prop; `term_spawn` never reads it. Mutant: drop the
    null-out and a second spawn reuses `turn-respawn`, so the test fails.
  - CLI (live harness, abort): queue an apply while `statusState="running"`, unmount, then wait
    3× `IDLE_POLL_MS`. A `setTimeout` spy records **zero** new `IDLE_POLL_MS`-length timers after
    the unmount, and `uncaught` is empty. Mutant: drop the unmount abort, and timers keep arriving,
    so the test fails. Also unit: `waitForIdle` with an already-aborted signal resolves `false`
    within one tick, and aborting mid-sleep resolves `false` without waiting out `pollMs`.
  - CLI (R1 byte-identical): the existing `a queued apply cannot reopen the editor, by click OR keyboard`
    test passes **unmodified** (`git diff` on that `it(…)` block is empty).
  - CLI (render-unchanged): the HEAD-worktree recipe (`[[prove-render-unchanged-via-head-worktree]]`):
    - Dump `Workspace`'s header with the gate OFF and with it ON, at rest
      (`renderToStaticMarkup`).
    - Also dump it from the live harness in three states: with a queued apply showing ⏳, with the
      confirm open, and settled after a broadcast.
    - The HEAD and working-tree dumps `diff` to exit 0.
  - Browser (dev app, MCP bridge, `scratch-c`, state-changing on the dev `projects.json` only):
    - Open `scratch-c`, then change the header drive mode and Apply while CC is idle.
    - The pane respawns, and `ps -ax -o pid,args` shows the new `claude` child with `--continue`
      in its argv, which is the `turn-respawn` arm.
    - `cc_drive_mode` for the new session id returns the chosen mode.
    - Restore the original mode afterwards.
  **Alignment questions:**
  - (decision) D-b: once Apply fires the respawn, the ⏳ and the editor's disabled state clear
    straight away rather than ~400 ms later. The rule is unchanged: the editor is disabled
    exactly while an apply is queued. Is that what you want, or should "queued" cover the respawn
    itself, until the new session id arrives?
  - [x] P1.1 Add `signal?: AbortSignal` to `waitForIdle` (abort-aware sleep); unit tests for both abort timings  <!-- status: done -->
  - [x] P1.2 `XtermPane`: optional `spawnIntentRef` prop, read + null-out at `cc_spawn` time; rewrite the `openIntent` deps-exclusion comment; unit-test the read through the smallest seam that drives the real code  <!-- status: done -->
  - [x] P1.3 Extract `useDriveModeApply` (D-d) into `src/components/workspace/useDriveModeApply.ts`; set the intent ref before `relaunch()`, clear `respawnWanted` after it; AbortController + unmount cleanup; no setState/warn after abort  <!-- status: done -->
  - [x] P1.4 `Workspace.tsx`: consume the hook, pass `spawnIntentRef` to the CC `XtermPane`, `openIntent={workspace.open_intent}`; delete `spawnAsTurnRespawn`, the hold, and `RESPAWN_INTENT_HOLD_MS` (+ its doc) in the SAME phase as every importer  <!-- status: done -->
  - [x] P1.5 `liveWorkspace.tsx`: stub records the intent read at `relaunch()`; delete `teardownIpc`'s relaunch wait + the import; add the intent and abort live tests  <!-- status: done -->
  - [x] P1.6 `pnpm check:link` + boot test + `pnpm verify:auto`; HEAD-worktree render diff; mutation-prove each new test individually (`cp` aside, `shasum`, `sed -n` the landed line, `Tests N` per run)  <!-- status: done -->
  **Build notes (2026-11-06):**
  - `RESPAWN_INTENT_HOLD_MS` and `spawnAsTurnRespawn` are gone. The override lives in the new
    `src/cc/spawnArgs.ts` as `takeSpawnArgs`, the one place the spawn payload is built.
  - `waitForIdle` now takes an options object (`{ signal, timeoutMs, pollMs }`). It had one
    caller and no tests; it now has 5 tests.
  - ⚠️ An unplanned guard move. `pickerOnOpenArity.test.ts` had a P4.6 block that pinned the
    inline `intent: openIntent` payload by regex. The payload moved into `takeSpawnArgs`, so the
    block was replaced with a pointer, and its job is now done by value tests in
    `spawnArgs.test.ts`: one per door, plus the call-shape guard. The historical ternary mutant
    (M8) now fails 3 value tests.
  - **Mutants, each run on its own, each landed, each restored by `cp` + `shasum`:**
    - M1: drop the intent set → 1 failure.
    - M2: drop the clear → 2 failures.
    - M3: drop the unmount abort → 1 failure.
    - M4: the sleep ignores the abort → 1 failure.
    - M6: XtermPane goes back to the inline payload → 1 failure.
    - M7: drop the post-abort `return` → 1 failure. Its landing was checked by line count, because
      a `grep -F` absence check over multiple lines was invalid.
    - M8: the ternary door → 3 failures.
  - `pnpm verify:auto` EXIT=0 in 52 s (3721 tests). `appBoot.test.tsx` passes 2 tests.
    `grep -rn "RESPAWN_INTENT_HOLD_MS\|spawnAsTurnRespawn" src` prints nothing, and
    `teardownIpc`'s wait count is 0.
  - **Render-unchanged, HEAD worktree vs working tree, six live-harness states:**
    - States 1–5 are byte-IDENTICAL: gate off, gate on, confirm open while busy, queued, broadcast.
    - State 6 (an idle Apply just fired) differs only by the queued attribute set that HEAD still
      shows during its 400 ms hold. After applying only that D-b rule to the HEAD dump, `diff`
      exits 0.
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 42 s on the final Phase 1 tree, i.e. after the
      last comment edit. The chain is lint → format:check → `tsc` → `check:link` ("every entry
      linked cleanly (main, pip)") → vitest (287 files / 3721 tests passed) → `cargo fmt --check`
      → clippy `-D warnings` → `cargo test` (every target `ok`; lib 1069 passed).
    — evidence: `vitest run src/__tests__/appBoot.test.tsx` → `Tests 2 passed (2)`.
    — evidence: lint reports 1 warning, the pre-existing `XtermPane.tsx` `exhaustive-deps` spread
      warning (now at :943, moved down by the new prop). It is not this WP's.
    — evidence (from build): 7 mutants each fail ≥1 new test; the HEAD-worktree render diff
      exits 0 after applying only the D-b rule.
  - [x] verify-self  <!-- status: done -->
    Integration boundary: YES. The consuming surfaces are the workspace header's drive-mode Apply
    and the `cc_spawn` IPC, and the live outcome drives both. The runner subagent took the CLI
    outcomes. The orchestrator drove the dev app, because `mcp__tauri__*` is not exposed to
    subagents.
    - [x] grep outcome — evidence: `grep -rn "RESPAWN_INTENT_HOLD_MS\|spawnAsTurnRespawn" src` → no
      output, exit 1. `grep -c "setTimeout(r, RESPAWN" …/liveWorkspace.tsx` → 0. The
      `teardownIpc` body is unmount → settle → remove → clearMocks, with no timer.
    - [x] live harness, intent — evidence: `vitest run workspaceDriveModeLive.test.tsx` → ✓ "Apply on
      an idle agent relaunches ONCE, and that spawn sends turn-respawn" (asserts `spawnIntents`
      `["turn-respawn"]` and the ref is null afterwards). The positive control passes too.
    - [x] unit, spawn args — evidence: `vitest run spawnArgs.test.ts` → the override is taken once
      and then cleared, a null override falls back to the door, and `term_spawn` carries no intent
      and leaves the ref alone. All pass.
    - [x] abort — evidence: ✓ "stops polling for idle once the workspace is gone" (939 ms), ✓
      "an ALREADY-aborted signal…", ✓ "aborting mid-sleep…". 4 files, 38 tests passed.
    - [x] R1 byte-identical — evidence: `git diff -- workspaceDriveModeLive.test.tsx` has 2 hunks,
      the imports (+2) and the appended describes at EOF (+66). The R1 `it` block is untouched.
    - [x] boot — evidence: `vitest run src/__tests__/appBoot.test.tsx` → main + PiP mount, Tests passed.
    - [x] **dev app, live** (orchestrator, MCP bridge on 9223, `scratch-c`). The only state
      changed was the dev `projects.json` drive mode, restored to `autopilot` at the end.
      — evidence: a FRESH open with no unclean flag spawned PID 71058 as
        `claude --permission-mode bypassPermissions --model opus`, with NO `--continue`.
      — evidence: then Apply `autopilot` → 71058 killed, and the respawn was PID 71314,
        `… --continue`. A `fire` door with no flag cannot produce `--continue`; only `turn-respawn`
        resumes without the flag (`cc_session` table: `(TurnRespawn, false) → Continue`). So the
        override crossed the `cc_spawn` IPC boundary.
      — evidence: Apply `fsd` → respawn PID 72020 `--continue`, and `cc_drive_mode(cc-6)` → `"fsd"`.
        Apply `autopilot` → PID 72296, and `cc_drive_mode(cc-7)` → `"autopilot"`. The dev
        `projects.json` has scratch-c = `autopilot` (restored). After each Apply the readout shows
        the new mode with no ⏳ and no `aria-disabled`.
      — evidence: each Apply's confirm read "Apply drive mode … to this session now? …", so the
        guard saw the live-but-turnless session as idle.
      — not observable live: whether a later plain relaunch drops the override. `/exit` leaves the
        unclean flag `true` (dev `session-state.json`), so a `fire` relaunch gets `--continue`
        anyway (PID 71782), and the check would need an undeclared state edit. It is covered by
        `spawnArgs.test.ts` + the live-harness `ref === null` assertion + mutant M2.
      — teardown: killed by explicit PID only (68581, 68009, 67923, 67814, 67783, all children of
        this session's `pnpm`). Ports 1420/9223 are free afterwards.
    - [x] align: D-b — evidence: `useDriveModeApply.ts` runs `spawnIntentRef.current = "turn-respawn";
      ccPaneRef.current?.relaunch(); setRespawnWanted(false);` back to back, with no await or
      timer. The live-harness test asserts no ⏳ right after Apply, and in the dev app no ⏳ was
      present ~8 s after each Apply. Captured, not judged.
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 (decision) D-b: the ⏳ and the editor's disabled state clear as soon as the respawn fires, not ~400 ms later. Keep that, or extend "queued" until the new session id arrives?  <!-- status: done --> — operator 2026-11-06: **A**, keep as built ("queued" = waiting for idle; it ends when the respawn fires).
  - [x] verify-codify  <!-- status: done -->
    Integration boundary: YES. The consuming surface is the workspace header's drive-mode Apply.
    It is exercised end-to-end in the live harness (the real `Workspace`, the real confirm, and
    the stub pane taking the intent via the real `takeSpawnArgs`).
    - Already covered, no duplicate written:
      - the intent: "Apply on an idle agent relaunches ONCE…";
      - the abort: "stops polling…";
      - R1: unchanged test;
      - D-b, approved as A: the same intent test asserts no ⏳ right after Apply;
      - the spawn args: `spawnArgs.test.ts`;
      - boot: `appBoot.test.tsx`.
    - NEW: "a failed drive-mode write reverts and abandons the respawn". This arm moved in the
      extraction and gained an abort check. The test drives the live harness with a rejecting
      `project_set_default_drive_mode`, then asserts the write was attempted, the readout reverts
      to `autopilot`, there is no ⏳, 0 relaunches, and a "write failed" warning.
      Mutants:
      - C1, drop `setStoredDriveMode(previous)` → the test fails.
      - C2, drop the catch's `return` → the test fails.
      Each landed and was restored by `cp` + `shasum`.
    — evidence: `pnpm verify:auto` → EXIT=0 in 60 s. Vitest: 287 files / 3722 tests. `check:link`
      clean. Every cargo target has 0 failed.

- [x] Phase 2: `SupervisorHeaderControl` and the seed-once fix  <!-- status: done -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. R4 puts all four extractions in, and Phase 1 shipped half of WP12.
  - Requirements unchanged: yes. D-e and D-f stand, and the D-b answer (A) doesn't touch this phase.
  - Solution still feasible: yes. Phase 1 proved the extract-plus-HEAD-diff method on this file.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI (gate): `pnpm verify:auto` (timeout 207000) exits 0; `check:link` clean; boot test exits 0
    with a `Tests N passed` line.
  - CLI: `grep -c "setHintNowMs\|setActivityOpen\|seedActivity\|useLatestActivity\|useActivityAlarm" src/components/workspace/Workspace.tsx`
    prints 0, and the same grep finds each of those names in `SupervisorHeaderControl.tsx`.
  - CLI (render-unchanged): HEAD-worktree diff of the header in four states, each of which must
    `diff` to exit 0:
    - gate OFF;
    - gate ON at rest;
    - live harness with the popover open;
    - live harness with the alarm and the suppressed badges showing.
  - CLI (live harness, `supervisorActivityLive.test.tsx` and `supervisorReportsLive.test.tsx`):
    every existing test passes unmodified. The badge toggles, `▾` opens and closes the popover,
    and the hint refreshes on hover.
  - CLI (seed fix, unit and live):
    - When `supervisor_activity_read` REJECTS on the first mount, a second mount of the same
      project issues the read again and seeds the replayed records. Mutant: let a failed read
      seed, and the second mount's records never appear, so the test fails.
    - After a successful seed, a second mount issues **zero** `supervisor_activity_read` calls.
      Mutant: drop the `isSeeded` skip, and the count is 1.
    - An empty successful read still marks the project seeded. Positive control: a third mount
      makes no read.
  - CLI (gate parity): with the workflow gate OFF, the mounted tree issues no
    `supervisor_activity_read` and renders no `workspace-header-supervisor*` element. The existing
    gate-off render test passes unmodified.
  - Browser (dev app, MCP bridge, `scratch-c`): the `⚙` badge, the `▾` popover and Esc behave as
    before. `elementFromPoint` on the badge resolves to the badge span. The popover lists this
    project's recent records.
  **Alignment questions:**
  - none
  - [x] P2.1 `activityRecorder.ts`: `tryReadActivityLines` (null on failure), `readActivityLines` wraps it; `activityFeed.ts`: export `isSeeded`  <!-- status: done -->
  - [x] P2.2 Extract `SupervisorHeaderControl.tsx` (D-e) with the seed effect (D-f: skip when seeded, no seed on `null`)  <!-- status: done -->
  - [x] P2.3 `Workspace.tsx`: render the control in place of the inline group; drop the moved state, effect and imports in the SAME phase  <!-- status: done -->
  - [x] P2.4 Seed-fix tests (failed-read retry, skip-when-seeded, empty-read-seeds) + mutation-prove each individually  <!-- status: done -->
  - [x] P2.5 `pnpm check:link` + boot test + `pnpm verify:auto`; HEAD-worktree render diff  <!-- status: done -->
  **Build notes (2026-11-06):**
  - `SupervisorHeaderControl.tsx` (197 lines) holds the badge, its markers, the `▾` trigger and
    popover, the hint clock and the seed. Its JSX was lifted programmatically, with only three
    identifier renames. `Workspace.tsx` went 1437 → 1298, and 1607 → 1298 across the WP.
  - ⚠️ An unplanned split. The turn-nav `⚙` (`turnBadge`) read the same readout, and it renders
    OUTSIDE the group. So `Workspace` keeps a gated `supervisorTurnBadge` derivation through the
    same `workspaceSupervisorReadout` call, which has one gate, and the control's readout omits
    `turnOrigin`.
  - ⚠️ A guard retargeted. `supervisorToggleStyles.test.ts` read only `Workspace.tsx`. It now
    reads both files:
    - classes and the suppressed-marker guard → the control;
    - toggle wiring and turn-origin → `Workspace`;
    - plus a new pin that `Workspace` hands the control `onToggle={toggleSupervisor}` and
      `enabled={supervisorEnabled ?? true}`.
  - The seed (D-f): `tryReadActivityLines` returns `null` on failure, and so does a non-array
    answer. `readActivityLines` wraps it as `?? []`, so the popover is unchanged. `isSeeded`
    skips the read when it is true.
  - Mutants, one at a time, each landed and was restored by `cp` + `shasum`:
    - S1, a failed read returns `[]` → 1 failure. Its landing was checked by count.
    - S2, drop the `isSeeded` skip → 2 failures.
    - S3, a failed read seeds anyway → 1 failure.
    - S4, the marker ORs in the raw `unsentInput` → 2 failures (the retargeted guard bites).
    - S5, `onToggle={() => {}}` → 2 failures (the new pin AND the live badge-click test).
  - Render-unchanged: HEAD worktree vs working tree, five live-harness states (gate off, gate
    on, popover open with records, alarm + suppressed, turn `⚙`), all byte-IDENTICAL. Each dump
    was checked to contain its target element.
  - `pnpm verify:auto` EXIT=0 in 45 s (3726 tests, `check:link` clean). `appBoot` passes 2.
    `grep -c` of the five moved symbols in `Workspace.tsx` → 0, and each one is present in the
    control.
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 45 s on the final Phase 2 tree (no `src` file is
      newer than the run log). The chain is lint → format → `tsc` → `check:link` ("every entry
      linked cleanly (main, pip)") → vitest (287 files / 3726 tests passed) → `cargo fmt` →
      clippy → `cargo test` (every target 0 failed).
    — evidence: `vitest run src/__tests__/appBoot.test.tsx` → `Tests 2 passed (2)`.
    — evidence: lint reports 1 warning, the pre-existing `XtermPane.tsx` `exhaustive-deps` spread
      warning. It is not this WP's.
  - [x] verify-self  <!-- status: done -->
    Integration boundary: YES. The consuming surface is the workspace header's supervisor badge,
    its `▾` popover and the mount seed (`supervisor_activity_read`). The runner subagent took the
    CLI outcomes, and the orchestrator drove the dev app over the MCP bridge.
    - [x] grep — evidence: `grep -c` of the 5 moved symbols in `Workspace.tsx` → 0. In the control:
      setHintNowMs 3, setActivityOpen 3, seedActivity 3, useLatestActivity 2, useActivityAlarm 2.
    - [x] live harness unmodified — evidence: `vitest run supervisorActivityLive + supervisorReportsLive`
      → 23 passed. The `git diff` is one hunk appended at EOF (+73) in supervisorActivityLive;
      supervisorReportsLive has no diff. ✓ badge toggle (positive control), ✓ `▾` opens the
      popover, ✓ the seeded title hint.
    - [x] seed fix — evidence: the 3 new tests pass. Each mounts twice and counts
      `supervisor_activity_read` calls (`ipcCalls` is reset per mount).
    - [x] gate parity — evidence: ✓ "with the gate OFF there is no trigger and the file is never
      read". `supervisorToggleStyles` + `offInvariantGuard` → 64 passed. The style guard reads
      `emitted` from the control and `workspaceSrc` from `Workspace.tsx`.
    - [x] boot — evidence: `appBoot.test.tsx` → 2 passed.
    - [x] **dev app, live** (orchestrator, bridge on 9223, `scratch-c`, read-only: the badge was
      never clicked, so no `supervisor_enabled` write)
      — evidence: on a FRESH launch, opening scratch-c seeded the badge from the real dev
        `supervisor-activity.log`, whose newest scratch-c record is `withheld: no-verdict`. The
        badge title reads "…Last: withheld: no-verdict · 56m ago", and the `▾` title reads the
        same. So the relocated seed reads and folds the real file.
      — evidence: `elementFromPoint` at the badge's centre → `workspace-header-supervisor` (the
        badge itself). The group's children are [badge, `▾` trigger].
      — evidence: `▾` → the popover opens, `aria-expanded="true"`, focus is inside the popover,
        and it lists both scratch-c records ("56m ago withheld: no-verdict", "57m ago …").
        Screenshot: scratchpad `p2-popover.png`, left-anchored under the group, header intact.
      — evidence: Esc inside the popover → closed, `defaultPrevented: true`, did NOT reach
        `window`, `aria-expanded="false"`. Focus is restored to the element focused before the
        open (the xterm textarea), which is `SupervisorActivityPopover.tsx`'s unchanged
        `before?.focus()`.
      — evidence: an Esc while focus sat in the terminal (the CC pane's spawn-time `term.focus()`)
        left the popover open. That is the WP8 "no close from afar" behaviour, so it was expected.
      — teardown: explicit PIDs (452, 344, 304, 210, 179, all under this session's `pnpm`). The
        CC child 1455 exited with the app. Ports 1420/9223 are free.
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11); advanced per drive_mode=autopilot. Phase 1 had a real leaf (D-b), so the 5a feature floor does not apply.
  - [x] verify-codify  <!-- status: done -->
    Integration boundary: YES. The consuming surface is the header's supervisor badge, `▾`
    popover and mount seed. It is exercised end-to-end by `supervisorActivityLive.test.tsx` (the
    real `Workspace` → the real `SupervisorHeaderControl` → `supervisor_activity_read` via
    `mockIPC`), which now holds the 3 seed tests.
    - Already covered, no duplicate written:
      - the seed: once / retry / empty;
      - gate parity;
      - badge / popover / hint;
      - the marker guard (S4);
      - the toggle wiring (S5);
      - the turn `⚙` gate-OFF case. Mutant C4 ungates the badge's derivation in `Workspace` and
        fails the existing "with the gate OFF … renders no ⚙".
    - NEW: `src/state/supervisor/__tests__/activityRead.test.ts` (6 tests) pins
      `tryReadActivityLines` (list → list, `[]` is a success, reject → `null` and logged,
      non-list → `null`) and `readActivityLines` (failure → `[]`, never rejects). Mutant C3, a
      non-list read as `[]`, fails the test.
    — evidence: `pnpm verify:auto` → EXIT=0 in 49 s (288 files / 3732 tests, `check:link` clean,
      every cargo target 0 failed).

## Backlog entries this WP closes (delete-on-resolve at finalize)

- `SURFACE-2026-08-26-QUALITY-RESPAWN-INTENT-HOLD-IS-SCHEDULER-TIMING` (medium). Phase 1.
- `SURFACE-2026-08-26-QUALITY-DRIVEMODE-MINOR-POLISH` (d), its last remaining item. Phase 1.
- `SURFACE-2026-09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH` item 7. This is a **partial**
  close: items 1–2 stay for WP14, so the entry is rewritten to its residual, not deleted.
  Phase 2.
- `SURFACE-2026-11-06-QUALITY-WP8-SEED-ONCE-SWALLOWS-A-FAILED-READ`. Phase 2.

## Current Node
- **Path:** Feature > (complete)
- **Active scope:** none (finalized 2026-11-06)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Code-Quality Review — paydown-2026-11-04-wp12-workspace-extractions

*(feature-review-quality on ship commit `82856a4`, window `f42796f..82856a4`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 2 MINOR. All were auto-backlogged after each claim was re-checked against the source.)*

### Strengths
- The 400 ms hold is replaced by a one-shot intent ref that the spawn takes through one pure
  function, `takeSpawnArgs`, the only builder of the spawn payload. It has value tests for each
  door and a call-shape guard pinning `XtermPane`, and the `teardownIpc` wait is gone.
- Unmount abort follows the in-file `recycleAbortRef` precedent. `abortableSleep` cleans up both
  its timer and its listener, and nothing happens after an abort. Both abort timings are
  unit-tested, and there is a live timer-spy test.
- Every deleted export lands in the same commit as its consumers. The retargeted
  `supervisorToggleStyles` guard reads the file that owns each subject, and adds a new
  `onToggle`/`enabled` pin.
- `tryReadActivityLines` (`string[] | null`) is the narrowest fix for the seed-once defect. It
  keeps the popover's contract, an empty read still seeds, and all three arms are tested.
- The load-bearing comments moved with their code, and the `openIntent` deps-exclusion comment
  was rewritten rather than left stale.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`Workspace.tsx` `supervisorTurnBadge`; `SupervisorHeaderControl.tsx` readout + header comment]
  `workspaceSupervisorReadout` is now called twice, and each call fills only half its options.
  `Workspace` passes only `turnOrigin`, so its suppressed/alarm/lastAction are always empty. The
  control omits `turnOrigin`, so its `turnBadge` is always null. The gate arguments are repeated
  in two files, which contradicts the control's "both of its gates sit in one place". A future
  read of the empty field never errors, and the two copies of the gate can drift apart.

**MINOR**
- [`useDriveModeApply.ts`, the relaunch step] `spawnIntentRef.current = "turn-respawn"` is set
  before `ccPaneRef.current?.relaunch()`. If the pane ref were null, the override would persist
  and the next unrelated spawn would take `turn-respawn`. Also, a spawn run that gets cancelled
  still takes it. These are rare paths, and fixing them costs one line: set the ref only once
  the handle is confirmed.
- [`Workspace.tsx` "(`ccPaneRef` itself is declared …)"; `pickerOnOpenArity.test.ts` the P4.6
  pointer note] Two pointer comments this diff added describe history, not why the code is
  shaped this way (the comment budget).

### Assessment
This is a well-built extraction that pays down debt rather than adding it. `Workspace.tsx` loses
about 300 lines, and both real defects are fixed by a structural change, not by another timer. The
seed fix is minimal, and the guards that moved were retargeted rather than deleted, each with a
mutation proof. The one place a future reader will stumble is the split supervisor readout. It is
worth a small follow-up, not a refactor pass.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:**
  - The supervisor readout was NOT header-only. The turn-nav `⚙` (`turnBadge`) reads it too, and
    renders outside the badge group. So a "move the surface's gate into one component" extraction
    cannot fully centralize it without also deciding where the turn badge's derivation lives.
    That is the review's MAJOR.
  - Two source-text guards pinned the OLD file shape, and only verify-auto found them:
    `pickerOnOpenArity`'s P4.6 intent regex and `supervisorToggleStyles` reading only
    `Workspace.tsx`. An extraction out of `Workspace.tsx`/`XtermPane.tsx` should grep
    `__tests__` for `readFileSync(…Workspace.tsx` / `?raw` before moving code.
  - `/exit` leaves the unclean flag `true` (the running session sets it), so a "plain relaunch
    drops the override" check cannot be made decisive live without an undeclared state edit.
    `--continue` is only a clean discriminator of `turn-respawn` on a FRESH open with no flag.
- **Assumptions that held:**
  - Consume-at-spawn needs no wait: nothing writes the ref between `relaunch()` and the spawn, and
    the live respawn proved the override reaches `cc_spawn`.
  - R1's test block stayed byte-identical.
  - Both phases' resting DOM was unchanged, except the one approved D-b difference.
  - `recycleAbortRef` was the right precedent for the abort.
- **Assumptions that were wrong:**
  - The plan expected `--continue` after Apply to prove `turn-respawn` on its own. On a
    flag-carrying workspace a `fire` door produces it too, and the check only became decisive
    after a close cleared the flag.
  - The plan's Phase 2 boundary (D-e) said the control "owns the readout", but `Workspace` still
    needs one field of it.
- **Approach delta:**
  - An unplanned `cc/spawnArgs.ts` (`takeSpawnArgs`) became the single spawn-payload builder, so
    the read is a value test rather than a regex.
  - The picker P4.6 guard moved there.
  - `supervisorToggleStyles` was retargeted to two files.
  - The write-failure arm of the apply chain gained a live test at codify. It moved in the
    extraction and had none.
  - 16 mutants in total.

**Closure:** **Feature complete:** paydown WP12, the `Workspace.tsx` extractions, has shipped. The
drive-mode apply chain is now `useDriveModeApply`: its respawn takes `turn-respawn` through a
one-shot ref instead of a 400 ms sleep, and a queued apply aborts when the workspace closes. The
supervisor badge, popover and seed are now `SupervisorHeaderControl`, and a failed activity read no
longer disables the relaunch replay. To see it: in any workspace, change the drive mode in the header
and Apply; the readout shows the new mode with no ⏳, and the respawned `claude` carries
`--continue`. Requester = operator — closure notice for self-record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-06] feature-plan — wbs.md exceeds size guard (483 lines); read headings + WP8 only. The sweep's own `backlog-paydown-wbs.md` → WP12 is the operative context.
