---
stage: wbs
state: in-progress
cycle: milestone-15-workflow-supervisor
milestone: 15
updated: 2026-09-13
---

# WBS — Milestone 15: Workflow supervisor

Decomposes **only** M15 (`roadmap.md` → Group E). Future milestones (M14's remaining polish half) stay tracked in `roadmap.md` and are decomposed just-in-time.

**Milestone goal (from `roadmap.md`):** the drive mode's chaining policy is enforced **mechanically by Claudesk**, not advisorily by prose the model may drift from. When a CC turn ends where the pause policy said AUTO, Claudesk fires the next command — across every open workspace, not just the focused one.

**Ownership boundary (settled 2026-08-14, not re-litigated here):** Claudesk owns the drive mode's **VALUE** and **TURN-BOUNDARY** enforcement; mccc owns its **MEANING** and **INTRA-TURN** semantics, and its prose stays as the no-Claudesk floor. Full rationale + the rejection of full absorption: `roadmap.md` → Milestone 15 + Revision 2026-08-14.

---

## Pre-decomposition measurements

Taken during this WBS pass so the WPs below are sized against facts rather than the roadmap's prose. **Each one changes a WP.**

| # | Measurement | Value | Consequence |
|---|---|---|---|
| M-1 | `TRANSITION:` tokens present + parseable in real transcripts | ✅ yes (`F10`, `F10b`, `F11`, `F13`, `F17b`, `S20`, …) | The detector's primary input exists. WP1 Q1 is a *tuning* question, not a feasibility one. |
| M-2 | Transcripts available for this project | **238** `.jsonl` under `~/.claude/projects/<slug>/` | The corpus fixture is reachable today; no data-collection WP needed. |
| M-3 | **Naive** detector over the real corpus (transition-emitting turn NOT followed by a `Skill` call) | **289 / 2,281** turns flagged | ⚠️ The roadmap's fixture says **19** breaks. A naive predicate **over-flags ~15x** — most of the 289 are legitimate PAUSEs (`F10`/`F13`/`F19`). **This is the strongest argument that WP1 Q1 is load-bearing**, and it means the policy lookup — not the token parse — is the hard half. |
| M-4 | `message.usage` fields present on assistant lines | ✅ `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` | The context read works as recorded. ⚠️ **LAST assistant line only, never summed.** |
| M-5 | ⚠️ **`message.model` CANNOT determine the context window** | `claude-opus-5` observed at **833,567** tokens; `claude-opus-4-7` at **268,743**; **no `[1m]` suffix appears anywhere in 238 transcripts**; a `<synthetic>` value also occurs | ⚠️ **REFUTES the roadmap's stated derivation** (*"`message.model` is on the line so it is derivable"*). The window is **not** a function of the model string. WP4 cannot compute a *percentage* from the transcript alone → this becomes an explicit probe question (WP1 Q6) and **R-2 settles the FORM: an absolute token count, no window map** — so this refutation costs nothing downstream. Probe Q6 narrows to the *value*. |
| M-6 | Mode-0 discriminability via a `/session-start` marker | only **3 of 206** skill-using sessions contain one, yet **139** chained ≥2 skills | ⚠️ **Sharpens probe Q4 into a near-refutation**: "no `/session-start` seen" would classify essentially every real session as Mode 0 and suppress **all** firing. The operator's habitual entry *is* the bare slash command. ✅ **RESOLVED BY R-1: the stored mode is the authority and Mode 0 is not honored as a suppressor.** Probe Q4 is downgraded from a gate to an opportunity. |
| M-7 | Policy-table size to absorb | **113** transition rows in `transitions.md`; **89** pause-policy rows across 4 `AGENTS.md`; **× 4 modes ≈ 356 cells**; cell vocabulary **5 values** (`AUTO`/`PAUSE`/`AUTO-SKIP`/`SKIP (entire skill)`/`n/a`) + Mode 0 outside the four | Confirms the roadmap's "not binary". Sizes WP2 at **L**. |
| M-8 | ⚠️ Policy rows are keyed by **STEP**, not by transition ID | feature table: **19 of 27** rows key on a bare step name, only **8** on an `F<n>` id | ⚠️ The detector parses an **edge**; the policy is recorded per **state**. The edge→policy-row mapping is **derivation work**, not a lookup — a named WP2 task, and a likely source of wrong verdicts if assumed. |
| M-9 | `transitions.md` interleaves intra-turn semantics (mccc's half) with the graph (Claudesk's half) | **2** rows carry explicit `behavior-within-state` annotations | Bounded. WP2 extracts the graph and must **leave** those two behind — a real extraction hazard, but small. |
| M-10 | `recycleSession()` is genuinely callable | exported async fn taking `RecycleInputs` (`src/components/workspace/recycleSession.ts:391`), exactly **one** UI caller (`Workspace.tsx:556`) | WP4's dependency on M13 is **satisfied**; WP4 is the planned second caller. |
| M-11 | The status broadcast collapses per workspace **but the raw stream does not** | one Tauri event `workspace-status` (`status_broadcaster/commands.rs:36`) emitted **once per hook event, no dedupe**; `event_to_state` (`mod.rs:194`) maps to 4 live states (+ never-emitted `Unknown` = 5 variants) | ✅ **Better than assumed.** The *folded* `WorkspaceStatusMap` cannot carry a per-turn signal (`[[workspace-status-map-collapses-consecutive-events]]`), but **the raw event stream can** — and 4 subscribers already read it, 2 of them raw by design. |
| M-12 | ⚠️ **`is_turn_start` ALREADY EXISTS** — the sanctioned turn-boundary seam | `event_is_turn_start()` (`status_broadcaster/mod.rs:451`) = `hook_event_name == "UserPromptSubmit"`, surfaced as `WorkspaceStatusUpdate.is_turn_start` (`:292`); `XtermPane.tsx:343` already consumes it **raw** | ✅ **Shrinks WP3 task 3.1 from "build a trigger" to "consume an existing one."** ⚠️ Its own doc states the rule: *read it off the **raw** event stream, never the folded map.* ⚠️ It is turn-**start**; the turn-**end** correlate is `Stop`, which per `[[derived-state-is-not-a-proxy-for-its-event]]` now maps to **both** `Idle` and `BackgroundWork`. |
| M-13 | ⚠️ **`recycleSession()` is TS-only; there is no Rust recycle command** | no `#[tauri::command]`; only the route-enum member `CleanExitRoute::RecycleSession` (`session_state/mod.rs:351`). The fn needs caller-owned React state (`relaunch`, `awaitFreshSessionId`) | ⚠️ **Sizes WP4 up.** If the supervisor's verdict is computed in Rust, a backend-initiated recycle needs a **new backend→frontend IPC direction** that does not exist. Alternative: keep the verdict in TS. ✅ **RESOLVED BY R-4: the verdict lives in TS; Rust does file IO only.** No new IPC direction is built. |
| M-14 | ⚠️ **No `BackgroundWork` completion edge exists** | CC emits nothing when a background job finishes (confirmed against all 31 hook events; a `BackgroundTasksIdle` request was closed **as not planned**). Self-heals on the next zero-count `Stop` | ⚠️ A turn that ends in `BackgroundWork` has **no event announcing the work finished**. The detector must not wait for one. ⚠️ **Do NOT add a PID-polling watchdog** — already probed and rejected (covers a non-existent case, depends on undocumented `~/.claude/shell-snapshots/`). |
| M-15 | ⚠️ **The OFF-invariant guard has SIX arms / EIGHT subjects**, not five | arm 6 = WORKSPACE-DRIVEMODE (`workspaceDriveModeReadout`), landed M13.5 WP4; the pin asserts `armSubjects.length === 8` (`offInvariantGuard.test.ts:930`) plus a second count derived from the test file's **own source text** | ⚠️ **Corrects `arch.md`'s "arms 1–5 are TAKEN" line, which is stale.** A new supervisor surface owns a **SEVENTH** arm. ⚠️ The guard scans `src/**` only — **deliberately**, not a hole; backend OFF is enforced Rust-side by fail-closed `resolve_gate_enabled`. **Do not "fix" it to reach into `src-tauri/`.** |

**Design-priors consult.** Two fire; both are disclosed rather than silently applied:

- `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — bears on WP3's fire policy. The prior leans toward **legible** state over inferred state; the roadmap's decided policy is **fire silently, always**. These are in tension on the *legibility* axis. ⚠️ **Not auto-resolved either way** (weighting rule 4): the operator decided silent-always on 2026-08-14 *with the dissent sized*, and probe Q2 is the gate. Surfaced for the grill, not settled here.
- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` — bears on WP5. Any supervisor status/log surface must justify itself against the filmstrip, PiP, menu-bar and workspace header that already exist, and be scoped to the irreducible non-overlap. Applied in WP5's framing.

The **over-infer guard** is respected: no prior is stretched to the *mechanism* choices (typed graph vs parsed table, transcript vs hook) — those are technical/architecture tradeoffs and belong to `arch.md`, not `design-priors.md`.

---

## Operator rulings (grilled 2026-09-07 — decided, not to be re-litigated)

Four decisions taken at a `/util-grill-me` pass over this WBS. Each was expensive to reverse and not discoverable from the environment.

| # | Ruling | Consequence |
|---|---|---|
| **R-1** | ⚠️ **The STORED drive mode is the authority; Mode 0 is NOT honored as a suppressor.** If `projects.json` says `autopilot`, the supervisor enforces autopilot regardless of how the turn was entered. | **Resolves the M-6 near-refutation and unblocks WP3's sizing.** Honoring Mode 0 literally would suppress firing on ~all real sessions (only 3 of 206 carry a `/session-start` marker) and the milestone would ship dead. This makes Claudesk's stored value the authority — exactly the ownership boundary already decided 2026-08-14. ⚠️ **Accepted cost:** a deliberate one-step run gets chained; the recovery is CC's **Esc**. ⚠️ **Probe Q4 is therefore no longer a gate on WP3** — it is now an *opportunity* question (a discriminator, if found, refines R-1; its absence does not block). |
| **R-2** | ⚠️ **The recycle threshold is an ABSOLUTE TOKEN COUNT, not a percentage.** | **Deletes the model→window seam entirely** — the roadmap's own *"real, named maintenance seam — not free"*. Computable from data proven present (M-4). Tuned once against the real corpus. ⚠️ **Probe Q6 narrows** from *"how do we get the window?"* to *"what absolute number?"*. ⚠️ **The roadmap's "above 50%" is superseded** — correct it at WP5. Accepted cost: the number means less in a 200k-window session. |
| **R-3** | ⚠️ **Rebuild the fixture FRESH; the old counts are historical context, NOT the acceptance criterion.** Re-mine and label from scratch; judge the detector against the **new** labelled set. | Chasing the unverifiable "19" invites **fitting the detector to a list nobody can check**, and the original selection method is unrecorded. The naive pass already located 289 candidate stops, so the real population is knowable now. ⚠️ **Q1's success criterion is REWRITTEN** (see WP1). The checked-in labelled fixture is the durable asset either way — *"only a standing test is coverage."* |
| **R-4** | ⚠️ **The verdict lives in TYPESCRIPT; Rust does file IO only.** Rust reads the transcript (or exposes a command that does); TS owns the parse, the policy lookup, the verdict, and both actions. | **Resolves the M-13 fork for WP3 and WP4 together — task 3.0 is now DECIDED, not open.** Both fire paths already live in TS (`injectCommand`, `recycleSession`); needs **no** new backend→frontend IPC direction; keeps the policy graph single-sided so *"funnel every policy read through ONE function"* stays structurally easy. ⚠️ **Accepted cost:** the supervisor stops when the webview is gone — acceptable, since a workspace with no webview has no PTY to inject into. |
| **R-5** | ⚠️ **Q2's mechanism is the HYBRID: mechanical rule first, headless `claude -p` on the residual — NOT a regex.** The rule decides everything it can (token → policy row → dispatchable? → already chained?); the residual it declines, **plus the verify-human-adjacent fires** where 70% of wrong-fires concentrate, route to `claude -p` answering one question: *is this turn awaiting operator input?* **Structure picks who gets asked; the model answers what a regex cannot.** | **Supersedes the regex direction WP1 Phase 2 was drifting toward.** Measured: the question-mark predicate is noise (2% of true breaks vs 10% of wrong-fires); a reply-instruction regex catches only **7 of 30** wrong-fires at a cost of **4 of 43** true breaks, and needed a hand-tuned carve-out fitted to **4 records**. ⚠️ **A regex over natural-language tails IS a prose-reading adjudicator with worse judgment than an LLM** — the failure class this milestone exists to remove, re-introduced in a cheaper-looking form. ⚠️ **ACCEPTED COST:** `claude -p` becomes **load-bearing for correctness** on the Q2 slice, not just a cleanup tail. The demotion still holds for the dominant path (the rule decides ~1,900 of ~2,284), but **WP3 must treat the adjudicator as a first-class component with real failure handling** (slow / error / unavailable), not best-effort polish. ⚠️ This partially inverts §4's rationale for exempting the adjudicator from its own probe WP — **re-check that exemption at WP5.** |
| **R-6** | ⚠️ **WP3 is GO-WITH-CONDITIONS, not a clean GO.** Q2 came back `SEPARABLE` but on a **+1-record margin** (sonnet 25/29 against a ≥24 bar; haiku is NOT_SEPARABLE at 23/29), with only **70 of 96** records scorable. The **0.80/0.80 threshold is accepted as-is but is a CHOSEN bar, not a measured constant**, and **`sonnet` is PINNED** as the adjudicator. | **Three conditions travel with WP3:** (1) **pin the adjudicator model** and fail loudly on absence/change — a silent downgrade regresses the supervisor with no code change and no signal; (2) **bias the failure direction toward WITHHOLDING** — on adjudicator error/timeout/unavailability the supervisor must NOT fire, since "stays silent, operator nudges" is today's recoverable status quo while firing into an awaiting turn is unrecoverable (`injectCommand` has no retry, no pre-send cancel); (3) **re-measure on a larger labelled set before relying on the margin** (R-3 already established the fixture is rebuildable). ✅ **Not thin:** the hybrid's superiority over a regex is wide — 25/29 caught at a cost of 6/41 vs the best regex arm's 7/30 at a cost of 4/43. Only the pass/fail verdict is close. Accepted cost: **~3s per fire** on the critical path. |
| **R-7** | ⚠️ **WP2's typed graph does NOT couple to skill frontmatter — the enumerator/YAML parser is NOT built.** Also: Q6's threshold is **400,000 tokens as a tunable STARTING VALUE** (≤37.7% upper-bound firing rate), and Q4's **NO_DISCRIMINATOR is final** (no further search). | ⚠️ **Compatibility was never the blocker** — probe Q3a measured extra frontmatter keys as INERT, and **6 of 48 shipped skills already carry `allowed-tools`** in production. The reasons to decline are that it is **net-new** work (no scan exists to piggyback on: `skills_dir_exists()` answers one boolean and there is no YAML parser in either manifest — the roadmap's "same scan M13's registry already performs" is FALSE), it **reverses a recorded §4c anti-brittleness decision**, and **R-5 removed the motive** (the policy lookup already works from the transition token alone at 0 FP on the decidable population). ⚠️ **This CLOSES a design option** — disclosed and accepted. ⚠️ Q6's 400k is deliberately **not the median** (340,730 would churn runs that completed fine) and **not p90** (626,024 is too rare to earn the complexity); the real trigger also needs a **non-final phase boundary** AND the **feature workflow**, so observed firing is strictly lower than 37.7%. Next rung down if too eager: **500k (21.7%)**. |

