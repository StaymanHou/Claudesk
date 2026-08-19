# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

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

## SURFACE-2026-08-18-QUALITY-WP3-LATE-SUBSCRIPTION-DISPOSAL-UNTESTED
- **Source:** feature-review-quality (M13 WP3, MAJOR) — **VERIFIED INDEPENDENTLY at review**
- **Type:** gap (real code with no reachable test)
- **Summary:** `awaitCompletion`'s `(un) => (settled ? un() : unlisteners.push(un))` at
  `recycleSession.ts:259` and `:271` disposes a subscription whose `listen()` resolved **after** the
  operation already settled. ⚠️ **The test mock always resolves its unlisten synchronously**
  (`Promise.resolve(() => …)`), so the `settled ? un()` half is **unreachable by the suite** — both
  "unsubscribes both sources" tests settle after the subscriptions have landed, and
  `unlistenCalls === 2` passes either way.
- **Context:** The real ordering it guards is a `listen()` round-trip slower than the operation —
  reachable via a slow IPC or a short `completionTimeoutMs`. ⚠️ This fails the repo's own test:
  *"could this still pass if the code it names were deleted?"* A future simplification to a bare
  `unlisteners.push(un)` would pass the entire suite while **leaking one `fs-change` listener per
  Recycle for the app's lifetime**.
- **Suggested action:** Make the mock's unlisten resolution **deferred and controllable** (resolve it
  on a later tick, or expose a resolver the test fires after settle), then assert the un-pushed
  unlisten was still called. Small, and it converts real-but-unreachable code into guarded code.
- **Priority:** medium (no live defect — the code is correct; the risk is entirely in the next edit)
- **Status:** pending

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

## SURFACE-2026-08-18-QUALITY-WP3-THREE-MINOR
- **Source:** feature-review-quality (M13 WP3, 3 MINOR)
- **Type:** tech-debt
- **Summary:** (a) `showRecycleButton`'s doc claims deliberate independence so the two predicates can
  diverge, but the button renders **inside** the `showSkillButtons(...) &&` block, so that gate
  strictly dominates and the documented divergence is unreachable as wired — the new source guard
  even pins the nesting. (b) ⚠️ **Two opposite rules for one idiom in a single commit:**
  `XtermPane.tsx:280` writes a ref **during render** while `Workspace.tsx:196-199` documents at
  length that render-phase ref writes are an eslint **ERROR** and uses an effect. (c)
  `waitForFreshSessionId` and its two constants are defined **after** their use.
- **Suggested action:** (a) one sentence acknowledging the current nesting; (b) state which rule
  governs and why the `XtermPane` precedent is exempt (or convert it); (c) reorder.
- **Priority:** low (all three)
- **Status:** pending

# m12-wp4b-drive-mode-signal — 2026-08-07

## SURFACE-2026-08-07-QUALITY-WP4B-ENV-VAR-INHERITS-TO-ALL-DESCENDANTS
- **Source:** feature-review-quality (M12 WP4b, MAJOR) — **CONFIRMED EMPIRICALLY at review, not accepted on assertion**
- **Type:** gap (stated containment story is narrower than actual reach)
- **Summary:** `CommandBuilder::env` is **additive over the inherited environment** (there is no `env_clear()` anywhere in `cc_session`), so `CLAUDESK_DRIVE_MODE` propagates down the **entire descendant chain** of a Claudesk-spawned CC — not just to CC itself. A `claude` launched from inside that CC's Bash tool inherits the var and its `UserPromptSubmit` hook fires carrying **the parent workspace's mode**, even though that nested session never opened a Claudesk workspace. Verified directly: `CLAUDESK_DRIVE_MODE=fsd bash -c 'bash -c echo $CLAUDESK_DRIVE_MODE'` → `fsd` at both levels, and feeding that value to the real hook emits the sentence.
- **Context:** ⚠️ **The WP's own containment story is CC-yes / login-shell-no** (constraint 5, `shell_spawn_env`, `the_raw_login_shell_never_receives_the_drive_mode_var`) — all of which guard the **sibling** shell and none of which address **descendants**. The announced blast radius is "1 of 10 events, CC-only"; the real radius includes nested CC invocations. ⚠️ **The test suite ALREADY OBSERVED this and neutralized it locally**: both new helpers call `.env_remove("CLAUDESK_DRIVE_MODE")` with a comment saying the ambient environment carries it because the tests run inside a Claudesk workspace. That was the strongest available signal about production behavior and it was consumed as test hygiene. ⚠️ Precedent in this repo for the same shape: `[[agent-launched-app-cannot-verify-continue]]` (CLAUDE_CODE_CHILD_SESSION leaking down a launch chain). **Not necessarily a defect** — a nested CC arguably *should* inherit the workspace's mode — but it is undecided and unstated.
- **Suggested action:** Decide the intent, then make it explicit. Either (a) accept propagation and say so at `cc_spawn_env` ("descendants inherit this; any of them emitting UserPromptSubmit will fire the hook with this mode"), or (b) scope it to the direct child. ⚠️ Do NOT reach for `env_clear()` — it would strip PATH/LANG/TERM and break the M10.5 mojibake fix and the GUI-PATH spawn fix. If (b) is wanted the mechanism is a marker the hook can compare against, not env removal.
- **Priority:** medium (no user-visible defect today; it is a stated-scope gap on a feature whose whole safety story is "inert unless Claudesk set it")
- **Status:** pending

