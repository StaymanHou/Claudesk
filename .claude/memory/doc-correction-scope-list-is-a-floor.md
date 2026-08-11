---
name: doc-correction-scope-list-is-a-floor
description: "A doc-correction task's enumerated site list is a FLOOR, not a boundary — grep the retracted CLAIM, because the worst survivors sit in files the plan implied were audited."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 01d8ef64-6469-47dc-93e7-6034dffd37dc
  modified: 2026-08-11T20:07:32.671Z
---

When a work package says "correct doc X in N places," treat N as a **floor**. Grep for the
retracted **claim** across the whole doc set; do not work the enumerated list and stop.

**Measured, M12 WP4d (2026-08-11): 5 sites named, 10 actually wrong.** The five extras were the
worse half:

- `vision.md:40/45/49` held a **fully disproven design still standing as live specification** — the
  three-branch auto-resume table, plus both command names dead since M9 WP5. The task list named
  lines 28/51/79/87, which *implied that file was enumerated*. It was the least-suspected file that
  held the biggest error.
- `roadmap.md:4` carried a stale "5 vision.md places still say header" note — a **pointer to the
  very work being done**, which would have survived as a false open-item.
- `roadmap.md:286` described a field as "never read or written" two milestones after it went live.

**Why the enumerated list under-counts, structurally:** it was written when the fact was *discovered*,
so it records where someone happened to be looking — not where the claim propagated. This is the
same rule as *a correction written only where it was discovered is not a correction*, one level up:
that rule governs the **fix**, this one governs the **search**.

**How to apply:**
1. Name the retracted claim as a string, then `grep` it repo-wide (`workflow-system/`, `CLAUDE.md`,
   `docs/`) **before** editing anything. The plan's line numbers are a starting set.
2. **Separate string-matches from claim-assertions, and say so in the record.** Three
   `roadmap.md` hits for `step-by-step` were ordinary English (an invite's install instructions),
   not wire values. Matching the string is not asserting the fact — a mechanical sweep "finishing
   the job" there would *introduce* errors. Note the deliberate non-edits so the next sweep doesn't
   redo them.
3. **Verify the cited line actually says what the task claims.** WP4d's task pointed at
   `arch.md:262` for a "one-directional" sentence that did not exist; the claim was *implicit*
   (the script was described as reading stdin and writing a socket, never mentioning stdout).
   A task quoting a sentence that isn't there costs a pass.
4. Prefer **deleting a wrong figure and pointing at its source** over restating a corrected one —
   see [[verify-the-mutation-landed]] for the sibling discipline on guards. Copied numbers are how
   the picker-column width error propagated into four files.

Related: [[raw-guard-identifier-satisfied-by-own-comments]] (a doc/comment can satisfy the very
check meant to protect the code it names).
