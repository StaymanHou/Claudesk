---
drive_mode: autopilot
---

# Feature: Recycle only at clean boundaries (M16.5 WP9)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-07
**Entry:** spec (complex feature — WBS WP9 names spec as its entry: the boundary set is a spec decision)

## Problem Statement

Above 400k context tokens, the supervisor recycles the session (handoff → fresh CC → restore)
instead of chaining. It should do that only at a **clean workflow boundary**: the start of a new
phase. It does not.

`recycleTokens` (`src/state/supervisor/verdict.ts`) never looks at the edge being fired. Its third
condition, `atNonFinalPhaseBoundary` (`wipPhases.ts`), is a **WIP-state** check: it is true
whenever ≥1 phase is done and ≥1 is open. Once Phase 1 is ticked, every AUTO fire inside Phase 2+
over 400k recycles, including build → verify-auto and verify-auto → verify-self. Those recycles
hand off mid-phase, which is the opposite of clean. `arch/workflow-supervisor.md` §E describes
what the operator wants; the code does something else.

**Measured in the installed build** (`supervisor-activity.log`, the last 2,000 records): all **4**
real recycles happened at **mid-phase** edges and **none** at a phase start:

| When (ts) | Edge | Tokens | Project |
|---|---|---|---|
| 1790695637021 | F10 (verify-auto → verify-self) | 508,028 | ops-data-hub |
| 1793633533389 | F8 (build → verify-auto) | 488,911 | claudesk |
| 1793642874164 | F8 | 605,115 | mbt-copilot |
| 1794014799181 | F10 | 512,541 | ops-data-hub |

So every recycle observed in the field so far is the wrong-boundary case this WP fixes.

## Boundary-set measurement (task 9.1)

Measured from **3,115** CC transcripts (`~/.claude/projects/*/*.jsonl`): each `TRANSITION:` token
in an assistant text block, with the context reading on that line (`input + cache_read +
cache_creation`, the same reading the supervisor takes). ⚠️ The counts are an **upper bound**: the
regex also catches tokens that are mentioned in text rather than emitted, and it does not check
the WIP or the drive mode. Script:
`/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/932d22dc-68f7-4c54-9f60-329e9e7bc662/scratchpad/wp9/mine.py`.

| Edge | Meaning | Emitted | >400k | Sessions >400k | Ruling |
|---|---|---:|---:|---:|---|
| **F15** | verify-codify → build, more phases remain | 722 | **136** | **101** | **IN**: the start of a new phase, which is the operator's ask |
| F7 | plan → build (Phase 1 starts) | 439 | 12 | 12 | OUT: rare over 400k, and no phase has finished yet |
| F11 / F13 | verify-human → verify-codify | 349 / 779 | 52 / 212 | 40 / 143 | OUT: see below |
| F8 / F10 / F10b | build → verify-auto → verify-self → verify-human | 1,326 / 1,362 / 1,281 | 234 / 287 / 279 | — | OUT: mid-phase, the defect itself |
| F9 / F9b / F12 | back-loops into build | 7 / 135 / 104 | 2 / 49 / 32 | — | OUT: mid-phase, and the fix needs the failure's context |
| F16, F38, F39, F19, F30 | codify → ship → review → finalize → exit | 430 / 369 / 267 / 326 / 38 | 146 / 139 / 98 / 131 / 22 | — | OUT: the feature is nearly done; a restore costs more than it saves |
| S17 / S20 / S22 / S23 | session-boundary chain | — | 54 / 92 / 5 / 37 | — | OUT: the session ends there anyway |
| T2 / T5a / T5b | task plan → act → verify → close | 66 / 87 / 93 | 7 / 9 / 8 | — | OUT: rare, and the recycle stays feature-only by ruling |
| P*, I* | product, incident | — | ≤15 | — | OUT: these never chain at all (`[PRIOR: supervisor-chains-execution-workflows-only]`) |

**Why F11/F13 are out, despite being more frequent than F15 over 400k:**
1. F13 is followed by F15 one step later (codify, a short step). Adding it buys only the codify
   step's tokens.
2. In the **last** phase, F13 leads to codify → F16 → ship. Recycling there restores a fresh
   session to write one phase of tests and ship. That is the "nearly done" case ruled out above.
3. Codify writes tests for what verify-human just approved. That approval and its corrections live
   in the conversation, and a restore keeps only what the WIP recorded.

**Cost of F15 alone, accepted:** a session that crosses 400k inside phase N chains until the end of
phase N and recycles at that phase's F15. The overshoot is at most one phase. A session that
crosses 400k in the **last** phase never recycles, which is the intended behavior.

## User Stories

- As the operator running a long multi-phase feature in autopilot, I want a context-pressure
  recycle to happen only between phases, so that the fresh session starts on a clean unit of work
  (`/feature-build` for the next phase) and never inherits a half-finished build or verify step.
