# Feature: Terminal session torn down + re-spawned on panel/workspace switch (QoL-WP4)

**Workflow:** feature
**State:** Completed 2026-06-25
**Created:** 2026-06-25
**Entry:** reproduce (bug-fix feature)
**Drive mode:** autopilot
**WBS:** docs/product/qol-wbs.md → WP4
**Backlog:** SURFACE-2026-06-24-TERMINAL-SPURIOUS-NEWLINE-ON-PANEL-SWITCH

## Problem Statement
Switching right-panel tabs (Terminal↔Editor / Terminal↔Diff) or switching center-stage
workspace makes the WP9 second-terminal (login shell) stack up empty `stayman@… claudesk %`
prompt lines.

**The empty prompts are a symptom, not the bug.** The operator's clarification reframes it:
the terminal SESSION is being terminated and a NEW one spawned on each switch — NOT a stray
`\r`/`\n`. Decisive evidence: type a command, switch away, switch back, press **up-arrow** →
the just-typed command is **NOT in shell history**. That's only possible if the shell is a
different process (a fresh PTY) after the switch. Each new shell prints its prompt → the stack.

**Expected:** the terminal panel spawns its shell exactly ONCE (deferred until first shown),
and that one session + its scrollback + its history survive every panel and center-stage
switch (the "all panels/workspaces stay mounted" invariant). Switching away and back must
not touch the PTY.

**Observed:** every time `active` (= `visible && panel === "terminal"`) goes false→true, a
brand-new `term_spawn` fires; the prior shell is orphaned; history is lost.

## Root Cause (code-level, confirmed by reading)
- `XtermPane` spawn effect (`src/components/workspace/XtermPane.tsx:306-383`) keys its
  dependency array on `spawnTriggerDeps({ spawnNonce, active, projectPath, spawnCommand })`
  (`src/cc/spawnTrigger.ts`). `active` is an **unconditional** member of the trigger set.
- For the terminal panel, `active = visible && panel === "terminal"`
  (`RightPanelHost.tsx:600`). It flips true→false→true on:
  1. **Panel switch** Terminal→Editor/Diff→Terminal (`panel` changes), and
  2. **Center-stage switch** away-then-back while the Terminal tab is front (`visible` changes;
     note `Workspace` uses off-viewport `left:-99999px`, but `visible` still flips, which flips
     `active`).
- Each false→true edge re-runs the spawn effect: cleanup unlistens the `cc-output`/`cc-exit`
  listeners, then `invoke("term_spawn")` opens a NEW PTY (backend `term_spawn` /
  `spawn_shell` unconditionally creates a fresh session — `src-tauri/src/cc_session/mod.rs:480`).
  The old session id is overwritten in `sessionIdRef` and the old PTY is **never killed**
  (leaked) — but more importantly the user now talks to a different shell with no prior history.
- The **left CC pane is `active=true` always** (Workspace passes no `active` → defaults true),
  so it never re-spawns. This matches the operator's note that the LEFT pane stays clean and
  isolates the bug to the `active`-gated terminal panel.

**Why `active` is in the deps at all:** it was added for DEFERRED spawn (don't spawn a shell
into a zero-size hidden xterm; no shell for an unopened panel — incident-terminal-blank-cursor
era). But "spawn on FIRST activation" was conflated with "spawn on EVERY activation." The fix
must keep deferral while making re-activation (active false→true *after a session exists*) a
no-op for spawning. The repaint-on-active effect (`XtermPane.tsx:390-397`, refit+focus) is
correct to keep firing on every activation — it's the SPAWN that must be once-only.

## Reproduction Attempt
**Surface chosen:** failing test (pure decision-seam) + manual recipe
**Outcome:** reproduced
**Determinism:** every-run

### Artifact 1 — failing test (red)
`src/cc/__tests__/respawnOnReactivate.repro.test.ts`
- Imports a not-yet-existent corrective predicate `shouldSpawnOnActive` from `../respawnGuard`
  (the green target — single source of truth for "may the spawn effect spawn now?"). The
  import fails today → RED, proving the once-only-spawn guard is absent.
