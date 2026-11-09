---
shape: temporary-wbs
cycle: backlog-paydown-2026-11-08
created: 2026-11-08
status: in-progress
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
---

# Backlog-Paydown Sweep — 2026-11-08 (post-M16.5)

> ⚠️ **This is NOT a roadmap milestone.** It reserves no milestone number and is not a WP of any
> milestone. **This file is DELETED on completion**; see §"Fold back and delete". Do not resync it
> into `arch.md`.

**Run at:** the clean boundary after M16.5 closed (`77ca2a1`, 2026-11-08). `wip/` is empty.

**Inventory:** 37 entries in `backlog.md`: 33 SURFACEs + 4 code-quality pointer groups, which hold
**17 findings** in `backlog-quality-findings.md`. 4 of the 17 come from WP9, 6 from paydown WP14,
1 from WP13 and 5 from WP4; the last is a stale m12 body that is upstream-only.
**Dispositions:** **6 Claudesk-local items → Sweep**, plus 1 Bury and 1 Delete. **22 → Defer**, of
which 13 are upstream-mccc, 6 are release/dogfood/watch-gated, 2 are trigger-gated and 1 is
feature-sized. **2 ruled by the operator** (§Rulings).

This is a much smaller pile than the 2026-11-04 sweep's (34 SURFACEs + 91 findings), because
that sweep cleared the long tail. Almost everything that remains is either another repo's work or
waiting on an installed-build observation.

**Mode:** 3 (Autopilot). Unambiguous dispositions were applied automatically. Two items were ruled
by the operator (§Rulings). The defaults taken without asking are listed in §Defaults.

**ID key:** `SURFACE-2026-` is dropped from every ID below. **QF** means the body is in
`backlog-quality-findings.md`; **BL** means it is a `backlog.md` entry.

## ⚠️ Read before any WP that touches a test or a guard

The project's highest-frequency defect class is a **guard whose stated coverage exceeds its actual
coverage** (`docs/lessons/source-text-guards.md`, entries 11–18). WP3 is exactly that class (a
guard header that claims normalized matching the `absent` branch does not do). For every WP:

- **Mutation-prove each guard change INDIVIDUALLY.** Confirm the mutant landed in **executable**
  code (`sed -n '<line>p'`; use `perl -pi -e`, because BSD `sed` has no `\b`). An invalid probe and
  a real hole look identical.
- **Restore from a `cp` backup and verify with `shasum`. Never use `git checkout`**
  (`[[git-checkout-no-ops-on-untracked-file]]`).
- **A closed finding names the mutant that now dies.** "Tests added" is not closure.
- **Comments-only claims are proven by the parser-token diff** (`[[prove-comments-only-diff-via-parser-tokens]]`),
  not by eye.
