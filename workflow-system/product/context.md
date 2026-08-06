---
stage: context
state: complete
updated: 2026-08-06
---

# Context

Project CLAUDE.md generated at `CLAUDE.md` (project root).

**Active milestone:** Milestone 12 — Smart auto-resume + drive mode (WP1–WP3 shipped; WP4 re-decomposed 2026-08-06 → **8 WPs**)
**Next feature:** WP4a — Probe: the signal channel's shape + the picker cell's UI/UX (mockups)

## This pass (2026-08-06) — mid-milestone resync after the WP4 re-decomposition

An **update** pass following the `/product-wbs` back-loop (`6b01bab`). Four stale spans corrected —
notably **two outside** the milestone section that stated the *rejected* mechanism as standing project
convention, which is the kind of staleness that silently misleads a future build:

- **`## Current Milestone`** — WP3 marked shipped; the WP order rewritten to the now-**serial** critical
  path `WP1→WP2→WP3→WP4a→WP4b→WP4c→WP4d→WP5` (the "independent parallel track" claim is gone). Added the
  re-decomposition block: signal-not-store, the proven `UserPromptSubmit` mechanism with both arms, the
  zero-companion-repo-change constraint, the ASSUMED long-context caveat, the bidirectional-hook
  architectural note, and the measured pain that justifies the milestone.
- **⚠️ Two decision-table rows were ALSO stale beyond WP4** and had never been propagated from `wbs.md`:
  the table still said arm 1 fires **`/resume`** (it ships `--continue`; a bare `/resume` opens an
  interactive picker), and the prose still described a **sibling `⏵`** door (it shipped **`⊘`
  nested-and-defended**, with `isSiblingOfOpenButton` explicitly *not* protecting it). Both fixed.
- **Line 17 (Project Overview)** — the drive-mode bullet described the header placement *and* the
  rejected frontmatter mirror. Rewritten to picker-row + the hook signal.
- **⚠️ Line 180 (Development Conventions) — REVERSED, not edited.** The rule read *"Drive mode lives in
  the WIP file's frontmatter … the selector writes to it."* That is now the **opposite** of the
  decision. Replaced with the standing rule that **Claudesk never writes workflow files**, plus the
  reason the obvious mechanism fails (the target files are deleted at `/session-restore` step 7 and
  archived at finalize — absent exactly when a new WP starts).

Steps **2b** (`.gitignore`) and **2c** (memory symlink) re-verified at this session's start: both still
no-ops, posture unchanged from the 2026-08-03 findings recorded below.

## Prior pass (2026-08-03)

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