- Asserts the correct contract: spawn on FIRST activation only
  (`{active:true, hasSpawned:false} → true`); NO spawn on re-activation
  (`{active:true, hasSpawned:true} → false`, the switch-back edge that lost history); no spawn
  while inactive or on deactivation.
- A second `describe` demonstrates the bug at the EXISTING `spawnTrigger` seam: the dep tuple
  differs between active=true and active=false, so a true→false→true switch forces the effect
  to re-run → re-spawn. (`spawnTriggerDeps(front) !== spawnTriggerDeps(hidden)`.)

Run output (vitest): suite fails on `Cannot find module '../respawnGuard'` — the fix module
does not exist yet, so the bug is structurally unfixed. Confirmed for the expected reason
(missing corrective seam), not a setup/import typo elsewhere.

### Artifact 2 — manual live recipe (the lost-history symptom; PTY-level, xterm tests can't observe it)
Pure tests guard the structural invariant; this manual step guards the live PTY behavior
(per the project posture: pure-logic unit-tested, live PTY/DOM operator-verified — Playwright
is blind to the native PTY). To be run in the installed `.app` (or `pnpm tauri:dev`):
1. Open a workspace; click the **Terminal** tab (⌘⇧T) in the right panel. Wait for the shell prompt.
2. Type a unique command but DON'T necessarily run it — e.g. `echo WP4-MARKER-12345` then Enter.
3. Switch the right panel to **Editor** (⌘⇧E), then back to **Terminal** (⌘⇧T).
   - **Observed (bug):** a fresh empty prompt appears (a new shell); pressing **↑ up-arrow**
     does NOT recall `echo WP4-MARKER-12345` (different process, empty history).
   - **Expected (fixed):** same prompt/scrollback as before; ↑ recalls the marker command.
4. Repeat with a **center-stage switch**: open a second workspace, switch to it, switch back —
   with the first workspace's Terminal tab front. Same teardown/respawn occurs on switch-back.
5. **Re-confirm the LEFT CC pane is clean:** type in the left CC terminal, switch panels/stage
   away and back — the CC session and its scrollback persist (it's `active=true` always; no
   re-spawn expected). This is the asymmetry that localizes the bug to the terminal panel.

**Notes for plan/fix:**
- Fix is FRONTEND-only (the spawn decision). Backend `term_spawn` is correct to always spawn a
  fresh PTY — the caller must just stop calling it on re-activation.
- Keep deferred-spawn (first activation spawns) AND keep the repaint-on-active refit+focus.
- The existing `spawnTrigger.test.ts` asserts `active` IS a trigger (line 39) — that assertion
  encodes the bug-causing behavior and will need to be reconciled with the corrective seam in
  the fix (the deferred-spawn intent moves to `shouldSpawnOnActive`, not a bare dep re-trigger).
- Watch the orphaned-PTY leak: a clean fix that spawns once sidesteps it, but if any re-spawn
  path remains, ensure the prior session is killed first.

## Sizing (small/simple criteria for the eventual fix)
- No new data models/endpoints — frontend spawn-decision logic only. ✅
- No arch decisions — reinforces the existing "panels stay mounted / spawn once" invariant. ✅
- Describable in ≤4 sentences. ✅
- <4 hrs, ≤200 lines (a small predicate module + one effect-wiring change + test reconcile). ✅
→ All five hold → **F33 → /feature-plan**.

## Fix design (chosen approach)
**Frontend-only, single phase.** The spawn must be **once-per-session**: deferred until the
pane is first `active`, then NEVER re-fired by a subsequent active false→true edge.

Key structural fact (the trap): React runs an effect's cleanup before every re-run, and the
current spawn effect's cleanup unlistens `cc-output`/`cc-exit`. So we cannot simply "early-return
in the spawn body when already spawned" while leaving `active` in the deps — the cleanup would
STILL tear the listeners down on the active→false flip, then the re-run early-returns and never
re-attaches → a live-but-deaf session (worse: blank pane, the incident class). Two correct
options:

