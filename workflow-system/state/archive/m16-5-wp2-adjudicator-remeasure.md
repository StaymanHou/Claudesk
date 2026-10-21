---
drive_mode: autopilot
---

# Feature: M16.5 WP2 — Probe: re-measure the adjudicator on a larger labelled set

**Workflow:** feature
**State:** finalize (complete) — **Completed 2026-10-21.** Feature `904dcc8`, ship `c5fc34f`. Not pushed: `main` is pushed only on the operator's request.
**Created:** 2026-10-21
**WBS:** `workflow-system/product/wbs.md` → WP2 (type: probe, timebox 1 day of agent work plus the
operator labelling pass). It gates any adjudicator tuning and option (c) of WP3.1. It blocks no
other WP.
**Backlog:** `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` (R-6 condition 3).

## Problem Statement

The `claude -p` adjudicator (`src/state/supervisor/adjudicator.ts`) is load-bearing for
correctness (R-5). It is the only thing that stops a silent fire into a turn that is waiting on
the operator. Its 0.80/0.80 accept bar is **chosen, not measured**. Sonnet cleared it at M15 WP1
by **one record**: 25/29 wrong-fire recall and 35/41 real breaks preserved, with only 70 of 96 fire
candidates scorable. At 0.85 both models fail, and at 0.75 both pass. This probe rebuilds a labelled
set of **at least 210 scorable records** (3× the 70) from the transcript corpus. It scores the
pinned model against **operator-held truth**, never the policy table, and records a verdict:
confirm 0.80, or move the bar to a measured value.

**Plan-time findings (they shape the method):**
- **The M15 corpus was ONE project.** That was 239 claudesk transcripts in mode 3. Today 943
  transcripts across `~/.claude/projects/*` contain a `TRANSITION:` token, and 458 are newer than
  2026-09-07. claudesk alone has only ~81 new ones, so reaching 3× means **mining across
  projects**.
- ⚠️ **Two transcript populations must be EXCLUDED, or they poison the set:**
  `-Users-stayman-Personal-projects-claudesk-tmp-scratch-m15-probe` (196 files, the M15 probe's
  own runs), and any `claude -p` adjudicator session. Live fires spawn those too, and they land
  under the spawner's cwd slug. They are identified by a first user message that starts with
  `adjudicationPrompt`'s fixed opening line.
- ⚠️ **Since v0.5.0 the supervisor itself injects the "nudge".** After a fired turn, the next
  user line is the supervisor's `/skill` command, which is textually identical to an operator
  prod. A behavior-derived label would read every supervisor fire as a real break. So
  `supervisor-activity.log` (654 lines, `outcome: fired` with `sessionId` + `ts`) is
  cross-referenced, and fired turns go to the **residual**, never to a mechanical label.
- ⚠️ **The pin is an ALIAS.** `ADJUDICATOR_MODEL = "sonnet"` resolves to whatever Claude Code
  maps `sonnet` to at call time. The M15 score was taken in 2026-09. Today's `sonnet` may be a
  different model, which condition 1's assertion cannot see, because it compares strings. The
  scorer records the **resolved model id** per call (`--output-format json`). A mismatch from M15
  is a finding, not a blocker.
- ⚠️ **Privacy: claudesk is open source, and the widened corpus includes work projects**
  (`~/Work/Kenosis/*`). Turn tails from those must not be committed. See P1.6.
- **The population is what the SHIPPED code would fire on.** The miner drives the real `readTurn`
  + `decideVerdict` (storedMode `autopilot`, the only mode any supervised project stores today)
  per turn. It also uses the real `tailTextOf` slice (`fanOut.ts`, 1,200 chars), so the
  adjudicator is scored on the input it actually gets. It does not re-implement the M15 Python
  labeller. *(Corrected at build: there is **no** verify-human divergence. The conditional cell
  resolves to `skip-skill` or `pause` and **never** to `auto`, so the shipped code never fires an
  edge leaving verify-human in any context.)*
- **No 3rd-party probe needed.** `claude -p` is already integrated and pinned (M15 WP3); its I/O

Problem statement unchanged (2026-10-21, P2.verify-human.1 back-loop). The measurement and its
non-circularity are the same. Only the labelling FORM changed: a 6,000-line text sheet was the wrong
tool. The operator now reviews a sample of uncontested rows, then only contested ones. The verdict
must record how many final labels the operator saw rather than accepted unseen.
  shape is known.

## Work Tree

