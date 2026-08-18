# Feature: M13 WP3 — Recycle Session as a callable operation

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Drive mode:** autopilot  <!-- drive_mode: autopilot — added 2026-08-18 at Phase 1 verify-human; the WIP was created without it, which correctly FAILED that gate's condition (a) and forced the confirmation path. Recorded for later phases; NOT backdated to license the skip it already blocked. -->
**Created:** 2026-08-18
**WBS:** `workflow-system/product/wbs.md` → WP3 (M13, size L, critical path WP1→WP3→WP4)
**Probe evidence:** `workflow-system/state/archive/m13-wp1-probe.md` → "Phase 2 — Q3"

## Problem Statement

A CC session accumulates context until it degrades; the operator's remedy today is a manual
sequence — type `/session-handoff`, wait for it to finish, kill the session, respawn, type
`/session-restore` — spread across minutes of watching a terminal for a skill to end. WP3 makes
that sequence **one programmatically callable operation** with the workspace-header button as its
first caller. The hard part is not the byte injection (one existing function call) but **knowing
when a skill running *inside* CC has finished**: Claudesk has no completion protocol, `Stop` fires
on every turn end, and the `.session.md` write lands 9–12s *before* the handoff actually completes.
WP1 settled that question empirically over three captured runs; this WP builds against that answer
rather than re-deriving it.

## Pre-plan findings — measured while planning, before Phase 1

Recorded because each one changes a task the WBS wrote, and all are cheap to verify.

### ⚠️ Finding A — the kill/respawn half ALREADY EXISTS as `handleRelaunch`, but is NOT reachable

`XtermPane.tsx:250` `handleRelaunch` is exactly Recycle's steps 4–5: `cc_kill` → null the session
ref → clear `hasSpawnedRef` (the spawn-once latch) → `dispatch({type:"relaunch"})`, which lets the
**single** deferred-spawn trigger fire the nonce bump — deliberately one nonce-bump path so relaunch
and first-spawn cannot double-spawn. ⚠️ **It is an internal closure**: `XtermPaneHandle` (`:61`)
exposes only `focus` / `refit` / `setFontSize`. So WP3 does **not** write a kill/respawn sequence —
it **exposes the existing one** as a fourth handle member. Writing a second respawn path would
duplicate the latch/nonce discipline that comment block exists to protect.

### ⚠️ Finding B — `Stop` DOES reach the frontend per-event, but the status MAP collapses it

The backend emits one `workspace-status` event per mapped hook event with **no dedupe**
(`status_broadcaster/commands.rs:131` — every `to_update` `Some` emits). But the frontend reducer
`applyStatusUpdate` (`workspaceStatus.ts:118`) **overwrites** a per-workspace map entry, so two
consecutive `Stop`s both land as `state:"idle"` and a `useEffect` on the derived state string sees
**no change**. ⚠️ **Recycle must subscribe to the raw `workspace-status` event stream, not to
`stateFor(map, id)`** — Q3's composite depends on observing *the next* `Stop`, which the map cannot
express. This is the single most likely way to build this feature and have it silently never fire.

### ⚠️ Finding C — the `.session.md` watcher already exists and already emits

`fs_watch::is_ignored` (`fs_watch/mod.rs:119`) is **name-based only** and its doc comment names
`.session.md` explicitly as a file that "now passes the filter and emits `fs-change`". The
`fs-change` event carries project-relative POSIX paths, debounced, per workspace
(`state/fsChange.ts`). ⚠️ So WP3 builds **no new watcher** — it filters an existing stream. Two
consequences: the `*.tmp.*` exclusion Q3 requires must be applied by *this* consumer (the watcher
does not do it), and the watcher must actually be running for the workspace (`workspace_watch_start`).

### ⚠️ Finding D — `RecycleSession` route exists; the IPC funnel is `markSessionClean`

Confirmed from the caller side, per WP1: `CleanExitRoute::RecycleSession` is in the enum
(`session_state/mod.rs:342`), in `ALL` (3 variants), wire name `"recycle-session"` (`:369`), in the
TS union (`cleanExit.ts:39`), with a test pinning it for M13. Production callers: **zero**.
`markSessionClean(path, route)` (`cleanExit.ts:76`) → `invoke("session_state_mark_clean")` is the
frontend route (one existing caller: `App.tsx:474`, `"workspace-close"`). Recycle is
frontend-initiated ⇒ **use the IPC path**, matching `WorkspaceClose`, not `clear_and_persist`.

### ⚠️ Finding E — the auto-resume arm is ALREADY latched off across a relaunch (do not "fix" it)

`hasFiredRef` (`XtermPane.tsx:195`) is inject-once **for the pane's whole lifetime**: set at `:548`,
never cleared, and **deliberately NOT cleared by `handleRelaunch`** (the LIFECYCLE comment block at
`:179–185` says so explicitly). It exists because M12 hit precisely the bug this WP could
reintroduce: a relaunch re-ran the spawn effect, read a still-set `pendingAction`, and typed
`/session-restore` **a second time against a `.session.md` the first fire had already deleted**
(`autoResumeFire.ts:95–112`).

⚠️ **Consequence for WP3, and it cuts in our favour:** after Recycle's respawn the automatic arm is
already silent, so Recycle's own `/session-restore` injection is the *only* one and there is **no
double-fire to defend against and no new latch to build**. ⚠️ **Do not "fix" the latch to make
Recycle's restore fire automatically** — that would re-open the M12 defect for the ordinary relaunch
path. Recycle injects its restore explicitly through the funnel; the latch stays exactly as is.

### Confirmed unchanged from the WBS

- `injectCommand` / `slashCommandPayload` (`autoResumeFire.ts:165`/`:145`) — the injection seam,
  `.catch` owned inside, no retry, `label` param present since WP2.
- `fireSkillCommand` (`skillButtons.ts`) — the row's one send funnel for **slash commands**.
- `showSkillButtons({workflowEnabled, ccSessionId})` — the row's render precondition.
- The OFF-invariant guard's arm 5 (`offInvariantGuard.test.ts:500`) imports `SKILL_BUTTONS` +
  `showSkillButtons` from production, asserts the **computed** OFF value, and has an anti-vacuity
  companion pinning that the predicate reads the gate.

## Scope decisions taken at plan time

1. **Recycle is NOT a `SKILL_BUTTONS` member** (WBS-mandated, restated here because the render site
   makes it tempting): that array is typed `{command, label, title}` where `command` is a literal
   slash command routed to `injectCommand`. Recycle is an *operation*. It renders as a **sibling
   button in the same `.workspace-skill-row`**, wired to WP3's entry point.
2. **Do NOT rebuild `DECIDED_ROW_SIZE`** or any test asserting a future row size — removed at WP2
   review as unsound in both directions. Autopsy: `__tests__/skillButtons.test.ts`.
3. **The state machine is the deliverable; the button is one caller.** M15 deliverable 4 is a
   non-click caller. ⚠️ But per the WBS reuse inventory: **build no abstraction for an unspecced
   caller** — one exported async entry point taking explicit inputs, not a plugin surface.
4. **Drive-mode signal: inherited free, nothing built.** Q4 established one unbroken spawn path
   (`cc_spawn` → `resolve_cc_spawn_env` → `cc_spawn_env`). Recycle respawns through `cc_spawn`, so
   the mode comes along. Phase 3 *verifies* this; it does not abstract it.
5. **`/exit`'s ambiguity is out of scope.** WP1 P3.3 examined and deliberately did not fold
   `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` into Q3 — they share the word
   "clean", not a mechanism. This WP does not settle it.

## Work Tree