- **(A) Remove `active` from the spawn-effect deps; gate the FIRST spawn separately.** Keep a
  `hasSpawnedRef`. A tiny *trigger* effect (deps `[active]`) bumps `spawnNonce` exactly once —
  on the first active=true when `!hasSpawnedRef.current`. The spawn effect then keys only on
  `[spawnNonce, projectPath, spawnCommand]` (NOT `active`), so an active-toggle never re-runs it
  and never tears the listeners down. `shouldSpawnOnActive({active, hasSpawned})` is that
  trigger's pure decision. **Chosen** — it most directly removes `active` as a teardown trigger
  while preserving deferral, relaunch, and the path/command real-teardown triggers.
- (B) Keep `active` in deps but split listener-ownership into its own effect keyed on the
  session id (so it survives active-toggles). Heavier change to a delicate file; rejected.

**spawnTrigger.ts reconciliation:** `active` leaves the spawn-effect trigger set. `spawnTriggerDeps`
becomes `[spawnNonce, projectPath, spawnCommand]` and `isSpawnTrigger("active")` becomes false;
the deferred-spawn intent moves into `respawnGuard.shouldSpawnOnActive` + the trigger effect.
Update `spawnTrigger.test.ts` accordingly (its line-39 `active`-is-a-trigger assertion encoded
the bug). The blank-cursor invariant (`bridge.phase` is NEVER a trigger) is preserved verbatim.

## Work Tree