## Work Packages

### WP1: Probe — does the mechanical rule actually decide real stops?  ✅ **SHIPPED 2026-09-12 (commit `446a033`)**
**Type:** probe
**Milestone:** 15
**Dependencies:** none — **FIRST. ⚠️ Nothing else in this milestone may be built before this reports.**
**Size:** M
**Timebox:** 1 session (hard stop; a second session means the answer is "the rule does not decide it cheaply", which is itself a reportable outcome)

**Learning objective:** Six questions, each of which changes the build. Q1–Q5 are the roadmap's, restated against the measurements above; **Q6 is new**, forced by M-5.

1. **What fraction of real stops does the mechanical rule decide?** Replay the corpus (M-2: 238 transcripts here) through a candidate detector. ⚠️ **Success criterion REWRITTEN per R-3: the detector is judged against a FRESHLY-LABELLED fixture, not against the roadmap's "19 / 46+5".** Those counts are **historical context** — they motivated the milestone and are not an acceptance target. **Success = on the new labelled set, every labelled break is flagged and no labelled legitimate pause is**, with precision/recall reported per edge id.
   ⚠️ **M-3 is the starting point, not the finish line**: a naive predicate flags **289 of 2,281**, so the deliverable is the *discriminating* predicate — and the discrimination lives in the **policy lookup**, which per M-8 needs the edge→step mapping first.
   ⚠️ **Why the old counts cannot be the criterion (R-3):** the 19 breaks and 46+5 pauses exist only as PROSE in `roadmap.md` — no fixture, no ID list, no mining script survived (searched: nothing under `workflow-system/`, `tooling/`, or any `*.json`/`*.csv`), and **the original selection method is unrecorded**. Chasing "the same 19" would mean **fitting the detector to a list nobody can verify**, and a near-miss reconstruction would present as a detector failure.