## SURFACE-2026-08-07-QUALITY-WP4B-FOUR-MINOR-FINDINGS
- **Source:** feature-review-quality (M12 WP4b, MINOR ×4)
- **Type:** tech-debt (polish)
- **Summary:** (1) `claudesk-hook.pl:108` rebuilds the 4-element `%KNOWN` hash on every `UserPromptSubmit` — negligible against Perl's ~15 ms cold start, but the surrounding comments advertise per-call cost as a design constraint and do not answer the question they invite. (2) `cc_session/mod.rs:499-506` reaches the wire value via `serde_json::to_string(&mode).trim_matches('"')`, and the `if let Ok(wire)` arm silently drops the var on a serialization failure that cannot occur for a fieldless enum. (3) `hook_pl_output.rs`'s `expected_context()` duplicates the sentence literal from the script and defends it — three lines from the vocabulary test whose stated principle is the opposite (read it out, never restate); the two adjacent tests apply opposite duplication rules with no note reconciling them. (4) `set_default_drive_mode_leaves_the_model_override_untouched_and_vice_versa` does not assert the "vice versa" half.
- **Suggested action:** Address opportunistically. (3) is the most valuable — a one-line note reconciling why the *vocabulary* is read out of the script while the *sentence* is duplicated would stop a future editor unifying them the wrong way. (4) is a two-line test addition.
- **Priority:** low
- **Status:** pending

# m12-wp3-autofire-and-announce — 2026-08-05