- As the operator reading `supervisor-activity.log`, I want a mid-phase fire over 400k to show as
  an ordinary `fired` record carrying its `tokens`, so that I can see the recycle was deferred,
  not lost.

## Acceptance Criteria

- **AC-1 (the defect):** over the threshold, with a feature WIP in Phase 2+ (≥1 phase done, ≥1
  open), a would-be fire on **F8, F10 or F10b** returns `fire`, not `recycle`. ⚠️ This test must
  **fail on current code first** (it recycles today).
- **AC-2 (the boundary):** over the threshold, with the same WIP, a would-be fire on **F15**
  returns `recycle`, carrying the edge, the deferred skill and the token reading.
- **AC-3 (one authority for the set):** the boundary set is **one exported constant** (e.g.
  `RECYCLE_BOUNDARY_EDGES = ["F15"]`). `recycleTokens` keys on the fired edge
  (`mechanical.edgeId`) checked against it. Nothing else names a boundary edge.
- **AC-4 (membership is mutation-proven, one edge at a time):** removing F15 from the constant
  fails AC-2. Adding F10 fails AC-1. Each mutant is run individually and confirmed to have landed.
- **AC-5 (every member is a real feature edge):** a test asserts every ID in the constant exists in
  the feature table of `workflowMachine/edges.ts`, so a typo (`"F 15"`) cannot silently disable the
  recycle.
- **AC-6 (the second guard stays, and stays tested):** F15 over the threshold still **chains**
  (does not recycle) when the WIP is not a feature WIP, has no phase done, has every phase done, or
  cannot be read. The existing `isFeatureWorkflow` mutant test stays green.
- **AC-7 (unchanged orderings):** a mechanically withheld turn never recycles, the adjudicator
  still runs before the recycle check, and an AWAITING ruling still withholds at F15. The existing
  tests for these stay green unmodified.
- **AC-8 (docs agree with code):** `arch/workflow-supervisor.md` §E states the edge rule (F15 only,
  with the reason and the measurement), the `recycleTokens` doc lists its conditions as built, and
  WBS WP9 tasks 9.1–9.5 are ticked. No new activity-log reason is added (a deferred recycle is a
  `fired` record with `tokens`, which already exists).
- **AC-9:** `pnpm verify:auto` is green.
- **Deferred to dogfooding (as with WP7), not passed:** in the installed build, every
  `recycle-started` record carries `edgeId: "F15"`.

## Out of Scope

- The threshold (400k stays; the recorded next rung is still 500k).
- Recycling in task, incident or product workflows, and at F7, F11/F13, or any ship/finalize/session
  edge (ruled out above, with measurements).
- The recycle mechanics: `recycleSession`, `fireRecycle`, the handoff/restore path, the re-entrancy
  guard.
- A new activity-log reason or field for a deferred recycle.
- Any change to the mechanical policy, the adjudicator, or which edges chain.

## Technical Constraints

- No 3rd-party dependency; no probe needed.
- The change sits inside `recycleTokens`, which is called only from `decideSupervised`, after the
  adjudicator. That ordering is load-bearing and must not move.
- `atNonFinalPhaseBoundary` and `isFeatureWorkflow` have exactly one production caller
  (`recycleTokens`) plus their own tests and `verdict.test.ts`.
- `mechanical.edgeId` is the resolved emitted token (`"F15"`), a string from the feature table in
  `src/state/workflowMachine/edges.ts`.
- Verification lessons that bind here: `docs/lessons/source-text-guards.md` entries 15 (a fixture
  must make the right and wrong answers differ, so the AC-1 WIP must be Phase 2+ and over the
  threshold) and 16 (sweep every exit of `recycleTokens`, not only the one the defect surfaced).

## Open Questions

(none: the boundary set was settled by measurement above)

## Elicitation

**Asked:** none. The one judgment call (the boundary set) is a one-line constant, which is cheap to
reverse, and it is presented here for the spec-review pause instead of as a separate question.

**Assumed (each is overridable at this review):**
1. **The boundary set is F15 alone.** The measurements and reasons are in the table above.
2. **`atNonFinalPhaseBoundary` stays as a second guard (task 9.3), and so does
   `isFeatureWorkflow`.** F15 already means "more phases remain", but that is the agent's claim in
   a token. The WIP checkboxes are independent evidence, and when the two disagree the recycle is
   withheld and the turn chains, which is the safe direction. Keeping the guard costs nothing and
   keeps existing mutation-proven tests. Its doc comment is rewritten so it no longer reads as the
   boundary decision itself.
3. **No new withhold reason or log field.** A mid-phase fire over 400k already logs as `fired` with
   `tokens`.
