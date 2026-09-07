---
stage: context
state: complete
updated: 2026-09-07
---

# Context

Project CLAUDE.md generated at `CLAUDE.md` (project root).

**Active milestone:** Milestone 15 — Workflow supervisor (decomposed 2026-09-07 into 5 WPs at `workflow-system/product/wbs.md`). Claudesk absorbs the workflow state machine as typed code and enforces auto-chaining mechanically, triggered by a measured 10x regression in auto-chain adherence (0.36 → 3.63 breaks per 100 `Skill` invocations). ⚠️ **Fully serial critical path — no parallel track**, a property of probe-gating rather than an oversight.

**First feature:** **WP1 — Probe** (six questions: detector precision · question-shaped tail · skill-frontmatter identity · Mode-0 detectability · idempotency · the absolute-token threshold value). ⚠️ **It gates WP2–WP5 absolutely — nothing else in the milestone may be built before it reports.** Size M, timeboxed to one session; a probe that answers 4 of 6 and says so is a success, one that guesses at the other 2 is a failure.

**Entry point:** WP1 is a probe, not a feature — it fails the small/simple criteria on "no architectural decisions required" (its answers reshape three downstream WPs), so it wants `/feature-spec` if run through the feature workflow. In practice a probe WP is usually driven directly.

## What this pass changed

- **`CLAUDE.md` → `## Current Milestone`** rewritten from "M14 next, M15 not decomposed" to the as-decomposed 5-WP reality. Now carries the **four operator rulings** (R-1 stored-mode authority · R-2 absolute-token threshold · R-3 rebuild the fixture fresh · R-4 verdict in TypeScript), each with its accepted cost, and the **two refuted design premises** (below).
- **`CLAUDE.md` → the M14 status line corrected.** M14 is **SPLIT**: its release half shipped as v0.4.0; Settings UI, Developer-ID signing/notarization, two-tier setup docs and repo metadata are open and now scheduled **after** M15. ⚠️ Recorded explicitly that the 2026-08-26 "M14 → M15" reversal is **SPENT, not overturned** — its whole argument was ~40 undelivered commits ahead of `v0.3.4`, and v0.4.0 delivered them. That framing exists to stop a future session "restoring" the older order by citing the note.
- **`CLAUDE.md` → `## Next Milestone` retitled `## Milestone 15 — the active cycle`** and given the measured size of what WP2 absorbs (113 transition rows · 89 pause-policy rows · ~356 cells · 5 cell values + Mode 0), plus a new **as-built seams** paragraph distinguishing what already exists (`is_turn_start`, `fs-change` over `.session.md`, `recycleSession()`, `injectCommand`) from what does not (transcript reader, slug computation, uuid↔workspace mapping, WIP-body parsing).
- **`CLAUDE.md` → guard-arm count corrected** to **six arms / eight subjects**, with the note that a new gated surface owns the **seventh** — and that `arch.md`'s "arms 1–5 are TAKEN" line is **stale**.
- **New `docs/lessons/closed-cycles-m13-m13-5.md` (5.8k)** — the eight M13/M13.5 "must NOT re-derive" properties **extracted, not dropped**, replaced in `CLAUDE.md` by a pointer that names the four still binding M15. Follows the established pointer-plus-lesson-file pattern.

## Two design premises refuted by measurement this pass

Both were live spec in `roadmap.md` and would have been built on:

1. ⚠️ **`message.model` cannot determine the context window.** `claude-opus-5` observed at **833,567** tokens and `claude-opus-4-7` at **268,743**, with **no `[1m]` suffix anywhere in 238 transcripts** (a `<synthetic>` value also occurs). The roadmap's *"`message.model` is on the line so it is derivable"* is wrong. **R-2 removes the need for the map entirely.**
2. ⚠️ **There is no skill scan or registry to piggyback on.** Probe Q3's premise (*"the same scan M13's registry already performs"*) is false — `skills_dir_exists()` answers one boolean and enumerates nothing; no YAML parser exists in either manifest. Adding one **reverses a recorded §4c anti-brittleness decision**, making Q3 partly a product question.

Also measured, and recorded so it is not re-derived: a **naive** detector flags **289 of 2,281** transition-emitting turns (~15x over-flagging), so **the policy lookup, not the token parse, is the hard half**; and **policy rows key on STEP, not transition ID** (19 of 27 feature rows), so the edge→policy-row mapping is derivation work.

## ⚠️ Carried forward — not resolved here

- **One M15 gate stays open: probe Q2** (question-shaped tail detection), which gates the silent-always fire policy. `injectCommand` has **no retry and no pre-send cancel window** by design, so a wrong silent fire on an unwatched workspace is unrecoverable except via CC's **Esc**. Per `roadmap.md`'s own instruction: if Q2 fails, revisit the fire policy **before** building WP3.
- **`roadmap.md` and `arch.md` still carry four claims this pass refuted or superseded** — the model→window derivation, the "same scan" premise, the stale guard-arm count, and "above 50% context usage". ⚠️ **They are corrected at WP5 (tasks 5.6/5.7), not now** — a WBS pass records findings; the durable-doc resync is the milestone's exit step. The tracking table is in `wbs.md` → "Corrections this WBS pass makes to upstream docs". ⚠️ **A stale `arch/` doc OUTRANKS a correct record**, so leaving these uncorrected at close is the M13.5 lesson repeating.
- **`CLAUDE.md` is 45,157 chars, over the 40k harness threshold** (42,412 at session start). Syncing a whole new milestone cost **+2.7k net** after extracting 5.8k to lessons. ⚠️ **`/util-prune-claude-md` was deliberately NOT run — the operator has declined a prune** (recorded in the 2026-09-06 handoff).
- **`.gitignore` needed no change** — all nine canonical artifact-tracking-policy lines already present, no blanket `.claude/` ignore. No override section applies (Claudesk is not the learning-assets source repo).
- **The project-memory symlink was already correct** — `~/.claude/projects/-Users-stayman-Personal-projects-claudesk/memory` → `<proj-dir>/.claude/memory` (realpath-resolved slug). Idempotent no-op; `ensure-memory-link.sh` not needed.
- **No vision success metric covers M15.** Group C closed at M13 with all six met, so M15 is roadmap-and-evidence-driven. Whether a 7th metric is owed is an open operator call (`wbs.md` → Open items).
- **Unrelated but still outstanding:** `main` is `[ahead 2, behind 1]` of `origin/main` (needs `git push --force-with-lease`), and the post-release `brew upgrade` has not run.
