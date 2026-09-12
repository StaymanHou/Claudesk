---
workflow: feature
ship (complete)
drive_mode: autopilot
cycle: milestone-15-workflow-supervisor
wp: WP2
created: 2026-09-12
---

# Feature: M15 WP2 — The state machine as executable code

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-09-12

## Problem Statement

The workflow state machine — states, edges, the AUTO/PAUSE matrix and the four drive modes — exists today only as **markdown tables in the companion mccc repo**, duplicated across `transitions.md` and four `AGENTS.md` files. Claudesk cannot enforce a chaining policy it cannot read, and a prose table has no exhaustiveness check, so cells drift silently. WP2 makes the graph a **typed model in Claudesk**: edges, a 5-value policy cell, the four modes plus Mode 0, and the edge→policy-row derivation (M-8) that the WP3 detector's verdict *is*. This is a pure-internal model with no user-facing surface and no 3rd-party dependency; WP3 is its first consumer.

⚠️ **This WP builds the model and its guards ONLY.** No detector, no transcript reader, no fire path, no adjudicator — those are WP3. The acceptance question here is *"is the lookup correct and does every read go through it?"*, not *"does the supervisor work?"*

## Inherited constraints (from WP1 probe report + operator rulings — NOT to be re-derived)

1. ⚠️ **`dispatchable_target` is a per-edge property held SEPARATELY from the 5-value policy cell.** An `AUTO` cell does not imply there is anything to fire into. Cell-only labelling marked **223** breaks vs the true **96**; most were terminal/SURFACE/meta-op edges (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`). Adding the set took 223 → 127. Without it WP3 injects into ended workflows.
2. ⚠️ **`F3`/`F4` (spec exits) are the regression sentinel for a policy-lookup bug — NOT `F10`/`F13`/`F19`.** All 23 naive false positives are spec exits (F4 20, F3 3), which PAUSE in Mode 3. The assumed edges contribute **zero**.
3. ⚠️ **R-7: do NOT build the skill enumerator or YAML frontmatter parser.** No task here may depend on skill frontmatter.
4. ⚠️ **Cells are NOT booleans** (M-7). Five values: `AUTO` / `PAUSE` / `AUTO-SKIP` / `SKIP (entire skill)` / `n/a`, plus **Mode 0 which is not one of the four modes**. `AUTO-SKIP` is *conditional* (verify-human: no integration boundary **and** verify-self all-PASS). `SKIP (entire skill)` removes a state in Mode 4, and `F17b` routes ship **around** the skipped state.
5. ⚠️ **Extraction hazard (M-9):** the 2 `behavior-within-state` rows stay upstream in mccc — absorbing them crosses the ownership boundary. **Located:** both are in the *Session Operations* table, `transitions.md:453` (`reflect`'s candidate filter) and `:454` (`session-capture`'s drive-mode-conditional gate). They sit in one table, so the extraction boundary is clean.
6. ⚠️ **The recurring local defect shape:** *a mechanism correct in itself behind a caller that does not honor it* (hit four times per `arch.md`; twice in M11 WP4, one a shipped CRITICAL). **Enumerating cells as data makes the SET testable but does NOT prove each cell has a CALLER.** Funnel every policy read through ONE function and guard *that*.

## Pre-plan measurements (taken this pass, against the live `_ref/` source)

Each one changes a task. Measured rather than inherited, because `wbs.md`'s M-7/M-8 counted a different copy than the one I read.

| # | Measurement | Value | Consequence |
|---|---|---|---|
| A-1 | Edge rows in `transitions.md` | **111** (F 43 · I 20 · S 21 · P 14 · T 13) | WBS M-7 says 113 — a live doc drifted by 2. **Do not hardcode 113.** The model must be counted from the source at absorb time, and the test must assert the count it actually absorbed. |
| A-2 | ⚠️ **The two copies of the feature graph DISAGREE** | `transitions.md`: `F10 = verify-auto → verify-self`, plus `F9b`, `F10b`, `F30`. `AGENTS.md`: `F10 = verify-auto → **verify-human**`, and **`F9b`/`F10b`/`F30` absent entirely** | ⚠️ **This is the single most important finding of this pass.** `AGENTS.md` predates `verify-self` being a state. **`transitions.md` is the sole authority; the `AGENTS.md` tables must NOT be merged in.** Merging would import a wrong `F10` target directly into the detector's lookup. |
| A-3 | Feature policy rows, keyed edge-vs-step | `transitions.md`: **12 edge-keyed / 13 step-keyed** (25 rows). WBS M-8 reports 8/19 of 27 — it counted the `AGENTS.md` copy | The M-8 *hazard* is real and confirmed; its *numbers* are for the other copy. The derivation (task 2.4) is sized against **12/13**, and the divergence is itself evidence for A-2. |
| A-4 | Policy rows across the 4 `AGENTS.md` | feature 32 · incident 22 · product 14 · task 13 = **81** | WBS M-7 says 89 — again a drifted live count. Reinforces A-1: **count at absorb time**. |
| A-5 | `behavior-within-state` rows | **2**, both in the Session Operations table (`:453`, `:454`) | M-9 confirmed and *localized*. The extraction boundary is one table, not scattered — a cheap, checkable exclusion. |
| A-6 | Claudesk has **no** `tests/` dir and no shell-guard harness | mccc's `check-structure.sh` is 2700+ lines of bash; Claudesk's gate is `pnpm verify:auto` (vitest + cargo) | ⚠️ **Tasks 2.7/2.8 cannot be a `cp` of the shell phases.** Phase 3d and Phase 18 must be **re-expressed as vitest tests**. This is a port, not a move. |
| A-7 | Precedent for a typed machine in this repo | `src/state/recycleMachine.ts` — `RecycleState` sum type + `recycleTransition(state, signal, …)`, guarded by `recycleMachine.test.ts` (23k) | ⚠️ **Copy this shape.** Discriminated unions + one transition fn + a `switch` with exhaustiveness is the established local idiom. Do not invent a new one. |
| A-8 | WP1's standing tests already read the fixtures | `m15SupervisorFixture.test.ts` (33 tests) resolves both fixtures out of the **cycle-archive dir** | ⚠️ Known MAJOR in the backlog. **Not this WP's to fix** (it rides before `/product-finalize`), but WP2 must not add a *second* consumer of that path. |

## Decisions taken at plan time (disclosed, not silently assumed)

- **D-1 — `transitions.md` is the sole source; the four `AGENTS.md` tables are NOT absorbed.** Forced by A-2: they disagree, and `AGENTS.md` is the stale one. This *strengthens* task 2.9 (Phase 9's whole job is policing that duplication) and makes the hand-off a genuine simplification rather than a transfer.
- **D-2 — The model is hand-transcribed TypeScript data, not a runtime markdown parser.** `transitions.md` lives in a gitignored `_ref/` symlink that is not present in a shipped `.app`; parsing it at runtime would make the supervisor depend on a companion checkout. A typed literal is also what makes exhaustiveness checkable at compile time. ⚠️ **Accepted cost:** the model can drift from upstream — mitigated by task 2.6b (a drift test that reads `_ref/` *when present* and skips cleanly when absent).
- **D-3 — Mode 0 is modeled as a distinct input value, not a fifth mode.** Per R-1 the stored mode is the authority and Mode 0 is not honored as a suppressor; but the *type* must still be able to express it so the R-1 decision is visible in code rather than implicit in its absence.
- **D-4 — Location: `src/state/workflowMachine/`** (a directory, not one file). The graph is ~111 edges plus 4 policy tables; `recycleMachine.ts` is a single file at 1 machine, this is 5 workflows. Splitting by concern (`edges.ts`, `policy.ts`, `lookup.ts`, `types.ts`) keeps each reviewable.

## Work Tree

- [x] Phase 1: Types + the edge graph  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 with the new module imported by its test (⚠️ `./node_modules/.bin/tsc`, never `pnpm exec tsc` — `[[pnpm-exec-shadows-local-binaries]]`)
  - CLI: `pnpm vitest run src/state/__tests__/workflowMachine.test.ts` exits 0, stdout reports a nonzero test count (⚠️ a filtered run printing `ok. 0 passed` also exits 0 — assert the count, per `docs/lessons/source-text-guards.md`)
  - CLI: a node one-liner importing the built module and calling `allEdges().length` prints the count absorbed from `transitions.md` and exits 0
  - Console: no new TS errors in `pnpm verify:auto`'s `tsc` step
  - [x] P1.1 Create `src/state/workflowMachine/types.ts` — `WorkflowId` (5: product/feature/task/incident/session-ops), `StateId`, `EdgeId`, and `Edge` with **`dispatchableTarget` as its own field** (inherited constraint 1), not derived from policy.  <!-- status: [x] -->
  - [x] P1.2 Transcribe the edge graph into `src/state/workflowMachine/edges.ts` from **`transitions.md` only** (D-1/A-2). ⚠️ Do NOT consult the `AGENTS.md` tables — they carry a wrong `F10` target and omit `F9b`/`F10b`/`F30`.  <!-- status: [x] -->
  - [x] P1.3 Classify `dispatchableTarget` per edge: terminal (`EXIT`, `EXIT→reflect`), SURFACE, meta-op, and cross-workflow ESCALATE/REDIRECT targets are **non-dispatchable**. ⚠️ Pin the six named in the probe (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`) as an explicit test, since they are the measured 223→127 delta.  <!-- status: [x] -->
  - [x] P1.4 Exclude the 2 `behavior-within-state` rows (A-5, `transitions.md:453`/`:454`) and add a test asserting they are absent, so a later transcription cannot quietly import them.  <!-- status: [x] -->
  - [x] P1.5 Structural tests: every edge id unique; every `from`/`to` resolves to a declared state or a named sentinel; edge count matches the absorbed total (⚠️ assert the count **absorbed**, not the WBS's stale 113 — A-1).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] -->
  - [x] verify-human  <!-- status: [x] AUTO-SKIP (F11) — no integration boundary, verify-self all-PASS -->
  - [x] verify-codify  <!-- status: [x] -->

- [x] Phase 2: The policy cell + the four modes + Mode 0  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/__tests__/workflowMachine.test.ts` exits 0 with an increased nonzero test count
  - CLI: a node one-liner calling the policy type's exhaustiveness helper over all cell values exits 0; passing an invented out-of-union value fails `tsc` (⚠️ prove the compile-time arm by an expect-error fixture, not by prose)  <!-- [Corrected 2026-09-12 at verify-self: written at plan time as "all 5 values / invented 6th"; the union deliberately became SIX arms at P2.1 (upstream's five values + `confirm`), so the real fixture is an invented SEVENTH. Verified at 6 arms / 7th rejected. Outcome de-numbered so it tracks the code rather than a plan-time guess.] -->
  - CLI: a node one-liner resolving `AUTO-SKIP`'s condition with `{integrationBoundary: true}` vs `{integrationBoundary: false, verifySelfAllPass: true}` prints two different verdicts and exits 0
  - [x] P2.1 `src/state/workflowMachine/policy.ts` — the cell as a **discriminated union over the 5 values** (constraint 4), following the `RecycleState` idiom (A-7). Never a boolean.  <!-- status: [x] -->
  - [x] P2.2 Model `AUTO-SKIP`'s condition as **data** (`{ requires: ["no-integration-boundary", "verify-self-all-pass"] }`), not a comment — so a caller can evaluate it rather than read about it.  <!-- status: [x] -->
  - [x] P2.3 Model `SKIP (entire skill)` distinctly from `AUTO-SKIP`, and pin `F17b` as the Mode-4 route **around** the skipped review-quality state.  <!-- status: [x] -->
  - [x] P2.4 Model Mode 0 as a distinct input value (D-3), with the **R-1 ruling encoded as the resolver's behavior**: the stored mode wins, Mode 0 never suppresses. Test the ruling explicitly so a later reader cannot reinstate Mode-0 suppression by accident.  <!-- status: [x] -->
  - [x] P2.5 Transcribe the four per-workflow policy tables from `transitions.md` (feature/task/product/incident) + the session-boundary exit chain. ⚠️ Incident is **always Mode 2 regardless of selected mode** — model that as a rule, not as four duplicated columns.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] -->
  - [x] verify-human  <!-- status: [x] AUTO-SKIP (F11) — no integration boundary, verify-self all-PASS -->
  - [x] verify-codify  <!-- status: [x] -->

- [x] Phase 3: The edge→policy-row derivation (M-8) — the hard half  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: a node one-liner calling `lookup("F4", "autopilot")` prints `PAUSE` and exits 0 — ⚠️ **the F3/F4 sentinel** (constraint 2); `lookup("F10","autopilot")` prints `AUTO`
  - CLI: a node one-liner over **every** edge id × 4 modes exits 0; **`ambiguityReport()` is empty** and every pair returns a well-formed result (`resolved` with a non-conditional cell, or `unmapped` with a reason) — never undefined, never thrown, never an `auto-skip` escaping  <!-- [Corrected 2026-09-12 at verify-self: originally said "prints zero unresolved pairs". Measurement found 31 of 111 edges legitimately UNMAPPED (no governing row upstream) — that is the design, not a defect, and `unmapped` is a first-class result with no `cell` field. The "zero" the outcome was really about is AMBIGUITY, which is 0. Verified: 444 pairs → 320 resolved / 124 unmapped / 0 malformed / 0 escaped.] -->
  - CLI: `pnpm vitest run src/state/__tests__/workflowMachineLookup.test.ts` exits 0 with a nonzero count including the F3/F4 sentinel test by name  <!-- [Corrected 2026-09-12 at verify-self: the plan named `workflowMachine.test.ts`, but the sentinel lives in the LOOKUP test file — the graph test predates it. Both run green (23 + 18); the sentinel's describe block is "M15 WP2 Phase 3 — the F3/F4 regression sentinel".] -->
  - [x] P3.1 Build the mapping in `src/state/workflowMachine/lookup.ts`: an edge id resolves to a policy row via its **from-state** when the row is step-keyed, or directly when the row is edge-keyed (A-3: 12 edge-keyed / 13 step-keyed in the feature table).  <!-- status: [x] -->
  - [x] P3.2 ⚠️ **Make ambiguous cases explicit rather than guessed** (WBS 2.4). An edge whose from-state has multiple candidate rows, or none, must resolve to a declared `ambiguous`/`unmapped` value that a test enumerates — never a silent default. A silent default here is precisely the "wrong verdict from an assumed mapping" M-8 warns of.  <!-- status: [x] -->
  - [x] P3.3 Pin the **F3/F4 regression sentinel** (constraint 2) as a named test: both are spec exits and both PAUSE in Mode 3. ⚠️ Do NOT pin `F10`/`F13`/`F19` as the sentinel — measured to contribute zero FPs.  <!-- status: [x] -->
  - [x] P3.4 Pin the six non-dispatchable edges from P1.3 through the *lookup* as well, proving policy and dispatchability are read independently (constraint 1).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] -->
  - [x] verify-human  <!-- status: [x] AUTO-SKIP (F11) — no integration boundary, verify-self all-PASS -->
  - [x] verify-codify  <!-- status: [x] -->

- [x] Phase 4: The single funnel + the caller-side guard  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `grep -rn` over `src/` finds **exactly one** module exporting a policy-resolving function, and every other `src/` reference is an import of it — the guard prints the offending path and exits nonzero when a second reader is introduced
  - CLI: a mutation probe — add a second direct reader of the policy table in a scratch file — makes `pnpm vitest run src/state/__tests__/workflowMachineFunnel.test.ts` exit nonzero; reverting restores exit 0 (⚠️ **assert the mutation landed in executable code** before believing the pass — `[[verify-the-mutation-landed]]`, `[[bsd-sed-lacks-word-boundary]]`: use `perl -pi -e`, never `sed \b`)
  - CLI: `pnpm verify:auto` exits 0 end-to-end
  - [x] P4.1 Funnel every policy read through **ONE** exported function (WBS 2.5) — `resolvePolicy(edgeId, mode, context)`. No other module may read `policy.ts`'s tables directly.  <!-- status: [x] -->
  - [x] P4.2 ⚠️ Add the **caller-side** guard, per constraint 6. The test must fail when a *caller* bypasses the funnel — not merely when the funnel itself is wrong. ⚠️ Prefer an import-graph/behavioral assertion over a `?raw` source grep where possible (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`); if a source-text predicate is unavoidable, `grep -c` the anchor first (`[[raw-guard-substring-must-be-unique-to-its-site]]`) and strip comments (`[[raw-guard-identifier-satisfied-by-own-comments]]`).  <!-- status: [x] -->
  - [x] P4.3 Mutation-prove the guard **individually** per form, confirming each mutant landed in executable code (`docs/lessons/source-text-guards.md`). ⚠️ An invalid probe and a real hole look identical (`[[invalid-probe-and-real-hole-look-identical]]`).  <!-- status: [x] -->
  - [x] P4.4 Exhaustiveness test over (state × mode) cells (WBS 2.6) — every declared state resolves a cell in every mode, or is explicitly listed as `n/a`.  <!-- status: [x] -->
  - [x] P4.5 Drift test (D-2 mitigation): when `_ref/claude-customization/…/transitions.md` is present, assert the absorbed edge-id set still matches upstream; **skip cleanly** when `_ref/` is absent (it is a gitignored symlink, absent in CI and in a fresh checkout). ⚠️ A skipped test must report as skipped, not as passed.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] -->
  - [x] verify-human  <!-- status: [x] AUTO-SKIP (F11) — no integration boundary, verify-self all-PASS -->
  - [x] verify-codify  <!-- status: [x] -->

