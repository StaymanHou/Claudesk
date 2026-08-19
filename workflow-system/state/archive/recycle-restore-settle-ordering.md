---
workflow: task
state: closed
created: 2026-08-19
docs-only: false
---

# Task: Recycle's restore settle is spent on spawn-wait — reorder step 6 (+ fold in WP7's abort)

**Workflow:** task
**State:** closed
**Completed:** 2026-08-19
**Created:** 2026-08-19

## Problem Statement

`recycleSession` step 6 sleeps the 1500 ms cold-spawn settle *before* awaiting the fresh session
id, so the settle that protects the `/session-restore` injection is only the leftover after the
respawn resolves — near zero on a cold or loaded spawn, which is why the typed restore lands in
CC's input box unexecuted.

## Context

**The defect, confirmed against live code today** (the handoff warned line numbers would drift —
they did, slightly; re-anchored by symbol):

- `src/components/workspace/recycleSession.ts:352` — `await sleep(inputs.restoreSettleMs ?? RESTORE_SETTLE_MS)`
- `src/components/workspace/recycleSession.ts:356` — `const freshSessionId = await inputs.awaitFreshSessionId()`
- `src/components/workspace/recycleSession.ts:343` — `relaunch()`, which only *dispatches* the respawn
- `src/components/workspace/recycleSession.ts:398` — `waitForFreshSessionId` polls the mirrored ref
  every 50 ms until it is non-null **and** different from the killed id
- `src/components/workspace/Workspace.tsx:240-241` — the production caller wires exactly that poll

So the id only lands after the spawn round-trips through `XtermPane` → `App` state → the prop →
the effect that mirrors it into `ccSessionIdRef`. The sleep runs *concurrently* with all of that.
`RESTORE_SETTLE_MS = INJECT_SETTLE_MS` (`state/predictAction.ts:117`) is 1500 ms, chosen as a ~4×
margin over a measured 350 ms cliff — a margin this ordering silently spends.

**⚠️ Why the auto-resume arm is fine and shares the constant safely:** its timer starts when the
pane is *already* spawned, so its full 1500 ms is true post-spawn settle. Same constant, different
starting line. That asymmetry is the reason not to raise `INJECT_SETTLE_MS`.

**⚠️ Why the suite did not catch it.** `__tests__/recycleSession.test.ts:143` asserts the effect
order as an ordered array — but the *sleep* pushes no effect, and `baseInputs` sets
`restoreSettleMs: 0`. The sleep's position is currently unobservable to the suite. Closing that
observability gap is part of the fix, not a nice-to-have.

**Folding in WP7** (`workflow-system/product/backlog-paydown-wbs.md:272`, `[impact: High]`,
ruling D1). It edits `markSessionClean` (`:339`) and `relaunch()` (`:343`) — immediately above the
lines this fix rewrites. Same function, same mutation proofs, same live-Recycle verification.
Doing them apart pays that twice. Binding constraints carried forward verbatim:

- **D1 / Option A** — on abort *after* a successful handoff but *before* the respawn, the clean
  mark **STAYS**. `.session.md` is on disk, so `--continue` would resume an already-handed-off
  session. **No `mark_unclean` primitive.** State this at the abort site.
- **Prove the abort AT THE CALLER**, not only in `recycleMachine.ts` — this repo shipped a
  CRITICAL exactly that way (twice in M11 WP4).
- Today `relaunch: () => ccPaneRef.current?.relaunch()` **silently no-ops on a dead ref**, so an
  unmount mid-Recycle clears the flag for a session that never respawned.

**Verification constraints (from the SURFACE + repo lessons):**

- The honest observable is whether the restore **EXECUTED**, not whether bytes were written —
  `injectCommand` resolves fine when the TUI drops them. `tooling/autofire-timing/probe.py`
  already encodes the right predicate (probe with `/status`, whose execution output shares no
  substring with its own echo).
