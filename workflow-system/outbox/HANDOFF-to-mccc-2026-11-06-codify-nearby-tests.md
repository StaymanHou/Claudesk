---
from: /Users/stayman/Personal/projects/claudesk
kind: feature-request
date: 2026-11-06
summary: feature-verify-codify should run only "nearby" tests on non-final phases when the project's suite is long, and the full suite only at the last phase's codify
---

**Applied:** mccc `ffaea3d` (2026-11-07). mccc closed the inbox message 2026-11-06 (`accepted`). The Claudesk backlog entry was resolved 2026-11-16.

# Codify: nearby tests per phase, full suite once at the last phase

**Operator ask (2026-11-06, raised in the Claudesk workspace):** "for workspaces/projects where the
full test suite takes long, the codify step should just run the 'nearby' tests, the full suite then
just need to be run during the codify step of the last phase."

## What happens today

`skills/feature-verify-codify/SKILL.md` §3 "Run All Tests" says:

> Run the full test suite (not just new tests) to ensure no regressions

That runs at the end of **every** phase. `feature-verify-auto` is already scoped ("Do NOT run the
full test suite here"), so codify is the only per-phase full run. In projects with a slow suite this
costs minutes on every phase of every feature.

## What is asked

- **Long suite + a phase that is NOT the last:** codify runs only the **nearby** tests: the
  tests it just wrote or changed, plus the existing tests covering the files the phase touched.
- **The last phase** (the F16 `verify-codify → ship` path, "all phases complete"): codify runs the
  **full** suite, as today.
- **Short suite:** behave exactly as today (the full suite every phase).

## Open questions (yours to decide at spec)

1. **What counts as "long".** A natural signal already exists: the per-project `runtimes.md`
   registry (the `**Last:**` runtime of the tracked full-suite command). Options are a threshold on
   that, a per-project opt-in line in the project's `CLAUDE.md`, or both. An absent registry entry
   should probably mean "behave as today".
2. **How "nearby" is chosen per ecosystem.** For example `vitest related <files>`,
   `jest --findRelatedTests`, `pytest <paths>`, `cargo test <module>::`. Whether the skill names
   these or just states the rule and lets the agent choose.
3. **The cost of the trade.** A regression that an early phase causes in a distant test surfaces
   only at the last phase's codify. That back-loop then lands on a phase already ticked `[x]`.
   Decide how the §3b failure-triage table routes that case (back to `build` of the last phase, or
   reopening the earlier phase), and record it.
4. **Single-phase features** should be unchanged, since their only phase is the last one.

## What "done" looks like

- `feature-verify-codify` §3 states the scoped-vs-full rule and the "long" criterion.
- The last-phase full run is unconditional for a long-suite project.
- The late-regression routing from Q3 is written down in the skill.
- Optionally, `tests/check-structure.sh` pins that the full-suite instruction survives on the last-phase path.

Claudesk-side record: `workflow-system/state/backlog.md` →
`SURFACE-2026-11-06-CODIFY-RUNS-THE-FULL-SUITE-EVERY-PHASE` (status: sent). No Claudesk change
depends on this.
