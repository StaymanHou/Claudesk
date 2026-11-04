---
shape: temporary-wbs
cycle: backlog-paydown-2026-11-04
created: 2026-11-04
status: in-progress  # WP1 done 2026-11-04
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
parent-wp: M16.5 WP8 (workflow-system/product/wbs.md → WP8, task 8.3 executes this file)
---

# Backlog-Paydown Sweep — 2026-11-04 (M16.5 WP8)

> ⚠️ **This is NOT a roadmap milestone.** It is the body of M16.5's last work package (WP8). It
> reserves no milestone number. **This file is DELETED on completion**; see §"Fold back and
> delete". Do not resync it into `arch.md`.

**Run at:** the clean boundary after WP7 closed (2026-11-04). `wip/` is empty.

**Inventory:** 34 SURFACE entries in `backlog.md`, plus **91 discrete code-quality findings** in
`backlog-quality-findings.md` (63 from the M16.5 / M16 / analytics / supervisor groups, 28 older).
**Anchor check against live code: 0 GONE.** Two agents re-anchored every finding by symbol,
read-only:
- the recent 63: 61 LIVE, 2 PARTIAL (the COMMENT nits included)
- the older 28: 17 COMMENT (not deep-verified), 10 LIVE, 1 PARTIAL ⚠️ **Zero GONE is the delete-on-resolve rule working.** The
2026-09-23 sweep found about one in five bodies stale. **But five findings have grown WORSE since
they were filed:**
- `Workspace.tsx`: 1170 → 1595 lines
- `SettingsPanel.tsx`: now 710 lines
- `workspaceSupervisorReadout`: 6 → 7 positional parameters
- the WP2 freeze gate: the same defect recurred in `wp3.probe.ts`

**Mode:** 3 (Autopilot). Unambiguous dispositions were applied automatically. Four were ruled
by the operator (§Rulings), and the defaults taken without asking are listed in §Defaults.

**ID key:** `SURFACE-2026-` is dropped from every ID below. **QF** means the body is in
`backlog-quality-findings.md`; **BL** means it is a `backlog.md` entry. Batch sub-findings carry
`#n`, numbered in the order they appear in the batch body.

## ⚠️ Read before any WP that touches a test or a guard

The project's highest-frequency defect class is a **guard whose stated coverage exceeds its actual
coverage** (`docs/lessons/source-text-guards.md`, entries 11–18). For every WP:

- **Mutation-prove each guard change INDIVIDUALLY.** Confirm the mutant landed in **executable**
  code (`sed -n '<line>p'`; use `perl -pi -e`, because BSD `sed` has no `\b`). An invalid probe and
  a real hole look identical.
- **Restore from a `cp` backup and verify with `shasum`. Never use `git checkout`**
  (`[[git-checkout-no-ops-on-untracked-file]]`).
- **A closed finding names the mutant that now dies.** "Tests added" is not closure.
- **Any WP that deletes or renames an export runs `pnpm check:link` and the boot test** before a
  live observation is trusted.