## SURFACE-2026-08-05-QUALITY-WP3-THREE-MINOR-POLISH-ITEMS
- **Source:** feature-review-quality (M12 WP3, 3× MINOR)
- **Type:** tech-debt (polish)
- **Summary:** (a) `session_state::is_unclean` is `pub` with **no callers outside its own module** while its docstring calls it a footgun — `pub` in a lib crate suppresses `dead_code`, so the ledger discipline that caught `is_unclean_on_disk` **cannot see it**; narrow to `pub(crate)`. (b) `XtermPane.tsx:542-551`'s `exhaustive-deps` suppression comment enumerates every intentional exclusion by name but **omits the two new captured props** (`pendingAction`, `openIntent`) — safe today since both are immutable after mint, but that list is the mechanism protecting the effect. (c) `pickerRowOrder.ts:52,76` still say "the `⏵` cell" after the glyph became `⊘`, and `pickerRowGutterStructure.test.ts:63` still emits `⏵` as its fixture's text node.
- **Context:** Grouped as one entry because all three are single-line mechanical edits in the same WP. Item (a) is the most interesting: the module's own closing argument is that no item survives without a real caller, and this one does — invisibly, because visibility suppresses the lint that would say so.
- **Priority:** low (all three)
- **Status:** pending

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-MEASUREMENT-SCRIPTS-NOT-IN-REPO
- **Source:** feature-review-quality (M12 WP1, MAJOR)
- **Type:** tech-debt (evidence provenance)
- **Summary:** All three measurements Verdicts (a)/(b) reason from were produced by scripts in the **session scratchpad**, which is not in the repo. The 27.9× write-amplification figure and the 0.022/0.051/0.123 ms announce table therefore have no reproducible provenance, while Phase 2's own observable required the measurement be *"reproducible by re-running the script the phase writes."*
- **Context:** The lost-update fact — the load-bearing one — **is** now pinned by the Rust test `interleaved_whole_file_writes_lose_the_earlier_writers_edit`, which is the right answer and supersedes its script. The two *performance* figures are the gap. **Mitigated at review time:** both are now labelled in `wbs.md` as one-shot observations with their METHOD stated inline, so the doc no longer cites evidence a reader cannot reach and the measurement can be redone in ~5 minutes. What remains open is whether a perf spike of this kind should have a durable home.
- **Suggested action:** Decide the general convention rather than just this instance: either (a) accept that probe-grade perf spikes are one-shot and method-documented (current state — arguably correct, since a benchmark nobody runs rots), or (b) give them a home under `tooling/` when the number is cited in a durable doc. ⚠️ Do NOT reflexively add a `tooling/` script for this WP alone — the conclusion depends on the round-trip COUNT (1 vs N), a design property, not on the timings.
- **Priority:** low (was MAJOR pre-mitigation; the doc no longer overclaims and the decisive fact is test-pinned)
- **Status:** pending

## SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** gap (process)
- **Summary:** Phase 2's observable required the verdict cite `ProjectPicker.tsx:38-42` "as the precedent it **is following**." The verdict correctly *reversed* that conclusion (sibling command, not a widening) and cites the precedent as **declined**, by name rather than by line — so the literal string `ProjectPicker.tsx:38-42` appears nowhere, and a mechanical grep of the observable reports a miss on a phase marked `[x]`.
- **Context:** The reversal is the *right* outcome; the defect is that the observable was not amended when the conclusion inverted. Generalizable process point: **when a phase's finding overturns the assumption its own observable encoded, the observable must be rewritten, not silently outgrown** — otherwise a later audit reads the mismatch as an unfinished phase.
- **Suggested action:** No code change. Consider whether `feature-verify-codify` should prompt to reconcile observables that a verdict reversed. Low value alone; worth folding into a future workflow-system pass.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-08-03-QUALITY-WP1-TWO-LIVE-VERDICT-B-REFERENCES
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** tech-debt (naming ambiguity)
- **Summary:** `src/App.tsx:306-308` carries a pre-existing M10.9 comment reading *"Verdict (b)'s requirement"*. M12 WP1 introduced a **different** "Verdict (b)" whose reasoning cites that same call site, so two live "Verdict (b)"s now point at one line with different meanings.
- **Context:** Not introduced by this diff, but this diff is what made it ambiguous. Probe verdicts are per-WP and letter-keyed, so collisions recur every milestone — the fix is a qualifier convention, not a one-off edit.
- **Suggested action:** One-word qualifier at the call site (`M10.9 Verdict (b)`), and prefer milestone-qualified verdict references (`M12 WP1 Verdict (b)`) in future probe write-ups.
- **Priority:** low
- **Status:** pending

# m11-wp3-docs-render-and-navigation — 2026-08-02

*Reviewer: `code-quality-reviewer` against ship baseline `6f6df23`. 0 CRITICAL / 4 MAJOR / 3 MINOR.
**All 4 MAJOR were FIXED IN PLACE** (three verified by reproducing the reviewer's mutations first —
one of them passed the full 1645-test suite while re-opening a webview-hijack hole). Only the 3
MINOR are backlogged.*

## SURFACE-2026-08-02-QUALITY-WP3-HEADING-SLUG-NO-COLLISION-SUFFIX
- **Source:** feature:review-quality (m11-wp3)
- **Target level:** feature
- **Type:** gap (minor correctness)
- **Summary:** `headingSlug` does not de-duplicate colliding ids. Two headings differing only in
  punctuation (`## Probe outcomes` / `## Probe outcomes!`) emit the same `id`, so an anchor link
  reaches only the first. GitHub appends `-1`, `-2`; the comment claiming it "mirrors GitHub's
  algorithm" overstates by one rule.
