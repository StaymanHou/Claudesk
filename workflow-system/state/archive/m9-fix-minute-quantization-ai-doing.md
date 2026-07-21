# Feature: Fix minute-quantization zeroing sub-minute ai-doing (M9 WP4)

**Workflow:** feature
**State:** finalize (complete) — COMPLETED 2026-07-13
**Created:** 2026-07-13
**Entry:** reproduce (bug-fix feature)
**Drive mode:** autopilot

## Problem Statement
The time-analytics segment model reports `ai_doing: 0` for tool-heavy CC sessions because `src-tauri/src/time_store/query.rs` floors each segment's ms endpoints to integer minutes (`ts_to_minutes` = `(ts_ms - day_start_ms).div_euclid(60_000)`, L181) BEFORE summing per-kind durations (`seg.end - seg.start`, day L363 / week L709). A real CC tool call is `PreToolUse`→`PostToolUse` ~1s apart, so its `[start, end]` floors to the SAME minute → `end - start == 0` → the AI's actual tool-execution time vanishes from the rollup, while the minute-scale `reviewing` gaps between tools survive and over-report. This silently corrupts M9's core "measure, don't infer" value prop and every AI-vs-human duration number. Surfaced by the operator at WP6b-2 Phase 1 verify-human ("why isn't my afternoon work showing up?" — neo-stayman-assistant's tool-heavy afternoon showed a 1m AI pill). Root-caused by code read + live dev-DB data (`SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-ZEROES-SUBMINUTE-AI-DOING`).

## Reproduction Attempt
**Surface chosen:** failing test (unit, in `src-tauri/src/time_store/query/tests.rs`)
**Outcome:** reproduced
**Artifact:** TWO failing tests in `src-tauri/src/time_store/query/tests.rs`, both asserting on `build_week`'s `RollupCell.ai_doing` ALONE (the exact corrupted user-visible number — the pre-existing week tests assert `ai_doing + ai_reasoning > 0`, which is WHY they never caught it: ai_reasoning's minute-scale gaps mask a zeroed ai_doing). New helper `at_ms(d, ms)` for sub-minute event placement.
  1. `subminute_tool_calls_accrue_ai_doing_minutes_not_zero` — 6 back-to-back tool calls (18s each, 108s = 1.8min ≈ 2min true) over 09:00:00→~09:01:48. Asserts `ai_doing >= 2`. RED: `got ai_doing=1` (only the one span straddling the 09:00→09:01 boundary survives with end-start=1; the other five floor to same-minute zero-width).
  2. `tool_calls_within_a_single_minute_still_accrue_ai_doing` — 4 tool calls (12s each, 48s) ALL inside 09:00:00→09:00:55. Asserts `ai_doing >= 1`. RED: `got ai_doing=0` (the starkest form — every seg floors to the same minute → total zero though the AI worked 48s).
**Determinism:** every-run. `cargo test --lib accrue_ai_doing` → both **FAILED** (`ai_doing=1` expected≥2; `ai_doing=0` expected≥1). Proves the quantization is the cause: the tiling produces the correct band *sequence* (verified via debug print — all `ai-doing` segs, correct order); only the durations are floored away. 498 other lib tests unaffected. The FIRST-draft assertion (`>= 1` on a fixture that straddled a boundary) passed by luck — refined to the discriminating `>= 2` + the within-one-minute stark case.
**Notes:**
- The fix must PRESERVE the frozen contract: `SegPayload.start`/`end` stay integer minutes-from-midnight (WP1 mandate; WP6 render depends on it). The fix is to compute per-kind duration TOTALS at ms (or finer) precision, converting to minutes ONCE per total — not per-segment-floored spans. Equivalent framings: (a) round each segment's *duration* `(end_ms - start_ms)` to minutes with round-half-up rather than flooring both endpoints then subtracting; (b) accumulate ms per kind, convert the sum. Option (b) is more correct (no per-segment rounding drift) but the rollup currently sums the minute-coordinate segments directly, so the cleanest fix likely lives where `RollupCell`/day per-kind totals are computed.
- Real-data anchor (deterministic, in the dev DB `com.claudesk.app.dev/time-analytics.sqlite`): neo sessions `df2a3051` (92 tool events, 11 min → currently `ai_doing:0, reviewing:11`) + `ea577ad8` (16 min → `ai_doing:0, reviewing:15, subagent:1`). After the fix, both should show realistic nonzero `ai_doing`.
- This is a PAUSED-WP6b-2 side fix (operator, 2026-07-13): WP6b-2 P1 is approved + on hold at verify-codify; fix this, then resume WP6b-2. WP6b-2's Week render is correct — it faithfully renders whatever the query produces.