- [x] Phase 1: Spawn the terminal shell once — no re-spawn on re-activation  <!-- status: done — all impl + verify nodes complete; full suite 478/478 -->
  **State:** verify-codify (all phases complete)
  **Observable outcomes:**
  - CLI (red→green): `pnpm vitest run src/cc/__tests__/respawnOnReactivate.repro.test.ts` —
    currently fails (no `respawnGuard`); after the fix passes (4+1 assertions), proving
    `shouldSpawnOnActive` spawns on first-activation only and is inert on re-activation.
  - CLI: `pnpm vitest run src/cc/__tests__/spawnTrigger.test.ts` passes with the reconciled
    contract (`active` no longer a spawn trigger; `bridge.phase` still excluded).
  - CLI: `pnpm exec tsc --noEmit` exits 0 (XtermPane re-wiring type-checks).
  - CLI: `pnpm vite build` exits 0 (no broken imports across XtermPane/spawnTrigger/respawnGuard).
  - CLI: full suite `pnpm vitest run` green (no regression in the 462 existing tests).
  - CLI (source assertion): a `?raw` test asserts XtermPane's spawn effect dep array does NOT
    include `active` and that the spawn body / a trigger effect routes through `shouldSpawnOnActive`
    (pins the structural invariant so a future edit re-adding `active` to the spawn deps fails).
  - Human (live, carried to verify-human): in the installed `.app`/`tauri:dev` — type a marker
    command in the Terminal panel, switch panel away+back (and center-stage away+back), press ↑ →
    the marker command IS recalled (same shell, history preserved); no stacked empty prompts; and
    the LEFT CC pane stays clean on the same switches.
  - [x] P1.1 Create `src/cc/respawnGuard.ts` — pure `shouldSpawnOnActive({active, hasSpawned})`
        returning `active && !hasSpawned` (first-activation-only). Doc-comment the WP4 root cause.  <!-- status: done -->
  - [x] P1.2 Rewire `XtermPane.tsx`: added `hasSpawnedRef` (set true on a COMMITTED spawn,
        cleared on relaunch); added a `[active, bridge.phase]`-keyed trigger effect that, when
        `shouldSpawnOnActive({active, hasSpawned})` && phase==="spawning", bumps `spawnNonce` to
        fire the first spawn; REMOVED `active` from the spawn-effect deps (now nonce/path/command
        only) and made `spawnNonce===0` the pre-trigger sentinel so the single spawn path serves
        BOTH the always-active CC pane and the deferred terminal. Relaunch no longer bumps the
        nonce directly (the trigger does it on phase→spawning) → one nonce-bump path, no double
        spawn. Repaint-on-active refit+focus unchanged.  <!-- status: done -->
  - [x] P1.3 Reconcile `src/cc/spawnTrigger.ts`: dropped `active` from `SpawnTriggerInputs`/
        `spawnTriggerDeps` (now `[spawnNonce, projectPath, spawnCommand]`)/`isSpawnTrigger`;
        kept `bridge.phase` excluded. Updated `spawnTrigger.test.ts` to the reconciled contract
        (added an explicit "`active` is NOT a trigger" assertion).  <!-- status: done -->
  - [x] P1.4 Orphan-PTY angle confirmed: once-only spawn removes the re-spawn-on-switch path
        that previously orphaned a shell per switch; the single session is reaped by the existing
        unmount `cc_kill` + window-close `kill_all`. No new kill logic. (StrictMode double-mount:
        spawn effect re-runs on remount with `spawnNonce≠0` → S2 spawned after S1 reaped; verified
        by trace + the `hasSpawnedRef`/sentinel structure.)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc clean; 4 WP4 test files 20/20; eslint 0 errors (1 pre-existing warning) -->
  - [x] verify-self  <!-- status: done (static slice; live PTY outcomes carried to verify-human per backend-lifecycle convention) -->
    **verify-self result (backend-PTY-lifecycle → operator-only at live tier):**
    - Static slice (agent-verifiable) PASS: `tsc --noEmit` clean; `vite build` clean (no broken
      imports/JSX across the change); 4 WP4 test files 20/20 (incl. the red→green reproduction).
    - Integration boundary: YES (XtermPane backs the live terminal + CC panes). Outcomes cite the
      consuming surfaces by name (Terminal panel / ⌘⇧T·⌘⇧E switches / LEFT CC pane). Satisfied.
    - Wiring trace (connected path) PASS: RightPanelHost `active={visible && panel==="terminal"}`
      → TerminalPane (`term_spawn`) → XtermPane trigger effect `shouldSpawnOnActive` + phase-guard
      → `setSpawnNonce` → spawn effect keyed `[spawnNonce, projectPath, spawnCommand]` (no `active`)
      with `spawnNonce===0` sentinel → backend `term_spawn`. `hasSpawnedRef`: false→true on commit,
      cleared on relaunch. Left CC pane (`active` defaults true) spawns once via the trigger at mount.
    - NO Playwright subagent spawned: a bare Vite browser has no Tauri IPC + no native PTY, so the
      workspace doesn't mount and the history-survival/no-respawn outcomes are unobservable there
      (per CLAUDE.md "verify-self on backend-lifecycle features is operator-only at the live tier"
      + SURFACE-2026-06-23-AGENT-LIVE-VERIFY-TAURI-IPC-GAP). The live outcomes are CARRIED to
      verify-human below.
  - [x] verify-human  <!-- status: done — operator confirmed all 5 live outcomes pass (2026-06-25) -->
    - [x] P1.verify-human.1 Terminal: type marker cmd → ⌘⇧E to Editor → ⌘⇧T back → ↑ recalls it (history survives — THE fix)  <!-- status: done -->
    - [x] P1.verify-human.2 Terminal: center-stage switch away+back (Terminal tab front) → same shell, no new prompt  <!-- status: done -->
    - [x] P1.verify-human.3 No stack of empty `stayman@… claudesk %` prompts accumulates on repeated switches  <!-- status: done -->
    - [x] P1.verify-human.4 LEFT CC pane unaffected: its session + scrollback persist across the same switches  <!-- status: done -->
    - [x] P1.verify-human.5 Deferred-spawn still holds: a never-opened Terminal panel spawns no shell until first shown  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — behavior fully codified by TDD-built tests; no new test needed; manual-regression note recorded -->
    **verify-codify assessment:**
    - Integration boundary: YES (XtermPane backs live terminal + CC panes). The highest-fidelity
      test the environment supports is the `?raw` source-assertion against the consuming surface
      (`spawnOnceOnReactivate.test.ts`) — the live PTY end-to-end is operator-only (no native PTY
      in vitest), the established project posture (cf. autofocusCcOnPromote / terminalSlotGuard).
    - Coverage (no new test needed — all written TDD during build, no duplication):
      • `respawnGuard.test.ts` — exhaustive truth table for `shouldSpawnOnActive`.
      • `respawnOnReactivate.repro.test.ts` — red→green codify anchor; the switch-back dep tuple
        is inert (the structural guarantee the fix rests on).
      • `spawnTrigger.test.ts` — reconciled: explicit "`active` is NOT a re-spawn trigger" +
        "`bridge.phase` is NOT a trigger" (both fix invariants pinned in one contract).
      • `spawnOnceOnReactivate.test.ts` — 5 wiring invariants: `active` out of the spawn-effect
        deps, `shouldSpawnOnActive` routing, `hasSpawnedRef` latch, `spawnNonce===0` sentinel,
        latch-clear-on-relaunch.
    - **Manual-regression note (live PTY, operator-only):** the byte-level "shell history survives
      a panel/center-stage switch; no new shell process" outcome is not agent-automatable (vitest
      has no native PTY). Regression check: in the app, type a marker cmd in the Terminal panel →
      switch panel/stage away+back → press ↑ → the marker must be recalled (same shell). This
      mirrors the incident-terminal-blank-cursor manual step the spawnTrigger contract carries.

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** none — shipped (10c604f); review-quality clean (0 CRITICAL/0 MAJOR/3 MINOR auto-backlogged)
- **State:** review-quality (complete) → finalize
- **Blocked:** none
- **Unvisited:** within Phase 1: verify-auto → verify-self → verify-human → verify-codify
- **Open discoveries:** none
- **Build result:** respawnGuard.ts + spawnTrigger.ts reconcile + XtermPane rewire done. tsc clean; full vitest 478/478 (16 new WP4 assertions across respawnGuard.test.ts, respawnOnReactivate.repro.test.ts (red→green), spawnTrigger.test.ts, spawnOnceOnReactivate.test.ts ?raw); vite build clean; eslint 0 errors (1 pre-existing spread-in-deps warning, present on the committed file before this change).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
none