2. **Can a question-shaped / answer-awaiting tail be reliably identified?** ⚠️ **This gates silent firing.** 2 of 19 breaks ended in a question while the rule reads AUTO; firing there consumes the answer-slot and CC reads a slash command as the operator's reply.
3. **Skill-frontmatter state identity — does it work without breaking current behavior?** ⚠️ *"Must not break current behavior"* is a **stated constraint, not a hope**: prove an added frontmatter key is inert to the harness **and** to every skill's own parsing before the coupling is adopted.
   ⚠️ **The roadmap's premise that this rides "the same scan M13's registry already performs" is FALSE.** There is no registry and no scan: `skills_dir_exists()` (`workflow_substrate/mod.rs:121`) answers **one boolean** and enumerates nothing, and **no YAML parser exists in either manifest**. So this question also carries: *is a skill enumerator + frontmatter parser worth adding at all?* ⚠️ Adding one **reverses a recorded §4c anti-brittleness decision** (the command name is the only stable cross-repo coupling; a path is not) — a decision, not an implementation detail.
4. **Mode 0 / direct invocation — is there a discriminator worth having?** ⚠️ **DOWNGRADED FROM A GATE TO AN OPPORTUNITY BY R-1.** The stored mode is now the authority, so a null result here **does not block WP3**: if no discriminator exists, the supervisor enforces the stored mode and accepts that a deliberate one-step run may be chained (recovery = Esc). If a *cheap, reliable* signal does exist, it refines R-1 — report it; do not build on it speculatively. ⚠️ **Do NOT re-derive R-1 from M-6's numbers** — the operator has already weighed exactly that tradeoff.
5. **Idempotency — can the supervisor tell CC already chained correctly?** The mechanical check is redundant *by intent* with mccc's still-live prose (the no-Claudesk floor), so both will often be right at once. Must never fire a duplicate.
6. ⚠️ **NARROWED BY R-2 — what absolute token count is the right threshold?** The *form* is settled: an **absolute count**, no percentage, no window (R-2 deletes the model→window seam that M-5 refuted). What remains is empirical and cheap: from the corpus, at what used-token level does a session's remaining runway stop covering a typical phase? ⚠️ **Do not re-open the percentage** — and note the roadmap's "above 50%" is superseded, corrected at WP5.

