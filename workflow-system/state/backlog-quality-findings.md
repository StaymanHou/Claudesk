# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# paydown-wp7-render-instead-of-raw — 2026-09-23

*(feature-review-quality on ship commit `a26b514`; 0 CRITICAL / 1 MAJOR / 6 MINOR; MINOR-6 was fixed in the WIP before archive.)*

## SURFACE-2026-09-23-QUALITY-LIVE-HARNESS-LIFECYCLE-FORKED-AND-SINGLE-PANE
- **Severity:** MAJOR
- **Location:** `src/__tests__/closeWiring.test.tsx` (its own IPC log, `uncaught` tap, `settle`/`click`, mockIPC boot, teardown); `src/components/workspace/__tests__/liveWorkspace.tsx` (the module-level `pane`)
- **Finding:** `closeWiring` is the first App-level user of the WP7 live-mount harness, and it re-implements the harness lifecycle instead of reusing it. That includes the settle-before-`clearMocks` teardown order found in the P3.1 spike. It also gets `IS_REACT_ACT_ENVIRONMENT` only as a side effect of a `vi.mock` factory importing `liveWorkspace.tsx`. And it mounts two `Workspace`s against a stub whose `pane` is ONE module-level object, so `pane.props` belongs to whichever pane rendered last.
- **Why it matters:** the harness is what the next render-instead-of-`?raw` test will copy, and two copies of the teardown rule will drift. A future App-level test calling `pushTurnStart` would silently reach an arbitrary workspace.
- **Suggested action:** export a `bootIpc(handler)` / `teardownIpc()` pair from `liveWorkspace.tsx`, and a per-workspace pane registry keyed by `workspaceId` (the stub receives it as a prop). Move `closeWiring` onto both, and set `IS_REACT_ACT_ENVIRONMENT` explicitly in each file.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-LIVE-HARNESS-DEAD-OPTIONS
- **Severity:** MINOR
- **Location:** `src/components/workspace/__tests__/liveWorkspace.tsx` (`MountOptions`, `rerender`, `mountWorkspace`)
- **Finding:** `MountOptions.statusState` and `projectPath` have no caller, and the module-level `rerender` closure is never exported. They suggest a re-render API that doesn't exist. `mountWorkspace` doesn't guard against a still-mounted previous root.
- **Suggested action:** delete the unused options (or export `rerender` if a test needs it), and throw if `root` is non-null on entry. Fold this into the MAJOR above.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-SUBMIT-BUTTON-NOT-DRIVEN
- **Severity:** MINOR
- **Location:** `src/components/workspace/prompt/__tests__/promptSendWiring.test.tsx` (the "Stage BUTTON reaches the same send" test)
- **Finding:** only the Stage button is clicked. A mutant wiring the Send (submit) button to `send("stage-only")`, or to nothing, passes the file.
- **Suggested action:** add the mirror test: click `prompt-send-submit` and assert the envelope WITH the trailing `\r`. This is the paired-affordances prior applied to tests.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-WARN-SPY-LEAKS-ON-FAILURE
- **Severity:** MINOR
- **Location:** `src/components/workspace/prompt/__tests__/promptSendWiring.test.tsx` (the two failure-diagnostic tests)
- **Finding:** `warn.mockRestore()` runs after the assertions, so a failing assertion leaves the `console.warn` spy installed and hides later tests' diagnostics.
- **Suggested action:** add `afterEach(() => vi.restoreAllMocks())`, or use try/finally.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-GATE-OFF-PROOF-HAS-NO-POSITIVE-CONTROL
- **Severity:** MINOR
- **Location:** `src/components/workspace/__tests__/turnNavControls.test.tsx` (the AC-10 gate-OFF test)
- **Finding:** the test proves the gate is OFF by the ABSENCE of `workspace-skill-row`. No test in the file shows the row is PRESENT with `gate: true`, so a renamed testid would make the proof vacuous.
- **Suggested action:** add `expect(q(el, "workspace-skill-row")).not.toBeNull()` to a `gate: true` test in the same file.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-RUN-COMMAND-PIPES-NOT-DRAINED
- **Severity:** MINOR (pre-existing; newly nameable)
- **Location:** `src-tauri/src/adjudicator/mod.rs` → `run_command`
- **Finding:** stdout and stderr are piped but not drained while `try_wait` polls, and `stdin.write_all` blocks before the deadline starts. A child that writes more than a pipe buffer before exiting, or never reads stdin, hangs past the timeout or forever. That is latent today, because `claude -p` reads all of stdin before writing.
- **Suggested action:** handle this with the WP9 `supervisor_adjudicate` async move. (E3, which passes the captured stderr through, landed at paydown WP8; a child that overfills the stderr pipe still hangs.) Drain both pipes on reader threads and start the deadline before the write. The WP7 `sh -c` seam makes each testable, e.g. `sh -c 'head -c 200000 /dev/zero; exit 0'` and `sh -c 'sleep 30'` with a large prompt.
- **Priority:** low
- **Status:** pending

