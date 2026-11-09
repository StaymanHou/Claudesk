---
workflow: task
state: close (complete)
completed: 2026-11-09
created: 2026-11-09
drive_mode: autopilot
docs-only: false
---

# Task: Paydown 2026-11-08 WP3 — `singleAuthority` guard repair + backlog heading guard

**Workflow:** task
**State:** Completed 2026-11-09
**Created:** 2026-11-09

## Problem Statement
`singleAuthority.test.ts`'s `absent` rules match raw, case-sensitive text and discard their own flags, so wrapped or capitalized labels evade them while the header claims normalized matching; and nothing guards `backlog.md` against duplicate or mangled headings. Close both, each change mutation-proven individually.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` → "WP3" + "⚠️ Read before any WP that touches a test or a guard" + D1.
- Guard: `src/__tests__/singleAuthority.test.ts` — `absent` branch of the rule loop builds `new RegExp(rule.pattern.source, "g")` over `readFileSync` raw text; `once` rules use `textOf(f)` (= `haystack`: comment leaders stripped, whitespace collapsed).
- Findings: `backlog-quality-findings.md` → `# paydown-2026-11-04-wp14-comment-convention-pass — 2026-11-07` (6 bodies); BL pointer stub `## Code-quality findings — paydown-2026-11-04-wp14-comment-convention-pass (2026-11-07)`; BL `## SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` (local half → rewrite Status).
- MINOR sites: transcript authority `src-tauri/src/transcript/mod.rs` (doc carries "2282 → 2284 → 2286"); `workflow-system/product/arch/workflow-gate.md` ("The guard's mechanics live in its own header" paragraph) vs `src/state/__tests__/offInvariantGuard.test.ts` (the recycle/session `WORKFLOW_TERMS` gap lives in an arm comment); `docs/lessons/source-text-guards.md` → "## Comment budget".
- Discipline (memories): `verify-the-mutation-landed`, `git-checkout-no-ops-on-untracked-file` (cp + shasum restores), `bsd-sed-lacks-word-boundary` (perl), `invalid-probe-and-real-hole-look-identical`.
- ⚠️ The operator's uncommitted `backlog.md` block `SURFACE-2026-11-06-CODIFY-RUNS-THE-FULL-SUITE-EVERY-PHASE` stays unstaged (blob method). The heading guard reads the WORKING file, so it must pass with that block present too.

## Risk noted at plan time
- **Adding `i` can turn deliberately-uppercase tokens into English matches** (`probe [AB]\b` → "probe a", `\(R\d\)`, `\bP\d+\.\d+\b` → "p1.2"). If case-folding produces a FALSE positive at HEAD, keep that sub-pattern case-exact (rewrite it as an explicit-case alternation, or split the rule) rather than dropping `i` for the whole table, and record each such case in the WIP. REAL violations found by the tightened matcher get fixed and listed (they are evidence of the hole).

## Work Tree

