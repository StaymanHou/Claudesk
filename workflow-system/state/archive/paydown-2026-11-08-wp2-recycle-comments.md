---
workflow: task
state: close (complete)
completed: 2026-11-09
created: 2026-11-09
drive_mode: autopilot
docs-only: false  # comments only, but in .ts/.tsx — verify with the parser-token diff + verify:auto
---

# Task: Paydown 2026-11-08 WP2 — WP9 recycle comments

**Workflow:** task
**State:** Completed 2026-11-09
**Created:** 2026-11-09

## Problem Statement
The WP9 before/after recycle history is restated in four code/test comments besides arch §E, the recycle-branch test comments cite stale condition numbers, and a docstring carries a date — cut all of it to the invariant + a §E pointer, without changing any executable token.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` → "WP2", Default D3.
- Findings: `backlog-quality-findings.md` → `# recycle-at-clean-boundaries — 2026-11-08` (4 bodies); pointer stub in `backlog.md` → `## Code-quality findings — recycle-at-clean-boundaries (2026-11-08)`.
- History home (already complete, no edit needed): `workflow-system/product/arch/workflow-supervisor.md` §E → "The boundary is the fired EDGE".
- Sites:
  - `src/state/supervisor/verdict.ts` — `RECYCLE_BOUNDARY_EDGES` doc (date + "Before WP9…" paragraph).
  - `src/state/supervisor/wipPhases.ts` — `atNonFinalPhaseBoundary` doc ("A SECOND GUARD… (M16.5 WP9)… Before WP9…").
  - `src/state/supervisor/__tests__/verdict.test.ts` — mid-phase `it.each` body comment (history + field count); condition comments "Condition 1/2/3 falsified", "the OTHER two conditions".
  - `src/state/supervisor/__tests__/activityFunnel.test.tsx` — MID-PHASE test comment ("pre-WP9 field recycle").
- Method: memory `prove-comments-only-diff-via-parser-tokens` (filter JSDoc kinds; positive control).

## Scope defaults (taken without asking)
- **Comments only.** Test TITLES that carry "M16.5 WP9:" are string literals, not comments; leaving them keeps the change provably comments-only. Not in any WP2 finding.
- **The optional `once` rule** for the field-recycle sentence in `singleAuthority.test.ts` is NOT added here; WP3 is the `singleAuthority` WP.
- Other provenance in the same docs (`paydown WP8, D1` in `recycleTokens`, the `M15 WP4 Phase 3` banner) is outside these four findings; left alone.

## Work Tree

- [x] T1 `verdict.ts`: drop the date; cut the "Before WP9" paragraph to a §E pointer
- [x] T2 `wipPhases.ts`: cut the second-guard paragraph to the invariant (WIP state is true at every Phase 2+ step; the edge decides) + §E pointer, no WP label
- [x] T3 `verdict.test.ts`: cut the `it.each` history to the invariant + §E pointer; NAME each falsified condition (threshold / feature workflow / WIP boundary) instead of numbering
- [x] T4 `activityFunnel.test.tsx`: drop the pre-WP9 field-recycle sentence
- [x] T5 Prove comments-only (parser-token diff HEAD vs working, JSDoc kinds filtered, with a positive control) + `pnpm verify:auto`
- [x] T6 Backlog: CHANGELOG `**Backlog resolved:**` × 4 (string-typed as won't-do per D3), then delete the 4 QF bodies + the `# recycle-at-clean-boundaries` group header + the BL pointer stub; mark WP2 done in the WBS

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none — archived
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** The four edited files have byte-identical TypeScript code-token streams to HEAD while the narrated history phrases are gone from them.
**Verification command:** `node scratchpad/tokdiff.cjs <HEAD copy> <file> <file>` for each file + `grep -cE "Before WP9|pre-WP9|2026-11-07|F8 or F10|Condition [0-9] falsified|OTHER two conditions" <4 files>`
**Expected result:** 4 × `IDENTICAL`; 0 phrase hits in every file (the HEAD copy shows hits, as a positive control).

## Verification Result

**Status:** PASS
**Date:** 2026-11-09
**Evidence:** `verdict.ts 1238 1238 IDENTICAL` · `wipPhases.ts 346 346 IDENTICAL` · `verdict.test.ts 4615 4615 IDENTICAL` · `activityFunnel.test.tsx 4708 4708 IDENTICAL`; phrase counts 0/0/0/0; HEAD `verdict.ts` count 2. During act, `pnpm verify:auto` EXIT 0, and the token-diff positive control (`"F15"`→`"F16"`) gave DIFFER(1).
**Notes:** Comments-only is proven; the narrated history now lives only in arch §E.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Outcome
- T1–T4 edited as planned. Two further comment-only labels in `verdict.test.ts` went too: "(M16.5 WP9)" in the banner and "the mid-phase edges WP9 exists for".
- T5: the parser-token diff (`scratchpad/tokdiff.cjs`, JSDoc kinds filtered) shows all 4 files IDENTICAL against HEAD (1238/346/4615/4708 tokens). Positive control: `"F15"`→`"F16"` gives DIFFER(1) at the StringLiteral. `pnpm verify:auto` EXIT 0 (292 files / 3800 vitest tests, cargo all green), 135s, recorded in `runtimes.md` (timeout 207000 → 263000).
- T6: CHANGELOG `**Task closed:**` + 4 × `**Backlog resolved:**` are written under `## 2026-11-09`; the 4 QF bodies, their `#` group header and the BL pointer stub are deleted. task-close must NOT re-append.

## Retrospect
- **What changed in our understanding:** arch §E already held the full history and measurement, so the fix was pure deletion plus pointers, with no doc to write.
- **Assumptions that held:** the parser-token diff with a positive control proved comments-only cleanly (4/4 IDENTICAL).
- **Assumptions that were wrong:** none. The one surprise was the `verify:auto` wall time: 135s against a 49s recent history, because the cargo cache was cold after the release build. It is recorded in `runtimes.md`.
- **Approach delta:** two extra WP9 labels in `verdict.test.ts` comments were cut alongside the planned sites. Test titles were kept as string literals by design.
