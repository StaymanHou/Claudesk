# Feature: WP2 — Fix the two WP6b-4 flexible-timeline MAJOR latent bugs

**Workflow:** feature
**State:** COMPLETED — finalized 2026-07-20
**Created:** 2026-07-20
**Entry:** reproduce (bug-fix feature — backlog-paydown sweep WP2) → plan (F33)
**Ship note (2026-07-20):** Cleanup clean (no debug/TODO/scratch in the 5 changed files). Final gate: vitest 1185 passed, tsc --noEmit exit 0, eslint src 0 errors (1 pre-existing unrelated XtermPane warning). NOT committed/pushed — commit-only-when-asked; the whole backlog-paydown sweep is uncommitted at HEAD 6f514d0. Two live checks (vh.1, p2vh.1) carried to the next /release gate.

## Problem Statement

Two MAJOR *latent* bugs (no crash) in the M9 WP6b-4 flexible-timeline, both surfaced by
`feature-review-quality` on 2026-07-15, both localized + testable. They are the two
highest-severity live findings in the backlog.

### Bug 1 — `framedRange` × `RangePicker` off-by-one (`SURFACE-2026-07-15-QUALITY-WP6B4-FRAMEDRANGE-PICKER-OFFBYONE`)
- **Where:** `viewport.ts` `framedRange` (L224-243) ↔ `RangePicker.tsx` `MAX_RANGE_DAYS = 30`.
- **Observed:** a LEGAL max-zoom-out viewport (span capped at `MAX_ZOOM_OUT_SPAN_MIN = 30*1440`
  by `clampViewport`) that is DAY-MISALIGNED (panned by a fractional day) maps to 31 INCLUSIVE
  lanes: `floor(start/1440)` … `ceil(end/1440)-1`. e.g. start `5.5d`, span `30d` →
  `floor(5.5)=5` … `ceil(35.5)-1=35` → lanes 5..35 = **31 inclusive days**. `framedRange` emits
  that 31-day ISO span → the reactive `RangePicker` readout runs `validateRange(…, 30)` →
  `"Range too long (31 days > 30)"` → **permanent red border on a value the operator never typed**.
- **Expected:** the framed span the picker reflects is always a value the picker itself accepts
  (≤ `MAX_RANGE_DAYS` inclusive days). The 30-*lane* span cap (`MAX_ZOOM_OUT_SPAN_MIN`) and the
  30-*inclusive-day* picker max (`MAX_RANGE_DAYS`) are off-by-one relative to each other.

### Bug 2 — `AutoExtendWatcher.firingRef` latch (`SURFACE-2026-07-15-QUALITY-WP6B4-AUTOEXTEND-FIRINGREF-LATCH`)
- **Where:** `GlobalDashboard.tsx` `AutoExtendWatcher` (L226-254) `firingRef` + its `[lo,hi]`
  clearing effect ↔ `extendLoaded` (L804-823) edge early-returns.
- **Observed:** the watcher sets `firingRef.current = true` before `onExtend(dir)`; only the
  `useEffect([lo,hi])` clears it. But `extendLoaded` early-returns WITHOUT changing
  `loadedStartIso`/`loadedEndIso` when already at the origin floor / at today
  (`if (clamped === loadedStartIso) return`). In that no-op path `[lo,hi]` never changes → the
  guard never clears → and because a SINGLE `firingRef` gates BOTH directions, a latched `older`
  guard silently blocks a later legitimate `newer` extend at the opposite edge.
- **Expected:** a no-op edge fire must not permanently latch the guard; a tick where no extend is
  needed releases it. Low trigger probability, genuine latent state-machine bug in load-bearing
  new complexity.

## Reproduction Attempt

**Surface chosen:** failing tests (both bugs are reachable via the module's pure functions; this
repo has no component-render toolchain by convention — behavior is otherwise verified live via
the MCP bridge, so a pure seam is the correct red-green anchor).

**Outcome:** reproduced (both bugs, deterministically).

**Artifact:** `src/components/workspace/dashboard/__tests__/viewport.test.ts` — two new
`describe` blocks:
- `framedRange never emits a span the RangePicker rejects (off-by-one repro)` — 3 failing
  assertions (a misaligned max-span viewport frames 31 inclusive days → `validateRange` returns
  `"Range too long (31 days > 30)"`; the aligned-30-day regression guard passes).