- **⚠️ Context — MEASURED 2026-08-19 (paydown WP6). The original context claim was REFUTED.** It read:
  *"The corpus most likely to collide is exactly this panel's target — long WBS/WIP files with
  repeated section names (`## Tasks`, `## Probe outcomes` per WP)."* Scanned every `.md` the viewer
  can open (`workflow-system/`, `docs/`, `CHANGELOG.md`, `README.md`) — **197 files**:
  - **1 file** has any colliding slugs: `workflow-system/state/archive/m12-wp3-autofire-and-announce.md`
  - **4 colliding slugs** there (`gate`, `hygiene`, `session-hygiene`,
    `what-was-deliberately-not-codified`) — ⚠️ **none is `tasks` or `context`**, the two the filing named
  - **3 `](#...)` occurrences in the whole corpus, and all 3 are prose *examples* of the syntax**
    inside WBS/probe text — not navigable links
  - **0 anchor links target a colliding slug**, so the defect has no reachable consumer today
- **⚠️ And the fix is not the small change the filing implies.** `headingSlug` is a pure function of
  one string; de-duplication needs **per-document counter state**. Its only production caller is
  `DocMarkdown.tsx`'s `HEADING_COMPONENTS`, which is **module-scope deliberately** — *"so the object
  identity is stable across renders and does not force the renderer to rebuild its component map on
  every keystroke-driven re-render."* A counter means reversing that documented decision or threading
  a `useMemo`'d per-doc map.
- **Resolved half:** the over-claiming comment was narrowed at paydown WP2, and WP6 appended the
  measurement to it. ⚠️ Note the finding itself proposed this as a legitimate close — *"the comment fix
  is not a cop-out"*.
- **Suggested action (remaining):** **Leave the behavior as-is.** Revisit only if one of these becomes
  true — and check, do not assume: (a) a doc gains a *real* in-doc anchor link that targets a colliding
  slug, (b) a heading collision appears on a common slug (`tasks` / `context` / `summary`) in a
  non-archived doc, or (c) `HEADING_COMPONENTS` stops being module-scope for an unrelated reason, making
  the counter nearly free. Re-run the corpus scan before re-scoring — this entry's numbers are true
  as-of 2026-08-19 (`[[backlog-finding-carries-an-implicit-as-of-date]]`).
- **Priority:** low (latent; no reachable consumer measured)
- **Status:** open — behavior deliberately unchanged, measured latent at paydown WP6 (2026-08-19)

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
- **Resolved sub-items (2026-08-18, paydown WP1):** (4) `validate_frontend_root`'s verbatim copy —
  the `editor_fs` original is now `pub(crate)` and imported, and the dedup is **structurally
  enforced**: a re-introduced copy fails to compile (`E0255`), proven by mutation. (3)
  `DocsPanel.tsx` `selected` — resolved by the passage of the work the finding itself named
  ("no consumer *until WP3*"); WP3/WP4/WP5 shipped, the value now has ~35 references and the stale
  header claim is gone. **No edit was made — recorded as no-change-needed with evidence.**
- **Context:** The reviewer's overall note is that comment-to-code ratio in `panelHost.ts` and
  `docs/mod.rs` is high enough that load-bearing sentences compete with provenance narration.
  ⚠️ **Both survivors are comment-DENSITY items, so they belong to the deferred T1/T2 convention
  pass** (`backlog-paydown-wbs.md` → "Deliberately NOT in a WP"), **not** to a sweep WP. Per-WP
  trimming was measured as **not converging** — the same file was flagged in four consecutive
  reviews. The shape that works: designate ONE authority per rule, collapse other sites to a
  pointer, and **guard it** so it cannot drift back.
- **Suggested action:** Carry both into the T1/T2 convention pass. ⚠️ Do **not** fix by trimming a
  little from each site — that is the recorded failure mode.
- **Priority:** low
- **Status:** pending — 2 of 4 sub-items remain; routed to the T1/T2 convention pass

