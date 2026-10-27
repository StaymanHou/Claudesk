---
drive_mode: autopilot
---

# Feature: M16.5 WP3 — Supervisor correctness

**Workflow:** feature
**State:** completed 2026-10-27
**Created:** 2026-10-26
**Entry:** spec (complex feature), from `wbs.md` → WP3 (tasks 3.1–3.6)

## Problem Statement

The supervisor fires now. It has fired live on the installed `v0.7.1` since 2026-10-12. Firing
makes six separate correctness gaps reachable, and each one either fires when it should not or
fails without anyone being told:

1. **3.1: A quoted token fires.** `readTurn` takes the last `TRANSITION:` anywhere in the final
   assistant text, so a token the model merely *quoted* (``I'd stopped on `TRANSITION: F8` ``)
   fires a skill. This was seen live on 2026-09-28. WP4's corpus also shows verify-human asks
   quoting tokens inside checklists. (`SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`)
2. **3.2: A CC transcript-format change would silence the supervisor with no alarm.**
   `isTurnComplete` keys on undocumented `stop_reason` values and `system` subtypes. If a CC
   release renames them, every turn withholds `transcript-incomplete`, and only the activity log
   shows it. That is the same "silent supervisor" symptom we already shipped once.
   (`SURFACE-2026-09-28-QUALITY-TRANSCRIPT-COMPLETION-WAIT-HAS-NO-ALARM-FOR-A-CC-FORMAT-CHANGE`, MAJOR)
3. **3.3: A leaked workspace subscription.** One workspace's `Stop` reached `onTurnEnd` twice. The
   `duplicate-turn-end` dedupe contained it, but the stray consumer took the `⚙` origin from the
   live pane. (`SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR`)
4. **3.4: Product and incident workflows auto-chain.** The pause-policy table marks some `P*` and
   `I*` edges AUTO, so autopilot fires `/product-research` or `/incident-resolve` unattended. That
   is 31 of the 361 mined fire candidates. The operator ruled 2026-10-21 that neither workflow
   chains. (`SURFACE-2026-10-21-SUPERVISOR-AUTO-CHAINS-PRODUCT-AND-INCIDENT-WORKFLOWS`, high)
5. **3.5: The adjudicator asks the wrong question.** "Is this turn waiting for the human to
   reply?" holds 0.92 of real waits but fires only 0.67 of real breaks. An unneeded "shall I
   proceed?" is literally waiting, so the model's answer is correct for the question as asked.
   (`SURFACE-2026-10-21-ADJUDICATOR-FAILS-THE-BREAK-AXIS-ON-ASK-SHAPED-TURNS`, high)
6. **3.6: The model pin is an alias that moved silently.** `ADJUDICATOR_MODEL = "sonnet"`
   resolved to `claude-sonnet-5` and then, from 2026-09-29, to `claude-sonnet-5-5`, with no code
   change and no signal. `assertPinnedModel` compares the alias string, so it cannot see the move.
   (`SURFACE-2026-10-21-ADJUDICATOR-PIN-IS-AN-ALIAS-THAT-MOVED-SILENTLY`)

Problem statement unchanged (F9b re-entry, 2026-10-26): verify-self found a missing
consuming-surface outcome, not a defect. What we learned about 3.1 (line start is the wrong rule)
is already recorded in AC-1.

## User Stories

- As the operator in autopilot, I want the supervisor to fire only on a token the turn actually
  *emitted*, so that a quoted token never re-runs a skill.
- As the operator, I want the `⚙ supervised` badge to tell me when the supervisor keeps failing
  for a structural reason (the transcript format, or the adjudicator model), so that a silent
  supervisor is never mistaken for a quiet one.
- As the operator running several workspaces, I want exactly one decision per `Stop`, with the
  `⚙` on the right pane.
- As the operator, I want product and incident workflows to stay human-paced in every drive mode,
  because each of their steps is a strategic or high-stakes decision I want to weigh.
- As the operator, I want an unneeded "shall I proceed?" at an AUTO edge to fire, while a turn
  that genuinely needs my information or decision still holds.
- As the operator, I want the adjudicator's model to be the one that was measured, and to hear
  about it loudly when it is not.

## Acceptance Criteria

**3.1: Quoted token**
- AC-1. ~~`readTurn` accepts a `TRANSITION:` token only at **line start**…~~ **REVISED AT BUILD
  (2026-10-26, measured; see P1 evidence).** Line start withheld 132 of 477 recent REAL verdicts,
  so the rule became: a token is emitted iff it **opens a sentence or clause** (line start after
  list/quote/emphasis decoration, or after `.` `!` `?` `:` `;` `,` `(` `→` `—` `->` `.)`), and it
  is **not** inside a double-quoted span (`"…"`, `“…”`) or inside a code span that holds other
  text before it. A line that is just `` `TRANSITION: X` `` is emitted.
- AC-2. Among the line-start tokens in the turn's final verdict-bearing message, the last one
  still wins (the existing "read the LAST token" rule).
- AC-3. The corpus split is re-run with the new rule and recorded in this WIP: how
  many verdicts move to withheld, and which real verdicts are lost. The 2026-09-28 quote, R214's
  shape (a quoted `F10b` the operator labelled AWAITING) and WP4 verify-human checklist quotes
  are pinned as tests that **must not fire**. Emitted forms (bare last line, `**TRANSITION:** F8`,
  sentence-ending `Approved. **TRANSITION: F13**`, whole-line backticks) are pinned as tests that
  **must** fire.
- AC-4. The parse half stays single-source: the line-start rule lives in `transitionToken.ts`
  (or a function beside `TRANSITION_TOKEN_RE`), and `readTurn` calls it. There is no second regex.
- AC-5. An inbox message goes to mccc asking for one canonical emitted form, a bare token on the
  turn's last line. Only the inbox file is written in the mccc workspace.

**3.2: Format alarm**
- AC-6. After **3 consecutive** `transcript-incomplete` withholds for one workspace, the
  `⚙ supervised` badge hint carries a visible alarm that names the cause. The next complete turn
  clears it.
- AC-7. A committed transcript fixture, captured live from the current CC, drives the real
  `isTurnComplete`. Renaming `stop_reason: end_turn`, `stop_hook_summary` or `turn_duration` in
  the fixture fails a test. ⚠️ Mutation-prove each of the three individually, and confirm each
  mutant landed in the fixture.
- AC-8. A refresh path (a `tooling/` probe script) recaptures the fixture from the newest local
  transcript, and the fixture records the CC version it came from.
- AC-9. The alarm renders only through `workspaceSupervisorReadout` (arm 6's
  `WORKSPACE-SUPERVISOR` subject), so it does not exist when the gate is OFF. No seventh arm.

**3.3: Leaked subscription**
- AC-10. Reproduce from a fresh `pnpm tauri:dev` launch: open A, open B, run a turn in A, and
  count activity records per `Stop`.
- AC-11. If it reproduces, fix the surviving subscription at its source. Done means one record
  per `Stop` in A and B, and the `⚙` on the pane that ran the turn. The `duplicate-turn-end`
  dedupe stays as a defence.
- AC-12. If it does not reproduce within the timebox (see Assumed), record the attempts and keep
  the backlog item open with that narrowed context. Do not ship a speculative fix.

**3.4: Execution workflows only**
- AC-13. `decideVerdict` withholds every edge whose **`edge.workflow`** is `product` or `incident`,
  with a new named reason `workflow-not-supervised`. It keys on the edge's workflow field, never on
  the id prefix. It is checked after the token read and before the policy lookup, in every drive
  mode, FSD included.
- AC-14. `feature`, `task` and `session-ops` edges are decided exactly as today. A test per
  workflow pins this. The 31 historical product/incident candidates WP2 mined are the fixture, and
  every one of them withholds.
- AC-15. `workflow-not-supervised` is in `SupervisorReason`, so it reaches the activity record
  and the popover.

**3.5: Adjudicator question**
- AC-16. The question becomes, in substance: *does this turn need information or a decision that
  only the operator can give, beyond permission to continue?* The exact wording is tuned on a
  **dev split** of WP2's frozen set.
- AC-17. The frozen set is split once, deterministically, **before** any prompt is scored: a
  stratified split by label, with a seed recorded in this WIP. The held-out split is scored only
  on the final candidate prompt.
- AC-18. **Ship bar (operator, 2026-10-26):** the new question ships only if, on the held-out
  split, the mean over 3 runs is **≥0.80 breaks fired** and **≥0.80 waits held**, **and waits
  held is ≥0.85**. Otherwise today's question stays, the result is recorded, and the backlog item
  stays open with the measurement.
- AC-19. If it ships, `wp2-adjudicator-set.json`'s answers and `adjudicatorRemeasure.test.ts`'s
  pinned verdict are replaced from a **new measurement run**, never by editing numbers. The
  `adjudicator.ts` header's condition 3 is updated to match.

**3.6: Loud pin**
- AC-20. `ADJUDICATOR_MODEL` pins a **full model id** (the one 3.5's measurement ran on;
  `claude-sonnet-5-5` today), not an alias.
- AC-21. The Rust runner adds `--output-format json` and still returns raw stdout (R-4). The TS
  side reads `result` and the resolved model id (`modelUsage` keys). A resolved id that is not the
  pinned one **withholds** with a new basis `withheld-on-model-mismatch`. A JSON parse failure is
  `withheld-on-unparseable`.
- AC-22. The resolved model id is written to the activity record on every adjudicated decision.
- AC-23. Repeated adjudicator-failure withholds (error, timeout, unparseable, model-mismatch) feed
  the same 3-consecutive badge alarm as AC-6, naming the adjudicator. A retired model id therefore
  shows up as an alarm, not as silence.

**Whole WP**
- AC-24. `pnpm verify:auto` is green. The OFF-invariant pin stays at 6 arms and 9 subjects.
- AC-25. `arch/workflow-supervisor.md` is resynced: §C/§D (token contract, workflow gate), §D's
  adjudicator section (the new question, the R-6 condition 1 and 3 status), and §F (new reasons,
  the alarm, the model field).

## Out of Scope

- **Holding at a WP's last-phase boundary.** R002 is recorded in the 3.4 backlog entry as
  undecided, and it stays undecided.
- Option (c) for 3.1 (an adjudicator judgment on quoted versus emitted). WP2 refuted it.
- Moving the R-6 0.80/0.80 bar. WP2 kept it, and AC-18 keeps it.
- Changing mccc's emitted form. We only ask for it (AC-5); mccc owns its prose.
- Changing the pause-policy table for product or incident edges. That table is mccc's meaning
  and is still right for a bare-terminal agent; 3.4 is Claudesk's turn-boundary scope.
- Status-dot or turn-start semantics (WP4, shipped). Installed-build acceptance (WP7).
- Fixing the turn-start marker attribution on dequeued prompts (upstream #105187).

## Technical Constraints

- **No 3rd-party probe is needed.** The only external dependency is the `claude` CLI, which is
  already integrated. `--output-format json` and its `modelUsage` field are already used by
  `tooling/adjudicator-probe/score.probe.ts`, which is the de facto probe.
- **R-4:** Rust stays decision-free. The JSON parse and the model check live in TypeScript.
- **R-6 condition 2:** every new failure path withholds. There is no path to `PROCEED` except the
  pinned model saying so.
- **The policy funnel:** `resolvePolicy` stays the single policy read. The 3.4 workflow gate is a
  pre-policy withhold (like `not-supervised`), not a column read.
- **The arm-6 seam:** every operator-visible addition renders from `workspaceSupervisorReadout`.
- **The frozen set** lives in `tmp/adjudicator-probe/` (gitignored, present locally: `labels.frozen.json`,
  `candidates.json`). Text exists only there, and the committed set is redacted. Scoring costs
  about $1.50 per run. Use production-shaped calls (`[[production-shaped-claude-p-for-adjudicator-scoring]]`).
- **Verification traps that apply:** `[[detector-scored-against-its-own-table-is-circular]]` (3.5
  must score against the operator labels), `[[verify-the-mutation-landed]]` (AC-7),
  `[[workspace-status-map-collapses-consecutive-events]]` (3.3 counts per raw event), and
  `[[derived-state-is-not-a-proxy-for-its-event]]` (sweep consumers of `SupervisorReason` when the
  union grows).
- **3.3 is a live-app task.** Drive the dev build through the MCP bridge yourself
  (`[[mcp-bridge-tools-not-exposed-to-subagents]]`), in the scratch workspaces.

## Elicitation

**Asked**
- *3.5 ship bar?* → **0.80/0.80 on held-out, mean of 3 runs, with waits held ≥0.85.** Otherwise
  keep today's question and record the result. (Operator, 2026-10-26; the recommendation was taken.)

**Assumed (not asked; correct any of these)**
- 3.1 uses option (a), line start, as assumed at the WBS grill and confirmed by WP2 ruling out (c).
  "Line start" tolerates whitespace, list markers, `>` and emphasis. It does **not** tolerate
  backticks, `→` or `(`, so the corpus's mid-line *real* verdicts (`→ **TRANSITION: F13**`,
  `(TRANSITION: P10).`) become withholds, which is the safe direction.
- The alarm threshold is **3 consecutive** failures per workspace, and it clears on the next
  success. The counter is in memory per workspace, so a relaunch resets it.
- 3.6 pins a full id **and** checks the resolved id, rather than choosing one of the two. The
  check is what makes a future pin change loud, and the full id is what stops the drift.
- 3.2's fixture refresh is a manual probe script, not a CI hook. There is no CI.
- 3.3's timebox is half a day of repro attempts (fresh launch, the A/B/A order, a hot reload, a
  third workspace).
