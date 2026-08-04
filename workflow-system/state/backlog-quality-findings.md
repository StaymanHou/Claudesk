# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-MEASUREMENT-SCRIPTS-NOT-IN-REPO
- **Source:** feature-review-quality (M12 WP1, MAJOR)
- **Type:** tech-debt (evidence provenance)
- **Summary:** All three measurements Verdicts (a)/(b) reason from were produced by scripts in the **session scratchpad**, which is not in the repo. The 27.9× write-amplification figure and the 0.022/0.051/0.123 ms announce table therefore have no reproducible provenance, while Phase 2's own observable required the measurement be *"reproducible by re-running the script the phase writes."*
- **Context:** The lost-update fact — the load-bearing one — **is** now pinned by the Rust test `interleaved_whole_file_writes_lose_the_earlier_writers_edit`, which is the right answer and supersedes its script. The two *performance* figures are the gap. **Mitigated at review time:** both are now labelled in `wbs.md` as one-shot observations with their METHOD stated inline, so the doc no longer cites evidence a reader cannot reach and the measurement can be redone in ~5 minutes. What remains open is whether a perf spike of this kind should have a durable home.
- **Suggested action:** Decide the general convention rather than just this instance: either (a) accept that probe-grade perf spikes are one-shot and method-documented (current state — arguably correct, since a benchmark nobody runs rots), or (b) give them a home under `tooling/` when the number is cited in a durable doc. ⚠️ Do NOT reflexively add a `tooling/` script for this WP alone — the conclusion depends on the round-trip COUNT (1 vs N), a design property, not on the timings.
- **Priority:** low (was MAJOR pre-mitigation; the doc no longer overclaims and the decisive fact is test-pinned)
- **Status:** pending

## SURFACE-2026-08-03-QUALITY-WP1-RAW-GUARD-INTERFACE-SLICE-TRUNCATES
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** tech-debt (guard completeness)
- **Summary:** In `listProjectsConsumers.test.ts`, the `interface RecentProject\s*\{[\s\S]*?\}` non-greedy match truncates at the **first** `}`, so a nested-object field would defeat the "no announce field smuggled onto the wire type" assertion (verified: `meta?: { x: number }; unclean_exit?: boolean;` slices to `{ x: number }` and passes).
- **Context:** Latent, not live — `RecentProject` is a flat wire type today and the Rust `Project` it mirrors is flat. Becomes reachable the moment anyone adds a nested field. Same family as the two MAJORs fixed at review time (incomplete `?raw` predicate ⇒ under-determined pass).
- **Suggested action:** Brace-count instead of non-greedy matching, or assert on the *whole file* rather than a sliced interface. Cheap either way. Fold into the next touch of this file.
- **Priority:** low
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

## SURFACE-2026-08-03-QUALITY-WP1-HAZARD-TEST-DOC-COMMENT-LENGTH
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** tech-debt (comment density)
- **Summary:** The doc comment on `interleaved_whole_file_writes_lose_the_earlier_writers_edit` runs 16 lines for a 40-line test. The ⚠️ paragraph (what to do when it fails) is load-bearing *why*; the paragraph re-explaining what the pre-existing sequential test covers is ~one sentence of content in five lines.
- **Context:** Reviewer's own read: *"mildly over-long, not the DocsPanel pattern"* — the inline body comments carry real *why* and should stay. Logged because comment density has been flagged four consecutive reviews in this repo and the operator wants a **budget**, not another ad-hoc trim.
- **Suggested action:** Trim the redundant paragraph to one sentence on next touch. ⚠️ Do NOT trim the ⚠️ reopening-condition paragraph — it is the instruction that keeps a future reader from deleting the test when it correctly fails.
- **Priority:** low
- **Status:** pending

# m11-wp3-docs-render-and-navigation — 2026-08-02

*Reviewer: `code-quality-reviewer` against ship baseline `6f6df23`. 0 CRITICAL / 4 MAJOR / 3 MINOR.
**All 4 MAJOR were FIXED IN PLACE** (three verified by reproducing the reviewer's mutations first —
one of them passed the full 1645-test suite while re-opening a webview-hijack hole). Only the 3
MINOR are backlogged.*

## SURFACE-2026-08-02-QUALITY-WP3-COMMENT-DENSITY-PAST-USEFUL
- **Source:** feature:review-quality (m11-wp3)
- **Target level:** feature
- **Type:** tech-debt (readability)
- **Summary:** Comment density on the small pure modules has tipped past useful — **80%** comment
  lines in `frontmatter.ts`, **69%** in `pickInitialDoc.ts`, **68%** in `classifyHref.ts`.
  `pickInitialDoc.ts` spends 19 lines before its first import; `DocsPanel.tsx:99-115` re-explains a
  latch that `fetchLatch.ts` already explains in its own header.
- **Context:** ⚠️ **The previous WP's review flagged this exact thing and it grew rather than
  shrank.** The *measurements* genuinely earn their lines — the raw/sanitize 3-configuration table,
  birth-08:48/modified-09:28, the 54-doc frontmatter survey — because a reader cannot re-derive
  them. What accreted around them is **process narration**: which phase found a bug, that a first
  draft failed, what a prior version of a comment claimed.
- **Suggested action:** Apply the reviewer's discriminator — **does the sentence survive once the
  WIP is archived?** Measurements and invariants do; provenance does not. Move the provenance to the
  archived WIP (where it already lives) and keep the facts. ⚠️ Do NOT strip the ⚠️-marked invariant
  comments; those are the ones that stopped real regressions.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-08-02-QUALITY-WP3-HEADING-SLUG-NO-COLLISION-SUFFIX
- **Source:** feature:review-quality (m11-wp3)
- **Target level:** feature
- **Type:** gap (minor correctness)
- **Summary:** `headingSlug` does not de-duplicate colliding ids. Two headings differing only in
  punctuation (`## Probe outcomes` / `## Probe outcomes!`) emit the same `id`, so an anchor link
  reaches only the first. GitHub appends `-1`, `-2`; the comment claiming it "mirrors GitHub's
  algorithm" overstates by one rule.
