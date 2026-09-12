---
stage: probe-report
cycle: milestone-15-workflow-supervisor
wp: WP1
status: complete
measured: 2026-09-07 .. 2026-09-12
---

# M15 WP1 — Probe report: does the mechanical auto-chain rule decide real stops?

**Verdict in one line:** yes — the mechanical rule decides the great majority of real stops with zero false positives on the population it can decide, and the residual it cannot decide is narrow enough for a demoted `claude -p` adjudicator to handle. **All six questions are answered; none is guessed.**

**Timebox:** honored. The probe ran within its budget and did not need a second session to reach an answer.

## Per-WP recommendations

**WP2**: GO — build the typed graph, with two mandatory structural corrections and one thing explicitly NOT built.

**WP3**: GO — but **GO-WITH-CONDITIONS** per operator ruling R-6; the three conditions are binding, not advisory.

**WP4**: GO — threshold settled as a tunable starting value; no model→window map is needed or permitted.

**WP5**: GO — nothing in the probe blocks it; it inherits the doc-correction list in §P5.4 below.

*(The four lines above are the machine-checkable recommendations. Everything below is the evidence.)*

---

## Q1 — What fraction of real stops does the mechanical rule decide?

**Answer: all of them, on the population it can decide — 96 flagged, 0 false positives, 0 false negatives against the labelled fixture; and 36/36 recall against independent ground truth.**