- [x] Phase 5: Port the two mccc guard phases + hand off Phase 9  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/__tests__/workflowMachineUpstreamContract.test.ts` exits 0 with a nonzero count; mutating the token regex makes it exit nonzero  <!-- [Corrected 2026-09-12 at verify-self: the plan named `transitionTokenContract.test.ts`, which DOES NOT EXIST. The port carries BOTH Phase 3d and Phase 18, so it was not named after just one of them. Verified: 11/11, and narrowing TRANSITION_TOKEN_RE fails 4.] -->
  - CLI: a node one-liner asserting `S22` and `S23` exist in the absorbed graph with AUTO in Modes 2–4 and PAUSE in Mode 1 prints both and exits 0  <!-- [Corrected 2026-09-12 at verify-self: the plan said "AUTO in all four modes", echoing upstream's prose. Mode 1 (stepping) pauses after EVERY skill by definition, so the model encodes `stepping ? pause : auto`. Measured independently twice: stepping=pause, orchestrated/autopilot/fsd=auto for both edges.] -->
  - CLI: `pnpm verify:auto` exits 0 end-to-end
  - [x] P5.1 Port **Phase 3d** (the `TRANSITION:` regex contract) as a vitest test. ⚠️ **This is a port, not a `cp`** (A-6): Claudesk has no shell-guard harness, and mccc keeps its own copy while skills still emit the token.  <!-- status: [x] -->
  - [x] P5.2 Port **Phase 18** (the boundary auto-chain pin — `S22`/`S23` AUTO in all modes + the capture conditional gate) as a vitest test over the absorbed model.  <!-- status: [x] -->
  - [x] P5.3 Write the mccc hand-off note for **Phase 9's deletion** (WBS 2.9) — a cross-repo item. ⚠️ **Do not edit the mccc repo from this session**: every `~/.claude/skills/` entry is a symlink into it (`[[installed-skills-are-symlinks-into-the-mccc-repo]]`, backlog `high`). Write the note into this repo (`HANDOFF-to-mccc-m15-wp2.md`) and leave the mccc edit to a session in that repo. ⚠️ Record A-2 in the note: Phase 9 polices a duplication whose copies **already disagree** on `F10` — evidence the deletion is a genuine simplification.  <!-- status: [x] -->
  - [x] P5.4 Record in `## Discoveries` + backlog anything WP3 inherits that this pass surfaced.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] -->
  - [x] verify-human  <!-- status: [x] AUTO-SKIP (F11) — no integration boundary, verify-self all-PASS -->
  - [x] verify-codify  <!-- status: [x] -->

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** ⚠️ **SHIPPED** as `7ef9f35` (local commit; NOT pushed). review-quality next.
- **Blocked:** none
- **Unvisited:** Phase 5 (port 3d/18, hand off Phase 9)
- **Open discoveries:** two — A-2, the two upstream copies disagree on `F10`; recorded below and destined for the mccc hand-off note (P5.3)

