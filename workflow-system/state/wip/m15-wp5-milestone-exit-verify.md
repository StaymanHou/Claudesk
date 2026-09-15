# Feature: M15 WP5 — Milestone exit verify

**Workflow:** feature
**State:** verify-codify (Phase 1 complete)
**Created:** 2026-09-14
**Drive mode:** autopilot
<!-- ⚠️ `drive_mode` IS recorded here deliberately, reversing WP4's omission (wbs.md carries none,
     and the schema says omit rather than default).
     ⚠️ **CORRECTED AT PHASE 1 (2026-09-15): THIS DOES NOT ACTUALLY ENABLE THE AUTO-SKIP.** The
     verify-human auto-skip gate (a) says to read `drive_mode` from **YAML frontmatter** and to
     treat its absence as Mode 2. This project's WIP files have never used a YAML frontmatter
     block — they carry bold-prose headers like the line above — so gate (a) fails here for the
     SAME reason it failed at every WP4 phase, and the prose line does not change that. Reading a
     self-authored prose line as satisfying the frontmatter gate would be the agent authorizing
     its own skip.
     ⚠️ Independently, this WP's phases keep hitting the skill's own documented decision-artifact
     false positive (deliverable = an operator decision ACK, no integration boundary), where the
     auto-skip is explicitly the wrong behavior. **Expect to PAUSE at verify-human on this WP.**
     The real fix, if wanted, is a schema decision about frontmatter vs prose headers — logged as
     SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER. -->

## Problem Statement

M15's four build WPs have shipped, but the milestone's exit criterion is **not** "the graph is
modeled" — it is that **a break is caught and corrected end-to-end**, verified against the
DECISION rather than a stored value. WP5 must (a) establish what is genuinely already verified by
standing tests versus what only *looks* verified, (b) decide and discharge the gate-arm question,
(c) resync the `arch/` subsystem docs — which `CLAUDE.md` declares the authority, so a lagging doc
is live spec asserting a refuted model — and (d) close out the six inherited upstream doc
corrections. ⚠️ **The milestone's core behavior has never been observed acting**
(`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`, high): WP4's five
behavioral checks were **DEFERRED, not passed**, on the operator's explicit call that they are
hard to trigger without real dogfooding. WP5 cannot close that by assertion.

⚠️ **One WBS task is already discharged by shipped work — do NOT rebuild it.** Task 5.2 (corpus
replay green against the WP1 fixture) ships as a standing test: `verdictReplay.test.ts` drives the
real `decideVerdict` over the frozen 2,284-record fixture inside `verify:auto`, scoring **34/36**
on the non-circular operator-corroborated set, with **both misses pinned as correct behavior** and
a non-vacuity guard. Verified green at plan time (6 passed).

⚠️ **The observability precondition is paid.** The three MAJORs that would have made Phase 3's
checks undiagnosable were closed 2026-09-14 (`7f303e6`): a successful fire is announced, a declined
recycle is logged distinctly, and an unreadable WIP is distinguishable from an absent one. Phase 3
reads those exact log lines — without them it would have had nothing to observe.

## Work Tree