- **Context:** The corpus most likely to collide is exactly this panel's target — long WBS/WIP files
  with repeated section names (`## Tasks`, `## Probe outcomes` per WP).
- **Suggested action:** Either append a `-N` suffix on repeat (needs a per-render counter threaded
  through the `components` override) or narrow the comment to say collisions are unhandled. **The
  comment fix is not a cop-out** — an accurate limitation beats an overstated claim, which is this
  WP's own recurring lesson.
- **Priority:** low
- **Status:** pending

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
- **Summary:** Four MINOR findings, all comment/structure polish with no correctness impact:
  (1) `panelHost.ts:26-43` — the type-only seam import is genuinely load-bearing (verified by
  mutation), but its 18-line justification argues with the guard before describing the code, burying
  the secondary type-safety benefit where it reads as primary. (2) `docs/mod.rs:184-201` — 9 comment
  lines plus a dedicated private-helper test for a dedup branch no production input reaches; an
  assertion that the fixed lists and glob sets are disjoint would pin the same invariant at its
  source, smaller. (3) `DocsPanel.tsx:29,95` — `selected` has no consumer until WP3; the header says
  so, the code doesn't. (4) `commands.rs:40-48` — `validate_frontend_root` is a verbatim copy of
  `editor_fs::commands`' private fn of the same name; `pub(crate)` on the original is one keyword and
  would make the module's own "a second guard is one that drifts" principle true across both halves.
- **Context:** The reviewer's overall note is that comment-to-code ratio in `panelHost.ts` and
  `docs/mod.rs` is high enough that load-bearing sentences compete with provenance narration.
- **Suggested action:** Sweep in a refactor pass, or dismiss individually. (4) is the one with a
  principled argument behind it and is nearly free.
- **Priority:** low
- **Status:** pending

# m11-wp1-markdown-render-probe — 2026-08-01

