---
workflow: task
state: act (complete)
created: 2026-08-19
docs-only: false
---

# Task: Recycle's restore settle is spent on spawn-wait — reorder step 6 (+ fold in WP7's abort)

**Workflow:** task
**State:** act (complete)
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
- **Path:** Task > all complete
- **Active scope:** all complete
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
