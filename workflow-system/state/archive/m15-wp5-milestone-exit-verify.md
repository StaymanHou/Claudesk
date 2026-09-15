# Feature: M15 WP5 — Milestone exit verify

**Workflow:** feature
**State:** Completed 2026-09-15
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

- [x] Phase 2: Close the mechanical gaps — negative arm + gate posture  <!-- status: COMPLETE 2026-09-15 -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 with a frontend test count strictly greater than Phase 1's.
  - CLI: each refusal case Phase 1 found assertion-only now has a standing test that FAILS when its
    guard is mutated — proved INDIVIDUALLY, each mutant confirmed landed in executable code via
    `shasum` before/after, each failure attributed to its own probe.
  - CLI: `./node_modules/.bin/vitest run src/state/__tests__/offInvariantGuard.test.ts` exits 0,
    and the gate-posture decision (7th arm owed or not owed) is written into this WIP with its
    reasoning.
  - [x] P2.1 Add standing tests for whichever negative-arm cases Phase 1 found uncovered
        (WBS 5.3's mechanical half).  <!-- status: DONE — 2 tests added to verdict.test.ts (35→37): the verify-human GATE withhold (F11/F12/F13, found by ENUMERATING EDGES, all dispatchable, all resolving to the conditional's `pause` fallback) + an anti-vacuity guard pinning their dispatchability. BOTH mutation-proved INDIVIDUALLY. ⚠️ Mutant A (fallback pause→auto) was killed by the NEW test alone — all 35 pre-existing tests stayed green, which is precisely the gap. -->
  - [x] P2.2 ⚠️ Decide the gate-arm question (WBS 5.5). The supervisor ships **no new UI surface** —
        it acts through `injectCommand` and `recycleSession`, both already-gated paths — so the
        likely answer is that NO seventh arm is owed. **Record the decision and its reasoning either
        way; do not leave it implicit.** If a surface is ever added, the arm-count pin
        (`offInvariantGuard.test.ts`, `armSubjects.length === 8`) must bump in the same change.  <!-- status: DONE — NO 7th arm owed; measured: zero .tsx, zero JSX, no panel/menu/chord/row-cell/skill-row registration. Pin stays at 8. See "Gate-posture decision". -->
  - [x] P2.3 ⚠️ Evaluate widening `WORKFLOW_TERMS` — currently
        `["workflow","docs","skill","drivemode","drive-mode"]`, containing neither `"recycle"` nor
        `"session"`, so a `RECYCLE_SESSION`-style menu id or panel registers **unseen** by arms 1–3
        (`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`). Widen, or record why
        not. ⚠️ If widened, diff the OLD and NEW candidate sets — a widened selector must be a
        strict superset, or a module previously in scope is silently dropped.  <!-- status: DONE — NOT widened; M15 adds no recycle/session-named UI registration (only RECYCLE_TOKEN_THRESHOLD, a numeric constant). Left open against its existing SURFACE. -->
  - [x] P2.4 ⚠️ Re-check §4's exemption of the `claude -p` adjudicator from its own probe WP. R-5
        partially inverted it — the adjudicator is now load-bearing for correctness on the Q2 slice,
        and §4's own text says that inversion would require a probe. Decide: does the exemption
        still hold at close, or is a follow-up probe owed? Record the verdict.  <!-- status: DONE — exemption HOLDS; R-6's 3 conditions discharge what a probe would buy (pinned model + withholding failure direction both shipped & tested). ⚠️ The larger labelled set (condition 3) is recorded as OWED, not dropped. -->
  - [x] verify-auto  <!-- status: DONE — 4 scoped checks on the one changed source file (verdict.test.ts): eslint clean, prettier clean (the build-step failure, now fixed), 37/37 targeted tests, tsc --noEmit exit 0. Full suite NOT re-run here per this skill's scoping rule — build already recorded EXIT=0 @ 2591. -->
  - [x] verify-self  <!-- status: DONE — subagent: 3 PASS / 0 FAIL. It INDEPENDENTLY re-ran both mutants rather than trusting the report: A killed by the GATE test alone (1 failed/36 passed), B by the DISPATCHABLE test alone, both SHAs confirmed changed then restored, neither survived, neither over-killed. ⚠️ It also verified something I had NOT: mutant B hit F13 at edges.ts:290 and left the identical-valued sibling at :274 untouched. NO BLOCKING. No integration boundary — only a test file changed. -->
  - [x] verify-human  <!-- status: DONE — operator approved all 3 leaves 2026-09-15. NOT auto-skipped: gate (a) fails per SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER, and 3 of this phase's 4 deliverables were DECISIONS rather than code. -->
    - [x] P2.verify-human.1 No 7th guard arm owed; pin stays at 8  <!-- status: PASS (operator, 2026-09-15) — with the recorded reversing condition -->
    - [x] P2.verify-human.2 WORKFLOW_TERMS not widened; stays open against SURFACE-2026-08-18  <!-- status: PASS (operator, 2026-09-15) -->
    - [x] P2.verify-human.3 ⚠️ Adjudicator exemption holds; R-6 condition 3 (larger labelled set) carried as EXPLICITLY OWED  <!-- status: PASS (operator, 2026-09-15) — backlogged as SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET -->
  - [x] verify-codify  <!-- status: DONE — no NEW tests written: P2.1's two tests WERE this phase's codified coverage (mutation-proved twice, once independently). P2.2/P2.3/P2.4 are recorded decisions, not behavior. ⚠️ Codify DID ask whether P2.2's reversing condition is mechanically backstopped and found it IS (the guard's allowlist is all of `src/**`, so a future supervisor surface trips arms 1-3 today) — see the addendum. Full suite: EXIT=0, 2591 frontend / 901 Rust, 0 failures. -->

