---
stage: context
state: complete
updated: 2026-08-14
---

# Context

Project CLAUDE.md generated at `CLAUDE.md` (project root).

**Active milestone:** Milestone 13 — Skill orchestration (decomposed 2026-08-14 into 4 WPs at `workflow-system/product/wbs.md`). Closes Group C by carrying the last two of six vision success metrics (#2 Recycle is one click; #3 no slash-command typing for common skills). Everything sits behind M10.9's `workflow_features_enabled` gate.

**First feature:** **WP1 — Probe** (registry scope, scan robustness, and the Recycle completion protocol). It gates WP2, WP3, and WP4, so nothing else may start first.

## What this pass changed

- **`CLAUDE.md` → `## Current Milestone`** rewritten from "NEXT, not yet decomposed" to the as-decomposed 4-WP reality, carrying the three WBS findings that reshaped the roadmap's two deliverable lines (61 entries / 11 broken symlinks; "render each skill as a button" doesn't survive 61; Recycle's completion protocol is the hard part hidden in four words). The pre-existing "four things M13 must not re-derive" list was **kept as-is** — still accurate, not duplicated.
- **`CLAUDE.md` → new `## Next Milestone`** for M15 (workflow supervisor) + the mccc ownership boundary, both new this session.
- **`CLAUDE.md` → `## Previous Milestone`**: the 15-row milestone→as-built table was **removed** — it was a third copy of what `roadmap.md` and `arch.md`'s index each already carry, drifting against two authorities. Replaced with a pointer. The execution-order line was corrected to include M15 and to record that the M14-vs-M15 order is deliberately undecided.

## ⚠️ Carried forward — not resolved here

- **`CLAUDE.md` is 44,603 chars, over the 40k harness threshold** (was 41,040 at session start; operator-accepted over-threshold on 2026-08-12). This pass added a milestone and an ownership boundary and recovered only 757 chars from the one genuinely duplicated block, so it grew by ~3.5k. ⚠️ **`/util-prune-claude-md` is the honest fix and was deliberately NOT run** — it is a session of its own, and trimming warnings to hit a byte count is how load-bearing detail gets lost.
- **`.gitignore` needed no change** — all nine canonical artifact-tracking-policy lines were already present, with no blanket `.claude/` ignore. No override section applies (Claudesk is not the learning-assets source repo).
- **The project-memory symlink was already correct** — `~/.claude/projects/-Users-stayman-Personal-projects-claudesk/memory` → `<proj-dir>/.claude/memory` (realpath-resolved slug). Idempotent no-op; `ensure-memory-link.sh` not needed.
