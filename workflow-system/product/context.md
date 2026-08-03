---
stage: context
state: complete
updated: 2026-08-03
---

# Context

Project CLAUDE.md generated at `CLAUDE.md` (project root).

**Active milestone:** Milestone 12 — Smart auto-resume + drive mode (decomposed 2026-08-03, 5 WPs)
**First feature:** WP1 — Probe: the unclean-flag store + the two announce signals

## This pass (2026-08-03)

An **update** pass, not a generation — the root `CLAUDE.md` is long-lived and hand-authored, so
only the milestone-tracking sections moved. All user-authored content preserved.

- **`## Current Milestone`** rewritten M11.5 → **M12** (it was two milestones stale). Carries the
  full re-designed decision model, the derisk-first WP order, and the four ⚠️ items WP1–WP5 must not
  re-derive (no new PTY primitive; don't rebuild the per-project storage path; the vision correction;
  the guard's fourth arm).
- **`## Previous Milestone (closed)`** rewritten M10.9 → **M11**, keeping the eight properties that
  bind future work — most load-bearing for M12: the guard bites at the *type declaration*, and the
  seam reference must live in **executable source** because the arm strips comments.
- Forward-look line replaced (the "M11.5 runs before M11" note is now history) and the release line
  bumped to **v0.3.0**. M11 added to the milestone-history list.

## Step 2b — `.gitignore` reconciliation: NO-OP (verified)

All seven canonical artifact-tracking lines are present and correct, no blanket `.claude/` ignore
exists, and `.claude/learnings/` is correctly ignored (this project is a *consumer* of the workflow
system, not the source repo — so no `## Artifact tracking overrides` section is warranted). Nothing
written.

## Step 2c — memory symlink: NO-OP, and it closed a false backlog item

`~/.claude/projects/-Users-stayman-Personal-projects-claudesk/memory` **is** a symlink to
`<proj-dir>/.claude/memory/` (created 2026-07-03), exactly as the GLOBAL convention requires.
Proven to be **one physical store**: both paths `pwd -P` to the same directory, `MEMORY.md` is the
**same inode** (65156983) through both, and both list 52 entries.

⚠️ This **disproves** `SURFACE-2026-08-02-PROJECT-MEMORY-SYMLINK-NOT-IN-PLACE-TWO-COPIES-DRIFT`,
which checked whether the *repo* dir was a symlink — the convention wants the **opposite** (repo dir
is the real git-tracked store; the *harness path* is the symlink). Item closed as NOT-A-DEFECT with
the evidence recorded inline, rather than left on the pile as a false gap. `ensure-memory-link.sh`
would have been a no-op, so it was not run.
