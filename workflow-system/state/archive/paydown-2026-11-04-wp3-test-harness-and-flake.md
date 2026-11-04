---
workflow: task
state: close (complete)
completed: 2026-11-04
created: 2026-11-04
docs-only: false  # test code + one shared test-support module; Rust test literals
drive_mode: autopilot
---

# Task: Paydown sweep WP3 — test-harness hygiene and the `mediaTabLive` flake

**Workflow:** task
**State:** Completed 2026-11-04
**Created:** 2026-11-04

## Problem Statement
The test suite has one flaky test, a forked live-mount harness lifecycle, shim blocks copied across
five files, and four guards that can pass vacuously. Fix them test-side only, so every later sweep WP
runs against a gate that is both stable and honest.

## Context
- Plan of record: `workflow-system/product/backlog-paydown-wbs.md` → WP3. **Test-only:** no `src/` runtime module changes. If a fix seems to need one, stop and SURFACE it.
- ⚠️ Read before touching a guard (`backlog-paydown-wbs.md` → "Read before any WP…"):
  - mutation-prove each guard change INDIVIDUALLY, and confirm the mutant landed (`sed -n`, `perl -pi -e`);
  - restore with `cp` and check with `shasum`, never `git checkout`;
  - each closed finding names the mutant that now dies.
- The live harness is `src/components/workspace/__tests__/liveWorkspace.tsx` (228 lines). It has **11 consumers**: 10 `*Live.test.tsx` / `turnNavControls.test.tsx` files plus `src/__tests__/closeWiring.test.tsx`. Every one must stay green after the harness changes.
- Gate: `pnpm verify:auto`, timeout **207000** (`runtimes.md`).
- Memory traps that apply here: `[[react-state-read-needs-a-deferred-frame]]`, `[[jsdom-listener-throw-is-silent-in-vitest]]`, `[[strictmode-remount-deadlocks-an-unreleased-fetch-latch]]`, `[[vite-hmr-stamped-url-is-a-separate-module-instance]]` (n/a here).

## Work Tree

- [x] T1 **The `mediaTabLive` flake** (`SURFACE-2026-10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD`, backlog.md)
  - [x] Measure first: run the file isolated 20× and count failures, so the fix has a baseline to beat. Read `open()` and `settle()`: the inventory's lead is a fixed 2× `settle` (≈30 ms each) racing the lazy `MediaView` chunk import plus the stat round trip on the cold first test.
  - [x] Fix by waiting on the CONDITION, not on time: poll until `media-image` (or the expected element) appears, with a bounded deadline and a clear failure message. Or pre-import the lazy chunk in `beforeAll`. Prefer the poll, because it also covers the stat round trip.
  - [x] **Done = 20 isolated runs and 3 full-suite runs (inside `verify:auto`), all green.** Record both counts.
- [x] T2 **Live-harness lifecycle** (`09-23-QUALITY-LIVE-HARNESS-LIFECYCLE-FORKED-AND-SINGLE-PANE`, MAJOR; `09-23-QUALITY-LIVE-HARNESS-DEAD-OPTIONS`, PARTIAL)
  - [x] Export `bootIpc(handler)` / `teardownIpc()` from `liveWorkspace.tsx`, holding the settle-before-`clearMocks` teardown order in ONE place.
  - [x] Replace the module-level `pane` with a per-workspace registry keyed by `workspaceId` (the stub receives it as a prop). Keep a `pane` accessor for the single-workspace consumers so the 10 existing files need no edit, unless that would hide the bug.
  - [x] Migrate `closeWiring.test.tsx` onto both, and set `IS_REACT_ACT_ENVIRONMENT` explicitly in it (it currently gets it only as a side effect of a `vi.mock` factory import).
  - [x] Dead options: `statusState` now has a caller (`workspaceDriveModeLive`), so keep it. Drop `projectPath` (no caller). Remove the unexported `rerender` closure. Make `mountWorkspace` throw if a previous `root` is still mounted.
  - [x] Proof: a test (or assertion in `closeWiring`) that `pushTurnStart` aimed at workspace B reaches B's pane, not whichever rendered last. Mutation: collapse the registry back to one object, and that assertion must fail.
