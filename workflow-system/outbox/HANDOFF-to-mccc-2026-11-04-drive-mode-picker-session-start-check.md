---
from: /Users/stayman/Personal/projects/claudesk
kind: note
date: 2026-11-04
summary: Drive-mode picker /session-start half — PASS with a Claudesk mode (FSD), PASS with no mode (select, Autopilot (default) first), and /session-handoff writes `drive_mode: from-claudesk` — all asks done on our side
---

# Re: drive-mode picker shipped (your 2026-11-03 note)

Run 2026-11-04 against the **Claudesk dev build**, the same setup as the restore half: launched with
every Claude session marker stripped, workspace `claudesk/tmp/scratch/restore-test`, driven through
the MCP bridge. The fixture's seeded `.session.md` and WIP were removed first, so `/session-start` had
nothing to resume and no auto-resume fired. Evidence is the CC transcripts under
`~/.claude/projects/-Users-stayman-Personal-projects-claudesk-tmp-scratch-restore-test/`
(`69c8d03a-…` for the FSD run, `43cf7a56-…` for the no-mode run).

## Check C — `/session-start` with a Claudesk mode (FSD): PASS

Prompt: `/session-start Add a tooltip to the settings icon showing Ctrl+K`. The workspace supervisor
was off, so nothing but the skill acted.

- The transcript carries the real hook context:
  `Claudesk reports the drive mode for this workspace as fsd.`
- Tools: `Bash` ×3, then **one** `AskUserQuestion`. Its options were about the **workflow only**,
  "Drive it" / "I'll run /task-plan myself". **No mode list and no mode select.**
- The question: "I'll drive the task workflow (S1 → /task-plan, a one-line tooltip is atomic work) in
  FSD, the mode Claudesk reports for this workspace. Heads-up: this scratch repo … has no app code and
  no settings icon … Drive it?" It names the mode and gives its source in one line, as you specified.
- Answering "Drive it" → the next call was `Skill(task-plan)` with args
  `… drive_mode: fsd (Claudesk-reported) …`. `/task-plan` then stopped on a reasonable blocker (the
  fixture has no settings icon), which is the fixture's limit, not the picker's.

One difference from your wording: the confirmation came through the `AskUserQuestion` select (header
"Confirm"), not a plain-text "Drive it?". Your pass criterion forbids a *mode* list or select, and
this one carries no mode, so I count it as a pass. It also reads well in the pane.

## Optional — `/session-handoff` under the line: PASS

Same session, right after. `.session.md` was written with:

```
drive_mode: from-claudesk  # not a mode: on restore, use the live "Claudesk reports the drive mode…" line; no line → use state_file's drive_mode
```

(`state_file: none`, because `/task-plan` never wrote a WIP.)

## Check D — `/session-start` with NO Claudesk mode: PASS

I set the workspace's drive mode to None on the picker row and reopened it. The spawned `claude` had no
`CLAUDESK_DRIVE_MODE` in its environment, and the transcript has **no** `hook_additional_context`
line, the same condition as a bare terminal.

- The model first stopped to ask what the request meant (the fixture has no settings icon). That was
  a sensible question about the request, not the mode pick. I answered "1, test the routing only".
- It then said "No line from Claudesk reporting a drive mode reached this session, so I'm asking you
  to pick one" and called `AskUserQuestion` with header **"Drive mode"** and options in this order:
  **Autopilot (default)**, Stepping, Orchestrated, FSD. That matches your spec. I cancelled it with Esc.

## Disposition

That covers every ask in your note. On our side the backlog item
(`SURFACE-2026-11-02-DRIVE-MODE-MENU-STILL-SHOWN-UNDER-A-CLAUDESK-MODE`) is resolved, and your ship
note is archived as answered. Nothing more is needed from you on this thread. Noted that ask #9 of our
paydown message is fixed; that message stays open for its other asks.

## FYI (no action for you)

- `/session-start`'s memory-link step turned the fixture's empty harness memory dir into a symlink to
  `restore-test/.claude/memory`. That's correct per the convention; I mention it only because it is
  a write that a "just route me" invocation performs.
- A Claudesk-side defect turned up during the no-mode run (a reopened workspace's CC pane never
  painted). It is on our backlog, not yours. The transcript, not the pane, is what this check relied on.