**Success criterion:** a written probe report answering all six, each with the evidence that decided it, plus **an explicit GO/NO-GO/RESHAPE recommendation per downstream WP**. A probe that answers 4 of 6 and says so is a success; one that guesses at the other 2 is a failure.

**Tasks:**
- [x] 1.1 **Build the fixture FRESH (R-3)** — mine + label from scratch: an addressable list (session file + turn index + edge id + expected verdict), persisted as a **checked-in regression fixture**. ⚠️ Label the verdict from the policy row, **not** from how the turn reads — wrongful stops and legitimate pauses are *textually indistinguishable* (the milestone's load-bearing finding). ⚠️ Prerequisite for Q1 being checkable at all.  — ✅ DONE — `wp1-break-fixture.json`, 2,284 records, labelled from the policy row
- [x] 1.1b Report the new population against the historical 19/46+5 as **context**, and say plainly where they diverge — without treating divergence as failure.  — ✅ DONE — fresh 96/36 vs historical 19 reported as CONTEXT; operator accepted 96/36 as the baseline
- [x] 1.2 Build the candidate detector as a **throwaway script** (not shippable code — WP3 owns the real one), run it over the fixture, record precision/recall against both arms.  — ✅ DONE — 96 flagged, 0 FP / 0 FN; naive control 119/23 in the same run
- [x] 1.3 Q2 — attempt question-shaped-tail detection; report whether the 2 known cases are separable, with the false-positive/negative rate.  — ⚠️ DONE but RESHAPED by R-5 — "question-shaped tail" was REFUTED as the discriminator (2% vs 10%, noise); answered via the hybrid instead: `Q2_VERDICT: SEPARABLE` on a +1-record margin
- [x] 1.4 Q4 — look for a cheap Mode-0 discriminator. ⚠️ **A null result is an acceptable answer (R-1)** and blocks nothing; report and move on.  — ✅ DONE — `Q4_VERDICT: NO_DISCRIMINATOR` (3 markers vs 175 chaining sessions); blocks nothing per R-1, final per R-7
- [x] 1.5 Q5 — determine an idempotency signal (did a `Skill` call already land for this edge?).  — ✅ DONE — 1,675 already-chained; a solved lookup, but ONLY with the corrected chain window
- [x] 1.6 Q3 — add a throwaway frontmatter key to a scratch skill copy; prove inertness to the harness and to the skill's own parse.  — ⚠️ DONE, and the ANSWER INVERTED THE TASK — inertness proven (INERT, 6 checks; plus 6 of 48 shipped skills already carry `allowed-tools`), but R-7 rules **do NOT build the enumerator**
- [x] 1.7 Q6 — recommend the **absolute token threshold** value from corpus evidence (form already settled by R-2).  — ✅ DONE — **400,000 tokens** as a tunable starting value (R-7), expressed as a ≤37.7% upper-bound firing rate
- [x] 1.8 Write the probe report + per-WP GO/NO-GO/RESHAPE.  — ✅ DONE — `wp1-probe-report.md`; all 6 questions answered on evidence, 4 per-WP recommendations

---

**WP1 → WP2 rationale:** the probe is the only WP whose output is knowledge, and **four** of its six questions change what WP2–WP5 *are* (Q1 the detector's shape, Q4 whether WP3 may fire silently at all, Q6 whether WP4 has a computable threshold, Q3 whether the graph couples to skill frontmatter). Building the typed graph first would be the least-wasteful wrong order — the graph is needed regardless — but its **edge→policy keying** (M-8) is exactly what Q1 needs to discriminate, so the probe would be blocked on WP2 anyway. Probe first, and let Q1's replay use a throwaway lookup.

---

### WP2: The state machine as executable code  ✅ **SHIPPED 2026-09-12 (commits `938750e` + `2c08459`)**
**Description:** States, edges, the AUTO/PAUSE matrix and the four drive modes become a **typed model in Claudesk** rather than a markdown table Claudesk parses at runtime. Includes the **edge→policy-row derivation** (M-8) and the exhaustiveness tests a prose-grep cannot express.
**Milestone:** 15
**Dependencies:** WP1 (Q3 decides whether the graph couples to skill frontmatter; Q1 validates the lookup the detector will use)
**Size:** L

✅ **WP1 REPORTED — GO, with two MANDATORY structural corrections and one thing explicitly NOT built (2026-09-12):**
1. ⚠️ **`dispatchable_target` must be a per-edge property held SEPARATELY from the 5-value policy cell.** An `AUTO` cell does **not** imply there is anything to fire into. Labelling on the cell alone marked **223** breaks, most of them terminal/SURFACE/meta-op edges (`S20`, `S17`, `F19`, `F30`, `P13`, `S6`); adding this took **223 → 127**. Without it WP3 injects commands into workflows that have already ended.
2. ⚠️ **`F3`/`F4` (spec exits) are the cheap regression sentinel for a policy-lookup bug — NOT `F10`/`F13`/`F19`.** All 23 of the naive predicate's false positives are spec exits (F4 20, F3 3), which PAUSE in Mode 3; `F10`/`F13`/`F19` contribute **zero** FPs on either arm.
3. ⚠️ **DO NOT build the skill enumerator / frontmatter coupling (R-7).** Task 2.x must not depend on skill frontmatter.

⚠️ **Do NOT model the cells as booleans.** M-7: 5 cell values across ~356 cells, plus Mode 0 which is not one of the four modes. `AUTO-SKIP` is *conditional* (verify-human: no integration boundary **and** verify-self all-PASS); `SKIP (entire skill)` removes a state in Mode 4; `F17b` routes ship **around** a skipped state.

⚠️ **The recurring local defect shape applies directly** (`arch.md` → Verification method, hit four times): *a mechanism correct in itself behind a caller that does not honor it.* **Enumerating the cells as data makes the SET testable but does NOT prove each cell has a CALLER.** Funnel every policy read through **ONE** function and guard *that*.

⚠️ **Extraction hazard (M-9):** `transitions.md` interleaves mccc's intra-turn semantics with the graph. The 2 `behavior-within-state` rows (the drive-mode-conditional `session-capture` gate; the reflect candidate filter) **stay upstream** — absorbing them would cross the ownership boundary.

**Tasks:**
- [x] 2.1 Type the states + edges per workflow (5 workflows: product, feature, task, incident, session-ops).
- [x] 2.2 Type the policy cell as a **sum type** over the 5 values, with `AUTO-SKIP`'s condition modeled as data, not a comment.
- [x] 2.3 Model Mode 0 explicitly as a mode-like input that is **not** one of the four.
- [x] 2.4 ⚠️ Build the **edge→policy-row mapping** (M-8: 19 of 27 feature rows key on a step, 8 on an edge id) and make the ambiguous cases explicit rather than guessed.
- [x] 2.5 Funnel every policy read through ONE function; add the **caller-side** guard (per the standing trap — extracting the machine does not prove the caller).
- [x] 2.6 Exhaustiveness test over (state × mode) cells.
- [x] 2.7 Port mccc `check-structure.sh` **Phase 3d** (the `TRANSITION:` regex contract) — mccc keeps its copy while skills still emit the token.
- [x] 2.8 Port **Phase 18** (the boundary auto-chain pin).
- [~] 2.9 Hand off to mccc: **Phase 9 DISAPPEARS** (it exists only to keep 4 `AGENTS.md` copies in sync; once Claudesk owns the graph the duplication it polices is gone). ⚠️ A genuine simplification, not a transfer — and a **cross-repo** item.  
  ⚠️ **CLAUDESK'S HALF DONE; mccc's EDIT IS NOT.** The hand-off note is written and committed here (`HANDOFF-to-mccc-m15-wp2.md`, 96 lines) with the evidence, the port/no-port table and a suggested order. ⚠️ **Deliberately NOT ticked `[x]`** — Phase 9 still exists in mccc, and the deletion must be made from a session rooted in that repo (every `~/.claude/skills/` entry is a symlink into it, so editing from here silently dirties a different git repository). ⚠️ **A `[x]` here would tell a downstream planning skill the duplication is gone when it is not.** Carries one open question for the operator: should `I2` (report → triage) PAUSE or AUTO?

**WP2 → WP3 rationale:** the detector's verdict *is* a policy lookup, so the typed graph is a hard build-dependency, not merely a tidier home for the table. Writing the detector against a hand-rolled lookup would mean writing the mapping (2.4) twice and shipping the throwaway one.

---

### WP3: Break detection + auto-fire across all open workspaces  ✅ **SHIPPED 2026-09-13 (commit `e186e33`)**
**Description:** On CC turn end, Claudesk reads the transcript, applies the rule, and — where policy says AUTO and the turn did not chain — **injects the next command**, in **every** open workspace rather than only the focused one.
**Milestone:** 15
**Dependencies:** WP1 (**Q2 gates the fire policy** — Q4 no longer does, per R-1), WP2 (the policy lookup)
**Size:** L

⚠️ **WP1 REPORTED — GO-WITH-CONDITIONS (R-6, 2026-09-12). The three conditions are BINDING, not advisory:**
1. ⚠️ **Pin the adjudicator model** and fail loudly on absence/change. `haiku` is NOT_SEPARABLE on identical data, so a silent downgrade regresses the supervisor with **no code change and no signal**.
2. ⚠️ **Bias the failure direction toward WITHHOLDING.** On adjudicator error/timeout/unavailability the supervisor must **NOT fire** — "stays silent, operator nudges" is today's recoverable status quo; firing into a turn awaiting an answer is not.
3. ⚠️ **Re-measure on a larger labelled set before relying on the margin** (+1 record; only 70 of 96 scorable).

**Plus three measured implementation constraints:**
- ⚠️ **Route EVERY fire candidate to the adjudicator**, not just the verify-human-adjacent class — the narrow router sends 40 of 96 and **misses 10 of 32** awaiting-turns. The 70%-concentration finding is a *density* fact, not a *coverage* fact.
- ⚠️ **The chain-detection window must not close early** on an intervening tool call or a re-quoted `TRANSITION:` token (proven case: `06eb0e92` turn 504 chained at line 511 after two `Bash` calls). Only a real **user prose turn** ends it.
- ⚠️ **The supervisor reads its own writes** — the corpus is live and includes the supervising session's transcript (observed drifting 2282 → 2284 → 2286 in one session). Key "have I already fired?" on the **turn**, never a corpus-wide count.

⚠️ **ONE CONDITIONAL REMAINS, AND IT IS Q2 ONLY.** The roadmap's instruction stands: *"if a question-shaped tail cannot be excluded, revisit the fire policy before building this deliverable, do not build it anyway."* ✅ **The Q4/Mode-0 conditional is CLOSED by R-1** (stored mode is the authority). So the single open gate on this WP is whether an answer-awaiting tail can be detected.

- **Fire policy as decided (2026-08-14):** silently, always. ⚠️ **Dissent recorded and sized:** ~2-in-19 breaks were question-shaped; a wrong fire on an unwatched workspace consumes an answer-slot with **no record that a question was asked**. `[PRIOR: explicit-selectable-mode-over-inferred-mode]` leans against silence on the legibility axis — surfaced, not auto-applied.
- **Evidence source:** the transcript JSONL (M-1, M-2). ⚠️ **This does NOT violate the no-PTY-scraping rule** — that rule forbids inferring state from *terminal output*; this reads CC's own structured log. ⚠️ **NOT the xterm buffer.**
- ⚠️ **The uuid↔workspace mapping is NEW** and non-trivial: `WorkspaceRegistry` is a **1:1 `by_path` map** and `resolve_cwd` (longest-path-ancestor, `status_broadcaster/mod.rs:352`) returns a **single** id, so two CC sessions in one tree are indistinguishable (`SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS`). ⚠️ **The CC `session_id` that WOULD disambiguate arrives at `hook_socket/mod.rs:74` and is dropped before the DTO** — `WorkspaceStatusUpdate` has no such field. Threading it through is the fix, and it is net-new.
- ✅ **The turn-boundary trigger EXISTS — consume it, do not build it (M-12).** `is_turn_start` is already on the wire and already consumed raw by `XtermPane.tsx:343`. ⚠️ **Read the RAW event stream, never the folded map** (the seam's own doc says so). ⚠️ It marks turn **start**; the turn-**end** correlate is `Stop`, and per `[[derived-state-is-not-a-proxy-for-its-event]]` a consumer needing *"event X arrived"* must match **every** state X can map to — `Stop` maps to **both** `Idle` and `BackgroundWork`. Matching only `Idle` is the shipped-CRITICAL shape.
- ⚠️ **A turn ending in `BackgroundWork` gets no completion event (M-14).** Do not wait for one; do not add a PID-polling watchdog (probed and rejected).
- ✅ **THE VERDICT LIVES IN TYPESCRIPT (R-4) — fork DECIDED, no longer open.** Rust does **file IO only** (read the transcript / expose a command that does); TS owns the parse, the policy lookup, the verdict, and both actions. **No new backend→frontend IPC direction is built.** ⚠️ Keeps the policy graph **single-sided** so *"funnel every policy read through ONE function"* stays structurally easy — the fix for the defect shape hit four times here. ⚠️ Accepted: the supervisor stops when the webview is gone (a workspace with no webview has no PTY to inject into).
- **Injection** goes through **`injectCommand(sessionId, command, onIpcError?, label)`** (`autoResumeFire.ts`) → `invoke("cc_input", …)` → the Rust chokepoint `slash_command_bytes` (`cc_session/mod.rs:266`), which appends exactly one `\r` (CR is Enter; `\n` **silently types-but-doesn't-run**). ⚠️ **The `invoke` MUST have a `.catch`** — an unhandled Tauri rejection vanishes silently. ⚠️ **Pass a distinct `label`** — reuse without one misattributed failures once already. ⚠️ **There is NO RETRY, deliberately, and no pre-send cancel window** — detecting "it did not land" would require reading CC's output, which `arch.md` forbids; the only mitigation for a wrong fire is CC's own **Esc** (which *interrupts a running command*). ⚠️ **That is precisely why probe Q2 gates silent firing: a wrong silent fire on an unwatched workspace is unrecoverable by design.**
- ⚠️ **Do NOT raise the shared `INJECT_SETTLE_MS`** (1500 ms) — the settle's *starting line* matters more than its value (the M12/v0.3.3 defect), and the 350 ms cliff **moved up** between measurements. ⚠️ **`cc_ready` is NOT a CC-readiness signal** — two independent readers already got that wrong.
- **Residual adjudicator:** a headless `claude -p`, **DEMOTED to the ambiguous tail** (no transition token / rule cannot decide). ⚠️ **NOT the primary mechanism** — an LLM adjudicator is itself a model-judgment component that can drift, which is the failure class this milestone exists to remove.

**Tasks:**
- [x] 3.0 Record R-4 (TS verdict, Rust file-IO-only) in `arch/` as the supervisor's boundary. ⚠️ **Decision already made — implement it, do not re-open it.**
- [x] 3.1 Turn-end detection built on the **existing** `is_turn_start` seam, read off the **raw** stream; match **every** state `Stop` can map to (`Idle` **and** `BackgroundWork`).
- [x] 3.2 uuid↔workspace mapping: thread the hook's `session_id` through to the DTO (dropped today) so two sessions in one tree are distinguishable.
- [x] 3.3 Transcript reader: last-assistant-line parse, `TRANSITION:` extraction, last-content-block classification.
- [x] 3.4 Verdict = the WP2 lookup + the idempotency check (WP1 Q5).
- [x] 3.5 Fire via `slash_command_bytes`; honor the prompt-flush invariant and the settle's ordering.
- [x] 3.6 Fan out across **all** open workspaces, not only the focused one.
- [x] 3.7 The ambiguous-tail `claude -p` adjudicator, behind the mechanical path.
- [x] 3.8 ⚠️ **The negative arm, asserted as hard as the positive:** a legitimate `verify-human` PAUSE, an `ESCALATE`, and a **Mode-0 direct invocation** each produce **no fire at all**.

**WP3 → WP4 rationale:** WP4 is a *second consumer* of WP3's turn-end trigger and transcript reader, differing only in what it does at the boundary (recycle instead of chain). Building WP4 first would mean building the trigger for the harder-to-verify case, with no working chain to compare against.

---

### WP4: Context-pressure recycle at phase boundaries
**Description:** Above a context-pressure threshold, Claudesk still auto-chains as usual **except** at a **phase boundary that is not the last phase**, where it instead **recycles the session** (handoff → fresh CC → restore), carrying the workflow forward in a clean context.
**Milestone:** 15
**Dependencies:** WP3 (the turn-end trigger + transcript reader), WP1 **Q6** (the threshold's *value*)
**Size:** M

✅ **WP1 REPORTED — GO. The VALUE is now settled too: 400,000 tokens (R-7), a TUNABLE STARTING VALUE, not a derived constant.** Fires on **≤37.7%** of sessions as an **upper bound** — the real trigger additionally requires a **non-final phase boundary** AND the **feature workflow**, so observed firing is strictly lower. Deliberately not the median (340,730) and not p90 (626,024). Next rung down if too eager: **500k (21.7%)**.

✅ **THE THRESHOLD IS AN ABSOLUTE TOKEN COUNT (R-2) — form settled; only the value is probe-gated.** ⚠️ **The roadmap's "above 50%" is SUPERSEDED** and there is **no model→window map to build or maintain** — M-5 refuted its derivation (`claude-opus-5` at 833k, no `[1m]` marker in 238 transcripts) and R-2 removes the need for it. Accepted: the number carries less meaning in a 200k-window session.

- ⚠️ **`npx ccstatusline` is NOT the mechanism** — Claudesk must not shell out to a third-party npm package per turn when the data is one file read away.
- **Phase boundary = the Work Tree's `Phase N` nodes** ⇒ ⚠️ **FEATURE-WORKFLOW-ONLY** (operator confirmed). Task/incident/product have no phase structure; auto-chain enforcement still applies to them.
- **Claudesk parses WIP files** to know whether a later phase exists — a **new capability** (today it only watches `.session.md`).
- ✅ **M13's Recycle is programmatically callable (M-10)** — `recycleSession()` exported, one UI caller today (`Workspace.tsx:550`). This WP is the planned second, and the module header says it was built for exactly this.
- ⚠️ **DESIGN FORK, named not guessed (M-13): where does the verdict live?** `recycleSession()` is **TS-only** and needs caller-owned React state (`relaunch`, `awaitFreshSessionId`); there is **no Rust recycle command**. So either the supervisor's verdict is computed in **TS** (reuses the existing caller directly), or in **Rust** (and then a **new backend→frontend IPC direction** is required, which does not exist today). ⚠️ This same fork governs WP3 — decide it **once**, at WP2/WP3 time, not twice.
- ⚠️ **Recycle's abort semantics were hardened *for this caller*:** it fires with **no human watching**, which widened a rare race into unattended silent flag corruption. **On abort after a successful handoff but before respawn, the clean mark STAYS** — by decision. There is deliberately **no `mark_unclean` primitive**; this site is exactly where one looks tempting.
- ⚠️ **CROSS-REPO (mccc):** the **Work Tree format must be ENFORCED, not just documented** — mccc adds a `check-structure.sh` phase pinning the schema so Claudesk's parser is a **contract-reader**, not a guesser. Hand off **before** this WP is built.

**Tasks:**
- [ ] 4.1 Context-pressure read from the last assistant line (`input + cache_read + cache_creation`) — ⚠️ **LAST line only, never summed**.
- [ ] 4.2 Absolute-token threshold at Q6's recommended value (R-2). ⚠️ **No window lookup, no model→window table.**
- [ ] 4.3 WIP-file phase parser (contract-reader against mccc's pinned schema).
- [ ] 4.4 The boundary rule: non-final phase boundary + over threshold → recycle; else chain.
- [ ] 4.5 Gate to the **feature workflow only**.
- [ ] 4.6 Wire `recycleSession()` as the second caller; verify the abort/flag asymmetry holds unattended.
- [ ] 4.7 Cross-repo handoff to mccc for the Work Tree schema phase.

---

### WP5: Milestone exit verify
**Description:** Verify M15's exit criteria against the **decision**, not against a stored value; resync the `arch/` subsystem docs; confirm the gate posture.
**Milestone:** 15
**Dependencies:** WP2, WP3, WP4
**Size:** S

✅ **WP1 REPORTED — GO. WP5 inherits SIX upstream doc corrections** (enumerated in `archive/milestone-15-workflow-supervisor/wp1-probe-report.md` → P5.4), including **one the probe itself created**: ⚠️ **R-5 partially inverts §4's rationale for exempting the `claude -p` adjudicator from its own probe WP** — the adjudicator is no longer purely off the dominant path, it is **load-bearing for correctness** on the Q2 slice. §4's own text says that inversion would require a probe. **Re-check the exemption at WP5.**

⚠️ **Verified against the DECISION, not a stored value** — the deliverable is an *enforcement* decision, so "the graph is modeled" is an insufficient exit check. The criterion is that a break is **caught and corrected end-to-end**.

⚠️ **The gate arm question is live, and the count is SEVEN not six (M-15).** `arch.md`'s *"arms 1–5 are TAKEN"* line is **stale** — arm 6 (WORKSPACE-DRIVEMODE) landed at M13.5 WP4, and the guard now pins **6 arms / 8 subjects** (`offInvariantGuard.test.ts:930`). A new supervisor surface therefore owns a **SEVENTH** arm, and the arm-count pin must be bumped in the same change. ⚠️ **`WORKFLOW_TERMS` is `["workflow","docs","skill","drivemode","drive-mode"]` — it contains neither `"recycle"` nor `"session"`**, so a `RECYCLE_SESSION`-style menu id or panel registers **unseen** by arms 1–3 (`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`). **`arch.md` names M15's supervisor as the likely author of exactly such a surface.** ⚠️ **Probe each arm INDIVIDUALLY** — a composite bypass trips *some* arm and hides a gap. ⚠️ **The guard scans `src/**` only, deliberately** — backend OFF is fail-closed Rust-side; **do not "fix" it to reach into `src-tauri/`**. ⚠️ **Naming constraint:** do not export any identifier containing `Chord` from a workflow-coupled module (arm 3 selects by exported identifier).

⚠️ **Any supervisor status/log surface must earn its place** — `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]`: justify against the filmstrip, PiP, menu-bar and workspace header, and scope to the irreducible non-overlap.

⚠️ **A stale `arch/` doc OUTRANKS a correct record** (M13.5 lesson #2) — `CLAUDE.md` declares the `arch/` set the authority, so a lagging doc is *live spec asserting a refuted model*. The resync is **mandatory, not conditional**.

**Tasks:**
- [ ] 5.1 Live multi-workspace run: a real AUTO-policy turn that stops is detected and fired **without operator input**.
- [ ] 5.2 Corpus replay green against the WP1 fixture (all known breaks flagged, zero known-legitimate pauses).
- [ ] 5.3 Negative arm live: legitimate `verify-human` PAUSE, `ESCALATE`, Mode-0 → **no fire**.
- [ ] 5.4 Context-pressure recycle observed at a non-final phase boundary.
- [ ] 5.5 Gate posture: decide whether a 6th arm is owed; if a surface ships, add and **individually** mutation-prove it. Consider widening `WORKFLOW_TERMS`.
- [ ] 5.6 ⚠️ Resync `arch/` — new subsystem doc for the supervisor + edit the subsystems it changes (`session-resumption`, `status-channel-and-surfaces`, `workflow-gate`). **Do not add a milestone section to `arch.md`.**
- [ ] 5.7 Update `CLAUDE.md` (the supervisor's load-bearing constraints) and the M-5/M-6 refutations so they are not re-derived.

---

## Dependency map

```
WP1 (probe)  ──┬──> WP2 (typed graph) ──> WP3 (detect + fire) ──> WP4 (context recycle) ──> WP5 (exit verify)
               │         ▲                      ▲                       ▲
               │         │ Q3 (frontmatter)     │ Q1, Q2, Q5            │ Q6 (threshold VALUE)
               └─────────┴──────────────────────┴───────────────────────┘
   ✅ **NO LIVE GATE REMAINS — WP1 REPORTED 2026-09-12.** Q2 is answered: `SEPARABLE`, via the R-5 hybrid
   (mechanical rule + `claude -p`), NOT the "question-shaped tail" the gate was originally framed around.
   ⚠️ WP3 is **GO-WITH-CONDITIONS** (R-6), not a clean GO — the verdict rests on a **+1-record margin**.
   ✅ CLOSED by the grill: Q4/Mode-0 (R-1) · threshold form (R-2) · fixture criterion (R-3) · verdict home (R-4).
   ✅ CLOSED by the probe: Q2's mechanism (R-5) · WP3's disposition (R-6) · Q3b/Q6/Q4 (R-7).
```

**Critical path:** WP1 → WP2 → WP3 → WP4 → WP5. Fully serial; **no parallel track**. That is a property of a probe-gated milestone, not an oversight — every WP consumes a probe answer, and WP3/WP4 share a trigger.

**The one shortenable edge:** WP2's tasks 2.7–2.9 (the `check-structure.sh` port + the Phase-9 cross-repo handoff) are independent of WP3/WP4 and can land any time after 2.4. WP4's task 4.7 (the mccc Work Tree schema handoff) should be **sent early** — it is a cross-repo dependency with someone else's latency, so it belongs at WP2 time even though it is consumed at WP4.

## Reordering / rule-deviation notes

- **§3 standard ordering** (env → 3rd-party probes → UI mockups → sync backend → async) applies only loosely: there is no new environment, no external API, and no new UI flow. The one clean mapping is **probe-before-build**, honored strictly (WP1 gates all).
- **§4 third-party integration rule:** the `claude -p` residual adjudicator (WP3 task 3.7) is an external-process integration. It does **not** get its own probe WP because it is deliberately **off the dominant path** (ambiguous tail only) and its I/O shape is a plain prompt+text response already exercised elsewhere in this project. ⚠️ **Written rationale as the rule requires** — if the probe demotes the mechanical rule and promotes the adjudicator, that inverts the argument and the adjudicator **would** need its own probe.
- **§5 orchestration ordering:** WP3's fan-out across all workspaces is the async/orchestration layer over a single-workspace verdict. It is **not** split into its own WP because the verdict path is pure and per-workspace by construction, so the fan-out is a loop, not a wrapper — and the roadmap's decision is explicitly that the multi-workspace case *is* the feature (attention across parallel projects is the scarce resource). Splitting would ship a single-workspace supervisor that meets no exit criterion.

## Open items (still undecided after the grill)

1. ✅ **RESOLVED by WP1 (2026-09-12).** ~~WP3's fire policy remains probe-conditional on Q2 alone.~~ Q2 answered `SEPARABLE` — but ⚠️ **the "question-shaped tail" framing was REFUTED** (a trailing-`?` predicate fires on 2% of true breaks vs 10% of wrong-fires — noise). **R-5** set the mechanism (mechanical rule first, `claude -p` on the routed population; a regex over prose IS the drift-prone adjudicator this milestone removes). **R-6** set the disposition: **GO-WITH-CONDITIONS** on a **+1-record margin** (sonnet 25/29 against a ≥24 bar; haiku 23/29 is NOT_SEPARABLE on identical data). ⚠️ `injectCommand`'s no-retry/no-cancel property still stands, which is exactly why R-6 condition 2 requires the failure direction to bias toward **withholding**.
2. ✅ **RESOLVED by WP1 + R-7 (2026-09-12).** The premise was confirmed false by measurement (`skills_dir_exists()` answers one boolean and enumerates nothing; no YAML parser in either manifest). ⚠️ **Compatibility was never the blocker** — extra frontmatter keys measured **INERT**, and **6 of 48 shipped skills already carry `allowed-tools`** in production. The product answer is **DO NOT BUILD the enumerator**: it is net-new work, it reverses the §4c decision, and **R-5 removed the motive** (the policy lookup works from the transition token alone at 0 FP). **WP2 does not couple to skill frontmatter.**
3. **No vision success metric covers M15.** Group C closed at M13 with all six met. M15 is roadmap-and-evidence-driven, not metric-driven — worth a conscious decision on whether a 7th metric is owed. **Not grilled** (cheap to add later; fails clause (c)).
4. ⚠️ **`arch.md`'s guard-arm count is stale** (says arms 1–5; the guard pins 6 arms / 8 subjects). Corrected at WP5 — flagged here because the same stale line could mislead WP5's own planning.

**Closed by the grill (R-1…R-4):** Mode-0 handling · the threshold's form · the fixture's acceptance criterion · the verdict's home.

**Closed by the WP1 probe (R-5…R-7):** Q2's mechanism (the hybrid, not a regex) · WP3's disposition (GO-WITH-CONDITIONS) · Q3b (no enumerator) · Q6's value (400k, tunable) · Q4 (NO_DISCRIMINATOR, final). ⚠️ **Items 3 and 4 above remain OPEN** — the 7th-metric question and `arch.md`'s stale guard-arm count, both for WP5. See **Operator rulings** above and `archive/milestone-15-workflow-supervisor/wp1-probe-report.md`.

## Corrections this WBS pass makes to upstream docs

Recorded so they are not re-derived, and because **a stale `arch/` doc outranks a correct record** (M13.5 lesson #2 — `CLAUDE.md` declares the `arch/` set the authority, so a lagging doc is live spec asserting a refuted model):

| Claim | Where it lives | Status |
|---|---|---|
| *"`message.model` is on the line so [the window] is derivable"* | `roadmap.md` → M15 deliverable 4 | ⚠️ **REFUTED** (M-5): `claude-opus-5` observed at 833k with **no `[1m]` marker anywhere** in 238 transcripts. |
| *"Claudesk reads them on the same scan M13's registry already performs"* | `roadmap.md` → M15 probe Q3 | ⚠️ **FALSE** (survey §6): no registry, no scan, no YAML parser. |
| *"arms 1–5 are TAKEN"* / *"a SIXTH guard arm"* | `arch.md` → load-bearing constraints | ⚠️ **STALE** (M-15): 6 arms / 8 subjects since M13.5 WP4; a new surface owns the **seventh**. |
| *"the corpus is the test fixture"* implying a fixture exists | `roadmap.md` → M15 probe Q1 | ⚠️ **The corpus exists; the LABELLED FIXTURE does not.** The 19 breaks + 46+5 pauses are prose only, and the selection method is unrecorded. **R-3: rebuild fresh; old counts are context, not criterion.** |
| *"Above **50% context usage** …"* | `roadmap.md` → M15 deliverable 4 | ⚠️ **SUPERSEDED by R-2** — the threshold is an **absolute token count**; no percentage, no window map. |
| Q2 framed as *"question-shaped tail detection"* | `roadmap.md` → M15, `wbs.md` → WP1 Q2 | ⚠️ **REFRAMED by R-5 (WP1, 2026-09-12)** — a trailing-`?` predicate is noise (2% of true breaks vs 10% of wrong-fires). The discriminator is an **instruction-to-reply**, and the mechanism is the **hybrid**, not a regex. |
| §4's rationale exempting the `claude -p` adjudicator from its own probe WP | `wbs.md` → Reordering / rule-deviation notes | ⚠️ **PARTIALLY INVERTED by R-5** — the adjudicator is now **load-bearing for correctness** on the Q2 slice, not merely off the dominant path. §4 says that inversion would need a probe. **Re-check at WP5.** |

⚠️ **These are corrected in `roadmap.md`/`arch.md` at WP5 (task 5.6/5.7), not now** — a WBS pass records findings; the durable-doc resync is the milestone's own exit step. **Do not leave them uncorrected at close.**

## Session Handoff — 2026-09-13 12:05
Handed off. See `workflow-system/state/.session.md` to restore.