## Code-Quality Review — qol-wp4-terminal-respawn-on-switch

### Strengths
- Extracting the spawn decision into a pure `shouldSpawnOnActive` predicate (`respawnGuard.ts`) makes the load-bearing "spawn once" invariant unit-testable in isolation and reads as exactly the conjunction it claims to be — the right seam for a file with this bug history.
- The `active`-removal is funneled through `spawnTriggerDeps` (single source of truth) AND its companion `isSpawnTrigger` regression test, so re-introducing the bug fails a test rather than relying on review — consistent with how the prior blank-cursor incident was pinned.
- The single-nonce-bump design (relaunch clears the latch + resets phase rather than bumping the nonce directly, routing both first-spawn and relaunch through the one `[active, bridge.phase]` trigger effect) eliminates the double-spawn risk a second bump path would create; the rationale is documented inline at `handleRelaunch`.
- Comments encode WHY (the conflation of "spawn on FIRST activation" vs. "spawn on EVERY activation", the StrictMode `cancelled`-closure de-dup, the listener-survival-across-phase contract) rather than restating WHAT.
- Test layering matches the project's documented posture (pure logic → vitest; live PTY/DOM → operator verify-human): the `?raw` source-assertion test pins the wiring invariants that jsdom can't observe, and the WIP carries the live history-survives-switch check.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [src/components/workspace/XtermPane.tsx:418-425] The deferred-spawn trigger effect reads the non-reactive `hasSpawnedRef.current` while keyed on `[active, bridge.phase]`. There is a narrow async window after the nonce bump but before `hasSpawnedRef.current = true` (line 365) where an `active` toggle re-runs this effect with `hasSpawned` still false and `phase` still `"spawning"`, firing a second nonce bump. It is safe — the spawn effect's per-run `cancelled` closure self-kills the orphan so exactly one session survives — but the trigger effect's own comment ("bumps `spawnNonce` exactly once") slightly overstates the guarantee; the once-ness is enforced downstream by `cancelled`, not by this effect. A one-line note pointing at that backstop would prevent a future reader from "tightening" the de-dup here and breaking the StrictMode contract.
- [src/cc/__tests__/respawnOnReactivate.repro.test.ts:55-73] The second `describe` block ("WP4 repro") duplicates all four truth-table cases already covered exhaustively in `respawnGuard.test.ts:13-42`. The repro file's value is the red-import + the dep-tuple-inertness assertion (lines 44-52); the four restated predicate cases are redundant coverage that adds maintenance surface without new signal.
- [src/components/workspace/__tests__/spawnOnceOnReactivate.test.ts:47] The "clears the latch on relaunch" assertion `/hasSpawnedRef\.current\s*=\s*false/` is a bare substring match that does not anchor the match to the relaunch path — it would pass on any `.current = false` assignment anywhere in the file. Low-stakes (only one such assignment exists today), but a near-`handleRelaunch` anchor would make the test resilient to an unrelated edit.