## Small/simple assessment (→ F33 plan)
- No new data models/endpoints (preserves `SegPayload`/`RollupCell`/the frozen contract). ✓
- No arch decisions (a duration-summing precision fix within `query.rs`). ✓
- ≤4 sentences / <4hrs / ≤200 lines. ✓
- All five criteria hold → small/simple → `/feature-plan` (F33).

## Fix design (plan-time, from code read)

**Root:** durations are derived by subtracting minute-quantized endpoints (`seg.end - seg.start`), so any span narrower than a minute → 0. The quantization of `start`/`end` for RENDER POSITION is correct + contract-mandated (WP1); only DURATION-summing must not go through it.

**Blast radius (every site that sums durations from minute-quantized segs):**
- Backend `src-tauri/src/time_store/query.rs`: (a) `project_ai_minutes` L363 (project sort key); (b) week rollup L709 (`RollupCell` per-kind minutes → the Week pill). The day `DayPayload` has no separate per-kind rollup (the FE computes day stats), so those two are the backend sites.
- Frontend `src/components/workspace/dashboard/kinds.ts`: `sumByKind` (L102) + `sumActive` (L114) sum `s.end - s.start` on the SAME minute-quantized `SegPayload`s → the day-view SummaryStrip "Active" stat (`dayStats.computeDayTotals`) + the per-session total pill (`DayTimeline` SessionRow) are ALSO wrong. `weekMath.cellActive` reads the backend `RollupCell`, so fixing the backend rollup fixes the Week pill automatically.

**Chosen fix — add a true-duration field to the segment (contract-ADDITIVE, minimal):**
1. Backend: add `dur_ms: i64` to `SegPayload` = the reclassifier segment's true `end_ms - start_ms` (available at the `SegPayload` build site, query.rs L321-324, from `s.start_ms`/`s.end_ms`). `start`/`end` stay minute-quantized (unchanged; render position preserved).
2. Backend rollup sites (L363, L709): sum `dur_ms` per kind, convert the per-kind TOTAL to minutes ONCE via round-half-up (`(sum_ms + 30_000) / 60_000`). A single sub-minute seg still rounds its total up to ≥1 min once several accrue; a lone <30s span rounds to 0 (acceptable — sub-30s total really is ~0 min). This removes the per-segment zeroing.
3. Frontend: mirror `dur_ms` on the FE `SegPayload` type (`src/state/timeAnalytics.ts`) + the `KindSpan` interface (kinds.ts). `sumByKind`/`sumActive` sum `s.dur_ms` and return minutes via the same round-half-up, preserving their minute-returning contract. All existing callers unchanged (they still get minutes).
4. IPC casing: `dur_ms` is snake_case (matches the DTO convention; the `dto_serde_shape_is_snake_case` test + FE mirror stay in sync).

**Why not "round each seg's duration to minutes at build time" (rejected):** it breaks seg tiling contiguity (start/end must tile with no gaps) and either still zeroes (round-down) or massively inflates (round-up: 6×18s → 6 min). Keeping `start`/`end` exact-minute for tiling + carrying `dur_ms` for summing is the only approach that's both contract-preserving AND correct.

## Work Tree

