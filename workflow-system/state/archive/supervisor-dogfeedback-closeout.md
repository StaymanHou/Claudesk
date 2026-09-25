---
workflow: task
state: close (complete)
completed: 2026-09-25
created: 2026-09-25
drive_mode: autopilot
docs-only: true
---

# Task: Close out supervisor dogfeedback as a wall-clock item and re-frame it on evidence

**Workflow:** task
**State:** Completed 2026-09-25
**Created:** 2026-09-25

## Problem Statement
The supervisor-dogfeedback wall-clock item has to close. The operator has no more feedback, but the
transcript evidence shows the supervisor has **not fired since v0.5.1** on AUTO-edge breaks it
should have caught. The three supervisor backlog items and the durable docs must therefore be
rewritten to that finding, not resolved on silence.

## Context
- The handoff caution (2026-09-24) said "no more feedback" is not "observed firing correctly".
  That caution proved load-bearing.
- **Evidence, gathered 2026-09-25 from CC transcripts** (`~/.claude/projects/*/*.jsonl`; the
  scratchpad scripts `fires.py` and `breaks2.py` are the method, restated in the backlog entry so
  it can be reproduced):
  - **Pre-hotfix fire CONFIRMED:** 2026-09-15 19:49–19:55Z, claudesk session `7a912f57`. Six
    `/feature-build` commands arrived at a 3.4–4.8s gap after turn end. The operator confirmed them
    in-session ("it's the supervisor doing these /feature-build thing"). This is the incident that
    produced the WP0 hotfix.
  - **Since v0.5.1 (2026-09-17 → 2026-09-25): ZERO machine-speed workflow commands** across all
    transcripts. The one fast `/session-handoff` (09-17 14:31, 4.6s) was operator-typed, and it
    replaced a `/feature-verify-auto` that was due.
  - **This is not "no breaks happened".** At least six textbook misses occurred, each on a
    supervised project (stored `autopilot`, `supervisor_enabled: true`, gate ON, default profile)
    and each Claudesk-hosted (the drive-mode `additionalContext` line is present in the
    transcript). Each turn ended on a bare `TRANSITION: F8` with no question, and the operator
    restarted the chain by hand after 31s–49min ("next", "keep going", "so?"). The google-newsroom
    product run of 09-23 also broke at P3/P5/P7/P9.
  - Installed build: `0.7.0` (upgraded 2026-09-25 08:30). The exact version running on 09-18/09-22
    is not recorded, but every release from v0.5.1 on contains the supervisor.
- Operator decision (2026-09-25): **rewrite the items, then investigate.** The operator also asked
  to **plan the implementation of the activity surface**
  (`SURFACE-2026-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE`) as the next work. It
  is the instrument the investigation needs, since the `withheld … — <reason>` lines go to an
  unreadable console.
- Files: `workflow-system/state/backlog.md` (three items), `CLAUDE.md` (M15 banner and Execution
  order), `workflow-system/product/roadmap.md` (the M15 close note, plus a new Revision entry),
  `workflow-system/product/arch/workflow-supervisor.md` (§H pointer).

## Work Tree

- [x] T1 Rewrite `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` into the
      live defect: silent since v0.5.1, with the evidence table, the reproducible method,
      hypotheses (unverified), and what closes it. Keep the ID stable.
- [x] T2 Rewrite `SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1`. Its WP0 checks and the item-1
      freeze are **vacuous while the supervisor never fires** (a no-fire check passes trivially),
      so they cannot be closed on silence. Point the residue at T1.
- [x] T3 Update `SURFACE-2026-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE`: the
      predicted failure happened, the sequencing question is settled (build it now, as the
      investigation's instrument), and the operator asked for it to be planned next.
- [x] T4 Durable docs: add a roadmap Revision 2026-09-25 (dogfeedback closed as a wall-clock item,
      what it found, the new order), a pointer on the M15 close note, CLAUDE.md's M15 banner and
      Execution order, and the arch §H pointer.
- [x] T5 Consistency sweep: grep for any remaining "dogfeedback … open / wall-clock / runs in
      parallel" claim that asserts it as live work.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none (next: task-verify → task-close)
- **Open discoveries:** none. The activity-surface sequencing and the silent-supervisor finding are recorded in the existing backlog items, so no new SURFACE was needed.

## Verification Observable

Verification skipped: docs-only declared at plan time. No runtime surface to verify.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** the dogfeedback did not end in "observed working". It
  ended in **observed NOT working**: the supervisor fired live on 2026-09-15 (v0.5.0) and has not
  fired since v0.5.1, while at least six plain F8 breaks on supervised projects went unfired. The
  task's premise, closing out on "no more feedback", was inverted by the evidence.
- **Assumptions that held:** the handoff's caution ("no more feedback" ≠ "observed firing
  correctly") was exactly right. Transcripts ARE a usable out-of-band observable for supervisor
  activity: fire timing (about 4s after turn end) is distinguishable from human typing, and
  `TRANSITION:` tokens followed by human text mark unfired breaks.
- **Assumptions that were wrong:** that a quiet dogfooding period means nothing to fire on. The
  operator absorbed every miss by typing "next" / "so?", and those replies are a signal only in
  aggregate, never as a complaint.
- **Approach delta:** planned as a close-out that deletes three items; delivered as an
  evidence-gathering pass that rewrote all three, re-typed one as a probable defect, and inserted
  the activity surface plus an investigation into the execution order (operator decision). No
  backlog item was deleted.

## Closure
> **Closure notice:** The supervisor-dogfeedback close-out is complete. Dogfeedback is closed as a
> wall-clock item, and its finding is recorded: the supervisor has been silent since v0.5.1 (six
> unfired F8 breaks, with the evidence and method in
> `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`). See `roadmap.md` →
> Revision 2026-09-25 for the new order: activity surface → investigation → minor items → media
> viewer. Requester = operator (closure notice for self-record).