### Assessment
This is a well-built, appropriately-scoped fix. The author correctly diagnosed that the `active`-in-deps mechanism conflated two distinct intents and split them cleanly: the reactive trigger lives in a tiny `[active, bridge.phase]` effect, the policy lives in a pure predicate, and the dep contract stays in the single-source-of-truth module that already guards the sibling blank-cursor invariant. For a file with a documented history of subtle spawn-lifecycle regressions, the change advances rather than accrues debt. The only real wrinkle is that the "exactly once" guarantee is co-enforced by the downstream `cancelled` primitive rather than fully owned by the trigger effect, which is correct but under-flagged at the trigger site. No correctness defect found within the green-tests baseline.

### If you disagree
Operator: dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** The bug title ("spurious newline") was a misdiagnosis baked into the WBS + backlog. The operator's clarification (typed history gone after a switch; ↑ recalls nothing) reframed it from "a stray `\r`/`\n` reaches the PTY" to "the shell SESSION is torn down and re-spawned." The reproduce step caught this before any fix was written — the value of reproduce-first on a bug whose symptom misleads about its cause.
- **Assumptions that held:** Frontend-only fix (backend `term_spawn` was correct all along — it should always mint a fresh PTY; the caller just had to stop calling it). The `CcSession`/spawn-effect seam was the right place. The pure-predicate + single-source-of-truth-deps pattern (mirroring the sibling blank-cursor guard) fit cleanly.
- **Assumptions that were wrong:** The plan's first instinct (a `[active]`-keyed trigger effect ALONGSIDE the existing spawn-at-mount) would have double-spawned at mount. Caught during build by tracing the mount sequence; resolved by making `spawnNonce===0` a pre-trigger sentinel so ONE nonce-bump path serves both panes and there is no implicit mount spawn. Also re-examined the StrictMode double-mount interaction (refs persist across remount) — verified safe because the spawn effect re-runs on remount with `spawnNonce≠0`.
- **Approach delta:** Plan described "add a trigger effect + remove active from deps." Implementation added two refinements not in the plan: (1) the `spawnNonce===0` sentinel unifying first-spawn for BOTH panes (the plan implied the CC pane still spawned at mount independently); (2) relaunch routed through the trigger (clears latch + resets phase) instead of bumping the nonce directly, collapsing two bump paths into one to remove a double-spawn-on-relaunch risk. Both are strictly-safer consolidations, not scope changes.
