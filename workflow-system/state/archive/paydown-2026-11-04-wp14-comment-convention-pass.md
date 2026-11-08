---
drive_mode: autopilot
---

# Feature: Paydown WP14 — the comment-convention pass

**Workflow:** feature
**State:** Completed 2026-11-07 (ship `20930c3`)
**Created:** 2026-11-07
**Sweep:** `workflow-system/product/backlog-paydown-wbs.md` → WP14 (M16.5 WP8, task 8.3; ruling R3)
**Resolves:** `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` (BL) and its roster
(listed per phase below; bodies in `backlog-quality-findings.md`, stubs in `backlog.md`).

## Problem Statement

Rationale duplication (T1) and comment density (T2) are this project's most persistently
re-flagged finding. Per-WP trimming was measured as NOT converging (four consecutive reviews of one
file), and the standing finding records the shape that does hold: **(a)** one authority per rule,
**(b)** every other site reduced to a pointer, **(c)** a GUARD so it cannot drift back. M13 WP4's
latency pin (`recycleSession.test.ts`, "the measured latencies have exactly ONE authority") is the
proven precedent. This WP applies that shape to the roster the sweep attached, writes the guard
BEFORE deleting any site, and proves with a parser-token diff that no code token changed except a
short list of declared edits.

## Plan-time decisions (autopilot: taken, disclosed — flag any that are wrong)

- **D1. One table-driven guard, `src/__tests__/singleAuthority.test.ts`**, generalizing the
  recycle pin. Each rule is `{ id, authority, fingerprints[] }`: no scanned file other than the
  authority may contain a fingerprint, and the authority must contain every one (the anti-vacuity
  half, which blocks "fixing" duplication by deleting the fact). Plus a walker-reach meta-test and
  a "rules table is non-empty / every authority exists" check. The existing recycle pin stays where
  it is (not migrated: moving a working guard is churn).
- **D2. Scan scope:** `src/**` (non-test AND test files), `src-tauri/src/**`, `src-tauri/tests/**`,
  `src-tauri/Cargo.toml`, `tooling/**` (excluding the frozen adjudicator fixture JSON),
  `docs/lessons/**`, `workflow-system/product/arch/**`. **Out of scope:** `CLAUDE.md` (a
  harness-loaded rule index that restates with a pointer by design), `workflow-system/product/*.md`
  other than `arch/` (historical record), `backlog*.md`, `CHANGELOG.md`, the archive. Stated at
  the guard so it does not claim more than it checks (the M13 WP4 scope-boundary lesson).
- **D3. Fingerprints are exact, distinctive substrings, `grep -c`'d across the scope BEFORE
  adoption** (memory `raw-guard-substring-must-be-unique-to-its-site`): measured numbers where
  the fact is a measurement (`40 of 96`, `95/103`, `2282`), otherwise a phrase unique to the
  rationale. ⚠️ **Known limit, stated at the guard:** a paraphrase evades a substring guard. The
  guard stops copy-paste regrowth, which is how every roster instance arose; it is not a semantic
  check (`source-text-guards.md` entry 14's polarity trap applies: a "do not re-add" note must not
  itself carry the fingerprint).
- **D4. No repo-wide density budget and no repo-wide WIP-label ban.** A ratio cap would fire on
  load-bearing retraction blocks the roster explicitly says to KEEP (`XtermPane.tsx`), and
  `P\d+\.\d+` labels occur across much of `src/`, so a ban would multiply this WP's scope.
  Instead, each provenance-cleaned file gets a scoped **label-absence** rule in the same table
  (`kind: "absent"`, the file list plus the label regex), which stops regrowth exactly where the
  cleanup happened.
