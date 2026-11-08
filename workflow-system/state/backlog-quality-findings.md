# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# recycle-at-clean-boundaries — 2026-11-08

*(feature-review-quality on ship commit `b999081`, window `b999081^..b999081`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 3 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-08-QUALITY-WP9-RECYCLE-HISTORY-NARRATED-IN-FOUR-SITES
- **Severity:** MAJOR
- **Location:** `src/state/supervisor/verdict.ts` (the `RECYCLE_BOUNDARY_EDGES` doc), `src/state/supervisor/wipPhases.ts` (`atNonFinalPhaseBoundary` doc), `src/state/supervisor/__tests__/verdict.test.ts` (the mid-phase `it.each` comment), `src/state/supervisor/__tests__/activityFunnel.test.tsx` (the MID-PHASE test comment); plus `arch/workflow-supervisor.md` §E.
- **Finding:** the same history ("before WP9 every Phase 2+ fire recycled; all four field recycles were on F8/F10") is restated in four code/test sites as well as arch §E. `singleAuthority.test.ts` matches exact phrases only, so these paraphrases pass it.
- **Why it matters:** the comment-budget rule (`docs/lessons/source-text-guards.md`) puts what a previous version did in the WIP/archive and states a rationale once. WP14 consolidated exactly this pattern two commits earlier; four copies drift as soon as the boundary set is tuned.
- **Suggested action:** make arch §E the one home for the history and the measurement; cut the code comments to the invariant (F15 only; the WIP check is a second guard) with a pointer to §E. Optionally add a `once` rule to `singleAuthority.test.ts` for the field-recycle sentence.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-08-QUALITY-WP9-TEST-COMMENTS-USE-OLD-CONDITION-NUMBERS
- **Severity:** MINOR
- **Location:** `src/state/supervisor/__tests__/verdict.test.ts`, the recycle-branch describe ("Condition 1 falsified, other two held", "Condition 2 falsified", "satisfy the OTHER two conditions", "Condition 3 falsified").
- **Finding:** the `recycleTokens` doc now numbers the conditions 1 = edge, 2 = threshold, 3 = feature, 4 = WIP boundary, so each of these comments is off by one.
- **Why it matters:** stale cross-references that read as authoritative.
- **Suggested action:** renumber, or name the condition instead of numbering it ("threshold falsified").
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-08-QUALITY-WP9-BOUNDARY-SET-IS-STRING-TYPED
- **Severity:** MINOR
- **Location:** `src/state/supervisor/verdict.ts`, `RECYCLE_BOUNDARY_EDGES: ReadonlySet<string>`.
- **Finding:** edge-ID validity is checked only by a runtime test (AC-5), not by the type.
- **Why it matters:** acceptable today because the guard exists; a typo fails in `vitest`, not `tsc`.
- **Suggested action:** if edge IDs ever become a literal union type, type the set with it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-08-QUALITY-WP9-DOCSTRING-CARRIES-A-DATE
- **Severity:** MINOR
- **Location:** `src/state/supervisor/verdict.ts`, the `RECYCLE_BOUNDARY_EDGES` doc ("M16.5 WP9, 2026-11-07").
- **Finding:** provenance in a code comment (and a day off the commit date).
- **Why it matters:** the comment-budget rule moves provenance out of code; folds into the MAJOR's fix.
- **Suggested action:** drop the date when the MAJOR is addressed.
- **Priority:** low
- **Status:** pending

# paydown-2026-11-04-wp14-comment-convention-pass — 2026-11-07

*(feature-review-quality on ship commit `20930c3`, window `20930c3^..20930c3`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 5 MINOR, all auto-backlogged; each claim re-checked against the source before filing.)*

## SURFACE-2026-11-07-QUALITY-WP14-ABSENT-RULES-MATCH-RAW-CASE-SENSITIVE-TEXT
- **Severity:** MAJOR
- **Location:** `src/__tests__/singleAuthority.test.ts`, the `absent` branch of the rule loop (and the header's "WHAT THIS DOES NOT CHECK" paragraph).
- **Finding:** `absent` rules match `readFileSync(...)` raw text with `new RegExp(rule.pattern.source, "g")`, so (a) a label wrapped across two comment lines evades every multi-word pattern (`paydown WP\d`, `WP\d+ Phase \d`, `verified live at P\d`, `this WP`); (b) matching is case-sensitive, so `(Paydown WP7,`, which `recycleSession.ts` actually carried at `20930c3^`, gives 0 matches; and (c) rebuilding from `.source` DISCARDS the pattern's own flags, so adding `i` to a pattern would be silently dropped too. The header says matching is "comment leaders stripped, whitespace collapsed", which is only true of the `once` rules.
- **Why it matters:** a guard that reports green on exactly the label forms it was written to exclude (`source-text-guards.md`'s green-while-checking-nothing shape), with a header claiming more than it checks.
- **Suggested action:** match `absent` patterns against the same normalized haystack the `once` rules use (`textOf(f)`), build the RegExp with `rule.pattern.flags` merged with `g` (and `i`), and add a wrapped + capitalized control. Or, at minimum, correct the header.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-07-QUALITY-WP14-ABSENT-RULES-HAVE-NO-PERMANENT-POSITIVE-CONTROL
- **Severity:** MINOR
- **Location:** `src/__tests__/singleAuthority.test.ts`, the `absent` rules table.
- **Finding:** nothing asserts that each `pattern` matches a known example label (e.g. `"P3 verify-self"`, `"(Paydown WP7,"`). The mutation proof ran once at build time; a later edit that breaks a pattern (bad escape, narrowed alternation) keeps passing.
- **Why it matters:** an `absent` rule with a broken pattern is indistinguishable from a clean file.
- **Suggested action:** one example string per rule, asserted to match in the meta block. Pairs naturally with the MAJOR above.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-07-QUALITY-WP14-GUARD-HEADER-OVERCLAIMS-COPY-PASTE-ORIGIN
- **Severity:** MINOR
- **Location:** `src/__tests__/singleAuthority.test.ts` header ("It stops copy-paste regrowth, which is how every instance in the WP14 roster arose").
- **Finding:** the WIP build record says two roster rules (chord map, do-not-merge) "pass at HEAD by construction": those duplicates were paraphrases, so their `once` halves never matched a real duplicate.
- **Why it matters:** an overclaim in the very paragraph meant to prevent overclaiming.
- **Suggested action:** "most instances" plus a note that the two paraphrase rules guard regrowth only.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-07-QUALITY-WP14-BARE-DIGIT-FINGERPRINTS
- **Severity:** MINOR
- **Location:** `src/__tests__/singleAuthority.test.ts`, the corpus-drift rule's `"2282"` / `"2284"` fingerprints.
- **Finding:** bare digit runs matched with `includes` and no boundary; any unrelated number containing them (`122824`, a future count or timestamp) trips the rule.
- **Why it matters:** fails loudly, not silently, but brittle.
- **Suggested action:** anchor on a phrase such as `2282 → 2284`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-07-QUALITY-WP14-WORKFLOW-GATE-POINTER-MISSES-THE-TERMS-GAP
- **Severity:** MINOR
- **Location:** `workflow-system/product/arch/workflow-gate.md` (the "guard's mechanics live in its own header" paragraph).
- **Finding:** the pointer says `offInvariantGuard.test.ts`'s header holds the `WORKFLOW_TERMS` vocabulary gap (recycle/session), but the header mentions `WORKFLOW_TERMS` only for the drive-mode terms; the gap appears only as a SURFACE id in an arm comment.
- **Why it matters:** nothing is lost (the arch paragraph restates the gap), but the pointer points at the wrong place.
- **Suggested action:** point at the arm comment, or move the gap statement into the header.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-07-QUALITY-WP14-COMMENT-BUDGET-DOES-NOT-NAME-THE-GUARD
- **Severity:** MINOR
- **Location:** `docs/lessons/source-text-guards.md`, the comment-budget section.
- **Finding:** it says "state it once … every other site a pointer" but never mentions `singleAuthority.test.ts`, so an author creating a new canonical home is not told to add a rule.
- **Why it matters:** new duplication is only guarded if someone already knows the table exists.
- **Suggested action:** a one-line pointer to the guard.
- **Priority:** low
- **Status:** pending

# paydown-2026-11-04-wp13-settings-split-and-picker-row — 2026-11-06

*(feature-review-quality on ship commit `0e7c138`, window `fea480e..0e7c138`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 4 MINOR, all auto-backlogged; finding 1 re-checked against the source before filing.)*

## SURFACE-2026-11-06-QUALITY-WP13-PICKER-LIVE-TESTS-HAVE-NO-SHARED-HARNESS
- **Severity:** MINOR
- **Location:** `src/components/picker/__tests__/*Live.test.tsx` (five files, two of them new in WP13); `pickerRowCallbacksLive.test.tsx` writes out the native value-setter idiom three times.
- **Finding:** each live picker test rebuilds the createRoot + mockIPC + act + afterEach scaffolding. The workspace has a shared harness (`liveWorkspace.tsx`); the picker has none.
- **Why it matters:** a new mount-time IPC command means five edits, and the next live test copies again.
- **Suggested action:** a small `livePicker.tsx` (mount with a projects/announce/profiles fixture, gate-via-broadcast, `setNativeValue`), then migrate the five files.
- **Priority:** low
- **Status:** pending

# paydown-2026-11-04-wp4-run-lock-and-sync-guard — 2026-11-04

*(feature-review-quality on ship commit `190b3a2`, window `00ebf92..190b3a2`; drive_mode=autopilot. 1 MAJOR + 4 MINOR auto-backlogged.)*

## SURFACE-2026-11-04-QUALITY-WP4-PROCESS-GROUP-PRIMITIVES-DUPLICATED
- **Severity:** MAJOR
- **Location:** `src-tauri/src/workflow_install/runner.rs` (`StopOnDrop`, `DRAIN_GRACE`, `kill_group`, `kill_and_reap`) vs `src-tauri/src/adjudicator/mod.rs` (`StopOnDrop`, `DRAIN_GRACE`, `kill_tree`).
- **Finding:** The process-group primitives are copied rather than shared: an identical `StopOnDrop` struct and Drop body, the same 250 ms grace, and the same group-SIGKILL → kill → reap sequence. Not reusing `Drain` itself is justified, because `Drain` is a capped byte buffer and `run_streaming` needs live per-line delivery to a sink. The primitives beneath it are not.
- **Why it matters:** There are two kill-and-reap implementations, and only the adjudicator documents its limits. Its "does NOT do" list (a grandchild that `setsid`s or uses job control escapes the group kill) applies to the runner too, unstated. A future fix, such as descendant tracking, will land in one copy only.
- **Suggested action:** A small shared module (process-group spawn, `kill_group`, `kill_and_reap`, `StopOnDrop`, the grace constant, and the limits doc). Do it before a third subprocess runner appears.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-GRACE-PATH-DROPS-QUEUED-OUTPUT
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `run_streaming`, the grace-expiry arm.
- **Finding:** The grace-expiry arm calls `kill_group` and breaks without draining lines still queued in `rx`, while the deadline arm drains with `try_recv`. Each loop pass consumes one line, so a burst still in the channel when the grace ends is lost.
- **Why it matters:** The two kill exits handle in-flight output differently.
- **Suggested action:** The same three-line `try_recv` drain before the break, with a test that emits a burst then backgrounds a pipe holder.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-RUN-STREAMING-OUTPUT-UNCAPPED
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `run_streaming` (`combined`, `stderr`, the unbounded channel, `BufReader::lines()`).
- **Finding:** No output cap. The adjudicator added `MAX_OUTPUT` after a pipe flood produced a measured 1.9 GB allocation (paydown 2026-09-23 WP9 probe P4). The gap pre-dates WP4, but the 600 s deadline now bounds how much can pile up.
- **Why it matters:** A lesson already learned next door was not carried over. The risk is low, because the script is the managed clone's own `install.sh`.
- **Suggested action:** Cap the accumulated output (discard past N bytes and append a truncation note), never by backpressure on the pipe. Fold this into the shared module above.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-THREE-WAYS-TO-RELEASE-THE-RUN-LOCK
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/commands.rs`: `RunGuard` (the workers), `HeldRunLock` (the dry run), and manual `running.store(false)` on the early-error returns of `workflow_install_start` / `workflow_uninstall_start`.
- **Finding:** The single-run lock is released three different ways, and `HeldRunLock` can be built without acquiring the lock, so taking and releasing it are still separate statements.
- **Why it matters:** The manual releases on early returns are the shape a panic or an early `?` has wedged before.
- **Suggested action:** `HeldRunLock::try_acquire(&control) -> Option<Self>`, used by all three commands and held by `RunGuard`, removes the four manual releases. ⚠️ `every_substrate_touching_command_takes_the_single_run_lock` greps `running.swap(true` within 400 chars of each command, so it must move with this change.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-04-QUALITY-WP4-SPAWN-BLOCKING-HOP-REPEATED
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs` (`trash_path`), `src-tauri/src/adjudicator/commands.rs` (`on_worker`), `src-tauri/src/workflow_install/commands.rs` (`finish_on_worker`).
- **Finding:** `spawn_blocking(...).await.map_err(|e| format!("… stopped unexpectedly: {e}"))?` appears three times, each worded differently.
- **Why it matters:** It is the remedy `ASYNC_COMMANDS` reasons point to, so it will spread as more commands move off the main thread.
- **Suggested action:** A shared helper. Low cost either way.
- **Priority:** low
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

