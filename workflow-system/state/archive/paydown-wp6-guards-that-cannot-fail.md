---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false  # changes test guards, autoResumeFire.ts, handleDocLinkClick.ts + DocsPanel.tsx, status_broadcaster, window_state, linkCheck.mjs, tsconfig
drive_mode: autopilot
---

# Task: Paydown WP6 — guards and tests that cannot fail

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` §WP6

## Problem Statement
A set of guards and tests across the TS suite, the Rust suite and the link-check tooling either cannot fail in the scenario they name, or can fail for the wrong reason. Close each hole with a change whose mutant is proven to die, and record the evidence where closure is a deletion or has no mutant.

## Context
- **Finding bodies:** `backlog-quality-findings.md` has these headings: `# paydown-wp3-boot-smoke-test` (the 3 WP3 residues), `# fa-wp2-…` (A1), `# supervisor-hotfix` (C4), `# m15-wp2-…` (F1, F2), `# m15-wp1-…` (G2, G4, G6), `# window-geometry-persistence` (J3.1–J3.3 = `…-WP1-MINOR-SET` items 1–3), `# m13-wp3-recycle-session` (L1), `# wp2-background-work-status-states` (AE1), `# m14-wp2-…` (AF1).
- **Backlog SURFACEs:**
  - Row 1 = `SURFACE-2026-09-21-UNCHUNKED-BASE64-ENCODER-OVERFLOWS-ON-LARGE-INPUT`.
  - Row 7 = `SURFACE-2026-09-14-DOCSLINKHANDLING-FLAKE-EXITS-NONZERO-WITH-ZERO-FAILURES`.
  - Row 17 = `SURFACE-2026-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE` (local half only).
  - Row 28 = `SURFACE-2026-08-21-NOTIFICATION-TYPE-FALLBACK-IS-WRONG-FOR-COMPLETION-TYPES`.
  - Row 29 = `SURFACE-2026-08-21-HOOK-SOCKET-SHUTDOWN-RACE-IS-FLAKY`.
  - The `RecentProject` regex = the m12-wp1 stub's item (2); it lives only in `backlog.md`.