# paydown-wp3-boot-smoke-test — 2026-09-23

## SURFACE-2026-09-23-QUALITY-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X
- **Severity:** MAJOR
- **Location:** `linkCheck.mjs` header; `docs/lessons/verify-auto-gate.md` §check:link; `source-text-guards.md` §19; `appBoot.test.tsx` header; `moduleGraphBoot.test.ts` header; `turnNavExportContract.test.ts` SCOPE note; `CLAUDE.md` gate-order line; `backlog-paydown-wbs.md` checklist
- **Finding:** "Vitest reads a missing binding as `undefined`" is stated in about 8 places, and the "Blind to" list exists in full in both `linkCheck.mjs` and `verify-auto-gate.md`. That goes against the lesson file's own §"Comment budget" (state it once, point to it elsewhere). `moduleGraphBoot.test.ts` also carries history ("first written as one", "probed 2026-09-23") that belongs in the archive.
- **Suggested action:** make `source-text-guards.md` §19 (or `verify-auto-gate.md`) the canonical home. Leave each code site with only its invariant, what to do when it fails, and a pointer. Diff the token set before and after (`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`). This fits paydown WP4 (narrowing over-claiming comments).
- **Priority:** low
- **Status:** pending

# hotkey-reference — 2026-09-17

## SURFACE-2026-09-17-QUALITY-RATIONALE-STATED-THREE-TIMES
- **Severity:** MINOR
- **Location:** `src/components/workspace/chordRegistry.ts:1-30` + `SettingsPanel.tsx:122-144`
- **Finding:** The same ~20-line rationale (why the comment map moved, the gate-omission reasoning,
  the dead-affordance argument) appears near-verbatim in three places: the registry header, the
  panel block comment, and the commit message.
- **Why it matters:** The WP's own comment-budget lesson applies — three copies of a rationale drift
  the way the original comment map did, which is the failure this feature exists to fix.
- **Suggested action:** Keep one canonical statement in `chordRegistry.ts`; reduce the panel comment
  to a one-line pointer.
- **Priority:** low
- **Status:** pending

# supervisor-hotfix — 2026-09-17

## SURFACE-2026-09-17-QUALITY-DO-NOT-MERGE-DEFENCE-REPEATED-FOUR-TIMES
- **Severity:** MINOR
- **Location:** `src/cc/workspaceSupervisor.ts`, `src/cc/supervisorToggleIpc.ts`
- **Finding:** ⚠️ **Rewritten 2026-09-23 (paydown-2026-09-23 WP1): PARTIALLY resolved — now 2
  sites, down from 4.** The anticipatory "do not merge with the drive-mode modules" defence still
  appears at both headers above.
- **Why it matters:** the split is right on its own terms (different storage key, different
  default, no staleness concept). The repetition is maintenance surface that will drift. ⚠️ This
  is a comment-budget observation, **not** an argument for merging.
- **Suggested fix:** keep the fullest statement at one site and reduce the other to a pointer.
  This belongs to `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`; do not trim per-WP.
- **Priority:** low
- **Status:** pending — routed to the T1/T2 comment-convention pass

