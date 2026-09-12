# Feature: M15 WP1 — Probe: does the mechanical auto-chain rule decide real stops?

**Workflow:** feature
**State:** verify-codify (ALL PHASES COMPLETE) — ready for ship
**Created:** 2026-09-07
**Cycle:** milestone-15-workflow-supervisor
**WBS ref:** `workflow-system/product/wbs.md` → WP1
**Type:** probe (output is KNOWLEDGE, not shipped code)
**Timebox:** 1 session — hard stop. A second session means the answer is "the rule does not decide it cheaply", which is itself a reportable outcome.

## Problem Statement

M15 proposes that Claudesk enforce the drive mode's auto-chaining policy **mechanically** — detecting when a CC turn ended where the pause policy said AUTO, and firing the next command itself. The milestone was triggered by a measured 10x regression in auto-chain adherence (0.36 → 3.63 breaks per 100 `Skill` invocations). Before any of WP2–WP5 is built, six questions must be answered, because **four of them change what the downstream WPs *are*** — Q1 the detector's shape, Q2 whether WP3 may fire silently at all, Q3 whether the typed graph couples to skill frontmatter, Q6 whether WP4 has a computable threshold. The load-bearing prior finding is that wrongful stops are **textually indistinguishable** from legitimate pauses (they emit the correct token and often name the correct next skill), so a prose-reading adjudicator would pass all of them; only a mechanical check (transition token + policy row + was-there-a-`Skill`-call) can decide. This probe tests whether that mechanical check actually works on real data, or whether the milestone needs reshaping.

