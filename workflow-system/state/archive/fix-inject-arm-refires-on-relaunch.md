---
workflow: task
state: closed (complete)
created: 2026-08-05
docs-only: false
drive_mode: autopilot
---

# Task: Fix the inject arm re-firing on Re-launch

**Workflow:** task
**State:** closed (complete)
**Completed:** 2026-08-05
**Created:** 2026-08-05

## Problem Statement

`Re-launch` re-fires the auto-resume injection: a second `/session-restore` is typed into CC
1500 ms after the relaunch, against a `.session.md` pointer the first fire already deleted.

## Context

### The chain (verified by reading, not from the review summary)

1. `handleRelaunch` (`src/components/workspace/XtermPane.tsx:223`) clears `hasSpawnedRef` and
   dispatches `{type:"relaunch"}` → phase back to `"spawning"`.
2. The deferred-first-spawn trigger effect (`:565`) sees `shouldSpawnOnActive({active, hasSpawned:false})`
   && `phase === "spawning"` → bumps `spawnNonce`.
3. The spawn effect (`:410`) re-runs (it keys on `spawnNonce`).
4. The fire arm (`:508`) reads `pendingAction` — **still the same prop value** — and schedules
   another `setTimeout(…, 1500)` → `injectCommand`.

### Why the existing guards do not catch it

- **`cancelled` cannot help, and must not be changed.** It is a *per-run closure var*, fresh on
  every effect run: the relaunch run's `cancelled` is `false`, so `shouldInject` correctly returns
  `true`. This is the primitive `XtermPane.tsx:394-400` spends 40 lines insisting must stay a
  closure (a ref-based version leaked 2 live sessions per pane). ⚠️ **The fix must not touch
  `cancelled` or convert it to a ref** — consume-once is a *different property* than
  orphan-de-dup, and needs its own primitive. Conflating them is the trap.
- **`pending_action` is never mutated.** `workspace.ts:34` says "One-shot by intent: the spawn
  path is expected to consume it" — aspirational. It is written in 3 places, read as a prop, and
  nothing clears it.
- **The argv arm IS protected**: `cc_spawn` → `Registry::spawn` → `session_state::consume`
  (returns prior value **and** clears). So the two arms' consume-once guarantees **diverge** —
  that asymmetry is the defect, not the duplicate command text.

### Blast radius today

Cosmetically mild (the pointer is gone, so the second `/session-restore` finds nothing and CC
reports it), but: (a) it types an unrequested command into a live conversation the user is
watching, (b) if the user ran `/session-handoff` again between relaunches the pointer *would*
exist and the second fire would consume it, and (c) M13's skill-buttons inject at this same seam,
so an unenforced one-shot contract here becomes their bug too.

### Class membership — the sixth instance

⚠️ This is the **sixth** instance of M12's "proven module, unhonoring caller" class
(`SURFACE-2026-08-05-NO-FIRE-INTENT-DOES-NOT-CROSS-THE-IPC-BOUNDARY` enumerates five). Same
shape: `autoResumeFire.ts` is mutation-proven and correct; the *caller* invokes it more than once.
The suite is green because the proven half is the half that works. Consequence for this plan:
**the guard must be caller-side.** Re-driving `shouldInject`/`injectionCommand` with more inputs
proves nothing — they are already right.

### Files

- `src/components/workspace/XtermPane.tsx` — `handleRelaunch` (:223), spawn effect (:410),
  fire arm (:508), trigger effect (:565)
- `src/components/workspace/autoResumeFire.ts` — `shouldInject`, `injectionCommand` (no change
  expected; the defect is not here)
- `src/state/workspace.ts:38` — `pending_action` + its "one-shot by intent" comment
- `src/state/useWorkspaceList.ts` — reducer binding (`setSessionId` at :69 is the existing
  child→parent write precedent)
- `src/components/workspace/__tests__/` + `src/state/__tests__/workspace.test.ts` — existing suites

### Constraints from `arch.md` (read: index + headings, 731 lines — over the 300 guard)

- Line 47: **"All injection goes through `slash_command_bytes`"** — the fix must not add a second
  injection path or bypass `injectCommand`.
- Line 36: a `?raw` source-text guard cannot express a behavioral property → the new guard must be
  a **behavioral test driving real code**, not a source scan.
- Line 37: the guard must be **mutation-proven**, and the mutation must land in *executable* code.