- [x] Phase 3: Live observation — ⚠️ **MOVED TO BACKLOG, NOT PERFORMED**  <!-- status: MOVED-TO-BACKLOG 2026-09-15 (operator decision: "move phase 3 to backlog or somewhere. ship now") -->
  ⚠️ **THIS PHASE WAS NEVER RUN. The `[x]` means "removed from this WP's scope", NOT "done".**
  Its six checks are the milestone's exit criterion and remain **OPEN**, tracked in full at
  `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (**high**, Update
  2026-09-15). They cannot be agent-driven — an agent-launched CC emits no hook events
  (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`) — so the trigger is
  the operator's first real dogfooding.
  ⚠️ **M15 THEREFORE SHIPS WITH ITS EXIT CRITERION EXPLICITLY UNMET.** That is recorded, not
  hidden: `arch/workflow-supervisor.md` §H and `CLAUDE.md` both state it. Approved at
  P1.verify-human.3 and P4.verify-human.3 (2026-09-15).
  ⚠️ **Do NOT read this `[x]` as evidence the supervisor has been observed acting.** Nothing in
  this WP observed it. The same checkbox-vs-status-tag trap that WP4's leaves carry applies here.

- [x] Phase 4: Durable-doc resync + upstream corrections  <!-- status: COMPLETE 2026-09-15 — ⚠️ taken BEFORE Phase 3, deliberately -->
  <!-- ⚠️ **REORDERING, RECORDED 2026-09-15.** Phase 4 runs BEFORE Phase 3. Phase 3 (live
       observation) is operator-approved DEFERRED-TO-DOGFOODING (P1.verify-human.3) and cannot be
       agent-driven — an agent-launched CC emits no hook events
       (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`). Phase 4's
       `depends on Phase 3` was ORDERING-ONLY, not substantive: every correction here is a
       documented-fact fix that does not depend on the supervisor having been observed firing.
       ⚠️ Blocking Phase 4 on a deferred phase would strand the `arch/` resync — and a stale
       `arch/` doc OUTRANKS a correct record (`CLAUDE.md` declares the `arch/` set the authority),
       so leaving it unsynced is actively worse than the reorder. -->
  **Observable outcomes:**
  - CLI: `workflow-system/product/arch/workflow-supervisor.md` exists, is linked from `arch.md`'s
    index, and the index entry resolves to a real file.
  - ⚠️ **OUTCOMES REWRITTEN AT BUILD (2026-09-15) — the original `grep … returns 0` form was
    UNSATISFIABLE AS WRITTEN, and that is a defect in this plan, not in the work.** A correction
    that says *"this previously read X, and X is wrong because …"* necessarily CONTAINS X, so a
    bare `grep -c X` counts the correction's own quotation and can never reach 0. Deleting the
    quotation to satisfy the grep would make the docs WORSE — a reader could no longer see what
    was superseded or why. The property that actually matters is **the corrected claim leads and
    the stale phrase survives only inside a marked quotation**, so that is what is asserted:
  - CLI: `arch.md` line 70 leads with `owns a SEVENTH guard arm` + `arms 1–6 are TAKEN`, and the
    phrase `arms 1–5 are TAKEN` appears ONLY inside a `previously read "…"` clause.
  - CLI: `roadmap.md` deliverable 4 is ticked `[x]` and states the threshold as an **absolute
    400,000 tokens**; the string `Above **50% context usage**` no longer appears as an assertion
    (only inside the correction's own explanation).
  - CLI: `roadmap.md` probe Q3 carries a `CORRECTED AT M15 WP5` clause stating the "same scan"
    premise is FALSE and that R-7 DECLINED the coupling.
  - CLI: `roadmap.md` line 525 carries a `CORRECTED AT M15 WP5` clause stating the window is NOT
    derivable from `message.model` (M-5's measurements) and that R-2 deleted the need for it.
  - CLI: `roadmap.md` Exit Criteria no longer asserts `all 19 known breaks flagged` as the
    criterion — superseded by R-3's freshly-rebuilt fixture and the 34/36 standing replay.
  - CLI: `git log --oneline -1 -- workflow-system/product/arch/` shows the resync commit.
  - [x] P4.1 Write `arch/workflow-supervisor.md` — the as-built subsystem doc (detector, policy
        graph, adjudicator + its pinned model, fire + recycle paths, the ledger, the seven rulings
        and the two refutations). ⚠️ **Do NOT add a milestone section to `arch.md`** — edit the
        subsystem the change belongs to and add the index entry.  <!-- status: DONE — arch/workflow-supervisor.md written (9 sections: ownership boundary, pipeline, policy graph, detection, recycle, observability, gate, verification posture, existing seams) + arch.md index entry added and confirmed to resolve -->
  - [x] P4.2 Edit the subsystems the supervisor changed: `session-resumption.md`,
        `status-channel-and-surfaces.md`, `workflow-gate.md`.  <!-- status: DONE — status-channel-and-surfaces.md gained §A.5 documenting `is_turn_start` (it had ZERO supervisor mentions despite owning the trigger); workflow-gate.md's prediction that the supervisor would author a RECYCLE_SESSION menu id is RESOLVED as false; session-resumption.md cross-refs the new doc -->
  - [x] P4.3 Apply all six inherited corrections from the WP1 probe report §P5.4 (WBS 5.6/5.7).
        ⚠️ **The enumerated site list is a FLOOR, not a ceiling** — grep each retracted CLAIM
        repo-wide before declaring it corrected. The unnamed sites are the dangerous ones, because
        they hold a disproven design still standing as live spec.  <!-- status: DONE — 4 live corrections in roadmap.md (deliverable 4's 50%→400k + ticked, the model→window derivation, probe Q3's 'same scan', and Exit Criteria's TWO stale claims incl. 'all 19 known breaks') + 1 in arch.md (guard-arm count). ⚠️ Grepped each retracted CLAIM repo-wide first: most hits are RECORDS of the refutation (correct, left alone); only 5 were live assertions -->
  - [x] P4.4 Update the root `CLAUDE.md` with the supervisor's load-bearing constraints and the
        M-5/M-6 refutations so they are never re-derived.  <!-- status: DONE — CLAUDE.md gained the as-built pointer + 4 must-not-re-derive properties + the never-observed status with the DEFERRED-vs-[x] warning -->
  - [x] P4.5 ⚠️ Correct the WBS's dead commit hash for WP4 — tagged `(75ad76d)`, which the
        2026-09-14 rebase rewrote to `79c67e5`. Check the other cycle docs for the same class of
        stale hash while there.  <!-- status: DONE — wbs.md 75ad76d→79c67e5 (all 4 replacement hashes verified real via git log); backlog pointer corrected; archive annotated with the full mapping rather than rewritten, since it is a historical record -->
  - [x] verify-auto  <!-- status: DONE — 6 scoped checks over the markdown (Phase 4 changed NO source): all 12 arch.md index links resolve incl. the new one; 5 cited code symbols exist; numeric claims checked against ground truth; 4 inbound cross-refs resolve; archive path exists; both cited SURFACE IDs are real. ⚠️ FOUND AND FIXED: `mod.rs:451` had drifted to `:502` and was wrong in THREE places (2 of them newly written by me, inherited from wbs.md). ⚠️ My own fixture-count probe was WRONG (read a dict length, not records) — the doc's 2,284 is correct: 96+472+1716. -->
  - [x] verify-self  <!-- status: DONE — subagent audited the new as-built doc's 10 factual claims AGAINST THE CODE and found a BLOCKING falsehood I had written: §B said Rust exposes transcript_tail + wip_read 'and nothing else', but supervisor_adjudicate is a THIRD supervisor-owned command that SPAWNS A SUBPROCESS — and §D described it, so the doc contradicted itself. Also flagged §C's one-sided 'FIVE values' against policy.ts's explicit do-not-simplify-either-direction warning. BOTH fixed in place under the 3 gates; a FRESH subagent re-verified 5/5 PASS and swept for sibling over-confident enumerations (5 more absolutes spot-checked, all true). No integration boundary — markdown only. -->
  - [x] verify-human  <!-- status: DONE — operator approved all 4 leaves 2026-09-15. NOT auto-skipped: gate (a) fails per SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER; and the phase's deliverable is a doc that becomes AUTHORITATIVE, which is a judgment call. -->
    - [x] P4.verify-human.1 arch/workflow-supervisor.md accepted as the M15 authority (wrong once, fixed, independently re-audited, sibling-claim sweep clean)  <!-- status: PASS (operator, 2026-09-15) -->
    - [x] P4.verify-human.2 roadmap.md deliverable 4 reads SHIPPED while M15's exit criterion stays explicitly open  <!-- status: PASS (operator, 2026-09-15) -->
    - [x] P4.verify-human.3 ⚠️ Phase 4 before Phase 3 approved; WP5 MAY CLOSE WITH PHASE 3 OPEN rather than blocking  <!-- status: PASS (operator, 2026-09-15) -->
    - [x] P4.verify-human.4 Cite code by SYMBOL, not line, for code that moves  <!-- status: PASS (operator, 2026-09-15) -->
  - [x] verify-codify  <!-- status: DONE — ⚠️ NEW GUARD WRITTEN: `archDocEnumeration.test.ts` (10 tests) couples the arch doc's ENUMERATIONS to the code, because the BLOCKING falsehood verify-self found had no gate to catch it. Derives the command list from `useSupervisor.ts` rather than hardcoding, so a 4th invoke fails until the doc names it. 3 mutants proved INDIVIDUALLY (omit a command / one-sided arm count / re-assert the retracted phrase), each killed by its own arm; re-proved after a Prettier reflow. ⚠️ MY FIRST REGEX WAS WRONG (`[a-z-]+` dropped `n/a`, reported 5 arms) — fixing the PROBE was correct, not 'correcting' a doc that was right. Full suite: EXIT=0, 2601 frontend / 901 Rust. -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** none — all four phases `[x]`. ⚠️ **Phase 3 is `[x]` because it was MOVED TO
  BACKLOG, not because it was performed.** Its six checks are M15's exit criterion and remain
  OPEN at `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`.
- **Blocked:** none
- **Unvisited:** none — ship next
- **Open discoveries:** none outstanding — the PAUSE-refusal gap (F3 vs a `verify-human` edge)
  was CLOSED at Phase 2 / P2.1 with two standing tests, both mutation-proved individually.
  ⚠️ Three items were surfaced to the backlog rather than resolved here:
  `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` (R-6 condition 3, owed),
  `SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER` (cross-repo, mccc), and
  the Phase 3 fold-out into `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`.

## Gate-posture decision (P2.2 / P2.3 / P2.4) — recorded 2026-09-15

### P2.2 — Is a SEVENTH OFF-invariant guard arm owed? **NO.**

⚠️ **Measured, not assumed.** The supervisor ships **no UI surface whatsoever**:
`src/state/supervisor/` contains **zero `.tsx` files** and zero JSX (the only `<...>` matches are
TypeScript generics such as `Promise<TranscriptTail>`). It registers **no** panel, menu id, chord
predicate, row-cell, or skill-row — the five things arms 1-5 select on. It acts exclusively
through **`injectCommand`** and **`recycleSession`**, and *both are already-gated paths*: the hook
that drives it (`useSupervisor`) checks `host.enabled` twice — once via `useTurnEnd`'s `enabled`
and again **inside** the callback, deliberately, because the gate can flip mid-turn.

**Therefore the guard's current pin — 6 arms / 8 subjects
(`src/state/__tests__/offInvariantGuard.test.ts:931`, `armSubjects.length === 8`) — stays correct
and is NOT bumped.** Arm subjects confirmed present: `1 PANEL`, `3 CHORD`, `5 RECYCLE`,
`5 SKILL-ROW`, `6 WORKSPACE-DRIVEMODE` (+ arm 4's two derivations and arm 5's second predicate).

⚠️ **THE CONDITION THAT WOULD REVERSE THIS:** if any future change gives the supervisor an
operator-visible surface — a status panel, a menu item, a chord, a filmstrip badge, a settings row
— that surface owns the **SEVENTH** arm, and the `armSubjects.length === 8` pin must bump **in the
same change**. This decision is about what the supervisor *is today* (headless), not a general
exemption for supervisor-adjacent work.

#### ⚠️ Addendum (verify-codify, 2026-09-15) — the reversing condition HAS a mechanical backstop

Asked at codify whether P2.2's reversing condition rests only on a human remembering this note.
**It does not.** The guard's file allowlist is **all of `src/**`** — stated as MEASURED, not
assumed, at `offInvariantGuard.test.ts:93` — and `src/state/supervisor/` is inside it. So a future
supervisor panel, menu id, or `*Chord*`-exporting module would be **scanned by arms 1-3 today**,
tripping an existing arm rather than slipping past unpoliced.

⚠️ **What is still NOT mechanically caught:** a surface shaped unlike any of the five registries
arms 1-5 select on (i.e. genuinely needing a *seventh* arm) would not trip anything — the
`armSubjects.length === 8` pin detects an arm being **removed**, not a surface being **added**
without one. That residue is what the WIP note covers, and it is the same residue every
not-yet-invented surface has had since arm 1. **No new test written for it:** the predicate would
have to anticipate a surface shape nobody has designed, which is the "a better source-text
predicate can only encode shapes you thought of" trap.

### P2.3 — Widen `WORKFLOW_TERMS`? **NOT NOW — and the milestone does not force it.**

`WORKFLOW_TERMS` is `["workflow","docs","skill","drivemode","drive-mode"]` and contains neither
`"recycle"` nor `"session"` (`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`).
⚠️ **The gap is real but is NOT triggered by M15.** The only `recycle`/`session`-named export the
supervisor adds is `RECYCLE_TOKEN_THRESHOLD` — a **numeric constant**, not a UI registration, so
arms 1-3 have nothing to miss. Widening the vocabulary here would be a change with **no failing
case to justify it**, and per the widened-selector rule it would oblige diffing the old and new
candidate sets to prove the new predicate is a strict superset — real work, no benefit today.
**Left open against its existing SURFACE, to be paid when a surface actually named
`recycle`/`session` ships.**

### P2.4 — Does §4's exemption of the `claude -p` adjudicator from its own probe WP still hold?
**YES at close, with the inversion recorded.**

R-5 partially inverted §4's rationale: the adjudicator is no longer purely off the dominant path —
it is **load-bearing for correctness on the Q2 slice**, and §4's own text says that inversion would
require a probe. ⚠️ **The exemption nonetheless holds, because R-6's three conditions already
discharge what a probe would have bought**, and all three are shipped and tested:
(1) the model is **pinned** and `assertPinnedModel` runs inside `adjudicate` before every spawn, so
a silent downgrade fails loudly (the pinned-model gap was paid down at WP3);
(2) the failure direction is **withholding** — `verdict.test.ts:362` pins "withholds when the
adjudicator fails — the failure direction, end to end";
(3) re-measurement on a larger labelled set is owed **before relying on the margin**, which is a
condition on *future tuning*, not on shipping.
⚠️ **What a probe would still add is (3)'s larger labelled set. That is recorded as owed, not
silently dropped** — the 0.80/0.80 threshold remains a CHOSEN bar, not a measured constant, and
the +1-record margin (sonnet 25/29 against a >=24 bar) is the known-thin part of R-6.


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

[SHORTCUT-2026-09-15] P4.1 — ⚠️ **verify-self's subagent found a BLOCKING FALSEHOOD in the
as-built doc I had just written**, plus one incomplete claim. Both fixed in place under the three
gates. (1) **BLOCKING:** §B said Rust exposes *"`transcript_tail` and `wip_read` and nothing else"*
— but **`supervisor_adjudicate` is a THIRD supervisor-owned Rust command** (`lib.rs:480`,
`adjudicator/commands.rs:19`, invoked from `useSupervisor.ts:150`), and it **spawns a subprocess**
rather than doing file IO. ⚠️ **The doc contradicted itself**: §D describes the adjudicator spawn
while §B denied it existed. R-4's substance held (the command is decision-free by construction), but
the *enumeration* was wrong in a doc `CLAUDE.md` declares authoritative — a reader auditing "what
crosses into Rust?" would have been told two when it is three. Fixed with an explicit three-row
table + the pipeline diagram's third arrow. (2) **COSMETIC-as-reported, treated as sharper:** §C
stated "FIVE values" without the **six-arm modeled union** (`confirm`, `policy.ts:137`) — and
`policy.ts`'s own header explicitly warns *"Do not 'simplify' the count in either direction without
reading both comments."* Since this doc **outranks** `policy.ts`, the one-sided count is exactly the
simplification the code warns against. Both re-verified by a FRESH subagent.

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


---

## Ship record — 2026-09-15

**Gate:** `pnpm verify:auto` **EXIT=0** — frontend **2589 → 2601** (+12), Rust **901**.

**Commits:** `9e14172` (plan + Phase 1) · `5675c52` (Phase 2) · `c55d5fa` (Phase 4) · this one
(ship). ⚠️ **NOT PUSHED** — `main` is ahead of `origin/main`; pushing stays the operator's call.

### ⚠️ What shipped, and what did NOT

**Phases 1, 2 and 4 were performed. Phase 3 was NOT** — it was moved to the backlog on the
operator's instruction ("move phase 3 to backlog or somewhere. ship now"). Its six checks are
M15's **exit criterion**, and they remain OPEN at
`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (**high**).

⚠️ **THE SUPERVISOR HAS STILL NEVER BEEN OBSERVED FIRING IN A LIVE SESSION.** The milestone closes
with its exit criterion **explicitly unmet rather than falsely ticked** — stated in
`arch/workflow-supervisor.md` §H, in `CLAUDE.md`, in the CHANGELOG entry, and on the Phase 3 node.
⚠️ **A future session must not read Phase 3's `[x]` as evidence of observation** — the checkbox
means "removed from this WP's scope", not "done". Same trap as WP4's `DEFERRED-*` leaves.

### What this WP actually changed

1. **Found that WBS task 5.2 was already discharged** by `verdictReplay.test.ts` — the WBS listed
   shipped work as open. No corpus replay was rebuilt.
2. **Closed a real coverage gap (5.3).** The only PAUSE-refusal test drove **F3 (spec→research)**
   while its comment claimed to cover "the case the supervisor must never fire on". The
   `verify-human` gate — where a wrong fire is read by CC **as the operator's reply** — had no
   edge-specific test. Two tests added over F11/F12/F13; mutation-proved individually, and the
   fallback-flip mutant is killed by the new test **alone** (all 35 pre-existing tests stayed
   green — that gap was real).
3. **Decided the gate posture (5.5):** no seventh guard arm is owed (measured, not assumed);
   `WORKFLOW_TERMS` not widened; the adjudicator exemption holds with R-6 condition 3 recorded as
   **owed, not dropped**.
4. **Resynced the durable docs (5.6/5.7)** — and **wrote a falsehood into the new authority doc**,
   caught by audit, then **codified a guard for that exact failure**
   (`archDocEnumeration.test.ts`, 10 tests, 3 mutants proved individually).

### Method notes worth keeping

- ⚠️ **Two instrument errors nearly produced wrong "corrections".** A fixture-count probe read a
  dict length and reported 4 where the doc's 2,284 was right; a guard regex `[a-z-]+` dropped
  `n/a` and reported 5 arms where 6 was right. **Both times the correct move was to fix the
  probe** — trusting either would have degraded a correct artifact.
- ⚠️ **A stale line citation had already been propagated.** `mod.rs:451` → `:502`, inherited from
  `wbs.md` and written into two new docs before checking. Saved as
  `[[cite-code-by-symbol-not-line]]`.
- ⚠️ **This WP's own Observable Outcomes were unsatisfiable as planned** (Phase 4's
  `grep … returns 0`, when a correction necessarily quotes what it retracts). Rewritten mid-phase
  and the defect recorded — a plan error, not a work error.


---

## Retrospect

- **What changed in our understanding:**
  ⚠️ **The WBS was not a trustworthy statement of what remained.** Task 5.2 was listed as open work
  but had *already shipped* as a standing test (`verdictReplay.test.ts`), while task 5.3 was listed
  as covered but hid a real gap — the only PAUSE-refusal test drove **F3 (spec→research)** while its
  own comment claimed to cover "the case the supervisor must never fire on". **Both errors pointed
  the same direction: the plan's confidence did not track the evidence.** Phase 1 existed to measure
  that, and it was the highest-value phase in the WP despite writing no code.
  Also learned: **a doc that outranks the code can contradict itself and still read as
  authoritative.** §B of the new arch doc denied a Rust command that §D described, two sections
  apart.

- **Assumptions that held:**
  The mechanical/live split was real and clean — everything not requiring a live CC session was
  closable by an agent, and everything requiring one was not. The three mitigations that made the
  5.3 gap a *gap* rather than a *defect* (the conditional cell's `pause` fallback, covered in three
  places) all checked out under audit. The observability paydown done before this WP was the right
  precondition: without those log lines Phase 3 would have had nothing to observe even if run.

- **Assumptions that were wrong:**
  ⚠️ **That Phase 4 depended on Phase 3.** The plan said so; it was ordering-only, and taking the
  dependency literally would have stranded the `arch/` resync behind a phase that may never run —
  while a stale `arch/` doc *outranks a correct record*.
  ⚠️ **That `grep … returns 0` could express "the stale claim is gone".** A correction that explains
  what it retracts necessarily quotes it, so Phase 4's Observable Outcomes were unsatisfiable as
  written. A plan defect, caught mid-phase.
  ⚠️ **That my own probes were more reliable than the artifacts they measured.** Twice they were
  not: a fixture-count probe read a dict length and reported 4 where 2,284 was right; a guard regex
  `[a-z-]+` dropped `n/a` and reported 5 arms where 6 was right. **Both times the instrument was
  wrong and the artifact was right**, and trusting either would have degraded something correct.

- **Approach delta:**
  Planned as 4 sequential phases; **executed 1 → 2 → 4, with 3 moved to the backlog.** Phase 1
  reshaped Phases 2–4 by finding what was already done (5.2) and what genuinely was not (5.3) —
  so the WP delivered *less new work and more correction* than planned. Two unplanned artifacts
  came out of verification rather than build: the `verify-human` GATE tests (from Phase 1's
  finding) and `archDocEnumeration.test.ts` (codifying a falsehood this WP itself committed).
  ⚠️ **The verify-self subagents earned their place three times** — they caught the BLOCKING doc
  falsehood, independently re-proved mutations rather than trusting the report, and checked one
  thing I had not (that a mutant landed on F13 and not its identical-valued sibling).