- **D5. Authorities (filled from each finding's own suggestion unless noted):**
  | Rule | Authority | Pointer sites |
  |---|---|---|
  | Vitest reads a missing binding as `undefined` + the "Blind to" list | `docs/lessons/verify-auto-gate.md` §check:link | `linkCheck.mjs`, `source-text-guards.md` §19, `appBoot.test.tsx`, `moduleGraphBoot.test.ts`, `turnNavExportContract.test.ts` |
  | Main-thread rationale + the `cc_kill → poll_reaped → sleep` chain | `src-tauri/tests/sync_commands_do_not_block.rs` module doc (lesson `pip-nspanel-main-thread.md` keeps its full account as the human-facing home, and is a second allowed site) | `cc_kill` / `supervisor_adjudicate` command docs |
  | Hotkey comment-map rationale | `chordRegistry.ts` header | the hotkey block in `HotkeySettings.tsx` (moved there at WP13) |
  | "Do not merge with the drive-mode modules" | whichever of `workspaceSupervisor.ts` / `supervisorToggleIpc.ts` holds the fuller statement (read at build) | the other |
  | "narrow router sends 40 of 96 / misses 10 of 32" | `adjudicator.ts` | `verdict.ts`, `verdict.test.ts` |
  | "2282 → 2284 → 2286" corpus drift | `src-tauri/src/transcript/mod.rs` (the measured surface) | `verdict.ts` ×2 |
  | "bitten this repo four times" | `turnEnd.ts` | `fanOut.ts` |
  | WP2 re-measure numbers (95/103, 126/188, the CI, 8/29) | **`adjudicatorRemeasure.test.ts` header** `(decision)` | `adjudicator.ts` header → verdict + pointer |
  | Recycle is NOT a `SKILL_BUTTONS` member | `recycleButton.ts` module doc | `skillButtons.ts`, `Workspace.tsx` ×2, two test files |
  | PiP-denylist rationale | `denylist()` doc in `window_state/mod.rs` | `mod.rs` 2nd site, `lib.rs` ×2, `Cargo.toml` |
  | `.workspace-jump-turn-btn` deletion rationale | `App.css` site | `Workspace.tsx`, two test headers |
  | Prompt modules: the funnel argument; the live-caller provenance; `injectCommand` no-retry/no-cancel | `sendStagedDraft.ts`; `promptDraftSync.ts`; `injectCommand`'s own module | the other prompt modules (`autoResumeFire.ts`, `draftHistory.ts`, …); the WP3→WP4 seam narrative is history → deleted |
  | M10.9 milestone rationale (~6 sites) | `useWorkflowFeaturesEnabled`'s module doc (confirmed at build) | the rest |
  | Docs latch-bug account | `fetchLatch.ts` header | `DocsPanel.tsx` |
  | Guard mechanics (arm-5 ungated half, probe-each-arm, `WORKFLOW_TERMS` gap) | `offInvariantGuard.test.ts` header (executable) | `arch/workflow-gate.md` keeps its table, three paragraphs → one pointer |
  `(decision)` on the WP2 row: the finding said "keep the numbers in `wbs.md`". `wbs.md` is
  archived at M16.5 finalize, which would break the anti-vacuity path, so the authority is the
  measurement's own executable home instead. `wbs.md`'s probe-outcome record is left untouched.
- **D6. Proof of "comments only":** TS/TSX/JS via the TypeScript-parser leaf-token diff
  (JSDoc nodes filtered, positive control) per memory `prove-comments-only-diff-via-parser-tokens`;
  Rust via `git diff -U0` filtered to non-comment lines; CSS by stripping `/* */` and whitespace
  and comparing; MD needs none (prose), but each MD edit gets the **token-set diff** from
  `grep-addressed-doc-loses-value-to-prose-rewrite` so no identifier is silently dropped. The
  script lives in the session scratchpad and is re-created if lost. **Declared non-comment edits
  are enumerated per phase before running**; anything else in the diff is a finding.
- **D7. `CLAUDE.md`** gets only the two one-line reductions the roster names (the gate-order
  line's Vitest clause → pointer; the main-thread bullet's chain → pointer), staged as exact hunks
  (the operator's WP9 insert stays unstaged). `/util-prune-claude-md` stays DEFERRED (operator).
- **D8. Phase gate:** each phase runs `pnpm verify:auto` (timeout 207000). No runtime surface
  changes, so verify-self is CLI evidence (gate + token diff + mutation table), not the live app.

## Work Tree

- [x] Phase 1: The guard + rationale-duplication collapse
  **Roster resolved here:** `09-23-QUALITY-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X`,
  `09-23-QUALITY-WP9-MINOR-BATCH` (#1), `09-17-QUALITY-RATIONALE-STATED-THREE-TIMES`,
  `09-17-QUALITY-DO-NOT-MERGE-DEFENCE-REPEATED-FOUR-TIMES`,
  `09-13-QUALITY-COMMENT-DUPLICATION-ACROSS-SUPERVISOR-MODULES`,
  `10-21-QUALITY-WP2-MEASUREMENT-NUMBERS-REPEATED-IN-FOUR-PLACES`,
  `08-18-QUALITY-WP3-COMMENT-DENSITY-AND-RATIONALE-DUPLICATION` (part a),
  `08-21-QUALITY-WP1-PIP-RATIONALE-AT-FOUR-SITES`, `08-25-QUALITY-WP3-COMMENT-DENSITY-58-PERCENT`,
  `09-22-QUALITY-WP4-COMMENT-DUPLICATION-ACROSS-PROMPT-MODULES`, the `m10.9-wp2` stub,
  `08-18-QUALITY-WP4-ARCH-DOC-MIRRORS-TEST-FILE-HEADER`, `08-02-QUALITY-WP4-MINOR-BATCH` (#1).
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/__tests__/singleAuthority.test.ts` exits 0 with one
    `it()` per rule plus the anti-vacuity and walker-reach tests (a `Tests N passed` line, N ≥ rule count + 2).
  - CLI (mutation, restored by `cp` + `shasum`): for EACH rule, re-adding one fingerprint to one
    former pointer site fails exactly that rule's test; deleting a fingerprint from the authority
    fails its anti-vacuity test. Every mutant lands (`grep -c` before/after) and every one dies.
  - CLI: before the pointer edits, the new guard FAILS on the pre-pass tree for every
    duplication rule (guard-first: it sees the roster's duplication), then passes after.
  - CLI: the token-diff script over every file touched in this phase reports 0 changed code
    tokens (TS), 0 non-comment `+/-` lines (Rust), 0 CSS rule changes, with a positive control
    that reports a planted literal change. Declared non-comment edits: the new test file only.
  - CLI: `pnpm verify:auto` exits 0; `pnpm check:link` prints "every entry linked cleanly".
  **Alignment questions:**
  - The D5 authority table, now visible in the guard's `RULES`: is each rule's home the one you'd look in first?
  - (decision) The WP2 numbers live in `adjudicatorRemeasure.test.ts`'s header rather than `wbs.md` (which gets archived): OK?
  **Build record (2026-11-07):**
  - Guard: `src/__tests__/singleAuthority.test.ts`, 16 `once` rules (35 tests incl. 3 meta-tests).
    It excludes itself (it holds every fingerprint as data) and skips `node_modules` (the first
    run counted `tooling/demo/node_modules`). Matching is on a normalized haystack (comment
    leaders stripped, lines joined) because comment wrapping split `recycleButton.ts`'s phrase.
  - Guard-first evidence: the first 6 rules failed on the unedited tree (37 offender lines,
    `scratchpad/wp14/prepass-1.txt`); of the 10 added later, 9 fingerprints were present at HEAD
    in a former site and gone after. The 2 paraphrase rules (chord-map rationale, do-not-merge
    defence) pass at HEAD by construction: they only block future copy-paste, as D3 states.
  - Mutation table: for every rule, re-adding the fingerprint to a former site fails exactly that
    rule's test, and deleting it from the authority fails exactly its anti-vacuity test (32
    mutants, each run alone, each restored and `shasum`-checked). One expected extra: deleting
    Recycle's fingerprint also fails the haystack meta-test, which reads the same phrase.
  - Proof: token diff 0 changes over 25 TS/TSX/MJS files, 0 non-comment lines in 4 `.rs` files
    and `Cargo.toml`; positive controls (a renamed export, a JSX `.slice(1)`) each reported.
    MD backtick-identifier diff: the two identifiers that would have left every durable doc
    (`RECYCLE_SESSION`, `RECYCLE_TOKEN_THRESHOLD`) were put back into `workflow-gate.md`; the
    ask-shaped ~8/29 figure moved from `adjudicator.ts` into `arch/workflow-supervisor.md` §D.
  - **Amendments to the plan (disclosed):**
    - D2: rules may carry a `scope`. Two do (`src/state` for the caller-shape count;
      `src/components/workspace` for `injectCommand`'s no-cancel fact), because those facts are
      cited as one-clause reasons across the supervisor and sweeping every citation exceeds the
      roster.
    - D5 WP2 row: the figures' authority is `arch/workflow-supervisor.md` §D **plus**
      `adjudicatorRemeasure.test.ts` (the figures are in a test NAME, which is code, so a
      comments-only pass cannot remove them there). Only `adjudicator.ts` became a pointer.
    - No-edit resolutions, with evidence: `08-25-…-58-PERCENT`'s four-copy deletion rationale
      had already collapsed to `App.css` + one `Workspace.tsx` import comment (that comment is now
      a pointer; pinned by the jump-turn rule); the `m10.9-wp2` stub's multi-sentence rationale is
      already single-homed (`useWorkflowFeaturesEnabled.ts` front end, `workflow_gate/mod.rs`
      back end, `settings.rs` points); every other site is a one-clause citation of the
      invariant. No rule for it: its vocabulary ("present-but-disabled") is the invariant's name,
      used in 6+ files.
    - The Docs latch duplicate (`08-02-…#1`) is trimmed with no rule: "permanently blank panel" is
      cited as precedent in other Docs modules.
    - `CLAUDE.md`: only the gate-order line's Vitest clause. The main-thread bullet carries no
      chain restatement, so it is untouched (prune deferred).
  - [x] P1.1 Re-anchor every Phase-1 roster item by SYMBOL and record each rule's actual sites (the finding's line numbers are stale by design)
  - [x] P1.2 `grep -c` each candidate fingerprint across the D2 scope; keep only ones that hit the duplicated sites and nothing unrelated
  - [x] P1.3 Write `singleAuthority.test.ts` (rules table, scope walker incl. `.rs`/`.toml`/`.md`/`.mjs`, anti-vacuity, walker reach, scope statement); run it and record that it FAILS on the duplicated tree
  - [x] P1.4 Collapse each rule's non-authority sites to a one-line pointer, keeping every site's local invariant and what-to-do-on-failure sentence
  - [x] P1.5 Token diff (TS/Rust/CSS) + MD token-set diff + positive control
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT 0 in 62 s: lint (1 pre-existing `XtermPane.tsx` exhaustive-deps warning, not ours), `format:check` (first run flagged the new guard; Prettier applied), `tsc`, `check:link` "every entry linked cleanly (main, pip)", vitest 292 files / 3785 tests, `cargo fmt --check`, clippy `-D warnings`, cargo 1069 lib tests.
    — evidence: `vitest run src/__tests__/singleAuthority.test.ts` → 35 passed; the 32-mutant table in the build record (each rule killed both directions).
  - [x] verify-self  (runner subagent, independent re-run; no integration boundary — comments-only + one new test file)
    - [x] guard run — evidence: `vitest run src/__tests__/singleAuthority.test.ts` → EXIT 0, 35 passed (16 rules × 2 + 3 meta)
    - [x] mutation table — evidence: driver 31 KILLED + the declared Recycle double-fail (judged correct: the meta-test reads the same phrase); 3 hand spot-checks (2nd-authority delete, wrapped re-add, Rust `///` re-add) each failed only its own test; all 28 touched files `shasum`-restored; `git status` identical before/after
    - [x] guard-first — evidence: the test's own normalization applied to `git show HEAD:` over 739 in-scope files → 14/16 rules fail at HEAD; the 2 paraphrase rules have no in-scope hit (expected). Also: `autoResumeFire.ts` gained its fingerprint in this phase.
    - [x] token diff — evidence: 25 TS/TSX/MJS files OK (TOK_EXIT 0); Rust/TOML filter empty (only TOML `#` comments hidden, no `#[...]`); runner's own positive controls on scratch copies → DIFF, exit 1
    - [x] gate — evidence: verify:auto log post-dates the last edit, green; `pnpm check:link` → "every entry linked cleanly (main, pip)"
    - [x] pointer-site read — evidence: 4 sites (verdict.ts, lib.rs, PromptPanel.tsx, workflow-gate.md) point at authorities that carry the fact; no local invariant lost
    - [x] align: D5 authority table — evidence: rules table captured from `singleAuthority.test.ts` (16 rows: id → authority → fingerprints)
    - [x] align: (decision) WP2 figures' home — evidence: `adjudicator.ts` header now "Figures: `arch/workflow-supervisor.md` §D (condition 3)"; arch §D condition 3 carries 95/103, 126/188, CI, 0.665–0.676, ~8/29, 8/21; test name at `adjudicatorRemeasure.test.ts` carries 95/103 + 126/188
    - note (not blocking, pre-existing): arch §D condition 3 cites `wbs.md` → "Probe outcomes" → WP2, which moves at M16.5's `/product-finalize` archive (that skill rewrites archived paths).
  - [x] verify-human — operator: "approve all" (2026-11-07)
    - [x] P1.verify-human.1 (a) The 16-rule authority table: is each rule's home the file you'd look in first?
    - [x] P1.verify-human.2 (c, decision) WP2 figures live in arch §D + the remeasure test, not wbs.md
    - [x] P1.verify-human.3 (c, decision) Two rules are scoped to a module family rather than the whole repo
  - [x] verify-codify — no new test: the verified behaviour IS `singleAuthority.test.ts`, already permanent and mutation-proven both directions. No integration boundary (comments + one new test file). The `absent` rule kind has no instance yet; Phase 2 adds them.
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 45s, history ≤119s)
    — evidence: `pnpm verify:auto` → EXIT 0 in 58 s, vitest 292 files / 3785 tests, cargo 1069 lib tests.

- [x] Phase 2: Provenance and density (no duplication involved)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the sweep's R3 ruling; Phase 1 approved as-is.
  - Requirements unchanged: yes — roster and keep/cut splits unchanged.
  - Solution still feasible: yes — Phase 1's guard now has the `absent` kind ready for these files.
  - No superior alternative discovered: yes — Phase 1 confirmed per-file cuts plus a pinned rule hold.
  **Verdict:** proceed
  **Roster resolved here:** `09-23-QUALITY-WP9-COMMENTS-CARRY-WIP-PROVENANCE-LABELS`,
  `08-21-QUALITY-WP1-COMMENT-DENSITY-117-LINES-FOR-14`, `09-12-QUALITY-COMMENT-DENSITY-IS-A-THIRD-COPY-OF-THE-WIP`,
  `08-18-QUALITY-WP3-…` (part b: recycle module density), `10-20-QUALITY-PLAYER-COMMENTS-CITE-WIP-PHASE-IDS`,
  `09-14-QUALITY-LASTINDEX-COMMENT-IS-THE-HEAVIEST-RATIO-IN-THE-DIFF`, `08-01-QUALITY-WP2-MINOR-BATCH` (#1, #2),
  the `m11-wp3` and `time-tracking` stubs, the `m12-wp1` stub item (2), and the
  `moduleGraphBoot.test.ts` history half of the 8X finding.
  **Observable outcomes:**
  - CLI: each cleaned file has a `kind: "absent"` rule in `singleAuthority.test.ts` for its WIP
    labels (e.g. `probe P4`, `mutant R1`, `P3 verify-self`, `verify-human.3`); the rule passes,
    and re-inserting one label into one cleaned file fails it (mutation, restored by `cp` + `shasum`).
  - CLI: token diff over every touched file = 0 code tokens / 0 non-comment Rust lines, with a
    positive control. **Declared non-comment edit:** removing the private-helper dedup test in
    `src-tauri/src/docs/mod.rs`, whose invariant `the_fixed_doc_lists_are_disjoint_from_the_wbs_glob`
    already pins at its source (finding #2's own suggestion). Evidence: `cargo test` lib count
    drops by exactly 1 vs Phase 1's count, and the disjointness test still passes.
  - CLI: every KEEP item named in the roster is still present, checked by `grep -c` of one
    distinctive phrase each: the four plugin-source properties and two flag-omission rationales
    (`window_state/mod.rs`), the rejected-backpressure rationale at `Drain`'s doc and the fixture-size
    reasoning (adjudicator, sync guard), the failure-direction paragraphs (`m15SupervisorFixture.test.ts`),
    the whitespace-normalization comment (time-tracking copy guards), `XtermPane.tsx`'s two retraction blocks,
    the Rust hazard test's reopening-condition paragraph.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:** none (each cut follows the finding's own keep/cut split, which the checks above pin).
  **Build record (2026-11-07):**
  - Cuts, by file (labels and history only; every KEEP item present, `grep -c` = 1 each):
    `adjudicator/mod.rs` (15 labels), `sync_commands_do_not_block.rs` (2), `window_state/mod.rs`
    (the 1280×800 / display / backlog-entry / "verified at P1.3" / screenshot narrative),
    `m15SupervisorFixture.test.ts` (the 223 → 127 → 96 history; its header pointed at a `wip/`
    path that no longer resolves, now the archive record), the three Recycle modules (WIP and
    review labels; "an earlier revision did X" turned into "never do X"), `MediaPlayer.tsx` +
    `mediaClock.ts`, 10 Docs modules, `wipPhases.ts` (13 lines → 3), `panelHost.ts` (code first,
    guard argument second), `settingsTimeTrackingCopy.test.ts` (63 → 56 comment lines, all
    audit labels), `config_store/mod.rs` (the redundant hazard-test paragraph; the reopening
    paragraph kept), `docs/mod.rs` (dedup prose).
  - ⚠️ **A STALE comment found and corrected:** `DocsPanel.tsx`'s header said "Still no
    `fs-change` listener — live reload is WP4's"; WP4 shipped it and the listener exists.
  - Guard: 7 `absent` rules added (42 tests). Each pattern matched its files at HEAD (1–15
    hits per file, except `frontmatter.ts`, whose one label the pattern did not cover; it was
    left out of the rule) and matches none now. Each rule mutation-proven: one planted label
    fails exactly that rule; all restored and hash-checked.
  - Proof: token diff over all 41 changed TS/TSX/MJS files (cumulative vs HEAD) → 0 changes,
    exit 0; Rust/TOML non-comment lines → none.
  - **Amendment (disclosed):** the declared non-comment edit was NOT taken. `docs/mod.rs`'s
    private-helper dedup test stays: the disjointness test pins why the dedup branch is
    unreachable, and the helper test pins what it does once reachable; deleting it would let
    the branch be deleted with the suite green. Only its prose was trimmed, so `cargo test`'s
    count is unchanged (the plan's "drops by exactly 1" evidence no longer applies).
  - Order note: the plan put the `absent` rules before the cuts; they were written after, and
    guard-first is shown instead by running each pattern against `git show HEAD:`.
  - [x] P2.1 Re-anchor by symbol; for each file, list KEEP vs CUT against the comment-budget test ("would a reader who never saw the WIP decide worse without this?")
  - [x] P2.2 Add the label-absence rules first; confirm they FAIL on the pre-cut files
  - [x] P2.3 Cut the provenance; compress `lastIndex` to one line; reorder `panelHost.ts`'s seam comment (code first, guard argument second); remove the redundant `docs/mod.rs` helper test
  - [x] P2.4 Token diff + KEEP-phrase checks + positive control
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT 0 in 58 s: lint (only the pre-existing `XtermPane.tsx` warning), `format:check`, `tsc`, `check:link` "every entry linked cleanly (main, pip)", vitest 292 files / 3792 tests (+7: the `absent` rules), `cargo fmt --check`, clippy, cargo 1069 lib tests (unchanged: no Rust test removed).
    — evidence: the 7-mutant `absent` table in the build record (each killed, each restored).
  - [x] verify-self  (runner subagent, then a fresh re-verify after an in-place fix; no integration boundary — comments + guard rules)
    - [x] absent rules — evidence: 42/42; all 7 patterns matched their files at HEAD (1–15 hits) and none now; runner's own planted labels in 5 files each failed exactly their rule, restored + hash-checked. After the fix: patterns widened (`\(R\d\)`; Recycle `\bP\d+\.\d+\b|\(Phase \d\)|WP\d+ Phase \d`), each widened term killed by a planted label, durable anchor `→ "Phase 2 — Q3"` not matched.
    - [x] token diff — evidence: 41 TS/MJS files OK (exit 0); 9 src-tauri .rs/.toml files print nothing after the comment filter; positive controls on scratch copies fired.
    - [x] amendment (dedup test kept) — evidence: deleting the dedup early-return → `dedupes_a_file_matched_twice` FAILED, `the_fixed_doc_lists_are_disjoint_from_the_wbs_glob` ok; cargo lib count 1069 unchanged.
    - [x] KEEP items — evidence: `grep -cF` = 1 for all 20 phrases; `XtermPane.tsx` byte-identical to HEAD.
    - [x] gate — evidence: verify:auto log post-dates the source edits (only restored mutation files newer); `pnpm check:link` clean; `cargo test --lib docs::` 20 passed.
    - [x] correctness read — evidence (re-verify): fixes (a)–(g) present and TRUE against the code: `docs/mod.rs` claim checked against `PRODUCT_DOCS`/`STATE_DOCS`/both globs; the archive pointer's file holds the `[[slug]]` decision (:459); supervisor reaches `recycleSession` (`Workspace.tsx` `onRecycle` → `fireRecycle()` → `recycleSession`); all new cross-references resolve; no added line > 100 chars.

  - [x] verify-human — operator: "approve" (2026-11-07)
    - [x] P2.verify-human.1 (c, decision) Keep `docs/mod.rs`'s `dedupes_a_file_matched_twice` (plan said delete it) — kept
  - [x] verify-codify — no new test: the 7 `absent` rules are the codified form (mutation-proven). No integration boundary.
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 58s, history ≤119s)
    — evidence: 1st run EXIT 1 — one FLAKY failure in an untouched file (see `## Test Triage` below); re-run `pnpm verify:auto` → EXIT 0 in 65 s, vitest 292 files / 3792 tests, cargo 1069 lib tests.

- [x] Phase 3: The comment MINORs
  **Roster resolved here:** `10-27-QUALITY-WP3-OVERLONG-JSDOC-LINE-IN-VERDICT`,
  `10-26-QUALITY-WP4-UNWAITED-SEPARATE-TAIL-READ-UNEXPLAINED`, `09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH`
  (#1, #2), `09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH` (#1, #2),
  `11-06-QUALITY-WP8-POPOVER-FOCUS-RULE-SPLITS-THE-ANCHOR-COMMENT`, `11-06-QUALITY-WP8-NULL-OFF-THE-WIRE-COMMENT-IS-FALSE`,
  `11-06-QUALITY-WP13-PICKERROW-MOVED-COMMENT-INDENTATION`, `11-06-QUALITY-WP12-POINTER-COMMENTS-DESCRIBE-HISTORY`.
  **Observable outcomes:**
  - CLI: token diff over every touched file = 0 code tokens, with a positive control.
    **Declared non-comment edit:** the `.supervisor-activity-popover:focus` rule moves below the
    positioning block in `App.css`. Evidence: the CSS rule multiset (selector + declarations) is
    identical before/after, and the moved rule shares no property with any rule between its old
    and new position (so cascade order cannot change a computed value).
  - CLI: `awk 'length > 100'` over `verdict.ts` comment lines prints nothing at the applied-mode JSDoc.
  - CLI: silent-supervisor #1: exactly one module's header claims ownership of the terminal-report
    strip, and the other states it is a defence-in-depth second strip (`grep -c` of each phrasing);
    #2 is resolved by documenting the `isMeta` case in `readTurn`'s doc (no rename, so 0 code tokens).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:** none.
  **Build record (2026-11-07):**
  - Relevance check (feature-plan §4b): all 8 findings re-read against the code and still live;
    none had been resolved since filing.
  - The `useSupervisor.ts` premise HELD, so the sentence was written (no SURFACE): `isTurnComplete`
    defines the late-flushed line as the one carrying a terminal `stop_reason`, and a `Skill`
    tool_use never ends a turn, so the most recent invocation `lastSkillInvocation` reads is always
    on disk before `Stop`.
  - Silent-supervisor #1: `ccInputRouting.ts` is the owner (it serves BOTH readers, the watermark
    and the turn-attribution cancel); `unsentInput.ts`'s header now points at it and names its own
    strip defence in depth. #2: a 2-line pointer in `readTurn`'s doc to `lastUserProseIndex`, which
    already documented the `isMeta` case.
  - Supervisor-activity #1 repointed to the `host.enabled` re-check in `onTurnEnd` (the edited
    paragraph reflowed to 100 columns). #2: `FanOutOutcome` got its doc back.
  - `PickerRow.tsx`: four blocks re-indented to opener + 3 (each shifted 7 columns left); text unchanged.
  - Left alone, by the "comments only" rule: the test TITLE
    `workspaceStatus.test.ts` "…or a null off the wire…" is a string literal, so rewording it would be
    an undeclared code-token edit; the comment inside it was the finding's target and is fixed.
  - [x] P3.1 Apply the eight MINOR edits; for the unwaited tail read, confirm from `useSupervisor.ts` that the question it answers is the last INVOCATION (which precedes the flushed line) before writing the one sentence; if that does not hold, stop and SURFACE instead of documenting
  - [x] P3.2 Token diff + CSS rule-multiset check + positive control
    — evidence: `tokdiff.cjs` (re-created) over the 11 touched TS/TSX files → all OK, exit 0. Controls: a flipped `!host.enabled` → DIFF exit 1; a JSX-text insert in `PickerRow.tsx` → DIFF exit 1; a JSX-comment edit and a JSDoc edit → OK exit 0.
    — evidence: `App.css` 606 rules before/after, multiset identical, order identical except the moved rule, which crosses only `.supervisor-activity-popover` and shares no property with it (`outline` vs positioning/box props).
    — evidence: `verdict.ts` 0 lines > 100 chars; no added line > 100 chars anywhere in the `src` diff; "once, for BOTH" / "now strips them first" → 0; `readTurn` doc mentions `isMeta` ×1; both WP12 pointers → 0.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT 0 in 46 s: lint (only the pre-existing `XtermPane.tsx` :943 `exhaustive-deps` warning), `format:check`, `tsc`, `check:link` "every entry linked cleanly (main, pip)", vitest 292 files / 3792 tests (unchanged count: Phase 3 adds no test), `cargo fmt --check`, clippy, cargo 1069 lib tests.
  - [x] verify-self  (runner subagent; no integration boundary: comments + a cascade-neutral CSS move, no user-visible change)
    - [x] token diff + CSS move — evidence: `tokdiff.cjs` over the 11 TS/TSX files → exit 0, all OK; runner's OWN controls: code token → DIFF exit 1, comment → OK, JSX string → DIFF, JSX comment → OK. CSS (runner's own parser): 612 = 612 rules, multiset equal, only positions 57/58 swapped, shared props with the crossed rule = ∅; CSS control (`outline: none`→`0`) → multiset unequal.
    - [x] verdict.ts width — evidence: applied-mode JSDoc now lines 95–98 at 9/97/50/9 chars (HEAD: one 143-char line); max line in file 99 chars. awk's byte count flags 5 other lines (82–98 chars, multibyte glyphs), none in the JSDoc.
    - [x] strip owner + `isMeta` — evidence: "owning strip" ×1 (ccInputRouting.ts), "owns the strip" ×1 (unsentInput.ts, naming `routeCcInput`), "defence in" ×1 each, 0 in terminalReports.ts; strip calls at ccInputRouting.ts:70 / unsentInput.ts:113; transcript.ts:235–236 `isMeta` lines, tokens unchanged (1021).
    - [x] gate — evidence: `pnpm verify:auto` → exit 0 in 43 s; vitest 292 / 3792; cargo 1069 lib; one pre-existing `XtermPane.tsx:943` warning.
    - [x] correctness read — evidence: every new claim checked TRUE against code (`isTurnComplete` terminal-`stop_reason` rule; `lastSkillInvocation` at verifyHumanPause.ts:200; `onTurnEnd`'s `if (!host.enabled) return;` at useSupervisor.ts:390, and the old "gate above" was dangling; serde `skip_serializing_if` at status_broadcaster/mod.rs:411–412; `FanOutReason` keeps its doc); no dangling pointer from the deletions.
  - [x] verify-human — zero admissible leaves (F11); digest printed, advanced per drive_mode=autopilot. §5a floor not triggered (Phases 1–2 both had leaves). Assumed: strip owner = `ccInputRouting.ts`; test title string left unchanged.
  - [x] verify-codify — no new test: Phase 3 is comment wording plus a cascade-neutral CSS move, so there is no behaviour to pin, and a prose guard would violate the comment budget. No integration boundary.
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT 0 in 50 s; vitest 292 files / 3792 tests; cargo 1069 lib tests; check:link clean; one pre-existing `XtermPane.tsx:943` lint warning. No flake this run.

## Current Node
- **Path:** Feature > finalize (complete)
- **Active scope:** none — archived
- **Blocked:** none
- **Unvisited:** none (the sweep's "Fold back and delete" follows as its own step)
- **Open discoveries:** none

## Test Triage — findResultsReplaceLive.test.tsx › "a row button replaces THAT match with the current text, then re-searches"
Classification: Flaky test — failure unrelated to new code; inconsistent across runs
Confidence: high
Evidence: `TypeError: 'set value' called on an object that is not a valid instance of HTMLInputElement` at the test's own `typeInto` helper (line 103) during the first Phase 2 codify `verify:auto`; the file is untouched by WP14 (`git diff --quiet HEAD` → clean), it passed 2/2 when run alone, and the full suite passed on the re-run (3792/3792).
Action: no code or test changed. Logged as `SURFACE-2026-11-07-FIND-RESULTS-REPLACE-LIVE-FLAKES-UNDER-FULL-SUITE-LOAD` in `backlog.md`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-07] feature-plan — wbs.md exceeds size guard (534 lines); read headings + WP8 only.
- [SHORTCUT-2026-11-07] P2.verify-self — the first runner reported COSMETIC defects in comments written in P2.3, one of them a FALSE claim (`docs/mod.rs`: "no fixed doc name matches a glob"; the `wip/` glob matches any `.md`), plus a broken sentence (`pickInitialDoc.ts`), a pointer to nothing (`DocsPanel.tsx`), an under-specified header (`docsReloadDecision.ts`), a present-tense counterfactual (`adjudicator/mod.rs`), 6 unreflowed lines, and WIP-label residue the patterns missed (adjudicator `(R1)`, Recycle `P3.2` / `(Phase N)`, `handleDocLinkClick.ts` review history). All fixed in place (each a one-sentence extension of P2.3's own edits) and two patterns widened; re-verified by a FRESH runner subagent: all 5 outcomes PASS, the corrected claim checked true against the code.
- [SURFACED-2026-11-07] Phase 2 verify-codify — `findResultsReplaceLive.test.tsx` failed once under full-suite load (jsdom realm mismatch on `HTMLInputElement` value setter), passed alone 2/2 and on the full re-run; logged to backlog.

## Code-Quality Review

*(ship commit `20930c3`, window `20930c3^..20930c3`; 0 CRITICAL, 1 MAJOR, 5 MINOR; drive_mode=autopilot → all auto-backlogged (F39). Each claim re-checked against the source: confirmed, and the MAJOR is slightly worse than reported, since `new RegExp(rule.pattern.source, "g")` also discards a pattern's own flags.)*

### Strengths
- The `once` rules work in both directions: their second half (the authority must keep every fingerprint) blocks "fixing" duplication by deleting the fact.
- The `once` haystack joins wrapped comment lines (comment leaders stripped, whitespace collapsed), and a real wrapped phrase in `recycleButton.ts` proves it.
- The header discloses what the guard does not check (paraphrase, files outside the scope roots, the two narrowed scopes).
- "An earlier revision did X" became "never do X", so the warning survives without the history. Pointers cite symbols, not `file:line`.
- Real stale or false comments were fixed along the way (the `DocsPanel.tsx` fs-change claim, the `docs/mod.rs` reachability claim).

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`singleAuthority.test.ts`, `absent` branch + header] The `absent` rules match raw, case-sensitive text with the pattern's flags dropped, so a wrapped or capitalized label (`(Paydown WP7,` was really in `recycleSession.ts` at `20930c3^`) evades them, while the header claims normalized matching → backlog `SURFACE-2026-11-07-QUALITY-WP14-ABSENT-RULES-MATCH-RAW-CASE-SENSITIVE-TEXT`

**MINOR**
- [`singleAuthority.test.ts`] no permanent positive control per `absent` rule → `…-ABSENT-RULES-HAVE-NO-PERMANENT-POSITIVE-CONTROL`
- [`singleAuthority.test.ts` header] "every instance arose by copy-paste" is contradicted by the two paraphrase rules → `…-GUARD-HEADER-OVERCLAIMS-COPY-PASTE-ORIGIN`
- [`singleAuthority.test.ts`] bare `"2282"`/`"2284"` fingerprints → `…-BARE-DIGIT-FINGERPRINTS`
- [`arch/workflow-gate.md`] the pointer claims the guard header holds the `WORKFLOW_TERMS` recycle/session gap; it doesn't → `…-WORKFLOW-GATE-POINTER-MISSES-THE-TERMS-GAP`
- [`source-text-guards.md` comment budget] does not name `singleAuthority.test.ts` → `…-COMMENT-BUDGET-DOES-NOT-NAME-THE-GUARD`

### Assessment
The work is well built and leaves the codebase better, with proof to the standard the project's lessons ask for (the guard first, then a parser-token diff showing only comments changed). Every rewritten comment the reviewer spot-checked holds. The weakness is that the two rule kinds aren't equally strong: the `once` side has normalization, both directions and a wrapped control, and the `absent` side reuses none of it.

### If you disagree
Mark a finding `[DISMISSED]` here before `feature-finalize` archives the WIP.

## Ship
- Ship commit `20930c3` (2026-11-07), local only (not pushed; `main` 33 ahead of `origin/main`). 65 files: WP14's 63 + `singleAuthority.test.ts` + the `CLAUDE.md` gate-order hunk (operator's WP9 hunk at ~188 left unstaged; `wbs.md`, `backlog.md`, outbox files left for their owners / finalize).
- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, EXIT 0, 3792 vitest / 1069 cargo); only the WIP + `runtimes.md` changed after it.

## Retrospect
- **What changed in our understanding:** a substring guard stops copy-paste regrowth and nothing else. Two of the 16 roster duplicates were paraphrases, so their rules guard regrowth only. And a guard's two rule kinds can quietly differ in strength: the `once` side got normalized matching and a wrapped control, while the `absent` side matched raw, case-sensitive text with its patterns' flags dropped. The review found that the header claimed both were normalized (MAJOR, backlogged).
- **Assumptions that held:** guard-first plus a parser-token diff could prove a ~65-file comment pass changed no code token. The finding's own keep/cut split was a reliable guide. The `useSupervisor` premise (the late-flushed line never carries a `Skill` call) held when read against `isTurnComplete`.
- **Assumptions that were wrong:** the plan said to delete `docs/mod.rs`'s dedup helper test, but it pins a branch the disjointness test makes unreachable, so deleting it would let the branch go with the suite green (kept, operator-approved). Two roster items (`08-25`, the `m10.9` stub) were already resolved and needed no edit. A comment the agent wrote in P2.3 stated a false claim (`docs/mod.rs`), and verify-self's runner caught it.
- **Approach delta:** rules gained an optional `scope` (D2). The WP2 figures' authority became arch §D plus the remeasure test (D5). The `absent` rules were written after the cuts, with guard-first shown against `git show HEAD:` instead. Phase 3 ran exactly as planned.

**Closure (Output B):** Requester = operator — closure notice for self-record.
> **Feature complete:** Paydown WP14, the comment-convention pass, has shipped (`20930c3`). Each duplicated rationale now has one authority with pointers elsewhere, and `src/__tests__/singleAuthority.test.ts` fails if a fingerprint reappears outside its authority or a WIP label returns to a cleaned file. Run `pnpm vitest run src/__tests__/singleAuthority.test.ts` to see the 16 + 7 rules.