- **Re-anchor by SYMBOL**, never by the line a finding cites (`[[cite-code-by-symbol-not-line]]`).
- **Gate:** `pnpm verify:auto`, with the timeout from `runtimes.md` (currently **207000**).
- **WIP file names:** prefix every WIP slug with `paydown-2026-11-08-` (the 11-04 sweep's
  `paydown-2026-11-04-*` and the 09-23 sweep's `paydown-wp<N>-*` already sit in `state/archive/`).
- **Path:** a WP marked **feature** runs `/feature-plan` (so `feature-review-quality` sees its
  diff). A WP marked **task** runs `/task-plan`. A task-path WP gets no code-quality review, so the
  two WPs that change production behavior or Rust primitives take the feature path.
- **Operator edits in the working tree** (the `backlog.md` entry
  `SURFACE-2026-11-06-CODIFY-RUNS-THE-FULL-SUITE-EVERY-PHASE`, three modified outbox files, the
  untracked `HANDOFF-to-mccc-2026-11-06-codify-nearby-tests.md`) stay **unstaged** unless the
  operator says otherwise. Stage around them with the blob method (memory
  `stage-around-operator-edits-via-blob`) and check that `git diff` afterwards shows only their block.

## Effort anchor (this project)

Benchmarked against the 2026-11-04 sweep's WPs (from the deleted WBS, `git show
53d4867^:workflow-system/product/backlog-paydown-wbs.md`) and M16.5's archived WPs. One
plan → build → ship → review → finalize run takes about a day and is **M**; anything smaller is
**S/XS**. Every item below is S or smaller. WP4 and WP6 are the biggest, at S–M.

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

## Rulings (operator, 2026-11-08)

- **R1: the trust-prompt fix is "read trust, announce".** Before the auto-resume inject fires, read
  CC's `.claude.json` → `projects[<path>].hasTrustDialogAccepted` from the workspace's **live
  profile** config root. If the folder is not trusted, do not fire: the picker announcement stays,
  and the operator runs the command by hand. **Rejected:** waiting for `SessionStart`, because it is
  unknown whether CC sends that event before or after the trust dialog, and if it comes before, the
  wait fixes nothing.
- **R2: Bury `10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS`.** It scores low impact,
  medium-plus effort and low risk, which is the "meh" zone. WP3 already measured that rewording
  the question cannot clear the bar on tail-only input, and breaks are now rare at the source.
  The Bury note keeps the pointer: the next lever is richer input (the emitted transition id, or
  whether the next skill presents its own checklist). Revive it if breaks become common again.

## Defaults taken without asking (flag any that are wrong)

- **D1: a local duplicate-heading guard on `backlog.md` is IN (WP3).** It is the optional local
  half of `08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` (BL), and it is cheap and safe, so
  Rule 1 applies. The entry itself stays open for its upstream half.
- **D2: re-measure F10b now (WP1),** although only 4 days have passed since the 11-04 measurement.
  The entry asks for a re-measure "at the next cycle boundary", and this is that boundary. If the
  post-11-04 sample is too small to read, record the n and leave the rate as measured on 11-04.
- **D3: WP2 DELETES the `WP9-BOUNDARY-SET-IS-STRING-TYPED` MINOR.** Its own suggested action is
  conditional ("if edge IDs ever become a literal union type"), and `EdgeId` is `string`
  project-wide (`workflowMachine/types.ts`). Typing this one set alone would be inconsistent, so
  there is nothing to do. It is closed as won't-do and gets a `**Backlog resolved:**` line.
- **D4: R1's failure default is to WITHHOLD.** If `.claude.json` is missing or unreadable, if the
  `projects` key for the path is absent, or if the flag is anything but `true`, the WP announces
  instead of firing. That is the safe direction: the cost is one typed command, while a wrong fire
  costs the session.
- **D5: WP5 and WP6 take the feature path; WP1–WP4 take the task path.**

---

## WP1: Bookkeeping (bury, measure)  `[impact: Low–Med · effort: XS · risk: Lowest]` · task

- **Bury** `10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS` (BL) → `backlog-archived.md`
  under `← Buried 2026-11-08 (backlog-paydown-2026-11-08 WP1)`, with R2's reason and the
  richer-input pointer. Burying is not resolving, so no CHANGELOG line; delete it from `backlog.md`
  in the same commit as the archive append.
- **Re-measure** `09-17-F10B-STOPPED-BEFORE-VERIFY-HUMAN-INSTEAD-OF-CHAINING-INTO-IT` (BL) with
  `_ref/claude-customization/tools/analysis/measure-f10b-handback-rate.py --since 2026-11-04`
  (AUTOPILOT/FSD-gated F10b turns). Append a dated `Measured` line to the entry. **Close rule:**
  0 stops on a meaningful n (≥ ~100 turns) → resolve (CHANGELOG + delete). A rate climbing back
  toward 7% → raise the priority and note that the upstream ask reopens. Anything else → keep it
  open at low (see D2).
- **Resolves:** the Bury (1 BL); F10b only if the close rule fires.
- ✅ **DONE 2026-11-09.** The Bury landed. **F10b RESOLVED:** the raw `--since 2026-11-04` reading was 5/62 (8.1%), but all 5 "stops", and the 3 behind the 11-04 reading's 1.5%, were FSD turns that correctly chained into `feature-verify-codify`, which the script's `vh()` cannot see. Corrected post-fix rate: **0 of 257**. The instrument defect is filed as `11-09-F10B-MEASUREMENT-COUNTS-A-CORRECT-FSD-CHAIN-AS-A-STOP` (BL, upstream, low).

## WP2: WP9 recycle comments  `[impact: Med · effort: XS · risk: Lowest (comments only)]` · task

- `WP9-RECYCLE-HISTORY-NARRATED-IN-FOUR-SITES` (QF, MAJOR): make `arch/workflow-supervisor.md` §E
  the one home for the before-WP9 history and the F8/F10 field measurement. Cut the comments at
  `RECYCLE_BOUNDARY_EDGES` (`verdict.ts`), `atNonFinalPhaseBoundary` (`wipPhases.ts`), the
  mid-phase `it.each` (`verdict.test.ts`) and the MID-PHASE test (`activityFunnel.test.tsx`) down
  to the invariant (F15 only; the WIP check is a second guard), each with a pointer to §E.
- `WP9-TEST-COMMENTS-USE-OLD-CONDITION-NUMBERS` (QF): **name** each condition instead of numbering
  it ("threshold falsified"), so a future renumber cannot stale them again.
- `WP9-DOCSTRING-CARRIES-A-DATE` (QF): drop "M16.5 WP9, 2026-11-07".
- `WP9-BOUNDARY-SET-IS-STRING-TYPED` (QF): close as won't-do (D3).
- **Prove comments-only** with the parser-token diff (filter JSDoc kinds; include a positive control).
- **Resolves:** all 4 WP9 QF bodies + the `recycle-at-clean-boundaries` pointer stub (BL).
- ✅ **DONE 2026-11-09.** Comments-only, proven by the parser-token diff (4 files IDENTICAL; positive control caught a one-token change). The test TITLES still carry "M16.5 WP9:" (string literals, outside the findings). The optional `once` rule was left for WP3.

## WP3: `singleAuthority` guard repair + backlog heading guard  `[impact: Med · effort: S · risk: Low (test-only)]` · task

Runs right after WP2 because both touch the comment-budget/single-authority surface.

- `WP14-ABSENT-RULES-MATCH-RAW-CASE-SENSITIVE-TEXT` (QF, MAJOR): match `absent` patterns against the
  same normalized haystack the `once` rules use (`textOf(f)`), and build the RegExp from
  `rule.pattern.flags` merged with `g` and `i`, rather than from `.source` alone. **Mutants that must die:** a label wrapped across two comment
  lines (`paydown\n// WP7`), a capitalized one (`(Paydown WP7,`), and a pattern given its own `i`
  flag. ⚠️ Tightening the matcher may find REAL violations at HEAD. Fix those, but list each one
  in the WIP, because they are evidence of the hole.
- `WP14-ABSENT-RULES-HAVE-NO-PERMANENT-POSITIVE-CONTROL` (QF): add one example label per `absent`
  rule, asserted to match in the meta block.
- `WP14-GUARD-HEADER-OVERCLAIMS-COPY-PASTE-ORIGIN` (QF): change it to "most instances", and note
  that the two paraphrase rules guard regrowth only.
- `WP14-BARE-DIGIT-FINGERPRINTS` (QF): anchor on the phrase `2282 → 2284`.
- `WP14-WORKFLOW-GATE-POINTER-MISSES-THE-TERMS-GAP` (QF): point `arch/workflow-gate.md` at the arm
  comment that actually holds the gap, or move the gap statement into the guard header.
- `WP14-COMMENT-BUDGET-DOES-NOT-NAME-THE-GUARD` (QF): one line in `source-text-guards.md`'s
  comment-budget section telling a new canonical home to add a `singleAuthority` rule.
- **WP2's optional `once` rule:** add one for the field-recycle sentence now that §E is its home.
- **D1: the backlog heading guard.** Assert that every `^## ` line in `workflow-system/state/backlog.md` matches
  an expected heading shape (`## SURFACE-<date>-<SLUG>`, `## Code-quality findings — <slug> (<date>)`,
  `## Buried`, `## Session Handoff — …`) and that no heading occurs twice. Do the same for
  `backlog-quality-findings.md`'s `## SURFACE-` headings. ⚠️ Positive control: a planted duplicate
  and a mangled `` ## ` `` heading must each fail.
- **Resolves:** all 6 WP14 QF bodies + the `paydown-2026-11-04-wp14-…` pointer stub (BL). The local
  half of `08-26-DELETE-ON-RESOLVE-…` is done; **rewrite** that entry's Status to say so (it stays
  open upstream).
