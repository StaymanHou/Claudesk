# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# paydown-wp3-boot-smoke-test — 2026-09-23

## SURFACE-2026-09-23-QUALITY-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X
- **Severity:** MAJOR
- **Location:** `linkCheck.mjs` header; `docs/lessons/verify-auto-gate.md` §check:link; `source-text-guards.md` §19; `appBoot.test.tsx` header; `moduleGraphBoot.test.ts` header; `turnNavExportContract.test.ts` SCOPE note; `CLAUDE.md` gate-order line; `backlog-paydown-wbs.md` checklist
- **Finding:** "Vitest reads a missing binding as `undefined`" is stated in about 8 places, and the "Blind to" list exists in full in both `linkCheck.mjs` and `verify-auto-gate.md`. That goes against the lesson file's own §"Comment budget" (state it once, point to it elsewhere). `moduleGraphBoot.test.ts` also carries history ("first written as one", "probed 2026-09-23") that belongs in the archive.
- **Suggested action:** make `source-text-guards.md` §19 (or `verify-auto-gate.md`) the canonical home. Leave each code site with only its invariant, what to do when it fails, and a pointer. Diff the token set before and after (`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`). This fits paydown WP4 (narrowing over-claiming comments).
- **Priority:** low
- **Status:** pending

# fa-wp2-draft-store-history-payload — 2026-09-21

## SURFACE-2026-09-21-QUALITY-BLANK-CHECK-READS-BEFORE-THE-STORAGE-GUARD
- **Severity:** MINOR
- **Location:** `src/components/workspace/draftHistory.ts` — `appendToHistory`'s blank-entry check
- **Finding:** the blank-entry branch calls `loadHistory(projectPath)` before `safeStorage()`, so a
  blank send performs a storage read the immediately-following no-storage guard would have
  short-circuited. Harmless; the ordering is incidental rather than intentional.
- ⚠️ **Do NOT "fix" this by returning `[]` from the blank arm** — that is the MAJOR this WP just
  fixed (every non-append path returns the ring as it stands). Only the *ordering* is the finding.
- **Suggested action:** hoist the `safeStorage()` guard above the blank check, or leave it.
- **Priority:** low

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