- [x] Phase 1: Mine — the candidate fire set, mechanically labelled where behavior decides
  **Observable outcomes:**
  - CLI: `pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts mine` exits 0 and
    writes `tmp/adjudicator-probe/candidates.json` (gitignored, full tails). Its `_meta` records:
    files scanned, files excluded per rule (m15-probe dir, adjudicator sessions), turns read,
    `fire` count, and the mechanical/residual split.
  - CLI: the excluded-file count for the adjudicator-session rule is **> 0**. This is the
    positive control that the exclusion predicate matches a real file and is not a silent no-op.
    `grep -l` for the prompt's opening line under `~/.claude/projects` agrees with it.
  - CLI: every candidate re-decided by the real `decideVerdict` returns `kind: "fire"`. This is a
    self-consistency pass over the written file, which proves the population is the shipped
    code's.
  - CLI: every candidate whose `(sessionId, turn)` matches an `outcome: fired` record in
    `supervisor-activity.log` carries `truth_basis: "supervisor-fired"` and `truth: null`, so it
    goes to the residual. At least one such record exists: v0.7.1 fired on `bluecg-maps`
    2026-10-12.
  - CLI: the 96 M15 fire records are present (seed, R-3), joined by `(session, turn_index)`. Their
    M15 `truth` is carried as `m15_truth`, and the re-derived truth is compared with it. Any
    disagreement is listed, not silently overwritten.
  - CLI: the yield report states the projected scorable count against the **≥ 210** target.
    Projected = mechanical labels + residual.
  - CLI (redaction, proven by what REMAINS — `[[verify-redaction-by-what-remains]]`): the
    committable file `workflow-system/product/wp2-adjudicator-set.json` has **no** string field
    longer than 64 chars on any record whose `project` is not claudesk. A whole-file scan for each
    non-claudesk project slug segment (`Kenosis`, `Work`) returns 0 hits outside a fixed
    `project_class` enum.
  **Build results (2026-10-21, after two verify-self in-place fixes):**
  - Mined **361** fire candidates from 1,465 files: 8,644 turns read, 1,640 incomplete and
    skipped. Excluded: 196 M15-probe files, 66 `tmp/scratch` workspace files (agent-driven;
    their "operator" lines are scripted) and 75 adjudicator sessions (46 under `-`, which is the
    installed app's cwd `/`, 22 under `claudesk-src-tauri` and 7 under `claudesk`).
  - By class: personal 185, claudesk 103, work 63, other 10. 11 fall after the 2026-09-28
    transcript fix.
  - **Mechanical BREAK 152; residual 209** (reply 165, other-command 17, task-notification 16,
    ack 6, supervisor-fired 4, no-reply 1). Projected scorable is 344, against the 210 target.
  - **All 4 `fired` records in `supervisor-activity.log` were matched** to candidates and sent to
    the residual. They are `729b7a9a` (bluecg-maps) P3/P5/P7/P9, 2026-10-12.
  - **M15 seed: 96 = 77 refound + 1 duplicate + 18 that do not fire.**
    - The 18: 14 are policy-not-auto (F12 leaves verify-human and never resolves to `auto`, plus
      I6 and one F13), 1 is I2 unmapped, 2 are no-verdict (mid-turn quoting followed by a
      chain), and 1 was interrupted.
    - The duplicate: ⚠️ **M15 counted one turn TWICE.** `d0a276b5:556` (UNKNOWN) and `:563`
      (AWAITING) are two FIRE records for a single turn, with conflicting truths.
    - So **M15's 25/29 included turns the shipped supervisor never adjudicates**, and one turn
      twice.
  - **The mechanical rule gained a third prod class, `prod-complaint`** ("so? not
    autopiloting?", "just chain it!", capped at 160 chars). All 13 of M15's BREAK labels that the
    first two rules missed read like that. Only 4 disagreements with M15 remain:
    - 2 are M15 BREAK, now residual: "invoke verify human", and a long verify-human question.
    - 2 are **M15 AWAITING, now BREAK**: `bede855e:573` and `:795`, where the operator replied "auto
      chain it!!! come on". That is the operator's own verdict that the pause was wrong.
  - ⚠️ **M15 scored a DIFFERENT PROMPT.** The M15 probe's prompt opened "You are judging whether
    an AI coding agent's turn ENDED WAITING FOR THE OPERATOR"; the shipped `adjudicationPrompt`
    opens "You are judging one thing about the end of an AI assistant's turn." So the 0.86/0.85
    that R-6 accepted was never measured on the shipped prompt. Phase 3 scores the shipped one.
  - Committed set: `workflow-system/product/wp2-adjudicator-set.json`, 361 records. Only the
    103 claudesk records carry text.
  **Alignment questions:**
  - (decision) **Commit policy for non-claudesk records.** Assumed: they are committed tail-free,
    as `{project_class: "personal" | "work", key: sha256(session:turn), truth, answers}`. The full
    tails stay in gitignored `tmp/` and can be rebuilt by re-running the miner. claudesk records
    keep their tails, as M15's fixture did. Is "work" content kept out of the public repo the way
    you want, and is `personal` safe to show by project name?
  - (decision) **Mechanical truth rules.** Assumed, from operator behavior:
    - The next user prose line is a content-free prod (`continue` / `next` / `go` / `proceed`),
      the exact skill the supervisor would fire typed bare, or a short complaint that the agent
      stopped ("just chain it!") → **BREAK**: nothing was asked.
    - Everything else goes to the **residual** with an agent-proposed label: a substantive reply,
      a bare ack (`ok`, as M15 corrected), no reply, or a supervisor fire.
    - Only BREAK is mechanical, because a substantive reply can also be a redirect after a real
      break, so it does not prove AWAITING. Right cut?
  - [x] P1.1 Export `tailTextOf` and `TAIL_CHARS` from `fanOut.ts` (no behavior change) so the
        miner uses the live slice rather than a copy.  <!-- status: done -->
  - [x] P1.2 `tooling/adjudicator-probe/` holds a vitest config (excluded from `verify:auto`
        because it reads `~/.claude`) and `mine.probe.ts`. The miner walks every
        `~/.claude/projects/*/*.jsonl` and applies the two exclusions. For each user-prose
        boundary it cuts the turn prefix and runs `decideVerdict({lines, storedMode:
        "autopilot"})`. On `fire` it records `{project, session, turn_index, edge_id, skill,
        tail: tailTextOf(...), ts, next_user_text}`.  <!-- status: done -->
  - [x] P1.3 Mechanical truth (BREAK on a content-free prod, per the alignment question above),
        plus the `supervisor-activity.log` cross-ref → `supervisor-fired` residual.  <!-- status: done -->
  - [x] P1.4 Join the M15 seed and diff `m15_truth` against the re-derived truth.  <!-- status: done -->
  - [x] P1.5 Yield report; flag it if projected scorable < 210.  <!-- status: done -->
  - [x] P1.6 The redacted committable set (`wp2-adjudicator-set.json`) plus the redaction check.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 in 35s: lint, format, tsc (now including `tooling/adjudicator-probe`), check:link, vitest **256 files / 3,441 tests**, cargo fmt, clippy `--all-targets -D warnings`, cargo test (1,023 lib tests plus integration tests).
    - `vitest list --filesOnly` → `corpus.test.ts` and `redact.test.ts` are in the default run (28 tests); no `*.probe.ts` file is.
  - [x] verify-self  <!-- status: done -->
    - No integration boundary: the phase adds a probe tool. The one `src/` change exports two existing symbols, with no behavior change.
    - [x] `mine` exits 0 and writes `candidates.json` with the full `_meta` — evidence: `pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts mine` → EXIT=0; `tmp/` is gitignored.
    - [x] Adjudicator-session exclusion > 0 — evidence: 75 excluded. `grep -lF` for either opening finds 79 non-probe files; the other 4 only QUOTE it deep inside (lines 132–1817), so they are real sessions and correctly kept.
    - [x] Every candidate re-decides to `fire`, **and the converse** — evidence: an independent Stop-time cut of 7,032 turns through the real `decideVerdict` → `stopFires 361, candidates 361, missed 0, extra 0` (`tmp/verify-wp2-r2/check.json`).
    - [x] Supervisor fires go to the residual — evidence: 4/4 log fires matched independently (`729b7a9a:817/885/912/941`, 48–70 ms after the verdict line), all `supervisor-fired`, truth null.
    - [x] M15 seed join — evidence: 96 = 77 + 1 duplicate + 18. The 18 do not fire at any Stop-time cut. All 77 truths match q2, and the disagreement set is recomputed equal (`tmp/zzcheck/seeds.json`).
    - [x] Yield vs ≥210 — evidence: `projectedScorable 344` (candidates minus 17 likely-SKIP rows); mechanical + residual = 361. Both clear 210.
    - [x] Redaction by what remains — evidence: across all 258 non-claudesk records, max string length is 22; only the 9 vocabulary fields are present; every key matches `h:[0-9a-f]{16}`; 0 project-name hits (the only false positives are the `projectClass` values and `feature-finalize`).
    - [x] align: commit policy — evidence: non-claudesk shape `{key, projectClass, edgeId, skill, date, nextKind, supervisorFired, mechanicalTruth, truthBasis}`. Example: `{"key":"h:33c3e003ee34b40c","projectClass":"personal","edgeId":"F10b","skill":"feature-verify-human","date":"2026-10-15","nextKind":"reply","supervisorFired":false,"mechanicalTruth":null,"truthBasis":"reply"}`. "work" includes `Work-Tmp-mccc-tutorial-a` (7 records).
    - [x] align: mechanical truth rules — evidence: samples captured by the first runner (prod-text "so?" ×6 / "continue" / "next"; prod-complaint "just chain it! Why returning control?", "chain", "autopilot ⏎ start the work"; reply "invoke verify human" ×2, "all pass", "I'm done"). Its scripted `Use no tools. Reply with the single word …` replies came from scratch sessions, which are now excluded.
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 (decision) Commit policy for non-claudesk records: tail-free, opaque key, personal redacted too — **operator: A, as built** (2026-10-21)
    - [x] P1.verify-human.2 (decision) Mechanical truth rules: BREAK = prod-text / prod-command / prod-complaint (≤160 chars); everything else → residual — **operator: A, as built**. The leading-ack extension ("ok. continue") was declined, so those rows go to the labelling pass; the Phase 2 control sample checks the rule.
  - [x] verify-codify  <!-- status: done -->
    - No integration boundary: the phase adds isolated probe artifacts only.
    - The M15 join was extracted from the IO probe into the pure `seedJoin.ts`, with 6 tests in `seedJoin.test.ts`: exact match, in-turn fallback, no fallback across a turn or edge, duplicate turn in both orders, and both disagreement directions. Mutation-proved: iterating `seeds` instead of `ordered` fails the duplicate-turn case. The refactored probe's join output is byte-identical to before.
    - Already covered and not duplicated: classification, exclusions, the `/exit` caveat cut (mutation-proved at build), scratch slugs, and redaction with positive controls (`corpus.test.ts`, `redact.test.ts`).
    - `pnpm verify:auto` → EXIT=0 in 34s; vitest **257 files / 3,449 tests**; cargo green.

- [x] Phase 2: ⭐ Operator labelling pass — the residual, plus a spot-check of the mechanical labels
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP2 is in the settled M16.5 rulings ("the adjudicator re-measurement is IN").
  - Requirements unchanged: yes — Phase 1 approved as built (1A, 2A).
  - Solution still feasible: yes — 209 residual rows plus about 15 control rows; projected scorable 344 against 210.
  - No superior alternative discovered: yes — Phase 1 widened the case for measuring, since M15 scored a different prompt.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `tmp/adjudicator-probe/label-sheet.md` lists every residual record and a **random 10%
    sample of the mechanical BREAK labels**, mixed in and unmarked, as a control on the mechanical
    labeller. Each row shows `id`, edge, the tail (claudesk and personal in full, work in full
    locally, since this file is gitignored), the next user line, the agent's proposed label
    (`AWAITING` / `BREAK` / `SKIP`), and an empty `operator` cell. An empty cell means "accept the
    proposal".
  - CLI: ⚠️ **The sheet contains no adjudicator output.** A grep for `adjudicator` / `sonnet`
    answers returns 0. Scoring has not run yet, so the proposals cannot anchor on the thing being
    measured. The ordering is enforced by Phase 3 refusing to start without the freeze below.
  - CLI: after the operator returns the sheet, `freeze` parses it. It rejects any cell outside
    `{"", AWAITING, BREAK, SKIP}` with the row id. It writes `labels.frozen.json`, prints its
    sha256, and records that hash in this WIP.
  - CLI: the control-sample agreement rate (operator vs mechanical) is computed and recorded.
    Below 90% agreement, the mechanical rule is not trusted: every mechanical label goes back to
    the operator.
  - *(Added at the P2.verify-human.1 back-loop, 2026-10-21.)*
  - CLI: `second.json` labels all 225 rows. Its four readers were blind to `proposals.json`, and
    `triage.json` splits the rows into noEvidence / uncontested / contested, plus a seeded sample
    of 40 uncontested rows.
  - Browser (real keyboard, file://): `review-sample.html` shows card 1 of 40.
    - Enter accepts the proposal and advances; A/B/S override; ← goes back; F toggles the full
      turn.
    - Progress survives a reload.
    - A hostile tail renders as text.
    - The done screen's Download writes `wp2-review-sample.json`.
    - `review-contested.html` shows both readers' labels on each card.
  - CLI: `merge` (WP2_DECK=sample) validates an export strictly and writes `sample-gate.json` with
    the agreement rate against the 0.90 bar. `freeze` refuses on a failed gate or an undecided
    contested row, and records every final label's `source`.
  **Alignment questions:**
  - ~~The label sheet itself: a markdown file edited in Sublime~~ — REJECTED (P2.verify-human.1);
    replaced by the card reviewer.
  - Is `SKIP` (cannot tell, exclude from scoring) an acceptable third answer, or must every row be
    forced to a side?
  - [x] P2.1 Build the label sheet: proposals from the agent reading each tail against the one
        question `adjudicationPrompt` asks, plus the hidden mechanical control sample.  <!-- status: done -->
    - `labelSheet.ts`, pure: `buildRows` (seeded, deterministic), `renderSheet`, and a strict
      `parseSheet`. `sheet.probe.ts` runs the `rows` and `sheet` steps; `sheet` refuses to
      overwrite an existing sheet unless `WP2_OVERWRITE_SHEET=1`.
    - **225 rows** = 209 residual + 16 hidden controls (ceil 10% of 152), shuffled with seed
      20261021. By class: personal 119, claudesk 59, work 40, other 7.
    - Proposals came from 4 parallel general-purpose readers, each over its own ~56-row slice and
      **blind to `candidates.json` and `row-keys.json`**. They proposed AWAITING 101, BREAK 85,
      SKIP 39. ✅ **All 16 hidden controls were proposed BREAK**, so the blind reading agrees with
      the mechanical rule before you have looked.
    - The sheet is `tmp/adjudicator-probe/label-sheet.md` (336 KB, 225 blank `**Operator:**`
      cells). A grep for adjudicator output found 14 hits, all claudesk tails discussing mccc's
      haiku/sonnet test tags; none is this probe's output, since no score has run yet.
  - [x] P2.2 ⭐ The operator labels; this IS this phase's verify-human.  <!-- status: done — sample 40 + breaks 51 + remaining 14 = 105 cards seen; 5 rows by ruling -->
  - [x] P2.4 (added at verify-human, operator 2026-10-21) **Second independent reader.** It
        re-labels all 225 rows blind to `proposals.json`. Rows where the two readers agree are
        **uncontested**; the rest are **contested**.  <!-- status: done -->
    - 4 blind readers over interleaved slices (id mod 4). **Agreement: 174 of the 195 rows with
      evidence (89%)**. 21 are contested: AWAITING/SKIP 9, AWAITING/BREAK 6, BREAK/AWAITING 4,
      BREAK/SKIP 2. 30 rows have no evidence (session ended or a task-notification) and are
      auto-SKIPped.
    - Uncontested labels: AWAITING 86, BREAK 79, SKIP 9. All 16 hidden controls are uncontested
      BREAK.
  - [x] P2.5 (added) **Keyboard card reviewer.** A local HTML page (`tmp/`, opened with `open`) so
        no work-project text leaves the machine. One card at a time shows the turn's end (full
        turn on toggle), the reply and the proposal. Enter accepts; A/B/S override; ← goes back;
        progress is kept in `localStorage`; it exports a JSON file. Rows with no reply evidence
        (`/exit`, ended session, task-notification) are auto-SKIPped.  <!-- status: done -->
    - `reviewer.ts` (renders data with `textContent` only; mutation-proved: `innerHTML` fails the
      hostile-reply test), `triage.ts` (`hasNoEvidence`, `triage`, `sampleIds`, and `assemble`,
      which records each label's `source`) and `review.probe.ts` (`rows` / `decks` / `merge`).
      `freeze.probe.ts` was reworked onto `assemble` and gated on the sample.
    - `review.test.ts` has 15 tests, including a jsdom keyboard run through the real page.
    - The decks are `tmp/adjudicator-probe/review-sample.html` (40 cards) and
      `review-contested.html` (21 cards, both readers shown).
    - The rejected markdown-sheet code (`renderSheet` / `parseSheet` / `sheet.probe.ts`) is
      deleted, and so is the untouched `label-sheet.md` (225/225 cells blank).
  - [x] P2.6 (added) **The operator's gate.** First a sample of about 40 uncontested rows.
        - **≥ 90% agreement:** the uncontested labels stand, and the operator reviews only the
          contested rows.
        - **Below 90%:** STOP and discuss with the operator.
        - The verdict records how many final labels the operator saw.  <!-- status: done — gate passed; revised by operator ruling -->
    - **Sample result (2026-10-21):** 36/40 (0.90, exactly the bar). ⚠️ All 4 flips went readers
      BREAK → operator AWAITING, and **none was about the turn's text**:
      - R002: "a legitimate pause because it's at the boundary between two WP's".
      - R040: "incident workflow shouldn't auto chain".
      - R133: "product workflow shouldn't auto chain either".
      - R214: a `TRANSITION: F10b` quoted in an analysis turn, the WP3.1 bug.
    - **Operator ruling (2026-10-21, "go ahead"):**
      - (1) File the policy finding: `SURFACE-2026-10-21-SUPERVISOR-AUTO-CHAINS-PRODUCT-AND-INCIDENT-WORKFLOWS`,
        WBS WP3 task 3.4, and design prior `supervisor-chains-execution-workflows-only` (inferred why
        approved as proposed).
      - (2) Product and incident rows leave the adjudicator set (`isPolicyExcluded`). There are 31
        such candidates; 19 are review rows, and the rest are mechanical.
      - (3) Every uncontested BREAK is reviewed, not trusted (`mustReview`), because all the
        disagreement sat there. Agreed AWAITINGs stay, as the operator confirmed 22/22.
    - Re-gated without the policy rows: **35/37 (0.946)**, pass (`sample-gate.json` lists R035,
      R040, R133 as policy-excluded). The sample was kept, not redrawn (`decks` preserves a
      recorded sample; `review-sample.html` sha unchanged).
    - Next decks: `review-breaks.html` with **51** cards (the unreviewed uncontested BREAKs, feature /
      task / session) and `review-contested.html` with **19** cards. A legend line was added to every
      card after the operator asked what the labels mean. Smoke-tested in headless Chromium: legend
      present, Enter advances, contested cards show the other reader, no page errors.
    - Tests: `review.test.ts` covers policy exclusion, `mustReview`, assembly sources and the legend;
      54 tests pass across the probe directory.
    - **Breaks deck done (2026-10-21):** 51 cards; the operator agreed with 47 (92%). Labels:
      BREAK 47, AWAITING 3, SKIP 1 (R027).
    - **R027 (S23 → session-handoff):** labelled SKIP, with the note "yes, it is a legit pause at
      the WP boundary, but it should almost always just do handoff instead of offering the option
      to continue to the next WP". ⚠️ The agent proposed BREAK, because the fire there IS
      `/session-handoff`, which is what the operator replied. That is pending the operator's yes;
      the label stays SKIP until then.
    - **WP-boundary ruling applied to the contested rows** (operator: "update them first before
      asking me to review"): R055, R062, R063, R065 and R119 → AWAITING (source
      `operator-ruling`, `reviewed-rulings.json`). In each, the operator handed the session off
      while the fire target was the next WORK, so per R002 and R027 the pause was legitimate and
      a fire would have been wrong.
    - Proposals sharpened (`proposals-override.json`): R109 → AWAITING (answered the turn's three
      questions) and R217 → AWAITING (chained without the spec; the operator objected). The 8
      F10b + approval rows carry the operator's own split precedent: AWAITING R030 R036 R056 R104
      versus BREAK R015 R050 R120 R149 R186.
    - Deck: `review-remaining.html`, 14 cards, smoke-tested (14/14 traverse, no page errors). The
      "other reader" shown is whichever reader the proposal disagrees with. `review-contested.html`
      was deleted, and the new deck name avoids stale `localStorage` from the opened contested
      deck.
  - [x] P2.3 `freeze`: validate, write `labels.frozen.json` plus its hash, and compute
        control-sample agreement.  <!-- status: done -->
    - **FROZEN 2026-10-21 10:33.** `labels.frozen.json` sha256
      **`da8b00eefde9117228796af7d9ceca81cce4904d5f5297683547c5c0e25bbc10`**. ⚠️ Phase 3's
      `score` must refuse unless the file still hashes to this.
    - 225 rows: AWAITING 103, BREAK 63, SKIP 59.
    - By source: **operator 102** (cards seen and labelled), **operator-ruling 5**,
      readers-agree 69 (uncontested AWAITING or SKIP only), no-evidence 30, policy-excluded 19.
    - Control agreement: **15/16 (0.94), trusted.** The one disagreement is R092, which the
      operator labelled SKIP.
    - Remaining deck: the operator labelled **7 of the 8 F10b + approval rows AWAITING** (R200 the
      one BREAK). A turn that presents its own checklist for approval reads to the operator as
      genuinely waiting, consistent with the WP1 ruling that every verify-human pause is a real
      ask.
    - Still pending, and not blocking: R027 → BREAK? (stays SKIP), and the mccc inbox note
      (unsent).
  - [x] verify-auto  <!-- status: done -->
    - Re-run after the back-loop: `pnpm verify:auto` → EXIT=0 in 32s; vitest **259 files / 3,466 tests** (the `review.test.ts` jsdom keyboard run is now included; `parseSheet` tests were deleted along with the sheet).
    - `pnpm verify:auto` → EXIT=0 in 33s; vitest **258 files / 3,455 tests** (it gained `labelSheet.test.ts`, 6 tests, with the `**Operator:**` line-start anchor mutation-proved); cargo green. No `*.probe.ts` file is in the default run.
  - [x] verify-self  <!-- status: done -->
    - No integration boundary: the phase adds isolated probe tooling only.
    - [x] Sheet content — evidence: all 209 residual candidates appear exactly once (via `keyOf`, cross-checked with an independent sha256); exactly 16 = ceil(0.1×152) controls, all mechanical BREAK. All 225 blocks were rebuilt independently and match byte-for-byte, so nothing distinguishes a control row. 13 replies are cut at 600 chars. The file is gitignored (`tmp/`).
    - [x] No adjudicator output — evidence: `adjudicator` hits are 225 per-row template labels, 3 header lines and 3 quoted tail lines; `sonnet` hits are 14, all quoted tails. Neither word appears on any Proposed or Operator line. No score, answer or frozen file exists under `tmp/`.
    - [x] Freeze mechanism — evidence: the real freeze test, pointed at simulated copies. A typo copy exits 1 with `R001: operator cell "AWAITNG" is not blank, AWAITING, BREAK or SKIP` and writes nothing. A valid copy gives final = override ?? proposal on 225/225 rows, and the report's sha256 equals the file's hash.
    - [x] Control-agreement mechanism — evidence: 15/16 → 0.9375, trusted; 14/16 → 0.875, untrusted, both disagreements listed. A SKIP on a control counts as a disagreement. Re-routing the mechanical labels on `trusted:false` is manual, not automated.
    - [x] Freeze and agreement on REAL labels — resolved once the labelling pass ran: frozen at sha256 `da8b00ee…` (P2.3), controls 15/16 trusted. *(This leaf was stale until the code-quality review flagged it, 2026-10-21.)*
    - *(Re-run after the P2.verify-human.1 back-loop, 2026-10-21.)*
    - [x] Triage — evidence: recomputed independently, it matches `triage.json` exactly: noEvidence 30 (1 null, 16 task-notification, 13 `/exit` or `/clear`), uncontested 174, contested 21. The sets partition all 225 ids, and the 40-row sample is a subset of the uncontested rows. Reader agreement is 174/195 (0.892).
    - [x] Card reviewer, real keyboard in headless Chromium on file:// — evidence:
      - Card 1 is "R002 … 1 / 40", with no console errors.
      - F toggles the tail between 501 and 1,200 chars. Enter, `a`, `b`, `s` and ← all work, and a reload resumes at card 4 with 3 labels kept.
      - On R067, R099 and R133, `<table>`, `<h>` and `<command-name>` render literally (0 img, 2 script, 0 table elements on the page).
      - 40/40 displayed proposals match `proposals.json`.
      - The download `wp2-review-sample.json` has 40 results, exactly as entered. The contested deck has 21 cards, each showing both readers' labels.
      - I looked at the card 1 screenshot myself: legible, dark, key bar at the bottom.
    - [x] Merge, gate and freeze — evidence: the real bodies, with OUT and homedir mocked. A malformed export is rejected naming the rows. 35/40 → 0.875, and freeze throws. 38/40 with no contested review → freeze throws listing all 21. With both reviewed, freeze writes 225 rows: operator 61, readers-agree 134, no-evidence 30, and the sha256 matches the file.
    - [x] align: effort — evidence: screenshots `tmp/verify-wp2-p2b/sample-card1.png` and `contested-card1.png`. The agent's 2.2 s for 40 cards is a machine floor, not a human estimate.
    - [x] align: sheet form — evidence: 336 KB, 225 rows, ~26 lines per block (15–48). Example claudesk row R121 (F8): reply "all good", proposed BREAK.
    - [x] align: SKIP as a third answer — evidence: proposals are AWAITING 101 / BREAK 85 / SKIP 39. The SKIPs break down as: session ended 18 (14 `/exit` or no reply, 4 handoff); task-notification as the reply 16; unrelated redirect 5; can't-tell 0.
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1 Sheet form: a gitignored markdown file edited in Sublime, blank = accept  <!-- status: resolved by back-loop — replaced by the keyboard card reviewer (operator choice 2026-10-21). Was FAILED — operator 2026-10-21: "you want me to review 6000+ lines of stuff in basically plain text?" A 336 KB text file is the wrong form for 225 judgments. -->
    - [x] P2.verify-human.2 SKIP as a third answer (excluded from scoring) — operator used the deck with S available and raised no objection; the definitions were answered on request (2026-10-21)
    - [x] P2.verify-human.3 ⭐ The labelling pass (P2.2), reshaped per the operator: (a) a 40-card uncontested sample in `review-sample.html`, then the ≥0.90 gate; (b) if it passes, the 21 contested cards in `review-contested.html`; then `freeze` — done, frozen da8b00ee
  - [x] verify-codify  <!-- status: done -->
    - No integration boundary: isolated probe tooling only.
    - Gap closed: the sample-gate arithmetic moved from the IO probe into the pure `sampleGate` (`triage.ts`), with 2 tests (exactly-at-bar passes, just-below fails, policy rows left out and listed). Mutation-proved: dropping the policy filter fails the exclusion test. The real `sample-gate.json` is byte-identical before and after (`cmp`).
    - Already covered and not duplicated: triage, `mustReview`, `assemble` sources including `operator-ruling`, `isPolicyExcluded`, the page under jsdom (keys, hostile text, legend), and strict `readExport` (`review.test.ts`); `buildRows` (`labelSheet.test.ts`).
    - `pnpm verify:auto` → EXIT=0 in 33s; vitest **259 files / 3,470 tests**; cargo green.

- [x] Phase 3: Score — the pinned model against the frozen labels
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — the R-6 condition 3 measurement is the whole point.
  - Requirements unchanged: mostly. The set is narrowed by the operator's policy ruling (product
    and incident are excluded), which makes the measurement MORE about the adjudicator, not less.
  - Solution still feasible: yes — 225 frozen labels (103 AWAITING / 63 BREAK) plus ~124
    mechanical BREAKs.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `score` refuses to run unless `labels.frozen.json`'s sha256 matches the hash recorded in
    this WIP. A positive control is to edit one label and confirm the refusal. This proves the
    labels were fixed before any answer existed (non-circularity, item 2.3).
  - CLI: `score` sends each record's tail through the **real** `adjudicationPrompt` and runs
    `claude -p --model sonnet --output-format json` (prompt on stdin, cwd = the session
    scratchpad, so no adjudicator transcript lands in a project slug). It parses with the real
    `parseAdjudication`. It does **3 runs** per scorable record. It writes
    `tmp/adjudicator-probe/answers.json`: per record, the 3 answers, the basis (including
    `unparseable` / `error`), and the **resolved model id**.
  - CLI: the score report gives:
    - wrong-fire recall (AWAITING truth → adjudicator AWAITING) and real-breaks-preserved (BREAK
      truth → PROCEED), on **run 1**, which is what production does: one call;
    - each with n, the point estimate and a 95% Wilson interval;
    - PASS/FAIL at bars 0.75 / 0.80 / 0.85;
    - the run-to-run flip rate;
    - the error/unparseable count, which withholds in production and is scored as AWAITING.
  - CLI: the resolved model id(s) are listed, along with whether they match M15's.
  - CLI: the M15 subset (the 70 scorable records) is scored separately, so drift on identical
    inputs since 2026-09 is visible apart from the new data.
  **Alignment questions:**
  - ~~(decision) Runs 2–3?~~ Moot. The cost was corrected to ~$3, so they ran (see P3.2).
  - [x] P3.1 `score` with the freeze-hash gate, a concurrency cap of 4, a timeout equal to
        `ADJUDICATOR_TIMEOUT_MS`, and 3 runs.  <!-- status: done — 3 runs, 873 answers -->
    - `score.ts` is pure, with 5 tests: `effective` (anything but PROCEED withholds), a Wilson CI
      checked against an independent formula, both axes, both-axes bars, and flip rate.
    - `score.probe.ts` has the steps `set` / `score` / `report`. `set` refuses unless
      `labels.frozen.json`'s sha256 appears in this WIP.
    - The calls are production-shaped: the real `adjudicationPrompt` on stdin, the real
      `parseAdjudication`, `claude -p --model sonnet`, cwd `/` (no project CLAUDE.md), and every
      `CLAUDE*` / `CLAUDESK*` variable stripped. `--output-format json` is there only for the
      resolved model id, and `--no-session-persistence` keeps the corpus clean. Answers append to
      `answers.jsonl`, so runs resume.
    - ~~Cost: ~$0.14 per call~~ **CORRECTED by verify-self.** $0.14 was the trial call's
      cold-cache price. Production-shaped calls report **~$0.0048** each, so all three runs (873
      calls) cost about $4. Runs 2–3 were held for the operator on the wrong figure; once
      corrected the hold had no reason, so they ran.
  - [x] P3.2 The score report: point + Wilson CI at 0.75 / 0.80 / 0.85, flip rate, model ids, the
        M15-subset split.  <!-- status: done (run 1) -->
    - **RESULT, run 1 (2026-10-21):** 291 items (103 AWAITING / 188 BREAK; sources: mechanical
      125, operator 100, readers-agree 61, operator-ruling 5). All 291 answered by
      **`claude-sonnet-5-5`**, with 0 errors, timeouts or unparseables.

      | Axis | Hits | Rate | 95% Wilson | 0.75 | 0.80 | 0.85 |
      |---|---|---|---|---|---|---|
      | Wrong-fire recall (AWAITING held) | 95/103 | **0.922** | 0.854–0.960 | ✓ | ✓ | ✓ |
      | Real breaks preserved (BREAK fired) | 126/188 | **0.670** | 0.600–0.733 | ✗ | ✗ | ✗ |

      **Both-axes bar: FAILS at 0.75, 0.80 and 0.85**, and no lower bound clears any of them.
    - **Where the misses are:**
      - **A break turn that ends with an ask or offer is fired only 8/29 times (0.28).** The
        adjudicator answers the literal question it is asked ("is this turn waiting for the
        human to reply?"), and an unnecessary "shall I proceed?" IS literally waiting.
      - With no ask, 118/159 = 0.74.
      - By edge: F8 61/68, T5a 11/14, F15 10/14, F10 9/11, **F10b 9/27**, **F7 7/20**.
      - The dangerous direction: 8 of 103 AWAITING turns would be fired into (F8 2, F10b 2,
        T5a 2, S22 1, F7 1).
    - **M15 subset on IDENTICAL inputs** (now `claude-sonnet-5-5` plus the shipped prompt):
      - Against M15's own truth: WFR 16/17, **RBP 28/37 = 0.757**. M15 measured 35/41 = 0.854
        with an older Sonnet and a different prompt.
      - Against the new truth: WFR 15/15, RBP 29/39.
    - **Runs 2–3 (2026-10-21):** RBP **0.670 / 0.665 / 0.676** and WFR 0.922 / 0.913 / 0.903
      across runs 1/2/3, with 0 failed calls. **Flip rate 16/291 = 5.5%.** The verdict is stable,
      not single-call noise. Run 1 needs 15 of its 62 wrong BREAK answers to flip just to reach
      0.75.
    - ⚠️ **The M15 model id is INFERRED, not recorded.** `wp1-q2-adjudication.json` stores only the
      alias `sonnet`. Cwd-root transcripts show `sonnet` resolving to `claude-sonnet-5` from
      2026-09-15 to 09-28 and to `claude-sonnet-5-5` from 09-29, so M15 (measured 2026-09-11)
      most likely ran on `claude-sonnet-5`.
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 in 35s; vitest **260 files / 3,475 tests** (it gained `score.test.ts`, 5 tests); cargo green. 0 `*.probe.ts` files in the default run, so no live calls happen in the gate.
  - [x] verify-self  <!-- status: done -->
    - No integration boundary: probe tooling only.
    - [x] Freeze-hash gate — evidence: the real file hashes to da8b00ee…, which the WIP records. A copy with one edited label → `set` exits 1 with "…hashes to e8bb503c…, which the WIP does not record — refusing"; a clean copy passes and is byte-identical. Timeline: frozen 10:33:23 < score-set 10:37:54 < first answer 10:38:15.
    - [x] Production-shaped calls — evidence: the real `adjudicationPrompt` / `parseAdjudication` / `ADJUDICATOR_MODEL` imported; 291/291 run-1 answers keyed to the set, all `claude-sonnet-5-5`, all basis `model`. No adjudicator transcript landed under `~/.claude/projects`. A 3/3 live repro matches run 1. Deviations: cwd `/` instead of the scratchpad (production's dir), one line per answer.
    - [x] Report recomputed independently in Python (no `score.ts`) — evidence: WFR 95/103 = 0.9223 [0.8542, 0.9601] and RBP 126/188 = 0.6702 [0.6002, 0.7334] match; the bars fail at all three. Score-set composition re-derived: 166 frozen plus 125 mechanical (11 product/incident mechanical BREAKs excluded) = 291, keys/truths/tails equal.
    - [x] Model ids — evidence: `{claude-sonnet-5-5: 291}`. M15 recorded only the alias; resolution was inferred from transcripts (see P3.2).
    - [x] M15 subset — evidence: 54 items, recomputed and matching. The 70 → 54 gap is explained by: 19 not refound (9 F12 AWAITING, I2/I6 BREAK, …), 3 frozen SKIP, 2 policy-excluded I17/I18.
    - [x] align: runs 2–3 — evidence: they would cost 582 calls at ~$0.0048 (not $0.14). The RBP margin needs 15 / 25 / 34 flips to reach 0.75 / 0.80 / 0.85. The runs were then executed (see P3.2).
  - [x] verify-human  <!-- status: done — zero admissible leaves (the one decision, runs 2–3, became moot when the cost was corrected to ~$3); advanced per drive_mode=autopilot (F11) -->
  - [x] verify-codify  <!-- status: done -->
    - No integration boundary: probe tooling only. Already covered: `score.test.ts` (production's withholding rule, Wilson against an independent formula, both axes, the both-axes bar, flip rate). The frozen-evidence replay over the committed set is Phase 4's P4.2, so it is not duplicated here.
    - `pnpm verify:auto` → EXIT=0 in 34s; 260 files / 3,475 tests.

- [x] Phase 4: Verdict — record it, and move the bar only if the measurement says to
  **Relevance check (before Phase 4):** all four yes. The measurement is complete and stable, and
  the verdict is the deliverable. **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `wbs.md` → "Probe outcomes" gains a `### WP2` section with the method, the set's
    composition, the score table, the model-id finding and the verdict. `wbs.md` WP2's tasks are
    ticked.
  - CLI: a frozen-evidence replay test (`src/state/supervisor/__tests__/adjudicatorRemeasure.test.ts`,
    the `verdictReplay.test.ts` pattern) reads the committed `wp2-adjudicator-set.json` and asserts
    the recorded recalls from the recorded run-1 answers. It makes no live calls. It is
    mutation-proved: flipping one recorded answer changes the asserted count.
  - CLI: if the bar moves, `adjudicator.ts`'s header and the `assertPinnedModel` message cite the
    new measured numbers (not 23/29 and 25/29). `grep -c "25/29"` over `src/` reflects the
    decision. `pnpm verify:auto` is green.
  - CLI: `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` is either deleted, with
    a `**Backlog resolved:**` CHANGELOG line in the same commit, or rewritten to what remains. A
    model-id drift finding, if any, becomes its own SURFACE.
  - CLI: WP3.1's text in `wbs.md` notes whether option (c), an adjudicator judgment on a quoted
    token, is now viable, based on the measured margin.
  **Alignment questions:**
  - The verdict: given the intervals, confirm 0.80, or move it? (Assumed rule, to correct here:
    **the bar is confirmed if run-1 point estimates clear it on both axes**, and the Wilson lower
    bound is reported as the margin's honesty, not as a second gate.)
  - [x] P4.1 The `wbs.md` Probe outcomes section and WP2 ticks; the WP3.1 option-(c) note.  <!-- status: done (2.4 is ticked once the operator approves the verdict) -->
    - `wbs.md` → `### WP2 — the adjudicator re-measured (2026-10-21)` holds the method, the
      result table, the verdict (FAILS the bar on the break axis; the bar is NOT moved), the
      cause (ask-shaped breaks 8/29), and the findings: prompt mismatch, alias drift, F12 and the
      duplicate, and the policy rulings.
    - WBS tasks 2.1–2.3 ticked. WP3.1 now says option (c) is NOT viable.
  - [x] P4.2 The replay test over the committed set, mutation-proved.  <!-- status: done -->
    - The committed set now carries, per record and as vocabulary only: `label`, `labelSource`,
      `scoredTruth` and the 3 run `answers`. Non-claudesk fields are still vocabulary only, and
      the redaction check passes.
    - `src/state/supervisor/__tests__/adjudicatorRemeasure.test.ts` has 4 tests:
      - 291 scored (103 AWAITING), 3 answers each;
      - no policy-table truth, and no P/I edge;
      - run 1 = 95/103 and 126/188 through the real `score`;
      - every run fails every bar.
    - Mutation-proved: flipping one recorded run-1 BREAK answer to AWAITING fails the run-1 test,
      and the file was restored byte-identical (shasum).
  - [x] P4.3 If the bar moves: `adjudicator.ts` header + message + `adjudicator.test.ts`.  <!-- status: done — the bar does NOT move; comments-only correction -->
    - The bar is unchanged, because the measurement fails it rather than locating it. But the
      `adjudicator.ts` header claimed condition 3 was "NOT discharged". It now records the WP2
      result and cause, and condition 1 gains the alias-drift note.
    - `git diff` shows 0 non-comment changed lines, and Prettier is clean. The thrown
      `assertPinnedModel` message (M15's haiku 23/29 vs 25/29) is historical fact and unchanged.
  - [x] P4.4 Backlog resolve/rewrite; a model-drift SURFACE if any.  <!-- status: done -->
    - New: `SURFACE-2026-10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS` (high) and
      `SURFACE-2026-10-21-ADJUDICATOR-PIN-IS-AN-ALIAS-THAT-MOVED-SILENTLY` (medium).
    - ⚠️ `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` is resolved by this
      measurement. Per delete-on-resolve, its deletion lands at **finalize**, in the same commit
      as its `**Backlog resolved:**` CHANGELOG line.
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 in 32s; vitest **261 files / 3,479 tests** (it gained `adjudicatorRemeasure.test.ts`, 4 tests); cargo green. The comments-only `adjudicator.ts` edit passes lint, format and tsc.
  - [x] verify-self  <!-- status: done -->
    - No integration boundary: `adjudicator.ts` changed in comments only; the rest is docs, evidence and a test.
    - [x] WBS `### WP2` section — evidence: every number traced to `score-report.json` / `freeze-report.json` / `candidates.json` / M15's report; per-edge figures recounted from the committed json. 2.1–2.3 are ticked and 2.4 is left for the verdict. ⚠️ The **8/29 ask-shaped** split came from an unrecorded inline heuristic, and a strict `?`-only check gives 8/21. FAILED-cosmetic, fixed in place: the heuristic is now stated, and the figure is marked approximate in wbs.md, backlog.md and the `adjudicator.ts` comment.
    - [x] Replay test — evidence: no spawn, fetch or network. The runner's own mutant (an AWAITING-truth answer flipped to PROCEED) fails with `hits: 94 vs 95`, and the restore is shasum-identical. Python on the committed json reproduces 95/103 and 126/188, and its run-1 answers equal `answers.jsonl` for 291/291 keys.
    - [x] `adjudicator.ts` comments-only — evidence: TypeScript AST leaf tokens, HEAD vs working copy, 490/490 identical. Positive controls are detected at tokens 10 and 470. `25/29` hits are unchanged from HEAD, and the 26 adjudicator tests pass.
    - [x] Backlog — evidence: the margin SURFACE block is byte-identical to HEAD (deletion deferred to finalize, as recorded). The 3 new SURFACEs have Priority and Status, and their numbers match.
    - [x] WP3.1 option-(c) note — evidence: `wbs.md:137`, NOT viable.
    - [x] align: the verdict — evidence: run-1 WFR 0.922 [0.854, 0.960] clears every bar, even by lower bound. RBP 0.670 [0.600, 0.733] fails every bar by point estimate and by lower bound in all 3 runs. It needs +15 / +25 / +34 breaks fired to reach 0.75 / 0.80 / 0.85.
  - [x] verify-human  <!-- status: done -->
    - [x] P4.verify-human.1 (decision) The verdict — **operator: "Fails; bar unchanged"** (2026-10-21). WBS 2.4 ticked; the verdict line is marked operator-approved.
    - [x] P4.verify-human.2 (decision) Follow-ups — **operator: add to M16.5 WP3** as task 3.5 (revise the question, held-out re-score) and task 3.6 (make the alias pin loud). Both SURFACEs' target lines now point there.
    - [x] P4.verify-human.3 (decision) Leftovers — **operator: leave R027 as SKIP; send no mccc note.**
  - [x] verify-codify  <!-- status: done -->
    - No integration boundary. The verdict is already codified by `adjudicatorRemeasure.test.ts` (mutation-proved at build and again by verify-self), so nothing is duplicated.
    - `pnpm verify:auto` → EXIT=0 in 33s; 261 files / 3,479 tests.

## Current Node
- **Path:** Feature > finalize
- **Active scope:** finalize (review-quality done: 0 CRITICAL / 3 MAJOR / 8 MINOR, auto-backlogged)
- **Blocked:** none
- **Unvisited:** finalize → (session-boundary chain)
- **Open discoveries:** SURFACE-2026-10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS (→ WP3 3.5), SURFACE-2026-10-21-ADJUDICATOR-PIN-IS-AN-ALIAS-THAT-MOVED-SILENTLY (→ WP3 3.6), SURFACE-2026-10-21-SUPERVISOR-AUTO-CHAINS-PRODUCT-AND-INCIDENT-WORKFLOWS (→ WP3 3.4), code-quality pointer; the margin SURFACE is resolved at finalize

## Code-Quality Review

*(feature-review-quality, 2026-10-21, on ship `c5fc34f` (feature `904dcc8`), window
`904dcc8^..c5fc34f`; drive_mode=autopilot. **0 CRITICAL, 3 MAJOR, 8 MINOR.** Ten were
auto-backlogged to `backlog-quality-findings.md` → `# m16-5-wp2-adjudicator-remeasure —
2026-10-21`, with a pointer in `backlog.md`. The stale-leaf MINOR was fixed in place.)*

### Strengths
- The probe reuses production code instead of copying it: the real `decideVerdict`/`readTurn` to
  mine, the real `tailTextOf` to slice, and the real `adjudicationPrompt`/`parseAdjudication` to
  score. So the M15 trap (scoring a prompt that did not ship) cannot happen again.
- Pure logic (`corpus`, `triage`, `score`, `seedJoin`, `redact`, `reviewer`) is tested; the IO
  and live calls sit in `*.probe.ts`, which are kept out of `verify:auto`.
- The redaction check looks at what is left, not a list of fields, and the sha256 freeze runs
  before any answer exists. Both make the evidence credible.
- The reviewer HTML escapes properly (`textContent` only, `embedJson` for `<`, U+2028 and U+2029),
  and both are tested with hostile input.
- `effective()` maps every non-PROCEED answer to AWAITING, as production does. The replay header
  says plainly that it pins a measured verdict, not a target.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`adjudicatorRemeasure.test.ts` + `_meta`] The replay is not bound to the prompt hash,
  `TAIL_CHARS` or the model id it measured. It stays green after WP3 3.5 rewrites the prompt.
- [`score.probe.ts` `WIP` constant] The freeze gate reads a WIP path that finalize moves to
  `archive/`, so 3.5's re-score fails with ENOENT.
- [`paths.ts` `OUT`] The full labelled set is a single, undocumented copy in gitignored `tmp/`,
  and it can be rebuilt only while every source transcript survives.

**MINOR**
- Resume never retries failed calls, and there is no `child.on("error")`.
- Run numbers are sorted as strings.
- The PRNG, the shuffle and `LABELS` are duplicated.
- The policy rule is restated in three places.
- Claudesk tails are kept by a prefix match.
- The measurement numbers are repeated in four places.
- `TAIL_CHARS` is exported but unused.
- A stale WIP leaf. *(fixed in place)*

### Assessment
This is careful, well-structured measurement tooling, and a good template for future probes. The
debt is all in durability: replay binding, a gate path that moves, and a single-copy dataset. All
three bite when WBS 3.5 re-uses the probe, so the pointer folds them into 3.5. The
production-side change (one comment correction, two exports) is small and sound.

### If you disagree
Mark a finding `[DISMISSED]` here before `feature-finalize` archives this file.

## Retrospect
- **What changed in our understanding:**
  - The adjudicator's problem is the QUESTION, not the bar. "Is this turn waiting for the human to
    reply?" is literally true of every unnecessary "shall I proceed?". So it withholds a third of
    real breaks (0.67), concentrated on ask-shaped turns.
  - The 0.86/0.85 that R-6 accepted described neither the shipped prompt (M15 scored a different
    one) nor the current model (the `sonnet` alias moved to `claude-sonnet-5-5` on 2026-09-29).
  - The operator's "truth" carries POLICY judgments the adjudicator cannot see: the product and
    incident workflows should not chain at all, a WP boundary is a legitimate pause, and a turn
    that presents its own checklist for approval is a real ask. These separated into a policy
    gate (WP3 3.4) and a design prior.
- **Assumptions that held:**
  - Driving the shipped `decideVerdict`/`readTurn`/`tailTextOf`/`adjudicationPrompt` gave a
    population and an input that are exactly production's (verified: Stop-time missed 0 / extra 0).
  - Freezing the labels before any answer kept the score non-circular.
  - The corpus was big enough for 3× (291 scored, against 70).
- **Assumptions that were wrong:**
  - **The labelling form.** A 336 KB markdown sheet was rejected outright ("6000+ lines of plain
    text"). The fix was a keyboard card reviewer plus two blind readers, reviewing only the sample,
    the BREAKs and the contested rows. The operator saw 105 cards instead of 225.
  - **Trusting uncontested BREAKs.** All 4 sample flips were reader-BREAK → operator-AWAITING, so
    every uncontested BREAK went to review.
  - **The cost:** $0.14 per call was a cold-cache trial; ~$0.005 is the real figure, which made
    the 3 runs trivial.
  - **The miner's first turn cut:** a `<local-command-caveat>` before `/exit` hid 13 fires, caught
    by verify-self.
  - The plan said verify-human was a divergence risk; there was none, because F12 never resolves
    to `auto`.
- **Approach delta:**
  - Phase 2 grew three tasks at verify-human: the second reader, the card reviewer, and the
    operator's sample gate. A `policy-excluded` class and an `operator-ruling` source were added
    from the operator's rulings.
  - Phase 3 ran all 3 runs after the cost correction.
  - Phase 4 did NOT move the bar: the verdict is "fails". It filed 3 SURFACEs and grew WP3 by
    3.4–3.6.
  - The review-quality MAJORs (replay binding, archive-path gate, single-copy dataset) are
    scheduled into WP3 3.5, where the probe is reused.

**Closure:** Requester = operator — closure notice for self-record.
> **Feature complete:** M16.5 WP2 has shipped. It re-measured the supervisor's adjudicator on
> 291 operator-labelled turns: it holds real waits at 0.92 but fires only 0.67 of real breaks,
> so it fails the 0.80 bar, and the follow-ups are WP3 3.4–3.6. The evidence and a no-live-call
> replay are `wp2-adjudicator-set.json` and `adjudicatorRemeasure.test.ts`; the full write-up is
> `wbs.md` → "Probe outcomes" → WP2.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SHORTCUT-2026-10-21] P1.2 — Turn prefixes now drop trailing `isMeta` user lines. A
  `<local-command-caveat>` before `/exit` had floored `readTurn` and lost 13 fires (3 of them M15
  seeds). Sessions under `-tmp-scratch-` slugs are excluded too. A unit test was mutation-proved.
  Re-verified by a fresh runner: Stop-time missed 0 / extra 0.
- [SHORTCUT-2026-10-21] P1.4 — The M15 join falls back to the same-edge candidate whose turn
  contains the seed line, with exact matches first and duplicate turns recorded (`d0a276b5:556`
  and `:563` are one turn). Re-verified by a fresh runner: all six accounting criteria pass.
- [SURFACED-2026-10-21] feature-plan — `wbs.md` is 349 lines (above the 300-line size guard). It
  was read by section (Rulings, WP1–WP3, Dependency map, Exit criteria, Probe outcomes), not
  truncated. Informational only; not logged to the backlog.
