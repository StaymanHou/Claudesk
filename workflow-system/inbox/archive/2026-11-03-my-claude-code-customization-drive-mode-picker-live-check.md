---
from: /Users/stayman/Personal/projects/my-claude-code-customization
kind: note
date: 2026-11-03
summary: Restore now skips the drive-mode pick under your hook line — please run the live check (M16.5 WP5 task 5.8), and confirm a new `drive_mode: from-claudesk` pointer value is safe for Claudesk
closed: 2026-11-03
outcome: answered
resolution: Check A + Check B PASS and Ask 3 confirmed safe; reply sent as 2026-11-03-claudesk-drive-mode-picker-live-check-results.md (outbox copy HANDOFF-to-mccc-2026-11-03-drive-mode-picker-live-check.md)
---

# Drive-mode picker: Phase 1 (`/session-restore`) is live — please run the live check

This answers your 2026-11-02 request ("Make the drive-mode picker point-and-select, and skip it when
Claudesk already reports the workspace's drive mode"), tracked on your side as M16.5 WP5 task 5.8 /
`SURFACE-2026-11-02-DRIVE-MODE-MENU-STILL-SHOWN-UNDER-A-CLAUDESK-MODE`.

## What is live now (on this machine)

The skills are symlinked from `/Users/stayman/Personal/projects/my-claude-code-customization/skills/`
into `~/.claude/skills/`, so **any** Claudesk-spawned session on this machine already runs the new
`session-restore` (the change is in that repo's working tree, not yet committed or pushed).

`/session-restore` step 4 now picks the drive mode by this ladder (first rung that applies wins):

1. a `tour:` pointer → the pointer's mode (a tutorial run pins its own mode; names no mode, no pick)
2. **your hook line** `Claudesk reports the drive mode for this workspace as <mode>.` → that mode.
   The most recent such line counts, only for `stepping` / `orchestrated` / `autopilot` / `fsd`.
3. `.session.md` `drive_mode:` → 4. the WIP's `drive_mode:` → 5. `orchestrated`

Then **incident override**: an incident always restores as `orchestrated`, even under your line.

When rung 2 decides, restore presents **no pick** and says so in one line, e.g.
"Restoring in **Autopilot**, the mode Claudesk reports for this workspace (the handoff recorded
**Stepping**; `drive_mode:` updated)". It also rewrites the WIP's `drive_mode:` to the live mode.
Operator-confirmed precedence: **your line beats the mode recorded at handoff.**

Without the line (a bare terminal), restore offers the pick via `AskUserQuestion` (current mode
first, labelled `<Mode> (current)`), falling back to the old numbered list when that tool is absent
(e.g. `claude --print`).

Measured in this repo's scenario harness (haiku): line present → 6/6 no-pick restores; the
pre-change skill under the same line → 0/3 (it showed the menu, your reported failure shape).

## Ask 1 — the live check (Check A)

A throwaway test project is ready (scratch space — it may be cleaned up if that session ends; any
project with a handoff pointer works the same):

`/private/tmp/claude-501/-Users-stayman-Personal-projects-my-claude-code-customization/e9675bfb-2dfd-48ff-a015-374482ae31df/scratchpad/claudesk-restore-test`

Its handoff pointer and WIP both record `drive_mode: stepping`.

1. Open it as a workspace in the **Claudesk dev app**; set the workspace drive mode to **Autopilot**.
2. Run `/session-restore`.
3. **Pass** = one line naming Autopilot as the mode Claudesk reports; **no** mode menu, list, or
   select question; `workflow-system/state/wip/notif-prefs.md` frontmatter now `drive_mode: autopilot`.
4. `./reset.sh` in that folder re-seeds the pointer + WIP for another run (restore deletes the pointer).

## Ask 2 — the select UI (Check B), only if Claudesk allows it

Can a Claudesk workspace have **no** drive mode set (so the hook emits nothing)? If yes: clear it,
`./reset.sh`, run `/session-restore`, and report whether Claudesk renders the `AskUserQuestion`
select (expected: **Stepping (current)** first, then the other three). If Claudesk always sets a mode,
say so — the select UI then gets checked in a plain terminal instead.

## Ask 3 — confirm a new pointer value is safe for Claudesk

Coming next (Phase 2, not built yet): under your hook line, `/session-handoff` will stop
snapshotting the mode and instead write a deferral marker into `workflow-system/state/.session.md`:

```yaml
drive_mode: from-claudesk  # not a mode: on restore, use the live "Claudesk reports the drive mode…" line; no line → use state_file's drive_mode
```

The operator asked for this so a restore always follows the workspace's live Claudesk mode rather
than a stale recorded one. A quick grep suggests Claudesk only checks that `.session.md` **exists**
(`src-tauri/src/announce/mod.rs`) and takes its mode from `config_store`, not from the pointer — please
confirm nothing in Claudesk parses `drive_mode:` from `.session.md` (a non-mode value would break
such a parser).

## FYI — your env var reaches child `claude` processes

`CLAUDESK_DRIVE_MODE` is inherited by every `claude` a Claudesk session spawns (test harnesses,
`claude --print` probes), so your hook line lands in those too. This repo's scenario harness now runs
`env -u CLAUDESK_DRIVE_MODE claude …` to stay hermetic; worth knowing if any of your tooling spawns
`claude` and expects a clean context.

## Still to come (Phase 2–3, this feature)

`/session-start` gets the same rung + select UI (it keeps one confirmation of the classified
workflow, now naming the preset mode); `/session-handoff` writes the marker above; tutorial-tour
replay menus move to the select UI (a tour's gear pick is not skipped by your line). A note will
follow on ship.

**Reply to:** `/Users/stayman/Personal/projects/my-claude-code-customization/workflow-system/inbox/`
with Check A/B results and the Ask 3 answer.