- ⚠️ Confirm the dev profile is on `bypassPermissions` **first** —
  `SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES` is live on this code path
  and already caused one misdiagnosis.
- `docs/lessons/mcp-tauri-bridge-caveats.md` caveats (h)/(i): a freshly-opened pane reading blank
  means nothing; the xterm DOM is not the buffer.
- Scratch repos only: `tmp/scratch/scratch-{a,b,c}`.
- `pnpm verify:auto` is the gate. Baselines: 846 Rust · 2122 frontend.

## Work Tree

- [x] T1 Make the sleep's position observable, then reorder step 6  <!-- status: [x] -->
      Add a failing test first: assert the settle elapses **after** the fresh id resolves (an
      injectable clock/effect-log entry, so the ordering is a suite-visible property rather than
      an invisible one). Then reorder to `awaitFreshSessionId()` → `sleep(settle)` → `inject`.
      Update the `:143` ordered-array test to the new sequence. Mutation-prove: restore the old
      order and confirm the new test FAILS.
- [x] T2 Fold in WP7 — `AbortSignal` on `RecycleInputs`, aborted on unmount  <!-- status: [x] -->
      Thread the signal through `awaitCompletion` (clear the timer, unsubscribe both listeners)
      and the step-5/6 region. Honor D1 at the abort site with the reason stated in place. Wire
      the caller in `Workspace.tsx` to abort on unmount. Prove the abort AT THE CALLER.
      **DONE 2026-08-19.** Added `signal?: AbortSignal` to `RecycleInputs` and a third caller
      failure reason `aborted` (distinct from the existing two — `aborted` means the operator
      closed the workspace, so nothing is owed them and it is excluded from the `console.warn`
      channel). Three abort sites: after the completion wait (nothing torn down), between the
      clean mark and the respawn (**D1: the mark STAYS; no `mark_unclean`**), and after the settle
      (re-checked at fire time, mirroring `shouldInject`). `awaitCompletion` resolves `"aborted"`
      rather than feeding a synthetic signal into the machine — an abort is a fact about the
      CALLER, not about what CC did. Caller wired in `Workspace.tsx`: controller in a ref,
      unmount cleanup with an empty dep array, identity-checked clear on completion.
      **Mutation-proven, EACH ARM INDIVIDUALLY:** 5 behavioral mutants (incl. the D1 inversion —
      adding a `mark_unclean`-shaped undo IS caught) and 5 caller-guard mutants each killed
      exactly one test. New `recycleAbortOnUnmount.test.ts` carries the caller-side obligation as
      a `?raw` guard (comments stripped, emptiness meta-guard, call shapes not bare identifiers) —
      a separate file because proving the operation alone would reproduce the
      "proven-module-unhonoring-caller" class WP7 explicitly warns about.
- [x] T3 Re-measure the recycle path; decide shared-vs-own constant  <!-- status: [x] -->
      Use `tooling/autofire-timing/probe.py` (≥5 cold spawns per arm, its own floor). A recycle
      respawn follows a kill + a completed `/session-handoff`, so it may be slower than M12's
      cold spawn. If it needs more, add a **named export beside `RESTORE_SETTLE_MS`** documenting
      why it diverges — do NOT raise the shared `INJECT_SETTLE_MS`.
      **DONE 2026-08-19 — VERDICT: keep it SHARED, no divergent constant.** Re-ran the probe on
      the current machine + CC 2.1.235, 5 cold spawns per arm: 350 ms **NOT-EXECUTED 5/5**,
      700 ms EXECUTED 5/5, 1000 ms EXECUTED 5/5, 1500 ms EXECUTED 5/5. ⚠️ **The cliff moved UP**
      since M12, which recorded 350 ms as *flaky* 1/5 rather than a clean fail — so today's
      environment is slower to become interactive, not faster. It still sits between 350 and
      700 ms, leaving 1500 ms a ~2-3x margin. **A recycle respawn being slower than a bare cold
      spawn no longer eats this budget**, because step 6 now absorbs the respawn wait BEFORE
      spending the settle — which is why the ordering fix, not a bigger number, was the fix.
      Table recorded at `RESTORE_SETTLE_MS`; probe runtime (54s) added to `runtimes.md`.