- **Re-anchor by SYMBOL**, never by the line a finding cites (`[[cite-code-by-symbol-not-line]]`).
- **Gate:** `pnpm verify:auto`, with the timeout from `runtimes.md` (currently **159000**).
- **Path:** a WP marked **feature** runs `/feature-plan` (so `feature-review-quality` sees its
  diff). A WP marked **task** runs `/task-plan`. The medium-risk code WPs take the feature path,
  because a task-path WP gets no code-quality review (the 2026-09-23 sweep's lesson).

## Effort anchor (this project)

Benchmarked against M16.5's archived WPs (`m16-5-wp3` … `m16-5-wp6`). A WP is one
plan → build → ship → review → finalize run, about a day, so **WP-sized is M and anything
smaller is S/XS**. Almost every finding here is XS/S, which is what Rule 1 exists to catch.

## Disposition model (applied; reproduced so build sessions rule the same way)

- **Impact** = feature value + maintainability, where maintainability = quality × P(future touch).
  **Effort** = the implementer's time, measured against the anchor above. **Risk** = P(the change
  breaks something the suite won't catch). Risk is suite-relative, so a fix that adds the missing
  test lowers its own risk.
- **Rule 1: cheap + safe → ALWAYS Sweep, no exception.** Closing an entry de-clutters the backlog,
  and that is an impact term in its own right.
- **Severity is an INPUT to impact**, not a sort key.
- **Ordering:** deletions → low risk → high impact → co-location. Effort is not an ordering key, and
  risk outranks impact.

## Rulings (operator, 2026-11-04)

- **R1: Replace All goes per-line and uses the SHOWN query.** `replace_core` routes through the
  existing `replace_every_match_per_line`, and `onReplaceConfirm` reads `findResultsShown.query`
  rather than the live `searchQuery`, matching the per-result and per-file buttons. Retire
  `replace_count_matches_whole_file_effect_under_multiline_regex`. The new rule is that Replace
  only ever touches what search could show. → WP7.
- **R2: The failure alarm STAYS per-project** (reversed the agent's machine-wide recommendation).
  `10-27-QUALITY-WP3-FAILURE-ALARM-COUNTS-PER-PROJECT-FOR-MACHINE-WIDE-FAILURES` is closed **as by
  design**. WP8 writes the per-project choice into `arch/workflow-supervisor.md` §F, so it is not
  re-filed. `ALARM-SEED-RACES` stays a separate MINOR and is still swept: the race exists per
  project too.
- **R3: The comment-convention pass is this sweep's LAST WP** (WP14). It writes the guard first and
  is scoped to the attached roster. This reverses the 2026-09-23 "keep separate" ruling, which never
  got a slot.
- **R4: ALL FOUR component extractions are in.** That covers the `Workspace.tsx` pair (WP12) and
  `SettingsPanel` plus `PickerRow` (WP13). The 2026-09-23 R1 deferral of `useDriveModeApply` and
  the 400 ms hold "to the next drive-mode touch" is **lifted**.

## Defaults taken without asking (flag any that are wrong)

- **D1** `PAYDOWN-AUTOPILOT-DEFAULTS-AWAIT-RATIFICATION` (BL) → **Delete.** Six weeks live with no
  report. Its one questionable default, WP10's single global localStorage key, re-files if it
  bites. The other item it points at is already resolved in CHANGELOG.
- **D2** The WP2 full labelled set (`10-21-QUALITY-WP2-FULL-LABELLED-SET-IS-SINGLE-COPY-IN-TMP`) →
  a dated private copy **outside the repo** at
  `~/Library/Application Support/claudesk-tooling/adjudicator-probe/`, with `paths.ts` pointing at
  it. It holds transcript text from other projects, so it can never be committed.
- **D3** `SA#6`: keep recording `no-stored-mode`, because it is observability. Only unify the three
  line-limit constants.
- **D4** Scratch workspaces move to the sibling directory
  `/Users/stayman/Personal/projects/claudesk-scratch/`, outside the repo (WP11).
- **D5** `WP4-OVERLAY-EMIT-OUTSIDE-THE-LOCK` → **soften the doc claim**. Do NOT emit under the
  registry lock: these are main-thread `#[command]`s, and the tray listener runs on `emit`, which
  is the lock-held-across-a-marshal case the sync-blocking guard cannot see.
- **D6** `ANALYTICS-WEEK-EXPORT-MINOR-BATCH#1` → **document** the first-day `path` rule. Weighting
  across days would change a field Neo consumes.

---

## WP1: Backlog bookkeeping (delete, bury, measure-and-close)  `[impact: Med · effort: S · risk: Lowest]` · task · ✅ DONE 2026-11-04 (6 resolved, 6 buried; F10b kept open at 1.5%)

Pure subtraction, so it runs first. **Every delete lands in the same commit as its
`**Backlog resolved:**` CHANGELOG line** (delete-on-resolve). Each Bury moves the body to
`backlog-archived.md` with a `← Buried 2026-11-04 (paydown WP1)` tag and a one-line
"Buried because". Re-check each item before acting, because the agents' classification is
itself a claim.

1. **Delete as resolved upstream:**
   - `08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE` (BL). The installed skill
     has one default now (rung 5, `orchestrated`).
   - `08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` (BL). Absorbed:
     `/session-start` skips the mode pick under a Claudesk line, verified live at WP5 5.8 on
     2026-11-04.
2. **Delete, dismissed or by ruling:**
   - `09-24-QUALITY-F-B-MINOR-BATCH` (QF + stub). The finding itself says there is no consumer.
   - `PAYDOWN-AUTOPILOT-DEFAULTS-AWAIT-RATIFICATION` (BL). D1.
   - `10-27-QUALITY-WP3-FAILURE-ALARM-COUNTS-PER-PROJECT-…` (QF). R2; the arch line lands in WP8,
     and this commit cites it.
3. **Measure, then close or rewrite:** `09-17-F10B-STOPPED-BEFORE-VERIFY-HUMAN-INSTEAD-OF-CHAINING-INTO-IT`
   (BL).
   - Run mccc's `measure-f10b --since 2026-09-23` (via `_ref/claude-customization/`).
   - Zero recurrences → delete it. Otherwise rewrite it to the recurrence count.
4. **Bury:**
   - `09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-…` (BL). Dev-only: 0 of 1,278 installed-build records,
     and the dedupe already contains the decision.
   - `10-20-REVIEW-PLAYER-VFR-FRAME-STEP` (BL). Low impact, M, medium risk.
   - `09-23-PAYDOWN-TASK-PATH-WPS-GOT-NO-CODE-QUALITY-REVIEW` (BL). The lesson is absorbed into this
     file's Path rule, and the two commits are six weeks old and since touched.
   - `10-20-QUALITY-PLAYER-TWO-SUBSCRIPTION-PATHS-FOR-TIMEUPDATE` and
     `10-20-QUALITY-PLAYER-PER-FRAME-RERENDER-OF-WHOLE-PLAYER` (QF). Low impact, medium risk to
     playback timing.
   - `11-02-QUALITY-WP6-LINE-ACTIONS-REBUILT-PER-KEYSTROKE` (QF). Low impact; medium risk of a
     stale `onClick`.
5. **Release checklist line** (`08-21-NOTIFICATION-TYPE-FALLBACK-IS-WRONG-FOR-COMPLETION-TYPES`,
   BL). Add one `SELECT DISTINCT notification_type` step to the in-repo
   `.claude/skills/release/SKILL.md`, then delete the entry. Its code half is already done.

## WP2: Doc and copy accuracy  `[impact: Med · effort: S · risk: Low]` · task

Each item is a lying doc or string; no behaviour changes. The one rename (WP5) is excluded here.
- `10-27-QUALITY-WP3-CLAUSE-BOUNDARY-DOCSTRING-OMITS-COMMA-AND-PAREN`: list the full
  `CLAUSE_BOUNDARY_RE` set in `extractEmittedTransitionId`'s doc.
- `10-26-QUALITY-WP4-OVERLAY-EMIT-OUTSIDE-THE-LOCK-CAN-ARRIVE-STALE`: soften the claim (D5).
- `09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH#3`: `decideTurn`'s withhold list is missing
  `adjudicator-failed`, `workflow-not-supervised` and others. Point at `FanOutReason` instead of
  re-listing.
- `ANALYTICS-WEEK-EXPORT-MINOR-BATCH#1`: document the first-day rule (D6).
- `11-02-QUALITY-WP5-QUIT-PATH-…`'s doc half: `open_project_paths` claims "both derive from the
  frontend's canonicalized path", but the frontend only normalizes the string. Fix the sentence
  here; the code fix is WP6.
- `09-23-QUALITY-GUARD-EXEMPTS-EVERY-ASYNC-COMMAND-UNLISTED`'s doc half: name the async-command gap
  in both of the guard's "does NOT cover" lists. The allowlist half is WP4.
- `09-29-QUALITY-OVER-MEDIA-LIMIT-COPY-SAYS-LARGER-THAN-WHILE-RULE-IS-AT-LEAST`: change the copy to
  "4 GiB or larger".
- `10-27-QUALITY-WP3-ADJUDICATOR-ALARM-TOOLTIP-OMITS-UNPARSEABLE`: add "an unreadable reply".

## WP3: Test-harness hygiene and the `mediaTabLive` flake  `[impact: Med · effort: S–M · risk: Low (test-only)]` · task

Test-only, so it runs before any code WP; a de-flaked gate helps every WP after it.
- `10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD` (BL): replace the fixed 2×30 ms `settle` in
  `open()` with a poll until `media-image` appears, or pre-import the lazy `MediaView` chunk in
  `beforeAll`. **Done = 20 isolated runs and 3 full-suite runs, all green.**
- `09-23-QUALITY-LIVE-HARNESS-LIFECYCLE-FORKED-AND-SINGLE-PANE`: export `bootIpc` / `teardownIpc`
  from `liveWorkspace.tsx`, key a pane registry by `workspaceId`, and migrate
  `closeWiring.test.tsx`.
- `09-23-QUALITY-LIVE-HARNESS-DEAD-OPTIONS` (PARTIAL): drop `projectPath`, and throw if `root` is
  still mounted on entry.
- `09-23-QUALITY-SUBMIT-BUTTON-NOT-DRIVEN`: add the mirror click test, asserting the trailing `\r`.
- `09-23-QUALITY-WARN-SPY-LEAKS-ON-FAILURE`: add `vi.restoreAllMocks()` in `afterEach`.
- `09-23-QUALITY-GATE-OFF-PROOF-HAS-NO-POSITIVE-CONTROL`: assert the row exists in a `gate: true`
  test.
- `11-02-QUALITY-WP6-JSDOM-CM6-SHIMS-COPIED`: move the 5 copies into `src/test-support/cm6JsdomShims.ts`.
- `09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH#4`: shared `resetTurnEnds` setup or `afterEach` in
  `useSupervisor.test.ts` and `supervisorActivityLive.test.tsx`.
- `09-28-QUALITY-ARCH-DOC-ENUMERATION-GUARD-USES-A-HAND-KEPT-FILE-LIST` (MAJOR): glob
  `src/state/supervisor/*.ts`, with a floor and a positive control.
- `10-20-QUALITY-WP1-REDUNDANT-NONE-FIELDS-IN-SPREAD-LITERALS`: 3 sites in the
  `status_broadcaster/mod.rs` tests.

## WP4: The single-run lock, main-thread commands and the sync guard  `[impact: High · effort: M · risk: Low–Med]` · feature

⭐ **WBS 8.2 priority input.** All of these touch `workflow_install/`, `editor_fs::commands`, or
`tests/sync_commands_do_not_block.rs` / `MUST_STAY_ASYNC`.
- **`09-23-QUALITY-DRY-RUN-ASYNC-ATTR-STILL-BLOCKS-A-RUNTIME-WORKER` ("paydown-wp9 MAJOR 1").**
  Verdict at inventory: **real and reachable but never observed.**
  - **How it sticks:** `workflow_uninstall_dry_run` swaps `running` to true and releases it only
    after `run_streaming` returns. `run_streaming` reads until EOF with no deadline, so a grandchild
    holding the stdout pipe open leaves every later install, uninstall and dry run returning
    "already running" until relaunch. Cancel only sets a flag the dry run never reads.
  - ⚠️ **`spawn_blocking` alone does NOT fix the lock.**
  - **Fix:**
    - a deadline inside `run_streaming`, with a **process-group kill** (reuse the adjudicator's
      `Drain` timeout-and-group-kill pattern)
    - a Drop guard that releases `running`
    - `spawn_blocking`
  - **Coverage:** the shared `run_streaming` deadline also covers the same hang in the
    `workflow_install_start` and `workflow_uninstall_start` workers.
  - **Keep** the `pub fn workflow_uninstall_dry_run` text, which
    `every_substrate_touching_command_takes_the_single_run_lock` greps for.
  - **Done =** a test with a script that never closes stdout: the lock is released after the
    deadline, and the mutant that removes the kill keeps it stuck.
- `11-02-TRASH-PATH-BLOCKS-THE-MAIN-THREAD` (BL, medium):
  - make `editor_fs::commands::trash_path` an async fn plus `spawn_blocking`
  - add it to `MUST_STAY_ASYNC`
  - prove there is no freeze with `sample` (`[[verify-main-thread-freeze-via-sample]]`); the guard
    cannot see `trash::delete`
- `09-23-QUALITY-GUARD-EXEMPTS-EVERY-ASYNC-COMMAND-UNLISTED` (MAJOR), rule half: an allowlist with
  reasons for `(async)` commands.
- `09-23-QUALITY-GUARD-CFG-TEST-MATCH-DROPS-NOT-TEST-ITEMS` (MAJOR, latent): parse the cfg, count an
  item as test-only only for `test` or `all(test, …)`, and add a fixture.
- `09-23-QUALITY-WP9-MINOR-BATCH#2`: run `add_nested` for `ImplItem::Fn` and for trait default
  bodies.
- `#3`: cut only `Expr::Closure` / `Expr::Async` arguments of `spawn`, keeping the `cc_kill` cut.
- `#4`: pin one branch of `the_async_command_resolves_to_a_rejection_through_its_worker`.
- `#5`: port the TS `/timed? ?out/i` regex exactly into the timeout test.

## WP5: Analytics export honesty  `[impact: Med–High (Neo contract) · effort: S · risk: Low–Med]` · task

⭐ **WBS 8.2 priority input.** Files: `time_store/query.rs` and `export.rs`.
- `09-29-QUALITY-EXPORT-VIEW-FIGURES-ARE-UNGUARDED-RUST-COPIES-OF-WEEKMATH` (MAJOR):
  - add family-sum methods on `RollupCellMs` / `RollupCell`, used by `cell_export` and the three
    per-project sums
  - add a `node:fs`-anchored kinds test, because the export tests are circular today
  - soften the arch doc's "cannot drift" claim
- `09-29-QUALITY-WEEK-SORT-KEY-DOC-CLAIMS-IT-IS-THE-WEEK-TOTAL` (MAJOR, doc-only in effect): rename
  `week_ai_minutes` to `week_exec_minutes`, documented as the row-order key. Run `pnpm check:link`
  if any binding crosses into TS.
- `ANALYTICS-WEEK-EXPORT-MINOR-BATCH#2`: `session_display_id` uses `rsplit_once`; carry
  `(sid, life)` instead. The frontend segment ids depend on it, so add a test with a `-` in the sid
  first.
- `#3`: add an `ExportError::Internal` variant for the serde failure.

## WP6: Picker quit-path stamp and Day-view keys  `[impact: Med · effort: S · risk: Low]` · task

- `11-02-QUALITY-WP5-QUIT-PATH-STAMPS-CANONICAL-KEYS-AGAINST-RAW-STORED-PATHS` (MAJOR, latent: 0
  of the operator's 27 paths differ from their realpath today):
  - compare `canonical_key` on both sides in `config_store::touch_closed`
  - add a **real symlinked temp-dir** test
  - only symlinks and `/tmp` paths are affected, because `PathBuf` equality is per component, so a
    trailing slash already compares equal
- `11-02-QUALITY-WP5-DAY-VIEW-KEYS-DO-NOT-SKIP-SELECT`: add `SELECT` to the `ViewportContext` tag
  check.
- `11-02-QUALITY-WP5-VIEWPORT-KEY-ACTION-RETURN-TYPE-COLLAPSES`: ⚠️ the fix as filed does not
  compile, because `VIEWPORT_KEYS` is a `ReadonlySet<string>`. Build the Set from an `as const`
  tuple first.
- `11-02-QUALITY-WP5-OPEN-GROUP-LABEL-IS-A-LIST-ROW`: add `role="presentation"`.

## WP7: Find and replace rule  `[impact: Med · effort: S · risk: Low–Med]` · task

- `11-02-REPLACE-ALL-MATCHES-WHOLE-FILE-WHILE-SEARCH-MATCHES-PER-LINE` (BL, medium): apply **R1**.
  - Add an anchored-regex test (`^foo`) asserting the search count equals the Replace All count.
  - The mutant that restores whole-file `find_iter` must fail it.
- `11-02-QUALITY-WP6-REPLACE-ALL-USES-LIVE-QUERY`: R1, so Replace All uses
  `findResultsShown.query`.
- `11-02-QUALITY-WP6-WIRE-QUERY-CONVERSION-REPEATED`: add `toWireQuery(q)` in `searchModel.ts`,
  used by the 3 `RightPanelHost` sites and the 1 `ProjectSearch` site. Do it first, so R1's
  query swap is a one-line change.

## WP8: Supervisor and status cluster  `[impact: Med · effort: M · risk: Med]` · feature

Files: `activityFeed.ts`, `failureAlarm.ts`, `useSupervisor.ts`, `src/cc/workspaceSupervisor.ts`,
`pipLayout.ts`, and the `Workspace.tsx` seed effect. **Runs before WP12**, so the extraction moves
already-fixed code.
- **R2 arch line:** record the per-project alarm choice in `arch/workflow-supervisor.md` §F.
- `10-27-QUALITY-WP3-ALARM-SEED-RACES-A-LIVE-PUBLISH`: fold the replay before accepting live
  records.
- `10-27-QUALITY-WP3-ACTIVITY-FEED-DEDUPES-BY-TIMESTAMP`: drop the redundant clause, and key on
  identity.
- `09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH#3`: add a new `sweep-threw` reason, and classify it
  in `failureAlarm.EFFECTS`.
- `#4`: move `relativeTime` out of `diff/diffModel` into a shared time-format module.
- `#5`: `workspaceSupervisorReadout` → an options object (7 positional parameters today).
- `#6`: one line-limit constant (D3).
- `#8`: `SupervisorActivityPopover` Esc and focus. Focus the popover, or scope the Esc. **Live check
  through the MCP bridge.**
- `09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH#5`: add `last_event_at` to `TurnEndSignal`, and
  capture the value in the test double (`[[ts-arity-flexible-assignability-hides-a-widened-param]]`).
- `10-26-QUALITY-WP4-PIP-ISAWAITINGINPUT-REIMPLEMENTS-THE-OVERLAY-RULE`: route through
  `displayStateFor`, and extend the `pipFanoutWiring` pin.
- `10-26-QUALITY-WP4-TYPE-CYCLE-VERIFYHUMANPAUSE-USESUPERVISOR`: move `Decision` to a leaf types
  module.
- `11-04-QUOTA-AUTO-RESUME-FIRED-IS-AN-UNCLASSIFIED-NOTIFICATION-TYPE` (BL, added at WP1): add it
  to `INFORMATIONAL_NOTIFICATION_TYPES` (`status_broadcaster/mod.rs`).
- ⚠️ **The R2 arch line already landed in WP1** (`arch/workflow-supervisor.md` §F); skip that bullet above.

## WP9: Adjudicator-probe tooling  `[impact: Low–Med · effort: S · risk: Low (tooling)]` · task

Everything lives in `tooling/adjudicator-probe/`. WP2's three MAJORs are effectively MINOR now,
because the consumer they warned about (WP3 3.5) has already run. Rule 1 sweeps them anyway.
- `10-21-QUALITY-WP2-REPLAY-TEST-NOT-BOUND-TO-PROMPT-MODEL-TAIL` together with
  `…-TAIL-CHARS-EXPORT-UNUSED` (one fix): record the prompt sha, `TAIL_CHARS` and the model in
  `_meta`, then assert them.
- `10-21-QUALITY-WP2-FREEZE-GATE-READS-A-WIP-PATH-FINALIZE-MOVES`: ⚠️ this recurred in
  `wp3.probe.ts`. Add one helper that resolves `wip/` or `archive/`, used by both probes.
- `10-21-QUALITY-WP2-FULL-LABELLED-SET-IS-SINGLE-COPY-IN-TMP`: D2.
- `10-21-QUALITY-WP2-RESUME-NEVER-RETRIES-FAILED-CALLS` (PARTIAL) together with
  `10-27-QUALITY-WP3-PROBE-RUNNER-SKIPS-THE-PRODUCTION-MODEL-CHECK`: `score.probe` must not count
  an error basis as done. The runner needs `child.on("error")`, plus `parseReplyEnvelope` and
  `assertPinnedModel`.
- `…-RUN-NUMBERS-SORTED-AS-STRINGS`: sort with `(a, b) => a - b`.
- `…-PRNG-SHUFFLE-AND-LABELS-DUPLICATED`: export them once from `labelSheet.ts`, keeping the seeded
  output identical.
- `…-POLICY-EXCLUSION-RESTATED-THREE-TIMES`: import `SUPERVISED_WORKFLOWS`.
- `…-CLAUDESK-TAILS-KEPT-BY-PREFIX-MATCH`: an exact-slug allow-list.

## WP10: Media cleanup and the PDF sandbox measurement  `[impact: Low–Med · effort: S–M · risk: Low–Med]` · task

- `09-29-QUALITY-READ-ERROR-CARD-STATS-VIA-THE-SCOPE-ADMITTING-COMMAND`: switch to `stat_file`, and
  update the mock.
- `09-29-QUALITY-STAT-MEDIA-CORE-RESOLVES-AND-STATS-TWICE`: derive from the first `meta`, with a
  shared mtime helper.
- `09-29-QUALITY-PANETABS-MEDIAKIND-CALLED-THREE-TIMES-WITH-A-NONNULL-ASSERT`: bind `kind` once.
- `10-20-QUALITY-PLAYER-ELREF-INTERSECTION-TYPE`: type it as `HTMLMediaElement` and narrow where
  needed.
- `10-20-QUALITY-RESOLVEFPS-IS-A-PASSTHROUGH`: inline it.
- `10-20-QUALITY-PLAYER-STRIP-REUSES-ZOOM-BUTTON-CLASSES`: `.media-tool-btn` / `-group`.
- `09-29-QUALITY-PDF-IFRAME-SANDBOX-QUESTION-LEFT-OPEN`:
  - measure `sandbox` on the PDF `<iframe>` in dev **and** in a debug bundle
    (`[[debug-bundle-verifies-bundled-origin]]`)
  - pin the attribute, or record why not
  - the app ships `csp: null` (`[[app-ships-with-no-csp]]`), so this is worth the measurement

## WP11: Scratch workspaces out of the repo, and the reopened-pane probe  `[impact: Med · effort: S–M · risk: Low–Med]` · task

- `08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` (BL, medium): move `tmp/scratch/*` CC
  workspaces to D4.
  - **Sites to update:**
    - `CLAUDE.md` (2)
    - `docs/lessons/verify-self-tiers.md` (2)
    - `tooling/autofire-timing/probe.{sh,py}` (including the `"tmp/scratch/" not in` check)
    - `tooling/unclean-flag/hard-kill-check.sh`
    - `tooling/adjudicator-probe/corpus.ts` `isScratchSlug` (keep the old slug too, so historical
      transcripts still classify)
    - memory `dev-profile-for-f-b-verification.md`
    - the dev `projects.json`, which lives outside the repo, on the operator's machine (back it up
      first)
  - **Move with them:** the fixtures `restore-test`, `media-probe`, `f-b-prof` and `m15-probe`.
  - **Leave** the mock `"/tmp/scratch/…"` strings in tests alone, and keep throwaway vitest specs in
    the repo's `tmp/scratch/`.
  - **This removes the AGENT-RUN trigger only.** Two real sessions in one repo still collapse, so
    the entry is rewritten to that residual, not deleted.
- `11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS` (BL):
  - **probe first**, on a fresh `pnpm tauri:dev` launch with no HMR history
    (`[[hmr-stale-across-file-rename]]` is the known false positive)
  - reproduced → fix it in this WP
  - not reproduced → rewrite the entry to "installed-build watch" and leave it open

## WP12: `Workspace.tsx` extractions  `[impact: High (most-touched file) · effort: M · risk: Med]` · feature

R4. Runs after WP8, so it moves already-fixed code.
- `09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH#7`: extract `SupervisorHeaderControl`. It absorbs
  the seed effect.
- `08-26-QUALITY-DRIVEMODE-MINOR-POLISH` (d), together with
  `08-26-QUALITY-RESPAWN-INTENT-HOLD-IS-SCHEDULER-TIMING`:
  - extract `useDriveModeApply`
  - replace the `RESPAWN_INTENT_HOLD_MS = 400` sleep with a ref the spawn effect reads at spawn time
  - keep the 2026-09-23 R1 "disable while queued" behaviour byte-identical
- **Proof:**
  - render-unchanged against a HEAD worktree (`[[prove-render-unchanged-via-head-worktree]]`)
  - the `liveWorkspace.tsx` interaction harness for the apply path
  - `check:link` and the boot test, because exports move

## WP13: `SettingsPanel` split and `PickerRow`  `[impact: Med · effort: M · risk: Low–Med]` · feature

R4.
- `07-28-QUALITY-WP2-SETTINGSPANEL-NEAR-DOING-TOO-MUCH` (now 710 lines): one module per group.
  `ProfilesSettings` and `WorkflowSubstrateInfo` are already split out.
- `11-02-QUALITY-WP5-PICKER-ROW-SHOULD-BE-A-COMPONENT` (`ProjectPicker.tsx`, 772 lines): extract
  `PickerRow`.
  - ⚠️ The drive-mode `<select>` on the row is a deliberate exception (CLAUDE.md), so move it
    unchanged.
- **Proof:** render-unchanged against a HEAD worktree for both files.

## WP14: The comment-convention pass  `[impact: Med (closes about 20 entries) · effort: M · risk: Low]` · feature

R3. `08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` (BL) and its roster.
- **Guard FIRST.** Copy the single-authority pin pattern from `recycleSession.test.ts` ("the measured
  latencies have exactly ONE authority", with its anti-vacuity companion). Pick one authority per
  duplicated rule, write the pin, and only THEN turn the other sites into pointers.
- **Roster:**
  - all 17 COMMENT-tagged QF entries (`09-23-QUALITY-WP9-COMMENTS-CARRY-WIP-PROVENANCE-LABELS`,
    `…-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X`, `09-17-…-RATIONALE-STATED-THREE-TIMES`,
    `09-17-…-DO-NOT-MERGE-DEFENCE-REPEATED-FOUR-TIMES`, `09-14-…-LASTINDEX-COMMENT…`,
    `09-13-…-COMMENT-DUPLICATION-ACROSS-SUPERVISOR-MODULES`, `09-12-…-COMMENT-DENSITY-…`,
    `08-25-…-WP3-COMMENT-DENSITY-58-PERCENT`, `08-21-…-WP1-COMMENT-DENSITY-117-LINES-FOR-14`,
    `08-21-…-WP1-PIP-RATIONALE-AT-FOUR-SITES`, `08-18-…-WP4-ARCH-DOC-MIRRORS-TEST-FILE-HEADER`,
    `08-18-…-WP3-COMMENT-DENSITY-AND-RATIONALE-DUPLICATION`, `08-01-…-WP2-MINOR-BATCH#1,#2`,
    `08-02-…-WP4-MINOR-BATCH#1`, `09-22-…-WP4-COMMENT-DUPLICATION-ACROSS-PROMPT-MODULES`,
    `09-23-…-WP9-MINOR-BATCH#1`)
  - the 4 stub-only items (`m11-wp3`, `time-tracking`, `m10.9-wp2`, `m12-wp1` item 2)
  - the newer COMMENT nits: `10-27-…-OVERLONG-JSDOC-LINE-IN-VERDICT`, `10-26-…-UNWAITED-SEPARATE-TAIL-READ`,
    `10-21-…-MEASUREMENT-NUMBERS-REPEATED…`, `10-20-…-PLAYER-COMMENTS-CITE-WIP-PHASE-IDS`,
    `ANALYTICS-…-BATCH#4`, `SILENT-SUPERVISOR-…#1,#2`, `SUPERVISOR-ACTIVITY-…#1,#2`
- **Prove it with the parser-token diff** (`[[prove-comments-only-diff-via-parser-tokens]]`): no
  code token may change.

---

## Scope: what is NOT swept (anchors intact)

| Item | Disposition | Anchor / reason |
|---|---|---|
| `10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS` | Defer | The rewording was exhausted at WP3 3.5. Richer input or a lower bar → the `/product-vision` revisit |
| `09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` | Defer | Upstream: anthropics/claude-code#105187 |
| `09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`, `09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1` | Defer | Dogfooding, operator-owned (WP7 ruling) |
| `09-15-STAGING-AREA-FOR-PROMPT-INPUT` residual | Defer | Reopens on an operator dictation report |
| `07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` | Excluded | Feature-sized (M16.5 grill; upstream issue #1) |
| `11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT` | Defer | Low. Needs a capture first (does `SessionStart` fire before trust?) → next touch of the resume path |
| `08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` | Defer | Fires when a recycle menu id, panel or chord is added |
| `09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR` | Defer | Only if the count drifts again |
| `08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED` (QF) | Defer | Upstream process (mccc handoff §B.6) |
| The 11 upstream-only process entries (`09-17-OBSERVABLE-OUTCOME-WRITTEN-…`, `09-15-WIP-FILES-USE-PROSE-HEADERS…`, `09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW…`, `09-12-THE-TWO-UPSTREAM-COPIES…`, `08-25-PROBE-CHECK-EXEMPTS…`, `08-25-REFUTATION-FROM-TYPINGS…`, `08-28-SUPERSEDED-TEXT…`, `08-26-DELETE-ON-RESOLVE-REWRITE-PATH…`, `08-25-OBSERVABLE-OUTCOME-ASSERTED…`, `08-25-A-DELETED-EXPORT-BREAKS…` (high, local half resolved), `09-17-REVIEW-QUALITY-DIFF-WINDOW…`) | Untouched | mccc owns the change; Claudesk has nothing to do |
| Bury and delete set | WP1 | Listed there |

## Fold back and delete (on completion)

1. Confirm every finding named in WP2–WP14 is **resolved**. Each one is deleted from both backlog
   files in the same commit as its `**Backlog resolved:**` CHANGELOG line, by the close skill of
   the WP that fixed it.
2. Confirm WP1's Bury and Delete actions landed, and that `backlog-quality-findings.md` holds only
   findings named in §Scope.
3. Rewrite anything left PARTIAL to its residual (WP11's two entries are expected).
4. Tick `wbs.md` WP8 tasks 8.3 and the WP heading, then **delete this file.**