- [x] Phase 1: The Recycle state machine — pure, over an observed signal sequence  <!-- status: COMPLETE 2026-08-18 — all impl + 4 verification nodes [x] -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/__tests__/recycleMachine.test.ts` exits 0 with a non-zero test
    count printed (⚠️ pin the count — a filter matching zero tests prints `ok` and exits 0).
  - CLI: the machine is driven as a **pure value** — a test feeds the literal run-1 sequence
    (`fresh-write` → `stop`) and asserts terminal state `succeeded`; feeds run 2's (`stop` with no
    preceding fresh write) and asserts terminal state `failed`, reason `no-fresh-write`.
  - CLI: a stale-`.session.md` sequence (`write` whose mtime ≤ baseline, then `stop`) asserts
    `failed` — NOT `succeeded`. This is Q3's run-3 precondition and the trap the baseline defeats.
  - CLI: a `*.tmp.*` path event fed to the machine is **ignored** (state unchanged), asserted
    against the literal observed name form `…/wip/probe-dummy-task.md.tmp.50784.4e1d70fe6f66`.
  - CLI: `pnpm exec tsc --noEmit` → use `./node_modules/.bin/tsc --noEmit`; exits 0
    (⚠️ `pnpm exec tsc` exits 0 regardless of type errors — `[[pnpm-exec-shadows-local-binaries]]`).
  - [x] P1.1 Define the input alphabet as a discriminated union of **observed** signals only:
        `{kind:"session-md-write", mtimeMs}` · `{kind:"stop"}` · `{kind:"timeout"}`. ⚠️ No signal
        that WP1 did not observe. The machine never touches the filesystem or Tauri — inputs are
        values, so every arm is a unit test.  <!-- status: done — `RecycleSignal`, 3 observed members -->
  - [x] P1.2 Define states: `awaiting-fresh-write` → `awaiting-stop` → `succeeded` | `failed`.
        Model the ordering constraint **structurally** (a `stop` in `awaiting-fresh-write` is
        terminal-failed) rather than as a boolean flag pair, so the illegal state is unrepresentable.  <!-- status: done — a `stop` in `awaiting-fresh-write` is terminal-failed -->
  - [x] P1.3 The freshness predicate: `mtimeMs > baselineMtimeMs`, **strictly** greater, with the
        baseline passed IN as machine input (sampled by the caller before the operation starts).
        ⚠️ Absent baseline (no pre-existing `.session.md`) is `0`/`null` → any write is fresh; test
        both that arm and the stale arm.  <!-- status: done — `isFreshWrite`; mutation-proven `>` vs `>=` -->
  - [x] P1.4 The failure arm as a first-class terminal state carrying a discriminated reason
        (`no-fresh-write` | `timeout`), not a bare boolean. ⚠️ Run 2 is its exact shape: `Stop`
        arrives, nothing was written, CC asked a question instead.  <!-- status: done — discriminated `RecycleFailureReason`; mutation-proven (5 tests) -->
  - [x] P1.5 The `*.tmp.*` exclusion as a pure path predicate, unit-tested against the observed
        temp form AND against a legitimate `.session.md` path (both directions).  <!-- status: done — ⚠️ REVISED at verify-self: the predicate is no longer caller-side, it is called BY `recycleTransition` (it had zero production callers as first built); mutation-proven in both directions -->
  - [x] verify-auto  <!-- status: done 2026-08-18 — lint 0, tsc 0, 23/23 targeted, import smoke (count later 27 after the verify-self in-place fix) -->
  - [x] verify-self  <!-- status: done 2026-08-18 — subagent: 5 outcomes, 4 PASS + 1 BLOCKING FAIL (Outcome 4) fixed in place under the shortcut; fresh subagent re-verified PASS -->
  - [x] verify-human  <!-- status: skipped 2026-08-18 (F11) — operator-confirmed. No integration boundary: isolated new artifacts only (recycleMachine.ts + its test, imported by nothing yet). All 5 outcomes PASS at verify-self, so no checklist items remained after the pre-filter. ⚠️ NOT auto-skipped — the gate's condition (a) failed (WIP had no drive_mode field), so the confirmation path was taken. -->
  - [x] verify-codify  <!-- status: done 2026-08-18 — matrix enumeration found an UNCOVERED cell (stale write in `awaiting-stop` overwrote retained evidence 100→5); fixed + 3 tests added (27→30), mutation-proven both directions. Suite 2082 (2052 baseline + 30). -->

- [x] Phase 2: The callable operation — ONE funnel, wired to real signals  <!-- status: COMPLETE 2026-08-18 — all impl + 4 verification nodes [x] -->
  **Observable outcomes:**
  - CLI: ⚠️ **CORRECTED at verify-self 2026-08-18 — the original wording was unverifiable.** It
    asked for `grep -c "recycleSession("` to show "exactly one production call site"; that grep
    returns 1, but the match is the function's own **DEFINITION** (`recycleSession.ts:261`), so the
    true production-call-site count is **ZERO** and the outcome's number was right by coincidence.
    Worse, it inverts in Phase 3: adding the button (one real caller) makes the count 2, so the
    outcome would read as FAILING exactly when it is satisfied. **Restated to measure the actual
    property:** `grep -rn "recycleSession(" src/ --include="*.ts" --include="*.tsx" | grep -v
    "__tests__" | grep -v "export async function"` (⚠️ **quote the globs** — unquoted, zsh tries to
    expand `--include=*.ts` itself and aborts the pipeline with "no matches found", which prints
    nothing and reads exactly like a clean pass) returns **no production caller at this phase**
    (the button lands in Phase 3), asserted rather than eyeballed.
  - CLI: a test drives the funnel with a **stubbed** signal source and asserts the full ordered
    effect sequence on success: `inject /session-handoff` → (await) → `markSessionClean(path,
    "recycle-session")` → `cc_kill`+respawn → `inject /session-restore`. Asserted as an **ordered
    array**, so a reordering fails.
  - CLI: the FAILURE path test asserts `markSessionClean` and the respawn were **NOT** called —
    the negative arm, asserted as hard as the positive (Q3: never recycle away work whose handoff
    never happened).
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml` exits 0, count ≥ 827 lib tests.
  - Console: no unhandled promise rejection during either test path (every `invoke` has `.catch`).
  - [x] P2.1 Expose relaunch on `XtermPaneHandle` as a fourth member (Finding A) — a thin seam onto
        the **existing** `handleRelaunch`. ⚠️ Do not reimplement the latch/nonce dance; call it.  <!-- status: done — `relaunch()` on XtermPaneHandle, exposing the EXISTING handleRelaunch via a ref (same ordering trick as fitAndResizeRef) -->
  - [x] P2.2 Sample the baseline mtime **before** anything is injected (Q3: a baseline read after
        the operation begins can race the write). Read it via the existing fs/announce surface;
        absent file → no baseline.  <!-- status: done — `readSessionMdMtime` via existing `stat_file`; mutation-proven to run BEFORE the injection -->
  - [x] P2.3 Subscribe to the two real signal sources and feed the machine: `fs-change` filtered to
        this workspace + `.session.md` + not `*.tmp.*` (Finding C), and the **raw**
        `workspace-status` event stream filtered to `state === "idle"` (Finding B — ⚠️ NOT the
        status map). Unsubscribe on every terminal state and on unmount.  <!-- status: done — raw `workspace-status` stream (NOT the map) + `fs-change`; both filtered by workspace, unsubscribed on terminal -->
  - [x] P2.4 An explicit per-operation timeout feeding `{kind:"timeout"}` into the machine, so a
        hung step is **visible, not silent** (WBS 3.2). Budget it against Q3's measured worst case
        (run 1: 51.9s to `Stop`) with generous headroom; the number is a named constant with the
        measurement cited.  <!-- status: done — `RECYCLE_TIMEOUT_MS` 180s (~3.5x WP1's slowest 51.9s run), overridable for tests -->
  - [x] P2.5 ⚠️ **THE ONE FUNNEL.** A single exported `recycleSession(...)` that performs the whole
        sequence; both the button (Phase 3) and any future programmatic caller enter here. Guard
        **this function**, not enum membership and not one command's call sites — WP1's retracted
        `AppQuit` finding is the exact error this avoids (auditing one mechanism and generalizing).  <!-- status: done — `recycleSession()` is the one funnel; no abstraction, explicit inputs -->
  - [x] P2.6 Wire the clean-exit clear: `markSessionClean(projectPath, "recycle-session")` on the
        **success path only** (Finding D; opt-in per route, never a teardown side effect). ⚠️ Fires
        BEFORE the kill, so a crash mid-recycle does not leave a false clean mark on a session that
        never respawned — decide and document the ordering explicitly in the funnel.  <!-- status: done — markSessionClean(…, 'recycle-session') on the success arm only, BEFORE the kill; mutation-proven both -->
  - [x] P2.7 ⚠️ Pin Finding E rather than assuming it: a test asserting that after a Recycle
        respawn the **automatic** arm does not also inject (`hasFired` stays latched), so
        `/session-restore` is typed exactly ONCE. ⚠️ This is M12's exact defect shape — a
        double-restore against an already-deleted `.session.md`.  <!-- status: done — Finding E pinned: restore injected EXACTLY ONCE; label is 'recycle' not 'auto-resume' -->
  - [x] P2.8 ⚠️ A caller-side guard test, not only a machine-side one: assert that the **only** path
        which reaches `cc_kill`-for-recycle is through the funnel (extract-and-prove leaves the
        CALLER unproven — hit twice in M11 WP4, one a shipped CRITICAL).  <!-- status: done — caller-side guard on the CALL SHAPE; ⚠️ predicate narrowed after it flagged the type union, then re-proven against a planted offender -->
  - [x] verify-auto  <!-- status: done 2026-08-18 — lint 0 errors (the 1 XtermPane warning PROVEN pre-existing: the flagged effect is verbatim in HEAD and all 4 of my edits are above it), tsc 0, 18/18 targeted, import smoke from outside the tree -->
  - [x] verify-self  <!-- status: done 2026-08-18 — subagent run 1: 4 PASS + 1 FAIL/COSMETIC (Outcome 1 badly specified) + a real `no-session` conflation found outside the outcomes. Both fixed in place under the shortcut; fresh subagent re-verified 5/5 PASS. -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED 2026-08-18 (F11) — all four gates clean: (a) drive_mode=autopilot, (b) verify-self all-PASS, (c) no integration boundary (the XtermPane.tsx diff is purely additive; no existing path reads the new handle member), (d) no outcome names a consuming surface this phase modifies (only test runners + the new funnel). Affirmation printed in chat for the operator's read-time veto. -->
  - [x] verify-codify  <!-- status: done 2026-08-18 — export audit found 3 untested constants; 2 were cross-source MIRRORS (drift risk), 1 a local budget (no drift possible, not pinned). RESTORE_SETTLE_MS now IMPORTS INJECT_SETTLE_MS instead of restating it; SESSION_MD_REL pinned against the RUST source with a non-vacuity floor. 19→22 tests, 3 mutants all killed. -->

- [x] Phase 3: The sixth affordance — the Recycle button, gated  <!-- status: COMPLETE 2026-08-18 — all impl + 4 verification nodes [x] -->
  **Observable outcomes:**
  - Browser (MCP `tauri` bridge, live app): with the gate ON and a live CC session, the workspace
    header's `[data-testid="workspace-skill-row"]` contains **six** buttons, the sixth being
    `[data-testid="workspace-recycle"]`; queried via `webview_execute_js` fire-and-stash
    (⚠️ the bridge hangs on any promise-returning script — stash into `window.__x`, read next call).
  - Browser: clicking that button on a real scratch workspace runs the sequence end-to-end — CC
    receives `/session-handoff`, the session respawns, and `/session-restore` is injected.
  - CLI: `pnpm vitest run src/state/__tests__/offInvariantGuard.test.ts` exits 0 with arm 5 extended
    to cover the Recycle button, asserted as a **computed OFF value** (the arm's own shape).
  - CLI: mutation probe — each guard form proved **INDIVIDUALLY**, and each mutant confirmed to have
    landed in **executable** code (`sed -n '<line>p'` the mutated line) before believing a pass.
  - Console: no JS errors on click; no `skill-button:`-prefixed warn (Recycle is not a skill button
    and must not borrow that label).
  - [x] P3.1 Render the button as a **sibling** inside `.workspace-skill-row`, after the
        `SKILL_BUTTONS.map(...)` — NOT as an array member (scope decision 1).  <!-- status: done — sibling button inside `.workspace-skill-row` (NOT a SKILL_BUTTONS member); `fireRecycle` + a `recycling` busy latch + `waitForFreshSessionId` -->
  - [x] P3.2 Its own show predicate, mirroring `showSkillButtons`' two preconditions
        (`workflowEnabled` && `ccSessionId !== null`) rather than reusing that function by name —
        it gates a different affordance and will diverge if Recycle ever needs a third condition.
        ⚠️ Reuse the *shape*, and if it is identical, say so in a comment rather than aliasing.  <!-- status: done — `recycleButton.ts` with its OWN predicate, deliberately not an alias of showSkillButtons (the two questions can diverge) -->
  - [x] P3.3 Extend OFF-invariant arm 5 to the Recycle affordance. ⚠️ Assert the **computed** OFF
        value; probe the arm INDIVIDUALLY. ⚠️ **A type-level, executable seam reference satisfies
        the chord arm; a comment-only mention was MEASURED not to** — and an invalid probe and a
        real hole present identically (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`).  <!-- status: done — arm 5 extended with 2 assertions on the COMPUTED OFF value; mutation-proven INDIVIDUALLY (ungate → 1 killed; hardcode-false → 1 killed) -->
  - [x] P3.4 ⚠️ Do NOT name any export in the touched modules `*Chord*` — the chord arm selects by
        exported identifier and `WORKFLOW_TERMS` already contains "skill".  <!-- status: done — verified: no export in either new module contains 'Chord'; full guard green -->
  - [x] P3.5 Verify the drive-mode signal survives the respawn (scope decision 4): confirm the
        recycle respawn goes through `cc_spawn`, so `resolve_cc_spawn_env` supplies the mode. ⚠️ A
        **check**, not an abstraction — build nothing either way.  <!-- status: done — VERIFIED, nothing built: relaunch respawns via `invoke("cc_spawn")`, and `resolve_cc_spawn_env` runs INSIDE `spawn` (per-call, not cached), so the mode is inherited free -->
  - [x] verify-auto  <!-- status: done 2026-08-18 — lint 0 problems on ALL five changed files (Workspace.tsx now clean; the refs-during-render ERROR was mine and is fixed), tsc 0, three targeted suites pinned 26/32/19, import smoke from outside the tree, render-site wiring confirmed (predicate+testid+handler all present) -->
  - [x] verify-self  <!-- status: done 2026-08-18 — 2 PASS, 3 UNVERIFIED, 0 FAIL. ⚠️ Outcomes 1/2/5 need a LIVE app running THIS code; the only running instance is the operator's PROD build from 2026-08-06 (12 days older), so checking against it would be a guaranteed FALSE FAIL — deliberately NOT done. They CARRY FORWARD to Phase 4 and are surfaced to verify-human. -->
  - [x] verify-human  <!-- status: done 2026-08-18 — operator confirmed all 3 leaves ("all good"). Integration boundary APPLIED, so the F11 skip path was forbidden and a real checklist was presented; the 3 UNVERIFIED outcomes from verify-self were resolved HERE by the operator against a live dev build, not deferred. -->
    - [x] P3.verify-human.1 Six buttons in the row, sixth is Recycle  <!-- status: PASS 2026-08-18 (operator) — resolves verify-self Outcome 1 -->
    - [x] P3.verify-human.2 Gate OFF ⇒ the whole row (incl. Recycle) is ABSENT  <!-- status: PASS 2026-08-18 (operator) — the OFF-invariant confirmed on the LIVE surface, not just the computed predicate -->
    - [x] P3.verify-human.3 Header layout at a narrow window (the 6th button moves WP2's ~640px truncation)  <!-- status: PASS 2026-08-18 (operator) — the shifted truncation threshold is accepted, as WP2's was -->
  - [x] verify-codify  <!-- status: done 2026-08-18 — INTEGRATION BOUNDARY, so a consuming-surface test was REQUIRED (unit tests on recycleButton.ts do not satisfy it). 2 tests added against Workspace.tsx's row. ⚠️ The first draft FAILED on a test defect (indexOf matched the IMPORT, not the render site) — triaged before fixing. Mutation-proven: delete the button → 2 killed; render it OUTSIDE the gate → 1 killed (the arm-5-invisible case). -->

- [x] Phase 4: Live end-to-end + the negative arm on a real session  <!-- status: COMPLETE 2026-08-18 — all impl + 4 verification nodes [x] -->
  **Observable outcomes:**
  - CLI: on a real scratch workspace (`tmp/scratch/scratch-a`), after a full successful Recycle,
    the unclean-exit flag for that project is **cleared** — read the persisted state file and
    assert the key is absent/false (⚠️ read through the same `key_for()` keying, or a reader that
    skips it silently matches nothing).
  - CLI: **the negative arm** — after that Recycle, a subsequent open fires **no `--continue`**.
    Assert on the resolved spawn argv / announce action, not on a visual impression.
  - Browser: the **stale-`.session.md` case** (WBS 3.7 / Q3 run 3): with a stale pointer present,
    Recycle still succeeds (the fresh write overwrites it) — and with CC *refusing* the handoff
    (run 2's shape), Recycle reports FAILED to the operator and the session is **not** killed.
  - CLI: full suites green — `cargo test` ≥ 827 lib, `pnpm test` ≥ 2052 frontend, `pnpm format:check`
    exits 0, `cargo clippy --all-targets -- -D warnings` exits 0 (⚠️ `--all-targets`, not `--lib`).
  - [x] P4.1 Drive a real Recycle on `tmp/scratch/scratch-a` via the live app. ⚠️ Answer the dev
        profile's **trust-folder prompt first** — it is a menu that swallows injected text, so a
        button click there does nothing and that is expected, not a defect.  <!-- status: done — real Recycle driven on scratch-a via the LIVE dev build (MCP bridge, PID 2753). Trust-prompt already answered. ⚠️ Produced WP1's RUN-2 SHAPE for real: CC REFUSED the handoff -->
  - [x] P4.2 Verify the flag clears (WBS 3.6, positive arm) and the next open fires no `--continue`
        (negative arm, asserted just as hard).  <!-- status: done — BOTH ARMS. Positive: `session_state_mark_clean(scratch-a,"recycle-session")` -> true, on-disk map shows scratch-a ABSENT, other 2 entries untouched. Negative: `picker_announce_actions` omits scratch-a entirely (fires NOTHING), with scratch-c present as "continue" as the CONTROL -->
  - [x] P4.3 Exercise the stale-pointer case and the refusal case (WBS 3.7). ⚠️ The refusal case is
        the one that matters: it is the only proof the failure arm is reachable in production, not
        just in a unit test.  <!-- status: done — planted a 17-DAY-stale `.session.md`; `stat_file` returned its mtime live (1785589200000) and the REAL machine, driven with that measured value, rejected it (`no-fresh-write`) while a fresh write over it succeeded -->
  - [x] P4.4 ⚠️ Instrument hygiene: a blank CC pane is **instrument error**, not a verdict
        (`[[xterm-dom-reads-fake-a-blank-pane]]`), and WP2 found `ipc_monitor` / `read_logs{console}`
        / `ipc_emit_event` all **silent-but-broken**. Run a **positive control** before trusting any
        silence, and a **negative control** before trusting any zero-warning result.  <!-- status: done — positive control (ZZPROBE visible at the prompt) + negative control (console.warn wrap proven live) BEFORE trusting any silence; the xterm-DOM staleness caveat hit and was worked around via cost/context deltas -->
  - [ ] SURFACED — the success path was not observed end-to-end in one live run (fixture-blocked, not a code defect)  <!-- status: SURFACED: filed as SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE -->
  - [x] verify-auto  <!-- status: done 2026-08-18 — ⚠️ Phase 4 changed NO SOURCE (live verification only), so the checks were scoped to ENVIRONMENT CLEANLINESS instead: diff confined to the Phases 1-3 files, scratch-a restored, no orphaned processes, PROD app (1081) verified ALIVE, dev flag store shows only scratch-a touched, backlog entry well-formed (8/8 fields), tsc 0, 56 recycle tests, lint 0 -->
  - [x] verify-self  <!-- status: done 2026-08-18 — 2 PASS, 2 FAIL-cosmetic. ⚠️ Both FAILs were flagged BY ME against my own evidence and confirmed by an independent audit: outcome 1 ('after a full successful Recycle') and outcome 3's stale half ('Recycle still succeeds') are satisfied in INTENT but not as WORDED. COSMETIC, not BLOCKING — no defect implicated; the gap is evidence coverage, already filed as SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE. -->
  - [x] verify-human  <!-- status: done 2026-08-18 — operator ACCEPTED both cosmetic gaps ("accept"). No BLOCKING items existed. The end-to-end composition gap stays open as SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE, to be closed by dogfooding rather than by fixture engineering. -->
    - [x] P4.verify-human.1 ACCEPT/REJECT: outcome 1 satisfied in intent, not as worded (flag cleared via direct IPC, not a completed Recycle)  <!-- status: ACCEPTED 2026-08-18 (operator) — the recycle-session route is proven and now has a production caller; the missing precondition is fixture-caused, not a defect -->
    - [x] P4.verify-human.2 ACCEPT/REJECT: outcome 3's stale half not demonstrated live (rejection proven; "Recycle still succeeds over a stale pointer" not)  <!-- status: ACCEPTED 2026-08-18 (operator) — the refusal half (the one that protects operator work) IS proven live; the stale-success half rides on the same composition gap -->
  - [x] verify-codify  <!-- status: done 2026-08-18 — codified the ONE chain Phase 4 proved live that nothing pinned: wire name -> parse -> clear -> announce goes quiet. Both halves had coverage; NO test joined them. Rust 827->828. Mutation-proven: no-op clear -> FAILED; map-wipe -> FAILED (⚠️ the wipe probe's FIRST attempt did not land — an unlanded mutation and a real gap look identical, so the anchor was verified against the real source before re-running). -->

## Current Node
- **Path:** Feature > COMPLETE (all 4 phases)
- **Active scope:** none — ready to ship
- **Blocked:** none
- **Unvisited:** (none — Phase 4 is the last)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-08-18] P1.1 / P1.5 — verify-self reported Outcome 4 FAIL/BLOCKING: `isTempArtifactPath`
was exported but had **zero production callers**, and `RecycleSignal` carried no path, so a temp
artifact was **not expressible** in the machine's alphabet — the exclusion was dead code a Phase 2
caller was free to forget. Fixed in place under the verify-self in-place-fix shortcut (all three
gates held): added `path` to the `session-md-write` variant and moved the exclusion INSIDE
`recycleTransition`. Re-verified by a freshly-spawned subagent (not by re-reading my own state).
Mutation-proven in both directions: deleting the guard kills 3 tests, over-broadening it kills 6.
Tests 23 → 27.

⚠️ **The transferable lesson, and it is the WP's own stated hazard turned on its author:** this is
exactly *"extracting a pure state machine proves the MACHINE, not its CALLER"* — the plan quoted that
rule at P2.5/P2.8 as something Phase 2 must respect, and Phase 1 then shipped a predicate with no
caller anyway. ⚠️ **A predicate whose only consumers are its own tests looks identical to a working
guard** from inside the test suite: all 23 tests were green, all four original mutants bit, and the
gap was invisible until an outcome's *operative words* ("fed to the machine", "state unchanged") were
read against the code rather than against the test names. **Do not split a predicate from its caller
across phases** — the QoL-WP0 precedent introduced `appliesToWorkspace` in the SAME leaf as its
subscriber, which is why the question never arose there.

[SHORTCUT-2026-08-18] P2.5 / P2.6 — verify-self (Phase 2) reported Outcome 1 FAIL/**COSMETIC** and,
outside the five outcomes, a real **`no-session` conflation**: one string was returned both when
nothing happened AND when the handoff had succeeded, the flag was marked, and CC was already
recycled — opposite operator consequences behind one value, which a Phase 3 caller would render as
one message. Fixed in place under the verify-self in-place-fix shortcut (gates: a mechanical
widening of the vocabulary written in P2.5/P2.6 · fresh-subagent re-verification · this entry).
Added `RecycleCallerFailure` with a distinct `"restore-not-injected"`; the flag is deliberately NOT
rolled back on that arm (the handoff genuinely completed). Tests 18 → 19; re-collapsing the two
reasons kills 2.

⚠️ **The Outcome-1 defect is worth more than the fix.** The outcome asked a `grep -c` to prove
"exactly one production call site" — and the single match was the function's own **DEFINITION**, so
the number was right for the wrong reason and the true caller count was ZERO. ⚠️ It would have
**inverted in Phase 3**: adding the button (one real caller) makes the count 2, so the outcome would
have read as FAILING precisely when it became satisfied. **A grep that counts a definition alongside
its call sites measures neither.** Restated to exclude the definition and the tests.

⚠️ **A second-order trap hit while verifying the correction:** unquoted `--include=*.ts` is expanded
by **zsh**, not grep, and the shell aborts the pipeline with "no matches found" — printing nothing,
which reads **exactly like a clean pass**. I recorded a false pass for one turn before catching it
with a positive control (the unfiltered count). Quote the globs, and always pair a filtered grep
with an unfiltered one that proves the command ran.

[SURFACED-2026-08-18] Phase 2 — the `fs-change` payload carries **no mtime** (`FsChange` =
`workspace_id` · `paths` · `kind` · `git_meta`, `fs_watch/mod.rs:101`). Phase 2 must therefore `stat`
`.session.md` itself after the event to obtain the freshness evidence the machine requires.
⚠️ A read path already exists — `editor_fs`'s `FileMarker` (`mtime_ms: f64` + `size`,
`editor_fs/mod.rs:62`, command at `editor_fs/commands.rs:66`). Recorded so Phase 2 does not build a
second stat path. Not backlogged: it is in-scope Phase 2 work, not a defect.

## Backlog items in scope

- `SURFACE-2026-08-04-CC-READY-NAME-INVITES-MISREADING-AS-CC-READINESS` (medium) — its suggested
  action says *"do (b) at minimum before M13"*, and this WP's respawn touches exactly that timing
  question. ⚠️ **In scope as the cheap (b) doc fix only**, if Phase 2 reads the command; the rename
  (a) is not this WP's work.
- `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` (medium) — **explicitly out of scope**
  per WP1 P3.3, recorded here so it is not re-litigated mid-build.

## Phase 1 build record (2026-08-18)

**Shipped:** `src/state/recycleMachine.ts` + `src/state/__tests__/recycleMachine.test.ts`
(23 tests at build; **27 after the verify-self in-place fix** — see `## Discoveries`). No Rust touched.

**Gate:** 2079 frontend tests pass (2052 baseline + 27 — exact attribution, no regressions; the 2052
baseline was confirmed independently by running the suite with the new file excluded) ·
`./node_modules/.bin/tsc --noEmit` exits 0 · `pnpm format:check` clean · `pnpm lint` 0 errors
(the single `XtermPane.tsx:593` warning is pre-existing and untouched).

### ⚠️ Mutation results — each form proved INDIVIDUALLY, each landing confirmed by `diff`

Per `docs/lessons/source-text-guards.md`: a suite that passes proves nothing until each guard is
shown to bite, and an invalid probe looks exactly like a real hole. Every mutant below was verified
to have changed **executable** code via a full `diff` against a pristine copy — ⚠️ not via a guessed
`sed` line range, which on mutant 2 printed a *different* line than the one actually mutated and
would have made an inconclusive probe look conclusive.

| Mutant | Property under test | Result |
|---|---|---|
| `mtimeMs > baseline` → `>=` | strict freshness (same-ms stale case) | **1 test failed** ✓ |
| failure arm → `return state` | run 2's shape: `Stop` with nothing written | **5 tests failed** ✓ |
| fresh write → `{phase:"succeeded"}` | the roadmap's 9–12s trap | **2 tests failed** ✓ |
| segment-scoped `.tmp.` → whole-path `includes` | false positive under a `tmp.`-named dir | **1 test failed** ✓ |
| *(post-fix)* delete the machine-level temp guard | the exclusion is enforced by the MACHINE | **3 tests failed** ✓ |
| *(post-fix)* guard rejects EVERY write | anti-vacuity — not over-broad | **6 tests failed** ✓ |

File confirmed pristine after each sweep (`diff` empty).

⚠️ **The first four mutants all bit, and the suite was still wrong.** Mutation testing proves the
tests you wrote are load-bearing; it cannot tell you an outcome went unasserted. Outcome 4's gap
survived a green 23/23 and 4/4 mutation kills, and was found only by reading the outcome's operative
words against the code.

### One design change made during build, worth keeping

`isTerminal` was declared `: boolean` and the switch then failed **TS2366** — a plain boolean return
does not narrow at the call site, so the compiler could not prove the switch handled every remaining
phase. Changed to a **type predicate** (`state is TerminalState`). This makes exhaustiveness a
compiler guarantee rather than an assertion: adding a fifth phase now fails to compile at the switch
instead of silently returning `undefined` at runtime. ⚠️ Worth noting because the obvious "fix" for
TS2366 is a `default:` arm or a non-null assertion — both of which would have *removed* the
exhaustiveness check that caught it.

## Phase 1 verify-self record (2026-08-18)

**No integration boundary** — Phase 1 adds isolated new artifacts only (a new module nothing imports
yet + its test). No existing endpoint, route, UI surface, CLI command, job, or outbound call touched.

**Run 1 — 5 outcomes: 4 PASS, 1 FAIL/BLOCKING.**

⚠️ **Outcome 4 failed, and the failure was real.** The outcome's operative words are *"fed to the
machine"* and *"state unchanged"*. As first built, `RecycleSignal` had **no path field on any
variant**, so a temp-artifact event was **not expressible in the machine's alphabet**;
`recycleTransition` never called `isTempArtifactPath`; and the predicate had **zero production
callers** (every reference outside its own definition was in the test file). The property was
asserted only against the bare predicate.

**Fixed in place** under the verify-self in-place-fix shortcut — all three gates held (trivial
extension of P1.1/P1.5 · fresh-subagent re-verification · this audit trail + the `## Discoveries`
entry). Added `path` to the `session-md-write` variant; moved the exclusion INSIDE
`recycleTransition` as a pre-switch guard so it fires from both non-terminal phases.

**Run 2 — fresh subagent, Outcome 4: PASS.** It read the executable line rather than the comments,
and mutated the code itself: deleting the guard killed 3 tests; an over-broad guard killed 6
(including the named anti-vacuity test and captured runs 1/3); a third mutant it added on its own
initiative — naive `path.includes(".tmp.")` — killed 1, confirming the documented directory
false-positive is genuinely pinned rather than merely described. File restored byte-identical
(md5 match). 27 tests, 0 skipped, 0 `.only`.

### ⚠️ The lesson, and it is the WP's own hazard turned on its author

The plan quotes *"extracting a pure state machine proves the MACHINE, not its CALLER"* twice, at
P2.5 and P2.8, as a rule **Phase 2** must respect — and then Phase 1 shipped a predicate with no
caller. ⚠️ **A predicate whose only consumers are its own tests is indistinguishable from a working
guard when viewed from inside the test suite:** 23/23 green, all four original mutants biting, lint
and types clean. What found it was reading the *outcome's operative words* against the code instead
of against the test names. Mutation testing proves the tests you wrote are load-bearing; it cannot
tell you that an outcome went unasserted.

⚠️ **Method note for the rest of this WP:** I read and formatted the subagent's files while it was
mid-mutation and briefly misread its in-flight mutant as a Prettier corruption (and mis-attributed
which mutant it was — the snapshot showed the over-broad form, not the deletion). No harm done, but
the rule stands: do not touch files a verification subagent owns while it runs.

## Phase 1 verify-codify record (2026-08-18)

**No integration boundary** — isolated new artifacts only, so no consuming-surface test is owed.

**Coverage audit first, tests second.** Every export was already exercised (5/5), so symbol coverage
was not the useful question. The useful one was *behavioral*: which **state × signal** cells does the
suite actually drive? I enumerated all ten by instrumenting the real machine and dumping the result
table — and one cell was both uncovered and wrong.

### ⚠️ The gap: `awaiting-stop` + a STALE write overwrote the retained evidence

Measured `freshWriteMtimeMs: 100 → 5`. The `awaiting-stop` branch kept `signal.mtimeMs`
**unconditionally**, so a stale write there overwrote real evidence with an older timestamp — while
`awaiting-fresh-write` **rejected that same write**. The machine's two phases disagreed about what
counts as evidence.

⚠️ **It never changed the succeeded/failed verdict**, which is exactly why 27 scenario tests, 6
mutants, and two verify-self subagents all missed it: every existing test asserts a *verdict*, and
this only corrupts `freshWriteMtimeMs` — the field's sole purpose being operator diagnostics on a
failed recycle. Fixed by applying `isFreshWrite` in both branches. Mutation-proven both directions
(revert → 2 killed; over-broad → 2 killed), each landing confirmed by `diff`.

### ⚠️ Why the scenario tests could not have found it — worth carrying to Phases 2–4

The 27 tests were written from the **three captured runs**. Encoding real observed sequences is their
strength; it is also their blind spot — **a cell the probe never happened to exercise is a cell no
test drives**, and no amount of mutation testing reveals it, because mutation only proves the tests
you already wrote are load-bearing. Enumerating the input space is a *different* instrument from
mutating the implementation, and this phase needed both.

⚠️ Note the pattern across this phase: **verify-self found an unasserted outcome, verify-codify found
an unexercised input.** Neither was a coding error; both were coverage-shaped, and both were invisible
from inside a green suite.

**Codified:** 3 tests (27 → 30) — the gap, its anti-vacuity companion, and a full ten-cell matrix
pinned as one table so a future edit shows up as a diff against the whole picture rather than one
scenario's name. Suite **2082** (2052 baseline + 30), `tsc` 0, prettier clean, eslint 0.

**No test failures occurred at any point**, so the §3b triage path did not apply.

## Phase 2 build record (2026-08-18)

**Shipped:** `src/components/workspace/recycleSession.ts` (the funnel) + its 18-test suite; one new
member on `XtermPaneHandle`. No Rust touched. Suite **2100** (2052 baseline + 30 P1 + 18 P2).

### ⚠️ A design question the plan did not anticipate: the session id CHANGES mid-operation

`relaunch()` kills the session and spawns a new one with a **new id**, so step 6 cannot inject into
`ccSessionId` — that names a dead PTY, and the failure is silent (`cc_input` on an unknown session
rejects into `injectCommand`'s `.catch`, which only `console.warn`s). The fresh id arrives by a
**push** (`XtermPane.onSessionId` → `Workspace` → React state), which an async function cannot await.

**Resolved with a caller-supplied `awaitFreshSessionId()` resolver** rather than new plumbing: the
caller already owns that state and is the only party that knows when the id lands. ⚠️ I first wrote
this as an optional `awaitFreshSessionId?.()` that was not in the interface — it would not have
compiled, and worse it papered over the question. Recorded because the *shape* of the mistake matters:
an optional call silently skipping the restore is exactly the class of silent no-op this WP keeps
finding.

⚠️ **If the respawn yields no id, the operation reports `ok:false` — but does NOT roll back the clean
mark.** The handoff genuinely completed, so the flag is correctly clear; only the restore was missed,
and `.session.md` is on disk to recover it. Reporting success there would hide a session needing a
manual restore.

### Mutation results — 4 orderings, each landing confirmed by `diff`

| Mutant | Property | Result |
|---|---|---|
| failure arm → `if (false)` (recycle unconditionally) | never tear down on a failed handoff | **7 of 14 killed** ✓ |
| `markSessionClean` moved AFTER `relaunch` | mark-before-kill ordering | **1 killed** ✓ |
| restore injected into `ccSessionId` (the killed one) | fresh-id targeting | **1 killed** ✓ |
| baseline sampled AFTER the injection | baseline-before-inject ordering | **1 killed** ✓ |

### ⚠️ P2.8's guard was OVER-BROAD on its first run — and the tempting fix was the wrong one

The predicate `src.includes('"recycle-session"')` flagged `state/cleanExit.ts`, whose only match is
the **type union that DECLARES the route**. That is the vocabulary every legitimate sender must
reference, not a send.

⚠️ **The tempting fix — exempt `cleanExit.ts` by path — would have been wrong in the dangerous
direction:** a genuinely errant `markSessionClean(…, "recycle-session")` added to that file later
would then go unseen. This is the whole-module-exemption failure that produced
`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`. I narrowed the **predicate** to the
CALL SHAPE instead, keeping every file in scope, then **planted a real errant sender in `App.tsx`
and confirmed the guard still catches it** — because a predicate narrowed until it stops firing is
worthless, and a narrowed-but-unproven guard is indistinguishable from a broken one.

### Two smaller things worth carrying

- ⚠️ **`vi.mock` factories must not close over the `const` mocks directly** — the call is hoisted
  above the declarations, so the whole file fails to COLLECT (`0 tests`, which reads as "no suite"
  rather than "failing suite"). The repo's convention is a wrapper arrow; `cleanExit.test.ts` is the
  precedent. Cost me one debug cycle.
- ESLint's `prefer-const` caught a real slip on the timeout handle. My first fix was careless — it
  referenced a nonexistent `feedRef()` and left the original assignment in place. The actual
  constraint is that `timer` must be declared *after* `feed`, since the callback closes over it.

## Phase 2 verify-self record (2026-08-18)

**No integration boundary.** P2.1 modified `XtermPane.tsx` — an existing UI component — so this was
a real judgment rather than Phase 1's obvious call. The full diff is **purely additive**: an
interface member, a new ref, a new handle property, one ref assignment. Nothing existing is
modified, reordered, or removed, and no existing code path reads the new ref. Condition 2's
qualifier (*"such that user-visible behavior changes"*) is therefore not met — adding a capability
nothing calls yet is not a behavior change.

**Run 1 — 5 outcomes: 4 PASS, 1 FAIL/COSMETIC**, plus one real defect found *outside* the outcomes.

### ⚠️ Finding 1 (outside the outcomes) — the `no-session` conflation

`recycleSession` returned `{ok:false, reason:"no-session"}` for two structurally **opposite**
situations: (a) no session existed — *nothing happened, no work at risk*; and (b) the handoff
**succeeded**, the clean-exit flag was marked, CC was killed and respawned, and only the restore
injection was missed — *the operator must now run `/session-restore` by hand*. A Phase 3 caller
rendering a message from `reason` would say "nothing happened" at the exact moment something
significant had. Fixed with a distinct `RecycleCallerFailure` → `"restore-not-injected"`; the flag
is deliberately **not** rolled back on that arm, because the handoff genuinely completed.
Mutation-proven: re-collapsing the two reasons kills 2 tests.

### ⚠️ Finding 2 (Outcome 1) — an outcome that measured the wrong thing, and would have INVERTED

The outcome asked `grep -c "recycleSession("` to prove "exactly one production call site." The grep
returned 1 — but the match was the function's own **DEFINITION**, so the true production-caller
count was **ZERO** and the number was right by coincidence. ⚠️ **It would have inverted in Phase 3:**
adding the button (one real caller) makes the count 2, so the outcome would have read as FAILING
precisely when it became satisfied. **A grep that counts a definition alongside its call sites
measures neither.** Restated to exclude the definition and the tests.

⚠️ **And a second-order trap while verifying that correction:** unquoted `--include=*.ts` is expanded
by **zsh**, not grep — the shell aborts the pipeline with "no matches found", printing nothing, which
reads **exactly like a clean pass**. I recorded a false pass for one turn before a **positive
control** (the unfiltered count, 19 matches) proved the command had not run. Both the corrected
outcome and the re-verification now pair the filtered grep with that control.

**Run 2 — fresh subagent, 5/5 PASS.** It mutation-tested the fix itself (re-collapse → 2 dead,
landing confirmed by diff AND by a comment-stripped read of the mutated line), verified the union has
**no dead member** (all four values returned from real paths and asserted as actual outcomes), and
ran the corrected grep with its own positive control. Suite 2101, tsc clean, file checksum identical
to pristine, `git status` unchanged.

### What this phase says about the instruments

Phase 1's gate found an **unasserted outcome**; Phase 1's codify found an **unexercised input**; this
phase found a **mis-specified outcome** and a **conflated return value**. ⚠️ None of the four was a
coding error, and none was visible from a green suite — every one was a gap between what an assertion
*said* and what it *measured*. The recurring instrument is the same each time: read the outcome's
operative words against the code, rather than against the test names.

## Phase 2 verify-codify record (2026-08-18)

**No integration boundary** — isolated new artifacts, so no consuming-surface test is owed.

**Coverage audit by export, then by drift risk.** Three exported constants had no test:
`SESSION_MD_REL`, `RECYCLE_TIMEOUT_MS`, `RESTORE_SETTLE_MS`. ⚠️ **Only two were worth pinning**, and
the discriminant is whether the value **mirrors a source of truth owned elsewhere**:

- `RECYCLE_TIMEOUT_MS` is a **local budget** owned by this module. Nothing can drift against it, so
  a test would assert `180_000 === 180_000` — a tautology that adds a maintenance point and proves
  nothing. **Deliberately not pinned.**
- `RESTORE_SETTLE_MS` **restated** M12's `INJECT_SETTLE_MS` as a hardcoded `1_500` with a comment
  claiming it mirrored M12. ⚠️ Fixed by **importing** rather than testing the copy — the two live in
  the same bundle, so there was never a reason to duplicate. Retuning `INJECT_SETTLE_MS` would have
  left this stale, and the symptom is a restore typed into a TUI not yet reading stdin: a **dropped
  command with no error**.
- `SESSION_MD_REL` mirrors Rust's `announce::SESSION_MD_REL` and **cannot be imported** — it crosses
  the language boundary. Pinned by reading the **Rust source**, not a second TS copy (a test
  comparing two TS constants proves only that I typed the same string twice). Same method as
  `autoResumeFire.test.ts`'s Rust↔TS byte-payload mirror.

**Mutation results — 3 mutants, 3 kills, each landing confirmed by `diff`:**

| Mutant | Property | Result |
|---|---|---|
| TS path drifted from Rust (`workflow/` vs `workflow-system/`) | the cross-language mirror holds | **1 killed** ✓ |
| `RESTORE_SETTLE_MS` re-hardcoded to `2_000` | derived, not copied | **1 killed** ✓ |
| ⚠️ the **RUST** constant renamed | the **non-vacuity floor** | **1 killed** ✓ — failed loudly with its own message rather than skipping the comparison |

⚠️ **The third mutant is the one that mattered.** A test that reads an external file and regexes a
constant out of it fails *open* by default: if the regex stops matching, `match` is `null` and a
naive comparison would silently compare against `undefined` and pass. The floor asserts
`match` is non-null with an explanatory message **before** the comparison, and mutant G proves that
path is reachable — otherwise this guard would report green precisely when the thing it pins
stopped existing.

**Codified:** 3 tests (19 → 22). Suite **2104** (2052 baseline + 30 P1 + 22 P2), tsc 0, prettier
clean, lint 0 errors (1 pre-existing `XtermPane` warning). **No test failed at any point**, so the
§3b triage path did not apply.

## Phase 3 build record (2026-08-18)

**Shipped:** `recycleButton.ts` (presentation contract) · the sixth affordance rendered in
`Workspace.tsx` · `waitForFreshSessionId` + its 4 tests · OFF-invariant arm 5 extended (+2) · the
CSS base rule + guard entry. No Rust touched. Suite **2110**.

### ⚠️ The respawn handshake — the trap `waitForFreshSessionId` exists for

`relaunch()` kills the session; the fresh id arrives later by a React push. ⚠️ **Waiting for merely
non-null returns the id of the session just killed**, because the mirrored prop still holds it until
the respawn resolves — and `/session-restore` would then be typed into a dead PTY, vanishing into
`injectCommand`'s `.catch` with only a `console.warn`. The comparison against the killed id IS the
feature. Mutation-proven: dropping it kills 2 tests.

### ⚠️ eslint caught a real React error I would not have caught by reading

`ccSessionIdRef.current = workspace.cc_session_id` **during render** is
`Cannot access refs during render` — an ERROR, not a warning, and the rule points at something
real: a render-phase ref write is invisible to React's update model. Moved into an effect (the
`onSessionIdRef` precedent in `XtermPane`).

⚠️ **That fix changed the timing**, so I re-verified rather than assuming: the ref now updates
*after commit*, strictly later than the poll that reads it. Proven against an asynchronous writer
and codified as a permanent test, because "it happened to work when I tried it" is not a contract.

### P3.5 — verified, nothing built (the WBS reuse inventory's instruction)

The relaunch respawn calls `invoke("cc_spawn", {projectPath, intent})` — Q4's single path. ⚠️ And
`resolve_cc_spawn_env(...)` runs **inside `spawn`**, reading the setting and mode **per call**, not
cached at startup (`cc_session/mod.rs:1092`). So a recycled session inherits the current drive mode
for free. Confirmed by reading the Rust, not inferred from the WBS.

### Two guards extended rather than duplicated

- **OFF-invariant arm 5** gains its own Recycle assertions. ⚠️ `showSkillButtons` says nothing about
  Recycle (it is not a `SKILL_BUTTONS` member), so an arm that only checked the array would have
  reported the row clean while a live Recycle button sat beside it — the "the set is not the caller"
  shape again. Probed **INDIVIDUALLY** per the guard's own header: ungating kills 1 test,
  hardcoding `false` kills 1. Two independent tests, neither masking the other.
- **The CSS base-rule guard** gains `workspace-recycle-btn` in its existing array (one list of
  "classes the header emits" is what makes a forgotten class detectable). Mutation-proven against
  the exact trap in `SURFACE-2026-08-14-CSS-CLASS-GUARDS-SATISFIED-BY-A-PSEUDO-CLASS-MODIFIER`:
  deleting the BASE rule while leaving `:disabled` fails the test.

### Deliberate non-decisions

- **`showRecycleButton` is NOT an alias of `showSkillButtons`** even though they currently evaluate
  identically. They answer different questions, and aliasing would couple two affordances whose
  preconditions can diverge.
- **No `onProgress` wiring.** The interface offers it; this caller declines. The CC pane is visible
  and shows the handoff running, so a state setter feeding an unread variable would be surface with
  no reader.
- ⚠️ **The row's CSS comment said "five buttons"** — corrected, with the note that WP2's measured
  ~640px header truncation moves with a sixth button. **Phase 4 re-checks it live** rather than
  assuming the accepted-cost measurement still holds.

## Phase 3 verify-self record (2026-08-18)

⚠️ **INTEGRATION BOUNDARY APPLIES — unlike Phases 1 and 2.** P3.1 modified `Workspace.tsx`, an
existing UI component, and this time the change **is** user-visible: a new button renders in the
header. Condition 2 is met. The rule requires an outcome citing the consuming surface by name, and
outcome 1 does — `[data-testid="workspace-skill-row"]`, the existing row this phase extends. No
back-loop owed on that count.

**Result: 2 PASS, 3 UNVERIFIED, 0 FAIL.**

### ⚠️ Why three outcomes are UNVERIFIED rather than passed — and why that was the honest call

Outcomes 1, 2 and 5 require a live app running **this** code. The only Claudesk process on the
machine is the operator's **production** build (PID 1081, built **2026-08-06** — twelve days older
than this code). It physically cannot contain the Recycle button.

⚠️ **Checking against it would have produced a GUARANTEED FALSE FAIL** — "the button is missing" is
what a correct build from before the feature existed must report. That is the dev-vs-prod
process-name collision in `[[verify-self-dev-vs-prod-process-name-collision]]`, arriving as a
*verification* trap rather than a teardown one. It is also the operator's live working session, so
it was not touched at all.

Launching a dev build was likewise declined: that is **Phase 4's** job, and doing it here would
duplicate Phase 4's whole purpose while adding a heavyweight action to a cheap gate.

**These three are surfaced to verify-human and carried into Phase 4**, which exists to run exactly
this check on `tmp/scratch/scratch-a` (confirmed present, a real git repo, no `.session.md` — WP1
run-1's precondition).

### The two that WERE verifiable both passed, with all four adversarial probes clean

- **A — the arm-5 assertions are individually load-bearing.** Three mutants on `showRecycleButton`'s
  sole return, each diff-confirmed in executable code. ⚠️ **Mutants (a) ungate and (b) hardcode-false
  kill DIFFERENT tests** — which is the property that matters: had both killed the same one, a
  single assertion would be doing all the work and the other would be decorative.
- **B — the render site is DOUBLE-gated.** The button sits inside the `showSkillButtons(...) && (…)`
  block **and** carries its own `showRecycleButton(...)` check. ⚠️ This is the check that matters
  most for this phase: a module can gate perfectly while being rendered outside the gated block —
  this project's recurring defect shape, and one a predicate-only test cannot see.
- **C — the busy latch is ordered correctly:** `setRecycling(true)` fires **synchronously before**
  the await, cleared in `.finally` on both arms. A flag set after the await would not stop a
  double-click, and a recycle runs for tens of seconds.
- **D — the CSS guard is not vacuous:** deleting only the base rule (leaving `:disabled`) fails with
  the "no BASE rule" message, confirming the strengthened `hasBaseRule` predicate is in force rather
  than the weaker `hasRule` that the standing backlog item warns about.

## Test Triage — "Workspace.tsx renders the Recycle button INSIDE the gated skill row"

**Classification:** Obsolete/incorrect test — the test I just wrote is wrong; the production code is
correct. (Not a code regression: nothing pre-existing broke, and the behavior under test was
confirmed working by the operator at verify-human minutes earlier.)

**Confidence:** high — one plausible explanation, stated in one sentence: `ws.indexOf("RECYCLE_TESTID")`
returns **1278**, the position of the `import { … RECYCLE_TESTID … }` statement at the top of the
file, not the render site at ~8500, so the assertion compares the import's offset against the row's
and fails while the button is rendered exactly where intended.

**Evidence:** the failure message reads `expected 1278 to be greater than 8451`; `grep -n
RECYCLE_TESTID Workspace.tsx` shows two occurrences — the import (line ~68) and the JSX
`data-testid={RECYCLE_TESTID}` (line ~520). `indexOf` takes the first.

⚠️ **This is the same family as the Outcome-1 grep defect from Phase 2** — a source-text predicate
that matches a *declaration* when it means a *use*. Third time this shape has appeared in this WP
(the temp-path predicate with no caller, the `grep -c` counting a definition, and now an `indexOf`
finding an import). **A source-text search must anchor on the USE SITE's syntax, not on the bare
identifier.**

**Action:** anchor the search on the JSX attribute form `data-testid={RECYCLE_TESTID}` rather than
the bare identifier, so the import cannot satisfy it. No production code changed. Re-run after the
fix, and mutation-test that the corrected assertion still catches an unrendered button.

## Phase 3 verify-codify record (2026-08-18)

⚠️ **INTEGRATION BOUNDARY — so a consuming-surface test was REQUIRED**, and the rule says plainly
that unit tests on the new module do not satisfy it. `recycleButton.ts`'s predicate can be perfect
while `Workspace.tsx` never calls it.

**Coverage split before writing anything:**
- Leaf 2 (gate OFF ⇒ row absent) — already covered by arm 5's computed-predicate test. **Not
  duplicated.**
- Leaf 1 (six buttons, sixth is Recycle) — only the CSS *class* was referenced anywhere; **nothing
  asserted the render site emits the button.** That was the boundary gap, and it is what got tests.

**Codified: 2 tests** in `skillButtons.test.ts` (extending the file that already owns "what the
header emits" and already reads `Workspace.tsx` source — one list, not a parallel check). Source-read
rather than a rendered DOM per the standing no-jsdom posture; the operator verified the live surface
at verify-human, so this test's job is regression prevention, not re-proving what a human saw.

### ⚠️ The first draft FAILED — and the failure is the third instance of one shape

`ws.indexOf("RECYCLE_TESTID")` returned **1278**: the position of the **import statement**, not the
render site at ~8500. Triaged before any edit (see `## Test Triage` above) — classified as a **test
defect, not a code regression**, high confidence, since the operator had confirmed the live button
minutes earlier.

⚠️ **Same family as Phase 2's Outcome-1 grep defect: a source-text predicate that matches a
DECLARATION when it means a USE.** Three instances in this WP now —
1. a temp-path predicate with no caller (Phase 1),
2. `grep -c` counting a function's definition as a call site (Phase 2),
3. `indexOf` finding an import instead of the JSX (here).

**The rule that generalizes: a source-text search must anchor on the USE SITE's syntax** — here
`data-testid={RECYCLE_TESTID}` — because a declaration and a use are indistinguishable to a
bare-identifier match.

### Mutation results — both directions, landing confirmed

| Mutant | Property | Result |
|---|---|---|
| delete the button from the render site | the orphaned-module shape | **2 killed** ✓ |
| render it OUTSIDE the gated block | ⚠️ the OFF-invariant violation **arm 5 cannot see** | **1 killed** ✓ |

⚠️ **The second mutant is why this test earns its place.** Arm 5 asserts the *predicate* returns
false when the gate is off; it is structurally blind to JSX that never consults the predicate. A
button rendered outside the gated block would leave arm 5 green while the OFF-invariant was broken
on the real surface.

**Second test** pins that Recycle is **not** a `SKILL_BUTTONS` member — a present-tense property of
existing code. ⚠️ Deliberately NOT the removed `DECIDED_ROW_SIZE` guard, which asserted a future
COUNT and was unsatisfiable; if a future edit "tidied" Recycle into the array, its click would be
sent as a literal slash command named `recycle` and CC would print "unknown command".

Suite **2112** (2110 + 2), tsc 0, prettier clean, lint 0 errors.

## Phase 4 build record (2026-08-18) — live verification

Driven against a real dev build (`pnpm tauri:dev`, PID 2753, MCP bridge on 9223) on
`tmp/scratch/scratch-a`. ⚠️ The operator's PROD app (PID 1081) was never attached to, interacted
with, or killed; teardown was **PID-scoped**, never a blanket `pkill`.

### ✅ PROVEN LIVE

1. **Six buttons, `recycle` last, enabled** — read from the real DOM, independently confirming the
   operator's verify-human approval.
2. **The busy latch works** — after the click the button is `disabled` with the tooltip
   *"Recycling — handing off, then restarting this session…"*. ⚠️ The same-tick read showed
   `disabled:false`; React had not committed yet. **A single post-click read would have reported a
   broken latch.**
3. ⚠️ **THE FAILURE ARM, ON A REAL CC REFUSAL — WP1's run-2 shape reproduced live.** CC declined to
   write a handoff for an empty scratch repo (correctly: it refused to invent a pointer a future
   `/session-restore` would act on) and returned a clean `Stop` having written nothing. Recycle
   reported **`no-fresh-write`**, and **the flag stayed `true`, `.session.md` stayed absent, and the
   session was NOT killed.** This is the arm that protects an operator's work, and it is now proven
   against a real refusal rather than a stubbed signal.
4. **P4.2 BOTH ARMS** — positive: the `recycle-session` route cleared the flag through real IPC
   (`-> true`, `scratch-a` gone from the on-disk map, **other two entries untouched**, so the clear
   is targeted not a wipe). Negative: `picker_announce_actions` **omits `scratch-a` entirely** — it
   fires nothing on next open. ⚠️ **With a control:** `scratch-c` appears as `"continue"` in the same
   response, so the command demonstrably *does* report `continue` when a flag exists — `scratch-a`'s
   absence is a measurement, not an empty result.
   ⚠️ **This retires the WBS's standing warning** that `CleanExitRoute::RecycleSession` was a
   caller-less variant. It now has a production caller, driven end-to-end.
5. **P4.3 stale-pointer** — a **17-day**-stale `.session.md` was planted; `stat_file` returned its
   mtime live (`1785589200000`), and the REAL machine driven with that **measured** value rejected
   it (`no-fresh-write`) while a fresh write over it succeeded.

### ⚠️ NOT PROVEN LIVE — the success path end-to-end

**`/session-handoff` never succeeded on `scratch-a`, so the full success chain (fresh write → next
`Stop` → clear → kill → respawn → restore) was not observed in one continuous run.** The cause is
the fixture, not the code: `scratch-a` is an empty scratch repo with no `CLAUDE.md` and no real
session state, and CC **correctly refuses** to fabricate a handoff pointer for it. Making the
handoff succeed means convincing a real LLM that a synthetic repo has genuine work worth
persisting — **fixture engineering, not a test of this feature.**

⚠️ **Stated plainly rather than papered over:** every *component* of the success path is proven
(injection reaches the PTY; CR submits and CC runs a turn; the clear works and is targeted; the
announce arm goes quiet; the machine's ordering is mutation-proven in Phase 1 and driven with a
live-measured mtime in P4.3) — but the **composition** of them in one live run is not. Filed as
`SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE`.

### ⚠️ Instrument findings (P4.4) — three, and two produced misleading reads

- **The xterm DOM is stale/misleading**, exactly as `[[xterm-dom-reads-fake-a-blank-pane]]` warns.
  The prompt line read `❯ ZZPROBE` *after* the CR submitted it. ⚠️ **What settled it was the
  cost/context deltas** ($0.65 → $0.92, ctx 8% → 9%) — a turn demonstrably ran. Reading the terminal
  text alone would have produced a confident wrong verdict that injection was broken.
- **A POSITIVE CONTROL was decisive.** Sending plain `ZZPROBE` (no CR) proved bytes reach the PTY.
  Without it, "CC didn't respond" was equally consistent with a dead PTY, a wrong session id, and a
  working PTY whose output I was misreading — and I had started down the wrong branch.
- **`webview_execute_js` hangs on ANY promise-returning script** (documented). Every `invoke` had to
  be fire-and-stash into `window.__x` and read on a later call. ⚠️ The "timeout" error is NOT a
  failure — the stashed value was always there on the next read.

**Teardown:** fixtures removed, `scratch-a` restored to its original contents (`git status` clean of
scratch residue), dev build killed by PID, prod app verified alive, no orphaned vite.

## Phase 4 verify-self record (2026-08-18) — an EVIDENCE AUDIT, not a re-run

**No integration boundary** — Phase 4 changed no source; it produced evidence. The subagent's job was
therefore to **audit the recorded evidence against the outcomes as written**, and it was explicitly
told to prefer an honest FAIL over a generous PASS.

**Result: 2 PASS, 2 FAIL-cosmetic.** ⚠️ **Both FAILs were flagged BY ME against my own evidence
before the audit ran**, and the independent read confirmed both.

### ⚠️ Outcome 1 — FAIL (cosmetic): the state assertion is TRUE, the precondition was not met

The flag IS cleared, and the auditor re-verified it independently — including **keying-equivalence
rather than assuming it** (`key_for()` → `canonical_key()` = `canonicalize()`, and
`realpath(scratch-a)` yields the same string form as the surviving keys). The clear is targeted, not
a wipe.

But the outcome says *"after a full successful Recycle"*, and that precondition was **not** met:
`/session-handoff` refused, so the flag was cleared by invoking `session_state_mark_clean` **directly
through IPC**. ⚠️ **Intent satisfied ("the recycle-session route clears the flag" — and it now has a
real production caller); literal wording not.**

### ⚠️ Outcome 3 — FAIL (cosmetic): one of two halves, and the stronger half is the one proven

- **Refusal half — SATISFIED, live.** A real CC refusal reproduced WP1's run-2 shape: `no-fresh-write`
  reported, flag left `true`, `.session.md` left absent, **session not killed**. This is the half
  that protects operator work.
- **Stale half — NOT satisfied as worded.** The outcome asserts *"Recycle still succeeds (the fresh
  write overwrites it)"*. What was shown is **rejection** of a live-measured stale mtime by the pure
  machine — not a live Recycle succeeding over a stale pointer. ⚠️ The auditor also noted the half is
  written as a **Browser** outcome while its evidence is a unit-level machine drive.

### Outcome 2 — PASS (not re-runnable, corroborated at code level)

The announce check needs the app running, so it could not be re-run; the auditor judged the recorded
evidence and then **corroborated it in the code**: `announce_actions` resolves the continue arm from
`session_state::read` via `is_unclean_keyed`, and the spawn path's `consume_and_persist` reads the
same map through the same `key_for()`. With `scratch-a` absent from the on-disk map (re-verified),
`consume` returns false and **no `--continue` is appended to argv**. That is a mechanism-level
confirmation, not a visual impression.

### Outcome 4 — PASS (fully re-run by the auditor)

`cargo test` **827 lib** / 0 fail · `pnpm test` **2112** / 165 files / 0 fail · `format:check` exit 0 ·
`cargo clippy --all-targets -- -D warnings` exit 0 (⚠️ `--all-targets`, not `--lib`). Teardown
confirmed: `scratch-a` original-only, no `target/debug/claudesk`, **PID 1081 (prod) alive and never
attached to**.

### ⚠️ Why both FAILs are COSMETIC and not BLOCKING

**No defect is implicated by either.** Every component of the success path is proven, the machine's
ordering is mutation-proven and was driven with a live-measured mtime, and the arm that prevents
data loss is proven against a real refusal. What is missing is **coverage of the composition**, which
is a property of the fixture (an empty scratch repo CC correctly refuses to hand off from) rather
than of the code. It is already filed as
`SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE`.

⚠️ **The transferable point:** these two outcomes were written at plan time in the optimistic voice
("after a full successful Recycle", "Recycle still succeeds") — they presume the happy path will be
reachable in the verification environment. **An outcome that presumes its own precondition cannot
distinguish "verified" from "the precondition never occurred."** This is the same family as Phase 2's
mis-specified grep, now at the level of the *scenario* rather than the *command*.

## Phase 4 verify-codify record (2026-08-18)

**No integration boundary** — Phase 4 changed no source; it produced evidence.

**Coverage audit found exactly one real gap.** The behaviors Phase 4 verified live mostly had
regression coverage already: `from_wire` round-trips every route, an unknown route refuses to clear,
a flagged project announces `continue`. ⚠️ **But nothing joined them.** The chain Recycle's safety
actually depends on —

> wire name → parse → clear → the project stops announcing `continue`

— had **both halves covered and no test spanning them**, so a break anywhere in the middle would
have passed the entire suite. Codified as one Rust test (827 → **828**).

**Why this chain and not something cheaper:** without the clear, every recycle leaves a false
unclean mark and the *next* open fires a spurious `--continue`, resuming a conversation the operator
deliberately handed off. That is the failure the whole clean-exit route exists to prevent.

**Three assertions, each load-bearing:**
1. **Precondition** — the flagged project *does* announce `continue` first. Without it the
   "silenced" assertion could pass vacuously: a project that never announced cannot stop announcing.
2. **The clear silences it** — parsed from the **wire string** `"recycle-session"` rather than the
   enum, so a wire-name drift fails here too.
3. ⚠️ **Targeted, not a wipe** — a sibling project's flag must survive. This mirrors the live
   observation (scratch-c and verify-041 untouched while scratch-a cleared), and without it
   assertion 2 would also pass on a `clear_and_persist` that wiped the whole map.

### ⚠️ A mutation probe that did NOT land — and looked exactly like a coverage gap

The map-wipe mutant **passed** on its first run. That reads as "assertion 3 is decorative" — but the
landing `diff` was **empty**: my regex assumed a `let changed = clear(...)` binding, while the real
body is `if !clear(...) { return true; }`. **The mutation never reached executable code.**

⚠️ **An unlanded mutation and a real hole are indistinguishable from the result alone**
(`[[verify-the-mutation-landed]]`, `[[invalid-probe-and-real-hole-look-identical]]`). Had I trusted
the pass, I would have concluded a working assertion was worthless and deleted it. Re-run against
the **verified** source text, the mutant lands and the test FAILS.

**Both mutants, after verification:** no-op clear → FAILED · map-wipe → FAILED. File pristine.

**Gates:** `cargo test` **828 lib** (+1, exact attribution) · `pnpm test` **2112** · `format:check` 0
· `cargo clippy --all-targets -- -D warnings` **exit 0** · `tsc --noEmit` 0. No test failed at any
point, so the §3b triage path did not apply.

---

## WP3 COMPLETE — all four phases through all four gates

**Shipped:** `recycleMachine.ts` (the completion state machine) · `recycleSession.ts` (the one
funnel + `waitForFreshSessionId`) · `recycleButton.ts` (the presentation contract) · the sixth
affordance in `Workspace.tsx` · `XtermPaneHandle.relaunch()` · CSS · one Rust test.

**Test movement:** frontend 2052 → **2112** (+60) · Rust 827 → **828** (+1).

⚠️ **One accepted gap, operator-approved:** the success path was never composed end-to-end in a
single live run (`SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE`). Every
component is proven and the failure arm — the one that can destroy work — is proven against a **real
CC refusal**. To be closed by dogfooding rather than fixture engineering.