- [x] T4 Live verify-self on a scratch workspace  <!-- status: [x] -->
      Dev profile on `bypassPermissions` first. Real Recycle in `tmp/scratch/scratch-a`; confirm
      `/session-restore` **executed** in the pane (not merely echoed). Then `pnpm verify:auto`.
      **DONE 2026-08-19. TWO consecutive live Recycles, restore EXECUTED in both.** Dev profile
      confirmed on `bypassPermissions` + `workflow_features_enabled: true` FIRST (the trap the
      SURFACE names). Built a real workflow fixture in `scratch-a` — without one `/session-handoff`
      has nothing to write and the composite correctly FAILS, which is the "fixture-blocked" shape
      previously misdiagnosed as a feature defect. Run 1: fresh id `cc-2` at ~42.6s post-click,
      pane shows the restore reading the pointer, restoring context, stripping the WIP footer,
      deleting `.session.md`, printing the drive-mode menu, emitting **S6**. Run 2: `cc-3`, same,
      emitting **S15**. The full skill body is something an echoed-but-unsubmitted command cannot
      produce — that is the execution evidence, not a typing artifact.
      **`pnpm verify:auto` PASSES.** Frontend **2122 -> 2136 (+14)**, attribution exact (7 abort
      behavioral + 6 caller guards + 1 ordering), baseline re-derived by `git stash -u` rather
      than trusting `runtimes.md` (whose 2118 was stale). Rust unchanged at 845 — no Rust touched.
      The 1 lint warning is pre-existing in `XtermPane.tsx`, a file this task never edited.
      **NOT obtained: a clean wall-clock settle measurement. BOTH instruments failed and are
      recorded as failures, not findings.** (a) A tap on `__TAURI_INTERNALS__.invoke` observed
      nothing because that object exposes only a `plugins` key — the property patched does not
      exist, so it could never have seen a write. (b) An "echo appeared" predicate over
      `.xterm-rows` returned `gapMs: 0` by matching run 1 stale scrollback on the first tick
      (the standing "xterm DOM is not the buffer" caveat). The settle POSITION is proven exactly
      where it can be — the mutation-tested suite; the live runs prove end-to-end EXECUTION.
      Teardown: fixture commit reverted, dev PIDs killed by explicit PID (11303/11006); the
      operator prod app (PID 1425) verified untouched.
- [x] T5 Close out: CHANGELOG + delete both backlog entries, mark WP7 done in the paydown WBS  <!-- status: [x] -->
      CHANGELOG-then-delete invariant: `**Backlog resolved:**` lines land in the SAME commit as
      the backlog deletes. Two items close here — the new SURFACE and WP7's MAJOR.
      **DONE 2026-08-19, commit `42bfe0c`** — CHANGELOG + both deletes + code in ONE commit.
      The SURFACE block was fully deleted from `backlog.md`. WP7's MAJOR body was deleted from
      `backlog-quality-findings.md`, and its **grouped** pointer stub in `backlog.md` was
      **REWRITTEN, not deleted** (partial-resolution carve-out — the stub covers several findings
      and only one is resolved). ⚠️ While rewriting it I nearly asserted that the
      late-subscription-disposal MAJOR closed at paydown WP4; a test for it does exist but its
      `Status:` still reads `pending`, and confirming the test fully satisfies the finding was
      outside this task's scope — so the stub states that fact instead of claiming a closure.
      WP7 marked done out-of-order in the paydown WBS with the fold-in rationale.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** With the ordering fixed, `recycleSession`'s settle elapses strictly AFTER the fresh
session id resolves and strictly BEFORE the restore is injected — and that ordering is *falsifiable*:
restoring the shipped (pre-fix) arrangement from a pristine copy must turn the gate red.

