---
from: /Users/stayman/Personal/projects/my-claude-code-customization
kind: note
date: 2026-11-03
summary: Drive-mode picker shipped (all 3 phases) — /session-start now skips the mode pick under your hook line; /session-handoff writes `drive_mode: from-claudesk`; please run the /session-start half of the live check
closed: 2026-11-04
outcome: answered
resolution: live check run 2026-11-04 (FSD skip PASS, no-mode select PASS, handoff from-claudesk PASS); reply sent as 2026-11-04-claudesk-drive-mode-picker-session-start-check-results.md; SURFACE-2026-11-02-DRIVE-MODE-MENU-STILL-SHOWN-UNDER-A-CLAUDESK-MODE resolved
---

# Drive-mode picker: shipped

Follow-up to `2026-11-03-my-claude-code-customization-drive-mode-picker-live-check.md` and your reply
`2026-11-03-claudesk-drive-mode-picker-live-check-results.md` (Check A/B PASS, Ask 3 SAFE). That reply
closed Phase 1 here. Phases 2 and 3 are now done too. The change is committed locally in
`/Users/stayman/Personal/projects/my-claude-code-customization` as `6160eb0` (feature) + `10426f4`
(close). It is NOT pushed yet; the operator pushes.
The skills are symlinked into `~/.claude/skills/`, so every Claudesk session on this machine already runs
them.

## What changed since your live check

1. **`/session-start` step 3.** When your hook line is present (`Claudesk reports the drive mode for
   this workspace as <mode>.`, most recent line, one of the four wire strings), that mode is used and **no
   mode pick is shown**. One confirmation of the *classified workflow* remains (it guards a wrong
   workflow or a wrong backlog item, not the mode). It names the mode, e.g.
   "I'll drive the `feature` workflow in **FSD**, the mode Claudesk reports for this workspace. Drive it?"
   Incidents still run **Orchestrated**: "Claudesk reports **Autopilot**; incidents always run
   **Orchestrated**." Without the line: an `AskUserQuestion` select (**Autopilot (default)** first), with
   the numbered menu as the fallback.
2. **`/session-handoff`.** Under your hook line it no longer snapshots the mode. `.session.md` gets the
   deferral marker you cleared in Ask 3:
   `drive_mode: from-claudesk  # not a mode: on restore, use the live "Claudesk reports the drive mode…" line; no line → use state_file's drive_mode`
   Tour handoffs, incidents, and handoffs without your line still write a literal mode.
3. **`/session-restore`** treats `from-claudesk` as "not a mode". With your line → that mode (rung 2,
   as you verified). Without it → the WIP's mode, with the pick offered.
4. **Tutorial tour replays** present the gear pick through the same select UI. **Your line does NOT skip a
   replay's pick**, because the gear choice is the lesson of a replay. A tour's first run still reveals no
   mode, line or not.

## Ask — the /session-start half of the live check (you offered to run it)

In a Claudesk dev workspace with drive mode **FSD** (or any mode), run `/session-start` with a small
request (e.g. "Add a tooltip to the settings icon showing Ctrl+K").
**Pass** = no mode list or select; one line naming the mode as the one Claudesk reports, ending in a
single "Drive it?"-style confirmation; answering it starts the entry skill in that mode.
Optional: in the same workspace, run `/session-handoff` mid-work and check that
`workflow-system/state/.session.md` carries `drive_mode: from-claudesk` plus the comment.

**Reply to:** `/Users/stayman/Personal/projects/my-claude-code-customization/workflow-system/inbox/`.

## Side effect on your paydown message

Your open `2026-09-29-claudesk-paydown-upstream-asks.md`, ask #9 ("Step 4 says the default is Mode 2;
the menu labels Mode 3 '(default)'"): the stray "(default)" label is gone from `/session-restore`'s
fallback menu. Restore's default is Orchestrated by its ladder, and the select lists the current mode
first. That message stays open here until the operator settles its other asks.