- `nextExtendGuard — the in-flight guard must not latch on a no-op extend` — 2 failing assertions
  (a `null` `needsExtend` result leaves the guard `true`; the full-trace test proves a no-op
  `older` latch then blocks a legitimate `newer` fire). The 2 positive-path assertions pass
  (fire-when-needed, hold-while-in-flight) — the reproduction is scoped to the latch alone.

To make Bug 2 red-green-able against shipped code, the watcher's guard next-state decision is
extracted into a new pure `nextExtendGuard(dir, currentGuard)` in `viewport.ts`, seeded with the
CURRENT (buggy) "null leaves the guard unchanged" semantics. The fix flips one branch
(`null → nextGuard:false`) and rewires `AutoExtendWatcher` to call it.

**Determinism:** every-run (pure functions; no clock, no async).

**Red output (verbatim):**
```
× a day-MISALIGNED max-span viewport frames ≤ MAX_RANGE_DAYS inclusive days
    AssertionError: expected 31 to be less than or equal to 30
× that framed span is ACCEPTED by the picker's own validateRange (no red border)
    AssertionError: expected 'Range too long (31 days > 30). Narrow…' to be null
× holds across a sweep of fractional pan offsets at max span
× CLEARS the guard when no extend is needed (the latch fix)
× does NOT permanently block the opposite direction after a no-op edge latch (full trace)
  Tests  5 failed | 78 passed (83)
```

**Notes for the fix (plan stage):**
- Bug 1: reconcile the two "30" bounds. Cleanest option: clamp `framedRange`'s emitted span to
  `MAX_RANGE_DAYS` inclusive days (`endLane ≤ startLane + (MAX_RANGE_DAYS - 1)`) so a misaligned
  max window can never present a 31st lane to the picker. Keep the aligned-30-day case at 30
  (regression-guarded). Must not touch `clampViewport`'s lane budget (30 lanes on screen is the
  gesture-smoothness contract) — only the day-granular readout mapping.
- Bug 2: flip `nextExtendGuard`'s null branch to `{ fire: false, nextGuard: false }`, then rewire
  `AutoExtendWatcher`'s debounced callback to route through it (read `firingRef.current`, apply
  `nextGuard`, `onExtend` on `fire`). The `[lo,hi]` clearing effect can stay (belt-and-braces) or
  be dropped — the pure decision now clears on the next null tick regardless. Keep it for the
  in-flight-to-landed transition clarity.

## Fix-size assessment (small/simple criteria for the eventual fix)
- No new data models / endpoints — ✅ (one new pure helper already added for the repro seam).
- No arch decisions — ✅ (localized to two co-located dashboard modules).
- ≤4 sentences to describe — ✅.
- <4 hrs — ✅.
- ≤200 lines — ✅ (two one-branch/one-line logic fixes + a small watcher rewire).
→ All five hold → **F33 → `/feature-plan`**.

## Work Tree

