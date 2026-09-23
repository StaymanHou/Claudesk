---
drive_mode: autopilot
---

# Feature: Paydown WP3 — whole-app boot smoke test

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-09-23
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` §WP3 (step 0 done in `7c91d30`)

## Problem Statement

Nothing in the gate boots the app. The M13.5 WP3 CRITICAL (a deleted export aborted `main.tsx` before
React mounted, leaving `#root` blank while `tsc` and the suite were green) has no local guard that can
see it across the whole app. Two existing tests are cited as partial cover, and both over-claim:
`turnNavExportContract.test.ts` covers ONE import edge but its header claims app-start blast radius, and
`src/updater/__tests__/moduleGraphBoot.test.ts` says it checks "can the real module graph be imported?"

⚠️ **Plan-time probe (2026-09-23) refuted the WBS's stated mechanism.** Under Vitest, importing a module
that consumes a missing named export **does not throw**. Vitest's module runner turns
`import { x } from "./y"` into a property read, so the binding is silently `undefined`
(probe: `consumer.ts` importing `{ present, missing }` evaluated to `{"out":[1,null]}`, no error).
So the WBS "Done" criterion, *"loads the real app entry graph under jsdom … and fails on a missing-export
`SyntaxError`"*, **cannot be met by any Vitest import or render**, jsdom or not. It is the same central
risk the sweep exists to catch: a guard whose stated coverage exceeds its actual coverage. The updater
test's mutation proof only worked because it asserts `typeof m.progressPercent` **on the exporting
module**. It does not prove that a *consumer's* missing import is caught.

**What does work (probed):** a real ESM linker. Vite's production build (rollup) rejected the mutant
(`newWorkspaceChord` un-exported) with `"newWorkspaceChord" is not exported by
"src/components/workspace/newWorkspaceChord.ts", imported by "src/App.tsx"`, exit 1. A full two-entry
build (`index.html` + `pip.html`) takes **~1.4s**. Separately, the real `App` **mounts under jsdom** with
a minimal `__TAURI_INTERNALS__` stub (2336 chars of DOM; boot IPC observed: `list_projects`,
`workflow_get_features_enabled`, `prune_missing_projects`, …). So the WBS's goal splits into two checks,
each proven against its own failure class:

1. **Link check (Phase 1):** the M13.5 class (ESM binding resolution), via rollup, over BOTH webview
   entries. Added as a `verify:auto` step.
2. **Boot render smoke (Phase 2):** a different class (throws during module evaluation or first mount),
   via the real `main.tsx` under jsdom, with an identity assertion on the rendered DOM.

**[DEVIATION from WBS "Done", disclosed]:** the mechanism for the missing-export class moves from a
jsdom test to a rollup link step, because the jsdom mechanism is measured incapable of it. The WBS's
fallback clause ("do NOT write a header claiming more than the test does") is honored in both phases.
Flag if wrong.

## Known limits (recorded now, so no header over-claims them)

- **Rollup checks static named imports only.** A destructured *dynamic* import
  (`const { X } = await import("./y")`) yields `undefined` rather than failing. `main.tsx`'s probe
  harnesses use this shape (dev-only). Phase 1 must state this in the script header.