- ✅ **DONE 2026-11-09.** The tightened matcher found **one REAL violation at HEAD**: `// Probe B:` in
  `src-tauri/src/adjudicator/mod.rs`, which the old case-sensitive `probe [AB]` missed. It was removed.
  No case-fold false positives. 11 mutants were each killed individually (wrapped label, capitalized
  label, own flags dropped, no case-fold, no normalize, broken pattern, duplicate heading ×2 files,
  mangled heading, field-recycle copy, transcript phrase copy); HEAD's guard passed the wrapped and
  capitalized mutants. `once` rule added for the field-recycle figures. ⚠️ Not guarded: a rule loop
  that stops calling `absentHits` (the examples would still pass); the shared matcher makes it unlikely.

## WP4: Picker live-test harness + the `findResultsReplaceLive` flake  `[impact: Med · effort: S–M · risk: Low (test-only)]` · task

- `WP13-PICKER-LIVE-TESTS-HAVE-NO-SHARED-HARNESS` (QF): add `src/components/picker/__tests__/livePicker.tsx`,
  modelled on `workspace/__tests__/liveWorkspace.tsx`. It should cover: mount with a
  projects/announce/profiles fixture, gate-via-broadcast, and a **realm-safe** `setNativeValue`.
  Migrate the five `*Live.test.tsx` files onto it.