- [x] Phase 1: Fix `framedRange` off-by-one so the picker readout is always valid  <!-- status: done -->
  <!-- Phase-complete note: impl P1.1 done; verify-auto/self/codify all [x]; vh.1 live-picker visual CARRIED to /release. All children [x] → phase [x]. -->

  **Observable outcomes:**
  - CLI: `npx vitest run src/components/workspace/dashboard/__tests__/viewport.test.ts` exits 0 — the 3 `framedRange never emits a span the RangePicker rejects (off-by-one repro)` assertions now PASS (a day-misaligned max-span viewport frames ≤ 30 inclusive days; `validateRange(…, 30)` returns null).
  - CLI: the `framedRange` regression-guard `a genuinely 30-inclusive-day-aligned viewport still frames 30 days (no over-correction)` still PASSES (fix caps at 30, does not shave the legitimate 30-day case to 29).
  - CLI: all 4 pre-existing `framedRange — the day-granular ISO span…` assertions still PASS (one-lane, three-lane, boundary-end, over-pan clamp) — no regression to the core readout mapping.
  - [x] P1.1 In `viewport.ts framedRange`, cap the emitted day-granular span to `MAX_RANGE_DAYS` inclusive days. **As-built:** cap applied AFTER the `[origin,today]` ISO clamp (not on raw lanes) via `if (endIso > stepIso(startIso, MAX_FRAMED_DAYS-1)) endIso = …` — an initial lane-space cap over-corrected a legit over-pan case (broke the pre-existing `over-pans the edges` test); moving the cap after the coordinate clamp fixed it. New pure const `MAX_FRAMED_DAYS = MAX_ZOOM_OUT_SPAN_MIN/1440` (30) in `viewport.ts`; `RangePicker.MAX_RANGE_DAYS` now DERIVED from `MAX_ZOOM_OUT_SPAN_MIN/1440` too → the two "30"s are provably one number. `clampViewport`'s lane budget untouched.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — vitest -t framedRange: 8 passed/0 failed (3 repro + guard + 4 pre-existing); eslint viewport.ts+RangePicker.tsx exit 0; tsc --noEmit exit 0. The only 2 remaining viewport.test.ts fails are Phase-2 nextExtendGuard (expected still-red). -->
  - [x] verify-self  <!-- status: done — subagent (feature-verify-self-runner): all 5 CLI outcomes PASS (framedRange repro ×3, regression guard, 4 pre-existing, eslint clean, tsc clean). Pure-function change; the substance is fully CLI-pinned. Integration boundary = the Day-view RangePicker reactive readout — the LIVE VISUAL (no red border while panning a max-zoomed camera) is CARRIED to verify-human per the live/backend-lifecycle verify-self carve-out. -->
  - [x] verify-human  <!-- status: done — operator APPROVED Phase 1 (2026-07-20). All CLI outcomes PASS (verify-self). The one live-visual check vh.1 was CARRIED to the next /release gate per the operator's standing installed-build-verify-deferred-to-release preference — not a FAILED leaf; a deferred live check on a pure-function change fully pinned by CLI tests (low risk). -->
    - [~] vh.1 In the live dashboard Day view, zoom fully out (~30-day span) then drag-pan by a fractional day: the RangePicker readout must NOT show a red border / "Range too long" tooltip at any pan offset.  <!-- status: CARRIED-TO-RELEASE — operator-deferred 2026-07-20 (installed-build-verify-deferred-to-release) -->
  - [x] verify-codify  <!-- status: done — behavior codified: 3 off-by-one repro + regression guard (framedRange span ≤30 incl days) + new reconciliation test (MAX_RANGE_DAYS===30===MAX_ZOOM_OUT_SPAN_MIN/1440). Triaged 1 obsolete ?raw source-text assertion in dashboardWiring.test.ts (was pinning the hard-coded literal my fix replaced with the derivation) → updated to pin the derivation + moved the value/tie check to viewport.test.ts. Full suite: 1183 passed; only the 2 Phase-2 nextExtendGuard latch tests remain red (expected). -->