# m15-wp4-context-pressure-recycle — 2026-09-14

## SURFACE-2026-09-14-QUALITY-LASTINDEX-COMMENT-IS-THE-HEAVIEST-RATIO-IN-THE-DIFF
- **Severity:** MINOR
- **Location:** `src/state/supervisor/wipPhases.ts` (the `PHASE_LINE.lastIndex = 0` site)
- **Finding:** ⚠️ **Keeping the line is the RIGHT call and the reviewer agreed** — a module-level
  `/g` regex becomes a silent-wrong-answer hazard the moment a `break` is added. But **14 lines of
  comment for one defensive statement** is the heaviest ratio in the diff, and the underlying
  reasoning is a well-known JS footgun rather than a non-obvious local decision.
- **Suggested fix:** compress to roughly one line (`// module-level /g regex: reset in case a future
  early-exit leaves lastIndex non-zero`), keeping the equivalent-mutant fact but not the essay.
  ⚠️ **Fold into the standing comment-convention item** rather than treating as standalone.
- **Priority:** low
- **Status:** pending

# m15-wp3-break-detection-and-auto-fire — 2026-09-13

**0 CRITICAL · 3 MAJOR · 5 MINOR as filed.** ⚠️ **ALL THREE MAJORs + the `assertPinnedModel`
gap were RESOLVED 2026-09-14** by a `/feature-refactor` pass (see CHANGELOG) and are deleted from
this file per delete-on-resolve; **1 MINOR remains open below** (the discarded adjudicator stderr was resolved at paydown-2026-09-23 WP8). The MAJORs shared one shape —
*a contract stated in PROSE where it could have been stated in a TYPE* — and each fix converted a
comment into a compiler or a test. ⚠️ **The label fix REPLACED a source-text guard** that asserted
the requirement was *stated*; it now asserts the label is *passed*, and was mutation-proven by
dropping the argument (the old guard survived that mutant; the new one kills it).