*(0 CRITICAL / 4 MAJOR / 5 MINOR from `code-quality-reviewer` against ship baseline `d467877`. **7 of 9 were FIXED IN PLACE**, not backlogged — all 4 MAJOR and 2 MINOR were one-line factual corrections to a document shipped minutes earlier, and leaving a known-wrong number in the evidence trail is the exact failure this WP twice flagged as BLOCKING. The 2 below are genuinely deferrable. See the WIP's `## Code-Quality Review` for the full review + what was fixed.)*

## SURFACE-2026-08-01-QUALITY-WP1-SANITIZE-STRICTNESS-UNTRACED
- **Finding (MINOR):** The WP1 verdict's parenthetical that `rehype-sanitize` is stricter than DOMPurify in places — *"it dropped a `<form>` wrapper and flattened `<svg><a>`"* (`wbs.md`, WP1 verdict) — has **no counterpart in the WIP's `## Probe notes`**. Every other claim in the verdict traces to a recorded measurement; this one doesn't.
- **Why it matters:** it is the claim a WP3 reader will reach for precisely when benign content goes missing from a rendered doc — and at that moment they cannot find what was actually observed, only the assertion that something was. The observation is real (it came from a verify-self subagent's adversarial pass) but was never written into the trail.
- **Suggested action:** either record the concrete observation in the verdict (which fixture, which elements, before/after), or soften the claim to "reported at verify-self, not independently re-measured." One or two lines. Fold into any WP3 touch of the render path.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-08-01-QUALITY-WP1-RUNTIMES-UNDERCOUNTS-OBSERVATIONS
- **Finding (MINOR):** `runtimes.md`'s `pnpm test` History bullet records a single observation labelled "M11 WP1 P1 verify-auto", but the suite actually ran **three times** during WP1 (once per phase's verify-auto, plus verify-codify runs). Results were identical (127 files / 1470 tests, ~1.9–2.2s), so nothing is *wrong* — the entry just under-describes what was observed.
- **Why it matters:** minor fidelity issue in the registry's audit trail. The registry's value is that the second session doesn't re-estimate what the first measured; an entry naming one phase when three ran is slightly misleading about sample size, though not about the timing.
- **Suggested action:** decide the convention deliberately — either log one bullet per observation (verbose but honest) or one per feature with a note that N runs agreed. Currently implicit. Worth settling once rather than re-deciding each feature.
- **Priority:** low
- **Status:** pending

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

## SURFACE-2026-08-01-QUALITY-WP3-TEST-COMMENTARY-TRIPLICATES-WIP-PROSE
- **Severity:** MINOR
- **Location:** `src/components/settings/__tests__/settingsTimeTrackingCopy.test.ts` + `settingsTimeTrackingCopyPromise.test.ts`
- **Finding:** ~55 lines of commentary across ~234 total, some of it re-telling WP history that also lives in the WIP, the WBS as-built section, and the commit body — e.g. the "first pass asserted three separate phrasings" episode appears in three places.
- **Why it matters:** Triplicated prose drifts. Once the WIP is archived and the WBS resynced at cycle close, the test-file copy becomes the stale one — and a stale comment inside a *guard* is worse than elsewhere, because it describes what the guard supposedly protects.
- **Pickup shape:** Keep every comment that states **why an assertion exists** or **why a form was chosen over an alternative** (the whitespace-normalization note is load-bearing — it prevents someone "simplifying" the haystack back to raw and silently re-breaking the guard). Trim only the **WHAT-happened narration** of the verify-human compression episode, which the WIP and CHANGELOG already own. Rides any future touch of these files.
- **Priority:** low.
- **Status:** pending.

# m10.9-wp3-invite-settings-substrate — 2026-07-29

*(feature-review-quality against ship baseline `6193615^..5bc88f3`; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 5 MINOR. **MAJOR #1 (gate-seam bypass in App.tsx) was FIXED IN PLACE, not backlogged** — it was a live staleness defect and the fix was a 3-line import swap; the OFF-invariant guard's blind spot that hid it was closed in the same pass. Only MAJOR #2 and the 5 MINOR are listed here. Reviewer: "high-quality, unusually disciplined work — the strongest parts are the persistence model and the consistent instinct to extract a pure function whenever a decision has a truth table.")*

## SURFACE-2026-07-29-QUALITY-WP3-POSITIONAL-RAW-SLICING
- **Severity:** MAJOR
- **Location:** `src/components/settings/__tests__/workflowInviteCopy.test.ts:148-152,167-171`
- **Finding:** Two wiring guards use positional `?raw` slicing — `appSrc.slice(at, appSrc.indexOf("\n", at))` for the `onLater=` handler, and `appSrc.slice(at, at + 90)` for the Esc branch. Both are the fragile shape the repo convention warns against ("assert single identifiers — never formatted multi-line expressions"). The line-bounded one silently depends on Prettier keeping the handler on one line; the fixed-width window is **the exact pattern that already produced a false positive in this same feature** (documented in the test at :143-147) — it was fixed in one place and left in the other.
- **Why it matters:** these are the highest-value assertions in the file (`[Later]` writes nothing; Esc means `[Later]`, not `[Dismiss]`) and therefore the ones whose silent failure costs most. WP2 already paid twice for `?raw` guards that stopped matching after a reflow.
- **Suggested action:** extract the Esc-branch decision as a pure function and assert it as a value — the same treatment `escDismissTarget` received, which is already the in-repo precedent. For the `onLater` guard, assert on a single identifier rather than a sliced window. Pay alongside the open `SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING` — same idiom, same root cause.
- **Priority:** medium
- **Status:** pending

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

## SURFACE-2026-07-29-QUALITY-WP3-KEBAB-CASE-CLAIM-UNTESTABLE
- **Severity:** MINOR
- **Location:** `src-tauri/src/config_store/settings.rs:145,192`
- **Finding:** The docs describe the enum as serializing kebab-case, but both variants are single words (`Acknowledged`→`"acknowledged"`), so `rename_all = "kebab-case"` is indistinguishable from `lowercase` here. The test named `workflow_invite_serializes_kebab_case_for_the_ts_union` asserts lowercasing, not kebab-casing.
- **Why it matters:** the **same overstated-assertion class this feature logged three separate times**. A future multi-word variant would be the first real exercise of the attribute, and the existing test name would already have claimed to cover it.
- **Suggested action:** rename the test to what it asserts, or note in it that kebab-casing is untested until a multi-word variant exists.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-29-QUALITY-WP3-STALE-SIBLING-TEST-NAME
- **Severity:** MINOR
- **Location:** `src-tauri/src/config_store/settings.rs:917-924`
- **Finding:** `workflow_features_independent_of_the_other_seven_fields` is misnamed (nine fields now); the correction lives six lines into an added comment rather than in the name.
- **Why it matters:** cosmetic, and the avoid-scope-creep argument for not renaming is defensible — noted only because this feature's own Discoveries flag misleading test names as a confabulation channel (a misnamed sibling already cost a wrong test in Phase 1).
- **Suggested action:** rename to what it asserts; pay with the related `SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION`, which is the same file and the same class.
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

## SURFACE-2026-07-20-QUALITY-WP7-STALE-COMPILE-GAP-TEST-COMMENT
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:434-497` (the WP7 gap-2 test block)
- **Finding:** The test block carries a stale compile-gap RED-phase comment ("This intentionally fails to COMPILE until the fix lands…") directly above the live post-fix restatement — now historically inaccurate (it compiles + passes).
- **Why it matters:** A future reader hits a contradictory comment pair.
- **Suggested action:** Trim the superseded RED-phase paragraph. Cosmetic.
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

# m10.5-wp2-active-close-confirmation — 2026-07-18

*(feature-review-quality on the uncommitted working-tree diff, HEAD `75ef6f8`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all cosmetic polish. Reviewer: "well-built… advances the codebase rather than accruing debt… no refactor pass warranted." None blocks; refactor-optional.)*

## SURFACE-2026-07-18-QUALITY-WP2-SEAM-DOC-FORWARD-REF
- **Severity:** MINOR
- **Location:** `src-tauri/src/cc_session/mod.rs:339` (Phase-3 `spawn_shell` doc note)
- **Finding:** The seam doc references `workflow/archive/m10.5-wp2-*` Phase 3 — a forward-reference that only becomes valid after `feature-finalize` archives the WIP (currently at `workflow/wip/`). Acceptable if finalize always archives (the convention), but the glob-with-wildcard pointer is softer than a concrete path; a reader grepping today won't find it. **NOTE: `feature-finalize` WILL archive the WIP to exactly `workflow/archive/m10.5-wp2-active-close-confirmation.md`, so this forward-ref resolves on finalize — likely self-closing; verify at finalize.**
- **Priority:** low
- **Pickup shape:** verify at finalize (the archive makes the glob valid); if a concrete path is wanted, one-line edit post-archive.

# m10-wp4-updater-user-control-ux — 2026-07-17

*(feature-review-quality on ship commit `ee7bad7`; Mode 3 autopilot. Originally 0 CRITICAL / 1 MAJOR / 3 MINOR. **3 RESOLVED by M10 WP6 Phase 1** — the MAJOR `ERROR-STATE-UNCONSUMED` [now consumed by `UpdaterStatusRow`], MINOR `MENU-CHECK-DISCARDS-OUTCOME` [manual-check feedback via `statusNoteForOutcome`], MINOR `FALLBACK-VS-ERROR-RACE` [reconciled under the single-post-install-surface invariant] — closed 2026-07-18 at `/product-finalize`, see CHANGELOG. 1 MINOR survives below.)*

## SURFACE-2026-07-17-QUALITY-WP4-FINISH-EMIT-ZEROES-DOWNLOADED
- **Severity:** MINOR
- **Location:** `src-tauri/src/updater/commands.rs` (~L184-193, `on_download_finish` emit)
- **Finding:** the finish emit sends `downloaded: 0, total: None, done: true`, zeroing the final cumulative byte count. Harmless (`progressPercent` short-circuits on `done` → 100), but reads as a lost value to a future maintainer.
- **Why it matters:** trivial cosmetic; the `done`-pins-100 comment exists, but the `downloaded: 0` reset is mildly surprising.
- **Priority:** low
- **Pickup shape:** carry the final `downloaded` through on the finish emit (or a one-line comment). Rides any future `updater/commands.rs` touch. Dismiss via the WIP's review section.

# m10-wp3-brew-detect-and-defer — 2026-07-17

*(feature-review-quality on the WP3 working-tree diff [uncommitted, on HEAD `2592b2d`]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all documentary/cosmetic, auto-backlogged. Reviewer verdict: "well-built, appropriately-scoped… advances the codebase and accrues no meaningful debt." NOTE: this WP's P1.5 doc-drift fold RESOLVED the two `m10-wp2-updater-core` findings below [WP2-LIBRS-INVOKE-COMMENT-STALE + WP2-CARGO-DEP-COMMENT-STALE] — those close at finalize.)*

## SURFACE-2026-07-17-QUALITY-WP3-SHORTCIRCUIT-TEST-PINS-SHAPE-NOT-ORDERING
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/commands.rs` (`homebrew_source_short_circuits_to_defer_with_no_available_version`, ~L196-211)
- **Finding:** The test reconstructs the `UpdateCheckResult` by hand rather than invoking `updater_check` (the `AppHandle` dependency makes a true command-level test awkward), so it pins the expected *shape* but not that `updater_check` actually orders the brew short-circuit BEFORE the network `check()`. That load-bearing invariant (Homebrew never hits the network) rests on code inspection + the live bridge verify-self, not the unit test. The limitation is honestly noted in the test comment.
- **Fix shape:** If/when the command layer becomes testable (a mockable updater seam, or a `tauri::test` harness), add a test asserting no network call fires for a Homebrew source. Otherwise accept as a documented structural limitation.
- **Why it matters:** the most load-bearing WP3 invariant is asserted by structure, not test — a future refactor of `updater_check`'s ordering could silently break the short-circuit.
- **Priority:** low.
- **Status:** pending.

# m9-wp7-deprecate-claude-time — 2026-07-16

*(feature-review-quality on the WP7 working-tree change [DOCS-ONLY resync: arch.md event-set/SQLite/deprecation Key Decisions + new "Milestone 9 architecture" section; CLAUDE.md Current-Milestone refresh; wbs.md pause-footer strip; runtimes.md build-observation]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer cross-checked every material architectural claim against source — all held. MINOR #1 [arch.md hook-schema omitted `source`/`prompt_length_chars`] was FIXED IN PLACE during review-quality [not backlogged], since it was a self-introduced one-line gap in the exact section under review. The 2 below are out-of-scope for WP7 — auto-backlogged.)*

## SURFACE-2026-07-16-QUALITY-WP7-WBS-FRONTMATTER-STALE
- **Severity:** MINOR
- **File:** `docs/product/wbs.md` (frontmatter, ~L5)
- **Finding:** After WP7 completed, the wbs.md frontmatter still reads `updated: 2026-07-15`, `state: complete`, and a comment "Only WP7 … remains for M9" — now stale (WP7 is done). The WP7 diff correctly only stripped the resolved session-pause block; the frontmatter/roadmap resync + WBS archival is deferred to `/product-finalize` by design.
- **Fix shape:** `/product-finalize` sweeps this when it closes the M9 cycle (bumps `updated:`, archives the WBS to `docs/product/archive/milestone-9-time-analytics/`). No standalone action needed — flagged so finalize doesn't skip it.
- **Priority:** low.
- **Status:** pending (expected to resolve at `/product-finalize`).

## SURFACE-2026-07-16-QUALITY-WP7-CLAUDEMD-WP2-WIREFIELD-COUNT
- **Severity:** MINOR
- **File:** `CLAUDE.md` (Current Milestone, WP2 status line, ~L162)
- **Finding:** The unchanged WP2 status line says "10-event hook + **5 wire fields**"; the actual new-field count is 6 (`prompt_length_chars`, `tool_name`, `tool_use_id`, `agent_type`, `source`, `reason`). Pre-existing WP2-era text (not introduced by the WP7 diff), but the WP7 M9-complete resync was the natural moment to correct it.
- **Fix shape:** one-word edit "5 wire fields" → "6 wire fields" in the WP2 status line; fold into the next CLAUDE.md touch or `/product-finalize`'s durable-doc resync.
- **Priority:** low.
- **Status:** pending.

# m9-wp6b-2-week-month-sidepanel-range (Phase 4) — 2026-07-14

*(feature-review-quality on the WP6b-2 Phase-4 working-tree change [SidePanel + click-to-select seam; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — both auto-backlogged [low]. Reviewer: clean, well-disciplined render-surface port; no refactor warranted. Both MINORs are polish/awareness, not correctness.)*

## SURFACE-2026-07-14-QUALITY-WP6B2P4-CLEAR-PIN-NOT-SCOPED
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/__tests__/dashboardWiring.test.ts` (the WP6b-2 P4 "clears it on view-switch, day-change, and close" pin)
- **Finding:** The pin asserts `setSelectedSegId(null)` appears (bare whole-file substring) + `onCloseSidePanel={() => setSelectedSegId(null)}` once, but does NOT distinguish the `changeView` clear from the `changeDay` clear (both are bare `setSelectedSegId(null)` lines). A regression that dropped the clear from *one* of `changeView`/`changeDay` would still leave the substring present → the pin passes silently.
- **Fix shape:** assert the `setSelectedSegId(null)` clear within each handler's source slice (`changeView` block + `changeDay` block separately), the way the Day-view-only pin already slices the `WeekView`/`MonthViewContainer` blocks to assert `<SidePanel>` is absent from each. One-test tightening.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-14-QUALITY-WP6B2P4-WALLTIME-QUANTIZATION-BASIS
- **Severity:** MINOR (doc/awareness only)
- **File:** `src/components/workspace/dashboard/SidePanel.tsx` (L65 `wallTime = Math.max(0, session.end - session.start)`)
- **Finding:** `wallTime` uses the minute-quantized session endpoints, so the "active of Xh Ym wall" denominator + the mini-timeline seg span are on a MINUTE grid, while the numerator (`sumActive`) is true-`dur_ms`. For a sub-minute session this reads "0m active of 0m wall". This is FAITHFUL + internally consistent for POSITIONING (the mini-timeline positions legitimately live on the minute grid, matching the main timeline's `viewportPct`), NOT a defect.
- **Fix shape:** none needed. Recorded only so a future reader doesn't "fix" the mini-timeline to a `dur_ms` basis + break the wall-relative layout (the positions MUST stay on the minute grid to align with the main timeline). If the wall FIGURE (not the positions) ever needs sub-minute precision, sum `dur_ms` across the session's segs for the denominator label only — but leave the positioning math alone.
- **Priority:** low (awareness; likely a no-op / won't-fix).
- **Status:** pending.

# m9-wp5-tracking-toggle — 2026-07-08

*(feature-review-quality on the WP5 working-tree diff [uncommitted per commit-only-when-asked; HEAD `6bdca6f`]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — all auto-backlogged, priority low. Reviewer: well-built, low-risk feature — faithful mirror of the pip_mode/cc_permission_mode trio, single-hook-point gate discipline held, drain-safety degrade-to-OFF tested at the seam, event-name contract pinned both IPC sides. The 2 MINORs are an intrinsic auto-tier blind spot + a naming footgun.)*

## SURFACE-2026-07-08-QUALITY-WP5-GATE-BODY-APPHANDLE-HOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`tracking_enabled(app)` ~1088-1094)
- **Finding:** The gate's own body — the `resolve_data_dir(app)` → `read_time_tracking_enabled(&dir).unwrap_or(false)` hop — is not unit-covered. Every gate test exercises `read_time_tracking_enabled` directly ("same code path, minus the app→dir hop"); the hop itself (the one line WP5 added to the gate) is proven only at bridge verify-self. A regression in the resolve-then-read wiring (e.g. a wrong data-dir resolver) would pass the auto-tier suite.
- **Fix shape:** intrinsic AppHandle-constructability constraint — a unit test can't build an AppHandle. Options: (a) accept it (live verify-self covers it, as done); (b) if a future test-seam for AppHandle-bound commands materializes, add a gate-body test then. No action needed now; on record so the blind spot is known.
- **Priority:** low (live-verified; auto-tier blind spot only).
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

# m5-wp5-pip-toggle-lifecycle-autosummon — 2026-06-27

*(feature-review-quality on ship commit f6e3929; Mode 3 autopilot auto-backlog. 0 CRITICAL / 2 MAJOR / 2 MINOR.)*

## SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE
- **Severity:** MINOR
- **Finding:** `RightPanelHost.tsx:136-159` — the `pipMode` state + `pip_get_mode` fetch + `pip-mode` listener are duplicated per RightPanelHost instance (one per mounted workspace), so at N workspaces there are N redundant IPC fetches + N subscriptions for one app-global value. The inline comment acknowledges it's "fine per-RightPanelHost," but it's avoidable at the N>1 the milestone targets.
- **Fix shape:** lift `pipMode` to App-level state (fetched + subscribed once), passed down as a prop — mirroring how `tiles` is derived once in App. Low effort.
- **Priority:** low.
- **Status:** pending — DEFERRED at debt-paydown WP4 (operator, 2026-06-30), anchored to **M9**. The per-`RightPanelHost` `pip-mode` subscription is the project's INTENDED "all surfaces subscribe to the same backend broadcast" pattern (PiP mode is already an app-global View-menu radio, backend = single source of truth via `pip_set_mode`/`pip_get_mode` + the `pip-mode` event), not a missing-app-state bug — the only real cost is N-1 redundant `pip_get_mode` mount fetches. M9's time-tracking toggle follows the same backend-command + `*-mode`-broadcast + per-consumer-subscribe shape, so there is no shared app-settings store to build once-vs-twice. Fold the dedup into M9's settings work IF an app-settings hook materializes there; else it stays the documented pattern.

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

# m9-fix-minute-quantization-ai-doing — 2026-07-13

*(feature-review-quality on the working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 1 MAJOR / 2 MINOR — all auto-backlogged. Reviewer: well-built, appropriately-scoped; contract-additive `dur_ms` fix, precision-disciplined [sum ms, round once], anti-pattern signposted at the type def + both sum sites, discriminating repro tests. Only real gap: a THIRD copy of the fixed `end - start` anti-pattern in a sibling file the blast-radius analysis missed. No refactor auto-invoked — MAJOR is a same-pattern follow-up on a lower-susceptibility kind, not a CRITICAL.)*

## SURFACE-2026-07-13-QUALITY-MINQUANT-HELPER-PARITY-UNPINNED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`ms_to_minutes_round`) + `src/components/workspace/dashboard/kinds.ts` (`msToMinutesRound`)
- **Finding:** The FE/BE round-half-up helpers are an intentional documented mirror, but no single test asserts they AGREE on the same inputs — each is pinned independently (Rust `ms_to_minutes_round_is_round_half_up_and_zero_clamped`, FE sub-minute pin). The 30_000ms pivot + formula are duplicated in 3 places (2 helpers + WIP prose). Parity is currently correct + both sides pinned, so not a bug — a latent drift channel (change one pivot, no test fails on the divergence).
- **Fix shape:** a shared input→output fixture table asserted on both sides.
- **Priority:** low.
- **Status:** pending.


# m10.9-wp2-workflow-features-gate — 2026-07-28

*(feature-review-quality against ship commit `467593f`; Mode 3 autopilot. 0 CRITICAL / 4 MAJOR / 4 MINOR. **One MAJOR is NOT listed here — it was a live StrictMode double-write defect in `useSettingControl` and was fixed immediately rather than backlogged; see the WIP's `## Code-Quality Review`.** Reviewer: "well-built work that clears the bar the milestone set… the debt is concentrated in two places: the `?raw` idiom still doing load-bearing work despite this feature paying twice to learn it can't, and the (now-fixed) side-effect-in-updater.")*

## SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING
- **Severity:** MAJOR
- **Location:** `src/components/settings/__tests__/settingsPanelWiring.test.ts:38-84`
- **Finding:** ~10 assertions are `?raw` source-text greps against `App.tsx` for formatted multi-line fragments (`"escDismissTarget({"` plus two property lines, `"showSettingsRef.current = showSettings"`). Prettier-fragile by construction.
- **Why it matters:** This is exactly the shape that broke **twice** during this feature — once passing while the behavior was broken (the Esc-ordering bug), once silently un-matching after Prettier reflowed the file (`dashboardWiring.test.ts`). The behavior is already covered behaviorally by `escDismiss.test.ts`, so these structural pins are net cost, not net coverage. The test file's own comment says a source guard "must not be trusted to verify RUNTIME" — and then leans on ten of them.
- **Suggested action:** delete the fragment-matching assertions, keep only the coarse ones that survive a reformat (single identifiers, not multi-line expressions). Consider a repo-wide convention note: `?raw` guards may assert single identifiers only, never formatted expressions.
- **Priority:** medium
- **Status:** pending
- **⚠️ Corroborated a THIRD time, 2026-08-01** (repair (A), the `format:check` sweep — commit `64e212f`). This finding cited `dashboardWiring.test.ts` as one of the two prior breakages; **that same file broke again**, along with `settingsUpdateNotificationsWiring.test.ts`, when a 35-file Prettier sweep re-wrapped the source they grep. Both were **false negatives** — the pinned logic was byte-identical, only re-wrapped. Two things this adds to the case: (1) the failure mode *reads backwards* — a red suite right after a formatting change looks like the change broke behavior, when in fact the guards had been pinning formatting incidentally and were never verifying what they claimed; (2) **the prediction is now empirical**: these guards do not merely *risk* rotting, they rot on the first reformat that touches their target. The two files repaired there are the in-repo precedent for the fix shape — assert the imported const's **value**, or assert **whitespace-normalized single tokens** — and both repairs were mutation-proven to bite AND to survive re-collapsing the source to one line, which is the property the old forms lacked. **This finding's own two named files (`workflowInviteCopy.test.ts`, `settingsPanelWiring.test.ts`) are still untouched and still fragile** — verified at close: the `slice(at` pattern (3 occurrences) and the `escDismissTarget({` fragment grep both remain. Nothing here is resolved; the case for paying it is just stronger.

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

## SURFACE-2026-07-28-QUALITY-WP2-MILESTONE-RATIONALE-RESTATED-SIX-TIMES
- **Severity:** MINOR
- **Location:** `workflow_gate/mod.rs`, `workflow_gate/commands.rs`, `config_store/settings.rs` (field doc), `lib.rs` (mod decl), `state/workflowGate.ts`, `state/useWorkflowFeaturesEnabled.ts`
- **Finding:** The milestone rationale ("applicability, not audience size", the two invariants, the design-prior slug) is restated in near-identical form in ~6 places. Comment-to-code ratio in the smallest new modules runs 65–95% (`workflow_gate/mod.rs` is 36 comment lines over 2 lines of code).
- **Why it matters:** Much of it is genuine WHY and worth keeping, but six copies must be updated together — a drift surface rather than a gift.
- **Suggested action:** state it once at the owning module (`workflow_gate/mod.rs`) and point at it from the others.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-28-QUALITY-WP2-ALLOWLIST-TEST-HALF-TAUTOLOGICAL
- **Severity:** MINOR
- **Location:** `src/state/__tests__/offInvariantGuard.test.ts:150-176`
- **Finding:** `the allowlist grants exact paths, never a directory prefix` builds a hand-copied `ALLOWED_SAMPLE` duplicating the real `ALLOWED` array, then asserts three invented paths aren't in the copy — testing the literal it just wrote.
- **Why it matters:** The `expect(guardSrc).toContain("!ALLOWED.includes(rel)")` half does real work; the `ALLOWED_SAMPLE` half is tautological and will drift from the real list.
- **Suggested action:** drop the `ALLOWED_SAMPLE` half, or export the real `ALLOWED` array and assert against that.
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

# m10.9-wp3.5a-sandbox-install-wizard — 2026-07-29

Review against ship baseline `bc15ae6..a6fb194`. **2 CRITICAL + 3 MAJOR were FIXED in the refactor
pass (`b95466f`)** and are recorded in the WIP's `## Code-Quality Review` → "Refactor resolution",
not here. This section holds only what was deliberately NOT addressed.

## SURFACE-2026-07-29-QUALITY-WP3.5A-CLONE-DIR-NAME-DUPLICATED
- **Source:** feature:review-quality (m10.9-wp3.5a), MINOR
- **Type:** tech-debt
- **Summary:** `CLONE_DIR_NAME` exists twice — a Rust const in `workflow_install/mod.rs:92` and a TS const in `WorkflowInstallWizard.tsx:36` — with a comment acknowledging the coupling.
- **Context:** Not a defect today; blast radius is a Browse-picked path disagreeing with the backend default. But the mitigation is one line: `workflow_install_default_location` already crosses the IPC boundary and returns the full path, so the wizard could take the directory name from that seeded value's basename and drop the constant entirely.
- **Suggested action:** derive the basename from the seeded default instead of hardcoding; removes a documented drift channel rather than documenting it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-29-QUALITY-WP3.5A-PROVENANCE-FETCH-DUPLICATED
- **Source:** feature:review-quality (m10.9-wp3.5a), MINOR
- **Type:** tech-debt
- **Summary:** `SettingsPanel.tsx:255-270` — `refreshProvenance` and the mount effect duplicate the same `invoke("workflow_install_state").then().catch()` body verbatim; the effect adds only a `cancelled` guard.
- **Context:** Two copies of one fetch means a change to error handling has to be made twice.
- **Suggested action:** have the mount effect call the memoized callback, keeping only the `cancelled` guard around it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-29-QUALITY-WP3.5A-DEFEAT-NARRATIVE-IN-TEST-COMMENT
- **Source:** feature:review-quality (m10.9-wp3.5a), MINOR
- **Type:** tech-debt
- **Summary:** `terminal.rs:386-471` — a 45-line comment narrating three successive failed formulations of `the_table_covers_every_error_variant` is longer than the test and its fixture combined.
- **Context:** The honesty is right and the lesson is already captured in the backlog in full; the **placement** is wrong. A future reader has to consume a defeat narrative to learn what the test currently checks.
- **Suggested action:** cut to a two-line pointer at the SURFACE entry; keep the "must be values, not name strings" warning inline since that one is load-bearing for anyone editing the fixture.
- **Priority:** low
- **Status:** pending

# m11.5-wp4-chord-arm-content-selector — 2026-08-01

*(feature-review-quality against ship commit `0bac2c6`; Mode 3 autopilot. 0 CRITICAL / 3 MAJOR / 4 MINOR. **All 3 MAJOR were independently re-verified by the orchestrator before backlogging** — each reproduced by probe, not accepted on report. Reviewer verdict: "a careful, well-evidenced fix to a proven defect… Where it falls short is in how far it claims to have gone." The scheduled hole (`panelHost.ts`) IS genuinely closed; these findings are about residual reach, and all fail SAFE relative to the pre-fix state.)*

## SURFACE-2026-08-01-QUALITY-WP4-CHORD-SELECTOR-MISSES-EXPORT-FORMS
- **Severity:** MAJOR
- **Location:** `src/state/__tests__/offInvariantGuard.test.ts:104-108` (`exportsChordIdentifier`)
- **Finding:** The predicate matches only four export forms (`function`/`const`/`interface`/`type`). **Verified by probe:** `export default function docsChord`, `export async function docsChord`, `export class DocsChordHandler`, `export let docsChord`, `export enum ChordKind`, and `export { docsChord }` **all return false**.
- **Why it matters:** ⚠️ **This is the same blind-spot class WP4 was chartered to close, relocated from filename shape to declaration keyword.** Not theoretical: `export default function` / `export async function` are live idioms in **14 non-test files** in this repo (e.g. `updaterPrefs.ts:52`, `workflowGate.ts:36`). A future `export default function docsChord` would sail past exactly as `panelHost.ts` did — and the arm is schedule-critical precisely because M11's Docs chord is the next thing to land.
- **Suggested action:** widen to cover `default`, `async`, `class`, `let`, `enum`, and re-export braces — then **mutation-prove each added form individually** (per the method that found the original hole), not as one composite.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-01-QUALITY-WP4-SELECTOR-IS-NAME-NOT-CONTENT
- **Severity:** MAJOR
- **Location:** `src/state/__tests__/offInvariantGuard.test.ts:104`; framing at :46 + :83, and the WIP/commit message
- **Finding:** The predicate is a **name** test applied to identifiers, not a content/behavior test. The header says "ARM SELECTION IS BY CONTENT, NOT FILENAME", but the mechanism is "does an exported symbol's *name* contain `Chord`". **Verified by probe:** `export function openDocsPanel(e) { return e.metaKey && e.key === "k" }` — a real ungated docs chord whose module never uses the word "Chord" — is **not selected**.
- **Why it matters:** the root cause (reach depends on a naming convention nobody is obliged to follow) survives; what changed is *which* convention. The reach gain is real and the proven miss IS closed (12→15), but the docs oversell it as a category change, and a reader trusting "by content" will over-trust the arm at exactly the M11 moment it must fire.
- **Suggested action:** cheapest honest fix is **re-word** the header/doc/WIP framing to "selected by exported-identifier name, not filename" (accurate, and preserves the real lesson). A true content predicate (detect a chord-shaped keyboard read) was **explicitly rejected during WP4's plan-time audit** because it drops `closeTerminalChord.ts` — so any behavior-based attempt must be a UNION with the name test, never a replacement.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-01-QUALITY-WP4-ARM-GUARDS-PREDICATES-NOT-REGISTRATION
- **Severity:** MAJOR
- **Location:** `src/state/__tests__/offInvariantGuard.test.ts:192-204` (the chord arm)
- **Finding:** The arm guards chord **predicate** modules, not chord **registration** sites. **Verified by probe:** `App.tsx` (**3** `keydown` listeners), `Workspace.tsx` (1), and `RightPanelHost.tsx` (1) are each **NOT selected** by the arm under either the old or the new selector.
- **⚠️ SEVERITY CORRECTED DOWN 2026-08-01 (M11 arch back-loop) — read this before acting on the text below.** The mechanism claim is correct, but the severity was overstated, including by this repo's own M11.5 close notes ("the next `panelHost.ts`"). **Measured across every non-test keydown registration site in `src/`: 13/13 delegate to a predicate module, ZERO inline chord matching** (the only two inline `e.key ===` comparisons are `"Escape"` dismissals in `App.tsx` and `PickerOverlay.tsx`). Unlike `panelHost.ts` — a **live, existing, proven** miss — this gap is **conditional on a future author first breaking a 13/13 convention**. Two further mitigations: the panel arm is an independent second net (a Docs panel cannot reach the user without appearing in `AVAILABLE_PANELS`, whose computation M11 itself guards), and a chord with no panel is a chord to nowhere. **Deferred past M11 by decision** — M11's Docs chord lives in a predicate module, which the convention makes the path of least resistance anyway.
- **⚠️ SUGGESTED ACTION REVISED:** when paid, the right shape is **NOT a sixth arm** scanning handler bodies for gated-ness. It is a **convention guard**: assert that no registration site performs inline chord matching. That protects the very property which makes the existing predicate-module arm sufficient, and is a far smaller change. See `arch.md` → "Revision 2026-08-01 — M11 architecture" → Decision 2.
- **Why it matters (original text, severity now superseded above):** The seam contract explicitly forbids "registered-with-a-no-op-handler", and registration is where a keystroke actually gets swallowed — yet that half is unguarded. An M11 Docs chord written inline in a `useEffect` keydown handler (the shape already used in those files) is entirely invisible to this arm. **This is the next `panelHost.ts`**: a proven-shaped gap that will otherwise be found by the same probe-individually method *after* M11 lands rather than before.
- **Suggested action (original — superseded by the REVISED action above):** add a sixth arm that scans **keydown-listener registration sites** for ungated workflow-coupled handlers. ~~Strongly consider paying this BEFORE M11~~ — **the before-M11 urgency is WITHDRAWN** (M11 arch back-loop, 2026-08-01): the 13/13 convention measurement shows this is not the same risk class as the basename selector, which was a proven live miss.
- **Priority:** low *(was medium — corrected 2026-08-01 on measured evidence)*
- **Status:** pending

## SURFACE-2026-08-01-QUALITY-WP4-MINOR-CLUSTER
- **Severity:** MINOR (4 findings)
- **Location:** `src/state/__tests__/offInvariantGuard.test.ts`
- **Findings:**
  1. **`:105` — the `i` flag re-admits laxity the same file documents as a mistake.** Verified: `unchorded`, `CHORD_MAP`, `chordata` all match. `namesWorkflowTerm` (`:140`) deliberately avoids `i` because it re-admitted `docstring`. Harmless today and **fails safe** (false positives only widen the candidate set), but it contradicts a lesson recorded two functions away. Cheap to drop.
  2. **`:389-395` — the `>= 13` floor tolerates a 2-module (13%) shrink** while the test is named "does not shrink". The four explicit `toContain` assertions above already cover specific shrinkage better, so the floor's marginal value is against a drop it permits.
  3. **`:408-439` — the composition is untested end-to-end.** The `isUngatedWorkflowChord` fixtures never flow through `exportsChordIdentifier`/`chordModules`, so the select-then-filter seam relies on the reach test + the arm's own emptiness. Also `gatedDocsChord` passes only because its import line contains `useWorkflowFeaturesEnabled` — true of any file merely mentioning the hook.
  4. **Comment repetition (~4:1 ratio in new material).** The probe-5b provenance is narrated **four times** with escalating detail across header, both helper docs, and the tests. Heavy commenting is defensible for a load-bearing guard; the *repetition* is not — duplicated rationale rots asymmetrically, and this WP already had to fix one stale comment for that exact reason.
- **Priority:** low
- **Status:** pending

# m11-wp5-milestone-exit-verify — 2026-08-02

*Reviewer: `code-quality-reviewer` against ship baseline `0951d2d`. 0 CRITICAL / 2 MAJOR / 2 MINOR.
**All four were FIXED IN PLACE** — MAJOR-1 was a demonstrated silent-pass hole in a guard written
minutes earlier, MAJOR-2 re-inflated comment density, and both MINORs were stale/over-claiming
comments. Only the reviewer's forward-looking observation is carried below.*

## SURFACE-2026-08-02-QUALITY-WP5-COMMENT-DENSITY-NEEDS-A-BUDGET-NOT-A-TRIM
- **Source:** feature:review-quality (m11-wp5)
- **Target level:** feature (the next touch of `DocsPanel.tsx`)
- **Type:** tech-debt (readability, process)
- **Summary:** `DocsPanel.tsx` comment density has now been flagged **four consecutive reviews**
  (WP2 → WP3 → WP4 → WP5). WP5 trimmed its two named offenders **and still shipped at 48%** because
  the new `settled` documentation was itself larger than the blocks it replaced; a post-review prune
  brought it to **46% / 650 lines** with all 25 ⚠️ markers intact. The reviewer's judgment is that
  per-WP trimming is not converging: *"the carry needs a density **budget**, not another trim pass."*
- **Context:** This is not aesthetics. WP4's reviewer judged it **functional** because both genuine WP4
  defects sat inside the densest region — and WP5 then had its **P2.1 live experiment misdesigned by
  stale prose in that same region** (a header described the deferred arm's motivating case as one the
  skip-while-hidden gate makes impossible). Two milestones have now paid real time to this file's prose.
- **Suggested action:** Adopt an explicit rule rather than another sweep. Candidates: (a) a density
  ceiling for this file enforced by a test (it already has `docsPanelStyles`/wiring guards, so the
  mechanism exists); (b) a hard convention that **process/provenance narration lives in the WIP and
  only invariants + forbidden shapes live at the code** — WP5 applied this by hand and it worked, so
  codifying it is cheap; (c) split `DocsPanel.tsx` (650 lines, 4 IPC call sites) so no single file
  carries this much coordination. ⚠️ Do NOT strip ⚠️-marked invariants — those are the ones that
  stopped real regressions.
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

# m12-wp2-unclean-flag-lifecycle — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP2-DEAD-CODE-ALLOWS-SURVIVE-CLOSE
- **Severity:** MAJOR (deferred with reason, not dismissed)
- **Location:** `src-tauri/src/session_state/mod.rs` (10 sites)
- **Finding:** Ten `#[allow(dead_code)]` attributes survive at WP2 close, against the module header's own stated rule ("if any attribute still survives at WP2 close, that item has no caller and the honest question is whether it should exist at all") and against the ship commit's claim that `consume` is "the single attribute expected to survive." Nine others (`SESSION_STATE_FILE`, `SESSION_STATE_TMP_FILE`, `SessionStateMap`, `read`, `write`, `set`, `clear`, `is_unclean`, `is_unclean_on_disk`) are reachable only from `#[cfg(test)]` code and the two persist wrappers.
- **Why it matters:** The per-item-allow discipline is a real improvement over the `workflow_install` blanket allow it was modelled against — but the discipline only works if retirement happens. The module wrote its own tripwire, the tripwire fired, and it was not acted on: better mechanism, currently identical outcome.
- **Deferred because:** the honest fix is a judgment call on the retirement horizon (`#[cfg_attr(not(test), allow(dead_code))]` · mark test-only helpers · restate the horizon as WP3), and **WP3 wires `read`, `is_unclean`, `is_unclean_on_disk`, and `consume` within days**. Churning now to re-churn at WP3 is motion, not progress.
- **Trigger:** WP3 close — at that point most consumers exist, so whatever attributes still remain are the genuinely questionable ones.
- **Priority:** medium
- **Status:** pending