- [x] Phase 2: Fix the `AutoExtendWatcher.firingRef` latch  <!-- status: done -->
  <!-- Phase-complete note: impl P2.1+P2.2 done; verify-auto/self/codify all [x]; p2vh.1 live auto-extend behavior CARRIED to /release. All children [x] → phase [x]. -->

  **Observable outcomes:**
  - CLI: `npx vitest run src/components/workspace/dashboard/__tests__/viewport.test.ts` exits 0 — the 2 `nextExtendGuard — the in-flight guard must not latch on a no-op extend` assertions (`CLEARS the guard when no extend is needed`, `does NOT permanently block the opposite direction after a no-op edge latch (full trace)`) now PASS.
  - CLI: the 2 positive-path `nextExtendGuard` assertions (fires-when-needed, holds-while-in-flight) still PASS — the fix touches only the null-result branch.
  - CLI: `npx tsc --noEmit` exits 0 and `npx eslint src/components/workspace/dashboard/GlobalDashboard.tsx` clean — the `AutoExtendWatcher` rewire to route through `nextExtendGuard` compiles + lints (the FE-wiring trace the agent CAN verify statically; the live auto-extend behavior at the coordinate edges is a verify-human item per the backend-lifecycle verify-self carve-out).
  - [x] P2.1 In `viewport.ts nextExtendGuard`, release the guard on a null result. **As-built:** the null-release branch must run BEFORE the `currentGuard` in-flight hold (order matters — an initial `if(currentGuard) return {nextGuard:true}` first still held a latched guard on a null tick; reordered to `if(!dir) return {nextGuard:false}` first, then the hold, then fire+arm). Caught in-loop by the still-red latch tests.  <!-- status: done -->
  - [x] P2.2 Rewired `GlobalDashboard.tsx AutoExtendWatcher`'s debounced callback through `nextExtendGuard`. **As-built:** REMOVED the top-level `if (firingRef.current) return` early-return (that was the latch's teeth — it skipped the tick that would clear the guard); the tick now ALWAYS schedules, computes `{fire,nextGuard} = nextExtendGuard(needsExtend(...), firingRef.current)`, sets `firingRef.current = nextGuard`, fires only on `fire`. Kept the `[lo,hi]` clearing effect (belt-and-braces). Watcher + fn jsdoc updated.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — vitest -t nextExtendGuard: 4 passed/0 failed (2 latch-fix now green + 2 positive-path preserved); eslint GlobalDashboard.tsx+viewport.ts exit 0; tsc --noEmit exit 0. Full suite (from build) 1185 passed. -->
  - [x] verify-self  <!-- status: done — subagent (feature-verify-self-runner): all 4 CLI outcomes PASS (nextExtendGuard 4/4, tsc clean, eslint both files clean). Pure-function + static wiring trace fully CLI-pinned. Integration boundary = the live dashboard AutoExtendWatcher — the LIVE auto-extend edge behavior CARRIED to verify-human per the live/backend-lifecycle verify-self carve-out. -->
  - [x] verify-human  <!-- status: done — operator APPROVED Phase 2 (2026-07-20). All CLI outcomes PASS (verify-self). The one live behavior check p2vh.1 was CARRIED to the next /release gate per the operator's standing installed-build-verify-deferred-to-release preference — not a FAILED leaf; state-machine correctness is fully pinned by the nextExtendGuard tests, low-probability latent bug. -->
    - [~] p2vh.1 In the live dashboard Day view, pan hard to one coordinate edge (origin floor) then hard to the opposite (today): auto-extend must fire in BOTH directions — loader not stuck after reaching one edge.  <!-- status: CARRIED-TO-RELEASE — operator-deferred 2026-07-20 (installed-build-verify-deferred-to-release) -->
  - [x] verify-codify  <!-- status: done — behavior codified: nextExtendGuard 4 assertions (2 latch-fix + 2 positive-path) in viewport.test.ts; + new dashboardWiring.test.ts assertions pinning the watcher routes through nextExtendGuard AND does NOT reintroduce the `if (firingRef.current) return` latch. Full suite: 1185 passed / 0 failed. No triage (no failures). -->

## Current Node
- **Path:** Feature > feature-finalize (ship + review-quality complete)
- **Active scope:** finalize (both phases done; review-quality 0C/0M/2 MINOR auto-backlogged → WP6 fold-in)
- **Blocked:** none
- **Unvisited:** (none — feature complete; finalize closes it)
- **Open discoveries:** vh.1 (P1) + p2vh.1 (P2) CARRIED to next /release gate
- **Release-gate carries:** vh.1 — RangePicker no-red-border at max zoom-out pan; p2vh.1 — auto-extend fires both directions after hard-panning opposite edges (both live dashboard behaviors)

## Test Triage — dashboardWiring.test.ts "MAX_RANGE_DAYS is 30 (WP6b-4 re-spec D9)"
Classification: Obsolete test — the P1.1 fix intentionally changed the source line the assertion pins.
Confidence: high
Evidence: `dashboardWiring.test.ts:296` is a `?raw` SOURCE-TEXT assertion `expect(rangePicker).toContain("export const MAX_RANGE_DAYS = 30")`; P1.1 changed that literal to `export const MAX_RANGE_DAYS = MAX_ZOOM_OUT_SPAN_MIN / 1440` (deriving the value so the picker max and the zoom-out cap are provably one number). The BEHAVIORAL claim (value is 30, tied to the 30-day zoom-out cap) is unchanged and still true.
Action: Update the assertion to verify the runtime value + the derivation tie (import `MAX_RANGE_DAYS` and assert `=== 30 === MAX_ZOOM_OUT_SPAN_MIN/1440`) rather than the brittle source-text literal — stronger coverage of the actual reconciliation the fix made.

## Code-Quality Review — wp2-flexible-timeline-major-bugs