- [x] Phase 1: Carry true duration (`dur_ms`) and sum on it, not on minute-quantized endpoints  <!-- status: [x] — all impl + verify nodes complete -->
  **Relevance check:** single-phase feature, no prior phase — N/A.
  **Observable outcomes:**
  - CLI (the RED anchor → GREEN): `cd src-tauri && cargo test --lib subminute_tool_calls_accrue_ai_doing_minutes_not_zero` → PASSES (was FAILED with `ai_doing == 0`). The reproduction test is the verify-codify anchor.
  - CLI (no regressions): `cd src-tauri && cargo test` → all lib + integ tests pass (was 498 lib + 6 integ before this WP; +1 new repro test). `cargo clippy --all-targets -- -D warnings` clean.
  - CLI (FE contract sync): `./node_modules/.bin/tsc --noEmit` exit 0 (FE `SegPayload` gains `dur_ms`); `./node_modules/.bin/vitest run src/components/workspace/dashboard` passes (existing `sumByKind`/`sumActive`/`weekMath` pins still green with the `dur_ms`-based sums; add pins for the sub-minute case).
  - Browser (LIVE via MCP bridge, real dev DB): open the dashboard (`⌘⇧A`), Day view — neo-stayman-assistant's per-session "Active" pill + SummaryStrip "Active" stat show a realistic NONZERO value (was ~0 / 1m for its tool-heavy sessions). Week view — neo's week-total pill shows realistic minutes (was `1m`). Verified against the raw dev-DB tool-execution time (`df2a3051` ~108s+ of tool spans → ≥1m ai-doing).
  - CLI (real-data cross-check): direct `time_analytics_query({kind:"day"})` for neo via the bridge shows `ai-doing` minutes > 0 in its session segs' summed durations (currently 0).
  - [x] P1.1 Backend: add `dur_ms: i64` to `SegPayload`, populated at the build site from the reclassifier seg's `(end_ms - start_ms).max(0)`. `start`/`end` unchanged (minute-quantized render position).  <!-- status: [x] -->
  - [x] P1.2 Backend: fixed both duration-sum sites to sum `dur_ms` then convert per-kind TOTAL to minutes once (round-half-up). Added `ms_to_minutes_round` helper. `project_ai_minutes` sums AI-family `dur_ms`. Week rollup now accumulates into an internal `RollupCellMs` (ms per kind) → `into_rollup_cell()` converts each cell once.  <!-- status: [x] -->
  - [x] P1.3 Frontend: mirrored `dur_ms` on `SegPayload` (`timeAnalytics.ts`) + `KindSpan` (kinds.ts); `sumByKind`/`sumActive` sum `s.dur_ms` + `msToMinutesRound` (mirror of backend). All minute-returning callers unchanged. Minimap's local `DensitySeg` is position-only (no dur_ms needed).  <!-- status: [x] -->
  - [x] P1.4 Fixtures updated: backend DTO test (`dur_ms` in 2 fixtures + pinned in the wire-key list + value asserts); FE `kinds.test.ts` (minute-scale fixture + NEW sub-minute regression pin), `dayStats.test.ts` (`seg()` helper defaults `dur_ms`), `timeAnalytics.test.ts` (3 fixtures). All compile + pass.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: cargo test --lib time_store::query = 22/22 (fix + 2 repro tests GREEN); FE tsc --noEmit exit 0; eslint clean on timeAnalytics.ts + kinds.ts. -->
  - **Build gate (self-run):** cargo test 500 lib + 6 integ ✓; clippy --all-targets -D warnings ✓; tsc ✓; dashboard vitest 125 ✓; vite build ✓ (main 426kB unchanged). The 2 RED repro tests → GREEN.
  - [x] verify-self  <!-- status: [x] — LIVE via MCP bridge against the REAL dev DB (the sessions that surfaced the bug). `time_analytics_query` DAY: neo `df2a3051` (was ai-doing:0) now `ai-doing`=56,505ms (~57s); `ea577ad8` `ai-doing`=21,687ms + subagent=61,936ms; every seg `hasDurMs:true` (field present end-to-end backend→IPC→FE). WEEK rollup neo cell: `ai_doing:1, subagent:1` (was `ai_doing:0`). Rendered dashboard: SummaryStrip "ACTIVE 49m" (was deflated); neo shows a 2m project pill + both sessions render visible ai-doing(indigo)+subagent(violet) bars with 1m active pills (was pure-reviewing/zero). 0 console errors. Screenshot captured. Honest result — neo's afternoon was genuinely short tool bursts amid long reviewing gaps (reviewing:27m), now accurately measured instead of zeroed. All PASS. -->
  - [x] verify-human  <!-- status: [x] — operator approved ("carry it to completion"). The fix's own observable outcome (sub-minute AI-doing accrues instead of zeroing) is confirmed on visible data: df2a3051 went ai_doing 0→~57s; morning project pills show real AI minutes. The "afternoon looks empty/wrong" concern that dominated this gate was investigated to ground and found UNRELATED to this fix — it was an agent-caused app-kill at 11:19 (tracking-on dev instance killed during a verify-self teardown) + the machine-global/tracking-on-instance capture model, NOT the dur_ms change. Operator confirmed the capture nuance is expected behavior (not a defect) and directed completion. Note: a fully-clean afternoon render couldn't be re-evaluated because that window's capture was destroyed by the app-kill; the fix is verified on the data that survived + at the unit level (2 repro tests). -->
    - [x] P1.verify-human.1 Corrected AI-active numbers verified on visible (morning + evening) data; afternoon-appearance concern resolved as unrelated (app-kill + capture model, not this fix). Operator approved.  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — regression coverage codified. NEW: `ms_to_minutes_round_is_round_half_up_and_zero_clamped` (the load-bearing rounding arithmetic — boundaries 0/29999→0, 30000→1, 90000→2, negative→0, 108s→2). Existing anchors kept: 2 week-rollup repro tests + FE kinds.test.ts sub-minute pin + DTO shape test pins `dur_ms` on the wire (integration-boundary coverage of the time_analytics_query response shape). Full suites GREEN: 501 lib + 6 integ, 944 FE (95 files), clippy --all-targets -D warnings clean. No test failures → no triage. -->
  - **All phases complete → ship.**

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** review-quality done — 0 CRITICAL / 1 MAJOR / 2 MINOR, all auto-backlogged (Mode 3). Next: `/feature-finalize`.
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** none