## SURFACE-2026-09-13-QUALITY-COMMENT-DUPLICATION-ACROSS-SUPERVISOR-MODULES

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src/state/supervisor/*.ts`, `src-tauri/src/transcript/mod.rs`

Comment density runs 43–53% in the TS supervisor modules. ⚠️ **Length is not the problem —
DUPLICATION is**, and it is measurable: three facts appear in 3–6 places each *within one diff*.
- the "narrow router sends 40 of 96 / misses 10 of 32" rationale → `adjudicator.ts:41`,
  `verdict.ts:315`, `verdict.test.ts:334`
- the "2282 → 2284 → 2286" live-corpus drift → `verdict.ts:134`, `verdict.ts:230`,
  `transcript/mod.rs:39`
- the "bitten this repo four times" framing → `turnEnd.ts:14`, `fanOut.ts:14`

⚠️ Copies drift asymmetrically: the edited one becomes right while the others keep asserting the
old thing with equal confidence.

**Suggested action:** collapse each repeated MEASUREMENT to one canonical statement with
pointers; keep the invariants and the ⚠️-what-to-do-on-failure paragraphs. The
`arch/session-resumption.md` section added in this same commit is the natural home for several.
- **Status:** pending

# m15-wp1-supervisor-probe — 2026-09-12

⚠️ **One finding remains** (comment density → the R2 comment-convention pass). The decisive-bar drift, the tautological assertions and the access-style nits were resolved at paydown-2026-09-23 WP6; the other findings under this heading were closed earlier in the same sweep.

## SURFACE-2026-09-12-QUALITY-COMMENT-DENSITY-IS-A-THIRD-COPY-OF-THE-WIP

- **Severity:** MINOR · **Priority:** low · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts` (whole file)

~158 of 494 lines (**~32%**) are comments, much of it **provenance**: the 223→127→96 attempt history, "an earlier version of this test also asserted…". ⚠️ `docs/lessons/source-text-guards.md` §Comment budget names exactly this, and the lesson doc records it being flagged in **four consecutive reviews of another file**.

Applying its test — *would a reader who has never seen the WIP make a worse decision without this sentence?* — the **failure-direction and what-to-do-when-this-fails** paragraphs earn their place (keep). The **attempt-history narrative** does not: the WIP and backlog already carry it verbatim, making the test file a **third copy that will drift**.

**Fix shape:** pointer-to-canonical-home, not shorter sentences — trimming treats the symptom.

# drive-mode-on-the-workspace-surface — 2026-08-26

⚠️ **The re-entrancy defect (formerly finding 1) was resolved at paydown-2026-09-23 WP8** by R1
Option A: the readout is disabled while an apply is queued. That was done WITHOUT the
`useDriveModeApply` hook extraction, which R1 defers to the next time drive-mode apply is touched.
The scheduler-timing sleep below is the extraction's remaining payoff.

## SURFACE-2026-08-26-QUALITY-RESPAWN-INTENT-HOLD-IS-SCHEDULER-TIMING
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt
- **Summary:** `RESPAWN_INTENT_HOLD_MS = 400` (`applyDriveMode.ts:165`) synchronises against the
  React scheduler rather than an event. `await Promise.resolve()` is a microtask and does **not**
  guarantee a committed render before `relaunch()`.
- **Context:** ⚠️ A deterministic mechanism was available **and is the house idiom in the same
  file** — `onSessionIdRef` (`XtermPane.tsx:467`) solves exactly this problem. The failure mode if
  the window is missed is the silent one the comment itself names: the spawn reads the ORIGINAL
  door, consuming the unclean-exit flag and disabling auto-resume on the next real open. **No test
  can observe it.**
- **Suggested action:** Replace the sleep with a ref the spawn effect reads at spawn time. Folds
  into the `useDriveModeApply` extraction.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-DRIVEMODE-MINOR-POLISH
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (2 MINOR findings remain, grouped)
- **Summary:** ⚠️ **Rewritten 2026-09-23 (paydown WP8).** (a) and (b) were deleted at paydown WP4, and (c), the duplicated `.workspace-header-drivemode` CSS declaration, was merged at paydown WP8. Remaining: (d) `Workspace.tsx` has about 130 inline lines of drive-mode state in a component past 1170 lines.
- **Suggested action:** (d) is the `useDriveModeApply` hook extraction that R1 (paydown 2026-09-23) DEFERS to the next time drive-mode apply is touched.
- **Priority:** low
- **Status:** pending

# turn-output-reorientation — 2026-08-25

## SURFACE-2026-08-25-QUALITY-WP3-COMMENT-DENSITY-58-PERCENT
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** ⚠️ **Comment density DID get materially worse in this WP** (the orchestrator asked the reviewer to judge exactly this): **58% of newly added production lines are comments — 388 of 673**. `XtermPane.tsx` moved **51% → 55%** while growing **714 → 944** lines. The `.workspace-jump-turn-btn` deletion rationale is stated in **four places** (`App.css:687-694`, `Workspace.tsx:66-70`, plus two test headers).
- **Context:** ⚠️ **The keep/cut split is clean and should be respected.** The individual *retraction* blocks (`XtermPane.tsx:361-372` alternate-buffer, `:451-458` premise-invalidated) **ARE load-bearing** — each prevents a specific re-derivation that already cost real work, and both are anchored to the code they warn about. The **duplicated deletion rationale** is the "same rationale in N places" pattern the lesson doc names as the expensive half. ⚠️ **No comment was found stale or contradicting the code**, so this is polish, not correctness.
- **Suggested action:** ⚠️ **FOLD INTO `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`; do NOT pay down separately.** That standing finding records that **per-WP trimming was measured as NOT converging** (four consecutive reviews of one file), and its own resolution shape is *"one authority per rule + a pointer at every other site + a GUARD"* — which is exactly what the four-copy deletion rationale needs. This entry is a concrete instance of that finding, and the **second** WP in M13.5 to produce one (see `# window-geometry-persistence — 2026-08-21`), which is itself evidence for the standing item's thesis.
- **Priority:** low

# window-geometry-persistence — 2026-08-21

## SURFACE-2026-08-21-QUALITY-WP1-COMMENT-DENSITY-117-LINES-FOR-14
- **Source:** feature-review-quality (M13.5 WP1, MAJOR)
- **Type:** tech-debt (documentary)
- **Summary:** `src-tauri/src/window_state/mod.rs` ships **117 lines of comment for 14 lines of executable code** (58 `//!` module-doc lines + 45 `///` item-doc lines). A large share is **provenance** rather than decision-support.
- **Context:** Judged against `docs/lessons/source-text-guards.md` → "Comment budget" and its test — *would a reader make a worse decision without this sentence?* ⚠️ **The keep/move split is unusually clean here.** KEEP (a future reader adding `FULLSCREEN` or `VISIBLE`, or removing the denylist, would genuinely decide worse without them): the four plugin-source properties, and the two flag-omission rationales. MOVE (answers *how did we get here*, which the lesson routes to WIP/archive/CHANGELOG): the `1280×800`/`tauri.conf.json` history, "the operator resized it on essentially every launch", "their display is 1920×1080", "verified live at P1.3 rather than assumed", "the backlog entry says X", and the mutant-E narrative in the vacuity guard's doc comment (`mod.rs`:132-141). ⚠️ **All of the MOVE material is already in the ship commit message `25a68bc` verbatim** — that is its correct home, so this is deletion, not relocation.
- **Suggested action:** Trim the MOVE set; keep the KEEP set at the code. ⚠️ **Do NOT treat this as a generic "trim comments" pass** — per `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`, per-WP trimming was **measured as not converging** (four consecutive reviews of one file). This item is a concrete instance of that standing finding and should be **folded into it**, not paid down separately.
- **Priority:** medium (no correctness impact; the cost is that at this density 95%-accurate prose reads as authoritative and the wrong 5% is what gets acted on — the lesson's own warning)
- **Status:** pending

## SURFACE-2026-08-21-QUALITY-WP1-PIP-RATIONALE-AT-FOUR-SITES
- **Source:** feature-review-quality (M13.5 WP1, MAJOR)
- **Type:** tech-debt (duplication → drift risk)
- **Summary:** The PiP-denylist rationale is stated at **four sites**: `M10.5 WP1's top-right anchor` at `mod.rs`:90, `mod.rs`:218 and `lib.rs`:212; "load-bearing not cosmetic" at `mod.rs`:84 and `lib.rs`:104; and the four-plugin-properties list summarized again in `Cargo.toml`:118-126.
- **Context:** `docs/lessons/source-text-guards.md` is unambiguous that **duplication is the expensive half** — state it once at the canonical home, make every other site a pointer — and names measured instances in this repo of a rationale living in six files and drifting **asymmetrically**. ⚠️ This is the *same* failure class as the already-open `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`, whose own resolution shape is **"one authority per rule + a pointer at every other site + a GUARD"**.
- **Suggested action:** Make `denylist()`'s doc comment the single authority; collapse the `lib.rs` and `Cargo.toml` blocks to one-line pointers to it. ⚠️ Per the standing finding above, the durable fix needs **a guard**, not just this one consolidation — otherwise the next feature re-adds a fourth site.
- **Priority:** medium (no live defect; four copies are four things to update, and the copy someone edits becomes right while the others keep asserting the old thing with equal confidence)
- **Status:** pending

# m13-wp4-milestone-exit-verify — 2026-08-18

## SURFACE-2026-08-18-QUALITY-WP4-ARCH-DOC-MIRRORS-TEST-FILE-HEADER
- **Source:** feature-review-quality (M13 WP4, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** `arch/workflow-gate.md`'s property-1 bullet grew from one paragraph to a table plus
  four `⚠️` paragraphs, and the last three **partly restate** content that also lives in
  `offInvariantGuard.test.ts`'s own header: the arm-5-has-no-ungated-half rationale, the
  probe-each-arm-individually rule, and the `WORKFLOW_TERMS` vocabulary gap (the last **also** fully
  stated in `backlog.md`).
- **Context:** ⚠️ **This is the project's standing rationale-duplication finding, one level up** — an
  `arch/` doc mirroring a test-file header will drift against it asymmetrically, which is exactly what
  the WP4 latency paydown just fixed inside `src/`. The **table and the count correction are clearly
  worth keeping** (they fixed a real self-contradiction); it is the three prose paragraphs after it
  that are candidates for a pointer instead of a restatement.
- **Suggested action:** Replace the three paragraphs with one pointer at the test file, keeping the
  table. ⚠️ **Do NOT trim a little from each site** — that is precisely how the
  four-consecutive-reviews case happened. Decide which document is authoritative for the guard's
  *mechanics* (almost certainly the test file, since it is executable) and make the other point at it.
- **Priority:** low-medium (readability only; the risk is future asymmetric drift, not a live defect)
- **Status:** pending

# m13-wp3-recycle-session — 2026-08-18

## SURFACE-2026-08-18-QUALITY-WP3-COMMENT-DENSITY-AND-RATIONALE-DUPLICATION
- **Source:** feature-review-quality (M13 WP3, MAJOR — readability)
- **Type:** tech-debt (documentary)
- **⚠️ PARTIALLY RESOLVED at M13 WP4 (2026-08-18) — rewritten to the REMAINING open work.** The
  **latency-figure half is CLOSED**: the figures now live only in `RECYCLE_TIMEOUT_MS`'s doc comment
  (`recycleSession.ts`), every other production site points there, and a **guard enforces it** (plus
  an anti-vacuity companion blocking the wrong-direction "fix" of deleting the measurement). See the
  `**Backlog resolved:**` entry in `CHANGELOG.md` for 2026-08-18.
- **Summary (what REMAINS):** (a) the *"Recycle is NOT a `SKILL_BUTTONS` member"* rationale is still
  restated across **five sites** — `recycleButton.ts`, `skillButtons.ts`, `Workspace.tsx` (import
  comment AND JSX comment) and two test files; (b) raw **comment density 52% / 71% / 70%** in
  `recycleSession.ts` / `recycleMachine.ts` / `recycleButton.ts` is unaddressed — WP4 collapsed
  duplication but did not thin any module.
- **Context:** ⚠️ Unlike the latency half, **(a) has NOT drifted** — all five sites currently agree.
  This is duplication *risk*, not live drift, which is why it is lower priority than the half already
  paid. ⚠️ **The scope-boundary lesson from the paid half applies here too:** when this is picked up,
  state at the fix site what the enforcement does and does not cover, or the next reader inherits a
  guard that claims more than it checks.
- **Suggested action:** Pick ONE authority for the not-a-skill-button rationale (`recycleButton.ts`'s
  module doc is the natural home — it is the module the rule is *about*) and reduce the other four to
  pointers. ⚠️ **Do NOT trim a little from each site** — that is precisely how the
  four-consecutive-reviews case happened. Consider whether a guard is warranted, as with the latency
  half; a paydown without one silently re-accumulates.
- **Priority:** low (readability only; no drift observed, no correctness impact)
- **Status:** pending

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** gap (process)
- **Summary:** Phase 2's observable required the verdict cite `ProjectPicker.tsx:38-42` "as the precedent it **is following**." The verdict correctly *reversed* that conclusion (sibling command, not a widening) and cites the precedent as **declined**, by name rather than by line — so the literal string `ProjectPicker.tsx:38-42` appears nowhere, and a mechanical grep of the observable reports a miss on a phase marked `[x]`.
- **Context:** The reversal is the *right* outcome; the defect is that the observable was not amended when the conclusion inverted. Generalizable process point: **when a phase's finding overturns the assumption its own observable encoded, the observable must be rewritten, not silently outgrown** — otherwise a later audit reads the mismatch as an unfinished phase.
- **Suggested action:** No code change. Consider whether `feature-verify-codify` should prompt to reconcile observables that a verdict reversed. Low value alone; worth folding into a future workflow-system pass.
- **Priority:** low
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §B.6

# m11-wp2-docs-panel-plumbing — 2026-08-01

*Reviewer: `code-quality-reviewer` against ship baseline `6632f59`. 0 CRITICAL / 3 MAJOR / 4 MINOR.
**2 of 3 MAJOR backlogged** — MAJOR-1 was verified and fixed in place (an over-claiming comment in a
guard shipped minutes earlier; leaving a knowingly-wrong claim in a test is the exact failure this
feature twice paid to avoid). Both remaining MAJORs land on WP3/WP4's path, so they are genuine
scheduling items rather than polish.*

## SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH
- **Source:** feature:review-quality (m11-wp2)
- **Target level:** feature
- **Type:** tech-debt (cosmetic)
- **Summary:** ⚠️ **PARTIALLY RESOLVED — rewritten 2026-08-18 (paydown WP1) to the 2 remaining
  sub-items.** Was four MINOR findings; (3) and (4) are closed (see CHANGELOG 2026-08-18). What
  remains, both comment-density items:
  (1) `panelHost.ts:26-43` — the type-only seam import is genuinely load-bearing (verified by
  mutation), but its 18-line justification argues with the guard before describing the code, burying
  the secondary type-safety benefit where it reads as primary.
  (2) `docs/mod.rs:184-201` — 9 comment lines plus a dedicated private-helper test for a dedup
  branch no production input reaches; an assertion that the fixed lists and glob sets are disjoint
  would pin the same invariant at its source, smaller.
  *(2026-09-23: that disjointness assertion now EXISTS —
  `the_fixed_doc_lists_are_disjoint_from_the_wbs_glob` — but was added ALONGSIDE the private-helper
  test rather than instead of it, so the density remains.)*
- **Resolved sub-items (2026-08-18, paydown WP1):** (4) `validate_frontend_root`'s verbatim copy —
  the `editor_fs` original is now `pub(crate)` and imported, and the dedup is **structurally
  enforced**: a re-introduced copy fails to compile (`E0255`), proven by mutation. (3)
  `DocsPanel.tsx` `selected` — resolved by the passage of the work the finding itself named
  ("no consumer *until WP3*"); WP3/WP4/WP5 shipped, the value now has ~35 references and the stale
  header claim is gone. **No edit was made — recorded as no-change-needed with evidence.**
- **Context:** The reviewer's overall note is that comment-to-code ratio in `panelHost.ts` and
  `docs/mod.rs` is high enough that load-bearing sentences compete with provenance narration.
  ⚠️ **Both survivors are comment-DENSITY items, so they belong to the deferred T1/T2 convention
  pass** (`SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`), **not** to a sweep WP. Per-WP
  trimming was measured as **not converging** — the same file was flagged in four consecutive
  reviews. The shape that works: designate ONE authority per rule, collapse other sites to a
  pointer, and **guard it** so it cannot drift back.
- **Suggested action:** Carry both into the T1/T2 convention pass. ⚠️ Do **not** fix by trimming a
  little from each site — that is the recorded failure mode.
- **Priority:** low
- **Status:** pending — 2 of 4 sub-items remain; routed to the T1/T2 convention pass

# file-op-error-surface (Deferred — net-new UX) — 2026-06-30

## SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE
- **Severity:** MINOR (deferred — net-new UX, not debt)
- **Finding:** Right-panel file operations fail silently: a failed `delete_file` (WP5), a failed folder `trash_path` (WP5b), and a create that collides with a gitignored file like `.env` (WP5, silent overwrite) are all swallowed to `console.error` with no user-visible surface. RightPanelHost has NO toast/inline-error component — the existing code comments already say "a future toast could show it" / "would be new UX — intentionally [deferred]".
- **Why deferred (operator ruling, debt-paydown sweep #2, 2026-06-30):** building the error surface is net-new UX, not a debt sweep — it needs a toast/inline-error component in RightPanelHost that does not exist. Honor the recorded "intentionally deferred" intent. The three original findings (WP5-DELETE-FAILURE-NOT-SURFACED, WP5B-TRASH-FAILURE-NOT-SURFACED, WP5-CREATE-COLLISION-GITIGNORE) collapse into this one anchor — one error-surface feature closes all three.
- **Anchor:** a future error-surface feature (whenever RightPanelHost gains a toast/inline-error affordance).
- **Status:** DEFERRED (anchored — net-new UX)

# m10.9-wp2-workflow-features-gate — 2026-07-28

*(feature-review-quality against ship commit `467593f`; Mode 3 autopilot. 0 CRITICAL / 4 MAJOR / 4 MINOR. **One MAJOR is NOT listed here — it was a live StrictMode double-write defect in `useSettingControl` and was fixed immediately rather than backlogged; see the WIP's `## Code-Quality Review`.** Reviewer: "well-built work that clears the bar the milestone set… the debt is concentrated in two places: the `?raw` idiom still doing load-bearing work despite this feature paying twice to learn it can't, and the (now-fixed) side-effect-in-updater.")*

## SURFACE-2026-07-28-QUALITY-WP2-SETTINGSPANEL-NEAR-DOING-TOO-MUCH
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx`
- **Finding:** Four `useSettingControl` calls, an error surface, a `SettingsGroup` sub-component, and the JSX in one file — close to but not over the doing-too-much line.
- **Why it matters:** Readable today, but M14 extends this panel; adding controls without extracting a per-group module is the point where it tips.
- **Suggested action:** extract per-group modules when M14 starts, while the extraction is still cheap.
- **Priority:** low
- **Status:** pending

# m11-wp4-docs-live-reload — 2026-08-02

## SURFACE-2026-08-02-QUALITY-WP4-MINOR-BATCH
- **Source:** feature:review-quality (m11-wp4), 4 MINOR
- **Target level:** feature
- **Type:** tech-debt
- **Summary:** ⚠️ **Rewritten 2026-09-23 (paydown-2026-09-23 WP1) to the 1 remaining item.** (2) the
  second `fs-change` listener was REFUTED at the 2026-08-18 paydown (a cardinality discriminator
  is now recorded at `RightPanelHost.tsx`). (3) `plan.apply && el !== null` is now explained at
  the site as a `tsc` narrowing. (4) The reload path now surfaces a `docs_list` failure via
  `setReloadNote`. Remaining: (1) **comment density in `DocsPanel.tsx`**, flagged three
  consecutive times (WP2, WP3, WP4). The reviewer's worst offenders were a 15-comment-line block
  above one `useState(0)` and 39 contiguous comment lines above a 24-line effect, which hold two
  accounts of the same latch bug, one duplicating `fetchLatch.ts`'s header.
- **Suggested action:** ⚠️ **Do NOT trim per-WP** (measured as not converging). This belongs to
  `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` (one authority per rule + pointers
  + a guard).
- **Priority:** low
- **Status:** pending — routed to the T1/T2 comment-convention pass

# fa-wp4-send-and-stage — 2026-09-22

## SURFACE-2026-09-22-QUALITY-WP4-COMMENT-DUPLICATION-ACROSS-PROMPT-MODULES

- **Priority:** low
- **Source:** feature-review-quality (F-a WP4), MINOR
- **Status:** pending

**The finding.** Four rationales are restated across six files instead of stated once with
pointers: the M11-WP4 "four call sites shipped a CRITICAL twice" reasoning (4 sites), the
`planPanelChange` live-caller provenance (6 sites), "`injectCommand` has no retry and no pre-send
cancel window" (4 sites), and the WP3→WP4 seam narrative (2 sites).

⚠️ **Why it was NOT fixed inside the ship commit:** the canonical-home-plus-pointers collapse spans
files WP4 did not author (`autoResumeFire.ts`, `promptDraftSync.ts`, `draftHistory.ts`), and
widening a post-ship cleanup past the reviewed diff is its own risk.

**Suggested action.** Pick ONE canonical home per rationale — `sendStagedDraft.ts`'s header for the
funnel argument, `promptDraftSync.ts`'s for the live-caller one — and reduce the rest to pointers.
⚠️ Per `docs/lessons/source-text-guards.md`, "how did we get here" narratives belong in the
WIP/archive, not in module headers.