**No 3rd-party dependency.** The corpus is local JSONL under `~/.claude/projects/<slug>/`; the only external process is a headless `claude -p` (WP3's residual adjudicator), which this probe does **not** exercise. §3 probe-check: N/A.

**Pre-plan measurements taken this session** (so phases are sized against facts):

| # | Finding | Consequence |
|---|---|---|
| A-1 | **239** transcripts under this project's slug; **1016** machine-wide | M-2 holds. Corpus reachable; no data-collection work needed. |
| A-2 | ⚠️ **~half of all `TRANSITION:` occurrences sit on `user` lines** (559 user / 555 assistant in a 40-file sample) — skill bodies + tool results echoing the transitions table | ⚠️ **NEW HAZARD, not in the WBS.** A file-level grep reads **documentation as verdicts**. The parse MUST be scoped to the *last assistant text block*. This is a real trap the throwaway detector must not fall into. |
| A-3 | Correctly-scoped parse yields **2,281 emitted verdicts** across **150** files | ✅ **Reproduces M-3's 2,281 turn count exactly** — cross-validates this parse against the WBS's independent earlier measurement. |
| A-4 | **2,708** `Skill` tool_use calls, with skill name in `input.skill` | ✅ Q5's idempotency signal is present and machine-readable. |
| A-5 | Full `usage` triple present on **79,633** assistant lines | ✅ Q6's input confirmed (M-4). |
| A-6 | Models seen: `claude-opus-4-8` (48114), `claude-opus-5` (30235), `claude-opus-4-7` (793), `claude-fable-5` (457), `<synthetic>` (34) | Confirms M-5's premise that the model string spans several values incl. `<synthetic>`. R-2 already removes the need for a window map. |
| A-7 | ⚠️ **Every one of the 2,281 verdict messages ends in a `text` block — never a `tool_use`** | The turn-end shape is uniform, so "what is the last block" is NOT the Q2 discriminator. |
| A-8 | Only **19 of 2,281** verdict messages end in a literal `?` | ✅ **Q2 is genuinely investigable.** A trailing-`?` test is cheap and highly selective — but naive-predicate risk applies (the same trap as M-3's 15x over-flag), so it must be validated against labels, not assumed. |
| A-9 | `AskUserQuestion` appears **380** times as a tool call | A second candidate Q2 signal the WBS did not anticipate — a *structural* question marker rather than a textual one. |

**Rulings this plan obeys without re-litigating** (`wbs.md` → Operator rulings): **R-1** stored mode is the authority, Mode 0 not honored as a suppressor (Q4 = opportunity, not gate) · **R-2** threshold is an absolute token count, no window map (Q6 = value only) · **R-3** rebuild the fixture fresh; the historical 19 / 46+5 are context, not the acceptance criterion · **R-4** verdict lives in TypeScript, Rust does file IO only.

## Work Tree

- [x] Phase 1: Corpus reader + fresh labelled fixture (Q1's prerequisite)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `python3 tmp/scratch/m15-probe/mine.py --stats` exits 0 and prints a verdict count; the count is reproducible across two consecutive runs (identical stdout).
  - CLI: the reader's parse is **assistant-scoped** — a deliberate control run with `--scope=file` (naive grep) prints a *different, larger* hit count than the default `--scope=assistant`, proving A-2's hazard is actually being avoided rather than assumed.
  - CLI: `python3 tmp/scratch/m15-probe/mine.py --emit-fixture` writes a JSON fixture where every record carries `{session_file, turn_index, edge_id, next_skill_called, expected_verdict, label_basis}`; `jq 'length'` ≥ 200 and `jq '[.[]|select(.expected_verdict==null)]|length'` == 0 (no unlabelled records).
  - CLI: label provenance is auditable — `jq -r '.[].label_basis' fixture.json | sort -u` prints only values naming a **policy row**, never a value naming prose/tone (per R-3: label from the policy row, NOT from how the turn reads).
  - [x] P1.1 Build the throwaway corpus reader in `tmp/scratch/m15-probe/` (gitignored scratch; NOT `src/`) — last-assistant-text-block scoped, with a `--scope` flag retained solely as the A-2 control  <!-- status: done -->
  - [x] P1.2 Extract per-turn records: emitted edge id, whether a `Skill` call followed, which skill, `usage` triple, trailing-text shape  <!-- status: done -->
  - [x] P1.3 Build the edge→policy-row lookup **for the probe only** (throwaway; M-8 says 19 of 27 feature rows key on a step name, only 8 on an `F<n>` id, so this mapping is derivation work — WP2 owns the real one)  <!-- status: done -->
  - [x] P1.4 Label each record from the policy row; persist as a checked-in regression fixture (the durable asset per R-3 — "only a standing test is coverage")  <!-- status: done -->
  - [x] P1.5 Report the fresh population against the historical 19 / 46+5 as **context**, stating plainly where they diverge without treating divergence as failure (task 1.1b)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 6 scoped checks, all PASS -->
  - [x] verify-self  <!-- status: done — subagent: 4/4 PASS, no BLOCKING, no COSMETIC -->
  - [x] verify-human  <!-- status: done — operator: "all pass" (2026-09-11), all 3 leaves accepted -->
    - [x] P1.verify-human.1 Accept the FIXTURE COUNT divergence (96 rule-flagged / 36 ground-truth vs the historical 19)  <!-- status: done — 96/36 IS the acceptance baseline for Phase 2 -->
    - [x] P1.verify-human.2 Accept the ground-truth "operator prod" label signal as legitimate  <!-- status: done — prod-as-ground-truth accepted; informational prods correctly excluded -->
    - [x] P1.verify-human.3 Accept the throwaway edge->policy lookup as adequate for Q1  <!-- status: done — hand-transcription accepted for the probe; WP2 owns the real typed graph -->
  - [x] verify-codify  <!-- status: done — 16 fixture-contract tests, all 4 properties mutation-proven individually; gate exit 0, frontend 2282 / Rust 866 -->

- [x] Phase 2: Candidate detector + Q1/Q5 measurement  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `python3 tmp/scratch/m15-probe/detect.py --fixture fixture.json` exits 0 and prints precision, recall, and a per-edge-id breakdown.
  - CLI: the **naive baseline is reproduced as a control** — running with `--naive` prints a flagged count in the ~289/2,281 range (M-3), and the discriminating predicate prints a materially lower false-positive count. Both numbers appear in one run so the improvement is attributable.
  - CLI: every fixture record labelled a legitimate PAUSE for `F10`/`F13`/`F19` is **not** flagged (`jq` over the output shows zero such flags), since those are the known over-flag sources.
  - CLI: the idempotency check is demonstrated — a record where a `Skill` call **did** follow the AUTO verdict is reported as "already chained, no fire owed" (Q5), and the count of such records is printed.
  - [x] P2.1 Implement the discriminating predicate: emitted edge → policy row → AUTO? → did a `Skill` call follow?  <!-- status: done -->
  - [x] P2.2 Run against the fixture; record precision/recall per edge id (task 1.2)  <!-- status: done -->
  - [x] P2.3 Q5 — determine and measure the idempotency signal (did a `Skill` call already land for this edge?) (task 1.5)  <!-- status: done -->
  - [x] P2.4 Characterize the residual: turns the mechanical rule **cannot** decide (no token / ambiguous row) — this sizes WP3's demoted `claude -p` adjudicator  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 4 scoped checks + a corrected positive control, all PASS -->
  - [x] verify-self  <!-- status: done — subagent 4/4 PASS, no BLOCKING/COSMETIC -->
  - [x] verify-human  <!-- status: done — operator ruling R-5 taken 2026-09-11; 1+3 accepted, 2 withdrawn -->
    - [x] P2.verify-human.1 Accept that Q2's discriminator is an INSTRUCTION-TO-REPLY, not a question-shaped tail (refutes the WBS framing)  <!-- status: done — accepted as a FINDING; superseded as a MECHANISM by R-5 -->
    - [x] P2.verify-human.2 The "say the word" OFFER-FORM exemption  <!-- status: WITHDRAWN by R-5 — it was a hand-tuned regex carve-out over 4 records; the adjudicator now judges this class -->
    - [x] P2.verify-human.3 Accept that a blunt edge-class exclusion is rejected (costs 21% of true breaks)  <!-- status: done — edge class is now a ROUTING key, not a suppression rule -->
  - [x] verify-codify  <!-- status: done — 9 new measurement tests (25 total), 4 mutants caught individually; 2 unrelated Rust trash tests triaged as environmental -->

- [x] Phase 3: Q2 — the HYBRID under R-5: mechanical rule + `claude -p` on the routed population (⚠️ THE ONE LIVE GATE)  <!-- status: done. ⚠️ RETITLED: R-5 supersedes "question-shaped tail detection" — the tail-shape framing was measured near-useless (2% vs 10%) and a regex here IS the prose-reading adjudicator this milestone rejects. -->
  **Observable outcomes:**
  - CLI (⚠️ **REWRITTEN 2026-09-11 under R-5** — the original named `qtail.py` and a regex signal comparison; R-5 superseded that mechanism *after* this plan was written, so verifying the original text would verify a plan the operator overrode): `Q2_ROUTE_ALL=1 python3 tmp/scratch/m15-probe/adjudicate.py` exits 0 and reports, **restricted to the 96 FIRE set** (⚠️ NOT corpus-wide), the adjudicator's wrong-fire recall and real-breaks-preserved rate against operator-behavior ground truth, with TP/FP/FN/TN counts. Re-scorable from the saved `q2_all.json` / `q2_sonnet.json` without re-spending the 192 `claude -p` calls.
  - CLI: the report states a decision in machine-checkable form — stdout contains exactly one line matching `^Q2_VERDICT: (SEPARABLE|NOT_SEPARABLE)\b` followed by the rate that justifies it.
  - CLI: **both adjudicator arms are reported so the verdict's model-conditionality is visible** — `haiku` and `sonnet` each scored over the same 96 records, each rate shown with its fraction (e.g. `0.862 (25/29)`) so a reader can check rather than trust it. ⚠️ Replaces the original hand-audit-of-question-shaped-tails outcome, which R-5 made moot: the tail-shape framing was measured near-useless (2% vs 10%) and is no longer the mechanism.
  - [x] P3.1 Implement each candidate signal separately (never a composite — a composite that "works" hides which signal carried it)  <!-- status: done -->
  - [x] P3.2 Measure each signal's FP/FN against the Phase 1 labels (task 1.3)  <!-- status: done -->
  - [x] P3.3 Hand-audit the AUTO ∩ question-shaped intersection; classify each case  <!-- status: done -->
  - [x] P3.4 ⚠️ Emit the explicit gate verdict for WP3's fire policy. **If NOT_SEPARABLE, the recommendation is RESHAPE, not GO** — the roadmap's own instruction is to revisit the fire policy before building WP3, not to build it anyway. `injectCommand` has no retry and no pre-send cancel window, so a wrong silent fire on an unwatched workspace is unrecoverable except via CC's Esc.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 3 scoped checks PASS; caught a transcription slip in the reported figure -->
  - [x] verify-self  <!-- status: done — subagent 4/4 PASS; surfaced the thin-margin caveat below -->
  - [x] verify-human  <!-- status: done — operator ruling R-6 taken 2026-09-11: GO-WITH-CONDITIONS -->
    - [x] P3.verify-human.1 ⚠️ THE GATE  <!-- status: done — operator: GO-WITH-CONDITIONS -->
    - [x] P3.verify-human.2 The 0.80/0.80 threshold  <!-- status: done — accepted as-is -->
    - [x] P3.verify-human.3 Pin `sonnet` as the adjudicator model  <!-- status: done — accepted; model change = behavioral change -->
  - [x] verify-codify  <!-- status: done — 8 new Q2 tests (33 total), 5 mutants caught individually; Q2 results persisted as a tracked artifact -->

- [x] Phase 4: Q3 frontmatter inertness · Q4 Mode-0 opportunity · Q6 threshold value  <!-- status: done -->
  **Observable outcomes:**
  - CLI (Q3) ⚠️ **STRENGTHENED 2026-09-12**: a **dereferenced** (`cp -RL`) scratch copy of a skill dir gains a throwaway frontmatter key; `python3 tmp/scratch/m15-probe/q3_inertness.py` exits 0 and reports `Q3a_VERDICT: INERT` across six checks — key readable · every pre-existing key **identical in value** · body **byte-identical** · `name`/`description` intact · removal **restores the file exactly** · sandbox left as found. ⚠️ The real `~/.claude/skills/` tree is **not** mutated — verified by capturing `git status --porcelain` on the **mccc source repo** BEFORE and AFTER and diffing (every installed skill is a symlink into it, so a plain `cp -R` + write would dirty a different repo).
  - CLI (Q3): the report states whether a skill enumerator + YAML frontmatter parser is worth adding **at all**, explicitly noting that adding one reverses a recorded §4c anti-brittleness decision — i.e. answered as a *product* question, not only a compatibility check.
  - CLI (Q4) ⚠️ **RETARGETED 2026-09-12** (no separate `mode0.py` was built — the measurement is a direct corpus scan, reported inline): over the corpus, how many skill-using sessions carry a **real** `/session-start` marker vs. chain ≥2 skills. ⚠️ A marker counts only from a **real user prose turn**, never any line containing the string — a substring scan over-reports by ~68x (see the A-2 recurrence in Discoveries). Null result reported as `Q4_VERDICT: NO_DISCRIMINATOR`; blocks nothing (R-1).
  - CLI (Q6) ⚠️ **AMENDED 2026-09-12 — a real plan change, not a rename**: `python3 tmp/scratch/m15-probe/q6_threshold.py` exits 0 and prints a recommended **absolute token count** with the distribution that justifies it (per-session peak used-tokens from each assistant line's `input + cache_read + cache_creation`, never summed) **and no model→window mapping** (R-2 holds). ⚠️ **The original clause "output contains no percentage" is DROPPED.** Its intent was to bar a *percentage-of-context-window threshold* — the thing M-5 refuted and R-2 replaced. But the recommendation must be judgeable, and a bare token count is not: the report therefore expresses the value as a **firing rate** ("fires on ~38% of sessions, an upper bound"). Those percentages are **rates over sessions**, never a fraction of a context window, so R-2 is honored in substance while the literal no-percentage wording is not.
  - [x] P4.1 Q3 — frontmatter inertness on a scratch skill copy; prove inert to the harness AND to the skill's own parse (task 1.6)  <!-- status: done -->
  - [x] P4.2 Q3 — answer the product half: is an enumerator worth adding, given it reverses the §4c decision?  <!-- status: done -->
  - [x] P4.3 Q4 — search for a cheap Mode-0 discriminator; null result is acceptable and reported as such (task 1.4)  <!-- status: done -->
  - [x] P4.4 Q6 — recommend the absolute token threshold from corpus evidence, last-line-only (task 1.7)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 6 scoped checks incl. a working positive control and a source-repo safety diff, all PASS -->
  - [x] verify-self  <!-- status: done — subagent 5/5 PASS (4 outcomes + the safety constraint), no BLOCKING/COSMETIC -->
  - [x] verify-human  <!-- status: done — operator "all pass" (2026-09-12); recorded as R-7 -->
    - [x] P4.verify-human.1 ⚠️ Q3b PRODUCT DECISION: do NOT build the skill enumerator + frontmatter parser  <!-- status: done — accepted; WP2 does NOT couple to skill frontmatter -->
    - [x] P4.verify-human.2 Accept 400,000 tokens as a STARTING VALUE to tune in WP4  <!-- status: done — accepted as tunable, not a derived constant -->
    - [x] P4.verify-human.3 Accept NO_DISCRIMINATOR as Q4's final answer  <!-- status: done — accepted; no further search -->
  - [x] verify-codify  <!-- status: done — NO new tests, deliberately; reasoning recorded below. Full gate re-run green. -->

- [x] Phase 5: Probe report + per-WP GO/NO-GO/RESHAPE  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-probe-report.md` exists; `grep -c '^## Q[1-6]'` == 6 (every question answered in its own section).
  - CLI: `grep -E '^\*\*(WP2|WP3|WP4|WP5)\*\*: (GO|NO-GO|RESHAPE)'` returns exactly 4 lines — one explicit recommendation per downstream WP, no hedging.
  - CLI: each Q section names the evidence that decided it — `grep -A5 '^## Q' | grep -c 'Evidence:'` == 6. ⚠️ A question answered without evidence is a **failed** probe per the WBS success criterion ("a probe that answers 4 of 6 and says so is a success; one that guesses at the other 2 is a failure"), so any unanswered question must be recorded as UNANSWERED, not guessed.
  - CLI: the fixture is checked in and referenced by path from the report; `test -f` on that path exits 0.
  - [x] P5.1 Write the probe report, one section per question, each with its deciding evidence (task 1.8)  <!-- status: done -->
  - [x] P5.2 Per-WP GO/NO-GO/RESHAPE, with Q2's verdict driving WP3's recommendation explicitly  <!-- status: done -->
  - [x] P5.3 Record any question that could not be answered as UNANSWERED with why (honest partial > guessed complete)  <!-- status: done -->
  - [x] P5.4 Surface findings that correct upstream docs, for WP5's resync (do NOT edit `roadmap.md`/`arch.md` now — that is the milestone's exit step)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 3 scoped checks PASS: shape (4/4), all artifact paths resolve, 4 tables well-formed -->
  - [x] verify-self  <!-- status: done — subagent 14 PASS / 1 correctly-UNVERIFIED / 0 FAIL; every report number recomputed from the fixtures and matched -->
  - [x] verify-human  <!-- status: done — operator "all pass" (2026-09-12); WP1's deliverable ACCEPTED -->
    - [x] P5.verify-human.1 Accept the probe report as WP1's deliverable  <!-- status: done — all six questions answered on evidence, accepted -->
    - [x] P5.verify-human.2 Accept the four per-WP recommendations  <!-- status: done — WP2 GO / WP3 GO-WITH-CONDITIONS / WP4 GO / WP5 GO accepted -->
  - [x] verify-codify  <!-- status: done — NO new tests (all 13 report figures already asserted by the existing 33); gate green -->

## Current Node
- **Path:** Feature > COMPLETE — all 5 phases, all leaves [x]
- **Active scope:** none — WP1 COMPLETE. Next: /feature-ship
- **Blocked:** none
- **Unvisited:** none — Phase 5 is the last
- **Open discoveries:** 4 — A-2 (logged to backlog), plus three found while building (below)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-09-07] Phase 1 / WP3 task 3.3 — ⚠️ **~Half of all `TRANSITION:` occurrences in a transcript sit on `user` lines**, not assistant lines (559 user / 555 assistant in a 40-file sample): skill bodies and tool results echo the full transitions table into the conversation. A file-level grep therefore reads **documentation as emitted verdicts**. The parse must be scoped to the **last assistant text block**. This hazard is not recorded in `wbs.md` and bears directly on WP3's real transcript reader, not just this probe's throwaway one.

## Notes on scope discipline

- **Throwaway, not shippable.** All probe code lives in `tmp/scratch/m15-probe/` (gitignored). WP3 owns the real detector. The **only** durable artifacts are the labelled fixture and the probe report.
- **Phase 4 is independent of Phases 2–3** (it depends on Phase 1's reader only) — it is sequenced after Phase 3 so the live gate is answered first, while the timebox is intact. If the timebox runs short, Phase 4's questions are the safe ones to report UNANSWERED, because none of them gates a downstream WP: Q3 informs WP2's coupling, Q4 is an opportunity (R-1), Q6's *form* is settled (R-2) and only its value is open.
- **No `verify-human` shortcut for Phase 3.** Q2's verdict decides whether a wrong silent fire is unrecoverable in production; that judgment is the operator's, and the hand-audit exists so it is made on read cases.

- [SURFACED-2026-09-07] Phase 1 / WP2 task 2.4 — ⚠️ **A policy cell that reads AUTO does NOT imply there is anything to fire.** Labelling on the mode cell alone marked **223** breaks; the great majority were **terminal / SURFACE / meta-op edges** (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`) whose *from-state* row says AUTO but whose **target is not a dispatchable skill**. The cell answers *"may the orchestrator chain without pausing"*, **not** *"is there a next skill"*. WP2's typed graph therefore needs a **`dispatchable_target: bool`** (or equivalent) per edge, separate from the 5-value policy cell — otherwise WP3 fires into terminal states. Fixing this took 223 → 127.

- [SURFACED-2026-09-07] Phase 1 / WP3 task 3.4 — ⚠️ **The "did a `Skill` call follow?" window must NOT close on an intervening tool call or a re-quoted `TRANSITION:` token.** The agent routinely runs `Bash`/`Read` calls and narrates (often re-quoting the token) between emitting a verdict and invoking the next skill. An early-closing window manufactured false breaks — proven case: session `06eb0e92` turn 504 emitted `F10` and **did** chain correctly at line 511, two `Bash` calls later, yet was labelled FIRE. **Only a real user *prose* turn ends the window** (tool results arrive as role=`user` and must be skipped). Fixing this took 127 → 96.

- [SURFACED-2026-09-07] Phase 1 / WP1 Q1 + WP3 — ✅ **A GROUND-TRUTH break signal exists that the WBS did not anticipate: the operator prod.** When the agent wrongly stops on an AUTO edge, the operator types a short content-free nudge (`"so?"`, `"next"`, `"proceed"`, `"continue. stop returning control to me when you should just auto chain!"`, `"next. autopilot it! why returning control?"`). That is **structural** evidence of a wrongful stop — independent of reading the turn's prose, which the milestone's load-bearing finding says is impossible. **36 of 96** FIRE cases are corroborated this way. ⚠️ **A prod that carries *information* (verify-human results like `"all pass"`, or a new request) is NOT a nudge** — the stop had a purpose. This gives Q1 a real precision denominator instead of a self-referential one, and is a candidate labelling aid for WP1's fixture maintenance.

- [SURFACED-2026-09-07] Phase 1 / fixture reproducibility — ⚠️ **The corpus is LIVE and contains the probe's own session transcript.** Every `TRANSITION:` verdict the probe session itself emits becomes a new corpus record, so the scanned total drifts upward *while the probe runs* (observed **2282 → 2284 → 2286** within this one session; the verify-self subagent independently measured 2286 minutes after the fixture froze at 2284). **This is not a defect** — counts are byte-identical *within* a run (verified) but not *across* time. Recorded in the durable fixture as `_meta.frozen_at` + `_meta.live_corpus_caveat`. ⚠️ **WP3 inherits this**: a supervisor reading the transcript of the session it is supervising sees its own writes, so any "have I already fired for this turn?" check must key on the **turn**, not on a corpus-wide count.

- [SURFACED-2026-09-07] Phase 3 / Q2 — ✅ **A-9 (`AskUserQuestion` as the Q2 signal) is REFUTED, cheaply.** `AskUserQuestion` and a `TRANSITION:` verdict **never co-occur**: **0** overlap across 2,286 verdict turns and 380 question calls — they are structurally disjoint. In hindsight this is expected: `AskUserQuestion` **is** the harness's explicit pause, so such a turn never presented an AUTO decision. The dangerous Q2 case is the opposite — plain prose that happens to be a question, carrying no structural marker. **Q2 therefore narrows to the textual signal only** (A-8's trailing `?`, 19 of 2,286), and Phase 3 should not spend effort on the structural candidate. ⚠️ Also: the explicit-ask **phrase set** fires on 77 turns but hand-reading 12 samples found mostly false positives — non-dispatchable edges (`"Should I save this?"` on a terminal `S20`) and incidental courtesies (`"say so"`, `"let me know"`).

- [SURFACED-2026-09-07] Phase 3 / Q2 — ⚠️ **PLAN CORRECTION (scoping error in this WIP's own Phase 3 outcome).** Q2's FP/FN must be measured over the **96 FIRE cases**, not corpus-wide. Q2 asks *"of the turns we would silently fire on, how many are actually awaiting an answer?"* — turns the supervisor never touches are out of scope. Measuring corpus-wide would inflate the apparent rate with irrelevant turns, which is **the same category error** as judging the naive detector against all 2,281 turns (M-3's 15x lesson). Phase 3's observable outcome has been amended accordingly.

- [SURFACED-2026-09-07] Phase 4 / Q6 — ✅ **Threshold distribution measured, and it vindicates R-2.** Per-session peak used-tokens (last assistant line's triple, never summed) over 211 sessions: min **46,301** · p50 **337,030** · p75 **465,228** · p90 **626,024** · p95 **670,620** · max **833,567**. An **18x spread**, so a *percentage* threshold would need the window value M-5 proved is not derivable from `message.model`; as an absolute count it is one arithmetic op on data proven present. Firing rates: ≥250k → 71.1% of sessions · ≥300k → 58.3% · ≥400k → 37.4%. ⚠️ **Do not pick the median** (recycling on half of all sessions, most of which completed fine). Phase 4 should express the recommendation as a **firing rate**, not a bare number, so the operator can judge it directly.

- [SURFACED-2026-09-11] Phase 2 / Q1 — ⚠️ **THE HEADLINE PRECISION/RECALL IS CIRCULAR AND MUST NOT BE REPORTED AS Q1's ANSWER.** `detect.py`'s discriminating predicate and `mine.py`'s `label()` both call the **same `lookup()`** with the same branch order on the same inputs, so the resulting **1.000 / 1.000** is arithmetic identity — it would report perfect **even if `policy.py` were entirely wrong**. Caught by treating a perfect score as a symptom rather than a success. ⚠️ **WP3 inherits the trap**: any detector scored against a fixture its own policy table produced is measuring itself. The fix used here — score against the **operator-prod** signal, which is derived from *operator behavior*, not the policy table — is the only non-circular measurement available in this corpus.

- [SURFACED-2026-09-11] Phase 2 / Q1 (non-circular result) — ✅ **Recall against independent truth is 36/36**: every operator-corroborated break is flagged by the discriminating predicate. ✅ The naive control flags **119** (96 TP + **23 FP**); the discriminating predicate flags **96** with **0** FP *against the label* — a **100% false-positive reduction** attributable in one run. ✅ The known over-flag sources are clean: `F10`/`F13`/`F19` contribute **0** false positives on either arm (they are excluded structurally, by the non-dispatchable-target and conditional-cell rules, not by tuning).

- [SURFACED-2026-09-11] Phase 3 / ⚠️ **Q2 GATE — THE WRONG-FIRE POPULATION IS MEASURED, AND IT IS NOT SMALL.** Of the **96** turns the supervisor would silently fire on: **36** are ground-truth breaks (operator nudge), **7** more are nudges my v1 regex missed (`"just chain it! Why returning control?"`, `"chain"`, `"invoke verify human"`, `"autopilot / start the work"`), **23** drew no recorded operator response — and **30 are genuinely-informational stops that a silent fire would have broken.** ⚠️ **70% of those 30 (21) sit on verify-human-adjacent edges** (`F10b` 10, `F12` 9, `F9b` 2) — precisely where the operator is supplying manual test results (`"all pass"`, `"vh.7 pass"`, `"all good except for 7"`). Firing there consumes the answer slot for a question the operator was actively answering, and `injectCommand` has **no retry and no pre-send cancel window**. ✅ **The good news is that the concentration is STRUCTURAL, not scattered** — it is addressable by edge class rather than by reading prose, which is what makes a Q2 answer possible at all. Phase 3 must measure whether excluding the verify-human-adjacent class (or requiring a non-question tail there) collapses the wrong-fire count without losing ground-truth recall.

- [SURFACED-2026-09-11] Phase 2 / P2.4 residual (sizes WP3's `claude -p` adjudicator) — the **472 UNDECIDED** split cleanly into **288 conditional-cell** (`feature/verify-human`'s AUTO-SKIP, whose condition needs verify-self state the transcript does not carry) and **184 non-dispatchable-target** (terminal/SURFACE/meta-op, already correctly excluded and needing no adjudication at all). ✅ **So the adjudicator's real scope is ONE homogeneous population — the verify-human AUTO-SKIP cell — not a general prose reader.** That is a far smaller, better-scoped component than the WBS assumed, and it argues the adjudicator stays demoted.

- [SURFACED-2026-09-11] Phase 2 / Q5 idempotency — ✅ **ANSWERED. 1,675** AUTO verdicts already had a `Skill` call land after them (top targets: `feature-build` 333, `feature-verify-auto` 325, `feature-verify-self` 325, `feature-verify-human` 312). The signal is unambiguous and machine-readable, so "has this edge already chained?" is a solved lookup — **but only with the corrected window** (`[SURFACED-2026-09-07]` above): an early-closing window under-counts chains and manufactures duplicate fires.

- [SURFACED-2026-09-11] Phase 2 verify-auto / instrument trap — ⚠️ **A POSITIVE CONTROL READ "GUARD IS VACUOUS" WHEN THE GUARD WAS FINE — the probe was invalid, not the guard.** Removing `NON_DISPATCHABLE_TARGET` and re-running `score()` changed **nothing** (flagged 96, FP 0, both before and after), which reads exactly like a guard that checks nothing. **Cause:** `score()` deliberately **skips `UNDECIDED`-labelled records**, and terminal edges are labelled `UNDECIDED` — so they never reached the predicate at all. The mutation *did* land (`lookup('F19')` flipped `None` → `AUTO`); it just landed somewhere the measurement could not observe. ✅ **Measured directly against the predicate instead, the guard suppresses 93 would-be fires into terminal states.** ⚠️ This is the repo's standing `[[invalid-probe-and-real-hole-look-identical]]` shape, hit again: **verify the probe's premises before believing a vacuous-guard reading** — and specifically, check whether the scoring function filters out the very population the mutation affects.

- [SURFACED-2026-09-11] Phase 2 verify-self / outcome wording — ⚠️ **The over-flag guard confirms its property but demonstrates NO DELTA**, as the runner correctly flagged: `F10`/`F13`/`F19` show **0 FP on BOTH arms**, so the naive baseline never over-flagged those three edges at all. My Phase 2 outcome was written expecting them to be the over-flag source. ✅ **Where the 23 naive FPs actually live: `F4` (20) and `F3` (3) — both `feature/spec` exits, which are PAUSE in Mode 3** because spec is a human review point. So the naive predicate's *entire* error is "it does not know that spec pauses." ✅ **That is a cleaner result than the plan assumed and confirms the WBS's prediction directly — the policy lookup, not the token parse, is the hard half.** ⚠️ For WP3: `F3`/`F4` are the cheapest regression sentinel for a policy-lookup bug, not `F10`/`F13`/`F19`.

- [SURFACED-2026-09-11] Phase 3 / Q2 — ⚠️ **A BLUNT EDGE-CLASS EXCLUSION IS A BAD TRADE, measured.** Suppressing fires on the verify-human-adjacent class costs true breaks at close to the rate it saves wrong ones: exclude `F10b`+`F12`+`F9b` → wrong-fires **30→9** but true-break recall falls to **34/43 (79%)**; exclude `F10b`+`F12` → 30→11 at 81%; `F10b` alone → 30→20 at 81%. **So Phase 3 must not simply carve out the edge class** — the wrong-fires concentrate there, but so do real breaks.

- [SURFACED-2026-09-11] Phase 3 / Q2 — ✅ **THE DISCRIMINATOR IS AN INSTRUCTION-TO-REPLY IN THE AGENT'S OWN TAIL, NOT A QUESTION MARK.** Hand-reading the two populations: wrong-fire tails carry an explicit request for operator input — *"reply with results"*, *"Run them and reply **all pass** or flag failures"*, *"call out any that fail"*, *"pending your answers above"* — while true-break tails are declarative (*"TRANSITION: F8"*, *"proceeding to Phase 1 build"*). ⚠️ **A question-mark / ask-phrase predicate is near-useless here** (2% of true breaks vs 10% of wrong-fires — barely better than noise), which **refutes the WBS's framing of Q2 as "question-shaped tail"**. A first-cut reply-instruction regex catches **7/30** wrong-fires at a cost of **4/43** true breaks; ⚠️ **all four of those losses share one phrase — *"say the word and I'll…"*** — which is an *offer*, not a request for data, and is separable. Phase 3 should tune on the reply-instruction axis and explicitly exempt the *"say the word"* offer form.

## Operator ruling R-5 (2026-09-11) — Q2's mechanism is the HYBRID, not a regex

⚠️ **DECIDED, not to be re-litigated.** The operator challenged the mechanism before answering the Phase 2 checklist and chose: **mechanical rule first, headless `claude -p` on the residual.**

| Layer | Decides | Population |
|---|---|---|
| **Mechanical** | transition token → policy row → dispatchable target? → already chained? | the ~1,900 records the rule can decide |
| **`claude -p`** | one question: *"is this turn awaiting operator input?"* | the residual the rule declines **+ the verify-human-adjacent fires** where wrong-fires concentrate (70%) |

**Structure picks WHO gets asked; the model answers what a regex cannot.**

⚠️ **This SUPERSEDES the regex direction Phase 2 was drifting toward**, and the drift is recorded because it was the agent's own, not the WBS's: I was about to ask the operator to bless a hand-tuned carve-out for a single English phrase (*"say the word"*) fitted to **4 records**. That is overfitting, and the next phrasing breaks it. ⚠️ **A regex over natural-language tails IS a prose-reading adjudicator with worse judgment than an LLM** — the exact thing this milestone rejected, re-introduced in a cheaper-looking form.

**Why the measurements support the ruling:** the question-mark predicate is noise (2% of true breaks vs 10% of wrong-fires); the reply-instruction regex catches only **7 of 30** wrong-fires at a cost of **4 of 43** true breaks. Neither is close to good enough to gate silent firing.

⚠️ **ACCEPTED COST, stated plainly:** `claude -p` becomes **load-bearing for correctness** on that slice, not merely a cleanup tail. The WBS demoted it specifically to keep model judgment off the critical path (*"an LLM adjudicator is itself a model-judgment component that can drift, which is the failure class this milestone exists to remove"*). The demotion still holds for the **dominant** path — the mechanical rule decides ~1,900 of ~2,284 — but it no longer holds for the Q2 slice. ⚠️ **WP3 must therefore treat the adjudicator as a first-class component with its own failure handling** (what happens when `claude -p` is slow, errors, or is unavailable?), **not** as best-effort polish. ⚠️ Per §4 of the WBS's reordering notes, this partially inverts the argument that exempted the adjudicator from its own probe WP — **flag at WP5 whether that exemption still stands.**

**Consequence for Phase 3:** build and measure the hybrid — mechanical arm + adjudicator arm on the routed population — not a regex ladder. The reply-instruction *finding* survives as evidence about what the adjudicator will be judging; it does **not** survive as the mechanism.

## Test Triage — "confirms F10 contributes no false positive on either arm"

Classification: **Obsolete/incorrect test — the assertion I wrote does not match the property it names.**
Confidence: **high**
Evidence: The test asserted `fixture.fire.filter(edge_id === "F10")` has length 0, but `F10` has **3 records in `fire[]`** and they are genuine breaks (TRUE positives, one of them operator-corroborated). The verified property is "F10 contributes no FALSE positive", which is about the `naiveFalsePositives` arm only — the second assertion conflated *"appears in fire at all"* with *"is a false positive"*. The data is right; my assertion was wrong.
Action: **Auto-fixed the test** (drop the incorrect second assertion; keep the false-positive arm, which is the property verify-self actually confirmed). No production data or fixture touched.

## Test Triage — `editor_fs::tests::trash_*` (2 Rust tests)

Classification: **Flaky / environmental — failure unrelated to this session's changes.** Specifically: an external-dependency failure, not a code regression and not an obsolete test.
Confidence: **high**
Evidence: Both panics carry the same OS error — `Trash { source: Os { code: 1, description: "The AppleScript exited with error. stderr: execution error: Finder got an error: The Finder is busy. (-15260)" } }`. These two tests drive the **real macOS Trash** via AppleScript, so they depend on Finder being free. ⚠️ **This session changed ZERO Rust files** (`git status` shows no `.rs` / `src-tauri` entries — all changes are TypeScript, markdown, and the fixture JSON), so no code path under test was touched.
Action: **No code or test modified. Not auto-fixed, not deleted, not retried into green.** Per §3b the failure persisted across 3 runs, so it is escalated here rather than silently accepted. ⚠️ **The `-15260` "Finder is busy" error is a host-environment condition** (Finder contention on this machine), and the correct response is to re-run when Finder is idle — not to change the tests. **Phase 2's own codified tests are unaffected: frontend 2291 passed / 175 files, including all 25 fixture-contract tests.**

⚠️ **Flagged for the operator:** these two tests are host-environment-coupled by construction (real Trash + AppleScript). If they keep failing on an otherwise-idle machine, that is a genuine finding about test design — a candidate backlog item to isolate them behind a feature gate or a fake — but it is **not** this probe's scope to change.

## ⚠️ Q2_VERDICT: SEPARABLE — the gate on WP3's fire policy OPENS (2026-09-11)

Measured over the **96 FIRE population** (the only turns a silent fire would ever touch), against **operator-behavior ground truth**, via the R-5 hybrid. **96 `claude -p` calls per arm, zero errors.**

| Adjudicator | Wrong-fire recall | Real breaks preserved | Verdict @ 0.80/0.80 |
|---|---|---|---|
| `haiku` | 0.793 (23/29) | 0.878 (36/41) | NOT_SEPARABLE (just under) |
| **`sonnet`** | **0.862** (25/29) | **0.854** (35/41) | ✅ **SEPARABLE** |

Agreement between the two arms: **88/96 (92%)**.

⚠️ **THE VERDICT IS MODEL-CONDITIONAL, AND THAT IS THE HEADLINE CAVEAT.** Haiku misses the bar; sonnet clears it. So WP3's GO is **not** "the hybrid works" — it is **"the hybrid works with a sufficiently strong adjudicator."** A silent model downgrade would move the supervisor from SEPARABLE to NOT_SEPARABLE **without any code change and with no signal**. WP3 must pin the adjudicator model explicitly and treat a change to it as a behavioral change requiring re-measurement.

✅ **The failure direction is the safe one.** Sonnet's 6 false positives are all cases where it withholds a fire on a turn that *was* a real break (`"continue"`, `"invoke verify human"`, `"autopilot / start the work"`). The consequence is that **the supervisor stays silent and the operator nudges — exactly today's status quo**, which is recoverable. The dangerous direction (firing into a turn awaiting an answer) is the one the adjudicator catches at 0.86.

⚠️ **Numbers corrected at Phase 3 verify-auto:** this table first recorded sonnet's breaks-preserved as **0.846**, which was a transcription slip — the script printed a rounded `0.85` and I wrote a third value. The re-derivation from `q2_sonnet.json` gives **0.854 = 35/41**. Verdict unchanged; the fractions are now shown so the figures are checkable rather than transcribed.

⚠️ **Cost, measured, not estimated:** ~3s per `claude -p` call; 96 turns at 8-way parallelism ≈ 40–60s wall-clock per full-corpus pass. **Per live turn it is one call on the critical path before firing.** That is the latency R-5 knowingly accepted.

- [SURFACED-2026-09-11] Phase 3 / routing — ⚠️ **THE STRUCTURAL ROUTER IS NOT SUFFICIENT ON ITS OWN; ROUTE EVERY FIRE CANDIDATE.** The narrow edge-class router (verify-human-adjacent only) sends 40 of 96 and **misses 10 of 32 AWAITING turns** — they sit on `F8` (6), `F7`, `F5`, `I14`, `I18`, and would fire **silently with no adjudication at all**. The 70%-concentration finding is real but is a *density* fact, not a *coverage* fact, and I initially built the router as though it were coverage. ✅ Since the whole FIRE population is ~96 turns and a call is ~3s, **routing every candidate is affordable** and closes the hole; `Q2_ROUTE_ALL=1` is the arm that produced the SEPARABLE verdict. ⚠️ **WP3 must route all fire candidates, not just the dense class.**

- [SURFACED-2026-09-11] Phase 3 / ground truth — ⚠️ **MY OWN GROUND TRUTH WAS WRONG ON 3 OF 32 RECORDS, and it was found by reading the adjudicator's "misses" rather than trusting the label.** `truth()` classified *any* non-nudge operator reply as `AWAITING`, so a bare acknowledgement (`"ok"`, `"good"`) counted as "the turn was awaiting data" — it was not; the operator was acknowledging a report. Correcting it moved haiku's recall **0.719 → 0.793** with no change to the adjudicator at all. ⚠️ **The general lesson for WP3: when a measurement disagrees with a model, check the label before blaming the model.** An adjudicator scored against a wrong label looks broken while behaving correctly.

- [SURFACED-2026-09-11] Phase 3 verify-auto / reporting discipline — ⚠️ **A REPORTED FIGURE WAS A TRANSCRIPTION SLIP, caught only because verify-auto RE-DERIVED it instead of re-reading it.** I recorded sonnet's breaks-preserved as **0.846**; the script had printed a rounded `0.85` and the true value is **0.854 (35/41)** — so the number I wrote matched neither the printout nor the data. The verdict was unaffected, but the figure was wrong in both the WIP and the backlog. ✅ **Fixed in both, and every rate now carries its fraction** (`0.862 (25/29)`, `0.854 (35/41)`) so a reader can check it rather than trust it. ⚠️ **The general lesson: a metric copied from a rounded console printout into a durable doc is unverifiable** — re-derive from the saved artifact, and publish the numerator/denominator.

### ⚠️ MARGIN CAVEAT — the SEPARABLE verdict is ONE RECORD wide (added at Phase 3 verify-self)

Surfaced by the verify-self runner, then quantified. **This qualifies the Q2 verdict above and must not be dropped when the probe report is written.**

| Arm | Recall | TP needed for 0.80 | **Margin** | Breaks-kept | **Margin** |
|---|---|---|---|---|---|
| `haiku` | 0.793 (23/29) | ≥24 | **−1 record** | 0.878 (36/41) | +3 |
| `sonnet` | 0.862 (25/29) | ≥24 | **+1 record** | 0.854 (35/41) | +2 |

⚠️ **`sonnet` clears the recall bar by a single record.** One record flipping TP→FN makes it **NOT_SEPARABLE**. The whole SEPARABLE/NOT_SEPARABLE split between the two models rests on a **2-record difference on a 29-record denominator**.

**What this does and does not mean:**
- ✅ It does **not** invalidate the finding that the hybrid separates the populations far better than any regex (7/30 at a cost of 4/43 was the best regex arm; the adjudicator is 25/29 at a cost of 6/41).
- ⚠️ It **does** mean `Q2_VERDICT: SEPARABLE` is **not a robust GO** — it is a *pass on a thin margin against a threshold I chose*. A 0.85 bar would fail both arms; a 0.75 bar would pass both. **The threshold is my judgment call, not a measured constant**, and the verdict inherits that.
- ⚠️ **The scorable denominator is the real limit: only 70 of 96 records are scorable** (26 are `UNKNOWN` — no operator response recorded). A larger labelled set is the only thing that would make this verdict robust, and R-3 already established the fixture is rebuildable.

**Recommendation for WP3 (to be carried into the probe report):** treat Q2 as **GO-WITH-CONDITIONS**, not a clean GO — pin the adjudicator model, re-measure on a larger labelled set before relying on the margin, and keep the fire policy's failure direction biased toward *withholding* (the safe direction, where the operator nudges) rather than firing.

## Operator ruling R-6 (2026-09-11) — WP3 is GO-WITH-CONDITIONS

⚠️ **DECIDED, not to be re-litigated.** Taken at Phase 3 verify-human with the thin margin disclosed.

| # | Decision |
|---|---|
| **1. The gate** | ⚠️ **GO-WITH-CONDITIONS** — WP3 is built, but not as an unqualified GO. The three conditions below travel with it. |
| **2. Threshold** | **0.80/0.80 accepted as-is.** ⚠️ It remains a *chosen* bar, not a measured constant — recorded so a later reader does not mistake it for an empirical finding. |
| **3. Adjudicator model** | ⚠️ **`sonnet` is PINNED.** A model change is a **behavioral change requiring re-measurement**, never a config tweak. Accepted per-fire cost: **~3s on the critical path** before each fire. |

**The three conditions WP3 carries:**

1. ⚠️ **Pin the adjudicator model explicitly** and fail loudly if it is absent or changed. `haiku` is NOT_SEPARABLE on identical data, so a silent downgrade regresses the supervisor with **no code change and no signal**.
2. ⚠️ **Bias the fire policy's failure direction toward WITHHOLDING.** When the adjudicator errors, times out, or is unavailable, the supervisor must **not fire** — the safe failure is "supervisor stays silent, operator nudges", which is today's status quo and recoverable. Firing into a turn awaiting an answer is unrecoverable (`injectCommand` has no retry and no pre-send cancel window).
3. ⚠️ **Re-measure on a larger labelled set before relying on the margin.** The verdict rests on **+1 record** (sonnet 25/29 against a ≥24 bar) with only **70 of 96** records scorable. R-3 already established the fixture is rebuildable; this is the cheap way to replace a 1-record margin with something dependable.

✅ **What the ruling does NOT hinge on:** the hybrid's superiority over a regex is *not* thin — 25/29 caught at a cost of 6/41, versus the best regex arm's 7/30 at a cost of 4/43. The mechanism choice (R-5) is well-supported; only the specific pass/fail verdict is close.

- [SURFACED-2026-09-11] Phase 3 verify-codify / artifact provenance — ⚠️ **THE SAVED RUN FILES CARRIED A STALE LABEL, and copying them verbatim would have pinned the wrong number.** `q2_all.json` (haiku) was written **before** the ACK fix to `truth()`, `q2_sonnet.json` **after** — so the stored `truth` field was asymmetric across arms. A verbatim copy re-derived haiku at **0.719 / 73 scorable** instead of the true **0.793 / 70**. ✅ Fixed by **re-deriving every label with the corrected labeller** when building the tracked artifact, and recording that in its `_meta.truth_note`. ⚠️ **General lesson: a saved result file embeds the labeller as of its run time.** When a labeller is corrected mid-probe, earlier artifacts are stale in a way nothing announces — re-derive, never copy.

- [SURFACED-2026-09-11] Phase 3 verify-codify / instrument trap (RECURRENCE) — ⚠️ **A mutation probe reported a guard vacuous when the mutation was a NO-OP.** M2 flipped a record's `truth` to `UNKNOWN` — but the record chosen was *already* `UNKNOWN`, so nothing changed and the parity guard "survived". Re-run against a record that genuinely changed the distribution (`BREAK` → `UNKNOWN`), the guard **fails 3 tests**. ⚠️ This is `[[invalid-probe-and-real-hole-look-identical]]` and `[[verify-the-mutation-landed]]` hit for the **second time in this probe** (Phase 2 verify-auto was the first). **Two occurrences in one probe makes it a standing habit, not a slip: assert the mutation changed the observed value BEFORE reading the guard's verdict.**

## Phase 4 answers — Q3 · Q4 · Q6 (2026-09-11)

### Q3a (compatibility): **INERT** ✅

Six mechanical checks on a **dereferenced scratch copy** of a real skill dir, all pass: the added key is readable; every pre-existing key survives with an **identical value** (not merely "still present" — a requote or reorder would be a silent behavioral change); the **body is byte-identical**; `name`/`description` (what the harness dispatches on) are untouched; removing the key **restores the file exactly**; the sandbox is left as found.

✅ **Corroborated by a NATURAL EXPERIMENT that is better evidence than the injection:** **6 of 48 shipped skills already carry a 4th frontmatter key (`allowed-tools`)** beyond the standard `name`/`description`/`argument-hint`. The harness demonstrably tolerates extra keys **in production today** — so inertness is not a hypothesis this probe had to establish, it is already observable.

⚠️ **SAFETY NOTE, and it is load-bearing:** every skill under `~/.claude/skills/` is a **SYMLINK into the mccc source repo**. Writing through one would dirty a *different git repo*. The experiment used `cp -RL` to dereference and verified the source repo stayed clean before, during, and after. **WP2 must not "just edit a skill file" to test frontmatter coupling.**

### Q3b (the product question): **NOT WORTH IT on current evidence** ⚠️

Q3 is *not only* a compatibility check. Confirmed by measurement: `skills_dir_exists()` answers **one boolean** and enumerates nothing (3 references, all in `workflow_install/runner.rs`), and **no YAML parser exists in either manifest**. So the roadmap's *"Claudesk reads them on the same scan M13's registry already performs"* is **false** — there is no scan. Adding an enumerator + frontmatter parser is **net-new work that reverses a recorded §4c anti-brittleness decision** (the command name is the only stable cross-repo coupling; a path is not).

⚠️ **And R-5 removed the motive.** The frontmatter key was to give Claudesk skill-state identity for the policy lookup — but the lookup already works from the **transition token alone** (Phase 2: 0 false positives on the decidable population). **Nothing in the probe's results needs this coupling.** Recommendation: **do not build it**; revisit only if a concrete need appears that the token cannot serve.

### Q4: **NO_DISCRIMINATOR** — and it blocks nothing (R-1) ✅

Across **188** skill-using sessions: **3** carry a real `/session-start` marker while **175** chain ≥2 skills. Reproduces the WBS's M-6 and confirms R-1's reasoning — honoring Mode 0 literally would suppress firing on essentially every real session. No cheap discriminator exists. **Per R-1 this is an opportunity question, not a gate: a null result blocks nothing.**

⚠️ **The A-2 hazard recurred here, for the THIRD time in this probe.** My first Q4 pass grepped any line containing `/session-start` and reported **203 markers among 188 sessions** — impossible on its face, and **68x** the true value, because skill bodies mention the string constantly. Correct measurement requires a **real user prose turn**. Three occurrences (A-2 itself · the file-scoped control · here) makes this a **standing hazard for WP3's reader**, not a one-off.

### Q6: **400,000 tokens** (a starting value, expressed as a firing rate) ✅

| Threshold | Sessions | Upper-bound firing rate |
|---|---|---|
| 250,000 | 151 | 71.2% |
| 300,000 | 124 | 58.5% |
| **400,000** | **80** | **37.7%** |
| 500,000 | 46 | 21.7% |
| 600,000 | 30 | 14.2% |

⚠️ **These rates are an UPPER BOUND, not the recycle rate.** WP4's real trigger is threshold **AND** a non-final phase boundary **AND** the feature workflow — so the observed rate is strictly lower. A recommendation quoting the bare rate would overstate how often this fires.

⚠️ **Not the median** (340,730 — recycling half of all sessions would churn runs that completed fine) and **not p90** (626,024 — too rare to earn the complexity). 400k sits above the p50 bulk and below the long tail. ⚠️ **It is a STARTING VALUE to be tuned in WP4 against observed recycle outcomes**, not a constant derived from first principles.

- [SURFACED-2026-09-12] Phase 4 verify-auto / the Q3 guard is load-bearing — ✅ **The inertness experiment can actually report NOT_INERT.** Positive control: re-running it with the probe key set to `name` (colliding with a dispatch field) correctly flips the verdict, with `preexisting_keys_unchanged: false`, `dispatch_fields_intact: false` and `roundtrip_exact: false`. So the INERT result distinguishes a genuinely additive key from a destructive one, rather than passing on anything. ⚠️ Worth noting because the two prior phases each produced a mutation probe that was itself invalid — this one was checked before being believed.

- [SURFACED-2026-09-12] Phase 4 verify-auto / safety discipline — ✅ **The mccc source repo was captured BEFORE the checks and diffed AFTER: byte-identical.** The installed `feature-plan` is still a symlink, and the dereferenced sandbox was recreated and removed twice with no leakage. ⚠️ This is the discipline any WP2 frontmatter experiment must copy — `git status` on the *other* repo is the only thing that actually proves the real skills tree was untouched; the absence of an error message proves nothing.

- [SURFACED-2026-09-12] Phase 4 verify-self / Q3 natural experiment sharpened — ✅ The runner enumerated **all 48** installed skills: only **two** frontmatter key-sets exist — **42** carry the standard `name`/`description`/`argument-hint`, and **6** carry those plus **`allowed-tools`** (`feature-review-quality`, `feature-verify-human`, `feature-verify-self`, `incident-reproduce`, `incident-triage`, `task-verify`). ✅ **So a 4th key is not merely tolerated in principle — it is shipped in production on 6 skills today.** That is stronger evidence for Q3a than the synthetic injection, and it means WP2 need not treat "will an extra key break the harness?" as an open risk at all. ⚠️ The open question was never compatibility; it is whether the enumerator is worth building (Q3b: **no**).

- [SURFACED-2026-09-12] Phase 4 verify-self / R-2 compliance proven structurally, not by grep — ✅ The runner confirmed `q6_threshold.py` emits **no model→window mapping** by inspecting **the only two division sites in the source** and showing both divide by **session count**, so every printed `%` is a share of sessions and never a fraction of a context window. Model names appear only in the docstring explaining why the map is refuted and **never reach stdout**. ⚠️ This is a better proof than the grep I ran myself: a grep shows the strings absent *today*, while reading the division sites shows the output **cannot** express a window fraction. Worth copying as a technique when asserting "output does not contain X".

## Operator ruling R-7 (2026-09-12) — Q3b / Q6 / Q4 closed

⚠️ **DECIDED, not to be re-litigated.** Operator replied "all pass" with the Q3b option-closing risk disclosed.

| # | Decision | Consequence |
|---|---|---|
| **1. Q3b** | ⚠️ **DO NOT build the skill enumerator + YAML frontmatter parser.** WP2's typed graph **does not couple to skill frontmatter.** | Compatibility was never the blocker — **6 of 48 shipped skills already carry `allowed-tools`**, so extra keys work in production today. The reasons to decline are: it is **net-new** work (no scan exists — `skills_dir_exists()` answers one boolean, no YAML parser in either manifest), it **reverses a recorded §4c anti-brittleness decision** (the command name is the only stable cross-repo coupling), and **R-5 removed the motive** — the policy lookup already works from the transition token alone at **0 false positives** on the decidable population. ⚠️ **This CLOSES a design option**; the risk was disclosed before the ruling and accepted. |
| **2. Q6** | **400,000 tokens**, accepted as a **STARTING VALUE to tune in WP4**, not a derived constant. | Fires on **≤37.7%** of sessions as an **upper bound** — the real trigger additionally requires a **non-final phase boundary** AND the **feature workflow**, so observed firing will be strictly lower. Deliberately not the median (340,730 — would churn runs that completed fine) and not p90 (626,024 — too rare to earn its complexity). Next rung down if WP4 finds it too eager: **500k (21.7%)**. |
| **3. Q4** | **NO_DISCRIMINATOR accepted as final** — no further search. | 3 real `/session-start` markers vs **175** sessions chaining ≥2 skills across **188** skill-using sessions. R-1 already made Mode 0 an *opportunity*, not a gate, so the null result blocks nothing. |

## Phase 4 verify-codify — NO new tests were written, deliberately

⚠️ **This is a decision, not an omission.** Phases 1–3 each added tests because each produced a **durable data artifact** whose properties were re-derivable from a tracked file. Phase 4 did not, and manufacturing coverage anyway would have been worse than none.

**What was checked before concluding, empirically rather than by argument:**

| Candidate | Why it is NOT codifiable here |
|---|---|
| Q3a inertness (`INERT` on 6 checks) | ⚠️ It is a property of the **CC harness's frontmatter contract**, not of this repo. A test here would assert **someone else's contract** — it would fail when the harness changed, pointing at Claudesk for a defect Claudesk does not own. |
| Q3 natural experiment (**6 of 48** carry `allowed-tools`) | ⚠️ **Verified empirically: `git ls-files \| grep '^skills/'` returns 0** — this repo tracks no skill files, and `~/.claude/skills` exists **only on this machine** (every entry a symlink into the mccc repo). A test would assert another repo's state and **fail on any other checkout** — flaky by construction, and its failure would be uninformative. |
| Q6's **400,000** recommendation | ⚠️ It is a **recorded decision (R-7)**, not a behavior. Pinning it would assert that a ruling is still the ruling — a tautology that fails only when the operator deliberately changes their mind, i.e. exactly when it should not fail. |
| Q4's `NO_DISCRIMINATOR` | Same shape as Q6 — a conclusion, not a behavior. |

⚠️ **Both Phase 4 scripts are gitignored** (`.gitignore:57` → `tmp/`), so a test importing them could not run from a clean checkout at all.

✅ **What DOES protect Phase 4's findings:** they are recorded as **operator ruling R-7** in both this WIP and `wbs.md`'s rulings table, alongside the measurement that justified each. That is the right durability mechanism for a decision — a changelog entry a future reader can audit, not an assertion that would break for the wrong reasons.

**Gate re-run regardless, to confirm no regression from the Phase 4 work.**

### ✅ The `editor_fs::trash_*` triage is VINDICATED (Phase 4 gate, 2026-09-12)

The full gate now reports **Rust 866 passed / 0 failed** — the two `editor_fs::tests::trash_*` tests that failed across three consecutive runs on 2026-09-11 **pass unchanged**. No code, no test, and no fixture was touched in between.

✅ **This confirms the triage classification was right:** the failures were **environmental** (`Finder got an error: The Finder is busy. (-15260)` — the tests drive the real macOS Trash via AppleScript), not a code regression. Had they been "fixed" by editing the tests or retried into green, a real host-contention signal would have been destroyed and the tests permanently weakened.

⚠️ **The standing caveat still holds** and is worth a backlog item on its own terms: these two tests are **host-environment-coupled by construction**, so they will fail again whenever Finder is busy. That is a genuine test-design observation — but it was correctly out of scope for this probe to change.

## Phase 5 — the probe report is written (2026-09-12)

Deliverable: `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-probe-report.md`

✅ **All six questions ANSWERED; none guessed.** The probe's own success criterion — *"a probe that answers 4 of 6 and says so is a success; one that guesses at the other 2 is a failure"* — is met with all six answered on evidence.

| Q | Answer |
|---|---|
| Q1 detector | 96 flagged, **0 FP / 0 FN** vs the label; **36/36** against non-circular ground truth |
| Q2 tail | ✅ `SEPARABLE` — but **REFRAMED** (R-5) and on a **+1-record** margin |
| Q3 frontmatter | **INERT** (a); **do NOT build the enumerator** (b, R-7) |
| Q4 Mode-0 | `NO_DISCRIMINATOR` — blocks nothing (R-1, final per R-7) |
| Q5 idempotency | **1,675** already-chained; a solved lookup with the corrected window |
| Q6 threshold | **400,000** tokens as a tunable starting value (R-7) |

**Per-WP:** WP2 **GO** (two mandatory corrections, no frontmatter coupling) · WP3 **GO-WITH-CONDITIONS** (R-6, three binding conditions) · WP4 **GO** · WP5 **GO**.

⚠️ **P5.4 honored:** the six upstream doc corrections are **recorded, not applied** — including the new one this probe adds, that **R-5 partially inverts §4's rationale for exempting the `claude -p` adjudicator from its own probe WP**, which WP5 must re-check. The resync is the milestone's exit step.

✅ **Three recurring hazards named as a PATTERN** (each bit ≥2x inside this one probe): substring presence is not role-attributed evidence (3x) · an invalid mutation probe and a real hole look identical (2x) · a metric transcribed from a rounded printout is unverifiable. Plus a fourth: a saved result file embeds the labeller as of its run time.

### Phase 5 verify-self — the report's numbers were INDEPENDENTLY RECOMPUTED (2026-09-12)

✅ **14 PASS · 1 correctly-UNVERIFIED · 0 FAIL.** Every headline figure in the probe report was recomputed from the two checked-in fixtures and matched: 2,284 records · 96 FIRE at 0 FP/0 FN · the naive 119/23 · **all 23 naive FPs in {F4:20, F3:3}** with F10/F13/F19 at zero · 36/36 ground-truth · both Q2 arms to 4 decimal places · the **+1/−1 margin** (ceil(0.8×29)=24; sonnet 25, haiku 23) · 1,675 already-chained with exact chain-target tallies · the 472 → 288+184 split. ✅ **No figure appears with two different values anywhere in the document.**

⚠️ **This was the right check to demand.** Twice in this probe a number reached a durable doc without matching its evidence (the `0.846`/`0.854` transcription slip; the stale-label artifact that would have pinned `0.719`). Re-running shape greps would have caught neither. **A report is only as good as the last time someone recomputed it from the data.**

**Three things the runner added that I had not asked for:**

1. ⚠️ **A counting trap in my own secondary claim:** `ls ~/.claude/skills/` shows **59** entries, but only **48** are real skill directories containing a `SKILL.md` — the remainder are listing artifacts. The report's "48" is correct, but I had never established *why* the raw count differs. The 6 `allowed-tools` carriers were confirmed **element-for-element** against my named list.
2. ✅ **Q6 validated STRUCTURALLY despite being unrecomputable.** Its percentiles come from the live corpus, not a checked-in file. Rather than shrug, the runner confirmed all three firing rates reproduce exactly from `n/212` (124/212=58.5%, 80/212=37.7%, 46/212=21.7%), that the percentiles are monotonic, and that **each threshold count sits correctly relative to the stated percentiles** (400k between p50 and p75 → 53 < 80 < 106). That is real evidence for a figure it could not independently derive — and the honest `UNVERIFIED` label was kept rather than inflated to a PASS.
3. ✅ **Live corroboration of a hazard the report itself names:** the corpus now holds **240** `.jsonl` files against **239** at fixture-freeze — independent confirmation of the "supervisor reads its own writes" drift, observed in the wild between freeze and verification.

## Phase 5 verify-codify — NO new tests, and the existing ones were proven load-bearing

⚠️ **Deliberate, and checked rather than asserted.** §2's rule is explicit: *"if a behavior is already covered by a test that would fail if the behavior broke → skip it, do not duplicate."*

✅ **All 13 headline figures the report cites are ALREADY asserted** by the 33 tests in `src/state/__tests__/m15SupervisorFixture.test.ts` — 2284 · 96 · 119 · 23 · 36 · 1675 · 472 · 288 · 184 · 25 · 29 · 35 · 41. Verified by scanning the test source for each figure, not by assuming.

✅ **And those tests genuinely catch a report/data divergence:** dropping a single FIRE record (96 → 95, which would make the report overstate) fails **3 tests**. So the coverage is load-bearing, not nominal.

⚠️ **A test over the report's markdown prose would pin WORDING, not behavior** — it would fail on a rewording that changed nothing and pass on a number that had silently drifted. The fixture assertions are the correct mechanism; the report is downstream of them.

**Gate: frontend 2,299 / Rust 866, zero failures.**

---

# ✅ WP1 COMPLETE — 5 phases, 20 verification gates, all leaves `[x]`

**Deliverable:** `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-probe-report.md` — accepted by the operator 2026-09-12.

**All six questions answered on evidence; none guessed.** The probe's own success criterion is met.

**Per-WP:** WP2 **GO** · WP3 **GO-WITH-CONDITIONS** (R-6) · WP4 **GO** · WP5 **GO**.

**Operator rulings taken during the probe:** R-5 (Q2's mechanism is the hybrid, not a regex) · R-6 (WP3 GO-WITH-CONDITIONS on a +1-record margin) · R-7 (no enumerator; 400k tunable; Q4 final) — all recorded in `wbs.md`'s rulings table alongside R-1…R-4.

**WBS updated:** WP1 marked COMPLETE with all 9 tasks annotated; the dependency map's live-gate line replaced; open items 1–2 resolved; WP2–WP5 annotated with the constraints the probe produced; 2 new correction rows; frontmatter dated.

**Durable assets:** 2 fixtures · 33 standing tests · 1 probe report. ⚠️ The probe's own scripts were throwaway by design — WP3 owns the shippable reader.
