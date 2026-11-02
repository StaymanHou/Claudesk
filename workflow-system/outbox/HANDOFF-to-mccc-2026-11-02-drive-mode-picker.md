---
from: /Users/stayman/Personal/projects/claudesk
kind: feature-request
date: 2026-11-02
summary: Make the drive-mode picker point-and-select (AskUserQuestion), and skip it when Claudesk already reports the workspace's drive mode
---

# Drive-mode picker: point-and-select, and skip it under Claudesk

Two asks from the operator (2026-11-02), both about the drive-mode menu that `session-start`
(step 3) and `session-restore` (step 4b) present today as typed text ("Type 1–4" / "press Enter
to keep current").

## Ask 1: use CC's select UI instead of a typed menu

Present the mode pick with the `AskUserQuestion` tool (CC's point-and-select question UI), not as a
numbered text block the user has to type into.

- **Sites:** `skills/session-start/SKILL.md` step 3 and `skills/session-restore/SKILL.md` step 4b.
  A grep for `Which drive mode` / `press Enter to keep current` / `Type 1–4` also hits
  `tutorial-greenfield-workflow-tour` and `tutorial-brownfield-workflow-tour`. Whether the tours
  change is your call, since they reveal the modes at a scripted moment.
- **Fit:** `AskUserQuestion` takes 2–4 options, and there are exactly four modes. Put the current
  (restore) or default (start) mode **first**, labelled e.g. `Autopilot (current)`, so "keep" is
  one click. The tool always adds a free-text "Other", which covers `session-start`'s "no" reply
  (run the entry skill manually).
- Keep the wire strings unchanged: `stepping` / `orchestrated` / `autopilot` / `fsd`.

## Ask 2: skip the pick when Claudesk has already set the mode

When Claudesk spawns `claude`, it sets `CLAUDESK_DRIVE_MODE`, and its `UserPromptSubmit` hook
adds this line to the context on **every** user turn:

```
Claudesk reports the drive mode for this workspace as <mode>.
```

`<mode>` is always one of the four wire strings; the hook emits nothing for any other value and
nothing at all outside Claudesk. The operator sets this mode per project in Claudesk, and can change
it from the workspace header at any time.

**Requested behavior:** when that line is present, `session-start` and `session-restore` **use
that mode and present no picker**. Each says so in one line (e.g. "Using **Autopilot**, the
mode Claudesk reports for this workspace."). With no line (a bare terminal), behavior is unchanged
apart from Ask 1.

**Why a skill change is needed:** Claudesk's M12 design (2026-08) assumed the fact-only line was
enough for the model to skip the menu without any skill change. It was proven live then, on short,
cold contexts, but it no longer holds. On 2026-11-02 two restores in two Claudesk workspaces
(`claudesk` and `mbt-copilot`) both read the line, correctly showed Autopilot as "current", and
then presented the menu anyway. So the skills read the line for the *value* but not as permission
to *skip*. Only an explicit rule in the skill fixes that. Claudesk deliberately keeps its hook
sentence a fact, not an instruction ("a prohibition is correct at turn 1 and wrong at turn 60").
So the rule belongs in the skills, which own what a drive mode means.

**Points for you to decide:**
- **Precedence vs `.session.md`'s `drive_mode:`** on restore. Claudesk's lean: the Claudesk line
  wins, because it is the operator's live setting for the workspace, while the pointer records the
  mode at handoff time.
- **The `tour:` arm** of `session-restore` already skips the menu. Presumably it keeps its own
  pointer-mode rule, and a tour pointer outranks the Claudesk line.
- **The incident override** (incident always runs Mode 2) should still apply over the Claudesk mode.
- **`session-start`'s workflow classification confirmation:** whether it still needs a reply when
  the mode is preset. Claudesk only asks that the *mode* part be skipped.

## Done looks like

- In a Claudesk workspace, `/session-restore` and `/session-start` show no drive-mode menu, use
  the reported mode, and name it in one line.
- In a bare terminal (no line), both pick the mode through `AskUserQuestion`, with the current or
  default mode first.
- Whatever structure pins (`tests/check-structure.sh`) you keep on these steps are updated.

Claudesk tracks its side as M16.5 WP5 task 5.8
(`SURFACE-2026-11-02-DRIVE-MODE-MENU-STILL-SHOWN-UNDER-A-CLAUDESK-MODE`). It will run the live
check from a Claudesk workspace once this lands. A reply to the `from:` workspace's inbox when it
ships is welcome but not required.