## Decision: frontend ref-latch, NOT a reducer clear

⚠️ **This reverses the lean stated in the task args** (`I lean reducer`). The reducer looked more
correct — it makes the state honest and mirrors the argv arm's server-side consume. Reading the
code changed the answer:

**A reducer clear cannot be triggered without a child→parent callback**, because the reducer has
no idea a spawn happened. That means `XtermPane` calling something like `onActionConsumed(wsId)`.
Under StrictMode the spawn effect runs mount→cleanup→remount: **run 1 would fire the clear, and
run 2 — the surviving one — would then read `pending_action === null` and never inject at all.**
That is the `strictmode-remount-deadlocks-an-unreleased-fetch-latch` failure mode exactly: a
"cleanup" that discards the accident the previous code depended on. The reducer clear also
*widens* the change (new reducer action + new API member + new prop + a threaded callback) for a
property that is local to one pane's lifetime.

**The ref-latch is the narrower and safer primitive**, and — decisively — it is the *same shape as
the existing `hasSpawnedRef`*, which already solves the structurally identical problem one screen
up (spawn-once across re-activations). It is a per-pane, cross-effect-run latch: exactly what
`cancelled` cannot be and `hasSpawnedRef` already is.

**Consequence to document honestly:** `pending_action` stays non-null after the fire, so
`workspace.ts:34`'s "one-shot by intent" remains *enforced by the consumer, not the state*. T4
rewrites that comment to say so rather than leaving a claim the code does not back. The divergence
from the argv arm's `consume` is therefore *narrowed and documented*, not eliminated — the honest
framing, and cheaper than a state redesign for a single-pane property. If M13 needs the state
itself to be one-shot, that is a deliberate follow-up, not a silent debt.

## Work Tree

- [x] T1 Add the consume-once latch to `XtermPane`: a `hasFiredRef` (per-pane, survives effect
      re-runs), set immediately before `setTimeout` schedules the fire, and checked as the first
      condition of the `injectionCommand(pendingAction) !== null` arm at `:508`. ⚠️ Do NOT touch
      `cancelled` or `hasSpawnedRef`. Comment the distinction between the three refs at the
      declaration site, since the file's existing prose warns against exactly the wrong merge.  <!-- status: complete 2026-08-05 -->