- **Bundled vs. unbundled.** The M13.5 failure was in dev (unbundled ESM, WebKit's linker). Rollup is a
  different strict linker over the same esbuild-transformed TS, so type-only imports are erased the
  same way. Dependency (node_modules) CJS interop differs between the two and is out of scope.

## Work Tree

- [x] Phase 1: Link check — rollup rejects a missing export on either webview entry
  **Observable outcomes:**
  - CLI: `pnpm check:link` on the clean tree exits 0, and writes no files. `git status --short` is
    unchanged and no `dist/` mtime changes (`write: false`).
  - CLI (mutant A, main entry): un-export `newWorkspaceChord` in
    `src/components/workspace/newWorkspaceChord.ts` → `pnpm check:link` exits non-zero, and stderr
    contains `"newWorkspaceChord" is not exported by`. The mutant was confirmed landed via `sed -n` on
    the line and restored from a `cp` backup verified by `shasum`.
  - CLI (mutant B, PiP entry): un-export a value that ONLY `src/pip/**` imports → `pnpm check:link` exits
    non-zero naming that binding. This proves the second entry is linked, not just `index.html`.
  - CLI (negative control, type erasure): delete an exported **type** that a consumer imports without the
    `type` keyword. `pnpm check:link` must still pass on the link step, which proves it does not
    false-alarm on erased imports (`tsc` catches that case; the link check is not meant to). If rollup
    DOES fail here, record it as the observed behavior. Do not assume.
  - CLI: `pnpm verify:auto` exits 0 with the new step in place, and the step's output appears in the
    run log between `tsc` and `vitest`.
  - [x] P1.1 `tooling/link-check/linkCheck.mjs`: programmatic `vite.build({ build: { write: false },
    logLevel: "warn" })` using the repo's `vite.config.ts` (both rollup inputs). Exit 1 on any build
    error. The header states exactly what it proves, plus both Known limits above.
    **As built:** `logLevel: "error"` (not `"warn"`), so rollup's chunk-size advisory doesn't add noise
    to every gate run; build errors are caught and printed by the script itself. The eslint Node-globals
    block was added for `tooling/link-check/**/*.mjs`. **Build-time mutation run (verify-self
    re-runs it):** A (`newWorkspaceChord`) rc=1, B (`computePanelSize`, PiP-only; `Pip.tsx` has no
    importer outside `src/pip/`) rc=1, each naming its binding, each restored and shasum-matched.
    **Control deviation:** no real unqualified type import exists (the codebase always writes
    `import type`), so the control was synthetic: `NoSuchType` imported unqualified into `App.tsx`.
    Used only as a type, rc=0 (erased). The same name used as a value, rc=1.
  - [x] P1.2 `package.json`: add a `check:link` script; insert `pnpm check:link` into `verify:auto`
    after `tsc --noEmit` and before `pnpm test`. Update the gate-order line in
    `docs/lessons/verify-auto-gate.md` (plus a short "why this step" entry) and the gate-order line in
    root `CLAUDE.md` → Code style.  **Also:** the WBS central-risk checklist ("any WP that deletes an
    export runs the boot smoke test") now names `check:link`.
  - [x] P1.3 Narrow `src/components/workspace/__tests__/turnNavExportContract.test.ts`'s header to its
    one edge (`turnMarkers` → `Workspace`/`XtermPane`) and point to `check:link` for app-wide
    coverage. Narrow `src/updater/__tests__/moduleGraphBoot.test.ts`'s header: it asserts the
    **exporter's** surface, and under Vitest an import never fails on a consumer's missing binding.
    Keep both tests. Their assertions are real, only their claims are wrong.  **Also:** the updater
    test's describe name and test-1 name ("…without a missing-export error") were renamed to what they
    assert.
  - [x] P1.4 Record the Vitest fact in `docs/lessons/source-text-guards.md` as a new numbered catalogue
    entry: **a Vitest import cannot fail on a missing named export (the module runner reads it as a
    property; the binding is `undefined`)**. Include the probe and the rollup alternative.
    **As built:** entry **19**; 17 and 18 are reserved (see Discoveries).
  - [x] verify-auto  <!-- pnpm verify:auto EXIT=0, 27s; check:link ran between tsc and vitest; 2960 vitest + 920 Rust -->
  - [x] verify-self  <!-- fresh subagent, 5/5 PASS: clean rc=0 + no writes (dist mtimes unchanged, git status identical); A rc=1 naming newWorkspaceChord; B rc=1 naming computePanelSize (PiP-only chain re-confirmed); control type-only rc=0 / value rc=1; verify:auto rc=0 with check:link before vitest. Each mutant restored, shasum matched. -->
  - [x] verify-human  <!-- boundary: modifies the existing `pnpm verify:auto` command, so F11 is forbidden; all 3 leaves approved 2026-09-23 -->
    - [x] P1.verify-human.1 Run `pnpm check:link` (or `pnpm verify:auto`) and paste the output line(s)  <!-- operator asked the agent to run it: `check:link — both webview entries linked cleanly`, exit=0 -->
    - [x] P1.verify-human.2 Approve the WBS deviation: missing-export coverage is a rollup `verify:auto` step, not a jsdom test  <!-- operator: approved -->
    - [x] P1.verify-human.3 (low) Accept reserving catalogue entries 17/18 as a placeholder, with WP3's entry as 19  <!-- operator: approved -->
  - [x] verify-codify  <!-- tooling/link-check/linkCheck.test.ts, 4 tests, drives the REAL script via spawnSync against 3 fixture projects (broken / clean / type-only) + asserts verify:auto step ORDER (index-of). linkCheck.mjs gained an optional [root] arg (same code path; defaults to cwd); success message made neutral ("every entry linked cleanly"). Mutation-proven INDIVIDUALLY, each restored via cp+shasum: M1 catch exits 0 → test 1 red; M2 `root` dropped → test 1 red; M5 always exit 1 → tests 2+3 red; M3 step unwired → test 4 red; M4 step moved after `pnpm test` → test 4 red. Gate: verify:auto EXIT=0, 26s, 219 files / 2964 tests, Rust 920. -->

- [x] Phase 2: Boot render smoke — the real `main.tsx` mounts the picker under jsdom
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The WBS's render half, confirmed at P1 verify-human.2.
  - Requirements unchanged: yes. Phase 1 took the missing-export class, and this phase covers evaluation- and mount-time throws.
  - Solution still feasible: yes. The plan-time probe mounted the real `App` under jsdom.
  - No superior alternative discovered: yes. The official `@tauri-apps/api/mocks` (`mockIPC` + `shouldMockEvents`) replaces the hand-rolled stub.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/__tests__/appBoot.test.tsx` passes. The test creates
    `<div id="root">`, installs a `__TAURI_INTERNALS__` stub, imports the **real `src/main.tsx`**
    (not `App` directly, so the entry's own code runs), and asserts an **identity** property of the
    mounted DOM: a specific `ProjectPicker` element that exists only when the picker rendered. A
    non-empty `innerHTML` alone is not enough (source-text-guards entry 15).
  - CLI: the stub records the boot IPC command names, and the test asserts that `list_projects` is among
    them. This is a positive control that the boot effects actually ran, not merely that the markup
    rendered.
  - CLI (mutant C, mount-time throw): make a component on the boot path throw during render → the test
    goes red. Mutant confirmed landed, then restored via `cp` + `shasum`.
  - CLI (mutant D, module-evaluation throw): a top-level `throw` in a module on `main.tsx`'s static
    import graph → the test goes red. Each mutant runs INDIVIDUALLY, and each red is attributed to its
    own assertion.
  - CLI: the PiP entry (`src/pip/main.tsx`, `#pip-root`) gets the same boot + identity assertion **if it
    mounts under the same stub cheaply**. If not, record it as a Defer in the test header and in the
    WBS closure note. Never claim it.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 `src/__tests__/appBoot.test.tsx` (`// @vitest-environment jsdom`): Tauri stub
    (`invoke` recording command names, `transformCallback`, `unregisterCallback`, `metadata`,
    `__TAURI_EVENT_PLUGIN_INTERNALS__`), `#root` fixture, dynamic `import("../main")`, flush, then
    assert identity + IPC. The header states which class it catches (evaluation and mount throws) and
    which it does NOT (missing named exports: see `check:link`).
    **As built:** it uses the official `mockIPC(cb, { shouldMockEvents: true })` + `mockWindows("main")`
    in place of a hand-rolled stub. The identity check is `.picker-recent-name` === the project seeded
    through `list_projects`, so it proves the IPC→DOM path, not just markup. Each test resets a
    window-`error` capture (without that, mutant C's error leaked into the PiP test).
    **Build-time mutants (each individual, restored cp+shasum):** C throw in `ProjectPicker` body → main
    red (after the per-test reset, main only); D top-level throw in `state/cleanExit.ts` → main red;
    D2 top-level throw in `pip/pipPanelSize.ts` → PiP red; E `setRecents([])` → main red (the identity
    assertion, which a length check would miss); F `main.tsx` no longer renders `<App/>` → main red.
  - [x] P2.2 PiP entry boot, same shape, or a recorded Defer.  **As built:** not deferred. It is the second test in the same file: `#pip-root`, identity `pip-empty` + `pip-root`, IPC `pip_get_layout`.
  - [x] verify-auto  <!-- pnpm verify:auto EXIT=0, 28s; 220 files / 2966 tests (+2 appBoot); Rust 920; tsc covers appBoot.test.tsx (under src/); mutated sources show no diff -->
  - [x] verify-self  <!-- fresh subagent, 6/6 PASS: baseline 2/2; identity mutant setRecents([]) → main only red; C (ProjectPicker body throw) → main only red; D (cleanExit.ts eval throw) → main only red; D2 (pipPanelSize.ts eval throw) → PiP only red; PiP claimed, not deferred; verify:auto rc=0 (220/2966, Rust green). All restores shasum-matched; git status identical. -->
  - [x] verify-human  <!-- AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (Phase 2 adds only src/__tests__/appBoot.test.tsx; no production source modified), verify-self 6/6 PASS -->
  - [x] verify-codify  <!-- no new tests: the phase deliverable IS appBoot.test.tsx, mutation-proven by build + a fresh verify-self (C, D, D2, identity, F each red only on its own test). Full gate: the verify-self runner's post-restore verify:auto EXIT=0 on this exact tree (220/2966). Recorded gap: `expect(uncaught).toEqual([])` is a secondary signal that has NOT been proven to fail by itself (under mutant C it filled, but waitFor failed first); the header does not claim it. -->

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality against the ship commit
- **Blocked:** none
- **Unvisited:** ship → finalize (WBS §WP3 closure note, backlog
  `SURFACE-2026-08-25-…` local-half status update)
- **Open discoveries:** 2 (see Discoveries: the entries-17/18 SURFACE; the turnNav finding to resolve at finalize)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-09-23] Phase 1 / P1.4 — `CLAUDE.md` cites source-text-guards entries 17 and 18, which were never written into the lesson file (added at `1e3a09d`). Numbers reserved; WP3's entry is 19. → `SURFACE-2026-09-23-SOURCE-TEXT-GUARDS-ENTRIES-17-18-CITED-BUT-ABSENT` (low).
- [SURFACED-2026-09-23] Phase 1 — `backlog-quality-findings.md`'s turnNavExportContract finding expects a boot smoke test to *subsume* that guard. A Vitest boot cannot (entry 19); `check:link` does subsume tests 1–3 of it. Resolve that finding at finalize, recording that `check:link` is the subsuming gate. The guard is kept, because its test 4 (the deleted API is exported by nobody) is separate semantics.