- ⚠️ **Mutation discipline (the WBS's central risk):**
  - Prove every guard change with its own mutant: `cp` backup → `perl -pi -e` → `sed -n`/`grep -c` to confirm the mutant landed in executable code → run the target (it must FAIL) → restore via `cp` → `shasum` match.
  - **Never use `git checkout`.** Use `| xargs` for bulk loops, because zsh does not word-split.
  - Where marked **(hole confirmed)**, run the same mutant against the HEAD guard as well, and it must PASS there.
  - Each closed ID names the mutant that now dies. Where closure is a deletion, or the fix leaves only an equivalent mutant, say so explicitly rather than claiming a kill.
- ⚠️ **Row 1 deletes a module-private function**, not an export. Even so, `check:link` (inside `verify:auto`) plus `appBoot` are the boot proof. Relevant high backlog entry: `…-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`.
- **Plan-time measurements** (so they are not re-derived):
  - **Row 1:** `encodeUtf8Base64` is already a per-byte `+=` loop (`TextEncoder` → `binary += fromCharCode(b)` → `btoa`), so it does **not** overflow. `cc/bridge`'s `encodeBase64` does `TextEncoder` → chunked (`0x8000`) `fromCharCode(...slice)` → `btoa`. Both produce the same byte string for every input, so the swap is byte-neutral. The `stagedPayload` 200k test **does** guard something real: the **chunking inside `encodeBase64`**. De-chunking it to one spread would throw at ~200k. It just doesn't guard the scenario its comment names.
  - **L1:** `recycleSession.ts` `awaitCompletion` has the arms at `listen(fs-change…).then(…)` and `listen(WORKSPACE_STATUS_EVENT…).then(…)`. The existing late-disposal test defers only the fs unlisten. The status handler is registered synchronously by the mock, so the test can emit `Stop` through it while the status unlisten promise is still pending.
  - **F1:** the derived literals are `232` (Funnel = 58 × 4), `44` (workflowMachine = 111 − 67), `444`/`320`/`124` (Lookup = 111×4 / 80×4 / 31×4), and the degenerate-guard `111` in UpstreamContract (a duplicate of the canonical pin in `workflowMachine.test.ts`). The independent literals **stay**: 111, 58, 67, 80, 31, 49 and the per-workflow split.
  - **F2:** `wiresGraphToPolicy`/`importsMachine` are declared at module scope around line 502. The live guard ("wires graph to policy in exactly ONE module") inlines the wiring regex, and `importersOfMachine()` inlines the importer regex.
  - **G2:** `_meta.threshold` = `"0.80 wrong-fire recall AND 0.80 real-breaks-preserved (a CHOSEN bar, not measured)"`, which parses cleanly. Both arms have 29 positives today, so deriving haiku's bar from its own positives is an **equivalent mutant on this data** (`[[behavioral-test-can-still-be-an-equivalent-mutant]]`). That half closes by construction plus a new per-arm assertion, not by a kill.
  - **Row 7 root cause:** two tests leave a 20 × 25ms = 500ms poller pending past their own end:
    - "switches the doc…" (`containerRef.current` is null, so it polls to exhaustion);
    - "gives up quietly…" (the heading never appears).
    If the suite tears jsdom down inside that window, the callback throws after teardown. That produces an `Errors 1` exit with 0 failures.
  - **Row 17:** the drift test already sits in `describe.skipIf(!upstreamAvailable())`. The expected outcome is **no-change-needed**, to be proven, not assumed.
  - **Row 28:** there is one documented type Claudesk does not classify, `elicitation_url_dialog`. The informational set is a `matches!` arm today, so it is not enumerable.
  - **J3:** `tray/commands.rs` has a private `MAIN_WINDOW_LABEL`, and `lib.rs`'s `WindowEvent` scoping also spells `"main"`.
  - **`RecentProject`:** the interface has no nested braces today. The lazy regex at the "`default_model` is on the wire type" test is the one that can over-reach; the two `\{[\s\S]*?\}` forms under-reach on a nested brace. `iface ?? ""` feeding `not.toMatch` passes on an empty match.
  - **Link check:** the Vite `build()` return is a RollupOutput (or an array of them). Entry chunks carry `isEntry` + `name`. The repo config names `main` + `pip`. Fixture roots have no `vite.config`, so their single entry is named `index`.
  - **tsconfig:** `include: ["src"]`. Tests under `src` already import `node:fs`, so `@types/node` resolves, and adding `tooling/link-check` to `include` should type-check.

### Decisions taken at the autopilot default (disclosed — flag if wrong)
- **Row 7 → an `AbortSignal` in `DocLinkClickDeps`, rather than a returned `cancel()`.** The poll checks `signal.aborted` and clears its pending timeout on `abort`. `DocsPanel` holds one `AbortController` for the panel's lifetime and aborts it in an unmount cleanup. The tests abort in `afterEach`. This matches `recycleSession`'s existing `AbortSignal` idiom, and the handler's call shape doesn't change.
- **Row 28 → a partial resolution.** The entry's *suggested action* (a periodic `SELECT DISTINCT` corpus check) is operational, not code, so the SURFACE is **rewritten** down to that remainder. It is not deleted. The arch doc's Notification-gating bullet gains the sixth type.
- **J3.1 → promote a `pub(crate) const MAIN_WINDOW_LABEL`** (in `lib.rs`), used by `tray/commands.rs`, `lib.rs`'s focus scoping and the `window_state` test.
- **J3.2 → replace the blanket `!code.contains('"')`** with a positive assertion that `register()` contains exactly one `.with_denylist(` and that its argument is `denylist()`. `.with_filename("…")` would then be allowed.
- **LINKCHECK-TEST-OUTSIDE-TSC-INCLUDE → add `tooling/link-check` to `tsconfig.json` `include`** rather than renaming the file to `.mjs`, so the test keeps real type-checking. Fallback, if node-global typing fails there: rename to `.test.mjs`.
- **appBoot `uncaught` → the WBS's either/or is decided by the probe at act time.** Keep the assertion only if a positive control turns it red **alone**; otherwise delete it and record which instrument does catch that throw.
- **G6 also takes its sibling nit (a):** `Record_` → `FixtureRecord`, so the whole `…-TYPE-ALIAS-AND-ACCESS-STYLE-NITS` entry resolves, not half of it.
- **Staying with the R2 comment-convention pass, untouched here:** G5, L2, J1, J2, and the density halves of the stubs.

## Work Tree

### Group A — TS test guards (no production change)
- [x] T1 **L1 — `WORKSPACE_STATUS` late-disposal arm** (`recycleSession.test.ts`)
  - Add a sibling test that defers the **status** unlisten, resolves fs immediately, emits `Stop` through the registered status handler, awaits settlement, asserts the precondition (count 1), releases, and asserts count 2.
  - Correct the existing test's comment, which claims "both".
  - Mutant **M-L1**: the status arm alone (the second `settled ? un() : unlisteners.push(un)`) → bare `unlisteners.push(un)`. The new test must fail. Run it against HEAD too: it must pass there **(hole confirmed)**.
- [x] T2 **C4 — make `CLASSES` load-bearing** (`supervisorToggleStyles.test.ts`)
  - Drive direction 1 from `CLASSES` (class → the selector that must exist).
  - Add the reverse: every `workspace-header-supervisor[\w-]*` token that `Workspace.tsx` emits must be in `CLASSES`.
  - Drop the bare `toHaveLength(3)`.
  - Mutant **M-C4**: emit an extra `workspace-header-supervisor-extra` class in `Workspace.tsx`. The new guard must fail; the old one passes **(hole confirmed)**.
- [x] T3 **F1 — derive the arithmetic counts**
  - `232` → `POLICY_ROWS.length * modes.length`.
  - Drop the redundant `44` line.
  - `444`/`320`/`124` → `EDGES.length * DRIVE_MODES.length`, `80 * …` and `31 * …`, with 80/31 held as named constants shared with their own tests.
  - UpstreamContract's degenerate `111` → `toBeGreaterThan(0)`, with a pointer to the canonical pin.
  - Closure mutant **M-F1**: drop one `POLICY_ROWS` entry. Exactly the `58` pin (plus genuinely row-dependent assertions) fails; the `232` line no longer fails as a duplicate. Count the failing assertions before and after.
- [x] T4 **F2 — one source for the funnel predicates** (`workflowMachineFunnel.test.ts`)
  - Hoist `wiresGraphToPolicy`/`importsMachine` above their first use.
  - The live guard and `importersOfMachine()` call them; delete the inline regex copies.
  - Keep the reconciliation test, retargeted to whatever it still proves.
  - Mutant **M-F2**: break the single wiring predicate (`/edges"` → `/edgesX"`). The live guard AND the discrimination block must both fail. On HEAD, the same edit to the discrimination copy alone leaves the live guard green **(drift channel confirmed)**.
- [x] T5 **G2 + G4 + G6** (`m15SupervisorFixture.test.ts`)
  - **G2:**
    - Parse `BAR` from `q2._meta.threshold`, asserting that both numbers parse and are equal, since the prose names two.
    - `scoreArm` uses `BAR`.
    - The margin test derives `minTpForBar` **per arm** from each arm's own `tp + fn`, and adds `expect(haiku.tp + haiku.fn).toBe(29)`.
    - Mutant **M-G2**: make the parse yield 0.85. Sonnet's verdict flips and the test fails, which proves the verdict now reads the artifact's bar.
    - The per-arm positives half = an equivalent mutant on this data; disclose it as such.
  - **G4:** delete "labels every record", "never marks a non-FIRE record…" and the `groundTruth + ruleOnly === fire.length` line. Keep the two `> 0` checks. Closure = deletion; record the test-count delta.
  - **G6:** `const { sonnet, haiku } = q2.arms` for the two `[a, b]` destructures; rename `Record_` → `FixtureRecord`. A refactor with no mutant; the test stays green.
- [x] T6 **AF1 — positive anchor** (`updaterWiring.test.ts`, "no longer wires the deleted WP1-fallback…")
  - Add `expect(appTsx).toContain("updateConfirmSpec")` in the same test.
  - Mutant **M-AF1**: `appTsx` read → `""`, run that test by name. It must fail; the old one passes **(hole confirmed)**.
- [x] T7 **AE1 — self-explaining CSS guard failures** (`workspaceStatus.test.ts`, both CSS guards)
  - The failure messages name the one shape the regex reads (flat `.x { background-color: … }`) and the shapes it cannot (nested rules, `var(--…)`, shorthand `background:`).
  - Mutant **M-AE1**: rewrite one `pip.css` dot rule to shorthand `background:`. The guard fails, and its message now names shorthand. Capture the message.
- [x] T8 **A1 — index-loop terminator count** (`stagedPayload.test.ts`, "strips a literal ESC[201~…")
  - Replace the `.filter` with the index-loop form used in the verify-codify block.
  - Mutant **M-A1**: change the strip in `stagedPayload` to a no-op. The count (and the `toEqual`) must fail.
- [x] T9 **`RecentProject` — brace-counted slice** (`listProjectsConsumers.test.ts`)
  - An `interfaceBody(src, name)` helper that counts braces is used by all three sites.
  - The smuggle test asserts that the body is non-empty before its `not.toMatch`.
  - Mutant **M-RP**: move `default_model?` into a new interface declared right after `RecentProject` in `ProjectPicker.tsx`. The new guard must fail; the old one passes **(hole confirmed)**.
- [x] T10 **Row 17 — verify the skip is visible**
  - Put a throwaway spec beside `workflowMachineFunnel.test.ts` that copies the `_ref/`-gated block with its condition forced absent. Vitest's summary must count it as **skipped**, not passed. Delete the spec afterwards.
  - If it is visible: **no-change-needed**, with the runner output as evidence. Otherwise: make it visible.

### Group B — production code + Rust + tooling
- [x] T11 **Row 1 — dedup the encoder**
  - `autoResumeFire.ts` imports `encodeBase64` from `cc/bridge`. Delete `encodeUtf8Base64` and its doc block.
  - The byte pins in `autoResumeFire.test.ts` must stay green unchanged; that is the byte-neutrality proof.
  - Rewrite the `stagedPayload` 200k test's name and comment so they claim what it guards: the chunking inside `encodeBase64`.
  - Mutant **M-R1**: de-chunk `encodeBase64` (a single `fromCharCode(...bytes)`). The 200k test must fail with a RangeError.
  - `grep -rn encodeUtf8Base64` must come back empty.
- [x] T12 **Row 7 — cancellable fragment poll**
  - Add `signal?: AbortSignal` to `DocLinkClickDeps`. `scrollToFragmentWhenPresent` stops on `aborted` and clears its timeout on `abort`.
  - `DocsPanel` gets a lifetime `AbortController` (a ref), aborted in its unmount cleanup, with the signal passed in.
  - Tests: `docsLinkHandling.test.ts` aborts every handler's controller in `afterEach`, plus a new test: click → abort → the heading appears → wait past several poll intervals → **no scroll**.
  - Mutant **M-R7**: delete the `aborted` check. The new test must fail.
  - ⚠️ `docsPanelWiring.test.ts` asserts on `DocsPanel.tsx` source (`makeDocLinkClickHandler({`); run it.
- [x] T13 **Row 28 — classify `elicitation_url_dialog` + pin the vocabulary** (`status_broadcaster/mod.rs`)
  - Add it to `INPUT_NEEDED_NOTIFICATION_TYPES`.
  - Turn the informational `matches!` into `const INFORMATIONAL_NOTIFICATION_TYPES: [&str; 5]` + `contains`.
  - New test: the two lists are disjoint, and their union equals the documented 9-type set, spelled once in the test with its source (the official hooks doc).
  - Update `arch/status-channel-and-surfaces.md`'s gating bullet.
  - Mutant **M-R28**: remove `elicitation_url_dialog` from the list. The vocabulary test must fail while every behavioral test stays green, which is the reason for the membership form.
- [x] T14 **Row 29 — best-effort `shutdown`** (`hook_socket` `loop_exits_cleanly_when_receiver_is_dropped` only)
  - `let _ = client.shutdown(..)`, with a one-line reason.
  - Mutant **M-R29**: make `accept_loop` panic on the dropped-receiver send path. `handle.join().expect(…)` must fail, which proves join is still the assertion.
- [x] T15 **J3.1–J3.3** (`window_state/mod.rs`, `tray/commands.rs`, `lib.rs`)
  - **J3.3:** `denylist() -> &'static [&'static str]`; the call becomes `.with_denylist(denylist())`.
  - **J3.1:** a shared `pub(crate) const MAIN_WINDOW_LABEL`.
  - **J3.2:** swap `!code.contains('"')` for the positive `.with_denylist(denylist())` exactly-once assertion.
  - Mutants:
    - **M-J3a:** add `.with_filename("x.json")` to `register()`. The NEW guard passes; the old one fails. That shows the over-breadth is gone.
    - **M-J3b:** `.with_denylist(&["pip"])` must fail.
    - **M-J3c:** a second `.with_denylist(&["main"])` must fail.
- [x] T16 **Link check — pin both entries + codify mutant B** (`tooling/link-check/`)
  - `linkCheck.mjs` collects the entry-chunk names from the build output and exits 1 naming any missing required entry. The required set defaults to `main,pip`, overridable by a `--entries` arg for fixtures.
  - New fixtures:
    - `two-entry-broken`: a `vite.config.mjs` with `main` + `pip`, where only `pip` imports a missing export (mutant B's shape). It must exit 1.
    - `two-entry-narrowed`: config input `main` only, run with the default required set. It must exit 1 naming `pip`.
  - Existing fixtures pass `--entries index`.
  - Restore the two narrowed sentences (the `linkCheck.mjs` header and `verify-auto-gate.md`) to a claim.
  - Mutant **M-LC**: narrow the repo `vite.config.ts` `input` to `main`. `pnpm check:link` must exit 1.
- [x] T17 **`linkCheck.test.ts` into tsc** — add `tooling/link-check` to `tsconfig.json` `include`
  - Mutant **M-TS**: a deliberate type error in the file. `./node_modules/.bin/tsc --noEmit` must fail; on HEAD it passes **(hole confirmed)**.
- [x] T18 **appBoot `uncaught` — positive control, then keep or delete**
  - Temporarily add a `setTimeout(() => { throw … }, 0)` on `main.tsx`'s boot path, after the render. The picker test should fail on `expect(uncaught).toEqual([])` **alone**, with every other assertion passing.
  - If yes: keep it, and note the control in a comment. If no: delete both assertions and record which instrument catches that throw.
  - Restore `main.tsx` (`cp` + `shasum`).

### Close-out
- [x] T19 **Gate:** `pnpm verify:auto` (timeout 216000) — ⚠️ it deletes a function, so `check:link` is the boot proof. Run it at least twice to watch for the Row 7 `Errors 1` shape.
- [x] T20 **Bookkeeping**
  - Delete the resolved finding bodies: L1, C4, F1, F2, G2, G4, G6, AF1, AE1, J3 items 1–3 (the MINOR-SET entry itself if nothing remains), A1, and the 3 WP3 residues.
  - Rewrite or delete their `backlog.md` stubs to match what remains.
  - Delete the Row 1, Row 7 and Row 29 SURFACEs. Rewrite Row 28 to its operational remainder. Row 17: add evidence if the result is no-change-needed. Remove item (2) from the m12-wp1 stub.
  - Add one `**Backlog resolved:**` CHANGELOG line per ID, each naming its mutant, and a `## Closure evidence` table in this WIP.
  - Update the WBS WP6 status.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** task-close
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Verification Observable

**Observable:** the project's full gate, run on the final tree (including the bookkeeping-time comment edits in `status_broadcaster/commands.rs`), exits 0 with every test green and no post-run `Errors` line (the Row 7 flake shape), `check:link` reports that it built both `main` and `pip`, and no throwaway `zz*` probe file remains in the tree.
**Verification command:** `pnpm verify:auto` (timeout 216000), then `find src tooling -name 'zz*'`
**Expected result:** EXIT=0; `Tests  2973 passed`; Rust `test result: ok` with 0 failed; `check:link — every entry linked cleanly (main, pip)`; no `Errors  ` line; the `find` prints nothing.

## Verification Result

**Status:** PASS
**Date:** 2026-09-23
**Evidence:** `pnpm verify:auto` → `EXIT=0  31s`; `check:link — every entry linked cleanly (main, pip)`; ` Test Files  220 passed (220)` / `      Tests  2973 passed (2973)`; Rust `test result: ok. 901 passed; 0 failed`, `ok. 19 passed`, `ok. 1 passed`; no `Errors  ` line; lint `✖ 1 problem (0 errors, 1 warning)` (the known `XtermPane.tsx:895` exhaustive-deps warning, unchanged). `find src tooling -name 'zz*'` printed nothing.
**Notes:** third clean full-gate run on this tree (after 35s and 25s at T19), and the first on the final tree including the bookkeeping edits. Per-ID mutation evidence is in `## Closure evidence`.

## Retrospect
- **What changed in our understanding:**
  - **appBoot's `uncaught` assertion is real coverage, but not for the class the finding guessed.** A `setTimeout` throw under Vitest's jsdom env runs on Node's timers and surfaces only as Vitest's own "Unhandled Errors". A throw inside a jsdom DOM *listener* goes to a window `error` event that Vitest does NOT report, so the assertion is the only instrument that sees it.
  - **The Row 7 flake has a concrete mechanism:** two tests each left a 500ms poll pending past their own end. It is now bounded by an `AbortSignal`.
  - **The link check had never looked at its own output.** A narrowed `rollupOptions.input` built "cleanly" because the script trusted the build to have covered everything.
- **Assumptions that held:**
  - Row 17 needed no change.
  - Row 1's premise was false: the per-byte loop never overflowed, and the swap was byte-neutral.
  - G2's per-arm half is an equivalent mutant on this data.
  - Every HEAD guard marked "(hole confirmed)" really did pass its mutant: 9 of 9 where it could be re-run.
- **Assumptions that were wrong:**
  - The plan said a 0.85 bar would flip sonnet's verdict. It doesn't (25/29 = 0.862), so a 0.90 mutant was needed to show the verdict follows the artifact.
  - The first Row 7 draft had an untested defensive branch (the caller's pre-aborted check). Running its mutant exposed it, and it got a test.
  - A two-mechanism cancel (an entry check plus clear-on-abort) would have masked each other's mutants, so the design went down to one mechanism.
  - Including `tooling/link-check` wholesale in tsc tripped the deliberately type-broken fixture, so only the test file is included.
- **Approach delta:**
  - Beyond the plan: `DocsPanel`'s abort wiring gained a source guard. The Row 29 SURFACE ID cited in three `status_broadcaster/commands.rs` comments was replaced with self-contained wording, because deleting the entry would have left those citations dangling. The `stagedPayload.ts` doc carried the refuted "private copy spreads in one call" claim and was corrected with the test.
  - A perl `alarm` watchdog on the hang mutant orphaned its test binary. It was found and killed by PID.

## Closure evidence — the mutant that now dies, per ID
Each mutant was applied on its own via a `cp` backup → `perl -0pi -e` → a landed check (`grep -cF` on the mutated text, plus the diff) → the target run → a `cp` restore with a `shasum` match (scratchpad `mut.sh`).
- **(hole confirmed)** means the same mutant PASSED the HEAD guard. It was run against the HEAD test file (a throwaway `zz*` copy, deleted afterwards) or the HEAD module (a whole-file swap, restored by `shasum`).
- Gate: `pnpm verify:auto` EXIT 0 twice (35s, 25s): 220 files / 2973 tests, Rust 901 + 19 + 1, `check:link` built `main, pip`, no `Errors` line.

| ID | Mutant | HEAD guard | New guard |
|---|---|---|---|
| L1 | M-L1: `recycleSession.ts` status arm alone `(un) => (settled ? un() : …)` → `(un) => unlisteners.push(un)` | PASSED 39/39 (hole confirmed) | FAILS — only the new "LATE-arriving WORKSPACE_STATUS subscription" test (1 failed / 39 passed) |
| C4 | M-C4: `Workspace.tsx` suppressed span also emits `workspace-header-supervisor-extra` (no CLASSES entry, no CSS) | PASSED 17/17 (hole confirmed) | FAILS — "every toggle class the component emits is listed in CLASSES" (set equality) |
| C4 | M-C4b: template modifier `" is-off"` → `" is-dim"` | — | FAILS 2 (the `is-off` direction-1 case + the set-equality test) |
| F1 | M-F1a: drop POLICY_ROWS' first row (`reproduce — F32/F33`) | 10 tests fail, incl. the `232` "defined cell in all four modes" + the `444/320/124` "well-formed result" duplicates | 8 fail — the two duplicate-literal tests no longer fail; the `58` pin and the genuinely row-dependent tests still do |
| F1 | M-F1b: drop edge `P1` | 9 fail, incl. UpstreamContract's degenerate `111` + "well-formed result" | 7 fail — the two duplicates gone; the canonical `111`, split, and `67` pins still fail |
| F2 | M-F2: the wiring regex `/from\s+"[^"]*\/edges"/` → `/from\s+"\.\/edges"/` (sibling-only — matches lookup.ts, blind to an outside bypasser). HEAD: applied to the live guard's inline copy | PASSED 20/20 (drift hole confirmed — the discrimination block tested its own copy) | FAILS — "flags a hand-rolled lookup on the WIRING predicate" (one predicate, called by live guard + discrimination block) |
| G2 | M-G2a: rewrite the artifact's `_meta.threshold` to "0.90 … AND 0.90 …" (the recorded bar drifts) | HEAD test file (throwaway copy) PASSED 33/33 — hardcoded 0.8 kept asserting the old bar (hole confirmed) | FAILS 3 — sonnet → SEPARABLE, the +1 margin, the `BAR` pin |
| G2 | M-G2b: parsed recall + 0.05 (bar 0.85) | — | FAILS 2 (margin, `BAR` pin); sonnet's 25/29 = 0.862 still clears 0.85, so the verdict legitimately holds |
| G2 | per-arm `minTpForBar` (haiku from its own tp+fn) | equivalent mutant on this data — both arms have 29 positives | closed by construction + new `haiku.tp + haiku.fn === 29` assertion; no kill claimed |
| G4 | deletion of "labels every record", "never marks a non-FIRE record…", and `groundTruth + ruleOnly === fire.length` | — | closure = deletion; file 33 → 31 tests, the two `> 0` tier checks kept |
| G6 | `Object.values(q2.arms)` `[a, b]` → `{ sonnet, haiku }` (×2); `Record_` → `FixtureRecord` | — | refactor, no mutant; 31/31 green |
| AF1 | M-AF1: every `appTsx` inside "no longer wires the deleted WP1-fallback…" → `""` (an empty/failed read), run by name | PASSED (hole confirmed) | FAILS — the new in-test positive anchor `toContain("updateConfirmSpec")` |
| AE1 | M-AE1: `pip.css` `.status-dot-idle { background-color: #6e7681 }` → shorthand `background: #6e7681` | failed with "pip.css must define a background-color" (reads as "colour missing") | FAILS with the message naming its blind shapes: "…does NOT understand nested rules, `var(--…)` custom properties, or shorthand `background:`; … may be present but unreadable here" |
| A1 | M-A1: `stagedPayload.ts` strip → no-op (`const safe = normalized;`) with the test's `toEqual` neutralized, so only the rewritten index-loop count can see it | — | FAILS "expected 2 to be 1" (the count is live and index-based) |
| m12-wp1 (2) RecentProject | M-RP: move `default_model?` out of `RecentProject` into a following `interface MovedOut` | PASSED 16/16 (hole confirmed — lazy regex ran past the closing brace) | FAILS — "`default_model` is on the wire type…" |
| m12-wp1 (2) RecentProject | M-RP2: add `opts?: { x: number };` then `unclean_exit?: boolean;` inside the interface | HEAD test (throwaway copy) PASSED — `\{[\s\S]*?\}` stopped at the nested brace (hole confirmed) | FAILS — "no announce/session-state field has been smuggled" |
| Row 17 (local half) | **no-change-needed.** Probe: a throwaway copy of `workflowMachineFunnel.test.ts` with `describe.skipIf(!upstreamAvailable())` forced to `skipIf(true)` | — | Vitest summary `17 passed | 2 skipped (20)`, both drift tests listed with `↓` ("absorbs exactly the edge-id set…", "agrees with upstream on the F10 target…"). Reported as skipped, never silently passed. (The probe's own 1 failure was the importer-population pin seeing the probe file itself as a new `workflowMachine` importer; the real file is 20/20 once the probe was deleted.) |
| Row 1 | Premise re-checked: the deleted per-byte `+=` encoder encodes a 200k-char + multi-byte body without throwing, byte-identical to the chunked encoder (node one-liner) — so the old "REGRESSION GUARD" could not fail in the scenario it named. Swap: `autoResumeFire.slashCommandPayload` → `cc/bridge` `encodeBase64`; `autoResumeFire.test.ts` byte pins green unchanged (byte-neutral). M-R1: de-chunk `encodeBase64` to one `fromCharCode(...bytes)` | — | FAILS — "encodes a 200k body…" with `RangeError: Maximum call stack size exceeded` (the test now claims what it guards: the chunking) |
| Row 7 | Root cause (read at plan): "switches the doc…" (null container) and "gives up quietly…" each left a 20×25ms poll pending past their own end. Fix: `signal?: AbortSignal` in `DocLinkClickDeps`; abort clears the pending timer; `DocsPanel` aborts on unmount; the tests abort every handler in `afterEach`. M-R7a: delete `signal?.addEventListener("abort", cancel, …)` | — | FAILS — "stops polling once aborted…" |
| Row 7 | M-R7b: drop the caller's `!deps.signal?.aborted` pre-check | survived the first draft (untested defensive code — caught by running it) | FAILS — new "does not start a poll at all when the signal is already aborted" |
| Row 7 | M-R7c / M-R7d: `DocsPanel` stops passing `signal:` / its cleanup stops calling `controller.abort()` | — | each FAILS — docsPanelWiring "hands the handler an abort signal that the panel aborts on unmount" |
| Row 28 | M-R28: remove `elicitation_url_dialog` from `INPUT_NEEDED_NOTIFICATION_TYPES` (array length adjusted so it compiles) | — (HEAD had no vocabulary test; the type rode the fallback) | FAILS — `every_documented_notification_type_is_classified_deliberately` only (61 passed / 1 failed): every behavioral test stays green, which is why the check is on list membership |
| Row 29 | M-R29a: `accept_loop`'s all-receivers-gone `return` → `panic!` | — | FAILS — `handle.join().expect("accept-loop thread must not panic")`; join is still the assertion after `shutdown` became `let _ =` |
| Row 29 | M-R29b: that `return` → `continue` (the loop never exits) | — | never passes: hung at `join`, killed by a 45s `alarm` (rc 142). One orphaned test binary (PID-scoped, my own `loop_exits_cleanly` argv) was killed afterwards |
| J3.2 | M-J3a: add a legitimate `.with_filename("x.json")` to `register()` | HEAD module (whole-file swap) FAILS "must not contain a string literal" — the over-breadth the finding named | PASSES (the guard now forbids only what it claims) |
| J3.2 | M-J3b: `.with_denylist(denylist())` → `.with_denylist(&["pip"])` | — | FAILS "must pass denylist() itself to with_denylist" |
| J3.2 | M-J3c: a second `.with_denylist(&["main"])` alongside | — | FAILS "must configure the denylist exactly once" |
| J3.1 / J3.3 | shared `pub(crate) const MAIN_WINDOW_LABEL` in `lib.rs` (tray, `lib.rs` focus scoping, window_state test); `denylist() -> &'static [&'static str]` | — | refactors, no mutant; window_state 5/5, tray 13/13 |
| LINK-CHECK-BOTH-ENTRIES (code half) | M-LC: repo `vite.config.ts` `rollupOptions.input` narrowed to `main` only | HEAD `linkCheck.mjs` (temp copy): "every entry linked cleanly", rc 0 (hole confirmed) | `pnpm check:link` FAILS rc 1: "required entry chunk(s) missing from the build: pip (built: main)" |
| LINK-CHECK-BOTH-ENTRIES | M-LC2: disable the entry check in `linkCheck.mjs` (`if (missing.length > 0)` → `if (false)`) | — | FAILS 2 — "fails, naming the entry, when a required entry is not built" + "requires main AND pip by default" |
| LINK-CHECK-BOTH-ENTRIES | mutant B codified: fixture `two-entry-broken` (missing export only in the pip entry's graph) | proven once by hand at WP3, never codified | test "fails when only the SECOND of two entries has a broken import" — exit 1, names `deletedExport` + `pip.js` |
| LINKCHECK-TEST-OUTSIDE-TSC-INCLUDE | M-TS: `const typeErrorMutant: number = "not a number"` in `linkCheck.test.ts` | `tsc --noEmit` rc 0 (hole confirmed) | `tsc` FAILS TS2322. Included as the single file, since `fixtures/type-only` is deliberately type-broken |
| APPBOOT-UNCAUGHT (KEEP) | Control 1: `setTimeout(() => { throw … }, 0)` appended to `main.tsx` | — | both appBoot tests PASS; the throw surfaces only as Vitest's "Unhandled Errors / Errors 1" (run exit 1). The assertion does NOT see timer throws (Node timers) |
| APPBOOT-UNCAUGHT (KEEP) | Control 2: a throwing `window` listener dispatched on `main.tsx`'s boot path | — | FAILS on `expect(uncaught).toEqual([])` ALONE (line 85; picker rendered, earlier assertions passed), and Vitest reports 0 unhandled errors, so this assertion is the ONLY instrument that sees it. Kept, with the controls recorded at the site |

