---
workflow: task
state: close (complete)
completed: 2026-11-09
created: 2026-11-09
drive_mode: autopilot
docs-only: false
---

# Task: Paydown 2026-11-08 WP4 — picker live-test harness + the `findResultsReplaceLive` flake

**Workflow:** task
**State:** Completed 2026-11-09
**Created:** 2026-11-09

## Problem Statement
Five picker live tests each copy the createRoot + mockIPC + act + teardown scaffolding, and four test files set input values with a setter taken from the GLOBAL `HTMLInputElement.prototype` — the likely cause of a full-suite flake (`'set value' called on an object that is not a valid instance of HTMLInputElement`). Give the picker one harness and every caller one realm-safe setter, without weakening any migrated test.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` → "WP4".
- Findings: QF `SURFACE-2026-11-06-QUALITY-WP13-PICKER-LIVE-TESTS-HAVE-NO-SHARED-HARNESS` (+ its BL pointer stub `## Code-quality findings — paydown-2026-11-04-wp13-settings-split-and-picker-row (2026-11-06)` — check whether that group holds OTHER bodies before deleting the stub); BL `SURFACE-2026-11-07-FIND-RESULTS-REPLACE-LIVE-FLAKES-UNDER-FULL-SUITE-LOAD`.
- Model harness: `src/components/workspace/__tests__/liveWorkspace.tsx` (IPC lifecycle once: boot / teardown order unmount → settle → clearMocks).
- Picker live tests (5): `src/components/picker/__tests__/{pickerOrderLive,pickerRowCallbacksLive,pickerRowGateLive,projectPickerProfileLive,projectModelCellNewProfileLive}.test.tsx`. Four mount `ProjectPicker` with a projects/announce/profiles fixture; `projectModelCellNewProfileLive` mounts `ProjectModelCell` with its own wizard IPC.
- Global-prototype setter sites (4 files): `findResultsReplaceLive.test.tsx` (`typeInto`), `fileOpErrorLive.test.tsx`, `pickerRowCallbacksLive.test.tsx` (×2 input + 1 select), `projectPickerProfileLive.test.tsx`. `projectModelCellNewProfileLive` already uses `Object.getPrototypeOf(el)`.
- Shared test-support dir exists: `src/test-support/` (`cm6JsdomShims.ts`, `cssRule.ts`, `sourceSlice.ts`).
- Gate rule: the gate moves via `emit(WORKFLOW_FEATURES_ENABLED_EVENT, …)`, never by answering its seed command by name (offInvariantGuard). The harness must keep that.
- Runtime registry: `pnpm verify:auto` timeout 263000.

## Work Tree

