# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# paydown-2026-11-04-wp8-supervisor-and-status-cluster — 2026-11-06

*(feature-review-quality on ship commit `4de4e70`, window `4de4e70^..4de4e70`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 3 MINOR, all auto-backlogged; each claim re-checked against the source before filing.)*

## SURFACE-2026-11-06-QUALITY-WP8-SEED-ONCE-SWALLOWS-A-FAILED-READ
- **Severity:** MINOR
- **Location:** `src/state/supervisor/activityFeed.ts` (`seedActivity`: `seeded.add` before the `merged.length === 0` return) + `src/components/workspace/Workspace.tsx` (the mount seed effect).
- **Finding:** `readActivityLines` returns `[]` on an IPC failure, and `seedActivity` marks the project seeded even for an empty replay. So one failed first read disables the relaunch replay for that project for the rest of the app run (a second workspace's seed is a no-op). Also, every later mount still does the full 2000-line read only for the seed to discard it.
- **Why it matters:** a narrow, silent loss of exactly the survives-a-relaunch property WP8 protected, plus a wasted IPC read per extra mount.
- **Suggested action:** export an `isSeeded(projectPath)` and skip the read when true; and either do not mark a project seeded on an empty/failed read, or have `readActivityLines` distinguish "failed" from "empty".
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-06-QUALITY-WP8-POPOVER-FOCUS-RULE-SPLITS-THE-ANCHOR-COMMENT
- **Severity:** MINOR
- **Location:** `src/App.css` (`.supervisor-activity-popover:focus`).
- **Finding:** the new `:focus` rule sits between the "⚠️ Anchored to the group's LEFT edge … x = -163" comment and the positioning rule that comment explains, so the warning now heads the `outline: none` rule.
- **Why it matters:** a reader looking for why the panel is left-anchored finds the comment on the wrong rule.
- **Suggested action:** move the `:focus` rule after the `.supervisor-activity-popover` positioning block.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-06-QUALITY-WP8-NULL-OFF-THE-WIRE-COMMENT-IS-FALSE
- **Severity:** MINOR
- **Location:** `src/pip/__tests__/pipLayout.test.ts` (the `nullOffTheWire` case).
- **Finding:** the comment says "A `null` off the wire (serde's `None`)", but Rust's `attention` is `#[serde(skip_serializing_if = "Option::is_none", default)]`, so `None` is omitted and never arrives as `null`.
- **Why it matters:** a false wire fact justifies the `as unknown as` cast; the case is still worth keeping, as a DEFENSIVE check (and `displayStateFor` makes the same `!= null` claim in its own comment, so check that line too).
- **Suggested action:** reword both comments as defensive ("should a `null` ever arrive"), keep the test.
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

# m16-5-wp5-qol-batch — 2026-11-02

*(feature-review-quality on ship commit `df52ce7`, window `29c3395..df52ce7`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-02-QUALITY-WP5-PICKER-ROW-SHOULD-BE-A-COMPONENT
- **Severity:** MINOR
- **Location:** `src/components/picker/ProjectPicker.tsx` (row rendering inside `pickerItems.map → PICKER_ROW_CELLS.map → switch`).
- **Finding:** The `isOpen` branch re-indented ~300 lines; the row is ~170 lines of JSX four levels deep in a 772-line component.
- **Why it matters:** The next row-level change has to work through the same nesting; `git blame` on the row is now noise.
- **Suggested action:** Extract a `PickerRow` component taking `isOpen`; prove the rendered output unchanged via `[[prove-render-unchanged-via-head-worktree]]`.
- **Priority:** low
- **Status:** pending

# m16-5-wp3-supervisor-correctness — 2026-10-27

*(feature-review-quality on ship commit `3e92860` (feature `565a363`), window `565a363^..3e92860`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 6 MINOR, all auto-backlogged.)*

## SURFACE-2026-10-27-QUALITY-WP3-PROBE-RUNNER-SKIPS-THE-PRODUCTION-MODEL-CHECK
- **Severity:** MINOR
- **Location:** `tooling/adjudicator-probe/runner.ts` (`adjudicateOnce`).
- **Finding:** It is called "production-shaped", but it parses the JSON envelope itself and does not apply production's exactly-the-pin check (`parseReplyEnvelope` + the model check in `adjudicator.ts`).
- **Why it matters:** The tool that justifies a pin or wording change would score another model's answer as valid, which is the silent alias move 3.6 just closed in production. Two envelope parsers can also drift apart.
- **Suggested action:** Reuse `parseReplyEnvelope` and the model check (export them if needed), and record a mismatch as its own `basis`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-27-QUALITY-WP3-OVERLONG-JSDOC-LINE-IN-VERDICT
- **Severity:** MINOR
- **Location:** `src/state/supervisor/verdict.ts` (the one-line JSDoc on the applied mode, ~line 95).
- **Finding:** It runs well past the file's ~100-column comment width (Prettier does not wrap comments).
- **Why it matters:** Cosmetic.
- **Suggested action:** Wrap it.
- **Priority:** low
- **Status:** pending

# m16-5-wp4-status-channel-semantics — 2026-10-26

*(feature-review-quality on ship commit `b69201d` (feature `53141d4`), window `53141d4^..b69201d`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 5 MINOR. Four are auto-backlogged here; the 5th, a stale "drafted, unsent" line in `arch/status-channel-and-surfaces.md` §A.5, was fixed in place before archive.)*

## SURFACE-2026-10-26-QUALITY-WP4-UNWAITED-SEPARATE-TAIL-READ-UNEXPLAINED
- **Severity:** MINOR
- **Location:** `src/state/supervisor/useSupervisor.ts`, the verify-human `readTail` fallback.
- **Finding:** The separate read (supervisor toggle OFF, or no stored mode) calls `transcript_tail` within milliseconds of `Stop`, with no `isTurnComplete` flush wait. CC flushes the final line 74–109 ms after `Stop`. The read is probably still correct, since the late line is end-of-turn assistant text with no skill invocation, but nothing says so, and the adjacent comment cites the flush wait as the reason to reuse the decision's tail.
- **Why it matters:** It invites a reader to "fix" a path that is fine, or to rely on it for a property it lacks.
- **Suggested action:** Add one sentence on why the unwaited read is safe for this question (the last *invocation* precedes the flushed line). Or, if a skill-invoking last line is possible, apply the same wait.
- **Priority:** low
- **Status:** pending

# m16-5-wp2-adjudicator-remeasure — 2026-10-21

*(feature-review-quality on ship commit `c5fc34f` (feature `904dcc8`), window `904dcc8^..c5fc34f`; drive_mode=autopilot. 0 CRITICAL, 3 MAJOR, 8 MINOR. Ten are auto-backlogged here; the 8th MINOR (a stale WIP leaf) was fixed in place before archive.)*

## SURFACE-2026-10-21-QUALITY-WP2-REPLAY-TEST-NOT-BOUND-TO-PROMPT-MODEL-TAIL
- **Severity:** MAJOR
- **Location:** `src/state/supervisor/__tests__/adjudicatorRemeasure.test.ts` + `wp2-adjudicator-set.json` `_meta`
- **Finding:** The replay records no hash of `adjudicationPrompt`, no `TAIL_CHARS` and no resolved model (`redact.probe.ts` drops `models`). After WP3 3.5 rewrites the prompt, the test stays green and keeps saying "the shipped adjudicator FAILS" about a prompt that no longer ships.
- **Why it matters:** A guard that reports green while checking nothing; 3.5 is the scheduled change that triggers it.
- **Suggested action:** Record `sha256(adjudicationPrompt(""))`, `TAIL_CHARS` and `ADJUDICATOR_MODEL` (plus the resolved id) in `_meta`, and assert they equal the live values, so a mismatch fails with "re-run the probe". This also gives the new `TAIL_CHARS` export its caller. Natural fit: WP3 3.5.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-FREEZE-GATE-READS-A-WIP-PATH-FINALIZE-MOVES
- **Severity:** MAJOR
- **Location:** `tooling/adjudicator-probe/score.probe.ts` → `WIP` constant / `set` step
- **Finding:** `set` refuses unless `workflow-system/state/wip/m16-5-wp2-adjudicator-remeasure.md` contains the freeze sha, and `feature-finalize` moves that file to `state/archive/`. The re-score WP3 3.5 depends on then fails with ENOENT.
- **Why it matters:** A known next consumer is broken by the workflow's own archive step.
- **Suggested action:** Check the sha against a durable record (`freeze-report.json`, or the committed set's `_meta`), or resolve the WIP in either `wip/` or `archive/`. Natural fit: WP3 3.5, as its first step.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-FULL-LABELLED-SET-IS-SINGLE-COPY-IN-TMP
- **Severity:** MAJOR
- **Location:** `tooling/adjudicator-probe/paths.ts` (`OUT` = gitignored `tmp/adjudicator-probe/`)
- **Finding:** The only full set lives in gitignored `tmp/` and nothing documents that: tails for the ~2/3 non-claudesk records, `labels.frozen.json`, `score-set.json`, `answers.jsonl`. The committed set has no text for those records. The rebuild path (`mine.probe.ts`) works only while every source transcript still exists, and CC can prune old transcripts.
- **Why it matters:** WP3 3.5's held-out re-score needs those tails; the evidence can silently disappear.
- **Suggested action:** Decide where a private copy lives (outside the public repo, e.g. a backed-up local dir) and write that path and the restore step into `paths.ts` / WBS 3.5. Natural fit: WP3 3.5.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-RESUME-NEVER-RETRIES-FAILED-CALLS
- **Severity:** MINOR
- **Location:** `tooling/adjudicator-probe/score.probe.ts` → `score` step / `adjudicateOnce`
- **Finding:** An `error`/`timeout` answer is appended and its key counted as done, so a transient failure becomes a permanent AWAITING. `spawn` has no `child.on("error")`, so a missing `claude` binary is unhandled.
- **Why it matters:** A quiet bias on the next re-run (this run had 0 failures).
- **Suggested action:** Treat only `basis: "model"` as done, and add an `error` handler that resolves a failed answer.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-RUN-NUMBERS-SORTED-AS-STRINGS
- **Severity:** MINOR
- **Location:** `score.probe.ts` `report` / `redact.probe.ts` (`.sort()` on run numbers)
- **Finding:** The default `.sort()` compares strings, so from run 10 on `answers[i]` stops matching run `i+1`, which the replay test assumes.
- **Why it matters:** A hidden ordering bug in evidence the probe will extend.
- **Suggested action:** Sort with `(a, b) => a - b`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-PRNG-SHUFFLE-AND-LABELS-DUPLICATED
- **Severity:** MINOR
- **Location:** `triage.ts` `sampleIds` vs `labelSheet.ts` `mulberry32`/`shuffle`; `LABELS` in `reviewer.ts` and `labelSheet.ts`
- **Finding:** The seeded PRNG and Fisher-Yates are written twice, byte for byte, and `LABELS` is defined twice.
- **Why it matters:** Two copies drift.
- **Suggested action:** Export them once from `labelSheet.ts` and import them elsewhere.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-POLICY-EXCLUSION-RESTATED-THREE-TIMES
- **Severity:** MINOR
- **Location:** `triage.ts` `isPolicyExcluded`; `adjudicatorRemeasure.test.ts` `/^[PI]/`
- **Finding:** The product/incident rule is restated in tooling and in the test, ahead of WP3 3.4 putting it into `decideVerdict`.
- **Why it matters:** Once production has the rule, these copies drift.
- **Suggested action:** When 3.4 lands, import the production predicate in both places. Natural fit: WP3 3.4.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-CLAUDESK-TAILS-KEPT-BY-PREFIX-MATCH
- **Severity:** MINOR
- **Location:** `corpus.ts` `projectClassOf`; `redact.ts` `redactionViolations`
- **Finding:** Any slug starting with `-Users-stayman-Personal-projects-claudesk` keeps its tails in an open-source commit, and those records skip the forbidden-token scan, so a sibling `claudesk-*` dir (a worktree or fork) would be committed unscanned. Only `-src-tauri` exists today; scratch dirs are excluded.
- **Why it matters:** A small hole in a leak gate.
- **Suggested action:** Allow-list the exact slugs, or run the forbidden-token scan on claudesk tails as well.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-MEASUREMENT-NUMBERS-REPEATED-IN-FOUR-PLACES
- **Severity:** MINOR
- **Location:** `adjudicator.ts` header; `adjudicatorRemeasure.test.ts` header; `wbs.md` WP2; backlog SURFACE
- **Finding:** The same figures (95/103, 126/188, the CI, 8/29) appear in four places.
- **Why it matters:** When 3.5 re-measures, four places must change together; the comment budget calls duplication "the expensive half".
- **Suggested action:** Keep the numbers in `wbs.md`; reduce the code headers to the verdict plus a pointer. Natural fit: WP3 3.5.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-21-QUALITY-WP2-TAIL-CHARS-EXPORT-UNUSED
- **Severity:** MINOR
- **Location:** `src/state/supervisor/fanOut.ts` → `export const TAIL_CHARS`
- **Finding:** Exported, with no importer.
- **Why it matters:** A dead export.
- **Suggested action:** Resolved by the first MAJOR (binding the replay to `TAIL_CHARS`), or un-export it.
- **Priority:** low
- **Status:** pending

# m16-wp3-review-player — 2026-10-20

*(feature-review-quality on ship commit `cd0f204` (feature `b450287`), window `b450287^..cd0f204`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 6 MINOR, all auto-backlogged.)*

## SURFACE-2026-10-20-QUALITY-PLAYER-ELREF-INTERSECTION-TYPE
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/MediaPlayer.tsx` → `elRef`
- **Finding:** `elRef` is typed `HTMLVideoElement & HTMLAudioElement` so one `elementProps` spreads onto both tags. That claims an `<audio>` has `videoWidth` / `requestVideoFrameCallback`, and the code still needs `as unknown as TrackSource` / `as HTMLVideoElement` casts.
- **Why it matters:** the type checker can no longer catch a video-only access on the audio path.
- **Suggested action:** type it `HTMLMediaElement`, and narrow to video where needed.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-20-QUALITY-RESOLVEFPS-IS-A-PASSTHROUGH
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/mediaClock.ts` → `resolveFps`
- **Finding:** After the seek probe was dropped, `resolveFps` just calls `snapFps(raw, TRACK_FPS_TOLERANCE)`, which is the default.
- **Why it matters:** it is a leftover indirection from the rejected design.
- **Suggested action:** inline it into `mediaInfoOf`. Move the "why there is no seek probe" comment onto `snapFps` or the call site.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-20-QUALITY-PLAYER-COMMENTS-CITE-WIP-PHASE-IDS
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/MediaPlayer.tsx` (decision A / P1.verify-human.3, "measured, P3 verify-self", "WIP → Research OQ-1/OQ-2")
- **Finding:** Comments cite WIP-local phase and leaf IDs.
- **Why it matters:** under the comment-budget rule this is provenance. The WIP gets archived, so these become pointers to labels a reader cannot resolve.
- **Suggested action:** keep the measured fact at the code and drop the phase labels (this pairs with the comment-convention pass).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-10-20-QUALITY-PLAYER-STRIP-REUSES-ZOOM-BUTTON-CLASSES
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/MediaPlayer.tsx` strip → `.media-zoom-btn` / `.media-zoom-controls`
- **Finding:** The frame-step, speed and loop controls reuse the image viewer's zoom classes.
- **Why it matters:** most `.media-zoom-btn` uses are no longer zoom buttons, so a restyle or a class-based zoom-button query would silently include the player strip.
- **Suggested action:** a neutral `.media-tool-btn` / `.media-tool-group` shared by both.
- **Priority:** low
- **Status:** pending

# m16-wp2-media-in-editor-tab — 2026-09-29

*(feature-review-quality on ship commit `5ea1aeb`, window `4455cf9^..5ea1aeb`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 5 MINOR, all auto-backlogged. The MAJOR (missing card sticks on an unchanged mtime) was resolved by M16 WP3 `b450287`, 2026-10-20, and its entry deleted; see CHANGELOG.)*

## SURFACE-2026-09-29-QUALITY-READ-ERROR-CARD-STATS-VIA-THE-SCOPE-ADMITTING-COMMAND
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/MediaCard.tsx` → `ReadErrorCard`
- **Finding:** The card for a non-media binary / oversized file calls `stat_media` only to learn the size, which also admits the root to the asset scope. `stat_file` (no side effect, returns `FileMarker.size`) already exists.
- **Why it matters:** A read-only need depends on the scope-widening command. No new reach today (A-5), but the coupling is easy to miss if scope admission is ever narrowed.
- **Suggested action:** Use `stat_file` for the size in `ReadErrorCard`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-29-QUALITY-STAT-MEDIA-CORE-RESOLVES-AND-STATS-TWICE
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs` → `stat_media_core`
- **Finding:** `resolve_within` → `metadata` → `stat_file_core` (resolves + stats again) → `File::open`: three filesystem lookups where two do, and the confinement check runs twice.
- **Why it matters:** Small redundant IO and a slightly wider check-then-use window.
- **Suggested action:** Derive size and mtime from the first `meta` (share the mtime conversion with `stat_file_core` through a helper).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-29-QUALITY-PDF-IFRAME-SANDBOX-QUESTION-LEFT-OPEN
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/MediaView.tsx` → `PdfView`
- **Finding:** The PDF `<iframe>` has no `sandbox` attribute. The Phase 3 build notes left "does WebKit's PDF viewer still render under `sandbox`?" for verify-self, and it was never answered.
- **Why it matters:** Defense-in-depth on the only script-capable element in a `csp: null` webview. The `%PDF-` gate is the real control (a live positive control proved it load-bearing).
- **Suggested action:** Measure it live: `sandbox=""` (and `sandbox="allow-same-origin"`) on the PDF iframe in dev + a debug bundle. If the PDF still renders, keep the attribute and pin it; if not, record the finding in `arch/security-posture.md`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-29-QUALITY-PANETABS-MEDIAKIND-CALLED-THREE-TIMES-WITH-A-NONNULL-ASSERT
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/PaneTabs.tsx` → tab-body render branch
- **Finding:** `mediaKind(tab.path)` runs twice in the render branch (then `!`-asserted) and a third time in the registration filter.
- **Why it matters:** Cosmetic; the `!` would disappear if the result were bound once per tab.
- **Suggested action:** Bind `const kind = tab.path ? mediaKind(tab.path) : null` once per tab.
- **Priority:** low
- **Status:** pending

# silent-supervisor — 2026-09-28

*(feature-review-quality on ship commit `778fe72`, window `778fe72^..778fe72`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 5 MINOR, all auto-backlogged.)*

## SURFACE-2026-09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH
- **Severity:** MINOR ×2 (item 3 was resolved 2026-11-04 by paydown WP2, item 4 by paydown WP3, and item 5 2026-11-06 by paydown WP8; the numbering is kept)
- **Findings:**
  1. `ccInputRouting.ts` header, the `Workspace.tsx` comment and the commit message say terminal reports are stripped "here, once, for BOTH readers", but `foldInput` (`unsentInput.ts`) strips them again and its header says it "now strips them first". Two strip sites, two docs that disagree on the owner. Pick one owner, or document the second as defense in depth.
  2. `transcript.ts`: `lastUserProseIndex` / `isUserProseTurn` also count `isMeta` skill-body lines, so the `readTurn` floor can sit mid-turn after a chained `Skill` call, while the `readTurn` header says the boundary is "the last user prose line" and "tool results never … move the boundary". Rename (e.g. `lastTurnBoundaryIndex`) or state the `isMeta` case in the `readTurn` doc.
  3. *(resolved 2026-11-04, paydown WP2)*
  4. *(resolved 2026-11-04, paydown WP3: both files reset the claim store after each test)*
  5. *(resolved 2026-11-06, paydown WP8: `TurnEndSignal` declares `last_event_at`)*
- **Priority:** low
- **Status:** pending

# supervisor-activity-record — 2026-09-28

*(feature-review-quality on ship commit `dece979`, window `dece979^..dece979`; drive_mode=autopilot. 0 CRITICAL, 2 MAJOR, 8 MINOR, all auto-backlogged. The torn-append MAJOR was resolved 2026-09-28 by task `activity-log-append-tear`; 1 MAJOR + 8 MINOR remain.)*

## SURFACE-2026-09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH
- **Severity:** MINOR ×3 (items 3, 4, 5, 6 and 8 were resolved 2026-11-06 by paydown WP8; the numbering is kept. Items 1–2 are WP14's comment pass, item 7 is WP12's `SupervisorHeaderControl` extraction)
- **Findings:**
  1. `useSupervisor.ts` (`decideTurn`, the toggle check): the comment says the value is "read PER TURN for the same reason as the gate above", but after the extraction the gate (`host.enabled`) now sits in `onTurnEnd`, not above. Repoint the reference.
  2. `fanOut.ts`: the old `/** What happened for one workspace in a sweep. */` now sits directly above the new `FanOutReason` doc block. Two JSDoc blocks are stacked, and `FanOutOutcome` has lost its doc. Move it.
  3. *(resolved 2026-11-06, paydown WP8: the `onRecycle` throw is its own `recycle-threw` reason and keeps the decision context)*
  4. *(resolved 2026-11-06, paydown WP8: `relativeTime` lives in `src/state/timeFormat.ts`)*
  5. *(resolved 2026-11-06, paydown WP8: the readout takes an options object)*
  6. *(resolved 2026-11-06, paydown WP8: one `ACTIVITY_READ_LINE_LIMIT`, pinned to Rust's `MAX_READ_LINES`; `no-stored-mode` is still recorded, per default D3)*
  7. `Workspace.tsx` (1527 lines) grew by about 70 lines of inline header JSX, plus hint-clock state, popover state and a seed effect, gated in two places (`if (!workflowEnabled)` in the seed effect, `workflowEnabled && visible` in the readout). Extract a `SupervisorHeaderControl` component so the surface's state and gate sit together.
  8. *(resolved 2026-11-06, paydown WP8: the popover takes focus, scopes its Esc and restores focus; checked live against a positive control)*
- **Priority:** low
- **Status:** pending

# paydown-wp9-sync-command-blocking-guard — 2026-09-23

*(feature-review-quality on ship commit `17f90e5`; drive_mode=autopilot. 0 CRITICAL, 4 MAJOR, 5 MINOR, all auto-backlogged. **Paydown 2026-11-04 WP4 resolved MAJORs 1–3 and MINORs 2–5; 1 MAJOR (provenance labels) + 1 MINOR remain below.** The reviewer found no dead code, stale branches or superseded helpers left over from `run_command`'s three rebuilds. The leftover scaffolding is almost entirely comment provenance.)*

## SURFACE-2026-09-23-QUALITY-WP9-COMMENTS-CARRY-WIP-PROVENANCE-LABELS
- **Severity:** MAJOR
- **Location:** `src-tauri/src/adjudicator/mod.rs` (about 12 sites: "re-verify 3/4", "probe P4/P7/A/B", "mutant R1/R3", "the bounded-channel version passed it by 4.8 KB"); `tests/sync_commands_do_not_block.rs` (the `run_on_main_thread` fixture comment and others)
- **Finding:** these labels point into the WIP and will not resolve once it is archived. The comment budget in `docs/lessons/source-text-guards.md` routes "what a previous version did, which review caught what" to the archive.
- **Suggested action:** keep the content (the rejected-backpressure rationale at `Drain`'s doc, and the fixture-size reasoning) and delete the labels and the iteration narrative. ⚠️ This belongs with `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` (R2 of the paydown: do not trim per-WP), so route it there unless it is picked up with the first finding above.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-23-QUALITY-WP9-MINOR-BATCH
- **Severity:** MINOR (1 of the original 5 remains; items 2–5 were resolved by paydown 2026-11-04 WP4, see CHANGELOG)
- **Location:** `docs/lessons/pip-nspanel-main-thread.md`, the guard's module doc (`src-tauri/tests/sync_commands_do_not_block.rs`), the `cc_kill` / `supervisor_adjudicate` command docs, `CLAUDE.md`.
- **Finding:** The main-thread rationale and the `cc_kill → poll_reaped → thread::sleep` chain are restated across all five places. (Its other half is done: since WP4 the lesson names the guard's "What this does NOT cover" as the canonical limits list instead of carrying its own short copy.)
- **Suggested action:** Keep the full rationale in the guard doc and the lesson; reduce the command docs and the CLAUDE.md bullet to one line plus a pointer. A natural fit for WP14's comment-convention pass.
- **Priority:** low
- **Status:** pending

# paydown-wp3-boot-smoke-test — 2026-09-23

## SURFACE-2026-09-23-QUALITY-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X
- **Severity:** MAJOR
- **Location:** `linkCheck.mjs` header; `docs/lessons/verify-auto-gate.md` §check:link; `source-text-guards.md` §19; `appBoot.test.tsx` header; `moduleGraphBoot.test.ts` header; `turnNavExportContract.test.ts` SCOPE note; `CLAUDE.md` gate-order line. *(The eighth site, the paydown WBS's checklist, was removed when that file was deleted at the 2026-09-23 fold-back, so **7 live sites** remain. The ID keeps its `8X`.)*
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

⚠️ **Escalation note, carried out of the 2026-09-23 paydown WBS (its ruling R1) so it is not re-derived.** A "latest wins" supersede (B′: a second Apply while ⏳ is queued replaces the first) was sized as **small**. The respawn reads the stored mode from `projects.json` **at spawn time** (`resolve_cc_spawn_env`), not the value captured at the click, so a second Apply only needs to persist, and the one queued respawn picks it up. In the race where the respawn reads before the write lands, the header's existing `is-stale` marker shows the mismatch, so the failure is not silent. **Escalate from "disable while queued" to B′ only if the operator actually hits "I want to change it while ⏳ is showing."** The lower-bug-surface option was chosen under `[PRIOR: explicit-selectable-mode-over-inferred-mode]`.

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
