---
workflow: task
state: close (complete)
completed: 2026-11-07
created: 2026-11-07
docs-only: false
drive_mode: autopilot
---

# Task: Paydown sweep WP13b: WP12 and WP13 review leftovers

**Workflow:** task
**State:** Completed 2026-11-07
**Created:** 2026-11-07

## Problem Statement
Four review findings from WP12 and WP13 remain open: the supervisor readout split across two
half-filled calls (MAJOR), the spawn-intent override set before the pane handle is confirmed, a
guard that lost its ordering half, and three guards that keep panel-era names.

## Context
- Scope: `workflow-system/product/backlog-paydown-wbs.md` → WP13b (inserted at WP13's plan, D5).
- Finding bodies: `workflow-system/state/backlog-quality-findings.md`, under the WP12 and WP13
  sections. Backlog pointers: `backlog.md` → "Code-quality findings — paydown-2026-11-04-wp12…"
  and "…-wp13…".
- MAJOR sites: `src/cc/workspaceSupervisor.ts` (`workspaceSupervisorReadout`, its
  `turnOrigin` option and `turnBadge` field), `src/components/workspace/Workspace.tsx` (the
  `supervisorTurnBadge` local), `src/components/workspace/SupervisorHeaderControl.tsx`.
- Tests on the turn mark: `src/cc/__tests__/workspaceSupervisor.test.ts` ("the TURN mark"),
  `src/state/__tests__/offInvariantGuard.test.ts` (arm 6, "the supervisor TURN mark rides the
  same gated subject"; the `armSubjects` pin at 9), and
  `src/components/workspace/__tests__/supervisorTurnOriginLive.test.tsx` (mutant C4, "with the
  gate OFF: the turn readout still works, but renders no ⚙").
- MINOR sites: `src/components/workspace/useDriveModeApply.ts` (the relaunch step of
  `startApply`); `src/components/picker/__tests__/announceRow.test.ts` ("the announce call is
  made ONCE"); `src/components/settings/__tests__/{uninstallIntercept,workflowInstallWizard,workflowSubstratePresence}.test.ts`.
- Plan-time grep (WP12 rule): no code moves between files here. Guards that pin
  `Workspace.tsx` / `SupervisorHeaderControl.tsx` (`supervisorToggleStyles`, `supervisorWiring`,
  …) were checked; none reads `turnBadge`, `turnOrigin:` or the `supervisorTurnBadge` local.

## Decisions (taken at plan, autopilot; flag if wrong)
- **D1: the MAJOR fix is a separate gated `supervisorTurnBadge(gateEnabled, turnOrigin)`**, not
  lifting the readout into `Workspace`. Lifting it would move `useLatestActivity`,
  `useActivityAlarm` and the hover clock back into the component that hosts the live terminal,
  so every activity record and hover would re-render it, which undoes WP12. The readout drops
  its `turnOrigin` option and `turnBadge` field (the control never filled them). `Workspace`
  makes one call, to the new function, and no longer repeats the toggle's `?? true` collapse.
- **D2: the new function becomes arm 6's THIRD subject, so the pin goes from 9 to 10.** It is a
  separate gated derivation, and arm 4's two derivations are each counted, so counting it is the
  consistent shape. The existing turn-mark `it()` is retitled to an OFF-assertion title
  (`renders no …`) so the self-source count stays equal to `armSubjects`. The live prose sites
  that state "6 arms / 9 subjects" are updated in the same change (`CLAUDE.md` ×2,
  `docs/lessons/closed-cycles-m13-m13-5.md`, `arch/workflow-gate.md`,
  `arch/workflow-supervisor.md`, `arch/profiles.md`, the guard's own header). Archived docs and
  the frozen adjudicator fixture are not touched. Still 6 ARMS: no new surface.
- **D3: the spawn-intent fix sets the override only inside a non-null pane branch.** The optional
  half (restoring a taken override in `XtermPane`'s `cancelled` branch) is NOT done: the
  finding marks it optional, and the extra cross-file state is not worth a path that is not
  known to occur. Stated in the CHANGELOG line.
- **D4: the optional shared picker harness is NOT in this task.** Migrating five files is not
  small. It stays open as its own task (the backlog pointer already says so), and the
  indentation MINOR and the WP12 comment MINOR stay with WP14.

## Work Tree

- [x] T1 MAJOR: add `supervisorTurnBadge(gateEnabled, turnOrigin)` to `workspaceSupervisor.ts` (gate first, returns `null` OFF); remove `turnOrigin` / `turnBadge` from `workspaceSupervisorReadout` and its options type; make `Workspace.tsx` call it with `workflowEnabled && visible`; correct both header comments
- [x] T2 Retarget the tests: `workspaceSupervisor.test.ts` "the TURN mark" block → the new function (absent with no origin, gear + command in the title, still shown after the toggle is OFF, null with the gate OFF); `offInvariantGuard.test.ts` → add `"6 WORKSPACE-TURN-MARK"` to `armSubjects`, pin 10, retitle the turn-mark test to an OFF title with the anti-vacuity half kept, update the header's count prose
- [x] T3 Mutation-prove T1/T2: (a) drop the gate line in `supervisorTurnBadge` → the arm-6 test AND the C4 live test fail; (b) pass `true` as the gate from `Workspace.tsx` → C4 fails; (c) delete the new `armSubjects` entry → the count pin fails
- [x] T4 MINOR: `useDriveModeApply.ts` sets `spawnIntentRef.current = "turn-respawn"` only when `ccPaneRef.current` is non-null, in the same branch as `relaunch()`; correct the comment; add a test for the null-pane case if the live harness can express it, else a call-shape guard, mutation-proven
- [x] T5 MINOR: `announceRow.test.ts` restores the ordering half (`lastIndexOf("picker_announce_actions") < indexOf("pickerItems.map")`, both > -1) beside the row-makes-no-IPC half; fix the comment; mutation-prove by moving the invoke into the row loop
- [x] T6 MINOR: rename `PANEL` / `PANEL_SRC` / `panelSrc` to `BODY` / `BODY_SRC` / `bodySrc` and the one `describe` in the three settings guards; no assertion changes
- [x] T7 Update the "6 arms / 9 subjects" prose sites (D2)
- [x] T8 `pnpm verify:auto` (timeout 207000)

## Act Record (2026-11-07)
- **T1:** `supervisorTurnBadge(gateEnabled, turnOrigin)` added; the readout lost `turnOrigin` /
  `turnBadge`. The module header's "do not add a second derivation" section was rewritten to "one
  derivation per surface" (the turn mark is a different surface). `Workspace` now calls only
  the new function, and `supervisorEnabled ?? true` appears once (the control's prop).
- **T2/T3:** arm 6's third subject `"6 WORKSPACE-TURN-MARK"`, pin 9 → 10. Mutants, each run
  individually, all killed: (a) gate dropped in `supervisorTurnBadge` → 3 fails (unit, arm 6,
  live C4); (b) `Workspace` passes `true` → live C4 fails; (c) subject entry deleted → count pin
  fails.
- **T4:** override set only inside `if (pane)`. New live test "with no pane handle, Apply leaves
  NO override behind…" via a new `mountWorkspace({ detachedPane: true })` option. Killed: the
  pre-fix ordering; a harness mutant that ignores `detachedPane`.
- **T5:** ordering half restored with `lastIndexOf`. Killed: the call moved into
  `pickerItems.map` with the count kept at 1 (the failing assertion was `toBeLessThan`, so the
  count half alone would have passed it, which was the reported hole).
- **T6:** pure renames, 32/32 lines.
- **T7:** count prose updated at `CLAUDE.md` ×2, `closed-cycles-m13-m13-5.md` ×2,
  `arch/workflow-gate.md` ×3, `arch/workflow-supervisor.md` ×3 (incl. §G's turn-mark account),
  `arch/profiles.md` (kept historical, with the new value). Swept: no other live "9 subjects".
- **T8:** `pnpm verify:auto` EXIT 0 in 45 s (291 files / 3750 vitest; 1069 cargo lib tests).
  First run failed `format:check` on `liveWorkspace.tsx`; Prettier applied, comment rewrapped.
- ⚠️ **Staging note for close:** `CLAUDE.md`, `wbs.md` and `backlog.md` carried the operator's
  uncommitted WP9 insert before this task. Commit ONLY this task's `CLAUDE.md` hunks (lines for
  the M15 as-built bullet and the M13/M13.5 bullet), via a filtered `git apply --cached`; leave
  the WP9 hunks and the three older outbox files unstaged.

## Verification Observable

**Observable:** The real `Workspace` component, mounted live under jsdom (the `liveWorkspace`
harness: `createRoot` + `act` + `mockIPC`), renders no turn `⚙` with the gate OFF while the
pane reports a supervisor origin, and a drive-mode Apply with no pane handle leaves
`spawnIntentRef.current === null`. The retargeted guards (arm 6 at 10 subjects, the announce
ordering, the renamed settings guards) pass, and both real entries still link.
**Verification command:** `./node_modules/.bin/vitest run` on `supervisorTurnOriginLive`,
`workspaceDriveModeLive`, `offInvariantGuard`, `workspaceSupervisor`, `announceRow`, the three
settings guards and `appBoot`; then `pnpm check:link`; then `prettier --check .`.
**Expected result:** all files pass with exit 0; `check:link` prints "every entry linked
cleanly (main, pip)"; prettier exits 0. (Each new assertion was also shown to FAIL on its mutant
at act; see the Act Record.)

## Verification Result

**Status:** PASS
**Date:** 2026-11-07
**Evidence:** `Test Files  9 passed (9)` / `Tests  180 passed (180)`, vitest rc=0;
`check:link — every entry linked cleanly (main, pip)`, rc=0; `prettier --check .` rc=0. The full
`pnpm verify:auto` at act: EXIT 0, 291 files / 3750 vitest, 1069 cargo lib tests.
**Notes:** No live dev-app pass: the change moves a gated derivation and a ref write, which the
live harness drives on the real component, and a turn `⚙` in the real app needs a supervisor fire
to appear. Both paths render through the same function the harness exercises.

## Retrospect
- **What changed in our understanding:** the turn mark was folded into the header readout on
  purpose: the module header forbade a second derivation, so it would not be a second arm-6
  subject. WP12's extraction quietly broke that rule's premise, because the two consumers ended
  up in different components with different inputs. The rule is really "one derivation per
  SURFACE", and the header now says so.
- **Assumptions that held:** a separate function was cheaper than lifting the readout (lifting
  would have put the activity subscriptions back into the component that hosts the terminal);
  each fix was small enough to mutation-prove with one mutant; no guard pinned the moved code.
- **Assumptions that were wrong:** none on the code. The count prose had one more stale
  sentence than the grep for "9 subjects" found ("so arms 4, 5 and 6 each own two" in the
  lesson file), caught by a second sweep on the phrasing rather than the number.
- **Approach delta:** the null-pane test needed a harness option (`detachedPane`) rather than a
  call-shape guard; it was mutation-proven on both sides (fix reverted, option ignored). The
  first `verify:auto` failed `format:check` on the harness reflow.

## Closure notice
> **Closure notice:** Paydown WP13b is complete. The supervisor turn mark is now its own gated
> derivation (OFF-invariant arm 6 at 10 subjects), a drive-mode apply can no longer leave a
> stray respawn override behind, and two test-only guard fixes landed. Code in `f5809b4`;
> `pnpm verify:auto` is green. Requester = operator — closure notice for self-record.

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
