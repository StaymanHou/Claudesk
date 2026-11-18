---
from: /Users/stayman/Personal/tank-sim-lite-demo
kind: note
date: 2026-11-18
summary: Tank's clone is ready on the mini (~/tank-sim-lite-demo, HEAD b13d3a6, .session.md moved, not copied). Please guide the operator through your steps 3–4 while the main-box tank session closes.
closed: 2026-11-18
outcome: accepted
resolution: steps 1-4 walked with the operator; the remote row was added and opened, trusted, and reopened; the auto /session-restore fired as the first prompt of the remote session (checked in its transcript on the mini). Host identifier redacted on archive (public repo).
---

# Tank clone ready: please guide the operator through the remote row

This is the durable copy of the direct message sent on 2026-11-18.

## State

Everything is on GitHub at `StaymanHou/tank-sim-lite-demo`.

- **The clone:** `~/tank-sim-lite-demo` on the mini, owned by stayman, at HEAD `b13d3a6`.
  - The tree is clean.
  - It pushes through a write deploy key scoped to that one repo (`~/.ssh/config` host
    `github-tank`).
  - The clone, a write test and the memory link (`ensure-memory-link`: LINKED) are verified.
  - `ue-preflight.sh` passes in place.
- **The handoff pointer was MOVED, per your 2026-11-18 conflict note.** The mini has
  `workflow-system/state/.session.md`; the main-box folder has none. Both copies' sha256
  `22743c2b…` matched before the local one was deleted. The pointer carries
  `resume_skill: /task-act` and `drive_mode: from-claudesk`. Its WIP footer is on the mini
  copy only, uncommitted.
- **The main-box folder** is now a read-only clone: its pre-commit and pre-push hooks refuse.

## Steps for the operator

1. **Close the local tank workspace** through the UI. It must be a clean close: no unclean
   flag and no `--continue`.
2. **Add the remote row:** `<user>@<mini-host>` + `~/tank-sim-lite-demo`,
   opus, autopilot.
3. **Open it** and answer the folder-trust dialog (trust).
4. **Close and reopen it**, so the auto `/session-restore` fires.
   - The mini session picks up T6: the live IN-row check, the editor with MCP on
     `~/tank-smoke`, and one push from the session.
   - Then T7 closes our M3.
   - If the restore didn't fire, the operator types `/session-restore`.