- `11-07-FIND-RESULTS-REPLACE-LIVE-FLAKES-UNDER-FULL-SUITE-LOAD` (BL): **reproduce first** by looping
  the full vitest run 3–5 times and recording the hit rate. Then take the value setter from the
  element's own realm (`el.ownerDocument.defaultView.HTMLInputElement.prototype`) and assert the tag
  before setting. Put the realm-safe setter in ONE shared place and point
  `findResultsReplaceLive`, `fileOpErrorLive` and the picker harness at it. Those are the 4 files
  that use the `HTMLInputElement.prototype` idiom today; `grep -rln` it again before closing.
- ⚠️ **A migration is a refactor of tests:** each migrated file must keep failing on the mutant it
  was written for. Re-run one representative mutant per file after the migration.
- **Resolves:** the WP13 QF body + its pointer stub (BL); the flake (BL), but only if the post-fix loop
  runs clean. If it never reproduces, apply the realm fix anyway, record the loop's n, and resolve
  it as fixed-by-construction.

## WP6 runs before WP5: see the ordering note

> **Ordering note.** WP6 has the higher-impact item (a MAJOR) and is suite-covered (55 `#[test]`s
> across `runner.rs` and `adjudicator/mod.rs`), so its risk is Low–Med. WP5 changes live
> auto-resume behavior based on an external file whose schema Claudesk does not own, and the suite
> cannot see CC's trust dialog, so its risk is Med. Risk outranks impact, which puts WP6 first. The
> numbering follows the order the items were listed in, not the order they run.

## WP6: Shared subprocess primitives  `[impact: Med–High · effort: S–M · risk: Low–Med]` · feature