- [x] T1 `absent` branch: match against `textOf(f)`; build the RegExp from `rule.pattern.source` with `rule.pattern.flags` ∪ `g` ∪ `i`. Run; triage every new hit (real violation → fix + list; case-fold false positive → case-exact sub-pattern + list)
- [x] T2 Per-rule positive controls: give each `absent` rule an `examples: string[]` (≥1 label it must match, incl. one wrapped + one capitalized form where the rule's pattern allows), asserted in the meta block through the SAME matcher function the rule loop uses
- [x] T3 Header: correct "matching (comment leaders stripped, whitespace collapsed)" to cover both kinds; "every instance" → "most instances" + note the two paraphrase rules (chord map, do-not-merge) guard regrowth only
- [x] T4 `2282`/`2284` fingerprints → one phrase `2282 → 2284`
- [x] T5 Add the WP2 `once` rule for the field-recycle measurement (authority `arch/workflow-supervisor.md`, fingerprint from §E's F8/F10 token sentence)
- [x] T6 `arch/workflow-gate.md` pointer → the arm comment that holds the recycle/session gap (or move the gap into the guard header); `source-text-guards.md` comment-budget section gains one line naming `singleAuthority.test.ts`
- [x] T7 Backlog heading guard (new test): every `^## ` in `backlog.md` matches an allowed shape (`## SURFACE-<YYYY-MM-DD>-<SLUG>`, `## Code-quality findings — <slug> (<YYYY-MM-DD>)`, `## Buried`, `## Session Handoff — …`); no duplicate heading; same for `backlog-quality-findings.md`'s `## SURFACE-` headings. Inspect every existing heading first so the shapes are DERIVED, not guessed
- [x] T8 Mutation proofs, each INDIVIDUALLY, each landing confirmed: (a) wrapped label `paydown\n// WP7` in a Recycle module; (b) `(Paydown WP7,`; (c) a pattern given its own `i` flag with an uppercase-only example (proves flags are merged, not discarded) — or the inverse: a flag-sensitive pattern; (d) break one example's pattern → its control fails; (e) planted duplicate heading; (f) mangled `` ## ` `` heading; (g) for T5, a copy of the fingerprint in a code comment. Restore via cp + shasum
- [x] T9 `pnpm verify:auto` (timeout 263000)
- [x] T10 Backlog: CHANGELOG `**Backlog resolved:**` × 6, delete the 6 QF bodies + group header + BL stub; rewrite `08-26-DELETE-ON-RESOLVE-…` Status (local half done, open upstream); mark WP3 done in the WBS

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none — archived
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** On the final tree both guards pass clean, and each target failure mode planted into a real guarded file fails them: a label wrapped across two comment lines, a capitalized label, and a duplicated `backlog.md` heading.
**Verification command:** `vitest run src/__tests__/singleAuthority.test.ts src/__tests__/backlogHeadings.test.ts`, then `scratchpad/mut/run.sh` with each planted mutant (landing grep-confirmed, restored via cp and checked with shasum)
**Expected result:** clean `Tests 59 passed (59)`; each mutant gives exactly 1 failure, on the named rule.

## Verification Result

**Status:** PASS
**Date:** 2026-11-09
**Evidence:** clean `Tests  59 passed (59)`; `[v-wrapped] landed=1 | Tests 1 failed | 45 passed (46) × absent: the Recycle modules carry no WIP or review labels · restored OK`; `[v-capitalized] landed=1 | Tests 1 failed | 45 passed (46)` (same rule) `· restored OK`; `[v-dup-heading] landed=2 | Tests 1 failed | 12 passed (13) × no \`## \` heading in workflow-system/state/backlog.md occurs twice · restored OK`. In act, `pnpm verify:auto` EXIT 0.
**Notes:** Both holes are closed on the final (formatted, post-backlog-edit) tree.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Outcome
- **T1 — real violation found by the tightened matcher (evidence of the hole):** `src-tauri/src/adjudicator/mod.rs`, test `a_grandchild_holding_a_pipe_does_not_discard_a_successful_answer`, comment `// Probe B: the child succeeded…`. It is capitalized, so the old case-sensitive `probe [AB]\b` missed it. Label removed. **Case-fold false positives: none.**
- T1/T2 structure: one `absentHits(rule, rawSource)` normalizes, adds `g`+`i` and keeps the pattern's own flags. The rule loop and the example controls both call it. Each `absent` rule has `examples` (wrapped and case-varied forms). There is a separate `u`-flag control for own-flag retention.
- T3–T6 as planned. T5's fingerprints are `F10 at 508,028` and `F8 at 488,911` ("were mid-phase" was dropped as too generic).
- T7: `src/__tests__/backlogHeadings.test.ts`. The shapes are DERIVED from the 29 live headings (25 SURFACE, 4 Code-quality), and the file has permanent in-test controls (a planted duplicate, five mangled forms).
- **T8 mutants, each run individually (landing confirmed by grep, then restored via cp and confirmed by shasum):** a wrapped `paydown`/`WP7` → Recycle absent FAILS; b `(Paydown WP7,` → FAILS; HEAD's guard copy (`zz*`) PASSED a+b (hole proven, copy deleted); c own flags dropped → the u-flag control FAILS; h no `i` → example control FAILS; i no normalize → example control FAILS; d `paydown WQ` → example control FAILS; e duplicate heading in backlog.md → FAILS; e2 duplicate in QF → FAILS; f `` ## ` `` → shape FAILS; g field-recycle figure copied into verdict.ts → once FAILS; j `2282 → 2284` copied → once FAILS; k unrelated `122824` → PASSES (the bare-digit brittleness is gone).
- **Not guarded:** the rule loop bypassing `absentHits` entirely (the examples would still pass). Accepted: the loop and the examples share one function.
- T9: `pnpm verify:auto` first FAILED on `prettier --check` (my 2 new/edited test files; the XtermPane lint warning is pre-existing and non-failing). After `prettier --write`: EXIT 0, 293 files / 3817 vitest tests, 1114 cargo tests, 57s. Prettier left the mutated matcher lines unchanged.
- T10: CHANGELOG has a `**Task closed:**`, 6 × `**Backlog resolved:**` and 1 partial (08-26 local guard). The 6 QF bodies, their group header and the BL stub are deleted; the 08-26 Status is rewritten (upstream only). task-close must NOT re-append.

## Retrospect
- **What changed in our understanding:** the hole was not hypothetical. The tightened matcher found a real capitalized probe label (`Probe B:`) that had sat under the old guard. The case-fold risk flagged at plan time produced no false positives.
- **Assumptions that held:** routing the rule loop and the examples through ONE matcher let each new behavior (normalize, case-fold, own flags) be killed by a single mutant; deriving the heading shapes from the live file avoided a guess.
- **Assumptions that were wrong:** none on the guard. The gate tripped once, on `prettier --check` for the two edited test files: formatting was not run before the gate.
- **Approach delta:** mid-act the matcher was moved to take the RAW source and normalize it itself, so the example controls also prove the normalization. A `u`-flag control was added for own-flag retention, since no table rule has a flag of its own. One gap was accepted rather than closed: a loop that stopped calling `absentHits` would still pass the examples.