- [x] T3 **Prompt send wiring** (`09-23-QUALITY-SUBMIT-BUTTON-NOT-DRIVEN`, `09-23-QUALITY-WARN-SPY-LEAKS-ON-FAILURE`)
  - [x] Add the mirror test: click `prompt-send-submit` and assert the bracketed-paste envelope WITH the trailing `\r`. Mutant: wire the Send button to `send("stage-only")`; the new test must fail.
  - [x] Add `afterEach(() => vi.restoreAllMocks())` to `promptSendWiring.test.tsx`. Keep or drop the inline `mockRestore()` calls, but the afterEach is the guarantee.
- [x] T4 **Gate-OFF positive control** (`09-23-QUALITY-GATE-OFF-PROOF-HAS-NO-POSITIVE-CONTROL`)
  - [x] In `turnNavControls.test.tsx`, assert `workspace-skill-row` is PRESENT in a `gate: true` test. Mutant: rename the testid in the component; the positive assertion fails (and the gate-OFF test alone would have stayed green).
- [x] T5 **Shared CM6 jsdom shims** (`11-02-QUALITY-WP6-JSDOM-CM6-SHIMS-COPIED`)
  - [x] Create `src/test-support/cm6JsdomShims.ts` (beside `cssRule.ts`) holding the ResizeObserver / matchMedia / Range-rect block. Replace the 5 copies (`findResultsReplaceLive`, `overlaysOutsideEditorSplitLive`, `syntheticLineActions`, `searchPanelTextAssist`, `fileOpErrorLive`). Diff the 5 copies FIRST: if they differ, the shared module takes the superset, and the differences are noted.
- [x] T6 **Turn-end dedupe reset** (`09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH` item 4)
  - [x] `useSupervisor.test.ts` and `supervisorActivityLive.test.tsx` drive `onTurnEnd` without `resetTurnEnds()`. Add it to each file's `beforeEach`/`afterEach` (there is no vitest `setupFiles`; don't add one for two files).
- [x] T7 **Arch-doc enumeration guard** (`09-28-QUALITY-ARCH-DOC-ENUMERATION-GUARD-USES-A-HAND-KEPT-FILE-LIST`, MAJOR)
  - [x] Build the scanned set from a glob of the non-test `src/state/supervisor/*.ts` (`import.meta.glob(…, { query: "?raw", eager: true })`), keep a non-vacuity floor on the file count, and keep any file outside the dir that the old list named (diff the OLD and NEW candidate sets: `[[widened-selector-must-be-strict-superset]]`).
  - [x] Positive control: a throwaway module in `src/state/supervisor/` that `invoke`s an undocumented command must FAIL the guard. Then delete it.
- [x] T8 **Rust spread literals** (`10-20-QUALITY-WP1-REDUNDANT-NONE-FIELDS-IN-SPREAD-LITERALS`)
  - [x] Drop `background_task_types: None` from the `..ev(...)` spread literals in the `status_broadcaster/mod.rs` tests (3 sites; keep it in full literals).
- [x] T9 **Gate**: `pnpm verify:auto` (timeout 207000), plus T1's run counts

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Act evidence
- **T1 flake:** baseline 18/20 isolated (both failures: `stat_media` not yet called, the cold lazy chunk). After the condition wait: **20/20 isolated**, and **3/3 full-suite** (verify:auto run 1 + two `vitest run`, 3680/3680 each, 0 unhandled).
- **T2 registry:** mutant (`recordFor` returns one shared record) → the new closeWiring test fails; restored by `cp`, shasum matched.
- **T3 Send button:** mutant (Send wired to `send("stage-only")`) → the new mirror test fails; restored.
- **T4 positive control:** mutant (skill-row testid renamed) → the new gate-ON test fails while the gate-OFF test stays green (the hole, shown); restored.
- **T5 shims:** removing the import from `findResultsReplaceLive` fails 4 tests (load-bearing); restored.
- **T7 guard:** the throwaway `zzProbeUndocumented.ts` invoking `zz_undocumented_probe_cmd` fails "every invoked command is NAMED"; probe deleted. The OLD hand-kept set was a strict subset (both files are in the dir).
- **Gate:** `pnpm verify:auto` EXIT=0, 52s.