**Evidence:** `wp1-break-fixture.json` (2,284 records, frozen snapshot). The discriminating predicate — emitted edge → policy row → dispatchable target? → did a `Skill` call follow? — flags **96** turns with **0 FP / 0 FN** against the label. The naive baseline (M-3's predicate: any verdict token with no following `Skill` call) flags **119** with **23 FP**, so the policy lookup eliminates **100%** of the naive false positives. Both arms are computed from the same fixture in one run, so the improvement is attributable rather than asserted.

⚠️ **That headline precision/recall is CIRCULAR and must not be read as the answer.** The detector and the labeller both call the same `lookup()` with the same branch order, so 1.000/1.000 is arithmetic identity — it would read perfect even if the policy table were entirely wrong. Caught by treating a perfect score as a symptom rather than a success.

✅ **The non-circular measurement:** scored against the **operator-prod signal** — a short, content-free nudge (`"so?"`, `"next"`, `"chain"`) typed immediately after a verdict, derived from *operator behavior* rather than from the policy table — the predicate catches **36 of 36** ground-truth breaks.

⚠️ **Where the naive predicate actually errs** (a correction to the plan's assumption): all **23** false positives are `F4` (20) and `F3` (3) — `feature/spec` exits, which PAUSE in Mode 3 because spec is a human review point. The naive error is entirely "it does not know that spec pauses." **`F3`/`F4` are therefore the cheap regression sentinel for a policy-lookup bug — not `F10`/`F13`/`F19`, which contribute zero false positives on either arm.**

**On R-3's divergence:** the fresh fixture yields **96** rule-flagged / **36** operator-corroborated breaks against the roadmap's historical **19**. R-3 pre-authorised rebuilding fresh and demoted the old counts to context. The divergence is reported as context, not failure — and the operator accepted 96/36 as the acceptance baseline (Phase 1 verify-human).

## Q2 — Can a question-shaped / answer-awaiting tail be reliably identified?

**Answer: YES, but only via an LLM adjudicator, and only by a one-record margin. `Q2_VERDICT: SEPARABLE`.**

**Evidence:** `wp1-q2-adjudication.json` — 192 live `claude -p` calls (96 per arm, **zero errors**), scored over the **96 FIRE population** (the only turns a silent fire would ever touch) against operator-behavior ground truth.

| Adjudicator | Wrong-fire recall | Real breaks preserved | Verdict @ 0.80/0.80 |
|---|---|---|---|
| `haiku` | 0.793 (23/29) | 0.878 (36/41) | NOT_SEPARABLE |
| **`sonnet`** | **0.862 (25/29)** | **0.854 (35/41)** | ✅ **SEPARABLE** |

⚠️ **The WBS's framing of Q2 was REFUTED.** "Question-shaped tail" is not the discriminator: a trailing-`?` predicate fires on 2% of true breaks vs 10% of wrong-fires — noise. What actually separates them is an **instruction-to-reply** (*"Run them and reply **all pass** or flag failures"*) versus a declarative ending. But a regex over that is also inadequate — it caught only 7 of 30 wrong-fires while losing 4 true breaks, and needed a hand-tuned carve-out fitted to **4 records**. ⚠️ **A regex over natural-language tails IS the drift-prone prose-reading adjudicator this milestone exists to remove, in a cheaper-looking form.** Hence **R-5**.

⚠️ **THE MARGIN IS ONE RECORD.** Sonnet clears the 0.80 recall bar by **+1** (25 against a ≥24 minimum); haiku misses by **−1**. The entire SEPARABLE/NOT_SEPARABLE split between models is a **2-record difference on a 29-record denominator**, and only **70 of 96** records are scorable (26 have no recorded operator response). ⚠️ **The 0.80/0.80 threshold is a CHOSEN bar, not a measured constant** — at 0.85 both arms fail; at 0.75 both pass.

✅ **The failure direction is the safe one.** All 6 of sonnet's false positives *withhold* a fire on a turn that was a real break, so the supervisor stays silent and the operator nudges — today's status quo, and recoverable. The dangerous direction (firing into a turn awaiting an answer) is what the adjudicator catches at 0.86.

## Q3 — Skill-frontmatter state identity: does it work without breaking current behavior?

**Answer: (a) YES, it is inert — and (b) build it anyway? NO.**

**Evidence (a):** six mechanical checks on a **dereferenced** scratch copy, all pass — `Q3a_VERDICT: INERT`. A positive control (injecting a key that collides with `name`) correctly reports `NOT_INERT`, so the guard discriminates rather than passing on anything. ✅ **Stronger still, a natural experiment:** of **48** installed skills, **6 already carry a 4th key (`allowed-tools`)** — `feature-review-quality`, `feature-verify-human`, `feature-verify-self`, `incident-reproduce`, `incident-triage`, `task-verify`. Extra frontmatter keys are **shipped in production today**; compatibility was never the real risk.

**Evidence (b) — the product half, and the operative answer (R-7):** the roadmap's premise that Claudesk *"reads them on the same scan M13's registry already performs"* is **FALSE**. `skills_dir_exists()` answers **one boolean** and enumerates nothing (3 references, all in `workflow_install/runner.rs`), and **no YAML parser exists in either manifest**. So an enumerator + parser is **net-new** work that **reverses a recorded §4c anti-brittleness decision**. ⚠️ **And R-5 removed the motive** — the policy lookup already works from the transition token alone at 0 FP. **Do not build it.**

⚠️ **Safety finding that binds WP2:** every skill under `~/.claude/skills/` is a **SYMLINK into the mccc source repo**. Any experiment that edits an installed skill file writes into a *different git repository*, silently. Use `cp -RL` and diff that repo's `git status` before/after.

## Q4 — Mode 0 / direct invocation: is there a discriminator worth having?

**Answer: `Q4_VERDICT: NO_DISCRIMINATOR` — and per R-1 this blocks nothing.**

**Evidence:** across **188** skill-using sessions, only **3** carry a real `/session-start` marker while **175** chain ≥2 skills. This reproduces the WBS's M-6 and confirms R-1's reasoning: honoring Mode 0 literally would suppress firing on essentially every real session. No cheap, reliable discriminator exists. R-1 already downgraded Q4 from a gate to an opportunity, so a null result is an acceptable final answer (accepted at Phase 4 verify-human, R-7).

⚠️ **A measurement hazard worth carrying:** the first pass at this number grepped any line containing `/session-start` and reported **203 markers among 188 sessions** — impossible on its face, and **68x** the true value, because skill bodies mention the string constantly. A marker counts only from a **real user prose turn**.

## Q5 — Idempotency: can the supervisor tell CC already chained correctly?

**Answer: YES — a solved lookup. 1,675 AUTO verdicts already had a `Skill` call land.**

**Evidence:** the fixture's `already-chained` records number **1,675**, with unambiguous chain targets (`feature-build` 333, `feature-verify-auto` 325, `feature-verify-self` 325, `feature-verify-human` 312). The signal is structural and machine-readable.

⚠️ **But only with the corrected window.** The "did a `Skill` call follow?" scan must **not** close on an intervening tool call or a re-quoted `TRANSITION:` token. Proven case: session `06eb0e92` turn 504 emitted `F10` and **did** chain correctly — the `Skill` call landed at line 511, after two `Bash` calls — yet an early-closing window labelled it a break. Only a real **user prose turn** ends the window; tool results arrive with role=`user` and must be skipped. Fixing this took the break count **127 → 96**.

## Q6 — What absolute token count is the right threshold?

**Answer: 400,000 tokens, as a TUNABLE STARTING VALUE (R-7).**

**Evidence:** per-session peak used-tokens over **212** sessions (`input + cache_read + cache_creation`, read per line, never summed): min **46,301** · p50 **340,730** · p75 **465,228** · p90 **626,024** · max **833,567**.

| Threshold | Sessions | Upper-bound firing rate |
|---|---|---|
| 300,000 | 124 | 58.5% |
| **400,000** | **80** | **37.7%** |
| 500,000 | 46 | 21.7% |

⚠️ **Expressed as a firing RATE, not a bare number** — "recycle at 400,000 tokens" is not judgeable; "fires on ~38% of your sessions" is. ⚠️ **These rates are an UPPER BOUND**: the real trigger additionally requires a **non-final phase boundary** AND the **feature workflow**, so observed firing is strictly lower. Deliberately **not the median** (would churn runs that completed fine) and **not p90** (too rare to earn its complexity). Next rung down if WP4 finds it eager: **500k (21.7%)**.

✅ **R-2 is vindicated by the spread.** An 18x range (46k–833k) means a *percentage* threshold would need the context-window value that **M-5 refuted** — `claude-opus-5` observed at 833,567 and `claude-opus-4-7` at 268,743, with **no `[1m]` marker anywhere** in the corpus. As an absolute count it is one arithmetic operation on data proven present.

---

## What each downstream WP inherits

### WP2 — the typed graph
Two corrections are **mandatory**, both measured:
1. ⚠️ **`dispatchable_target` must be a per-edge property held SEPARATELY from the 5-value policy cell.** An `AUTO` cell does **not** imply there is anything to fire into. Labelling on the cell alone marked **223** breaks, most of them terminal/SURFACE/meta-op edges (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`). Adding this took **223 → 127**. Without it, WP3 injects commands into workflows that have already ended.
2. ⚠️ **`F3`/`F4` are the regression sentinel**, not `F10`/`F13`/`F19`.

And one thing **NOT** built: **no skill enumerator, no frontmatter coupling** (R-7).

### WP3 — detect + fire
Operator ruling **R-6: GO-WITH-CONDITIONS**. The three conditions are binding:
1. ⚠️ **Pin the adjudicator model** and fail loudly on absence/change — `haiku` is NOT_SEPARABLE on identical data, so a silent downgrade regresses the supervisor with **no code change and no signal**.
2. ⚠️ **Bias the failure direction toward WITHHOLDING.** On adjudicator error/timeout/unavailability the supervisor must **not fire**. `injectCommand` has no retry and no pre-send cancel window, so a wrong silent fire is unrecoverable except via Esc.
3. ⚠️ **Re-measure on a larger labelled set before relying on the margin.**

Plus three measured implementation constraints:
- ⚠️ **Route EVERY fire candidate to the adjudicator**, not just the dense class. The narrow edge-class router (verify-human-adjacent only) sends 40 of 96 and **misses 10 of 32** awaiting-turns, which would fire silently with no adjudication at all. The 70%-concentration finding is a *density* fact, not a *coverage* fact.
- ⚠️ **The chain-detection window must not close early** (Q5 above).
- ⚠️ **The supervisor reads its own writes.** The corpus is live and includes the supervising session's own transcript — the scanned total was observed drifting **2282 → 2284 → 2286** within one session. Any "have I already fired for this turn?" check must key on the **turn**, never a corpus-wide count.

### WP4 — context recycle
Threshold **400,000** as a tunable starting value; **no model→window map** (R-2). Gate to the **feature workflow** and to a **non-final phase boundary** — the threshold alone is not the trigger.

### WP5 — exit verify
Nothing in the probe blocks it. It inherits the doc-correction list below.

---

## P5.4 — Upstream doc corrections for WP5 to resync

⚠️ **Recorded here, NOT applied — the durable-doc resync is the milestone's own exit step (WP5 task 5.6/5.7). Do not leave these uncorrected at close.**

| Claim | Where it lives | Status |
|---|---|---|
| *"`message.model` is on the line so [the window] is derivable"* | `roadmap.md` → M15 deliverable 4 | ⚠️ **REFUTED** (M-5), and **R-2 removes the need for it**. |
| *"Claudesk reads them on the same scan M13's registry already performs"* | `roadmap.md` → M15 probe Q3 | ⚠️ **FALSE** — no registry, no scan, no YAML parser. Confirmed by measurement this probe. |
| *"arms 1–5 are TAKEN"* / *"a SIXTH guard arm"* | `arch.md` → load-bearing constraints | ⚠️ **STALE** (M-15): 6 arms / 8 subjects since M13.5 WP4; a new supervisor surface owns the **seventh**. |
| *"Above **50% context usage** …"* | `roadmap.md` → M15 deliverable 4 | ⚠️ **SUPERSEDED by R-2** — an absolute token count, now valued at 400k (R-7). |
| Q2 as *"question-shaped tail detection"* | `wbs.md` → WP1 Q2, `roadmap.md` | ⚠️ **REFRAMED by R-5** — the discriminator is an instruction-to-reply, and the mechanism is the hybrid, not a regex. |
| §4's rationale exempting the `claude -p` adjudicator from its own probe WP | `wbs.md` → Reordering / rule-deviation notes | ⚠️ **PARTIALLY INVERTED by R-5.** The adjudicator is no longer purely off the dominant path — it is **load-bearing for correctness** on the Q2 slice. §4's own text says that inversion would require a probe. **Re-check the exemption at WP5.** |

---

## Recurring hazards — a PATTERN, not one-offs

Each of these bit more than once **inside this single probe**, so each is a standing hazard for WP3's real implementation rather than an anecdote.

1. ⚠️ **Substring presence is not role-attributed evidence.** Hit **three times**: the original parse (a file-level grep over transcripts inflates `TRANSITION:` hits **5.8x**, admitting 10,885 role=`user` lines of echoed docs); the `--scope=file` control that quantified it; and the Q4 marker scan (**68x** over-count). **WP3's reader must scope every scan to the emitting role, never to string presence.**
2. ⚠️ **An invalid mutation probe and a real guard hole look identical.** Hit **twice**: a control that "proved" a guard vacuous had mutated a population the scoring function filtered out; another flipped a field to a value it already held. **Assert the mutation changed the observed value BEFORE reading the guard's verdict.**
3. ⚠️ **A metric transcribed from a rounded console printout is unverifiable.** A reported `0.846` matched neither the printout (`0.85`) nor the data (`0.854`). **Re-derive from the saved artifact and publish the numerator/denominator**, which is why every rate in this report carries its fraction.

A fourth, related: ⚠️ **a saved result file embeds the labeller as of its run time.** When a labeller is corrected mid-probe, earlier artifacts go stale silently — re-derive, never copy.

---

## Artifacts

| Artifact | Path |
|---|---|
| Labelled break fixture (2,284 records) | `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-break-fixture.json` |
| Q2 adjudication results (2 arms × 96) | `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-q2-adjudication.json` |
| Standing regression tests (33) | `src/state/__tests__/m15SupervisorFixture.test.ts` |
| Full working record + rulings R-5…R-7 | `workflow-system/state/wip/m15-wp1-supervisor-probe.md` |

⚠️ The probe's own scripts were **throwaway by design** (gitignored `tmp/scratch/m15-probe/`) — WP3 owns the shippable reader and detector. The durable assets are the two fixtures, the 33 tests that pin their properties, and this report.