## Code-Quality Review — m9-fix-minute-quantization-ai-doing

### Strengths
- Contract-additive fix: `dur_ms` added alongside the frozen minute-quantized `start`/`end` rather than reinterpreting them — WP1 render-position contract preserved exactly while duration-summing is corrected. Rejected-alternatives note ("round each seg at build time") shows the tradeoff was reasoned.
- Precision discipline: durations accumulate at ms (`RollupCellMs`) and convert to minutes once per per-kind total via a single round-half-up — no per-segment rounding drift.
- Doc-comments encode WHY: every touched site carries the SURFACE ID + a "why `end - start` is wrong here" line — signposts the trap at the type definition.
- The 2 repro tests are discriminating: assert on `ai_doing` ALONE + document why the pre-existing `ai_doing + ai_reasoning > 0` tests masked the bug; the within-one-minute case is the starkest form.
- `RollupCellMs` mirrors `RollupCell` field-for-field; `into_rollup_cell` converts every field — no kind silently dropped.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [src/components/workspace/dashboard/DayTimeline.tsx:138-142] The local `sumKind` helper still sums minute-quantized `(s.end - s.start)` — the exact pattern this feature fixed in `kinds.ts`. Feeds `ProjectTotals.away` (L859), the day-view project pill. Outside the 7-file review scope but same blast-radius; the WIP's "Blast radius" section enumerated the kinds.ts sums + backend sites but missed this third copy. — *Why: the fix is incomplete for `away` on the day view. `away` is minute-scale so the under-report is smaller than ai-doing's zeroing, but sub-minute away gaps still under-count, and a live copy of the killed pattern invites copy-forward. Backlog is fine given away's lower sub-minute susceptibility.* **[VERIFIED by orchestrator: confirmed real at DayTimeline.tsx:138-142 → feeds `away:` at L859.]**