### Phase 1 verify-codify record (2026-09-12) — 4 tests added, 19 → 23

**No integration boundary** — isolated new artifacts only, so no consuming-surface test is owed. ⚠️ **Unit-level is the HIGHEST level available here, not a default taken for convenience**: the module has no HTTP endpoint, no CLI command and no UI, so an end-to-end or integration test is unreachable by construction.

**Gap analysis before writing anything.** Every export was already *referenced* by the build-time tests — but referenced is not covered. Three behaviors had been confirmed only by **throwaway** scripts (a diff script at build, a node process at verify-self) and nothing standing would catch their regression:

| Gap | Codified as |
|---|---|
| The absorbed total (111) — asserted only as `toBeGreaterThan(0)` | `holds exactly 111 edges` |
| The per-workflow split (14/43/13/20/21) — asserted nowhere | `splits 14/43/13/20/21 across the five workflows` |
| The dispatchable balance (67/44) — asserted only as "between 0 and all" | `classifies 67 edges dispatchable and 44 not` |
| `isDispatchable`'s four NON-skill arms — exercised only incidentally via real edges | `narrows correctly on every kind`, driving the predicate directly over one value of each kind + asserting the case list covers the whole union |

⚠️ **This is the WP1 ruling applied literally — *"only a standing test is coverage."*** The counts were measured twice during this phase and **both measurements were throwaway**. A partial transcription (one workflow's table silently dropped) would have passed every shape assertion in the file.

⚠️ **Deliberately NOT duplicates of the structural block.** Those assert SHAPE and deliberately avoid exact counts (hardcoding `wbs.md`'s stale 113 would fail on a correct absorption). These assert ABSORBED TOTALS — a different property, and the one a silent partial transcription breaks.

**Three mutants, each landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| C1 | drop ONE edge (`T11`) → 110 entries | ✅ 3 tests fail — **before codify this passed everything** |
| C2 | flip `P13` from terminal to `skill(...)` | ✅ 3 tests fail |
| C3 | widen `isDispatchable` to accept `meta-op` | ✅ 4 tests fail |

**Full suite:** `pnpm verify:auto` exit 0 — **2322 passed** (2318 + 4), 176 files, 0 failures. The single lint warning is the pre-existing `XtermPane.tsx` `exhaustive-deps` one, untouched here. No `## Test Triage` entry is owed — nothing failed.

### Phase 1 verify-human record (2026-09-12) — AUTO-SKIP (F11)

All four auto-skip gates clean: **(a)** `drive_mode: autopilot`; **(b)** verify-self all-PASS, no UNVERIFIED/FAILED leaf; **(c)** no integration boundary; **(d)** no Observable Outcome cites a consuming surface — all four name only the new module's own files, `tsc`, `vitest`, and the gate itself.

**Affirmation printed in chat for the operator's read-time veto.** The phase adds three isolated new files (`types.ts`, `edges.ts`, `workflowMachine.test.ts`); **no existing file was modified**. The only other tracked edits are `runtimes.md` (a registry measurement) and `backlog.md` (two SURFACEs) — neither is code consumed by a running surface.

⚠️ **The skill's documented known-limitation was flagged to the operator rather than passed over silently.** A phase whose deliverable is a *decision artifact* gets auto-skipped under these gates, and Phase 1 is adjacent to that shape: its load-bearing output is a **transcription of an upstream document**, so correctness means fidelity to `transitions.md`. Mitigated by verifying that mechanically (111/111 ids; 109/111 from→to pairs byte-identical; the 2 divergences pinned by test) and by six landed mutants — but the operator was pointed at `edges.ts` and `/feature-build P1.2` as the way back in, specifically because **A-2 is a claim about THEIR companion repo** that deserves a human eye.

### Phase 1 verify-self record (2026-09-12) — PASS (4/4)

**No integration boundary** — the phase adds isolated new artifacts only (`types.ts`, `edges.ts`, a new test). Nothing outside the module's own test imports it; confirmed by verify-auto check 5. The subagent spawn still fired unconditionally per `arch.md` (Revision 2026-04-27) — the design property is parent-context cleanliness, not tool availability.

| Outcome | Verdict |
|---|---|
| `tsc --noEmit` exits 0 with the module in the checked graph | PASS |
| `vitest run …/workflowMachine.test.ts` exits 0 with a NONZERO count | PASS — 19/19 |
| node one-liner prints the absorbed count + `F10.to` | PASS — `TOTAL=111`, split `{product:14, feature:43, task:13, incident:20, session-ops:21}`, `F10.to=verify-self` |
| no new TS errors in `pnpm verify:auto`'s tsc step | PASS — full gate exit 0, zero `error TS` in the log |

**0 BLOCKING · 0 COSMETIC.** The re-verification heuristic did not fire (no FAIL to adjudicate).

⚠️ **The subagent deviated from its instructions, correctly, and I verified the deviation rather than accepting it.** I told it to use `./node_modules/.bin/vite-node`; **that binary is not installed in this repo** (only `vite` and `vitest` exist) — my instruction was wrong. It substituted a throwaway vitest spec and said so. Confirmed independently: `ls node_modules/.bin | grep vite` returns only `vite` and `vitest`.

⚠️ **Two subagent claims independently re-checked, not taken on trust:**
1. **Cleanliness** — it claimed to have deleted its scratch file. `git status` + `ls tmp/scratch/` confirm no artifacts left behind and no tracked file modified by it.
2. **The graph values** — re-derived by the orchestrator through a *different runner* (`node --experimental-strip-types`, a real process writing to stdout, rather than the subagent's vitest spec). Printed `TOTAL=111`, the same split, `F10.to=verify-self`, plus `dispatchable=67` and `F19.dispatchable=false`. Agreement across two independent runners is what makes this more than a single instrument's reading (`[[xterm-dom-reads-fake-a-blank-pane]]`: instrument agreement is only meaningful when the instruments do not share a defect — these two share only the module under test).

✅ **The subagent mutation-checked its own assertion** (111→112, confirmed failing with `expected 111 to be 112`) before reporting green — the right instinct, and it means its PASS is not a vacuous one.

### Phase 1 verify-auto record (2026-09-12) — PASS

Five scoped checks against the three files this build step changed. ⚠️ Deliberately scoped, not the full suite — the full `pnpm verify:auto` gate was already run green during build (31.5s, frontend 2318 / Rust ALL GREEN).

| # | Check | Result |
|---|---|---|
| 1 | `eslint` on the 3 changed files | exit 0, no findings |
| 2 | `prettier --check` on the 3 changed files | exit 0, all match style |
| 3 | `tsc --noEmit` | exit 0 |
| 4 | `vitest run src/state/__tests__/workflowMachine.test.ts` | 19/19 passed |
| 5 | **import smoke** — fresh dynamic import from a scratch file outside the module dir | 1/1 passed |

⚠️ **Check 5 earns its place:** nothing outside its own co-located test imports `workflowMachine/` yet, so checks 1–4 could all pass on a module no real consumer can load. The smoke test imports it by relative path from `tmp/scratch/` and asserts the graph is usable (111 edges, `F10 → verify-self`, `F7` dispatchable, `F19` not). Scratch file removed after the run.

⚠️ **Check 3 is project-wide, not file-scoped** — `tsc` under this project's config has no meaningful single-file mode, so the scoped ideal is not achievable for type checking. Noted rather than silently presented as scoped.

### Phase 2 verify-human record (2026-09-12) — AUTO-SKIP (F11)

All four gates clean: `drive_mode: autopilot` · verify-self all-PASS · no integration boundary · no outcome cites a consuming surface. Affirmation printed in chat for the read-time veto — two new files, no existing file modified.

⚠️ **Two items were surfaced to the operator rather than passed over silently**, because Phase 3's derivation sits directly on this layer:
1. **The CONFIRM modeling decision was changed mid-phase** (flattened → own arm). Flagged as still-cheap to collapse at Phase 3 if the operator judges it over-modeling — `isStop()` already treats it as `pause`, so nothing downstream branches on it.
2. **58 rows were hand-transcribed.** The transcription is mechanically verified (42/43 four-column rows + 15/15 incident rows), but **the correctness of the upstream table itself is a claim about the operator's workflow system**, not something this session can verify. The F3/F4 sentinel was named as the row Phase 3 depends on most.

### Phase 2 verify-self record (2026-09-12) — PASS (3/3)

**No integration boundary** — `policy.ts` is imported only by its own test. Subagent spawn fired unconditionally per `arch.md`.

| Outcome | Verdict |
|---|---|
| sibling graph test exits 0 with an increased nonzero count | PASS — 23/23 (up from Phase 1's 19) |
| exhaustiveness helper over every cell value; an out-of-union value fails `tsc` | PASS — 6 arms exercised; invented 7th rejected |
| `resolveCell` gives two different verdicts for the two evidence sets | PASS — `pause` vs `skip-skill` |

**0 BLOCKING · 0 COSMETIC.** Re-verification heuristic did not fire.

⚠️ **A STALE OBSERVABLE OUTCOME WAS FOUND AND CORRECTED, NOT WORKED AROUND.** Outcome 2 was written at plan time as *"all **5** cell values … an invented **6th** value fails tsc"*. The union deliberately became **six** arms at P2.1 (upstream's five vocabulary values + `confirm`), so the real fixture is an invented **seventh**. I flagged the discrepancy in the spawn prompt and told the subagent to **test reality and report real numbers rather than force a match** — and that finding fewer than six arms would itself be a genuine FAIL. It did exactly that. ✅ **The outcome text in the Work Tree above is now corrected in place with a dated marker**, and de-numbered so it tracks the code instead of a plan-time guess. Leaving it stale would have meant every future reader checking the plan against a number the code deliberately moved past.

**The subagent's compile-time proof was unusually well-controlled** and is worth not re-deriving: (A) the bare invented value errors; (B) a `@ts-expect-error` fixture compiles **clean**, proving the directive was *consumed* rather than unused; (C) ⚠️ **a mutation control** — a helper omitting only the `confirm` arm errored `Type '{ readonly kind: "confirm" … }' is not assignable to type 'never'`, proving the `never`-check is **live, not vacuous**. Plus a valid-arm negative control that compiled clean.

⚠️ **Independently re-verified by the orchestrator through a different runner**, not taken on trust: `tsc` on an invented `"escalate"` cell errored with the compiler **enumerating the six arms verbatim** (`"auto" | "pause" | "auto-skip" | "skip-skill" | "n/a" | "confirm"`), and a `node --experimental-strip-types` process confirmed all six are genuinely **exercised in the matrix**, not merely declared. Cleanliness also re-checked: `git status` and `ls tmp/scratch/` unchanged, `tsc --noEmit` still exit 0.

### Phase 2 verify-auto record (2026-09-12) — PASS

Six scoped checks against the two files this build step changed. 46 tests green across the three checks that run tests.

| # | Check | Result |
|---|---|---|
| 1 | `eslint` on the 2 changed files | exit 0, no findings |
| 2 | `prettier --check` on the 2 changed files | exit 0 |
| 3 | `tsc --noEmit` | exit 0 |
| 4 | `vitest run …/workflowMachinePolicy.test.ts` | 22/22 |
| 5 | Phase 1 sibling (`workflowMachine.test.ts`) — regression scope | 23/23 |
| 6 | import smoke — fresh dynamic import, resolves a real cell | 1/1 |

⚠️ **A false-green shape surfaced in the tooling itself and is worth recording.** My first attempt passed both filenames as one shell-quoted argument. `prettier` then printed **"All matched files use Prettier code style!"** while matching ZERO files and exiting **2**. Reading the message alone — which is what a human skims — would have recorded a pass for a check that ran on nothing. Caught only because the exit code was captured alongside the message. Same family as the `ok. 0 passed` trap in `docs/lessons/source-text-guards.md`: **a zero-subject run can print success.**

⚠️ **Check 5 is deliberate scope widening, not scope creep.** `policy.ts` is a new module in the same directory as Phase 1's graph; running the sibling file confirms the new module did not disturb it, at a cost of 150ms. Still far short of the full suite, which verify-auto's role rule forbids here.

### Phase 3 verify-human record (2026-09-12) — AUTO-SKIP (F11)

All four gates clean. ⚠️ **The affirmation is NARROWER here than in Phases 1–2 and was stated as such:** this phase **edited two existing files** (`policy.ts`, `workflowMachinePolicy.test.ts`) rather than being purely additive. Both are consumed only by this WP's own code, so no existing surface reaches them — but the operator was told the difference rather than handed the same boilerplate.

⚠️ **Three items surfaced to the operator at the veto point**, because Phase 3 is where the WP's substantive findings landed:
1. **Two gaps in the operator's own `transitions.md`** (`I2`, `P13`), modeled as explicit `unmapped` rather than patched. **The open question is the operator's:** should `I2` (dispatchable) PAUSE like every other incident row, or AUTO?
2. **Four policy rows were re-classified** to make the derivation work — including `research / arch / wbs happy path`, which spans three states' exits and required deciding that P4/P6/P8 belong to the `back-loops` row instead. **That is a reading of the operator's table**, not a mechanical transform, and was named as such.
3. **The plan's expectations were wrong twice** and the OUTCOMES were corrected, not the code.

### Phase 3 verify-self record (2026-09-12) — PASS (3/3)

**No integration boundary.** ⚠️ Phase 3 **edited an existing module** (`policy.ts`), so the boundary question was re-asked rather than inherited from Phases 1–2: the rule's five conditions are about existing **consuming surfaces**, and `policy.ts` is consumed only by its own test and by `lookup.ts` — both created in this WP. No existing surface reaches this code.

**Full enumeration — 111 edges × 4 modes = 444 pairs:**

| | |
|---|---|
| resolved | **320** (cells: `pause` 156 · `auto` 153 · `skip-skill` 7 · `n/a` 4) |
| unmapped | **124** (reasons: `meta-op` 76 · `entry-or-sentinel` 40 · `no-row-upstream` 8) |
| unknown-edge / malformed / thrown | **0** |
| ⚠️ `auto-skip` escaping unresolved | **0** |
| `ambiguityReport()` | **0** · `unmappedReport()` **31** distinct edges |

✅ **Positive control by the subagent:** a bogus id returns `unknown-edge`, proving the union's third arm is live rather than dead code.

⚠️ **TWO STALE OBSERVABLE OUTCOMES FOUND AND CORRECTED IN PLACE** (both flagged to the subagent in advance, both confirmed wrong in exactly the way predicted):
1. **"prints zero unresolved pairs"** — measurement found **31 of 111 edges legitimately unmapped**. That is the design, not a defect: `unmapped` is a first-class result whose union arm has **no `cell` field**. The "zero" the outcome was really reaching for is **ambiguity**, which is 0. Outcome rewritten to say what it actually means.
2. **Wrong test file** — the plan named `workflowMachine.test.ts`; the F3/F4 sentinel lives in `workflowMachineLookup.test.ts` (the graph test predates it). Both run green (23 + 18).

⚠️ **A tooling claim was checked, not accepted.** The subagent reported that `node --experimental-strip-types` fails on `lookup.ts` because its internal imports are extensionless — which contradicted my own successful use of that runner in Phases 1–2. **Verified and the subagent is right, for a reason worth recording:** `lookup.ts` has a **runtime** import (`import { edgeById, EDGES }`), which Node's ESM resolver must actually resolve, whereas `edges.ts`/`policy.ts` carry only `import type` lines that are erased before Node sees them. **Extensionless is the project convention** (every `src/state/*.ts` module does it), so `lookup.ts` is correct as written and the runner choice was the thing that had to change. It used throwaway vitest specs instead.

⚠️ **Every figure independently re-derived by the orchestrator** through its own enumeration: 320/124/0/0, identical cell-kind and reason histograms, ambiguity 0, 31 distinct. Cleanliness re-checked — no artifacts, no tracked file touched.

### Phase 3 verify-auto record (2026-09-12) — PASS

Six scoped checks over the **four** files this build step touched. 69 tests green.

| # | Check | Result |
|---|---|---|
| 1 | `eslint` on the 4 changed files | exit 0 |
| 2 | `prettier --check` on the 4 changed files | exit 0 |
| 3 | `tsc --noEmit` | exit 0 |
| 4 | `workflowMachineLookup.test.ts` (new) | 18/18 |
| 5 | the two siblings this phase **edited** | 50/50 |
| 6 | import smoke — fresh dynamic import of the funnel | 1/1 |

⚠️ **Check 5 is not optional here the way it was in Phase 2.** Phases 1–2 were purely additive; **Phase 3 EDITED `policy.ts`** (four row re-classifications) and `workflowMachinePolicy.test.ts` (the stale count). A phase that modifies an existing module owes a regression check on that module's own tests — which is exactly where the stale-count failure surfaced during build.

### Phase 3 verify-codify record (2026-09-12) — 7 tests added, 18 → 25

**No integration boundary.** Unit-level is the highest level available.

**Gap analysis found three properties proven only by the THROWAWAY verify-self enumeration:**

| Gap | Codified as |
|---|---|
| ⚠️ **`resolvePolicy` is TOTAL over the matrix** — 444 pairs, zero malformed, zero conditional escaping | `returns a well-formed result for every edge × mode pair` |
| The cell-kind composition (156/153/7/4) | `composes the cells as measured` |
| The unmapped-reason grouping (76/40/8) | `groups the unmapped reasons as measured` |
| ⚠️ **The four re-classified rows stay resolvable** | 4 tests, each asserting the ROW the edge resolves THROUGH — not merely that it resolves |

⚠️ **Totality is the property WP3 depends on most.** A partial function here means the detector crashes or reads `undefined.kind` on some edge nobody exercised by hand. The enumeration proved it once; now it stands.

⚠️ **The re-classification tests assert the resolving ROW, not just "it resolves."** A different row producing the same cell would pass a weaker assertion while meaning the derivation found the **wrong authority** — which is the failure this WP exists to prevent.

⚠️ **`P4/P6/P8` get their own test** because they are the consequential mistake: they leave the SAME three states as P5/P7/P9 but are back-loops, and **the two rows disagree in Mode 3** (back-loops PAUSE, happy path AUTOs). The test also asserts the two rows genuinely differ, so it cannot pass tautologically.

**Three mutants, each landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| D1 | revert the task-verify re-classification to step-keyed | ✅ **8 tests fail** |
| D2 | move `P4` into the happy-path row | ✅ 3 tests fail |
| D3 | flip **ONE cell** of 320 (`feature/ship` orchestrated) | ✅ 1 test fails — the histogram catches what the totals cannot |

**Full suite:** `pnpm verify:auto` exit 0 — **2374 passed**, 178 files, 0 failures. No `## Test Triage` entry owed.

### Phase 4 verify-human record (2026-09-12) — AUTO-SKIP (F11)

All four gates clean. ⚠️ **The narrowest affirmation of the four phases:** Phase 4 touched **no production code whatsoever** — one new test file, nothing else.

⚠️ **ONE JUDGMENT CALL WAS PUT TO THE OPERATOR TO OVERRULE, not just disclosed.** The guard **pins the importer population by name**, which means **WP3's first real consumer WILL fail this test** — deliberately, to force "does this go through `resolvePolicy`?" to be answered out loud. **That is a speed bump on the operator's own future work.** The reasoning given: this WP exists to stop the "correct mechanism, non-honoring caller" defect that has bitten this repo four times, and with zero production consumers today a guard without the allowlist is vacuously green forever. **The operator was told exactly which block to delete** (the allowlist `describe`) if they would rather WP3 not hit a failing test on its first commit — the structural tests would still stand without it.

### Phase 4 verify-self record (2026-09-12) — PASS (3/3)

**No integration boundary** — the phase added one test file and touched **no production code at all**.

⚠️ **THE SUBAGENT WAS TOLD NOT TO TRUST MY MUTATION RESULTS AND TO RUN ITS OWN.** I had already proven the guard discriminates; a verify-self that merely re-read my numbers would be the parent grading its own homework. It planted its own violating module and observed the failures directly. **Its matrix independently reproduces mine:**

| Planted production file | Exit | Tests failed | `wires graph to policy in exactly ONE module` |
|---|---|---|---|
| none (baseline) | 0 | 0 of 13 | PASS |
| `bypass.ts` (hand-rolled lookup) | 1 | **3** | ⚠️ **FAIL** |
| `correct.ts` (imports only `resolvePolicy`) | 1 | **2** | ✅ **PASS** |
| reverted | 0 | 0 of 13 | PASS |

✅ **The discrimination claim HOLDS under independent test.** The structural test fires only on the bypasser; both consumer kinds trip the two allowlist tests, which is the documented review prompt rather than a defect verdict. ⚠️ **The guard also prints the offending path verbatim** (`expected [ 'probe-scratch/bypass.ts' ] to deeply equal []`), so a future failure names the file rather than reporting a bare `false`.

⚠️ **The subagent asserted its mutation LANDED before believing the result** — `ls -la` plus a grep confirming the two import statements and the function body, and the file was written whole via heredoc rather than through `sed` (which silently no-ops on BSD/macOS). That is the discipline `[[verify-the-mutation-landed]]` exists for, applied without being reminded mid-run.

✅ **The `_ref/`-gated drift tests RAN rather than skipped** in its environment — confirming the 13/13 figure is the full-coverage run, not the 11-passed/2-skipped fresh-checkout shape.

**Full gate re-run by the subagent independently:** `pnpm verify:auto` exit 0 in 26.8s, all seven chained steps, 179 files / 2387 tests. ⚠️ It used `./node_modules/.bin/tsc`, explicitly noting the `pnpm exec tsc` false-green trap.

**Cleanliness re-checked by me:** `find` for stray probe files returns none; `git status` shows only my WP2 work; the guard is still 13/13.

### Phase 4 verify-auto record (2026-09-12) — PASS

Six scoped checks over the **one** file this build step changed (no production code — Phase 4 added only the guard). 89 tests green.

| # | Check | Result |
|---|---|---|
| 1 | `eslint` on the changed file | exit 0 |
| 2 | `prettier --check` | exit 0 |
| 3 | `tsc --noEmit` | exit 0 |
| 4 | `workflowMachineFunnel.test.ts` | 13/13 |
| 5 | **independent scan integrity** — a separate walker agrees the src population is real | 1/1 |
| 6 | the three sibling machine tests (regression scope) | 75/75 |

⚠️ **Check 5 is specific to this phase's shape.** The guard is a **source-scanner**: its assertions are only as good as the file population it walks. An independent walker (not the guard's own `sourceFiles()`) confirmed the population is non-trivial — so a green guard is not resting solely on its own scan helper being correct.

### Phase 4 verify-codify record (2026-09-12) — 6 tests added, 13 → 19, and a REAL DEFECT FOUND

**No integration boundary.**

⚠️ **THE GAP: the guard's most important property existed ONLY IN COMMENTS.** The discrimination claim — *"a bypassing consumer fails the wiring test, a correct one does not"* — was proven **twice by hand** (once by me, once by the independent verify-self subagent planting its own module) and **both proofs were throwaway**. Prose asserting what no code checks is the same shape as a `?raw` guard satisfied by its own comments: authoritative-reading, verifying nothing.

**Codified by driving the guard's OWN predicates over synthetic source text** rather than planting real files — writing into `src/` from a test is a filesystem side effect in a parallel suite, and a crashed run could leave a planted violation behind that looks like a real finding on every subsequent run.

⚠️ **A REAL DEFECT IN MY OWN GUARD, found by the test written to catch predicate drift.** The `uses the SAME predicates the live guard uses` test **FAILED on first run**. Diagnosis: **`MACHINE_INTERNALS`'s four entries in `ALLOWED_IMPORTERS` are UNREACHABLE.** The internals import siblings as `"./edges"` — a path that never contains `workflowMachine/` — so the importer predicate can never match them. They were listed defensively and were **dead weight**.

⚠️ **Dead allowlist entries are exactly how an allowlist quietly widens** (the hazard the sibling `keeps every allowlisted name pointing at a file that exists` test already guards from the other direction). **Fixed by asserting the deadness** rather than deleting the names: they are kept because the production-consumer test subtracts them and a future internal *could* use a longer path — but a new test now pins that they are unreachable, so a change that makes one load-bearing is a deliberate, visible flip rather than a silent widening.

⚠️ **My test's assumption was the wrong half, and I corrected the TEST, not the guard.** I had written `expect(importsMachine(lookupSrc)).toBe(true)`. The predicate is right — it detects OUTSIDE consumers, which is its job. The assertion is now `false` with the reasoning inline.

**Two mutants, each landed:**

| # | Mutant | Result |
|---|---|---|
| J1 | wiring predicate flags EVERYTHING (discrimination lost) | ✅ **3 tests fail** — previously only prose described this |
| J2 | importer predicate matches internals too | ✅ the deadness assertion fires |

**Full suite:** exit 0 — **2393 passed**, 179 files. No `## Test Triage` entry owed: the single failure was my own test's wrong assumption, caught and corrected before any full-suite run.

### Phase 5 verify-human record (2026-09-12) — AUTO-SKIP (F11)

All four gates clean.

⚠️ **THE AUTO-SKIP GATE IS LEAST SUITED TO THIS PHASE'S MAIN DELIVERABLE, AND THAT WAS SAID OUT LOUD.** `HANDOFF-to-mccc-m15-wp2.md` is **a document addressed to the operator** asking them to delete a guard in another repo. The gate can confirm it is isolated and well-formed; **it cannot confirm the argument is sound.** Three items were surfaced as *mine, not measurements*:

1. **The recommendation to delete Phase 9.** The case rests on a measurement (the four copies already disagree with `transitions.md` on `F10`), but *"delete a guard"* is the operator's call. ⚠️ **The counter-argument was raised and deliberately NOT weighed for them** — the `AGENTS.md` tables remain the **no-Claudesk floor** for bare-terminal sessions, which is exactly why full absorption of mccc was rejected in the first place.
2. **The `I2` question is genuinely open** and stays that way until the operator answers. Nothing is blocked — the model returns `unmapped`, never a default.
3. **The port/no-port table encodes a BOUNDARY READING, not a fact.** Putting `session-capture`'s gate on mccc's side while taking its policy cell for Claudesk is a judgment about where the 2026-08-14 line falls.

### Phase 5 verify-self record (2026-09-12) — PASS (3/3)

**No integration boundary** — one test file, one allowlist entry, one markdown note. No production code.

| Outcome | Verdict |
|---|---|
| the ported regex contract runs; mutating the regex fails it | PASS — 11/11; narrowing `TRANSITION_TOKEN_RE` → **4 failed** (`expected 'F9b', received 'F9'`) |
| S22/S23 exist with their modeled cells | PASS — both `stepping=pause orchestrated=auto autopilot=auto fsd=auto` |
| `pnpm verify:auto` exits 0 end-to-end | PASS — 180 files / 2404 tests, all Rust suites ok |

⚠️ **TWO STALE OBSERVABLE OUTCOMES, BOTH FLAGGED IN ADVANCE AND BOTH CORRECTED IN PLACE:**
1. **The plan named a file that DOES NOT EXIST** (`transitionTokenContract.test.ts`). The port carries **both** Phase 3d and Phase 18, so it was not named after just one of them. ⚠️ The subagent was told that finding **no** regex-contract file would be a genuine FAIL — it found the real one and judged on substance.
2. **"AUTO in all four modes"** echoed upstream's prose. Mode 1 (stepping) pauses after EVERY skill **by definition** — that is what stepping IS — so the model encodes `stepping ? pause : auto`.

⚠️ **THE SUBAGENT WAS ASKED TO CHALLENGE MY TRANSCRIPTION, NOT JUST CONFIRM IT** — "if you think the model contradicts upstream in a way that matters, say so plainly." It checked and concluded the divergence is deliberate, documented at the encoding site, and pinned by its own assertion; the plan text is the stale artifact.

⚠️ **AND IT FOUND A REAL INCONSISTENCY I HAD INTRODUCED.** The `edges.ts` comments on the S22/S23 rows still read *"AUTO in all four modes at a clean boundary"* verbatim — **contradicting the policy row two files away**. Behaviorally harmless (the policy encoding is what executes) but **a comment that contradicts the executing code is how the next reader gets misled**. ✅ **Fixed:** both comments now state `AUTO in Modes 2-4; PAUSE in Mode 1` with the reason inline and the divergence from upstream's phrasing named. Zero occurrences of the stale phrasing remain.

⚠️ **Independently re-measured by the orchestrator:** `S22`/`S23` cells reproduce exactly (`stepping=pause`, the rest `auto`). Cleanliness re-checked — the mutation probe left no trace, `git status` shows only WP2 work.

### Phase 5 verify-auto record (2026-09-12) — PASS

Seven scoped checks over the three files this build step touched. 135 tests green.

| # | Check | Result |
|---|---|---|
| 1 | `eslint` on the 2 changed TS files | exit 0 |
| 2 | `prettier --check` on both + **the markdown note** | exit 0 |
| 3 | `tsc --noEmit` | exit 0 |
| 4 | `workflowMachineUpstreamContract.test.ts` (new) | 11/11 |
| 5 | `workflowMachineFunnel.test.ts` (edited — allowlist entry) | 19/19 |
| 6 | all five machine test files together | 105/105 |
| 7 | ⚠️ **the hand-off note's cross-repo claim, verified empirically** | mccc `git status` shows only its pre-existing Aug file; **no skill file modified today** |

⚠️ **Check 2 covers the markdown note deliberately.** `.prettierignore` lists `docs/` and `workflow-system/`, but this note sits at **repo root** and is therefore NOT ignored — so it is subject to the format gate like any source file. Confirmed passing rather than assumed exempt.

⚠️ **Check 7 is the one a normal verify-auto would not think to run.** P5.3's whole premise is *"the mccc repo was not touched"* — a claim about a **different git repository**, which no amount of testing in this one would surface. Verified directly: mccc's status is unchanged and `find ~/.claude/skills -newermt` returns nothing for today.

### Ship record (2026-09-12) — commit `7ef9f35`, NOT pushed

**Cleanup:** no TODO/FIXME, no `console.*`/`debugger`, no commented-out code in the new modules; scratch dir holds only the four pre-existing dirs.

**Final verification:** `pnpm verify:auto` exit 0 — 180 files / **2410** tests.

**Shipped:** 4 modules (2,339 lines) + 5 test files (2,073 lines) + the hand-off note, plus `runtimes.md` and `backlog.md` edits and the WIP file. One commit, staged and committed together.

⚠️ **NOT PUSHED, AND THERE IS A DIVERGENCE THE OPERATOR MUST RESOLVE.** `main` is **ahead 6, behind 1**:
- **behind:** `939f572` (remote) *"chore(release): record the v0.4.0 build measurement (131s)"* — touches `runtimes.md` only.
- **ahead:** six local commits, the oldest of which (`f312c13`) has the **SAME commit message** but a **different diff** — it also carries `.claude/memory/MEMORY.md` + a memory file.

⚠️ **These are related-but-not-identical commits, so this is a real divergence needing a rebase or merge decision — not a plain `git push`.** ⚠️ **Deliberately left alone:** resolving a history divergence is the operator's call and is outside a feature ship's scope. The five pre-existing unpushed commits were already flagged at session restore; WP2 adds a sixth.

⚠️ Also note `runtimes.md` is touched by **both sides** of the divergence, so it is the likely conflict point.

### Phase 5 verify-codify record (2026-09-12) — 6 tests added, 11 → 17

**No integration boundary.**

**Two gaps this phase's own verification exposed, both codified:**

| Gap | Codified as |
|---|---|
| `extractTransitionId` was exercised against a hand-picked **six** ids | 3 tests driving it over **all 111** absorbed ids, bare + markdown-decorated + arrow-suffixed |
| ⚠️ **The S22/S23 comment-vs-policy contradiction had NO guard** | 3 tests: the phrase appears exactly twice, the stale phrasing appears zero times, and the policy cells agree |

⚠️ **The second gap is the one that matters.** A verify-self subagent found the `edges.ts` comments contradicting the policy row two files away; **I fixed them by hand and nothing stopped it recurring.** Now reverting either comment fails 2 tests. Guarded as source text because the subject *is* source text — anchor counted with `grep -c` first, haystack whitespace-flattened so a Prettier reflow cannot hide it.

⚠️ **AN ASSERTION I WROTE WAS TOO STRONG AND THE MEASURED TRUTH IS SHARPER.** I claimed *every* naive-regex truncation lands on a real edge. It failed on `F17`. Measured: **three of four** (`F9`, `F10`, `F37` all exist) — `F17` does not. ⚠️ **Mixed damage is WORSE than uniform**: a reader would see most ids resolve fine and one fail, so the bug presents as a sporadic lookup miss rather than a systematic regex fault. Corrected to the measurement rather than weakened to pass.

**Two mutants, each landed:**

| # | Mutant | Result |
|---|---|---|
| M1 | revert an S22 comment to the stale phrasing | ✅ **2 tests fail** — the exact drift found by eye is now automatic |
| M2 | drop an edge (`F37b`) | ✅ 2 tests fail — the whole-graph round-trip notices |

**Full suite:** exit 0 — **2410 passed**, 180 files. No `## Test Triage` owed: the one failure was my own over-strong assertion, corrected before any full-suite run.

---

## ⚠️ WP2 COMPLETE — all five phases `[x]`

| Phase | Deliverable | Tests |
|---|---|---|
| 1 | types + the 111-edge graph | 23 |
| 2 | the policy cell, four modes + Mode 0 (58 rows) | 27 |
| 3 | the edge→policy derivation (the hard half) | 25 |
| 4 | the single funnel + the caller-side guard | 19 |
| 5 | mccc Phase 3d/18 ported + the Phase 9 hand-off | 17 |
| | **total** | **111** |

Frontend suite 2299 → **2410**.

### Phase 5 build record (2026-09-12)

**Files:** `src/state/__tests__/workflowMachineUpstreamContract.test.ts` (11 tests), `HANDOFF-to-mccc-m15-wp2.md`. Frontend 2393 → 2404.

⚠️ **THE EIGHT PHASE-18 SUB-CHECKS WERE CLASSIFIED BY OWNERSHIP *BEFORE* A LINE WAS WRITTEN. Only TWO port:**

| Sub-check | Disposition |
|---|---|
| (a) S22/S23 edges | ✅ ports — Claudesk owns the graph |
| (c) exit-chain pause rows | ✅ ports — Claudesk owns the policy |
| (b) reflect row names the fork | ✗ mccc prose |
| **(d) all 4 `AGENTS.md` carry the block** | ⚠️ ✗ **THE DUPLICATION 2.9 DELETES** |
| **(e) all 4 `AGENTS.md` re-point prose** | ⚠️ ✗ **SAME DUPLICATION** |
| (f) `session-capture` gate prose | ✗ **INTRA-TURN semantics — porting crosses the ownership boundary** |
| (g) `CLAUDE.snippet.md` re-point | ✗ mccc prose |
| (h) `tutorial-*-tour` guard | ✗ mccc skill prose |

⚠️ **Porting (d)/(e) would have RE-CREATED THE THING BEING DELETED.** They exist only to keep four `AGENTS.md` copies in sync with each other. The omission is **asserted** (`does NOT port the four-way AGENTS.md duplication checks`) so it reads as a decision, not a gap.

⚠️ **(f) is the subtle one.** `session-capture`'s confirmation gate is *behavior within a state* — mccc's half of the 2026-08-14 boundary. Claudesk models the **policy cell** for that row (autopilot/FSD `[PROJECT]` auto-writes, `[GLOBAL]` still confirms) because that is a turn-boundary chaining decision; the gate's **implementation** stays upstream.

⚠️ **Phase 3d is a PORT with a changed mechanism, and the change is disclosed.** Upstream re-derives the regex from `tests/lib/verify.sh` *"so this test stays honest if the regex evolves."* Claudesk cannot: `verify.sh` is behind the gitignored `_ref/` symlink. So the port **owns its own regex** — the one WP3's reader will use — and keeps the honesty by comparing against upstream in a `_ref/`-gated block.

✅ **The port ADDS a case upstream lacks:** `⚠️ a bare /F[0-9]+/ would silently drop the suffixed ids`. Measured: the naive regex **matches `TRANSITION: F10b` and captures `F10`** — the WRONG id, which is worse than not matching, because `F10 → verify-self` and `F10b → verify-human` are different edges with different targets.

**Three mutants, each landed:**

| # | Mutant | Result |
|---|---|---|
| K1 | narrow the regex to `[A-Z]\d+` (drop suffixed ids) | ✅ **4 tests fail** |
| K2 | make `TRANSITION` (no colon) match | ✅ negative cases fire |
| K3 | flip `[GLOBAL]` capture gate to auto in autopilot (AC-6 regression) | ✅ caught |

⚠️ **THE PHASE-4 GUARD FIRED ON MY OWN PHASE-5 WORK — its first real exercise, and it behaved exactly as designed.** The new contract test is a new importer, so `admits no importer outside the allowlist` failed with the offending path named. **Reviewed before allowlisting:** it imports `edgeById`/`cellForMode`/`POLICY_ROWS`/`isDispatchable` to assert the model's SHAPE — a contract test, not a verdict-producing consumer, so it owes no `resolvePolicy` call. ✅ **Confirmed it did NOT trip `wires graph to policy in exactly ONE module`** — the discriminator stayed silent, which is the signal that this is an ordinary new consumer rather than a bypass.

⚠️ **P5.3 — the hand-off note was written into THIS repo, not mccc.** Every `~/.claude/skills/` entry is a symlink into the mccc source repo (verified live this session), so editing from here would silently dirty a different git repository. **mccc's `git status` was checked before AND after and is unchanged** (its one untracked file is a pre-existing August handoff, not mine), and no skill file has a modification time from today. The note carries the A-2 evidence, the two upstream gaps, the full port/no-port table, and a suggested order.

**Full gate:** exit 0 — **2404 passed**, 180 files.

### Phase 4 build record (2026-09-12)

**File:** `src/state/__tests__/workflowMachineFunnel.test.ts` (13 tests). Frontend 2374 → 2387. No production code needed — `resolvePolicy` was already the funnel (P4.1 satisfied at Phase 3); this phase is the **guard** that keeps it one.

⚠️ **THE VACUITY PROBLEM THIS PHASE HAD TO SOLVE, AND IT IS NOT HYPOTHETICAL.** There are **NO production consumers** of `workflowMachine/` yet — WP3 is the first. A guard phrased as *"no caller bypasses the funnel"* is therefore **true over an empty set today and would stay green forever** regardless of what WP3 does. That is the exact shape in `docs/lessons/source-text-guards.md`. So the guard works on **two axes**:
1. **Structural** — the funnel exists, is unique (exactly one non-test module imports BOTH `edges` and `policy`), and exposes exactly one verdict-producing export. Checkable today on real files.
2. ⚠️ **Population** — the set of modules importing `workflowMachine/` is **pinned by name**. A new importer fails until it is allowlisted, which forces the funnel question to be **asked out loud** when WP3's consumer lands.

⚠️ **THE GUARD WAS PROVEN TO DISCRIMINATE, not merely to fire.** Measured against three planted consumers plus two negative controls:

| Planted module | Failures |
|---|---|
| A realistic WP3 consumer that **hand-rolls the lookup** and defaults `unmapped`→AUTO | **3** — including `wires graph to policy in exactly ONE module` |
| A consumer that **correctly calls `resolvePolicy`** | **2** — the allowlist prompts only; the wiring test **PASSES** |
| A production file that does **not** import the machine | **0** |

⚠️ **`wires graph to policy in exactly ONE module` is the DISCRIMINATOR** — a bypassing consumer must import both `edges` and `policy` to hand-roll the derivation, a correct one imports only `lookup`. **That distinction is recorded in the test file itself**, so a future reader knows a failure in this block means "review and allowlist" while a failure that *includes* the wiring test means "route it through the funnel — do NOT widen the allowlist." A guard that cannot tell right from wrong is a nuisance, not a check.

**Three structural mutants, each landed:** a bypassing production consumer ✅ (3 fail) · a second module wiring edges+policy ✅ · a new verdict-producing export sneaking into `lookup.ts` ✅.

⚠️ **P4.5 — the drift test, and its skip path is verified, not assumed.** D-2's accepted cost (a hand-transcribed literal can drift from upstream) is mitigated by reading `_ref/` **when present**. ⚠️ **A drift test that silently PASSED when it cannot see upstream would be the `ok. 0 passed` trap wearing a different hat** — green on every CI run and every fresh clone, i.e. exactly where nobody would notice it stopped checking. So it uses `describe.skipIf`, and **the skip path was actually exercised** by moving `_ref/` aside: **11 passed | 2 skipped**, reported as SKIPPED. With `_ref/` present all 13 run.

**Three drift mutants, each landed:** dropping an edge upstream declares ✅ · inventing an edge upstream lacks ✅ · ⚠️ **"fixing" `F10` back to the stale `AGENTS.md` value** ✅ — that one now fails against `transitions.md` **live**, which is the A-2 finding made permanently self-enforcing.

**Full gate:** exit 0 — **2387 passed**, 179 files.

### Phase 3 build record (2026-09-12)

**Files:** `src/state/workflowMachine/lookup.ts`, `src/state/__tests__/workflowMachineLookup.test.ts` (18 tests), plus classification fixes to `policy.ts`. Frontend 2349 → 2367.

⚠️ **THE COVERAGE SURVEY RAN BEFORE THE RESOLVER WAS WRITTEN, and it changed the design.** All 111 edges were classified against all 58 policy rows first:

| | count |
|---|---|
| direct (an `edge-ids` row names it) | 49 |
| via the FROM-state's step row | 31 |
| unmapped | 31 (only **7** dispatchable) |
| **AMBIGUOUS (>1 candidate row)** | **0** |

⚠️ **ZERO ambiguous cases — the WBS's anticipated hazard did not materialize, and the REAL hazard is its opposite.** The danger is not an edge with two candidate rows; it is an edge with **none**, silently falling through to whatever a default happens to be. So `unmapped` is modeled as a **first-class result with no `cell` field on that arm** — structurally impossible to mistake for a verdict — rather than as a default.

⚠️ **The survey found FOUR MIS-CLASSIFIED POLICY ROWS, now fixed:**
- task `verify (T5b/T5c gate)` — names its edges in the key text but was typed `step`. ⚠️ It would have matched by from-state anyway, i.e. **correct by accident**; now correct by construction.
- product `vision scoping questions` / `roadmap review` — read as step names, each actually governs one exit edge (P2 / P3).
- product `research / arch / wbs happy path` — a **category row spanning three states'** forward exits. One key string cannot match three from-states. ⚠️ P4/P6/P8 are the back-loops out of those same states and belong to the `back-loops` row — an easy and consequential thing to get wrong.

⚠️ **TWO GENUINE UPSTREAM GAPS FOUND — and the SECOND was found by a TEST, not by the survey.** The survey reported one (`I2`) because it only eyeballed the **dispatchable** unmapped edges; the exhaustive assertion caught `P13` too. *A survey that filters before counting reports the filter, not the population.*
- **`I2`** (report → triage) — upstream's `triage (I2→I3 / I2→I13)` row governs the exits FROM triage, not the entry INTO it. ⚠️ **Dispatchable**, so an unmapped→AUTO default would fire here.
- **`P13`** (product-finalize → EXIT) — the product table has a row for P14 (back-loop) but none for P13 (cycle exit). Terminal, so no behavioral risk.

⚠️ **Neither was patched in Claudesk.** Inventing a policy row would be Claudesk deciding mccc's policy, crossing the ownership boundary settled 2026-08-14. The model records what upstream **says, including where it says nothing.** Logged as `SURFACE-2026-09-12-TWO-TRANSITIONS-HAVE-NO-PAUSE-POLICY-ROW-UPSTREAM`.

**Design decisions:**
- **Precedence: a row that NAMES the edge beats the from-state row.** F22 proves this matters — `REDIRECT (F22)` says PAUSE while its from-state `build` says AUTO; picking the wrong one inverts the verdict.
- **`unknown-edge` is distinct from `unmapped`.** A typo'd token and a real-but-ungoverned edge are different diagnoses; merging them would let a parser bug read as an upstream gap.
- **The incident override is applied once, inside the funnel**, so no caller can read a column directly and miss it.
- **`ambiguityReport()` exists so ambiguity stays enumerable.** Measured empty; the test asserts it stays empty, so a future upstream edit that creates a real ambiguity fails loudly rather than resolving by array order.

**Four mutants, each landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| L1 | `unmapped` silently returns AUTO (**the measured danger**) | ✅ 4 tests fail |
| L2 | precedence inverted (from-state beats named-edge) | ✅ caught |
| L3 | incident override dropped from the funnel | ✅ caught |
| L4 | `resolveCell` skipped — `auto-skip` escapes as a verdict | ✅ 2 tests fail |

⚠️ **Two gate failures worth recording, both caught by `verify:auto` and NOT by the test run:**
1. **`Object.hasOwn` needs ES2022**; this project targets earlier. ⚠️ **The test PASSED under vitest** (Node supports it) while `tsc` rejected it — a green test run was not sufficient evidence. Replaced with `Object.prototype.hasOwnProperty.call`.
2. ⚠️ **Phase 2's codified reference count (42) went stale** the moment Phase 3's classification fixes added 7 edge ids. **This is the codified test doing its job**: `dangling` stayed empty throughout — the integrity property never broke, only the population grew. Updated to 49 **with the reason recorded inline**, because a deliberate widening must be acknowledged rather than absorbed silently.

### Phase 2 verify-codify record (2026-09-12) — 5 tests added, 22 → 27

**No integration boundary.** Unit-level remains the highest level available (no endpoint, CLI or UI exists to test from).

**Gap analysis found two properties confirmed only by THROWAWAY probes:**

| Gap | Codified as |
|---|---|
| ⚠️ **Policy↔graph referential integrity — checked by NOTHING before** | `resolves every edgeIds reference to a real edge` (42 references, 0 dangling) + `keeps each row's edgeIds inside its own workflow` + the session-boundary exemption's own positive control |
| `cellForMode` exhaustiveness — the subagent's `never`-check mutation proof was throwaway | `maps each of the four modes to its own distinct column` (with a positive control that the chosen row actually distinguishes them) + identity-preservation |

⚠️ **The referential-integrity gap is the one that mattered.** A typo'd edge id in a policy row (`F4O` for `F40`) leaves that row **permanently unreachable** by Phase 3's derivation: the row never matches, the lookup falls through to its default, and **every structural test in both files still passes**. The failure mode is a silently wrong verdict — exactly what this milestone exists to prevent. Checked before writing the test: 42 references, 0 dangling, so this codifies a property that genuinely holds rather than papering over a defect.

⚠️ **The session-ops rows deliberately cross-reference other workflows' edges** (F19/F21/T11/I10 → reflect), which is the exit chain's whole point. Rather than weaken the same-workflow assertion to accommodate them, session-ops is **exempted and then separately pinned** — the exemption is only safe if the cross-referenced ids are the intended four, so a third test asserts exactly that set and that all four are `terminal`.

**Three mutants, each landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| C1 | typo an edge id (`F40` → `F4O`) | ✅ 2 tests fail — **invisible to every prior test** |
| C2 | put a feature edge id (`F7`) on a task row | ✅ 3 tests fail |
| C3 | alias two mode columns (`fsd` returns `row.autopilot`) | ✅ 3 tests fail |

**Full suite:** `pnpm verify:auto` exit 0 — **2349 passed**, 177 files, 0 failures. Single pre-existing `XtermPane.tsx` lint warning, untouched. No `## Test Triage` entry owed.

### Phase 2 build record (2026-09-12)

**Files:** `src/state/workflowMachine/policy.ts`, `src/state/__tests__/workflowMachinePolicy.test.ts` (22 tests). Frontend 2322 → 2344.

**Transcription verified mechanically against upstream, cell by cell — not by eye.** A script parsed every pause-policy table out of `transitions.md` and diffed the normalized cell values:

| Table | Upstream | Absorbed | Cell match |
|---|---|---|---|
| feature | 25 rows | 25 | ✅ |
| task | 5 | 5 | ✅ |
| product | 6 | 6 | ✅ |
| incident | 15 | 15 | ✅ all uniform across 4 columns |
| session-boundary | 7 | 7 | ✅ |
| **total** | **58** | **58** | **42 of 43 four-column rows identical** |

⚠️ **The one divergence was a DELIBERATE decision, reconsidered rather than left as the convenient default.** Upstream's mid-workflow-ambiguity row carries `CONFIRM` in Modes 2–3. I first flattened it to `pause` with a comment — both stop, so nothing behavioral changes. On re-reading, `transitions.md:147` explicitly calls CONFIRM *"the **ABSENCE** of the auto-chain, gated on ambiguity — **NOT a modeled transition**"*. A `pause` is a policy decision about an edge the supervisor evaluated; a CONFIRM is a guard that fires before any edge is evaluated. Since this table is meant to be **the authority**, collapsing them would make the model assert something upstream explicitly denies. **Modeled as its own `confirm` arm.** `isStop()` treats it identically to `pause`, so WP3 does not branch on it — the distinction is fidelity, not behavior.

⚠️ **Consequence recorded so the count is never "simplified" in either direction:** the union has **SIX arms modeling FIVE upstream vocabulary values**. Both the module header and the type's doc comment now say so explicitly, because the header had briefly said "FIVE values" while the code had six — a doc contradicting its own code.

**Design decisions worth not re-deriving:**
- **`resolveCell` returns a NON-conditional cell**, so a caller cannot forget to evaluate an `auto-skip` and treat it as an `auto`. Same reasoning as `recycleMachine`'s temp-path exclusion living inside the machine: *an exclusion a caller must remember is an exclusion a caller will forget.*
- ⚠️ **`resolveCell` with NO evidence returns PAUSE, never skip.** Absence of evidence is not evidence of a clean gate; defaulting the other way would auto-skip every human gate in the workflow.
- ⚠️ **`isStop()` treats an UNRESOLVED `auto-skip` as a STOP** — encoding WP3's binding condition *"bias the failure direction toward WITHHOLDING"* into the type layer, so a caller that forgets `resolveCell` fails safe rather than firing.
- **Incident uniformity is belt-and-braces on purpose:** the "always Mode 2" rule is expressed as `effectiveModeForWorkflow`, AND all 15 incident rows carry the same cell in every column — so a caller that reads a column directly is still right. Verified against upstream, not asserted.

**Four mutants, each landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| P1 | `feature/spec` autopilot `pause` → `auto` (**the F3/F4 sentinel**) | ✅ caught |
| P2 | R-1 reversed — `direct` suppresses instead of deferring to stored | ✅ caught |
| P3 | `isStop` treats an unresolved `auto-skip` as a fire | ✅ caught |
| P4 | incident `I5` loses column uniformity | ✅ caught |

**Full gate:** `pnpm verify:auto` exit 0 — 2344 passed, 177 files.

### Phase 1 build record (2026-09-12)

**Files:** `src/state/workflowMachine/types.ts`, `src/state/workflowMachine/edges.ts`, `src/state/__tests__/workflowMachine.test.ts` (19 tests).

**Transcription verified mechanically, not by eye.** A script diffed the absorbed id set and every `from`/`to` pair against `transitions.md`: **111/111 ids, none missing, none invented; 109/111 from→to pairs identical.** The 2 divergences are S22/S23, where upstream puts the whole edge in the `From` cell and the edge's TYPE (`(auto-chain)`) in `To`; both rows' own prose confirms the reading used (`reflect → session-handoff`), and the divergence is pinned by a test so the P4.5 drift test does not read it as an error.

**Absorbed shape:** 111 edges — product 14 · feature 43 · task 13 · incident 20 · session-ops 21. **67 dispatchable / 44 not.**

**⚠️ Mutation-proofs — six, each run INDIVIDUALLY with the mutation confirmed landed in executable code:**

| # | Mutant | Result |
|---|---|---|
| M1 | `F10.to` → `verify-human` (the stale `AGENTS.md` value) | ✅ caught |
| M2 | `F19.dispatchTarget` → `skill(...)` (the AUTO-implies-target bug) | ✅ caught |
| M3 | delete `S22` (boundary auto-chain lost) | ✅ caught (2 tests) |
| M4 | `S17.dispatchTarget` → `skill(...)` | ✅ caught |
| M5 | `EDGES = []` (degenerate pass) | ✅ caught (8 tests) |
| M6 | inject a `behavior-within-state` row into executable code | ✅ caught |

⚠️ **THREE of the six probes were INVALID on their first attempt and had to be redone** — twice a `perl`/single-line replace produced syntactically invalid TS (esbuild failed with `Tests no tests`, which is NOT a guard verdict), once because Prettier had wrapped the target onto two lines. This is `[[verify-the-mutation-landed]]` and `[[invalid-probe-and-real-hole-look-identical]]` firing three times in one phase: **a mutant that does not compile proves nothing, and looks exactly like a passing guard if you only grep for `Tests <n> passed`.** Every result above was re-confirmed with the mutant compiling.

⚠️ **Vacuity is real in this file and is guarded, not assumed away.** The `for`-loop tests (`every from/to`, `non-empty condition`, terminal/SURFACE classification) pass vacuously over an empty `EDGES` — confirmed by M5, where they did NOT appear among the 8 failures. The `holds a nonzero number of edges` test is what makes the rest non-vacuous.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-12] P1.2 / P5.3 — ⚠️ **The two upstream copies of the feature graph DISAGREE.** `transitions.md` has `F10 = verify-auto → verify-self` plus `F9b`/`F10b`/`F30`; `agents/feature-workflow/AGENTS.md` has `F10 = verify-auto → verify-human` and omits all three — it predates `verify-self` being a state. Merging the copies would import a wrong `F10` target straight into the detector's lookup. `transitions.md` is the sole authority (D-1). This is also direct evidence that mccc's `check-structure.sh` Phase 9 is not holding the duplication in sync, strengthening the case for its deletion (WBS 2.9).

[SURFACED-2026-09-12] P3.2 — ⚠️ **Two transitions have NO pause-policy row upstream.** `I2` (report → triage; upstream's row governs the exits FROM triage, not the entry INTO it) and `P13` (product-finalize → EXIT; the table has a row for P14 but not P13). `I2` is **dispatchable**, so an unmapped→AUTO default would fire it. Not patched in Claudesk — inventing a row crosses the ownership boundary; the model records what upstream says, including where it says nothing. Logged to backlog as `SURFACE-2026-09-12-TWO-TRANSITIONS-HAVE-NO-PAUSE-POLICY-ROW-UPSTREAM`.

[SURFACED-2026-09-12] P1.5 / P2.5 — ⚠️ **`wbs.md`'s M-7/M-8 counts are stale against the live source.** Measured this pass: 111 edge rows (M-7 says 113); 81 `AGENTS.md` policy rows (M-7 says 89); feature policy rows 12 edge-keyed / 13 step-keyed (M-8 says 8/19 of 27 — it counted the `AGENTS.md` copy, not `transitions.md`). The M-8 *hazard* is confirmed; only its numbers are for the other copy. **Tests must assert the count absorbed at build time, never a hardcoded 113.**