⚠️ **Why the observable is stated as a falsifiable ordering rather than "a live Recycle works".** A
live Recycle is the end-to-end surface and it WAS driven for real (twice, T4) — but it is not a
*mechanical* observable: it takes ~50s, needs a hand-built workflow fixture, and its pass/fail is
read out of a terminal pane. Worse, per this task's own findings it is exactly where instruments lie:
`injectCommand` resolves successfully when the TUI drops the bytes, which is *why the defect shipped
green*, and two separate live instruments returned false readings during T4. So the live run supplies
the **execution** evidence (recorded under T4: the fresh session ran the skill to completion, emitting
S6 then S15) and the gate below supplies the **mechanical, re-runnable, falsifiable** evidence. Neither
alone is sufficient; the pairing is the verdict.

**Verification command:**
```
pnpm verify:auto                      # the whole project gate — must exit 0
# then the falsification arm, which is the part that makes the above mean anything:
#   revert step 6 to the shipped order (settle before awaitFreshSessionId) from a pristine copy
#   -> the ordering test MUST fail; restore -> MUST pass
```

**Expected result:** `pnpm verify:auto` exits **0** with frontend **2136** and Rust **846** passing;
and with the pre-fix ordering re-applied, `recycleSession.test.ts` fails on the named ordering
assertion (`settleAt` not greater than `idAt`) rather than on anything incidental — proving the gate
detects the specific defect that shipped, not merely that the suite is green.

## Verification Result

**Status:** PASS
**Date:** 2026-08-19
**Evidence:**
- `pnpm verify:auto` → **`GATE EXIT=0`**; `Test Files 166 passed (166)`, `Tests 2136 passed (2136)`;
  Rust `test result: ok.` lines summing to **846 passed**. Matches the declared expectation exactly
  (2136 frontend / 846 Rust / exit 0).
- **Falsification arm (the load-bearing half).** Pristine copy taken from `git show HEAD:` — not from
  a remembered file — and `diff -q` confirmed the working tree was byte-identical to HEAD first. The
  shipped pre-fix ordering was then re-applied (settle hoisted above `awaitFreshSessionId()`), the
  mutation was confirmed to have landed in **executable code at line 479** (`grep -n` on the moved
  statement), and the suite went red:
  ```
  × ⚠️ settles AFTER the fresh session id lands, so the wait is post-spawn
  AssertionError: expected 3 to be greater than 4
  Tests  3 failed | 35 passed (38)
  ```
  `3 > 4` is the settle at effect-index 3 and the fresh id at 4 — i.e. it failed on the **named
  ordering assertion**, not on something incidental. Restored from the pristine copy: `git diff
  --stat` empty, 44/44 green across both recycle test files.
- **Execution evidence (from T4, recorded there in full):** two consecutive live Recycles in
  `tmp/scratch/scratch-a`; in both, the freshly-spawned CC session ran `/session-restore` to
  completion — read the pointer, restored context, stripped the WIP's stale footer, deleted
  `.session.md`, printed the drive-mode menu, emitted **S6** (run 1) and **S15** (run 2).

**Notes:** PASS on both halves of the observable. The pairing is deliberate and each half covers the
other's blind spot: the live runs prove the restore genuinely **executed** (the only honest observable
here — `injectCommand` resolves even when the TUI drops the bytes, which is *why the defect shipped
green*), while the falsification arm proves the gate would **catch a regression**, mechanically and
repeatably, without a 50s live run and a hand-built fixture. ⚠️ No sibling bug surfaced, so §4b's
in-place-fix shortcut was not used and no `[SHORTCUT-…]` entry is owed. ⚠️ The one thing this gate
does **not** establish is a wall-clock settle duration — both live instruments for that failed during
T4 and are recorded there as instrument failures, not findings.

## Retrospect