- [x] T1 **Reproduce the flake first:** loop the full `vitest run` 5× sequentially (never concurrently); record the hit rate for the `findResultsReplaceLive` TypeError and any other failure
- [x] T2 `src/test-support/setNativeValue.ts`: `setNativeValue(el, value)` — asserts the element is an INPUT / TEXTAREA / SELECT (throws a named error otherwise), takes the `value` setter from `el.ownerDocument.defaultView`'s matching constructor prototype, dispatches `input` (or `change` for SELECT) bubbling. Own unit test, incl. a positive control that a non-input target throws the named error
- [x] T3 Point `findResultsReplaceLive` and `fileOpErrorLive` at it
- [x] T4 `src/components/picker/__tests__/livePicker.tsx`: IPC lifecycle once (`mountLive(node, ipc)` / `teardownLive()` / `settle(ms)`), `mountPicker({projects, announce, profiles, openProjectPaths?, onOpen?, gateOn?, ipc?})` returning `{ host, calls, onOpen }`, `setGate(on)` via the broadcast, re-export `setNativeValue`
- [x] T5 Migrate the five picker live files onto it (behavior-preserving: same fixtures, same assertions, same settle points)
- [x] T6 Before/after proof per migrated file: one representative mutant each (the one the file was written for), confirmed landed, FAILING after migration; restore via cp + shasum
- [x] T7 `grep -rln "HTMLInputElement.prototype\|HTMLSelectElement.prototype" src` → only `setNativeValue.ts` (+ its test) remain; test count per migrated file unchanged
- [x] T8 Re-run the full-vitest loop (same n as T1) post-fix; `pnpm verify:auto`
- [x] T9 Backlog: CHANGELOG lines; delete the WP13 QF body (+ stub if its group empties, else rewrite its count); resolve the flake (clean loop → resolved; never reproduced → resolved as fixed-by-construction with n recorded); mark WP4 done in the WBS

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none — archived
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** The migrated and helper tests pass fresh, and when the real `findResultsReplaceLive` test types into a field that never renders (the flake's failure mode), it fails with a named `waitForElement` error instead of the `'set value' … not a valid instance of HTMLInputElement` TypeError. No global-prototype setter remains outside the helper's own control test.
**Verification command:** `vitest run src/test-support src/components/picker/__tests__ <the 3 workspace/settings live files>`; then mutate `typeInto("project-search-replace", …)` → `"project-search-NEVER"` and run that file (cp + shasum restore); `grep -rln "HTMLInputElement.prototype\|HTMLSelectElement.prototype" src`
**Expected result:** all pass; the probe's failures read `did not appear within 2000 ms` with 0 `not a valid instance`; the grep lists only `setNativeValue.test.ts`.

## Verification Result

**Status:** PASS
**Date:** 2026-11-09
**Evidence:** `Test Files 28 passed (28)` / `Tests 208 passed (208)`; probe `landed=1` → `Tests 5 failed (5)`, 5 × `Error: waitForElement: [data-testid="project-search-NEVER"] did not appear within 2000 ms`, 0 × "not a valid instance", `restored OK`; grep → `src/test-support/__tests__/setNativeValue.test.ts` only. In act: `pnpm verify:auto` EXIT 0 and 10/10 clean post-fix full-suite runs.
**Notes:** A missing field is now waited for, and named if it never comes. The flake's TypeError can no longer arise from a `null` query.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Outcome
- **T1 repro:** 0/5 plain full-suite runs, 0/5 under 4× `yes` CPU load (3817 tests each). Not reproduced.
- **T2 — the cause theory was refuted and replaced by measurement:** the plan assumed a cross-realm setter. Measured: jsdom's global `HTMLInputElement.prototype` setter does NOT throw on an element from another `new JSDOM()` window, but throws the flake's exact message on `null`, `undefined`, a `<textarea>` and a `<div>`. `typeInto` queried once after a fixed `settle()` and cast the result `as HTMLInputElement`, so a `null` (overlay not yet rendered under load) is the likely cause. Built: `setNativeValue` (tag check first with a named error, setter by tag from `el.ownerDocument.defaultView`) and `waitForElement` (10 ms polls inside `act`, named timeout). Each has unit tests with positive controls.
- T3: `findResultsReplaceLive.typeInto` and `fileOpErrorLive` now wait for their field, then call `setNativeValue`.
- T4/T5: `livePicker.tsx` (`mountLive`/`teardownLive`/`settle`/`setGate`/`mountPicker`/`pickerRow`, a `calls` log, `setNativeValue` re-export). All 5 files migrated; counts unchanged (3/6/2/2/5).
- **T6 mutants (each individually, landing grep-confirmed, restored via cp and checked with shasum), all FAIL after migration:** gate → `workflowApplicable={true}` (2/2 fail); order → `const ordered = visible;` (3/3); remove → `onRemove={() => {}}` (1/6); refusal → `if (false && refusal …)` (1/5); new-profile → `if (false) {` (2/2); `collides` → `return false` (fileOpErrorLive 1/3); `scopeFor` stale `line_text` (findResultsReplaceLive 1/5).
- T7: `grep` finds a global-prototype setter only in `setNativeValue.test.ts` (the deliberate positive control). A 7th copy surfaced in `newProfileWizardLive.test.tsx` (`getPrototypeOf(el)`, realm-safe, but `setter?.call` silently no-ops); it is now on `setNativeValue`, 5/5 before and after.
- T8: post-fix 10/10 clean (3825 tests each, 5 under load). `pnpm verify:auto` EXIT 0, 295 files / 3825 vitest, 1114 cargo, 44s.
- T9: CHANGELOG `**Task closed:**` + 2 × `**Backlog resolved:**` (the flake as fixed-by-construction, n=10). The WP13 QF body + its group header + BL stub (the group's last finding) and the flake BL entry are deleted. task-close must NOT re-append.

## Retrospect
- **What changed in our understanding:** the flake's message is NOT evidence of a realm leak. jsdom's input setter throws it for `null` / a wrong element, and was measured NOT to throw cross-window. The real defect is a query-once-after-a-fixed-settle pattern hidden behind an `as HTMLInputElement` cast.
- **Assumptions that held:** a harness migration can be shown behavior-preserving by unchanged per-file counts plus each file's original mutant still failing (7/7).
- **Assumptions that were wrong:** the backlog entry's and the WBS's diagnosis (cross-realm setter). The positive control written to demonstrate it FAILED, and that failure is what redirected the fix to `waitForElement`. Also, the setter idiom had 7 copies, not 4.
- **Approach delta:** added `waitForElement` (not in the plan) and migrated `newProfileWizardLive` (not in the plan). `source-text-guards.md` now names both helpers and the harness.