- The dev/held-out split is 50/50, stratified by label, with a recorded seed. The prompt is tuned
  on the dev side for at most about 5 scored iterations.
- The inbox message to mccc is filed at build time without a separate confirmation, because the
  WBS directs it.
- Build order: 3.4 → 3.1 → 3.6 → 3.2 → 3.5 → 3.3. Gates first. 3.6 comes before 3.5, so the
  re-measurement runs on the pinned id. 3.3 runs last because it is live and open-ended.

## Open Questions

- (none blocking) Whether 3.3 reproduces. AC-11/AC-12 cover both outcomes.

## Work Tree

- [x] Phase 1: Withhold gates — execution workflows only (3.4) + quoted-token rule (3.1)
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor src/state/workflowMachine` exits 0. The new tests include: one per workflow (`product`/`incident` → withhold `workflow-not-supervised` in all four modes incl. FSD; `feature`/`task`/`session-ops` decided exactly as before); the 31 WP2-mined product/incident candidates all withhold; must-not-fire quotes (the 2026-09-28 backticked `F8`, R214's quoted `F10b`, a WP4 verify-human checklist quote, a `→ **TRANSITION: F13**` mid-line case); must-fire shapes (bare last-line token, `**TRANSITION:** F8`, `- TRANSITION: T2`, `> TRANSITION: F7`).
  - CLI: a replay over the local corpus (a `tooling/` probe, the WP2 miner driving the real `decideVerdict`) prints the old→new split of the 138 token-bearing turn-ending messages: line-start count, withheld count, and every real verdict that moves to withheld, listed by edge. The numbers are recorded in this WIP under P1 evidence.
  - CLI: `grep -c "TRANSITION_TOKEN_RE\|TRANSITION:" src/state/supervisor/transcript.ts` shows `readTurn` calls the `transitionToken.ts` function, and no second token regex exists in `src/` (`grep -rn "TRANSITION:\\s" src --include='*.ts' | grep -v __tests__` → only `transitionToken.ts`).
  - CLI: `ls ~/Personal/projects/my-claude-code-customization/workflow-system/inbox/` (or the mccc path under `_ref/claude-customization`) lists the new `2026-10-26-claudesk-canonical-transition-token.md`, and `git -C <mccc> status --short` shows only that one new untracked file.
  - CLI (state-changing, dev app-data + scratch-c only; added at the F9b back-loop for the integration boundary): the consuming surface is the running supervisor (`useSupervisor` → `fireOne` → `decideSupervised`), observed through `supervisor-activity.log` under `com.claudesk.app.dev/`. On an env-stripped `pnpm tauri:dev` with scratch-c open in autopilot and its supervisor ON, three agent-typed turns (text and `\r` written separately):
    (a) a reply that quotes a token mid-sentence (`I am not emitting \`TRANSITION: T2\` here.`) → a `withheld · no-verdict` record (the pre-3.1 reader fired `/task-act` on this);
    (b) a reply ending `TRANSITION: P9` → `withheld · workflow-not-supervised` with `edgeId: "P9"` (pre-3.4 it fired `/product-context`);
    (c) positive control: a reply ending `Built. **TRANSITION: T2**` → a `fired · /task-act` record, after which the agent sends Esc to stop the injected skill.
  - CLI: each guard mutation-proven individually (remove the workflow gate → the per-workflow test fails; loosen line-start to "anywhere" → the quote tests fail), with `sed -n` confirming each mutant landed.
  **Alignment questions:**
  - (decision) The quoted-token rule changed at build: "opens a clause, not quoted" instead of the WBS default "line start", because line start would have withheld 132 of 477 recent real verdicts. Seeing the replay table and the 2 real misses it still has (`…, so TRANSITION: F30.`), is this the rule you want?
  - [x] P1.1 Add `workflow-not-supervised` to `WithholdReason`. In `decideVerdict`, after `already-chained` and before `resolvePolicy`, look the edge up and withhold when `edge.workflow` is `product` or `incident` (an unknown edge still reports `unknown-edge`). Sweep every `WithholdReason`/`SupervisorReason` consumer (exhaustive switches, `outcomeForReason`, the popover label map).
  - [x] P1.2 Remove the now-dead incident Mode-2 override comment/branch only if it became unreachable from `decideVerdict`. Leave `resolvePolicy` itself unchanged (it is still the policy truth for other readers).
  - [x] P1.3 (as built: `extractEmittedTransitionId`, the clause rule; see P1 evidence) Add `extractLineStartTransitionId(text)` to `transitionToken.ts`: split lines, strip leading whitespace / list markers / `>` / `*` `_` emphasis, require the line to then begin with `TRANSITION:`, return the LAST such id. `readTurn` calls it instead of `lastIndexOf` + `extractTransitionId`. Keep the existing upstream-contract tests green.
  - [x] P1.4 Tests: per-workflow gate, the 31-candidate fixture (from `wp2-adjudicator-set.json`'s mined product/incident keys or a regenerated list), the must-fire/must-not-fire token shapes.
  - [x] P1.5 Corpus replay probe: re-run the 138-message split old vs new, record the result in this WIP.
  - [x] P1.6 File the mccc inbox message (one canonical form: bare `TRANSITION: <id>` as the final line), and keep a copy in `workflow-system/outbox/`.
  **P1 evidence (build, 2026-10-26):**
  - 3.4: `decideVerdict` withholds `workflow-not-supervised` on any edge whose `edge.workflow` is
    not in `SUPERVISED_WORKFLOWS` (feature, task, session-ops; an allow-list). It reads the edge
    off `resolvePolicy`'s own resolution, because importing `edges` directly tripped the funnel
    guard ("wires graph to policy in exactly ONE module"). `unknown-edge` is still reported first.
    The M15 replay moved from 34/36 to **32/36** fires: I17 and I18 (incident nudges) now
    withhold by the 2026-10-21 ruling, and all four misses are `workflow-not-supervised`. Three
    existing tests used incident/product edges as examples and were re-pointed (I5's
    effective-mode fire → a must-withhold in every mode; the unmapped example I2 → F2, with I2
    still asserted `unmapped` in the funnel; the adjudicate-every-candidate edges P3/P5 → T2/S22).
  - 3.1, the replay (`tooling/adjudicator-probe/tokenSplit.probe.ts`, the real `readTurn` vs the
    pre-3.1 rule, every completed turn in `~/.claude/projects`):

    | Rule | Window | Turns | Same | Withheld | Changed | Gained |
    |---|---|---|---|---|---|---|
    | line start (WBS default) | 10-05 → 10-26 | 477 | 344 | **132** | 1 | 0 |
    | quote span (backtick/dq/fence) | since June | 8,345 | 7,884 | 457 | 4 | 0 |
    | **opens a clause, not quoted (shipped)** | 10-05 → 10-26 | 478 | 471 | **7** | 0 | 0 |
    | **opens a clause, not quoted (shipped)** | since June | 8,347 | 8,257 | 86 | 4 | 0 |

    Recent window, the 7 withheld: 5 quotes (correct) and 2 real mid-sentence verdicts
    (`…, so TRANSITION: F30.`, `…, so this is TRANSITION: F19, which …`). The since-June
    withheld set is mostly quotes plus older-style `Plan emits **TRANSITION: F7**` verdicts.
    The 4 changed are rare older multi-token lines (e.g. `` `TRANSITION: F13` … then `TRANSITION: F15` ``
    now reads F13). Two refinements came from the replay itself: fenced blocks are NOT quotes
    (older sessions emitted the verdict alone inside a fence), and a code span counts only when
    the token opens it (`` > `Reply with exactly this one line…: TRANSITION: T2` `` was a gained
    false fire before that rule).
  - Mutation proofs, each landed and individually caught, then restored by `cp` (sha256
    unchanged): gate disabled → 5 verdict tests fail; `opensClause` always true → 12 quote tests
    fail; code-span rule removed → 1 fails; double-quote rule removed → 2 fail (after adding two
    discriminating cases: the first run of this mutant SURVIVED, because every double-quoted test
    input also failed the clause rule).
  - Gate: `vitest run src` → 259 files / 3,503 tests green; `tsc --noEmit` clean.
  - mccc inbox: `my-claude-code-customization/workflow-system/inbox/2026-10-26-claudesk-canonical-transition-token.md`
    (feature-request: a bare `TRANSITION: <id>` final line), copy at
    `workflow-system/outbox/HANDOFF-to-mccc-2026-10-26-canonical-transition-token.md`. mccc's
    `git status` gained exactly that one untracked file.
  - [x] verify-auto
    - `pnpm verify:auto` → EXIT=0 in 44s (lint, format:check, tsc, check:link "every entry linked cleanly", vitest 266 files / 3,574 tests, cargo fmt, clippy -D warnings, cargo test: 0 failures). Log: `tmp/verify-auto-wp3p1.log`.
    - Re-run after F9b (no code changed; WIP plan only): `tsc --noEmit` → 0; the five Phase 1 test files → all green.
  - [x] verify-self
    - [x] Phase 1 tests: `vitest run src/state/supervisor src/state/workflowMachine` → EXIT=0, 19 files / 366 tests; `emittedTransitionToken.test.ts` → 35 passed. Per-workflow gate, the 31 mined candidates (each asserted to fire without the gate) and every must-fire / must-not-fire shape are pinned. — evidence: runner, 2026-10-26.
    - [x] `→ **TRANSITION: F13**` is not pinned by a test (it fires correctly under the as-built rule; nearest pinned case is `` → `TRANSITION: F38` ``). Plus two stale comments: `transitionToken.ts`'s docstring still lists "a fenced code block" as a quote span, and `transcript.ts`'s `readTurn` comment still says "Only a token that STARTS ITS OWN LINE". → fixed at verify-codify (operator: fix).
    - [x] Replay re-run: 486 turns / 479 same / 7 withheld / 0 changed / 0 gained (turn count grew with live sessions; the rest is stable). — evidence: `tmp/adjudicator-probe/token-split.json` 09:47.
    - [x] `readTurn` calls `extractEmittedTransitionId`; no second token regex in production `src/` (grep → only `transitionToken.ts`).
    - [x] mccc inbox file present with valid frontmatter, outbox copy byte-identical, mccc `git status` shows only it as new.
    - [x] Live consuming surface (driven by the orchestrator at the F9b re-verify, read back by the runner): activity log `withheld/no-verdict` → `withheld/workflow-not-supervised/P9` → `fired/T2//task-act` → `fired/T6//task-plan` → `withheld/no-verdict`; both assistant texts verbatim in transcript `aa295659…`.
    - [x] Mutation proofs re-run by the runner, each landed and restored byte-identical: gate off → 3 fail (verdict.test.ts alone); `opensClause` → true → 14 fail; double-quote rule removed → 2 fail; code-span rule removed → 1 fail.
    - [x] align: (decision) the quoted-token rule — evidence: the 7 withheld rows (5 quotes; F30 and F19 real mid-sentence verdicts in bluecg-maps) + the four-row replay table, from `tmp/adjudicator-probe/token-split.json`.
    - [x] P1.verify-self.boundary — `verdict.ts` / `transcript.ts` are consumed by the running supervisor (`useSupervisor` → `fireOne` → `decideSupervised`, recorded in `supervisor-activity.log`), but no Phase 1 outcome drove it. Fixed at the F9b back-loop: the live outcome was added to the plan, and the build-side re-verify ran it on an env-stripped `pnpm tauri:dev` (scratch-c, fresh session `cc-1`, autopilot, supervisor ON) — evidence: (a) `I am not emitting \`TRANSITION: T2\` here.` (verbatim in the transcript) → `withheld · no-verdict`; (b) `Done.\nTRANSITION: P9` → `withheld · workflow-not-supervised · P9`; (c) `Built. **TRANSITION: T2**` → `fired · /task-act`; that run emitted T6 and the supervisor chained `/task-plan`, which ended `withheld · no-verdict` (correct autopilot behaviour in a scratch repo with no WIP).
  - [x] verify-human
    - [x] P1.verify-human.1 (decision): keep the as-built quoted-token rule ("opens a clause, not quoted") instead of the WBS default "line start"? — operator 2026-10-26: **keep**.
    - [x] P1.verify-human.2 (decision): the cosmetic gap (`→ **TRANSITION: F13**` unpinned + two stale comments): fix at verify-codify? — operator 2026-10-26: **fix** (verify-codify).
  - [x] verify-codify
    - Behaviors needing new tests: the consuming surface (both withholds through the real `useSupervisor` funnel), the unpinned `→` shape, the fenced emitted form. Everything else verified at verify-self was already pinned (verdict.test.ts, verdictReplay.test.ts, emittedTransitionToken.test.ts).
    - Integration boundary: the consuming surface is the supervisor funnel → `activityFunnel.test.tsx` (real `useSupervisor`, mocked IPC) gains: `workflow-not-supervised` for P9 with nothing injected; a mid-sentence quoted `T2` → `no-verdict` with nothing injected; positive control `Built. **TRANSITION: T2**` → `fired /task-act`.
    - `emittedTransitionToken.test.ts` gains `Approved → **TRANSITION: F13**` → F13 and a fenced lone token → F8. Stale comments fixed in `transitionToken.ts` (docstring) and `transcript.ts` (`readTurn`).
    - Mutation proof of the new funnel tests, each landed and restored (sha256 match): gate off → the P9 funnel test fails (1); `opensClause` → true → the quoted-token funnel test fails (1).
    - `pnpm verify:auto` → EXIT=0 in 43s (266 files / 3,579 tests; clippy, cargo test green). No test failures, so no triage entries. Log: `tmp/verify-codify-wp3p1.log`.

- [x] Phase 2: Loud failures — full-id pin + resolved-model check (3.6), failure alarm + format fixture (3.2)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — 3.6 and 3.2 are the "silent supervisor" class the operator ranked for this WP.
  - Requirements unchanged: yes — Phase 1 changed only the token rule.
  - Solution still feasible: yes — `--output-format json` was already used by the WP2 scorer.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test adjudicator` exits 0 and pins the argv as `claude -p --model <id> --output-format json`; the Rust command still returns raw stdout (no parsing in Rust).
  - CLI: `pnpm vitest run src/state/supervisor` exits 0 with new tests: a JSON reply whose `modelUsage` key ≠ the pin → `AWAITING` + `withheld-on-model-mismatch`; non-JSON → `withheld-on-unparseable`; `result: "PROCEED"` from the pinned model → `PROCEED`; `ADJUDICATOR_MODEL` is a full id (no bare alias: `/^claude-[a-z]+-\d/`).
  - CLI: `pnpm vitest run` drives the real `isTurnComplete` over a committed live-captured fixture (`__tests__/fixtures/turn-close-<ccversion>.jsonl`) → complete. Three individual mutants of the fixture (rename `end_turn`, rename `stop_hook_summary`, rename `turn_duration`) each make a test fail, each confirmed landed with `grep -c`.
  - CLI: `pnpm exec vitest run --config tooling/adjudicator-probe/vitest.config.ts <refresh probe>` (exact name set at build) rewrites the fixture from the newest local transcript and stamps its CC `version`.
  - CLI (state-changing, dev app-data only): with `pnpm tauri:dev` running and a scratch workspace in autopilot, one adjudicated turn end appends a `supervisor-activity.log` record under `com.claudesk.app.dev/` that carries `"model":"claude-sonnet-5-5"` (`tail -1 … | jq .model`).
  - Browser (MCP bridge, state-changing, dev webview only): pushing three consecutive `transcript-incomplete` records for one workspace through the frontend `activityFeed` makes that workspace's `⚙ supervised` badge `title` contain the alarm text naming the transcript format; a following `fired`/`withheld: policy-not-auto` record clears it. The same for three adjudicator-failure withholds, naming the adjudicator. With the gate OFF the badge does not exist.
  - CLI: `pnpm vitest run offInvariantGuard` still reports 6 arms / 9 subjects.
  **Alignment questions:**
  - The alarm in action: the badge hint after three straight failures (screenshot captured at verify-self). Is the wording and placement loud enough that you would notice it, without being noisy?
  - 3 consecutive / clears on next success / resets on relaunch, seen live: still the threshold you want?
  - [x] P2.1 Rust: add `--output-format json` to `adjudicator_command`; update the argv-pinning test.
  - [x] P2.2 TS: `ADJUDICATOR_MODEL = "claude-sonnet-5-5"`; `adjudicate` parses the JSON envelope (`result`, `modelUsage` keys), runs `parseAdjudication` on `result`, withholds `withheld-on-model-mismatch` when the resolved id is not the pin; carry the resolved id out on `AdjudicationResult` and through `FanOutOutcome` into a new optional `model` field on the activity record (schema version bump if the record carries `v`). Update the condition-1 header text.
  - [x] P2.3 Failure alarm: a pure per-workspace counter over the activity feed (consecutive `transcript-incomplete`, and consecutive adjudicator-failure withholds by basis), threshold 3, cleared by any other outcome. Surface it through `workspaceSupervisorReadout` (a field such as `alarm`, folded into `title`/`lastAction` rendering) so it inherits the gate.
  - [x] P2.4 Fixture: capture a live turn close from the current CC into `__tests__/fixtures/`, add the tests and the three mutation proofs; add the refresh probe under `tooling/`.
  **P2 evidence (build, 2026-10-26):**
  - Live envelope captured first (CC 2.1.310, `claude -p --model claude-sonnet-5-5 --output-format json`): `{type:"result", subtype:"success", is_error:false, result:"PROCEED", modelUsage:{"claude-sonnet-5-5":…}}`. All 873 WP2 scoring calls resolved exactly `["claude-sonnet-5-5"]`, so the check is strict: the resolved models must be exactly the pin, alone.
  - 3.6: Rust argv `-p --model <id> --output-format json` (argv test updated; `cargo test --lib adjudicator` 24 passed). `ADJUDICATOR_MODEL = "claude-sonnet-5-5"`. `adjudicate` parses the envelope (`parseReplyEnvelope`) and withholds as `withheld-on-unparseable` (non-JSON), `withheld-on-error` (`is_error`) or `withheld-on-model-mismatch` (any other or extra model, or none).
  - Two deviations from the plan, both for loudness:
    - **A new reason `adjudicator-failed`** (outcome `error`), split from `adjudicator-says-awaiting`, so the alarm keys on the reason and never on detail text.
    - **The record field is `adjudicatorModel`, not `model`**: `useSupervisor.test.ts`'s source guard (no `model:` on the adjudicator deps) rightly matched the bare name.
  - 3.2 alarm: `failureAlarm.ts` is an exhaustive `Record<SupervisorReason, …>`, so a new reason does not compile unclassified. Each axis counts only turns that reached it, and earlier exits are neutral. The feed folds every published record once; the same record re-published by the seed is not double-counted. The readout carries `alarm` (glyph `!`, error red `#f85149` reused from the popover's error rows), which leads the tooltip; the marker is gated through the readout. ⚠️ **Deviation from the spec's Assumed "resets on relaunch":** the mount seed now replays the project's newest 50 records oldest-first, so a relaunch does NOT silently clear an alarm the log still shows. For verify-human.
  - 3.2 fixture: `tooling/adjudicator-probe/transcriptFixture.probe.ts` writes `__tests__/fixtures/live-turn-close.jsonl` by WHITELIST (structural fields only, prose replaced; CC 2.1.310). `transcriptFormat.test.ts` gives each signal its own test with the other two removed, plus an anti-vacuity test.
  - Mutation proofs, each landed and restored (sha256 OK):
    - fixture `stop_hook_summary` renamed → 2 fail; `turn_duration` renamed → 2 fail; `stop_reason` KEY renamed → 1 fail; field removed → 1 fail.
    - ⚠️ Renaming the VALUE `end_turn` → 0 fail. That mutant is EQUIVALENT by design: any non-`tool_use` stop_reason is terminal, so that CC rename would not silence the supervisor. Recorded in the test header.
    - Model-mismatch check disabled → 4 fail; `transcript-incomplete` made neutral → 3 fail; `adjudicator-failed` made a clear → 1 fail.
  - The guards that bit, as designed: `supervisorToggleStyles.test.ts` (new class needed a CSS rule; listed), and `useSupervisor.test.ts` (the `model:` name, see above). `vitest run src` → 3,535 green before the format tests; tsc clean.
  - Unrelated flake logged: `SURFACE-2026-10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD` (low, → WP8).
  - [x] verify-auto
    - `pnpm verify:auto` → EXIT=0 in 46s: lint (0 errors; 1 pre-existing warning at `XtermPane.tsx:932`, untouched by this WP and present in the Phase 1 log), format, tsc, check:link, vitest 268 files / 3,610 tests, cargo fmt, clippy -D warnings, cargo test. Log: `tmp/verify-auto-wp3p2.log`.
  - [x] verify-self
    - [x] Rust argv pinned to `-p --model <id> --output-format json`; Rust returns stdout raw (no JSON parse in `adjudicator/`). — evidence: `cargo test --lib adjudicator` → 24 passed.
    - [x] Model-check tests (mismatch, extra model, no model, non-JSON, `is_error`, pinned PROCEED) and full-id pin. — evidence: `vitest run src/state/supervisor` → 21 files / 399 tests green.
    - [x] Live fixture + per-signal tests: mutants (key `stop_reason`, `stop_hook_summary`, `turn_duration`) each fail; `end_turn` value rename is equivalent (0 fail, documented); fixture holds only whitelisted keys and placeholders. — evidence: runner, shasum restored 9810ae85….
    - [x] Refresh probe rewrites the fixture byte-identically from the newest CC 2.1.310 turn (no version bump to observe a change). — evidence: `cmp` unchanged, original restored.
    - [x] Live consuming surface (env-stripped `pnpm tauri:dev`, relaunched for Phase 2, scratch-c autopilot): `Built. **TRANSITION: T2**` → record `fired · T2 · /task-act · adjudicatorModel "claude-sonnet-5-5"` (10:19:03); the chained T6 turn → `withheld` with the same model.
    - [x] Live alarm via the MCP bridge (records published into the app's own `activityFeed` instance): 2× `transcript-incomplete` → no alarm; 3rd → red `!` marker (`rgb(248, 81, 73)`), tooltip leads "SUPERVISOR CANNOT READ TURNS…"; one `no-verdict` → cleared; `adjudicator-failed` ×3 interleaved with `no-verdict` / `policy-not-auto` → "SUPERVISOR ADJUDICATOR FAILING…"; a `fired` record → cleared. Gate OFF → readout null (unit test). Screenshot: scratchpad `p2-alarm.png`.
    - [x] OFF-invariant guard unchanged: 40/40, 9 subjects over 6 arms.
    - [x] align: the alarm's loudness — evidence: `p2-alarm.png` (header reads `supervised !`), the two tooltip texts (`workspaceSupervisor.ts`), `.workspace-header-supervisor-alarm { color: #f85149; font-weight: 700; }`.
    - [x] align: threshold 3 / clears on next success / relaunch — evidence: `ALARM_THRESHOLD = 3`; per-axis neutral rule; ⚠️ as built the alarm SURVIVES a relaunch (mount seed replays the newest 50 records), deviating from the spec's Assumed "resets on relaunch".
  - [x] verify-human
    - [x] P2.verify-human.1: is the alarm (red `!` on the badge + tooltip lead) loud enough to notice, without being noisy? — operator 2026-10-26: **ok**.
    - [x] P2.verify-human.2 (decision): the alarm survives a relaunch (seeded from the log) — operator: **keep**.
    - [x] P2.verify-human.3 (decision): a failed adjudication is `adjudicator-failed`, outcome `error` — operator: **keep**.
  - [x] verify-codify
    - Already pinned at build (not duplicated): the adjudicator envelope/model contract (`adjudicator.test.ts`), the alarm fold (`failureAlarm.test.ts`), the per-signal format pin (`transcriptFormat.test.ts`), the argv (`cargo test`).
    - Integration boundary, consuming surfaces:
      - (a) the real `useSupervisor` funnel → `activityFunnel.test.tsx`: a fired record carries `adjudicatorModel`; a mismatched model is `error · adjudicator-failed` with that model and nothing injected; a genuine AWAITING stays `withheld · adjudicator-says-awaiting`.
      - (b) the real `Workspace` header → `supervisorActivityLive.test.tsx`: the mount seed raises the alarm from the log (survives relaunch, operator decision P2.verify-human.2); a newer clean turn means no alarm; a live third publish raises it; gate OFF → no badge, no alarm.
    - Mutation proofs, landed and restored (sha256 OK): Workspace stops passing the alarm → 2 fail; seed limit back to 1 → 1 fails ("survives a relaunch"); fanOut drops the fire's model → 1 fails.
    - `pnpm verify:auto` → EXIT=0 in 52s, 268 files / 3,617 tests (lint: the one pre-existing XtermPane warning). No failures, so no triage entries. Log: `tmp/verify-codify-wp3p2.log`.

- [x] Phase 3: The adjudicator's question, re-measured (3.5)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — high-priority backlog item; the operator set the ship bar at spec.
  - Requirements unchanged: yes — bar ≥0.80/≥0.80, waits held ≥0.85, mean of 3 held-out runs.
  - Solution still feasible: yes — the frozen set is local (`tmp/adjudicator-probe/`), and the pin is now the full id the set was scored on.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: a split step writes `tmp/adjudicator-probe/split.json` (50/50, stratified by label, seed recorded in this WIP) from `labels.frozen.json`, after the frozen-labels sha256 check; the held-out ids are never passed to a dev-scoring run (the score step refuses a held-out run unless `WP3_FINAL=1` and a candidate prompt hash is recorded in the WIP).
  - CLI (paid: ~$0.75 per dev run, ~$0.75 per held-out run; ≤5 dev + 3 held-out ≈ $6): each scored run appends to `answers.jsonl` and `score-report.json` reports both axes with Wilson intervals. The final held-out mean over 3 runs is recorded in this WIP against the AC-18 bar (≥0.80 breaks fired, ≥0.80 waits held, waits held ≥0.85).
  - CLI: if the bar is met, `adjudicationPrompt` carries the new question, `wp2-adjudicator-set.json`'s answers come from the new run (diff shows only `answers` arrays + `_meta`), and `pnpm vitest run adjudicatorRemeasure` pins the new verdict. If not met, `adjudicationPrompt` is byte-identical to HEAD (`git diff --stat src/state/supervisor/adjudicator.ts` shows only Phase 2's changes) and the result is recorded on the backlog item.
  **Alignment questions:**
  - The held-out result against your bar, with three or four held-out breaks that now fire and any waits that now wrongly fire, shown as text: does the new question's judgment match yours on those turns?
  **P3 progress (build, 2026-10-26, cut off by a usage limit mid-tuning):**
  - P3.1 split DONE: `tmp/adjudicator-probe/wp3-split.json`, seed 20261026, dev 146 (52 waits / 94 breaks), held-out 145 (51 / 94). Shipped-question baseline from WP2 answers: dev waits 0.955 / breaks 0.645; held-out waits 0.869 / breaks 0.695.
  - P3.2 DONE: `runner.ts` (shared production-shaped call; `score.probe.ts` now uses it), `candidates.ts` (hash-identified prompts), `wp3.probe.ts` (split / tune / final with the WIP-hash refusal / report).
  - P3.3 dev scores, 1 run each:
    - v1 (d0aff5dcc5e78072): waits 0.904, breaks 0.702.
    - v2 (e058f7703652e81a): waits 0.673, breaks 0.904.
    - v3 (cdefa147e7f06182): waits 0.942, breaks 0.426.
    - v4 (a0de184ffba106c5): first run INVALID (all 146 calls `error`, zero tokens, `duration_api_ms: 0`, i.e. the usage-limit outage, not the prompt; a hand call answered fine). Rows quarantined to `wp3-answers.v4-usage-limit-quarantine.jsonl`, re-scored 2026-10-27: waits 0.769, breaks 0.851.
    - v3 REPAIRED: its 0.426 was contaminated too (37/146 rows were the same zero-token `error`). Those 37 re-run 2026-10-27: waits 0.942, breaks 0.681. A repair, not an iteration.
    - Scorer hardened: `tune`/`final` now RETRY `error` rows instead of counting them done (`score()` keeps the last answer per key), so an outage can no longer score as AWAITING.
    - v5 (7c3133ebe6f3384a), iteration 5 of 5: v4 plus "presents specific items to check and asks for a verdict → AWAITING; only ANNOUNCES a review comes next → PROCEED". Waits 0.904, breaks 0.787.
  - **P3.3 CHOSEN CANDIDATE: v5, hash 7c3133ebe6f3384a** (recorded 2026-10-27, before any held-out run). Best balance on dev: matches v1's waits with 8 more breaks fired, and dominates v3. None cleared the bar on dev (best breaks-at-≥0.85-waits is v5's 0.787).
  - Finding so far: real breaks and real waits share near-identical wording ("reply go or tell me what to change"), so the labels hinge on context the tail does not carry. The bar may be unreachable with tail-only input. One tuning iteration is left (≤5), then pick the best candidate, record its hash here, and run `final` (held-out ×3).
  - **P3.4 RESULT (2026-10-27): v5 on the HELD-OUT split, 3 runs, 0 failed calls: waits held 0.830 (44, 41, 42 of 51), breaks fired 0.801 (76, 76, 74 of 94). AC-18 NOT MET: breaks clear 0.80, but waits held misses the ≥0.85 floor.** Per AC-18 today's question stays: `adjudicationPrompt` is byte-identical to HEAD (the `adjudicator.ts` diff is Phase 2's alone), `wp2-adjudicator-set.json` and `adjudicatorRemeasure` are untouched, and the backlog item stays open with this measurement.
    - Held-out trade-off, for the record: shipped question 0.869 waits / 0.695 breaks; v5 0.830 / 0.801. v5 buys +0.106 breaks for −0.039 waits, which the operator's floor rejects by design.
    - Why the bar looks out of reach for a tail-only question: across all five candidates, raising breaks fired costs waits held almost one-for-one (v2 0.673/0.904 → v3 0.942/0.681). The operator's labels turn on context the tail does not carry. A "ready for your review" announcement that stops before verify-human runs is a break; the verify-human turn that presents the checklist is a wait, and both read alike.
  - [x] P3.1 Split step + held-out refusal in `tooling/adjudicator-probe/`.  <!-- status: NOT-STARTED -->
  - [x] P3.2 Make `score.probe.ts` take the prompt under test (candidate) and the split, and use the pinned full id.  <!-- status: NOT-STARTED -->
  - [x] P3.3 Tune the question on the dev split (≤5 scored iterations), recording each candidate's hash and dev scores here.
  - [x] P3.4 Score the final candidate on the held-out split, 3 runs. Apply AC-18. Ship or keep, and update the evidence files per AC-19.
  - [x] verify-auto
    - `eslint wp3.probe.ts candidates.ts runner.ts score.probe.ts` → EXIT 0
    - `prettier --check` (same 4 files) → EXIT 0
    - `tsc --noEmit -p .` (includes `tooling/adjudicator-probe`) → EXIT 0
    - `pnpm vitest run tooling/adjudicator-probe` (default config, the unit tests) → 6 files, 62 passed
    - `adjudicationPrompt` body vs `git show HEAD:` → identical (the KEEP outcome)
    - Held-out run integrity: 3 runs × 145 rows, `failedCalls` all 0, `missing` 0 (`wp3-report.json`)
  - [x] verify-self (two runner passes; the first found a BLOCKING missing guard plus a COSMETIC gap, both fixed in place, and the second re-verified them)
    - [x] Split + held-out refusal: `wp3-split.json` seed 20261026, dev 146 (52/94) and held-out 145 (51/94), no overlap, together equal to score-set's 291. `final` refuses without the WIP hash. The frozen-labels sha256 guard (`assertFrozenLabels`, first statement of `split` and `scoreHalf`) was ADDED at verify-self. Evidence: `-t split` → "exists — written once" (the guard passed); after a 1-byte mutation of labels.frozen.json → "hashes to 9ef0aae5… which WP2's WIP does not record — refusing"; after restore, sha da8b00ee…bc10 and `cmp` identical.
    - [x] Scored runs + report: 1,202 rows. The runner independently recomputed v5 held-out as 44/41/42 of 51 and 76/76/74 of 94 (0.830 / 0.801), with all 435 rows `model` on claude-sonnet-5-5. The report now carries `waitsHeldCi95`/`breaksFiredCi95` (ADDED at verify-self); Wilson re-check 76/94 → [0.717, 0.875]; means and verdicts unchanged.
    - [x] KEEP path: `adjudicationPrompt` byte-identical to HEAD (716 chars each); wp2-adjudicator-set.json has no diff; `pnpm vitest run adjudicatorRemeasure` → 4 passed; the backlog item is still open and carries the WP3 measurement.
    - [x] align: held-out bar result, with sample turns. Evidence: held-out, majority of 3 runs. Against the shipped question, v5 newly fires 16 of 94 breaks and holds 5 the shipped one fired. It newly fires 3 of 51 waits and holds 1, firing 9 waits in total. The text of 4 newly-fired breaks and all 3 newly-fired waits is in `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/db55f47a-dbb2-45be-8fd9-c4b35911c772/scratchpad/p3-alignment-evidence.md`.
    - No integration boundary: the phase changes only on-demand probe tooling, and no runtime code changed (KEEP).
  - [x] verify-human (operator said "continue", 2026-10-27)
    - [x] P3.verify-human.1: align. On the held-out sample turns (4 breaks that now fire, 3 waits that now wrongly fire), does v5's judgment match yours? Approved, no relabelling.
    - [x] P3.verify-human.2: decision. Accept the AC-18 KEEP (shipped question stays, backlog item open with the measurement). Approved: option A.
  - [x] verify-codify
    - No integration boundary: the phase changes only on-demand probe tooling, and KEEP leaves runtime code untouched (the shipped prompt stays pinned by `adjudicatorRemeasure`).
    - The guard and retry logic moved out of `wp3.probe.ts` (excluded from the gate) into the pure `tooling/adjudicator-probe/wp3.ts`: `frozenLabelsRefusal`, `scoredKeys`, `WP3Answer`. The probe calls them.
    - New `wp3.test.ts`, 5 tests: the guard passes on the recorded hash and refuses a 1-byte change; `error` rows are retried while model/timeout/unparseable count as done; other hash/half/run are ignored; a retry supersedes the outage in the real `score()` (BREAK 0 → 1 hit).
    - Mutation-proved one at a time, each restored byte-identical (sha ee3dfcbce4ac): `record.includes(sha)` → `true` fails 1 test; `a.basis !== "error"` → `true` fails 2. A first M1 probe was invalid (the perl also deleted a line join, giving "no tests") and was redone.
    - `-t split` after the refactor → "exists — written once" (guard still passes, free).
    - `pnpm verify:auto` → EXIT=0 in 36s; vitest 269 files / 3,622 tests (+5 over P2's 3,617). Log: `tmp/verify-auto-wp3p3.log`.

- [x] Phase 4: The leaked workspace subscription (3.3)
  **Observable outcomes:**
  - CLI (state-changing, dev app-data + scratch workspaces only): from a fresh `pnpm tauri:dev`, open scratch-a then scratch-b (in autopilot), run one turn in scratch-a, and count: `jq -s '[.[] | select(.projectPath|endswith("scratch-a"))] | length'` over the new `supervisor-activity.log` lines equals the count of `outcome=emitted` `Stop` lines for that workspace in `status-channel.log`; no `duplicate-turn-end` record appears. Repeated for the A/B/A order, after a hot reload, and with a third workspace open.
  - Browser (MCP bridge): after a supervisor fire in scratch-a, `workspace-turn-readout` in scratch-a's pane shows `⚙` (and scratch-b's does not).
  - If not reproduced within the half-day timebox: the attempts and their counts are recorded in this WIP and in the backlog entry, which stays open; no code change ships for 3.3.
  **Alignment questions:**
  - none
  - **P4 RESULT (2026-10-27): NOT REPRODUCED, so AC-12 applies and no code change ships.** Env-stripped `pnpm tauri:dev`, driven through the MCP bridge. Turns were real `cc_input` writes (text, then a separate `\r`). Counts are emitted `Stop` lines for ws-1 in `status-channel.log` against ws-1 records in `supervisor-activity.log`:
    | Scenario | Stops : records (ws-1, cumulative) | `duplicate-turn-end` |
    |---|---|---|
    | Fresh launch, scratch-c (A) alone | 1 : 1 | 0 |
    | Open scratch-a (B, minted `ws-3`, the same ids as the 09-28 incident), turn in A | 2 : 2 | 0 |
    | A/B/A (⌘⇧1 back to A), turn in A (+ a turn typed into B) | 3 : 3 | 0 |
    | HMR of `turnEnd.ts` (boundary `Workspace.tsx`), turn in A | 4 : 4 | 0 |
    | HMR of `useTauriListen.ts`: App-level update, ProjectPicker invalidated, **both workspaces REMOUNTED** (PTYs respawned cc-1/2 → cc-3/4), turn in A | 5 : 5 | 0 |
    | Restore both files (another App-level remount → cc-5/6), open scratch-b (`ws-5`, 3 workspaces), turn in A | 6 : 6 | 0 |
    | AUTO-edge fire: A ends on `TRANSITION: F8` → supervisor `fired /feature-verify-auto`; the injected turn ends | 8 : 8 | 0 |
    | Full page reload (`location.reload()`); scratch-c reopened, minting `ws-1` again, turn in A | 1 : 1 (since reload) | 0 |
    - `⚙` check: after the fire, ws-1's pane tags turn 8 with origin `/feature-verify-auto`, and ws-3/ws-5 have none (pane `turnNavState()`). With ws-1 on the centre stage the DOM readout is `⚙ 8/8` with the title "The workflow supervisor started this turn (it ran /feature-verify-auto)". (The readout is gated on `visible`, so a background workspace never shows it. That is by design, not a miss.)
    - Narrowing from the logs, written to the backlog entry: the installed build has **0** `duplicate-turn-end` in 1,267 records. All 9 dev duplicates are in ws-1 (scratch-c) during active-development sessions. On 10-20, ws-1 was the ONLY workspace and EVERY `Stop` doubled from the run's first turn, so a second workspace is not the trigger. The duplicate record is written in the same second as, and before, the real one: two near-simultaneous deliveries, not a replay.
    - Probe hygiene: `turnEnd.ts` and `useTauriListen.ts` were each copied aside with their sha recorded, given a one-line comment to trigger HMR, then copied back. Both shas match and `git status` is clean for both. The dev app (pid 90159) was stopped by its task. Turns were spent in scratch workspaces only.
  - [x] P4.1 Reproduce per the outcomes above; record counts. Not reproduced in 8 scenarios (table above).
  - [x] P4.2 If reproduced: fix at source with a listener-counting test. N/A: not reproduced, so per AC-12 no speculative fix ships and the backlog entry stays open with the narrowed context.
  - [x] verify-auto (no code shipped this phase, so the checks are that nothing was left behind and that the record matches the logs)
    - `git diff --quiet HEAD -- src/useTauriListen.ts src/state/supervisor/turnEnd.ts` → EXIT 0 (HMR probe edits fully reverted)
    - Recount over the whole run from the logs: ws-1 emitted `Stop` 9, records 9 (1 fired + 8 no-verdict) = 8 pre-reload + 1 post-reload, matching the table
    - `duplicate-turn-end` records since the run started → 0
    - Backlog entry `SURFACE-2026-09-28-A-LEAKED-…` still present (count 1); status updated at P5.2
    - `pgrep -f target/debug/claudesk` → none (dev app stopped)
  - [x] verify-self (runner checked the logs independently; the bridge-only check comes from the orchestrator's live capture)
    - [x] Counts: since t0 1793122062000, ws-1 has 9 emitted `Stop` and 9 records (8 no-verdict + 1 fired) with 0 `duplicate-turn-end`. The timeline matches the table: SessionEnd+SessionStart at the App-level remount (285045–285509) and the restore (401555–402025), scratch-b `ws-5` at 409110, then the F8 fire, then ws-1 minted again after the reload at 512916. Substitution, stated: A = scratch-c (where every historical duplicate occurred), B = scratch-a, third = scratch-b. B's typed turn never reached a `Stop`, so B and the third workspace only hold as 0 = 0. Probe files `git diff --quiet HEAD` → 0.
    - [x] `⚙`: the runner's `UNVERIFIED: no harness — the tauri MCP bridge is orchestrator-only` is covered by the ORCHESTRATOR's live capture during P4.1: `[data-testid=workspace-turn-origin]` → ws-1 readout "⚙ 8/8", title "The workflow supervisor started this turn (it ran /feature-verify-auto)". The pane `turnNavState()` gives an origin for ws-1 and null for ws-3 and ws-5. Runner's supporting log fact: one `fired` (ts 1793122429797), adjudicator `claude -p` until 432496, scratch-c `UserPromptSubmit` 432978, so arm-to-claim ≈ ≤657 ms, inside the 2000 ms window.
    - [x] Record: WIP table present. The backlog entry is kept, has the repro paragraph, and its claims hold: prod 0 dups in 1,278 lines, all 9 dev dups ws-1/scratch-c, and on 10-20 only ws-1 with every Stop paired. Date wording corrected per the runner (dups on 09-28 ×3 and 10-20 ×6; 09-25 had pre-dedupe pairs). Phase 4 touched only backlog.md and this WIP.
    - No integration boundary: no code changed.
  - [x] verify-human (operator: "agreed", 2026-10-27)
    - [x] P4.verify-human.1: decision. Stop the repro at ~40 min of the half-day timebox: approved (A).
    - [x] P4.verify-human.2: decision. Backlog priority lowered medium → low: approved (A).
    - Operator remark, recorded as context (the message ended mid-sentence at "so"): "since opus 5.5 and since my mccc project shipped some changes, the issue already happen pretty rarely". Read as: wrongful auto-chain stops are now rare at source. No scope change taken on an unfinished sentence.
  - [x] verify-codify
    - No new tests: Phase 4 shipped no code (AC-12). The behaviour it leaned on, one decision per `Stop` with a second delivery recorded as `duplicate-turn-end`, is already pinned (`activityFunnel.test.tsx`, plus `failureAlarm`/`verifyHumanPause` cover the reason). A listener-counting test was planned only for the fix branch (P4.2), which did not run.
    - No integration boundary: no code changed.
    - `pnpm verify:auto` → EXIT=0 in 40s; vitest 269 files / 3,622 tests (unchanged from P3). Log: `tmp/verify-auto-wp3p4.log`.

- [x] Phase 5: Arch resync + whole-WP gate
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `grep -n "workflow-not-supervised\|withheld-on-model-mismatch\|line start\|claude-sonnet-5-5" workflow-system/product/arch/workflow-supervisor.md` hits §C/§D/§F; `grep -n '"sonnet"' workflow-system/product/arch/workflow-supervisor.md src/state/supervisor/adjudicator.ts` returns no claim that the pin is the alias (historical mentions are marked as such).
  - CLI: `pnpm vitest run archDocEnumeration` (the arch-doc enumeration guard) passes with the new reasons/commands.
  **Alignment questions:**
  - none
  - [x] P5.1 Resync `arch/workflow-supervisor.md` (§C token contract + workflow gate, §D adjudicator R-6 conditions 1 and 3, §F reasons/alarm/model field) and the `arch.md` index pointer if a new ⚠️ is added.
    - §C: new "Only the EXECUTION workflows chain" subsection (`SUPERVISED_WORKFLOWS` allow-list, gate placement, the funnel-guard reason, 34→32/36).
    - §D, Reading the turn: the emitted-token rule (`extractEmittedTransitionId`, why NOT line start: 132/477 vs 7/478, fence and code-span refinements, the mccc ask) and the pinned turn-close fixture.
    - §D, R-6: condition 1 rewritten (full id, envelope, exact-pin check, every non-`model` basis → `adjudicator-failed`, verified against `decideSupervised`); condition 3 gains the WP3 re-measure (KEPT, v5 0.830/0.801 vs 0.869/0.695, the ceiling-is-the-input note, the tooling's guards).
    - §F: the WP3 reasons + `adjudicatorModel`, the failure alarm (threshold, axes, exhaustive map, survives relaunch, no seventh arm; tooltip strings checked against `workspaceSupervisor.ts`), and the dedupe bullet's dev-only repro result.
    - `arch.md` index row widened to name the new ⚠️ items.
  - [x] P5.2 Update the backlog entries' status per outcome (resolution happens at finalize).
    - Fixed, resolve at finalize: `…QUOTED-IN-PROSE` (3.1), `…AUTO-CHAINS-PRODUCT-AND-INCIDENT…` (3.4), `…PIN-IS-AN-ALIAS…` (3.6), quality finding `…TRANSCRIPT-COMPLETION-WAIT-HAS-NO-ALARM…` (3.2).
    - Stay open: `…FAILS-THE-BREAK-AXIS…` (3.5 KEPT), `…A-LEAKED-WORKSPACE-SUBSCRIPTION…` (3.3 not reproduced, low).
  - [x] verify-auto
    - Whole-WP gate: `pnpm verify:auto` → EXIT=0 in 33s (lint, format:check, tsc, check:link "every entry linked cleanly (main, pip)", vitest 269 files / 3,622 tests, cargo fmt, clippy -D warnings, cargo test: 9 `test result: ok` blocks, 0 failed). Log: `tmp/verify-auto-wp3p5.log`.
    - `pnpm vitest run archDocEnumeration` → 1 file, 12 passed.
  - [x] verify-self (two runner passes. The first FACT-CHECKED every new arch claim against code and found 1 BLOCKING false claim plus 5 wording issues, all fixed in place. A FRESH runner re-verified them; it was stopped once by the operator's pause and relaunched on resume.)
    - [x] Whole-WP gate: `tmp/verify-auto-wp3p5.log`: 269 files / 3,622 tests, every `test result: ok … 0 failed`, check:link clean.
    - [x] Greps: `workflow-not-supervised|withheld-on-model-mismatch|line start|claude-sonnet-5-5` hit §C 116, §D 192–249, §F 353. The only `"sonnet"` (doc line 231) is marked historical, and adjudicator.ts has none.
    - [x] `pnpm vitest run archDocEnumeration` → 12 passed (it pins commands and policy arms, not `SupervisorReason`).
    - [x] Fact-check, each confirmed in code:
      - `SUPERVISED_WORKFLOWS` allow-list and its gate order.
      - 31 of 361 product/incident candidates; replay 32/36 with I17/I18.
      - `extractEmittedTransitionId` is single-sourced, and fence handling is as stated.
      - `ADJUDICATOR_MODEL`, the exact-pin check, the 4 bases → `adjudicator-failed`, the Rust argv, 873 × pin.
      - `adjudicatorModel` optional, `v` 1.
      - The alarm's threshold, axes, glyph, colour, strings and 50-record seed.
      - The fixture, test and refresh probe.
      - The wp3 tooling guards, v5 hash `7c3133ebe6f3384a`, held-out 0.830/0.801 against a recomputed 0.869/0.695.
      - The dedupe numbers.
      - The index row and the 6 backlog status lines.
    - [x] BLOCKING, fixed: §D said a code span is a quote only when the token OPENS it, which is the inverse of `opensClause`. It now reads "a quote only when it holds other text before the token; a span the token opens is emitted". Re-verified by running the real module (`node --experimental-strip-types`): "`TRANSITION: F8` — build" → F8; "Reply with `exactly: TRANSITION: T2`" → null; a fenced lone token → F8.
    - [x] Cosmetic, fixed and re-verified:
      - the `withheld-on-error` and `withheld-on-unparseable` parentheticals are completed;
      - error rows are now "retried and superseded; a residual one would still score AWAITING; held-out runs had none";
      - the alarm fold is keyed by `projectPath`;
      - 1,267 → 1,278 with a snapshot date, in both the arch doc and the backlog;
      - stale comments fixed: Workspace.tsx `SEED_RECORDS` → the literal 50, and the tokenSplit.probe.ts "line-start rule" → the emitted-token rule.
      `tsc --noEmit` → 0 and Prettier is clean.
    - No integration boundary: docs and comments only.
  - [x] verify-human (zero admissible leaves: no alignment questions, no open decisions, every finding fixed and re-verified. The feature-level floor (5a) is met because Phases 1–4 each had operator leaves. AUTO-SKIP per drive_mode=autopilot.)
  - [x] verify-codify
    - No new tests: the phase changed docs and comments only. Every WP3 behaviour was codified in its own phase (P1 funnel + token tests, P2 envelope/alarm/format tests, P3 `wp3.test.ts`; P4 shipped no code).
    - Considered and NOT added: a guard that `arch/workflow-supervisor.md` names every `SupervisorReason`. The doc never claims to enumerate them, and the two it omits (`policy-not-auto`, `not-dispatchable`) predate WP3, so that would be a new doc contract, not codification of this phase.
    - No integration boundary: docs and comments only.
    - `pnpm verify:auto` → EXIT=0 in 35s; 269 files / 3,622 tests; cargo 9 `ok` blocks, 0 FAILED. Log: `tmp/verify-codify-wp3p5.log`.

## Ship
- Feature commit `565a363` (2026-10-27): code, tests, probe tooling, arch resync, backlog statuses, WBS 5.7, runtimes, and the mccc canonical-token outbox copy. Not pushed (`main` runs ahead of `origin` by design; releases go through `/release`).
- Left out on purpose: the three WP2 outbox edits (`HANDOFF-to-mccc-{2026-09-23-paydown,m15-wp2,m15-wp4}.md`, standing operator instruction).
- Final gate: `pnpm verify:auto` → EXIT=0 (35s, 3,622 tests) at P5 verify-codify, with no code change since.

## Current Node
- **Path:** Feature > done (archived)
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** SURFACE-2026-10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD (low, unrelated; in backlog)

## Code-Quality Review — m16-5-wp3-supervisor-correctness

*(feature-review-quality, ship commit `3e92860`, feature `565a363`, 2026-10-27; drive_mode=autopilot → all findings auto-backlogged, F39.)*

### Strengths
- `failureAlarm.ts` classifies every reason through an exhaustive `Record<SupervisorReason, AxisEffects>`, so a new reason cannot compile unclassified. The count/clear/neutral effects per axis encode "only turns that reached this axis count".
- `SUPERVISED_WORKFLOWS` is an allow-list keyed on `resolved.edge.workflow`, read from `resolvePolicy`'s own result, so `verdict.ts` does not become a second graph-to-policy wiring and the funnel guard stays meaningful.
- The token rule was chosen by corpus replay; the refuted alternatives are recorded with numbers, and every must-not-fire case is paired with a must-fire control through the real `readTurn` and `useSupervisor`.
- `transcriptFormat.test.ts` isolates each completion signal (an OR-predicate trap), with the `end_turn` equivalent mutant named.
- `adjudicator-failed` keys the alarm on the reason, not detail text, and the alarm lives in the gated readout, so the OFF-invariant pin stays at 6 arms / 9 subjects.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`src/state/supervisor/activityFeed.ts:22`] The failure alarm counts per `projectPath`, but both failures it watches are machine-wide, so a broken adjudicator can stay silent per badge far longer than three failures. → `SURFACE-2026-10-27-QUALITY-WP3-FAILURE-ALARM-COUNTS-PER-PROJECT-FOR-MACHINE-WIDE-FAILURES` (medium)

**MINOR**
- [`transitionToken.ts:43-60`] The docstring's clause-boundary list omits `,`, `(` and `[.!?])`. → `…-CLAUSE-BOUNDARY-DOCSTRING-OMITS-COMMA-AND-PAREN`
- [`tooling/adjudicator-probe/runner.ts`] A "production-shaped" runner without production's exact-pin model check. → `…-PROBE-RUNNER-SKIPS-THE-PRODUCTION-MODEL-CHECK`
- [`activityFeed.ts:36`] Dedupe by timestamp, plus a redundant condition. → `…-ACTIVITY-FEED-DEDUPES-BY-TIMESTAMP`
- [`Workspace.tsx:262-270`] The async seed can be dropped by an earlier live publish, so the alarm silently resets. → `…-ALARM-SEED-RACES-A-LIVE-PUBLISH`
- [`workspaceSupervisor.ts:171`] The adjudicator alarm tooltip omits unparseable replies. → `…-ADJUDICATOR-ALARM-TOOLTIP-OMITS-UNPARSEABLE`
- [`verdict.ts:95`] An overlong JSDoc line. → `…-OVERLONG-JSDOC-LINE-IN-VERDICT`

### Assessment
A well-executed change that leaves the supervisor better. Each fix is a small, pure change at an existing chokepoint, and the tests drive the real components through the real funnel with positive controls. The token rule is a heuristic, but it is measured and fails toward withholding. Follow up on two things: the alarm is keyed per project while its failures are machine-wide, and the scoring runner does not enforce the model check production now does. Neither is a correctness bug in what shipped.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` in this section before `/feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:**
  - The WBS's "line start" token rule was wrong for today's corpus. Emitted verdicts now usually END a sentence, so line start would have withheld 132 of 477 real verdicts. A corpus replay found a rule that withholds 7 and gains 0.
  - The adjudicator's break-axis failure is a property of its INPUT, not its wording. Across five candidates, each break gained cost about one wait, because "ready for your review" before verify-human (a break) and the verify-human checklist turn (a wait) read alike in the last 400 characters.
  - The leaked subscription is dev-build-only on the evidence (0 in 1,278 installed-build records), and a second workspace is not its trigger.
- **Assumptions that held:**
  - A held-out split chosen before any score kept 3.5 honest: v5 dropped from 0.904 to 0.830 waits on held-out.
  - Execution-only chaining was a small, pure change at the existing chokepoint.
  - Both 3.3 and 3.5 had their "no" outcome written into the spec (AC-12, AC-18), so neither result needed a back-loop.
- **Assumptions that were wrong:**
  - The handoff read the v4 run as a prompt problem. It was a usage-limit outage (zero tokens, `duration_api_ms: 0`), and it had also silently contaminated 37 of v3's rows, which the scorer counted as AWAITING. A failed call that scores as a real answer is a measurement defect, so the scorer now retries `error` rows.
  - The P5.1 arch resync inverted the code-span rule. It was caught only by a fresh fact-checking runner, not by any gate (`archDocEnumeration` does not read prose).
- **Approach delta:**
  - 3.1 shipped the clause rule rather than line start (operator decision at Phase 1).
  - 3.2 also counts adjudicator failures, and survives a relaunch (operator).
  - 3.5 ended as KEEP; 3.3 ended as not-reproduced.
  - Phase 3 grew a frozen-labels guard and CI fields at verify-self.
  - A review MAJOR (the alarm keyed per project for machine-wide failures) went to WP8.

## Closure
> **Feature complete:** M16.5 WP3 (supervisor correctness) has shipped. The workflow supervisor now chains only the feature/task/session workflows, fires only on a TRANSITION token the turn actually emits (not one it quotes), pins its adjudicator to a full model id it verifies on every call, and raises a red `!` on the supervised badge after three straight transcript or adjudicator failures. The adjudicator question was re-measured and kept, and the duplicate-turn-end leak was not reproduced (dev-only). See `arch/workflow-supervisor.md` §C/§D/§F.

Requester = operator — closure notice for self-record.

## Discoveries
[SURFACED-2026-10-26] Phase 2 — mediaTabLive.test.tsx flaked once under full-suite load (unrelated); logged as SURFACE-2026-10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD.
[SURFACED-2026-10-26] feature-spec — wbs.md exceeds size guard (444 lines). The WP3 section and the dependency map were read in full, because the spec is scoped to them.
[SURFACED-2026-10-27] Phase 3 verify-auto — `score.probe.ts`'s WP2 `set` step reads `wip/m16-5-wp2-adjudicator-remeasure.md`, which has been archived, so the step now refuses before writing (true at HEAD; `score-set.json` is unaffected). Only matters if WP2's set is ever rebuilt. Not backlogged.
[SHORTCUT-2026-10-27] P3.1/P3.2 — the verify-self runner found the split step had no frozen-labels sha256 check (BLOCKING, as the outcome named it) and the report had no Wilson intervals (COSMETIC). Fixed by extending P3.1/P3.2's wp3.probe.ts: `assertFrozenLabels()` checks against the archived WP2 WIP and runs first in split/scoreHalf, and the report emits ci95. Re-verified by a FRESH runner, including a 1-byte mutation negative control.
[SURFACED-2026-10-27] Phase 4 — in the DEV build, an App-level HMR update (editing `useTauriListen.ts`, or anything that invalidates `ProjectPicker` up to `App`) REMOUNTS every workspace and RESPAWNS its CC session (cc-1/2 → cc-3/4). Dev-only (no HMR in the installed build) and not part of 3.3. Recorded so a verifier is not surprised when a live turn's PTY id goes stale mid-check. Not backlogged.
[SHORTCUT-2026-10-27] P5.1 — the fact-checking runner found §D's code-span sentence inverted (BLOCKING: a false as-built claim) plus 5 wording issues (two parentheticals, the error-row sentence, the alarm's key, the 1,267/1,278 disagreement) and 2 stale comments (Workspace.tsx `SEED_RECORDS`, tokenSplit.probe.ts "line-start rule"). All are text written in this WP; corrected in place. A FRESH runner re-verified all 7, running the real token function in both directions.