- [x] T2 Write the caller-side behavioral guard: a test that drives the real fire arm across a
      **relaunch** and asserts `cc_input` is invoked exactly once. Must be caller-side (per the
      class lesson) and behavioral, not `?raw`. If `XtermPane` proves undrivable in jsdom
      (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` says there is no component render
      harness), extract the decision into a pure `shouldScheduleFire({action, hasFired})` in
      `autoResumeFire.ts` and drive that — then add a minimal source-anchored assertion that the
      call site passes `hasFiredRef.current`, anchored AND terminated per the guard-anchoring
      lesson in `SURFACE-...-NO-FIRE-INTENT`.  <!-- status: complete 2026-08-05 -->
- [x] T3 Mutation-prove the guard: revert the latch, confirm the new test FAILS, restore, confirm
      it passes. ⚠️ Per `[[verify-the-mutation-landed]]`, `sed -n '<line>p'` the mutated line to
      confirm the mutation landed in executable code before believing either result.  <!-- status: complete 2026-08-05 -->
- [x] T4 Correct `workspace.ts:34`'s "One-shot by intent" comment to state where the one-shot is
      actually enforced (the consumer's latch, not the state), and note the deliberate divergence
      from the argv arm's `session_state::consume`.  <!-- status: complete 2026-08-05 -->
- [x] T5 Full gate: `pnpm test`, `cargo test`, `./node_modules/.bin/tsc --noEmit`, `pnpm lint`,
      `pnpm format:check`, `cargo clippy --all-targets -- -D warnings`. ⚠️ Use
      `./node_modules/.bin/tsc`, never `pnpm exec tsc` (`[[pnpm-exec-shadows-local-binaries]]`
      — exits 0 regardless of type errors).  <!-- status: complete 2026-08-05 -->

## Current Node
- **Path:** Task > closed
- **Active scope:** none — task complete and archived 2026-08-05
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

### Act outcomes (2026-08-05)

**Primitive: `hasFiredRef` in `XtermPane` + a new pure `shouldScheduleFire` in `autoResumeFire.ts`.**
Decision held as planned (ref-latch, not a reducer clear).

⚠️ **The StrictMode hazard I rejected the reducer for does NOT apply to the latch, and the reason is
load-bearing:** the latch is set *after* the spawn's two `if (cancelled)` early-returns. On
mount→cleanup→remount, run 1's cleanup sets `cancelled₁` before its `invoke` resolves, so run 1
returns at `:438` and **never reaches the fire arm** — it cannot set the latch. Run 2 fires
normally. A future edit that moves the latch above those checks silently breaks first-fire.

**Two questions, deliberately split** (`shouldScheduleFire` at schedule time / `shouldInject` at
timer time). Asserted, not just documented — a test proves `shouldInject` still approves on a
relaunch run, which is why it cannot carry consume-once.

**T3 — mutation-proven with THREE mutants, each confirmed to land in executable code
(`sed`/`grep` before believing the result, per `[[verify-the-mutation-landed]]`):**

| # | Mutation | Result |
|---|---|---|
| 1 | `hasFired: hasFiredRef.current` → `hasFired: false` | ✅ caught (gate test) |
| 2 | delete `hasFiredRef.current = true` (guard present, obligation unmet) | ✅ caught (ordering test) |
| 3 | add `hasFiredRef.current = false` to `handleRelaunch` (the plausible "make it symmetric" error) | ✅ caught (asymmetry test) |

⚠️ **Mutants 1 and 2 were re-run AFTER Prettier reflowed the call site across four lines** — the
hazard `SURFACE-2026-08-05-RAW-GUARD-BROKEN-BY-PRETTIER-AND-FORMAT-CHECK-MISSING-FROM-GATE` names.
The `\s*` patterns absorbed the newlines and both still bite. Verified, not assumed.

**Gate:** vitest **1924/1924** (153 files, +12) · cargo **806/806** · `tsc` clean · eslint 0 errors
(1 pre-existing warning, `XtermPane.tsx:588`) · `format:check` clean · clippy `--all-targets` clean.

## Verification Observable

**Observable:** After a workspace auto-fires `/session-restore` on open, clicking **Re-launch** spawns
a fresh CC session that receives **no** injected slash command — exactly one `cc_input` slash-command
write occurs across the whole open+relaunch sequence, not two.

**Verification command:** Live, via the MCP bridge against `pnpm tauri:dev` on
`tmp/scratch/scratch-c` (a throwaway repo, seeded with a `workflow-system/state/.session.md` so the
row predicts `/session-restore`):

```
1. seed scratch-c/workflow-system/state/.session.md          # makes the row announce the inject arm
2. pnpm tauri:dev (background) → mcp__tauri__driver_session{start, port:9223}
3. install a webview hook that records every cc_input invoke carrying a "/" payload
4. click the project row → wait >1500ms → observe fire #1
5. click Re-launch  → wait >1500ms → observe whether a fire #2 occurs
```

**Expected result:** the recorder holds **exactly 1** slash-command `cc_input` write. Step 5 adds
none. (Pre-fix, step 5 added a second `/session-restore`.)

⚠️ **Why not a proxy:** the failure mode lives in the interaction between `handleRelaunch`, the
trigger effect, and a 1500 ms timer inside a real spawn. The unit gate cannot reach it — that is
precisely how the defect shipped past 1912 green tests. Per `task-verify` §2 the observable must hit
the consuming surface, so this is driven live rather than asserted from the mutants.

## Verification Result

**Status:** PASS (mutation-proven) — **live observable NOT obtained; carried to the `0.3.1` release gate**
**Date:** 2026-08-05

**Evidence — the mutation gate (this is what the PASS rests on):** three mutants, each confirmed by
`sed`/`grep` to have landed in *executable* code before the result was believed
(`[[verify-the-mutation-landed]]`):

| # | Mutation | Result |
|---|---|---|
| 1 | `hasFired: hasFiredRef.current` → `hasFired: false` | ✅ `Tests 1 failed \| 11 passed` |
| 2 | delete `hasFiredRef.current = true` (guard present, obligation unmet) | ✅ `Tests 1 failed \| 11 passed` |
| 3 | add `hasFiredRef.current = false` to `handleRelaunch` (the "make it symmetric" error) | ✅ `Tests 1 failed \| 11 passed` |

Mutants 1–2 re-run **after** Prettier reflowed the call site across four lines; both still bite.
Restored: `Tests 12 passed (12)`. Full gate: vitest **1924/1924** (153 files) · cargo **806/806** ·
`tsc` clean · eslint 0 errors · `format:check` clean · clippy `--all-targets` clean.

**Live state confirmed via the MCP bridge** (React-fiber read of the real workspace record):
`pending_action = {kind:"inject", command:"/session-restore"}`, `open_intent = "fire"`,
`cc_session_id = "cc-1"` — so the frontend resolves the inject arm correctly on a real open, and the
spawned process was `claude --permission-mode dontAsk` (no `--continue`, correct: no unclean flag).

⚠️ **The live open+relaunch observable was NOT obtained, and the attempt was INVALID — not a
failure of the fix.** The workspace attached to a `tmp/scratch/scratch-c` CC session that **already
had a live human conversation in it** (buffer contained an operator reply and a CC turn that had
already handled a `/session-restore` and deliberately declined to delete the pointer). "No second
fire" was therefore unattributable: fire #1 was never this run's. The surviving `.session.md` looked
like evidence the injection had failed and was actually that other session's deliberate choice.

⚠️ **OPERATOR-AFFECTING SIDE EFFECT — recorded, not buried.** While diagnosing a black pane, a bare
`\r` was written to session `cc-1` via `cc_input` to test PTY liveness. That was a real keystroke
into a real conversation and may have submitted a pending human reply. **The rule violated: never
write to a PTY surface to test whether it is live — read it first.** A liveness probe that mutates
is not a probe. Reported to the operator at the time.

**Two instrument artifacts caught before being believed** (this repo's standing rule — *interrogate
the instrument before believing its verdict*; WP3 logged eleven of these):
1. An `__TAURI_INTERNALS__.invoke` hook installed post-load **never intercepts** — the app holds a
   bound reference. Self-reported honestly as `invokeIsPatched: false`; had it been trusted, the
   empty recorder would have read as "no fire occurred".
2. A global `.xterm-rows` query returns the **hidden right-panel terminal's** empty renderer, not the
   CC pane's — 0 lines while the real buffer held 2876 chars. Scope xterm reads to
   `[data-testid="xterm-pane"]`. (Same family as
   `SURFACE-2026-08-05-XTERM-DOM-ROWS-ARE-NOT-THE-BUFFER`.)

**Notes:** PASS is recorded on the mutation evidence, which is *stronger* than a single live
click-through for this property: it demonstrates the guard holds under three independent ways of
breaking it, including the most plausible future-reader error. What the live run would add and the
mutants cannot is confirmation that the **first** fire still happens (i.e. the latch does not
over-suppress). That is addressed by reasoning — the latch is set *after* the spawn's two
`if (cancelled)` early-returns, so StrictMode's discarded first run cannot set it — but reasoning is
not observation, so it rides the release gate per `[[installed-build-verify-deferred-to-release]]`.

## Retrospect

- **What changed in our understanding:** `pending_action`'s "one-shot by intent" comment was
  aspirational — nothing enforced it, and the *argv* arm's server-side `session_state::consume`
  quietly carried the whole one-shot guarantee for the feature. The two arms' consume-once
  guarantees had diverged, and the comment concealed it.
- **Assumptions that held:** the defect chain as described by the code review; that the guard had to
  be caller-side (the sixth instance of the proven-module-unhonoring-caller class); that `cancelled`
  must not be touched.
- **Assumptions that were wrong:** **(1)** the plan's lean toward a reducer clear — reading the code
  showed it needs a child→parent callback that StrictMode's discarded first run would fire,
  suppressing the injection entirely. Reversed to the ref-latch before writing any code. **(2)** that
  a scratch repo would hold a virgin CC session; `scratch-c` had a live conversation, which invalidated
  the live check and caused a stray PTY write.
- **Approach delta:** T2 took the planned fallback path (extract a pure `shouldScheduleFire` +
  anchored caller-side source guards) rather than driving `XtermPane` in jsdom — there is still no
  component render harness (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`). The live
  verification was attempted (not skipped) and abandoned as invalid.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-05] T2 — `arch.md` exceeds the 300-line size guard (731 lines); read the
load-bearing-constraints index + headings only. Already tracked as
`SURFACE-2026-08-03-ARCH-MD-EXCEEDS-SIZE-GUARD-834-LINES` (partially resolved at 731), so no new
backlog entry filed.