## Verification Observable

**Observable:** The previously flaky files (`mediaTabLive`, `overlaysOutsideEditorSplitLive`) and the timer-leaking `workspaceDriveModeLive` pass every time with no unhandled error, the full gate is green, and no runtime `src/` module changed.
**Verification command:** 15× `vitest run` over those three files (a run passes only if exit 0 AND no `Unhandled` in its output); `git diff --name-only -- src src-tauri` filtered to non-test paths; `pnpm verify:auto` (from act, EXIT=0).
**Expected result:** 15/15 pass; the non-test filter lists nothing except `status_broadcaster/mod.rs`, whose diff is exactly the 3 removed `background_task_types: None` lines inside its `#[cfg(test)]` module.

## Verification Result

**Status:** PASS
**Date:** 2026-11-04
**Evidence:** `flake files x15: pass=15 fail=0`. Non-test filter: empty; `mod.rs` diff: 3 removed `background_task_types: None` lines (all below the file's `#[cfg(test)]`). verify:auto: `EXIT=0 52s`, `Tests 3680 passed (3680)`; two further full `vitest run`: 3680/3680, `unhandled=0` each.
**Notes:** Baseline before the fix was 18/20 for `mediaTabLive` alone; the guard and wiring changes each carry a killed mutant (see Act evidence).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[NOTE-2026-11-04] T2 — a SECOND flake of the same class surfaced while running the harness consumers: `overlaysOutsideEditorSplitLive` → "⌘P file finder" failed 2 of 3 runs (`.cm-content` not yet rendered; the lazy CM6 chunk under load). Fixed in place with the same bounded condition wait (5/5 after). Same file family as T5, so it stayed in scope.
[NOTE-2026-11-04] T9 — the first full gate caught an UNHANDLED rejection: `Workspace`'s fire-and-forget `RESPAWN_INTENT_HOLD_MS` sleep (started by `workspaceDriveModeLive`'s Apply test) fired after the file's jsdom was gone ("window is not defined" in `setSpawnAsTurnRespawn`). Not caused by this WP (0/6 isolated with either harness; full-suite-load only). Test-side fix: the stub counts `relaunch()`, and `teardownIpc` waits out the hold while still mounted if any pane relaunched. The production cause (the apply chain does not abort on unmount; a queued apply's `waitForIdle` polls for 10 min after the workspace is gone) is routed to sweep WP12, which replaces the sleep anyway.
[NOTE-2026-11-04] T9 — instrument trap: `console.log` from test code prints NOTHING in this repo's vitest runs (no `stdout |` blocks even with `--reporter` default), so a console probe reads as "never called". `process.stderr.write` does print. My first relaunch probe was a false negative for exactly this reason.

## Retrospect
- **What changed in our understanding:** The flake was a CLASS, not one test: every live test that opens a lazy chunk on a fixed 2× settle can lose the race under load (`overlaysOutsideEditorSplitLive` showed it within minutes of looking). Separately, a drive-mode apply's chain does not abort on unmount, so its 400 ms hold and a 10-minute idle poll outlive the workspace. That is a test hazard today and a minor production leak, routed to WP12.
- **Assumptions that held:** Every fix stayed test-side. Each guard change was killable by a single mutant, and the old hand-kept file list was a strict subset of the new directory scan.
- **Assumptions that were wrong:** "A console probe printed nothing" does not mean "never called" in this repo: `console.log` from test code is swallowed, while `process.stderr.write` prints. Prettier had already split a literal my single-line replace targeted, which tsc caught and vitest did not.
- **Approach delta:** Two additions beyond the plan, both the same class as planned work: the second lazy-chunk flake, and the teardown wait for the respawn timer (found by the gate, not the plan).

## Closure notice
Requester = operator — closure notice for self-record. **Paydown WP3 is complete:** the test gate is de-flaked (3/3 full-suite runs, 0 unhandled), the live harness owns its lifecycle once and keys panes per workspace, and four guards gained killed mutants or positive controls. 9 findings resolved and 1 partial, all in CHANGELOG.