## SURFACE-2026-09-14-QUALITY-RECYCLE-TOKENS-CAST-IS-A-PROSE-CONTRACT
- **Severity:** MINOR
- **Location:** `src/state/supervisor/verdict.ts` (the `recycle` arm's `tokens` field)
- **Finding:** `tokens: input.contextTokens as number` rests on a comment ("Non-null by
  construction: `shouldRecycle` returns false for a null reading") to justify a cast `tsc` cannot
  check. ⚠️ **This is the same contract-in-prose-where-a-type-would-do shape the WP3 review flagged
  three times** — the pattern this feature's predecessor paid down.
- **Suggested fix:** have `shouldRecycle` return the number (or `null`) instead of a boolean; the
  cast then disappears entirely.
- **Priority:** low
- **Status:** pending

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
this file per delete-on-resolve; **3 MINORs remain open below.** The MAJORs shared one shape —
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

## SURFACE-2026-09-13-QUALITY-TIMEOUT-TEST-REIMPLEMENTS-THE-PRODUCTION-LOOP

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src-tauri/src/adjudicator/mod.rs:214-240` (and `:177`)

⚠️ `run_program_with_timeout` in the test module is a **hand-copied re-implementation** of the
production wait/kill loop (`run_adjudicator`, lines 102-130). So
`a_slow_child_times_out_and_is_reaped` proves **the copy** kills its child — not that
`run_adjudicator` does. `run_adjudicator_with_program` (line 177) is the same pattern for the
`NotFound` arm.

This is exactly `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: a test that
re-implements the code shares its blind spot.

**Suggested action:** extract the wait/kill loop to take a pre-spawned `Child`, so the test
drives the real thing.
- **Status:** pending

## SURFACE-2026-09-13-QUALITY-ADJUDICATOR-DISCARDS-CAPTURED-STDERR

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src-tauri/src/adjudicator/mod.rs:110-115`

On a non-zero exit, `AdjudicateError::Failed` is built with `stderr: String::new()` — **throwing
away the stderr that was captured**. The child is spawned with `stderr(Stdio::piped())` and
`wait_with_output()` has it in hand. The `Display` impl renders `stderr.trim()`, so it always
prints an empty parenthetical.

The DECISION is unaffected (both paths withhold), but ⚠️ **the one diagnostic an operator gets
for a failing `claude -p` is blank.**

**Suggested action:** thread the captured stderr into the error.
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

⚠️ **Findings 1, 2 and 4 share a root cause and ONE fix** — extracting the apply operation into a
`useDriveModeApply` hook gates the affordance, exposes the intent latch as a ref, and makes both
source-guarded properties value-testable. Treat them as one item, not four.

## SURFACE-2026-08-26-QUALITY-DRIVEMODE-REENTRANCY-DISCARDS-A-SECOND-APPLY
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface, ship `efa7798`)
- **Type:** bug (live, user-facing)
- **Summary:** ⚠️ **A LIVE DEFECT, verified at source before filing.** `respawnWanted` gates the
  HANDLER (`Workspace.tsx:374`) but nothing gates the AFFORDANCE. During a queued apply the readout
  stays clickable, the `<select>` stays reachable, and `storedDriveMode` was already optimistically
  written — so a second mode change → confirm → **Apply is silently discarded** while the readout
  shows the new value.
- **Context:** This is the *"readout claims a mode the session is not obeying"* state that AC-5 and
  `applyDriveMode.ts`'s own header exist to prevent, reached through a different door. Confirmed: no
  `disabled` and no click guard on the readout; `Workspace.tsx:917` renders only the ⏳ indicator.
  Reachable only while an apply is queued behind a busy agent, which is why live verification missed
  it — every verified apply ran against an idle session.
- **Suggested action:** Disable the readout/selector while `respawnWanted`, **or** let a second
  apply supersede the queued one. ⚠️ Decide which deliberately: superseding is friendlier but needs
  the first queued apply cancelled, not merely overwritten.
- **Priority:** medium
- **Status:** pending

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

## SURFACE-2026-08-26-QUALITY-SOURCE-GUARDS-WHERE-EXTRACTION-WAS-AVAILABLE
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (guard shape)
- **Summary:** Two source-text guards (`workspaceDriveModeRender.test.tsx:136-205`) assert that
  `Workspace.tsx` destructures `persist` and compares `e.payload.path`. Labelled "floor, not proof"
  — honest, but the conclusion does not follow.
- **Context:** ⚠️ `arch.md`'s "a `?raw` guard cannot express a behavioural property" is an argument
  **FOR EXTRACTION**, which this same feature applied twice (`driveModeWriteFor`, `readyToRespawn`).
  The path filter is equally extractable (`shouldApplyBroadcast(payloadPath, myPath)`). The current
  regex breaks on any rename or reorder, while a semantically-equivalent-but-wrong comparison passes.
- **Suggested action:** Extract both predicates and replace the regexes with value tests.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-DRIVEMODE-MINOR-POLISH
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (2 MINOR findings remain, grouped)
- **Summary:** ⚠️ **Rewritten 2026-09-23 (paydown WP4).** (a) the orphaned duplicate `startApply` comment and (b) the `/** Cancel: a TRUE no-op */` doc mislabeling `resolveDriveMode` were DELETED at paydown WP4. Remaining: (c) `App.css`: `.workspace-header-drivemode` is declared twice, split by an unrelated rule. (d) `Workspace.tsx`: about 130 inline lines of drive-mode state in a component past 1170 lines.
- **Suggested action:** (c) merge the two declarations (H5c, routed to paydown-2026-09-23 WP8). (d) is the `useDriveModeApply` hook extraction that R1 (paydown 2026-09-23) DEFERS to the next time drive-mode apply is touched.
- **Priority:** low
- **Status:** pending

# turn-output-reorientation — 2026-08-25

## SURFACE-2026-08-25-QUALITY-WP3-RAW-GUARD-ON-A-DOM-QUESTION
- **Source:** feature-review-quality (M13.5 WP3, MAJOR)
- **Type:** tech-debt (guard shape)
- **Summary:** `src/components/workspace/__tests__/turnNavControls.test.ts` (161 lines, 10 tests) is entirely `?raw` source-grepping for questions that are **DOM-at-rest** questions — `disabled` bound to the right flag, the readout hidden at `total === 0`, the controls positioned outside the gated row.
- **Context:** ⚠️ **This contradicts a rule the repo wrote down for itself.** `docs/lessons/source-text-guards.md` says: *"when the question is what does the DOM look like at rest, render it… Reaching for `?raw` on a DOM question is how this repo accumulated its nine failure forms"* — and names **two working precedents needing no new dependency** (`docsRender.test.tsx`, `projectModelCellRender.test.tsx`). The WIP never mentions `renderToStaticMarkup`. Concretely brittle: `disabled=\{!turnNav\.canPrev\}` breaks on a Prettier reflow or any trivially-equivalent refactor, and the `[\s\S]{0,200}?` proximity windows are order-dependent. ⚠️ **It also cannot see the rendered attribute at all**, so it cannot cover the gate-OFF case a parsed DOM would get for free. Not a correctness defect today — the 10 arms were each mutation-proven — but it is a guard that will rot in the catalogued ways.
- **Suggested action:** Port to a render test (`renderToStaticMarkup` + a parsed DOM), following the two named precedents. Assert the same three properties off the rendered output, and add the gate-OFF case the grep cannot reach. ⚠️ Expect the port to **delete** most of the regex machinery rather than translate it.
- **Priority:** medium

## SURFACE-2026-08-25-QUALITY-WP3-COMMENT-DENSITY-58-PERCENT
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** ⚠️ **Comment density DID get materially worse in this WP** (the orchestrator asked the reviewer to judge exactly this): **58% of newly added production lines are comments — 388 of 673**. `XtermPane.tsx` moved **51% → 55%** while growing **714 → 944** lines. The `.workspace-jump-turn-btn` deletion rationale is stated in **four places** (`App.css:687-694`, `Workspace.tsx:66-70`, plus two test headers).
- **Context:** ⚠️ **The keep/cut split is clean and should be respected.** The individual *retraction* blocks (`XtermPane.tsx:361-372` alternate-buffer, `:451-458` premise-invalidated) **ARE load-bearing** — each prevents a specific re-derivation that already cost real work, and both are anchored to the code they warn about. The **duplicated deletion rationale** is the "same rationale in N places" pattern the lesson doc names as the expensive half. ⚠️ **No comment was found stale or contradicting the code**, so this is polish, not correctness.
- **Suggested action:** ⚠️ **FOLD INTO `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`; do NOT pay down separately.** That standing finding records that **per-WP trimming was measured as NOT converging** (four consecutive reviews of one file), and its own resolution shape is *"one authority per rule + a pointer at every other site + a GUARD"* — which is exactly what the four-copy deletion rationale needs. This entry is a concrete instance of that finding, and the **second** WP in M13.5 to produce one (see `# window-geometry-persistence — 2026-08-21`), which is itself evidence for the standing item's thesis.
- **Priority:** low

## SURFACE-2026-08-25-QUALITY-WP3-ARIA-LIVE-ON-A-CONDITIONAL-NODE
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** bug (a11y, minor)
- **Summary:** `Workspace.tsx:636-641` — `aria-live="polite"` sits on the readout `<span>`, but that span is conditionally **mounted** on `turnNav.total > 0`. ⚠️ **A live region that does not exist when the value first appears will not announce it** — so the *first* turn is silent and only subsequent ordinal changes are announced.
- **Context:** Real but small: it degrades the AC-5 announcement rather than breaking navigation, and the surface is unannounced by any test either way. ⚠️ Note the interaction with the AC-5 decision to hide the readout at zero turns — the fix must preserve that visual behaviour, so it is *render the region unconditionally and empty its TEXT*, not *drop the conditional*.
- **Suggested action:** Render the `<span>` unconditionally with `aria-live="polite"`; gate only its text content on `turnNav.total > 0`. Verify with a screen reader or an `aria-live` assertion that the first turn announces.
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

## SURFACE-2026-08-18-QUALITY-WP4-WIP-PHASE-SECTIONS-INTERLEAVED
- **Source:** feature-review-quality (M13 WP4, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** The WP4 WIP file's phase sections are **interleaved out of execution order** — "Phase 2
  — pre-read" sits between two Phase 1 sections, and "Phase 4 — pre-read" sits between Phase 3's
  verify-auto and verify-self. Cause: pre-reads were appended in **wall-clock** order into a document
  otherwise organized **by phase**.
- **Context:** The pre-reads being recorded *before* observation is the whole point of them (it is
  what makes "recorded before observing" a real claim rather than a post-hoc one), so the ordering
  itself is correct — it is the **placement** that costs a reader. At 1023 lines the file is the
  archive record for the milestone-closing WP, so navigability has real value.
- **Suggested action:** Group by phase and keep a `⚠️ recorded before observing` marker on each
  pre-read, which preserves the ordering claim without the interleave. ⚠️ Cheap only if done as a
  **move**, not a rewrite — this repo has a logged case of a prose rewrite silently dropping 259
  identifiers while preserving every warning (`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`).
- **Priority:** low (readability of an archived record; no correctness impact)
- **Status:** pending

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

# m12-wp4b-drive-mode-signal — 2026-08-07

## SURFACE-2026-08-07-QUALITY-WP4B-FOUR-MINOR-FINDINGS
- **Source:** feature-review-quality (M12 WP4b, MINOR ×4)
- **Type:** tech-debt (polish)
- **Summary:** ⚠️ **Rewritten 2026-09-23 (paydown-2026-09-23 WP1) to the 2 remaining items.** (3)
  `expected_context()`'s duplicated literal was REFUTED at the 2026-08-18 paydown (the duplication
  is deliberate independent transcription, now documented at the fn), and (4) the "vice versa"
  half is now asserted. Remaining: (1) `claudesk-hook.pl` rebuilds the 4-element `%KNOWN` hash on
  every `UserPromptSubmit`. That is negligible against Perl's ~15 ms cold start, but the surrounding
  comments advertise per-call cost as a design constraint and leave the question they invite
  unanswered. (2) `cc_spawn_env` (`cc_session/mod.rs`) reaches the wire value via
  `serde_json::to_string(&mode).trim_matches('"')`, and its `if let Ok(wire)` arm silently drops
  the var on a serialization failure that cannot occur for a fieldless enum.
- **Suggested action:** (1) hoist the hash; (2) make the can't-happen arm loud. Routed to
  paydown-2026-09-23 WP8.
- **Priority:** low
- **Status:** pending — routed to paydown-2026-09-23 WP8

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

# editor-fs-backend-hardening — 2026-07-20

*(feature-review-quality on the uncommitted working-tree WP7 diff, HEAD `6f514d0`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all polish/observability notes, none blocking. Reviewer: "well-built, disciplined hardening pass… all flagged edge cases resolve correctly under the design; none rise to a finding." Backlog-paydown sweep WP7 — the last WP.)*

## SURFACE-2026-07-20-QUALITY-WP7-UNKNOWN-ROOT-ERROR-VARIANT
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:199` (`validate_root` → `OutsideWorkspace { root: "<no known project>" }`)
- **Finding:** `validate_root` reuses `OutsideWorkspace` with a sentinel `root` string `"<no known project>"`; the `Display` reads `path <X> is outside the workspace root <no known project>`, which is slightly odd (the requested root *is* the rejected thing, not a path outside some other root).
- **Why it matters:** Reusing the variant blurs "root not a known project" vs. "file path escaped a valid root" — a UI that wanted to distinguish them can't.
- **Suggested action:** A distinct `EditorFsError::UnknownRoot` variant would read cleanly and let the UI branch. Minimal-choice reuse is reasonable for now.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-RESOLVE-WITHIN-TOCTOU-NOTE
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:141` (`resolve_within` `exists()`-then-`canonicalize()`)
- **Finding:** A benign, non-exploitable TOCTOU window exists between `exists()` and `canonicalize()`. A swap-to-symlink race is still re-validated by `canonicalize` + `starts_with`; a broken symlink (`exists()` false) falls to the safe not-yet-existing path whose parent is confirmed inside root.
- **Why it matters:** Not a defect — recorded only because the review flagged the pattern, so a future reader doesn't re-raise it.
- **Suggested action:** None (documentation-of-non-issue). Optionally a one-line code comment noting the window is re-validated.
- **Priority:** low

# m10.5-wp3-cc-terminal-clean-kill — 2026-07-19

*(feature-review-quality on the uncommitted working-tree diff, HEAD `92cb0cc`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all one-line doc/observability touch-ups. Reviewer: "well-built, unusually disciplined bug fix… No refactor is warranted." None blocks; refactor-optional. All 3 sit in `src-tauri/src/cc_session/mod.rs`.)*

## SURFACE-2026-07-19-QUALITY-WP3-REAPLEADER-SILENT-NONREAP
- **Severity:** MINOR
- **Location:** `src-tauri/src/cc_session/mod.rs:641-644` (`KillStep::ReapLeader`)
- **Finding:** `ReapLeader` discards `poll_reaped()`'s result (`let _ =`). If a process survives both `killpg(SIGKILL)` and the 300ms window (uninterruptible-sleep descendant, or a `None`-pgid path where a group child lingers holding the slave fd), `kill()` still returns `Ok` and `cc-exit-<id>` EOF may never fire — the AC-4 "wedged never-closed workspace" case — silently. The bounded wait is sound (can't hang); the concern is that a non-reap degrades invisibly. A debug-level log or distinct signal on `Ok(false)` would make the residual case observable.
- **Priority:** low
- **Pickup shape:** small — add a `log`/`eprintln` (or a distinct return) on the `ReapLeader` `Ok(false)` branch; rides any future kill-path touch.

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

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

# wp2-background-work-status-states — 2026-08-22

## SURFACE-2026-08-22-QUALITY-DEAD-LEGACY-WORKSPACESTATUS-TYPE
- **Severity:** MINOR
- **Location:** `src/state/workspace.ts:14`
- **Finding:** A legacy `WorkspaceStatus = "idle" | "running" | "awaiting-input" | "unknown"` type still sits alongside the live `WireWorkspaceState`, differing in **casing** (hyphenated `awaiting-input` vs snake_case `awaiting_input`). It was not extended with `background_work` — correctly, because it appears unused for status rendering (only a literal `status: "idle"` at line 119).
- **Why it matters:** not a bug today, but two near-identical state vocabularies differing only in casing is a standing trap for the next person adding a state — they may extend the wrong one and see nothing break. ⚠️ Note this WP already demonstrated the cost of a sweep keyed on the wrong predicate (the CRITICAL), and this is the same hazard one layer over.
- **Suggested action:** confirm it is genuinely dead, then delete it. If something does depend on it, the fix is to migrate that consumer to `WireWorkspaceState` rather than to maintain two vocabularies.
- **Priority:** low

# fa-wp4-send-and-stage — 2026-09-22

## SURFACE-2026-09-22-QUALITY-WP4-WIRING-TEST-REIMPLEMENTS-SEQUENCE

- **Priority:** medium
- **Source:** feature-review-quality (F-a WP4), MAJOR-3 — partially fixed at review time
- **Status:** pending

**The finding.** `promptSendWiring.test.tsx` RE-IMPLEMENTS the panel's send sequence (plan →
guard → inject → append → clear) in a local `performSend` helper rather than driving the panel's
real closure. It therefore proves the SEQUENCE is correct, not that the PANEL performs it.

⚠️ **What was already done at review time:** the two arms asserting pure test-local logic
(`blank send`, `no live CC session` — both hinging on `if (!sessionId) return false`) were
DELETED (13 → 11 tests) rather than left reading as coverage, and the file's disclosure was
sharpened to state plainly what it does and does not prove.

**What remains.** The component-level version is reachable and was not built: the panel registers
its real send closure via `onRegisterSend`, so a jsdom render could capture and invoke it. That
needs a mounted CM6 host plus a live `injectCommand` round-trip through a mocked `invoke`.

⚠️ **Residual risk is bounded, not zero.** The panel's call ORDER is pinned by source-order guards
in `promptDraftSync.test.ts` (archive-before-clear, one `injectCommand` call site, the confirm-arm
ordering), and those were mutation-proved. What is unpinned is that the panel passes the same
ARGUMENTS the re-implementation uses.

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