- `WP4-PROCESS-GROUP-PRIMITIVES-DUPLICATED` (QF, MAJOR): add a `src-tauri/src/subprocess/` module
  (process-group spawn, `kill_group`, `kill_and_reap`, `StopOnDrop`, the 250 ms grace constant, and
  the adjudicator's "does NOT do" limits doc). Make `workflow_install::runner` and `adjudicator` both
  use it. **Do NOT merge `Drain`** with `run_streaming`'s live per-line sink; the finding itself
  justifies keeping those separate.
- `WP4-GRACE-PATH-DROPS-QUEUED-OUTPUT` (QF): the `try_recv` drain before the break, with a test that
  emits a burst and then backgrounds a pipe holder.
- `WP4-RUN-STREAMING-OUTPUT-UNCAPPED` (QF): cap the accumulated output (discard past N bytes and
  append a truncation note), never by backpressure; this goes in the shared module.
- `WP4-THREE-WAYS-TO-RELEASE-THE-RUN-LOCK` (QF): `HeldRunLock::try_acquire(&control) -> Option<Self>`,
  used by all three commands and held by `RunGuard`. ⚠️ Move
  `every_substrate_touching_command_takes_the_single_run_lock` (it greps `running.swap(true` within
  400 chars) with the change, and mutation-prove the moved guard.
- `WP4-SPAWN-BLOCKING-HOP-REPEATED` (QF): one shared helper for the
  `spawn_blocking(...).await.map_err(...)` hop, used by `trash_path`, `on_worker` and `finish_on_worker`.
- ⚠️ `src-tauri/tests/sync_commands_do_not_block.rs` scans command bodies **transitively**, so moving
  primitives into a new module must keep it green **for the right reason**. Re-check its `LEDGER`
  and `ASYNC_COMMANDS` entries by name after the move.
- ⚠️ **GUI-PATH:** the adjudicator's `claude -p` spawn is install-sensitive. The suite cannot see a
  GUI-PATH regression, so the next `/release`'s installed smoke must show at least one `adjudicator (model): …`
  verdict in `supervisor-activity.log`. Note that in the WIP's ship section.
- **Resolves:** all 5 WP4 QF bodies + the `paydown-2026-11-04-wp4-…` pointer stub (BL).

## WP5: Auto-resume vs CC's folder-trust prompt (R1)  `[impact: Med · effort: S · risk: Med]` · feature

- `11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT` (BL), per R1 + D4:
  - A backend read (Rust, file IO only, in the spirit of M15's R-4) answers one boolean:
    `is_folder_trusted(path, profile)`. It reads `.claude.json` from the **live profile's config root**.
    That is `$CLAUDE_CONFIG_DIR/.claude.json` for a named profile and `~/.claude.json` for the
    default. ⚠️ **Verify the location empirically** against a real profile dir before coding it
    (`[[cc-hook-capture-beats-docs]]`: a live read beats a remembered path), and resolve the path
    key the way CC writes it (realpath? trailing slash?).
  - The fire gate (`shouldInject`, re-checked at fire time) gains the trust term. **Untrusted or
    unknown → no inject** (D4). Keep it pure; the caller passes the read result. ⚠️ Funnel through
    the existing `shouldInject`. Do not add a second check beside it, per the
    "extracting a pure machine proves the MACHINE, not its CALLER" lesson.
  - The picker announcement must not claim the command will run when it won't. Read
    `predictAction.ts` and decide whether the announcement wording changes for an untrusted folder
    (e.g. "trust the folder, then run `/session-restore`"). Keep the ruling's intent: the command
    is stated, and nothing is typed.
  - ⚠️ The `--continue` arm is spawn argv, not an injection, so it is unaffected. Confirm that CC's
    trust dialog does not also swallow `--continue` (if it does, record it; it is out of scope here).
- **Side observation to check, not to fix blind:** the original report saw the header show
  `↻ will continue` after the exit, even across a close/reopen. Reproduce it during verify. If it is
  real and separate, file it as a new SURFACE.
- **Live verify (agent-runnable):** `../claudesk-scratch/scratch-a` and `scratch-b` are never-trusted
  (per the entry). Put a `.session.md` in one, open it in a dev build: expect no injection, an
  honest announcement, and a CC that is still alive at the trust prompt. Then accept trust, close,
  reopen: the fire happens normally. ⚠️ An agent-launched dev build needs the full Claude-marker
  `env -u` strip (`[[agent-launched-app-cannot-verify-continue]]`).
- **Resolves:** the BL entry.

---

## Scope: what is NOT swept (anchors intact)

| Item (BL) | Disposition | Anchor / reason |
|---|---|---|
| `11-06-CODIFY-RUNS-THE-FULL-SUITE-EVERY-PHASE` | Defer, upstream | mccc's skill; sent 2026-11-06. Closes when mccc ships or declines it. |
| `09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS` | Defer, upstream | `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.1 |
| `09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER` | Defer, upstream | same handoff §D.8 |
| `09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM` (`I2`) | Defer, upstream | same handoff; deliberately not patched locally (ownership boundary) |
| `09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE` | Defer, upstream | Claudesk half done; `HANDOFF-to-mccc-m15-wp2.md` |
| `08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES` | Defer, upstream | same handoff §A.4 |
| `08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME` | Defer, upstream | same handoff §B.5 |
| `08-28-SUPERSEDED-TEXT-IN-DURABLE-DOCS-HAS-NO-CONVENTION` | Defer, upstream | same handoff §F.10 |
| `08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` | Defer, upstream (local half → WP3) | same handoff §F.11 |
| `08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS` | Defer, upstream | same handoff §A.2 |
| `08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC` | Defer, upstream (local half resolved) | same handoff §A.3 |
| `09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE` | Defer, upstream | same handoff §C.7 |
| `m12-wp1-probe-flag-store-and-announce` pointer (+ its QF body) | Defer, upstream | same handoff §B.6 |
| `09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` | Defer, release + dogfood | on-screen checks 1–3, ESCALATE; next `/release` + dogfooding |
| `09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1` | Defer, release + dogfood | item 2's seven checks + probe Q2 |
| `09-15-STAGING-AREA-FOR-PROMPT-INPUT` | Defer, operator-owned | reopens only on an operator dictation report after a release |
| `11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS` | Defer, watch | installed-build sighting only |
| `09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` | Defer, upstream-blocked | anthropics/claude-code#105187 |
| `09-17-F10B-…` | ~~Defer~~ → **resolved in WP1** (close rule fired once the FSD misclassification was corrected) | — |
| `08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` | Defer, trigger | first real two-sessions-per-repo use |
| `08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` | Defer, trigger | when a supervisor surface first needs its own guard arm |
| `09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR` | Defer, trigger | "if this drifts again". Checked 2026-11-08: the 9 → 10 change at WP13b propagated with **no** stale live claim (`arch/profiles.md` records it correctly as history), so the trigger is not met. |
| `07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` | Defer, feature-sized | a `drawLine` rewrite (upstream issue #1). A candidate for the `/product-vision` revisit, not a paydown item. |
| `10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS` | **Bury** (R2), executed in WP1 | → `backlog-archived.md` |

**Also not in this sweep, by design:** `/util-prune-claude-md` and the `MEMORY.md` trim are the
**next** step in the operator's order (paydown → prune → release), not backlog items.

## Fold back and delete (on completion)

1. Confirm every WP's findings are RESOLVED: each has a `**Backlog resolved:**` CHANGELOG line, and
   its QF body + BL pointer stub are deleted **in the same commit** (delete-on-resolve). The WP3
   heading guard will now catch a surviving duplicate.
2. Confirm the WP1 Bury landed in `backlog-archived.md`, and that the WP2 won't-do (D3) has its
   CHANGELOG line.
3. Carry any surviving obligation into its backlog entry, not into this file. Examples: WP6's
   installed GUI-PATH smoke at the next `/release`, and WP5's side observation if it was filed.
4. Delete this file, then commit: `chore(paydown-2026-11-08): fold back and delete the sweep WBS`.