- [x] Phase 1: Establish the real verification baseline  <!-- status: COMPLETE 2026-09-15 -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 (the milestone's own gate is green before any claim is made).
  - CLI: `./node_modules/.bin/vitest run src/state/supervisor/__tests__/verdictReplay.test.ts`
    exits 0 and reports 6 passed — the standing corpus replay that discharges WBS task 5.2.
  - CLI: a written baseline table in this WIP file names, for each of WBS 5.1–5.7, whether it is
    DISCHARGED-BY-TEST (with the test path), OPEN-MECHANICAL, or OPEN-LIVE-OBSERVATION.
  - [x] P1.1 Run the full gate and the replay; record the actual numbers, not remembered ones.  <!-- status: DONE — verify:auto EXIT=0, frontend 2589 / Rust lib 901; verdictReplay 6/6 -->
  - [x] P1.2 Audit the negative arm (5.3): grep the supervisor suites for coverage of the three
        refusal cases (legitimate `verify-human` PAUSE, `ESCALATE`, no-stored-mode/Mode-0) and
        record which are covered by a standing test and which are assertion-only. (Plan-time spot
        check found `ESCALATE` covered in `verdict.test.ts:97`; the other two are unconfirmed.)  <!-- status: DONE — all 3 covered, but one GAP found: the PAUSE test drives F3 (spec→research), not a verify-human edge. See Discoveries. -->
  - [x] P1.3 ⚠️ Read the `DEFERRED-*` status tags on WP4's P4.verify-human leaves, NOT the `[x]`
        checkboxes — the checkbox means the gate closed, not that the behavior was observed.
        Carry each still-unobserved check into the Phase 3 checklist verbatim.  <!-- status: DONE — all 5 read; check 2 (gate-OFF) was MISSING from Phase 3 and is added as P3.6 -->
  - [x] P1.4 Write the baseline table into `## Verification baseline` below.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 8 scoped checks, all pass; Phase 1 changed NO source, so the checks are over the 2 markdown artifacts + the baseline table's cited evidence -->
  - [x] verify-self  <!-- status: DONE — subagent: 2 PASS + 1 FAIL/COSMETIC (row 5.3 status outside the closed vocabulary); fixed in place under the 3 gates and re-verified PASS by a FRESH subagent, which also caught a 10-vs-11 test-count error. NO BLOCKING. No integration boundary — phase adds isolated new artifacts only (zero source files changed). -->
  - [x] verify-human  <!-- status: DONE — operator approved all 4 leaves 2026-09-15. NOT auto-skipped: gate (a) failed (this project's WIP files carry a prose `**Drive mode:**` header, NOT YAML frontmatter, so the gate's literal reading never fires here) AND the phase matches the skill's documented decision-artifact false-positive. -->
    - [x] P1.verify-human.1 Task 5.2 already discharged by verdictReplay.test.ts — do not rebuild  <!-- status: PASS (operator, 2026-09-15) -->
    - [x] P1.verify-human.2 The 5.3 gap is real and correctly sized as a gap, not a defect  <!-- status: PASS (operator, 2026-09-15) — actioned at P2.1 -->
    - [x] P1.verify-human.3 ⚠️ Phase 3 stays DEFERRED-TO-DOGFOODING; M15 closes with its exit criterion EXPLICITLY UNMET, not falsely ticked  <!-- status: PASS (operator, 2026-09-15) — the operator's standing call, re-affirmed -->
    - [x] P1.verify-human.4 In-place shortcut handling accepted over a full F9b back-loop  <!-- status: PASS (operator, 2026-09-15) -->
  - [x] verify-codify  <!-- status: DONE — NO NEW TESTS WRITTEN, deliberately. Phase 1 changed zero source files and produced no behavior to regress; its outputs are a baseline table + 2 backlog entries. A test over its own prose would be the "passes while the behavior is broken" anti-pattern §2 warns against. The real coverage lands at P2.1, where the Discovery becomes a standing test. Full suite re-run to confirm no regression: EXIT=0, frontend 2589 / Rust 901+19+1, 0 failures. -->

- [ ] Phase 2: Close the mechanical gaps — negative arm + gate posture  <!-- status: NOT-STARTED; depends on Phase 1 -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 with a frontend test count strictly greater than Phase 1's.
  - CLI: each refusal case Phase 1 found assertion-only now has a standing test that FAILS when its
    guard is mutated — proved INDIVIDUALLY, each mutant confirmed landed in executable code via
    `shasum` before/after, each failure attributed to its own probe.
  - CLI: `./node_modules/.bin/vitest run src/state/__tests__/offInvariantGuard.test.ts` exits 0,
    and the gate-posture decision (7th arm owed or not owed) is written into this WIP with its
    reasoning.
  - [ ] P2.1 Add standing tests for whichever negative-arm cases Phase 1 found uncovered
        (WBS 5.3's mechanical half).  <!-- status: NOT-STARTED -->
  - [ ] P2.2 ⚠️ Decide the gate-arm question (WBS 5.5). The supervisor ships **no new UI surface** —
        it acts through `injectCommand` and `recycleSession`, both already-gated paths — so the
        likely answer is that NO seventh arm is owed. **Record the decision and its reasoning either
        way; do not leave it implicit.** If a surface is ever added, the arm-count pin
        (`offInvariantGuard.test.ts`, `armSubjects.length === 8`) must bump in the same change.  <!-- status: NOT-STARTED -->
  - [ ] P2.3 ⚠️ Evaluate widening `WORKFLOW_TERMS` — currently
        `["workflow","docs","skill","drivemode","drive-mode"]`, containing neither `"recycle"` nor
        `"session"`, so a `RECYCLE_SESSION`-style menu id or panel registers **unseen** by arms 1–3
        (`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`). Widen, or record why
        not. ⚠️ If widened, diff the OLD and NEW candidate sets — a widened selector must be a
        strict superset, or a module previously in scope is silently dropped.  <!-- status: NOT-STARTED -->
  - [ ] P2.4 ⚠️ Re-check §4's exemption of the `claude -p` adjudicator from its own probe WP. R-5
        partially inverted it — the adjudicator is now load-bearing for correctness on the Q2 slice,
        and §4's own text says that inversion would require a probe. Decide: does the exemption
        still hold at close, or is a follow-up probe owed? Record the verdict.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: Live observation — the exit criterion proper  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: a Claudesk build newer than `7f303e6` is running, confirmed by comparing the running
    build's commit to `git log -1 --format=%H` — ⚠️ WP4's installed-`.app` tier was unsatisfiable
    because the build predated the feature by 8 days; do not repeat that.
  - Console: in a real multi-workspace session, a turn ending where the policy says AUTO produces
    the `supervisor: fired <command> into <workspaceId>` line **with no operator input** — the trace
    added by the 2026-09-14 observability paydown, which is what makes this checkable at all.
  - Console: a legitimate `verify-human` PAUSE, an `ESCALATE`, and a no-stored-mode project each
    produce **no fire line at all** (the negative arm, asserted live).
  - Console: at a non-final feature phase boundary above 400,000 tokens, the
    `supervisor: recycling <name> at <n> tokens` line appears and a fresh session results.
  - [ ] P3.1 Build/install a Claudesk newer than `7f303e6`; confirm the running build's commit.  <!-- status: NOT-STARTED -->
  - [ ] P3.2 Drive the positive arm (WBS 5.1) in a real multi-workspace session.  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Drive the negative arm (WBS 5.3).  <!-- status: NOT-STARTED -->
  - [ ] P3.4 Observe the context-pressure recycle (WBS 5.4).  <!-- status: NOT-STARTED -->
  - [ ] P3.5 ⚠️ Confirm the recovery path: **Esc** actually interrupts a wrong fire. R-1's accepted
        cost rests on it and it has never been confirmed.  <!-- status: NOT-STARTED -->
  - [ ] P3.6 ⚠️ Gate OFF → the same turn fires nothing (the OFF-invariant, live). Added at P1.3 —
        this is WP4's `P4.verify-human.2` and was missing from this plan as first written.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 4: Durable-doc resync + upstream corrections  <!-- status: NOT-STARTED; depends on Phase 3 -->
  **Observable outcomes:**
  - CLI: `workflow-system/product/arch/workflow-supervisor.md` exists, is linked from `arch.md`'s
    index, and the index entry resolves to a real file.
  - CLI: `grep -rn "arms 1–5 are TAKEN" workflow-system/product/` returns **0** — the stale
    guard-arm claim is corrected to 6 arms / 8 subjects everywhere it appears.
  - CLI: `grep -rn "above \*\*50% context usage\*\*" workflow-system/product/roadmap.md` returns
    **0** — superseded by R-2/R-7's absolute 400,000-token count.
  - CLI: `grep -n "same scan M13's registry already performs" workflow-system/product/roadmap.md`
    returns **0** — refuted by R-7 (no registry, no scan, no YAML parser).
  - CLI: `grep -n "is on the line so it is derivable" workflow-system/product/roadmap.md` returns
    **0** — refuted by M-5 (`claude-opus-5` observed at 833,567 tokens, `claude-opus-4-7` at
    268,743, no `[1m]` suffix anywhere in 238 transcripts).
  - CLI: `git log --oneline -1 -- workflow-system/product/arch/` shows the resync commit.
  - [ ] P4.1 Write `arch/workflow-supervisor.md` — the as-built subsystem doc (detector, policy
        graph, adjudicator + its pinned model, fire + recycle paths, the ledger, the seven rulings
        and the two refutations). ⚠️ **Do NOT add a milestone section to `arch.md`** — edit the
        subsystem the change belongs to and add the index entry.  <!-- status: NOT-STARTED -->
  - [ ] P4.2 Edit the subsystems the supervisor changed: `session-resumption.md`,
        `status-channel-and-surfaces.md`, `workflow-gate.md`.  <!-- status: NOT-STARTED -->
  - [ ] P4.3 Apply all six inherited corrections from the WP1 probe report §P5.4 (WBS 5.6/5.7).
        ⚠️ **The enumerated site list is a FLOOR, not a ceiling** — grep each retracted CLAIM
        repo-wide before declaring it corrected. The unnamed sites are the dangerous ones, because
        they hold a disproven design still standing as live spec.  <!-- status: NOT-STARTED -->
  - [ ] P4.4 Update the root `CLAUDE.md` with the supervisor's load-bearing constraints and the
        M-5/M-6 refutations so they are never re-derived.  <!-- status: NOT-STARTED -->
  - [ ] P4.5 ⚠️ Correct the WBS's dead commit hash for WP4 — tagged `(75ad76d)`, which the
        2026-09-14 rebase rewrote to `79c67e5`. Check the other cycle docs for the same class of
        stale hash while there.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 2 > P2.1
- **Active scope:** Phase 1 COMPLETE (all 4 impl tasks + all 4 verify nodes `[x]`). Phase 2 next:
  P2.1 closes the negative-arm gap Phase 1 found.
- **Blocked:** none
- **Unvisited:** Phase 2 (mechanical gaps — negative arm + gate posture), Phase 3 (live
  observation — the exit criterion proper; ⚠️ **DEFERRED-TO-DOGFOODING by operator decision
  2026-09-15** — see P1.verify-human.3), Phase 4 (durable-doc resync + upstream corrections)
- **Open discoveries:** 1 — the PAUSE refusal test drives F3 (spec→research) rather than a
  `verify-human` edge; actioned at Phase 2 / P2.1, logged as
  `SURFACE-2026-09-14-PAUSE-REFUSAL-TEST-DRIVES-THE-WRONG-EDGE-CLASS` (medium)

## Verification baseline

**Measured 2026-09-14 at P1.1–P1.3.** `pnpm verify:auto` EXIT=0 — frontend **2589**, Rust lib
**901**. `verdictReplay.test.ts` 6/6.

| WBS task | Status | Evidence |
|---|---|---|
| 5.1 Live multi-workspace AUTO fire, no operator input | **OPEN-LIVE-OBSERVATION** | = WP4's `P4.verify-human.1`, DEFERRED-TO-DOGFOODING. Not reproducible by an agent (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`). |
| 5.2 Corpus replay green against the WP1 fixture | ✅ **DISCHARGED-BY-TEST** | `src/state/supervisor/__tests__/verdictReplay.test.ts` — 34/36 on the non-circular operator-corroborated set, both misses pinned as correct, non-vacuity guard, runs in `verify:auto`. **Do not rebuild.** |
| 5.3 Negative arm — `verify-human` PAUSE / `ESCALATE` / Mode-0 | **OPEN-MECHANICAL** | ⚠️ **Partially discharged; one narrow gap keeps it OPEN.** Covered: `ESCALATE` → `src/state/supervisor/__tests__/verdict.test.ts:97` (T3, `not-dispatchable`); Mode-0/no-stored-mode → same file `:141` (opt-in); generic PAUSE → same file `:76`. The conditional `verify-human` cell is covered at `src/state/__tests__/workflowMachinePolicy.test.ts:406`, `src/state/__tests__/workflowMachineLookup.test.ts:299`, `src/state/__tests__/workflowMachineFunnel.test.ts:249`, and `resolveCell` (`src/state/workflowMachine/policy.ts:216`) falls back to **`pause`** (withholding) when unsatisfied. ⚠️ **Gap:** the PAUSE test drives **F3 (spec→research)**, not a `verify-human` edge — see the Discovery below and `SURFACE-2026-09-14-PAUSE-REFUSAL-TEST-DRIVES-THE-WRONG-EDGE-CLASS`. Closes at P2.1. |
| 5.4 Context-pressure recycle at a non-final boundary | **OPEN-LIVE-OBSERVATION** | = WP4's `P4.verify-human.4`, DEFERRED-TO-DOGFOODING. Mechanically covered by `src/state/supervisor/__tests__/verdict.test.ts:427–536` (11 tests incl. all three FIRE-not-recycle arms and the strictly-greater threshold). |
| 5.5 Gate posture — is a 7th arm owed? | **OPEN-MECHANICAL** | Phase 2 / P2.2. Guard green at 6 arms / 8 subjects (`src/state/__tests__/offInvariantGuard.test.ts:931`). |
| 5.6 Resync `arch/` | **OPEN-MECHANICAL** | Phase 4. |
| 5.7 Update `CLAUDE.md` + the M-5/M-6 refutations | **OPEN-MECHANICAL** | Phase 4. |

**WP4's five deferred checks (P1.3 — read from the `DEFERRED-*` tags, not the `[x]`):**

1. `P4.verify-human.1` Live AUTO-edge fire; `/skill` appears in the pane — DEFERRED-TO-DOGFOODING
2. `P4.verify-human.2` ⚠️ **Gate OFF → the same turn fires nothing (OFF-invariant)** — DEFERRED-TO-DOGFOODING
3. `P4.verify-human.3` Installed-`.app` smoke test (GUI-PATH) — DEFERRED-TO-**RELEASE-GATE**
4. `P4.verify-human.4` Recycle fires unattended at a real phase boundary — DEFERRED-TO-DOGFOODING
5. `P4.verify-human.5` Esc recovery for a chained one-step run — DEFERRED-TO-DOGFOODING

⚠️ Check 2 was **missing from this plan's Phase 3** as written and is added as P3.6. Check 3 is
release-gated, not dogfooding-gated, and is tracked separately from the other four.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-09-14] P1.4 — verify-self's subagent reported row 5.3's status cell as
FAIL/COSMETIC: it read `MOSTLY DISCHARGED — one narrow gap`, outside the closed three-value
vocabulary the outcome specifies. Fixed in place under the three gates: (1) trivial — a status-label
edit to the table written in the just-completed P1.4, no code touched; (2) re-verified by a
FRESHLY-SPAWNED `feature-verify-self-runner` subagent, not by re-reading my own state; (3) this
entry. ⚠️ **The fix corrected the STATUS, not merely the label** — 5.3 is genuinely `OPEN-MECHANICAL`
because real work remains at P2.1, which the hedged label obscured. Also fixed, from the same
report: four evidence citations used bare filenames rather than repo-relative paths.

[SURFACED-2026-09-14] Phase 2 / P2.1 — ⚠️ **The "withholds on a PAUSE policy" test drives the
wrong edge class.** `verdict.test.ts:76` is the only standing test for the PAUSE refusal, and its
comment says *"F3 is PAUSE in autopilot. This is the case the supervisor must never fire on."* But
**F3 is `spec → research`**, not a `verify-human` edge — so the single highest-stakes refusal in
WBS 5.3 (*firing past the human gate consumes the operator's answer slot*) has no edge-specific
test. Mitigating, so this is a gap and not a defect: `verify-human`'s row is the matrix's one
conditional cell, `resolveCell` falls back to **`pause`** when unsatisfied (the withholding
direction), and the conditional is covered structurally in three places. **Action at P2.1:** add a
standing test that drives a real `verify-human`-keyed edge and asserts `withhold` with reason
`policy-not-auto`, then mutation-prove it individually.