4. **The recycle stays feature-workflow-only.** The task edges cross 400k ≤9 times each across all
   transcripts.
5. **The installed-build check is deferred to dogfooding,** following WP7 and the WBS acceptance
   line.

## Ship

- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` exit 0, 3800 + 1069 passed); nothing changed after it but the WIP and `runtimes.md`.
- Lint (0 errors, the 1 pre-existing warning) and `format:check` re-run clean at ship.
- Commit only, NOT pushed: `main` stays local, per the project's current practice (35+ commits ahead of `origin/main`). Operator-owned unstaged edits (`CLAUDE.md`, `wbs.md`, `backlog.md`, outbox) left out of the commit.

## Plan notes (feature-plan, 2026-11-07)

- **Spec approved as written** by the operator ("go ahead"), including all five Assumed defaults.
- ⚠️ **AC-7 refined at plan: the existing recycle tests MOVE from F5 to F15. That is not a
  modification of what they prove.** Every recycle test today emits **F5** (research → plan):
  `verdict.test.ts` (the "M15 WP4 recycle branch" describe), `fanOut.test.ts` (~:521–576) and
  `activityFunnel.test.tsx` (the `recycle %s` table). Under the new rule F5 is not a boundary edge,
  so each "FIRES when condition X is false" test would pass for the **wrong reason** (the edge),
  and stop proving its own condition. That is lesson entry 15: the fixture makes the right and
  wrong answers identical. So every recycle-branch test re-keys to **F15**, the one edge where the
  other three conditions are still what decides. Fire-path tests that never cross the threshold
  keep F5 (it is a fine AUTO edge for them).
- Shape of the change: `RECYCLE_BOUNDARY_EDGES: ReadonlySet<string>` exported from `verdict.ts`
  (beside `recycleTokens`, its only reader). `recycleTokens` takes the edge
  (`recycleTokens(input, mechanical.edgeId)`) and checks membership first. No signature change to
  `decideSupervised` or `decideVerdict`.
- Single phase: the change is ~10 lines of code. The doc edits ride with it, so the arch and the
  code are never out of step at a commit.
- No live verify-self of an actual recycle: provoking one needs a real session over 400k at a
  phase boundary. The real hook path is covered by `activityFunnel.test.tsx` (the jsdom
  `useSupervisor` harness), and the CLI replay below feeds the four real field cases through the
  real `decideSupervised`. The installed-build check is deferred to dogfooding (spec).

## Work Tree

- [x] Phase 1: Recycle keys on the fired edge (F15 only)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor` exits 0, with a `Tests N passed` line where N is at
    least the pre-change count plus the new tests.
  - CLI (failing-first): the new AC-1 test (F8, F10, F10b over the threshold, feature WIP in Phase 2,
    expects `fire`) **fails on the pre-change `verdict.ts`** (it reads `recycle`), and passes after.
    Evidence: the two runs' output, the pre-change one taken from a HEAD copy (`git show
    HEAD:src/state/supervisor/verdict.ts`), never by `git checkout`.
  - CLI (field replay): a throwaway vitest spec in `tmp/scratch/` feeds the **four real recycles**
    from the installed `supervisor-activity.log` (F10 508,028 · F8 488,911 · F8 605,115 · F10
    512,541), each with a Phase-2 feature WIP, through the real `decideSupervised`. All four return
    `fire`. The same inputs re-keyed to F15 return `recycle` with the same token reading.
  - CLI (mutation, one at a time, landing confirmed with `sed -n`): (a) remove `"F15"` from
    `RECYCLE_BOUNDARY_EDGES` → the AC-2 test fails; (b) add `"F10"` → the AC-1 test fails; (c) drop
    the membership check from `recycleTokens` → AC-1 fails; (d) drop `atNonFinalPhaseBoundary` →
    the F15 all-phases-done test fails; (e) drop `isFeatureWorkflow` → the F15 task-with-phases
    test fails. Each run prints its own `Tests N` line.
  - CLI: an AC-5 test asserts every member of `RECYCLE_BOUNDARY_EDGES` is an edge in
    `workflowMachine/edges.ts` with `workflow: "feature"`. Mutant: `"F 15"` → that test fails.
  - CLI: `pnpm verify:auto` exits 0 (timeout 207000).
  - CLI: `grep -n "phase boundary that is not the last phase" workflow-system/product/arch/workflow-supervisor.md`
    returns nothing, and §E names F15 and `RECYCLE_BOUNDARY_EDGES`.
  **Alignment questions:**
  - F15-only in action: the four real field recycles (F8/F10, 489k–605k) now replay as ordinary
    fires, and a session over 400k recycles only at the next phase start. Now that you see it,
    still what you want?
  - [x] P1.1 Failing-first: add the AC-1 test (F8/F10/F10b, over, Phase-2 feature WIP → `fire`) to `verdict.test.ts`; run it and capture the RED  <!-- status: DONE -->
  - [x] P1.2 Add `RECYCLE_BOUNDARY_EDGES = new Set(["F15"])` to `verdict.ts`; `recycleTokens` takes the fired edge and checks membership first; rewrite its doc comment (four conditions, the edge first, `atNonFinalPhaseBoundary` as the second guard with the reason)  <!-- status: DONE -->
  - [x] P1.3 Re-key every recycle-branch test from F5 to F15 (`verdict.test.ts`, `fanOut.test.ts` ~:521–576, `activityFunnel.test.tsx` recycle table); add AC-2 (F15 recycles), AC-5 (members are feature edges), and an F15 unreadable-WIP case if none exists  <!-- status: DONE -->
  - [x] P1.4 Update the doc comments of `atNonFinalPhaseBoundary` / `isFeatureWorkflow` (`wipPhases.ts`): they are the second guard behind the edge rule, not the boundary decision  <!-- status: DONE -->
  - [x] P1.5 Rewrite `arch/workflow-supervisor.md` §E: the edge rule, F15 only, why F11/F13/F7/ship are out (one line each + the transcript measurement), the four field recycles, the `atNonFinalPhaseBoundary` second guard; no new log reason  <!-- status: DONE -->
  - [x] P1.6 Mutation pass (a)–(e) + the AC-5 typo mutant, one at a time, files restored by `cp`+`shasum`  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
    — evidence: `pnpm verify:auto` → exit 0, 43s: lint 0 errors (1 pre-existing `exhaustive-deps` warning, XtermPane.tsx:943, not ours) · format:check · tsc · check:link "every entry linked cleanly (main, pip)" · vitest `Test Files 292 passed`, `Tests 3800 passed` · cargo fmt · clippy -D warnings · cargo test 1069 passed
    — evidence (build, P1.1): AC-1 RED on pre-change code, `Tests 5 failed`, "expected 'recycle' to be 'fire'" for F8/F9/F9b/F10/F10b
    — evidence (build, P1.6): 6 mutants each landed (`grep -n` shown) and each failed ≥1 test: (a) empty set, (b) +F10, (c) membership check dropped, (d) `atNonFinalPhaseBoundary`→true, (e) `isFeatureWorkflow`→true, (typo) "F 15"; `verdict.ts` restored, shasum matched
  - [x] verify-self  <!-- status: DONE -->
    — evidence: `vitest run src/state/supervisor` → exit 0, `Test Files 23 passed`, `Tests 425 passed` (the 444 at build also included `supervisorActivityLive.test.tsx`, 24 files; same tests, wider scope)
    — evidence (field replay, throwaway spec, deleted): the 4 real `recycle-started` records (jq over the installed `supervisor-activity.log`: F10 508028 · F8 488911 · F8 605115 · F10 512541) through the real `decideSupervised` → all 4 `fire`; re-keyed to F15 → all 4 `recycle`, tokens equal to the reading
    — evidence (consuming surface): `activityFunnel.test.tsx -t "MID-PHASE"` drives the real `useSupervisor` hook: F10 at threshold+1 → record `outcome: "fired"`, `edgeId: "F10"`, `tokens` = threshold+1; `Tests 1 passed`
    — evidence: AC-5 test present (verdict.test.ts, "every boundary edge is a real FEATURE edge") and green; arch §E: old phrase grep → no match, §E names F15 + `RECYCLE_BOUNDARY_EDGES`
    - [x] align: F15-only in action — evidence: replay table above (orig edges → fire ×4; F15 re-key → recycle ×4)
  - [x] verify-human  <!-- status: DONE -->
    - [x] P1.verify-human.1: F15-only in action (field replay: 4 real mid-phase recycles → fire; F15 → recycle) — still what you want?  <!-- status: DONE — operator: "yes" (2026-11-08) -->
  - [x] verify-codify  <!-- status: DONE -->
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → exit 0, 49s: `Test Files 292 passed`, `Tests 3800 passed`, cargo test 1069 passed, clippy + fmt + check:link clean (1 pre-existing lint warning, XtermPane.tsx:943)
    — no new tests: every approved behavior already has a regression-catching test written at build (mid-phase `it.each`, F15 recycle, the IFF population guard, AC-5 membership, the `activityFunnel` consuming-surface test through the real `useSupervisor`). The field replay was not codified: its four readings exercise the same branch as threshold+1, already covered by the population guard.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (ship commit = HEAD after this commit)
- **Blocked:** none
- **Unvisited:** review-quality, finalize
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-11-07] feature-spec — wbs.md exceeds size guard (~545 lines), read by heading + the WP9 section only. Consider summarizing at /product-finalize.