*(feature-review-quality subagent [code-quality-reviewer] on the uncommitted WP2 working-tree diff [5 files, +219/-13]; Mode 3 autopilot. **0 CRITICAL / 0 MAJOR / 2 MINOR** — both MINOR auto-backlogged [low]. Assessment: well-built, tightly-scoped; both fixes attack root mechanisms + land pure testable seams — a genuine testability improvement, not debt.)*

### Strengths
- Reproduce-first discipline exemplary — deterministic red-then-green pure-fn tests for both bugs; WIP records verbatim red output.
- `nextExtendGuard(dir, currentGuard)` is the right seam — turns an untestable effect-ref latch into a unit-pinned state machine without render-test infra the repo rejects.
- Both "30"s provably one number (`MAX_ZOOM_OUT_SPAN_MIN / 1440`); reconciliation pinned by a value+tie assertion.
- Comments encode WHY + SURFACE-ID backrefs; `dashboardWiring.test.ts` updated to pin the fix's invariant (`not.toContain("if (firingRef.current) return")`) so the latch can't be silently reintroduced.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [GlobalDashboard.tsx:257] `if (fire && dir) onExtend(dir)` — `fire` already implies non-null `dir` per `nextExtendGuard`'s structure, so `&& dir` is a TS null-narrowing artifact, not a logic guard; reads as though they could disagree. A one-line comment or `dir!` would make the invariant legible. — *invites a wrong "simplify" later.*
- [viewport.ts:220 / RangePicker.tsx:26] `MAX_FRAMED_DAYS` (private) and `MAX_RANGE_DAYS` (exported) each independently re-derive `MAX_ZOOM_OUT_SPAN_MIN / 1440`; comments claim "one number" but they're two parallel derivations. No test ties `MAX_FRAMED_DAYS` to `MAX_RANGE_DAYS` (the reconciliation test only pins `MAX_RANGE_DAYS`). Export one + reuse, or add a tie assertion. — *the fix's whole point is no drift; two derivations reintroduce a smaller drift surface.*

### Assessment
Well-built, tightly-scoped bug-fix that advances the codebase. Both fixes attack root off-by-one/latch mechanisms, each landed with a pure seam that makes previously-untestable behavior unit-pinned. Branch ordering in `nextExtendGuard` correct; removing the early-return does not introduce redundant `onExtend` fires (guard/needsExtend self-quiesces once a wider window lands). ISO-string span cap applied at the right layer (post-clamp, day-granular readout only, `clampViewport` lane budget untouched); string comparison sound for zero-padded ISO dates. Only residue is cosmetic — neither MINOR warrants a refactor pass.

### If you disagree
Dismiss any finding by marking it `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

> **WP6 fold-in note:** both MINORs are one-liners in files WP2 already touched — ideal to fold into **WP6** (the one-line nit pass) of this same paydown sweep. Auto-backlogged now per Case C; WP6 picks them up.

## Retrospect
- **What changed in our understanding:** Bug 1's fix location was non-obvious — the day-count cap can't be applied in raw lane-space (that over-corrects a legit over-panned viewport whose valid `[origin,today]` projection is already ≤30 days; it broke a pre-existing `framedRange` test). The cap must sit AFTER the coordinate clamp, on the day-granular ISO span. Bug 2's fix had a branch-ordering subtlety: the null-release must precede the in-flight hold in `nextExtendGuard`, or a latched guard + null tick still holds. Both were caught in-loop by the still-red reproduction tests — red-green paid off exactly as intended.
- **Assumptions that held:** the reproduction tests (written before the fix) pinned the right invariants; both fixes stayed within the co-located dashboard modules; no arch/plan change needed; the pure-seam extraction (`nextExtendGuard`) made an untestable effect-ref latch unit-pinnable without any render-test infra (the repo's `?raw` + MCP-bridge convention held).
- **Assumptions that were wrong:** the naive "clamp endLane in lane-space" for Bug 1 (over-corrected); the naive "check currentGuard first" ordering for Bug 2 (held a latched guard). Both surfaced immediately from the red tests, before verify.
- **Approach delta:** matched the plan's two-phase shape exactly; the only deltas were the two ordering corrections above (both mid-build, both test-caught) + one obsolete `?raw` source-text test triaged/updated at verify-codify (the fix changed the literal it pinned). No back-loops, no scope change.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
<!-- none -->
