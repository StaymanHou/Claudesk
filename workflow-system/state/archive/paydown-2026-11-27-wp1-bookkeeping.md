---
workflow: task
state: close (complete)
completed: 2026-11-27
created: 2026-11-27
drive_mode: autopilot
docs-only: true
---

# Task: paydown-2026-11-27 WP1 — bookkeeping (delete, bury, send upstream)

**Workflow:** task
**State:** Completed (2026-11-27)
**Created:** 2026-11-27

## Problem Statement
Execute the sweep's pure-subtraction dispositions (2 Deletes, 3 Buries) and send the two
never-sent upstream items to mccc, so the active backlog holds only work we intend to do.

## Context
- `workflow-system/product/backlog-paydown-wbs.md` §WP1, §Rulings R1, §Defaults D2/D3
- `workflow-system/state/backlog.md`, `backlog-quality-findings.md`, `backlog-archived.md`
  (bury heading suffix precedent: `` `← Buried 2026-11-08 (backlog-paydown-2026-11-08 WP1)` ``
  + a `- **Buried because:**` first line)
- mccc inbox: `_ref/claude-customization/workflow-system/inbox/`; Claudesk mirror:
  `workflow-system/outbox/HANDOFF-to-mccc-<date>-<slug>.md` (precedent: `HANDOFF-to-mccc-2026-11-06-codify-nearby-tests.md`)
- Public repo: identifier grep over the staged blobs before the push.

## Work Tree

- [x] T1 Delete BL `11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT` (R1) and BL `11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES` (D2), CHANGELOG line first
- [x] T2 Bury BL `11-17-REMOTE-EXEC-COUNT-NEEDS-A-BEHAVIOURAL-HARNESS`, BL `11-17-REMOTE-SETTLE-COULD-BE-READINESS-ONLY`, QF `11-16-QUALITY-M17WP3-BLOCKING-GUARD-NAME-HEURISTIC-SHAPES-PRODUCTION` → `backlog-archived.md` (keep the m17-wp3 pointer stub)
- [x] T3 Write one mccc inbox message carrying F10B + INSTALL-SH (self-contained), mirror to `workflow-system/outbox/`, payload check; update both BL entries' Status to "sent"
- [x] T4 `backlogHeadings.test.ts` stays green (heading integrity after the moves)

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

Verification skipped: docs-only declared at plan time. No runtime surface to verify. (The heading guard `backlogHeadings.test.ts` was run at T4 anyway: 13/13.)

## Discoveries
Act notes: the deletes/buries were done by a script; a first run split the blocks in the wrong order and was caught before anything reached `backlog-archived.md`, restored from a `cp` backup, and re-run. mccc message re-checked against mccc `f8e8873` (both bugs still present); the mccc repo shows only the new inbox file untracked. `backlogHeadings.test.ts` 13/13.

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** both upstream items were still live at mccc `f8e8873`; the `install.sh` `.new` path (~line 166) has the same `mv` pattern, so the message names it too.
- **Assumptions that held:** the moves were pure subtraction; the heading guard stayed green.
- **Assumptions that were wrong:** a dict-ordered slice in the bury script picked the wrong blocks; it failed loudly (KeyError) before the archive was written, and the `cp` backup restored the three files.
- **Approach delta:** none beyond the script re-run; the deletes' CHANGELOG lines landed at close in the same commit as the deletes.

**Closure notice:** Requester = operator — closure notice for self-record. Paydown WP1 is complete: the backlog dropped 4 SURFACEs and 1 finding, and mccc's inbox holds `2026-11-27-claudesk-f10b-classifier-and-install-sh-backup.md`.