- **What changed in our understanding:**
  - **A delay can be present, correctly sized, imported-not-copied, documented with its measurement
    table — and still be in the wrong place.** Every hygiene signal around `RESTORE_SETTLE_MS` was
    green; the constant was never the defect. The bug lived in what the `await` *before* it was
    waiting for. Reviewing a timing value tells you nothing about the timing.
  - **The most valuable finding was about the SUITE, not the code.** The ordered-sequence assertion
    pinned five effects in order and would have caught almost any reordering — except this one,
    because `sleep()` logged nothing. **A step that emits no observable is invisible to an
    ordering assertion no matter how strict the assertion is.** The generalizable form: when
    asserting an order, first ask which steps can actually *appear* in the log.
  - **Two instruments failed in the same run, in opposite directions, and both would have produced a
    confident wrong answer.** One patched `__TAURI_INTERNALS__.invoke` — a property that does not
    exist on that object (it exposes only `plugins`), so it reported "no injection" for a run whose
    injection demonstrably executed. The other matched the *previous* run's scrollback and reported
    a 0 ms settle. ⚠️ **Neither failure was detectable from its own output**; both were caught only
    by cross-checking against an independent observable. This is the fifth-and-sixth instance of the
    cycle's standing lesson (an instrument that cannot observe its subject reports absence
    indistinguishably from real absence) and the first time TWO fired in one verification.
  - **The `?raw` caller-guard needed the mutants run individually to be worth anything.** All five
    arms killed exactly one test each — which is the evidence that no arm is redundant *and* none is
    a false positive. A composite bypass would have said "the guard bites" while hiding whichever
    arm did nothing.

- **Assumptions that held:**
  - The handoff's diagnosis was correct, including its insistence that the delay was **not** missing
    and that raising the number would be the wrong fix. Re-reading the code confirmed it rather than
    correcting it — the first WP in this sweep where the filing was right on the first pass.
  - Folding WP7 in was the right call: it edited `markSessionClean` and `relaunch()` immediately
    above the lines the ordering fix rewrote, so it genuinely was one pass over one region.
  - WP7's own guess at the open ordering question ("arguably yes — the handoff really did complete")
    was right; it became a *stated* decision with a mutation-proof against reversal.
  - `pnpm verify:auto` as a single gate did its job — one command, no hand-assembled list.

- **Assumptions that were wrong:**
  - **Expected the live run to yield a clean wall-clock settle measurement.** It did not, twice, for
    instrument reasons. Reported as instrument failure rather than dressed up as `gapMs: 0`.
  - **Assumed `scratch-a` was a usable fixture as-is.** It has no `workflow-system/state/`, so
    `/session-handoff` had nothing to write and the composite would have correctly FAILED — the exact
    "fixture-blocked" shape that was **misdiagnosed** at M13 WP3. Building a real workflow item first
    was the difference between a verified pass and a second misdiagnosis.
  - **Nearly asserted a closure I had not verified.** While rewriting the m13-wp3 stub I was about to
    write that the late-subscription-disposal MAJOR closed at paydown WP4. A test for it exists, but
    its `Status:` still reads `pending` and confirming the test satisfies the finding was outside
    scope. Caught it before writing — the stub now states the fact instead.
  - The runtime registry's frontend baseline (2118) was **stale**; HEAD read 2122. Re-derived with
    `git stash -u` rather than trusting the entry — the same hand-maintained-figure-as-drift-channel
    trap banked at M13's close, hit again one WP later.

- **Approach delta:** Plan followed as written, with two additions the plan did not anticipate.
  (1) **The seam had to be installed with the OLD ordering first**, so the pre-fix failure was
  `expected 3 to be greater than 4` (a genuine ordering signal) rather than `settleAt === -1` (which
  only proves the seam is missing — an under-determined failure that would have "passed" a mutation
  test for the wrong reason). (2) **A dedicated caller-side guard file** was added; the plan said
  "prove the abort at the caller" without settling where, and a separate file is what keeps the
  operation's proof and the caller's obligation from being confused for each other.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