# time-tracking-offline-local-only-copy — 2026-08-01

*(feature-review-quality against ship baseline `0f5a8c7^..7a1a185`; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 3 MINOR. **BOTH MAJORs were FIXED IN PLACE, not backlogged**, and so was one MINOR — see the originating WIP's `## Code-Quality Review` for the full record. The two MAJORs were reflow-fragile `?raw` assertions in this WP's own new copy guards: prose inside JSX wraps at Prettier's default 80 cols, and two assertions sat 3–6 characters from the boundary, so they passed only by luck about where the words fell. Fixed by normalizing the haystack (`src.replace(/\s+/g, " ")`) in both guard files, validated in both directions — a **pure reflow** with identical words now passes where it previously failed, while dropping a claim, dropping the scope disclosure, or renaming the advertised label each still fail. Rationale for deviating from autopilot's auto-backlog default: one line per file, the guards protect a **privacy disclosure**, and they had been written in the same session — backlogging a guard already known to misfire would ship known-broken verification. Reviewer: "well-built copy-only change that does more than its brief… the plan-audit discipline is the strongest thing here.")*

## SURFACE-2026-08-01-QUALITY-WP3-ANALYTICS-HINT-EXCEEDS-SIBLING-BAND
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:529`
- **Finding:** The Analytics `SettingsGroup` hint is **270 chars** against sibling group hints of **107 / 84 / 42** (lines 367, 391, 545) — still ~2.5× the longest sibling after the verify-human compression from 322.
- **Why it matters:** Cosmetic/proportion only; the content is correct, each of its four facts is distinct, and the length was an explicit operator-delegated call. Worth recording because the WP itself banked *"measure the incumbent's siblings first"* as the reusable lesson, and this surface still sits outside the band that lesson describes.
- **Pickup shape:** Do **not** shorten by dropping a claim — all four are load-bearing (the machine-wide scope clause especially; removing it makes the copy misleading by omission, and its truthfulness is verified in `time_store::drain_loop`). The real fix, if ever wanted, is a **dedicated privacy line** as a distinct element so the group hint returns to one sentence. That is a small UI addition, not a copy edit, so it needs to clear `new-surface-must-earn-its-place` first. Revisit only if such an element appears for another reason.
- **Priority:** low.
- **Status:** pending.

# m10.9-wp3-invite-settings-substrate — 2026-07-29

*(feature-review-quality against ship baseline `6193615^..5bc88f3`; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 5 MINOR. **MAJOR #1 (gate-seam bypass in App.tsx) was FIXED IN PLACE, not backlogged** — it was a live staleness defect and the fix was a 3-line import swap; the OFF-invariant guard's blind spot that hid it was closed in the same pass. Only MAJOR #2 and the 5 MINOR are listed here. Reviewer: "high-quality, unusually disciplined work — the strongest parts are the persistence model and the consistent instinct to extract a pure function whenever a decision has a truth table.")*

## SURFACE-2026-07-29-QUALITY-WP3-DETACHED-SUBSTRATE-COMMENT
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:190-199`
- **Finding:** The 10-line substrate-presence comment block is separated from the code it documents — the highlight state + effect were inserted between it and `const [substratePresent, …]`. A reader arriving at :190 reads nine lines about a filesystem probe, then meets an unrelated highlight comment.
- **Why it matters:** the reasoning is load-bearing (why this is NOT a `useSettingControl`) but as placed it reads as documentation for the highlight.
- **Suggested action:** move the block down to sit directly above `const [substratePresent, …]`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-29-QUALITY-WP3-HARDCODED-HIGHLIGHT-TINT
- **Severity:** MINOR
- **Location:** `src/components/settings/__tests__/settingsHighlight.test.ts:55,98`
- **Finding:** Two assertions hardcode the literal `rgba(120, 165, 240`. A designer-level tint tweak with zero behavioral consequence fails two tests and reads as a regression. (The duration-coupling test in the same file is well-built by contrast — it parses both sides and compares numbers.)
- **Why it matters:** the load-bearing property is "three distinct peaks with troughs between", which can be asserted by counting `background-color:` stops and their alternation without pinning a specific color.
- **Suggested action:** count stops/alternation instead of matching the color literal.
- **Priority:** low
- **Status:** pending