**MINOR**
- [query/tests.rs:70 / kinds.test.ts:96] FE/BE round-half-up helpers are an intentional documented mirror, but no single test asserts the two AGREE on the same inputs — each pinned independently. Pivot (30_000) duplicated in 3 places. — *Why: parity is currently correct + both pinned, so not a bug; a latent drift channel. A shared fixture table would close it. Low priority.*
- [query.rs:376] `dur_ms: (s.end_ms - s.start_ms).max(0)` clamps negative to 0, mirroring `ms_to_minutes_round`'s own negative-guard → reversed segment defended twice. — *Why: harmless redundancy; the helper's negative branch can only fire on a summed total, never a single seg. Noting the double-guard.*

### Assessment
Well-built, appropriately-scoped fix. Correctly diagnoses the bug as precision loss (quantize-then-subtract zeroes sub-minute spans) not a logic error, and repairs it with the minimal contract-additive change instead of the tempting-but-wrong "round each segment" shortcut. Advances the codebase: the anti-pattern is now documented at the type definition + both summing sites. Test coverage is strong + honest. The one real gap is the third copy of the buggy `end - start` sum in `DayTimeline.tsx`'s `away` total (lower-severity, minute-scale). FE/BE helper duplication is the only slightly-fragile seam, well-documented + individually pinned.

### If you disagree
Operator: dismiss any finding by editing this section + marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The bug was a *precision-loss* defect (quantize-to-minutes, THEN subtract), not a classification error — the reclassifier's segment sequence was correct all along; only the durations were floored away. Confirmed by a debug print showing all `ai-doing` segs as `(540,540)` zero-width. Also learned (the hard way) that the "afternoon looks empty" symptom the operator reacted to was NOT this bug at all — it was TWO other things surfaced during the investigation: (a) an agent-caused app-kill at 11:19 (a blanket `pkill`/port-kill teardown took down the operator's live tracking-on instance), and (b) the machine-global / live-tracking-on-instance capture model (operator-confirmed expected behavior, now in the [[time-tracking-capture-is-machine-global]] memory).
- **Assumptions that held:** `dur_ms`-on-`SegPayload` + sum-on-`dur_ms` + round-once was the right contract-additive fix (WP1's minute contract stayed intact); the reference `reclassify.py` never hit this because it summed in ms — exactly as hypothesized at plan time.
- **Assumptions that were wrong:** (1) My first repro fixture asserted `>= 1` on a boundary-straddling case and passed by LUCK — refined to `>= 2` + a within-one-minute stark case (`ai_doing == 0`). (2) My blast-radius analysis enumerated the `kinds.ts` sums + 2 backend sites but MISSED a third copy of the `end - start` anti-pattern in `DayTimeline.tsx`'s local `sumKind` (caught by review-quality → backlogged). (3) I declared verify-self "done" on the query *numbers* + one morning screenshot without actually looking at the afternoon render — the operator had to push back twice ("have you verified it yourself?") before I found the real (unrelated) causes.
- **Approach delta:** Implementation matched the plan (single-phase, `dur_ms` + helper + 2 sum sites + FE mirror). The DELTA was in verification: what should have been a clean verify-self → verify-human turned into a multi-turn investigation because the operator's symptom pointed at a phantom afternoon gap that was actually agent-caused + a capture-model nuance, orthogonal to the fix. Lesson reinforced: when an operator reports a symptom, verify the *rendered reality they're seeing* end-to-end before theorizing, and never blanket-kill a shared-binary process ([[verify-self-dev-vs-prod-process-name-collision]]).