# editor-fs-backend-hardening — 2026-07-20

*(feature-review-quality on the uncommitted working-tree WP7 diff, HEAD `6f514d0`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all polish/observability notes, none blocking. Reviewer: "well-built, disciplined hardening pass… all flagged edge cases resolve correctly under the design; none rise to a finding." Backlog-paydown sweep WP7 — the last WP.)*

## SURFACE-2026-07-20-QUALITY-WP7-VALIDATE-ROOT-PER-CALL-COST
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs:34-45` (`validate_frontend_root`)
- **Finding:** Reads + parses `projects.json` from disk AND canonicalizes every known root on *every* read/write/stat/delete/trash/create call — one `canonicalize` syscall per known root, N syscalls per op. Correct and acceptable at single-user scale, but scales with project count.
- **Why it matters:** A future watch/poll surface (or a tight save loop) calling these commands repeatedly would re-do the disk read + per-root canonicalize each time.
- **Suggested action:** Memoize the resolved known-roots behind the config-store's existing state rather than re-reading `projects.json` each call.
- **Priority:** low

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

# m10-wp4-updater-user-control-ux — 2026-07-17

*(feature-review-quality on ship commit `ee7bad7`; Mode 3 autopilot. Originally 0 CRITICAL / 1 MAJOR / 3 MINOR. **3 RESOLVED by M10 WP6 Phase 1** — the MAJOR `ERROR-STATE-UNCONSUMED` [now consumed by `UpdaterStatusRow`], MINOR `MENU-CHECK-DISCARDS-OUTCOME` [manual-check feedback via `statusNoteForOutcome`], MINOR `FALLBACK-VS-ERROR-RACE` [reconciled under the single-post-install-surface invariant] — closed 2026-07-18 at `/product-finalize`, see CHANGELOG. 1 MINOR survives below.)*

## SURFACE-2026-07-17-QUALITY-WP4-FINISH-EMIT-ZEROES-DOWNLOADED
- **Severity:** MINOR
- **Location:** `src-tauri/src/updater/commands.rs` (~L184-193, `on_download_finish` emit)
- **Finding:** the finish emit sends `downloaded: 0, total: None, done: true`, zeroing the final cumulative byte count. Harmless (`progressPercent` short-circuits on `done` → 100), but reads as a lost value to a future maintainer.
- **Why it matters:** trivial cosmetic; the `done`-pins-100 comment exists, but the `downloaded: 0` reset is mildly surprising.
- **Priority:** low
- **Pickup shape:** carry the final `downloaded` through on the finish emit (or a one-line comment). Rides any future `updater/commands.rs` touch. Dismiss via the WIP's review section.

# m9-wp6b-2-week-month-sidepanel-range (Phase 4) — 2026-07-14

*(feature-review-quality on the WP6b-2 Phase-4 working-tree change [SidePanel + click-to-select seam; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — both auto-backlogged [low]. Reviewer: clean, well-disciplined render-surface port; no refactor warranted. Both MINORs are polish/awareness, not correctness.)*

## SURFACE-2026-07-14-QUALITY-WP6B2P4-WALLTIME-QUANTIZATION-BASIS
- **Severity:** MINOR (doc/awareness only)
- **File:** `src/components/workspace/dashboard/SidePanel.tsx` (L65 `wallTime = Math.max(0, session.end - session.start)`)
- **Finding:** `wallTime` uses the minute-quantized session endpoints, so the "active of Xh Ym wall" denominator + the mini-timeline seg span are on a MINUTE grid, while the numerator (`sumActive`) is true-`dur_ms`. For a sub-minute session this reads "0m active of 0m wall". This is FAITHFUL + internally consistent for POSITIONING (the mini-timeline positions legitimately live on the minute grid, matching the main timeline's `viewportPct`), NOT a defect.
- **Fix shape:** none needed. Recorded only so a future reader doesn't "fix" the mini-timeline to a `dur_ms` basis + break the wall-relative layout (the positions MUST stay on the minute grid to align with the main timeline). If the wall FIGURE (not the positions) ever needs sub-minute precision, sum `dur_ms` across the session's segs for the denominator label only — but leave the positioning math alone.
- **Priority:** low (awareness; likely a no-op / won't-fix).
- **Status:** pending.

# m9-wp4-segment-model-query-layer — 2026-07-08

*(feature-review-quality on ship commit `d8b308e`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all auto-backlogged, priority low. Reviewer: well-built phase — correctly re-expresses the transform against WP3's 6-kind enum, lands both carried MAJOR reclassify findings with genuine pinning tests, DTO/serde pinned both IPC sides, debt minimal + honestly tracked. The 4 MINORs are boundary edges + one drift-risk duplication + a possibly-dead contract field.)*

## SURFACE-2026-07-08-QUALITY-WP4-DAYPAYLOAD-EMPTY-NOT-ON-IPC-SURFACE
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`DayPayload.empty` ~114-127; `build_range` single-day path ~503-519)
- **Finding:** `DayPayload` carries `empty: Some(true)`, but `build_range`'s single-day path propagates only `iso`/`hour_range` (drops `empty`), and the command returns only `TimeAnalyticsResult::Range(RangePayload)` — which has no `empty` field (nor does the FE `RangePayload`). So a WP6 day-query consumer can't read the empty-day hint; it must infer emptiness from `projects.is_empty()`. Either the flag is dead on the IPC path (its test only exercises the internal `DayPayload`) or WP6 needs it surfaced on `RangePayload`.
- **Fix shape:** a deliberate WP6-facing decision — surface `empty` on `RangePayload`, OR document that WP6 infers emptiness from `projects.is_empty()` and the `DayPayload.empty` flag is internal-only. Decide while the shape is fresh.
- **Priority:** low (WP6-facing contract decision).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-CUSTOM-WINDOW-MIDNIGHT-EXTRA-DAY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`resolve_window` Custom arm ~462-467)
- **Finding:** a Custom window whose `end_ms` lands exactly on a local midnight → `rows_in_window` excludes that instant (half-open `ts < end`) while `end_day = local_date_of(end_ms)` resolves to the next day, so `build_range` emits one extra all-empty trailing day. Cosmetic; untested at the boundary. *(Note: `local_date_of_ms` was renamed to the shared `local_date_of` in the WP3 tz-helper dedup.)*
- **Fix shape:** clamp `end_day` back by one when `end_ms` is exactly local-midnight, or add a boundary test documenting the artifact.
- **Priority:** low (cosmetic range-widget edge).
- **Status:** pending.

# mirror-fill-from-bottom — 2026-07-06

*(feature-review-quality on ship commit 99aca94; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, tightly-scoped fix at the shared seam; correctness verified against the vendored xterm source. One MINOR (count-drift typo) was fixed in-place; the two below are auto-backlogged. None warrant a refactor pass.)*

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-FIXTURE-REALISM
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~32, 36-37 comments) + `src/components/workspace/__tests__/mirrorTrim.test.ts` (fixtures)
- **Finding:** The fixtures + comments use the simple `<div><span>text</span></div>` row shape, but real styled CC output produces intra-row `</span><span style='…'>` transitions (from xterm's `_nextCell` style diffs). The non-greedy `ROW_RE` handles the styled shape correctly (spans close with `</span>`; the first `</div>` still wins), so this is not a correctness gap — but the test fixtures under-represent the actual serializer output, which is a future-reader trap.
- **Fix shape:** add one styled-multi-span row fixture to `mirrorTrim.test.ts` documenting the real case; optionally soften the "spans hold text only" comment to acknowledge multi-span rows.
- **Priority:** low.
- **Status:** pending.

# cc-permission-mode-dropdown — 2026-07-02

*(feature-review-quality on ship commit 1624e2e; Mode 2 orchestrated. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, advances the codebase; wire contract + migration are the standouts. None warrant a refactor pass.)*

## SURFACE-2026-07-02-QUALITY-CCMODE-DEFAULT-ARGV-NOOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~205, `build_cc_argv`)
- **Finding:** `Default` now emits an explicit `--permission-mode default` (vs. the old bare `["claude"]`); the "harmless no-op" claim in the doc comment is load-bearing but rests on an untested CC-CLI behavioral assumption. The argv unit test pins the mapping, not the behavioral equivalence.
- **Fix shape:** documentation-hardening — note that the equivalence is a verify-human/release check (live spawn IS verify-human-covered; it passed 2026-07-02). No code change strictly needed.
- **Priority:** low.
- **Status:** pending.

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

## SURFACE-2026-07-28-QUALITY-WP2-PICKER-PREFIXED-TESTIDS-IN-SETTINGS-PANEL
- **Severity:** MAJOR
- **Location:** `src/components/settings/SettingsPanel.tsx:184,233,249,259`
- **Finding:** The three migrated controls kept their `picker-*` `data-testid`s (`picker-permission-mode`, `picker-time-tracking`, `picker-update-notifications`, `picker-check-updates`) inside a component whose entire purpose is that they are no longer in the picker.
- **Why it matters:** Knowingly permitted by the WBS ("consider renaming… only if it doesn't inflate the diff"), and keeping them is what let the three migrated wiring tests keep asserting without churn. But it leaves a durable lie in the selector namespace, and `settingsPanelWiring.test.ts` now asserts these `picker-`-prefixed ids are ABSENT from the picker — which reads as contradictory at a glance.
- **Suggested action:** mechanical rename to `settings-*` across ~8 sites (component + the 3 wiring tests + the parity guard). Do it as its own commit so the rename is reviewable in isolation.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-07-28-QUALITY-WP2-ESC-BRANCH-MISSING-RETURN
- **Severity:** MINOR
- **Location:** `src/App.tsx:268-287`
- **Finding:** The `if (e.key === "Escape") { … }` block has no `return` before the subsequent `isSettingsChord(e)` check.
- **Why it matters:** Harmless today (Escape is never `","`), but the sibling dashboard-chord branch above *does* `return`, so the asymmetry reads as an omission rather than a decision — in the very handler whose ordering bug this feature just fixed.
- **Suggested action:** add the `return`, restoring the "one keypress, one branch" shape.
- **Priority:** low
- **Status:** pending

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
- **Summary:** (1) **Comment density — THIRD consecutive flag** (WP2, WP3, now WP4; WP3 noted it
  had grown). Reviewer's judgment: it has crossed from stylistic to functional, since the two
  genuine gaps found at review sat inside the densest region of the file. Worst offenders named:
  `DocsPanel.tsx:208-222` (15 comment lines for one `useState(0)`, restating the P3.5 incident
  already recorded at length in the WIP) and `DocsPanel.tsx:113-151` (39 contiguous comment lines
  above a 24-line effect, containing two separate accounts of the same latch bug, one duplicating
  `fetchLatch.ts`'s own header). **Rule worth adopting: state the invariant and the forbidden
  shape at the code; cite the WIP for the narrative.** (2) A **second** per-workspace `fs-change`
  listener, where `RightPanelHost.tsx:315-317` documents the opposite pattern ("reuse the same
  single listener instead of a second one in `EditorSplit`") — defensible for a lazy chunk, but
  the deviation is unacknowledged, leaving the next consumer two conflicting precedents and no
  rule. (3) `DocsPanel.tsx` `plan.apply && el !== null` — the second conjunct is unreachable as a
  condition (exists only for `tsc` narrowing); undercuts the `isMeasurable`-as-type-predicate
  rationale documented 200 lines earlier. (4) The reload path swallows a `docs_list` failure with
  no `setError` while the initial fetch surfaces it — keeping the list is right, but the asymmetry
  makes a permanently-unreadable doc dir read as "nothing is changing", against the file's own
  "surfaced, never swallowed" convention.
- **Context:** (1) is the highest-value item and is now specific enough to act on. It is also
  self-reinforcing: the review found real defects hidden in the comment thicket.
- **Suggested action:** (1) at the next touch of `DocsPanel.tsx` — cut the incident retellings,
  keep the invariants. (2) record the rule either way in `arch.md`. (3)+(4) one-liners.
- **Priority:** low (all four)
- **Status:** pending

